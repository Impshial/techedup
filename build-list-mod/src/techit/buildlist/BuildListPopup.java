package techit.buildlist;

import java.text.NumberFormat;
import java.io.IOException;
import java.io.File;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.*;
import org.lwjgl.input.Keyboard;
import org.lwjgl.input.Mouse;

/** Shared checklist rendering for the passive HUD and its optional cursor screen. */
public final class BuildListPopup extends GuiScreen {
    interface Controller {
        void resumeGame();
        void hide();
        void closed();
    }
    private final BuildListSession session;
    private final Controller controller;
    private final BuildListIcons icons=new BuildListIcons();
    private ChecklistLayout layout;
    private GuiButton listButton;
    private GuiButton restoreButton;
    private List<File> files=Collections.emptyList();
    private int offset;
    private int listOffset;
    private int refreshTicks;
    private BuildListStore.Build displayedBuild;
    private boolean minimized,rebuildControls,showPlans,dropdownOpen;
    private String message="";
    private String hudKey;
    private static final NumberFormat NUM=NumberFormat.getIntegerInstance(Locale.US);

    BuildListPopup(BuildListSession session){this(session,null);}
    BuildListPopup(BuildListSession session,Controller controller){this.session=session;this.controller=controller;session.chooseOnlyList();displayedBuild=session.build;message=session.store==null?BuildListMod.error:session.message;}
    void drawHud(Minecraft mc,ScaledResolution resolution,float partial,String key) {
        int width=resolution.func_78326_a(),height=resolution.func_78328_b();
        if(layout==null||width!=field_73880_f||height!=field_73881_g)func_73872_a(mc,width,height);
        hudKey=key;
        try {func_73863_a(-1,-1,partial);}finally{hudKey=null;}
    }
    @Override public void func_73874_b(){dropdownOpen=false;if(controller!=null)controller.closed();}
    @Override public boolean func_73868_f(){return false;}
    @Override public void func_73876_c(){if(++refreshTicks>=20){refreshTicks=0;refreshLists();}}
    void refreshLists() {
        files=session.refreshFiles();
        if(displayedBuild!=session.build) {
            displayedBuild=session.build;icons.clear();offset=0;message=session.message;
        }
        if(layout!=null)clampListOffset();
    }
    @Override public void func_73866_w_() {
        layout=new ChecklistLayout(field_73880_f,field_73881_g);field_73887_h.clear();
        if(minimized) {
            restoreButton=new GuiButton(3,layout.badgeLeft,layout.badgeTop,layout.badgeWidth-22,ChecklistLayout.BUTTON_HEIGHT,"Build list ^");
            field_73887_h.add(restoreButton);
            field_73887_h.add(new GuiButton(2,layout.badgeLeft+layout.badgeWidth-20,layout.badgeTop,20,ChecklistLayout.BUTTON_HEIGHT,"x"));
        } else {
            field_73887_h.add(new GuiButton(1,layout.left+layout.width-48,layout.top+3,20,ChecklistLayout.BUTTON_HEIGHT,"_"));
            field_73887_h.add(new GuiButton(2,layout.left+layout.width-25,layout.top+3,20,ChecklistLayout.BUTTON_HEIGHT,"x"));
            int tabWidth=(layout.width-16)/2;
            GuiButton materials=new GuiButton(5,layout.left+6,layout.top+29,tabWidth,ChecklistLayout.BUTTON_HEIGHT,"Materials");
            GuiButton plans=new GuiButton(6,layout.left+10+tabWidth,layout.top+29,tabWidth,ChecklistLayout.BUTTON_HEIGHT,"To Build");
            materials.field_73742_g=showPlans;plans.field_73742_g=!showPlans;
            field_73887_h.add(materials);field_73887_h.add(plans);
            listButton=new GuiButton(7,layout.left+6,layout.top+53,layout.width-12,ChecklistLayout.BUTTON_HEIGHT,"");
            listButton.field_73742_g=session.store!=null;field_73887_h.add(listButton);
            field_73887_h.add(new GuiButton(4,layout.left+6,layout.top+layout.height-26,layout.width-12,ChecklistLayout.BUTTON_HEIGHT,"Open calculator"));
        }
    }
    List<BuildListStore.Row> rows() {
        if(session.build==null)return Collections.emptyList();
        return showPlans?session.build.plans:session.build.materials;
    }
    void toggleRow(int index)throws IOException {
        if(minimized||dropdownOpen||showPlans||session.build==null||index<0||index>=session.build.materials.size())return;
        if(session.toggleRow(session.build.materials.get(index)))message="";else refreshLists();
    }
    void openList(File file)throws IOException {
        try {session.open(file);dropdownOpen=false;}
        finally {refreshLists();message=session.message;}
    }
    private int listVisibleCount(){return Math.max(1,Math.min(6,(layout.rowsBottom-layout.top-75)/ChecklistLayout.BUTTON_HEIGHT));}
    private void clampListOffset(){listOffset=Math.max(0,Math.min(listOffset,Math.max(0,files.size()-listVisibleCount())));}
    private int listRowAt(int x,int y) {
        int top=layout.top+75;
        if(x<layout.left+6||x>=layout.left+layout.width-6||y<top||y>=top+listVisibleCount()*ChecklistLayout.BUTTON_HEIGHT)return -1;
        int index=listOffset+(y-top)/ChecklistLayout.BUTTON_HEIGHT;return index<files.size()?index:-1;
    }
    private void drawLists(int mouseX,int mouseY) {
        clampListOffset();int x=layout.left+6,y=layout.top+75,w=layout.width-12;
        int visible=Math.max(1,Math.min(files.size(),listVisibleCount()));
        func_73734_a(x-1,y-1,x+w+1,y+visible*ChecklistLayout.BUTTON_HEIGHT+1,0xFFADBFCF);
        func_73734_a(x,y,x+w,y+visible*ChecklistLayout.BUTTON_HEIGHT,0xFF1F2A38);
        if(files.isEmpty())func_73731_b(field_73886_k,"No saved lists",x+6,y+6,0xC7D9E8);
        for(int i=0;i<visible&&i+listOffset<files.size();i++) {
            File file=files.get(i+listOffset);int rowY=y+i*ChecklistLayout.BUTTON_HEIGHT;
            if(listRowAt(mouseX,mouseY)==i+listOffset)func_73734_a(x+1,rowY,x+w-1,rowY+ChecklistLayout.BUTTON_HEIGHT,0xFF364B63);
            String name=BuildListStore.listTitle(file);
            func_73731_b(field_73886_k,text(name,w-15),x+5,rowY+6,file.equals(session.selected)?0x80E698:0xFFFFFF);
        }
        if(files.size()>visible) {
            int track=visible*ChecklistLayout.BUTTON_HEIGHT,thumb=Math.max(6,track*visible/files.size());
            int thumbY=y+(track-thumb)*listOffset/(files.size()-visible);
            func_73734_a(x+w-4,y,x+w-1,y+track,0xFF536377);
            func_73734_a(x+w-4,thumbY,x+w-1,thumbY+thumb,0xFFB9D6F7);
        }
    }
    private String text(String value,int width){return field_73886_k.func_78269_a(value,Math.max(1,width));}
    @Override public void func_73863_a(int mouseX,int mouseY,float partial) {
        // Leave the world visible outside the panel, without a full-screen backdrop.
        if(minimized){restoreButton.field_73744_e=hudKey==null?"Build list ^":text("Build list ["+hudKey+"]",layout.badgeWidth-30);super.func_73863_a(mouseX,mouseY,partial);return;}
        int x=layout.left,y=layout.top,w=layout.width,h=layout.height;
        func_73734_a(x-1,y-1,x+w+1,y+h+1,0xFFADBFCF);
        func_73734_a(x,y,x+w,y+h,0xF01F2A38);
        func_73734_a(x,y,x+w,y+26,0xFF24374D);
        BuildListIcons.checkmark(x+7,y+10,1);
        func_73731_b(field_73886_k,"Build list",x+23,y+9,0xFFFFFF);
        BuildListStore.Build build=session.build;
        List<BuildListStore.Row> rows=rows();int count=rows.size();offset=layout.clampOffset(offset,count);
        String title=build==null?"No list selected":build.title;
        listButton.field_73744_e=text(title,w-32)+(dropdownOpen?" ^":" v");
        for(int i=0;i<layout.visibleRows&&i+offset<count;i++) {
            BuildListStore.Row row=rows.get(i+offset);int rowY=layout.rowsTop+i*ChecklistLayout.ROW_HEIGHT;
            boolean checked=!showPlans&&build.checked.contains(row.key);int inset=showPlans?17:0;
            if(!showPlans) {
                if(layout.rowAt(mouseX,mouseY,offset,count)==i+offset)func_73734_a(x+4,rowY,x+w-12,rowY+24,0xFF364B63);
                func_73734_a(x+8,rowY+7,x+19,rowY+18,checked?0xFF46794E:0xFF8190A2);
                if(checked)BuildListIcons.checkmark(x+8,rowY+10,1);
                else func_73734_a(x+9,rowY+8,x+18,rowY+17,0xFF1F2A38);
            }
            icons.draw(field_73882_e,row,x+25-inset,rowY+4);
            func_73731_b(field_73886_k,text(row.name,w-60+inset),x+47-inset,rowY+2,checked?0x94B39E:0xFFFFFF);
            func_73731_b(field_73886_k,text(NUM.format(row.quantity)+(row.kind.equals("fluid")?" mB":""),w-60+inset),x+47-inset,rowY+13,checked?0x94B39E:0xB7CCE4);
        }
        if(count==0) {
            func_73731_b(field_73886_k,build==null?"Choose a list in the calculator.":showPlans?"No items to build.":"No materials needed.",x+8,layout.rowsTop+8,0xC7D9E8);
        } else if(count>layout.visibleRows) {
            int track=layout.rowsBottom-layout.rowsTop,thumb=Math.max(8,track*layout.visibleRows/count);
            int thumbY=layout.rowsTop+(track-thumb)*offset/Math.max(1,count-layout.visibleRows);
            func_73734_a(x+w-8,layout.rowsTop,x+w-5,layout.rowsBottom,0xFF536377);
            func_73734_a(x+w-8,thumbY,x+w-5,thumbY+thumb,0xFFB9D6F7);
        }
        int done=0;if(build!=null)for(BuildListStore.Row row:build.materials)if(build.checked.contains(row.key))done++;
        String status=message.isEmpty()?(showPlans?count+" item"+(count==1?"":"s")+" to build":done+" / "+count+" completed"):message;
        if(hudKey!=null&&message.isEmpty())status=(showPlans?count+" to build":done+" / "+count)+" | "+hudKey+": controls";
        func_73731_b(field_73886_k,text(status,w-14),x+7,y+h-37,message.isEmpty()||BuildListSession.LIST_REMOVED.equals(message)?0xB7CCE4:0xFFB4A4);
        super.func_73863_a(mouseX,mouseY,partial);
        if(dropdownOpen){drawLists(mouseX,mouseY);return;}
        int hovered=layout.rowAt(mouseX,mouseY,offset,count);
        if(hovered>=0) {
            BuildListStore.Row row=rows.get(hovered);
            if(field_73886_k.func_78256_a(row.name)>w-60+(showPlans?17:0))
                func_73731_b(field_73886_k,text(row.name,field_73880_f-16),8,8,0xFFFFFF);
        }
    }
    @Override protected void func_73864_a(int x,int y,int button) {
        if(dropdownOpen) {
            if(button==0) {
                int index=listRowAt(x,y);
                if(index>=0) {
                    try {openList(files.get(index));}catch(IOException e){message=e.getMessage();}
                } else dropdownOpen=false;
            }
            return; // Closing a dropdown must not check the material beneath it.
        }
        // Resolve a row before a button can expand/minimize and change the layout.
        int row=minimized||showPlans||session.build==null?-1:layout.rowAt(x,y,offset,rows().size());
        super.func_73864_a(x,y,button);
        // GuiScreen iterates its button list during a click. Rebuild after it finishes,
        // so expanding cannot also activate the new footer button under the cursor.
        if(rebuildControls){rebuildControls=false;func_73866_w_();}
        if(button==0&&row>=0)try {toggleRow(row);}
        catch(Exception e){message="Could not save progress.";BuildListMod.logger.warning(e.toString());}
    }
    @Override protected void func_73875_a(GuiButton button) {
        switch(button.field_73741_f) {
        case 1:minimized=true;rebuildControls=true;if(controller!=null)controller.resumeGame();break;
        case 2:if(controller!=null)controller.hide();else field_73882_e.func_71373_a(null);break;
        case 3:minimized=false;rebuildControls=true;break;
        case 4:BuildListClient.calculator();break;
        case 5:showPlans=false;offset=0;icons.clear();rebuildControls=true;break;
        case 6:showPlans=true;offset=0;icons.clear();rebuildControls=true;break;
        case 7:
            refreshLists();listOffset=0;dropdownOpen=true;
            int selected=files.indexOf(session.selected);if(selected>=0)listOffset=selected;
            clampListOffset();break;
        default:break;
        }
    }
    @Override protected void func_73869_a(char character,int code) {
        if(code==Keyboard.KEY_ESCAPE) {
            if(dropdownOpen)dropdownOpen=false;
            else if(controller!=null)controller.resumeGame();
            else field_73882_e.func_71373_a(null);
        }
        else if(dropdownOpen) {
            if(code==Keyboard.KEY_DOWN)listOffset++;
            else if(code==Keyboard.KEY_UP)listOffset--;
            else if(code==Keyboard.KEY_NEXT)listOffset+=listVisibleCount();
            else if(code==Keyboard.KEY_PRIOR)listOffset-=listVisibleCount();
            clampListOffset();
        }
        else if(!minimized) {
            if(code==Keyboard.KEY_NEXT)offset+=layout.visibleRows;
            else if(code==Keyboard.KEY_PRIOR)offset-=layout.visibleRows;
            else if(code==Keyboard.KEY_HOME)offset=0;
            else if(code==Keyboard.KEY_END)offset=rows().size();
        }
        // The registered key handler alone toggles I (or its rebound key), on release.
    }
    @Override public void func_73867_d() {
        super.func_73867_d();
        if(minimized)return;
        int x=Mouse.getEventX()*field_73880_f/field_73882_e.field_71443_c;
        int y=field_73881_g-Mouse.getEventY()*field_73881_g/field_73882_e.field_71440_d-1;
        if(dropdownOpen) {
            if(x>=layout.left+6&&x<layout.left+layout.width-6&&y>=layout.top+75&&y<layout.top+75+listVisibleCount()*ChecklistLayout.BUTTON_HEIGHT) {
                int wheel=Mouse.getEventDWheel();if(wheel!=0)listOffset+=wheel>0?-1:1;clampListOffset();
            }
            return;
        }
        if(session.build==null||x<layout.left||x>=layout.left+layout.width||y<layout.rowsTop||y>=layout.rowsBottom)return;
        int wheel=Mouse.getEventDWheel();if(wheel!=0)offset=layout.clampOffset(offset+(wheel>0?-3:3),rows().size());
    }
}
