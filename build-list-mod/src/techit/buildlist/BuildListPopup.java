package techit.buildlist;

import java.text.NumberFormat;
import java.util.Locale;
import net.minecraft.client.gui.*;
import org.lwjgl.input.Keyboard;
import org.lwjgl.input.Mouse;

/** A non-pausing, right-docked checklist with a clickable minimized state. */
public final class BuildListPopup extends GuiScreen {
    private final BuildListSession session;
    private final BuildListIcons icons=new BuildListIcons();
    private ChecklistLayout layout;
    private int offset;
    private boolean minimized,rebuildControls;
    private String message="";
    private static final NumberFormat NUM=NumberFormat.getIntegerInstance(Locale.US);

    BuildListPopup(BuildListSession session){this.session=session;session.chooseOnlyList();message=session.store==null?BuildListMod.error:session.message;}
    @Override public boolean func_73868_f(){return false;}
    @Override public void func_73866_w_() {
        layout=new ChecklistLayout(field_73880_f,field_73881_g);field_73887_h.clear();
        if(minimized) {
            field_73887_h.add(new GuiButton(3,layout.badgeLeft,layout.badgeTop,layout.badgeWidth-22,22,"Build list ^"));
            field_73887_h.add(new GuiButton(2,layout.badgeLeft+layout.badgeWidth-22,layout.badgeTop,22,22,"x"));
        } else {
            field_73887_h.add(new GuiButton(1,layout.left+layout.width-48,layout.top+4,20,18,"_"));
            field_73887_h.add(new GuiButton(2,layout.left+layout.width-25,layout.top+4,20,18,"x"));
            field_73887_h.add(new GuiButton(4,layout.left+6,layout.top+layout.height-26,layout.width-12,20,"Open calculator"));
        }
    }
    private String text(String value,int width){return field_73886_k.func_78269_a(value,Math.max(1,width));}
    @Override public void func_73863_a(int mouseX,int mouseY,float partial) {
        // Leave the world visible outside the panel, without a full-screen backdrop.
        if(minimized){super.func_73863_a(mouseX,mouseY,partial);return;}
        int x=layout.left,y=layout.top,w=layout.width,h=layout.height;
        func_73734_a(x-1,y-1,x+w+1,y+h+1,0xFFADBFCF);
        func_73734_a(x,y,x+w,y+h,0xF01F2A38);
        func_73734_a(x,y,x+w,y+26,0xFF24374D);
        BuildListIcons.checkmark(x+7,y+10,1);
        func_73731_b(field_73886_k,"Build list",x+23,y+9,0xFFFFFF);
        BuildListStore.Build build=session.build;
        int count=build==null?0:build.materials.size();offset=layout.clampOffset(offset,count);
        String title=build==null?"No list selected":build.title;
        func_73731_b(field_73886_k,text(title,w-14),x+7,y+30,0xC7D9E8);
        for(int i=0;i<layout.visibleRows&&i+offset<count;i++) {
            BuildListStore.Row row=build.materials.get(i+offset);int rowY=layout.rowsTop+i*ChecklistLayout.ROW_HEIGHT;
            boolean checked=build.checked.contains(row.key);
            if(layout.rowAt(mouseX,mouseY,offset,count)==i+offset)func_73734_a(x+4,rowY,x+w-12,rowY+24,0xFF364B63);
            func_73734_a(x+8,rowY+7,x+19,rowY+18,checked?0xFF46794E:0xFF8190A2);
            if(checked)BuildListIcons.checkmark(x+8,rowY+10,1);
            else func_73734_a(x+9,rowY+8,x+18,rowY+17,0xFF1F2A38);
            icons.draw(field_73882_e,row,x+25,rowY+4);
            func_73731_b(field_73886_k,text(row.name,w-60),x+47,rowY+2,checked?0x94B39E:0xFFFFFF);
            func_73731_b(field_73886_k,text(NUM.format(row.quantity)+(row.kind.equals("fluid")?" mB":""),w-60),x+47,rowY+13,checked?0x94B39E:0xB7CCE4);
        }
        if(count==0) {
            func_73731_b(field_73886_k,build==null?"Choose a list in the calculator.":"No materials needed.",x+8,layout.rowsTop+8,0xC7D9E8);
        } else if(count>layout.visibleRows) {
            int track=layout.rowsBottom-layout.rowsTop,thumb=Math.max(8,track*layout.visibleRows/count);
            int thumbY=layout.rowsTop+(track-thumb)*offset/Math.max(1,count-layout.visibleRows);
            func_73734_a(x+w-8,layout.rowsTop,x+w-5,layout.rowsBottom,0xFF536377);
            func_73734_a(x+w-8,thumbY,x+w-5,thumbY+thumb,0xFFB9D6F7);
        }
        int done=0;if(build!=null)for(BuildListStore.Row row:build.materials)if(build.checked.contains(row.key))done++;
        String status=message.isEmpty()?done+" / "+count+" completed":message;
        func_73731_b(field_73886_k,text(status,w-14),x+7,y+h-37,message.isEmpty()?0xB7CCE4:0xFFB4A4);
        super.func_73863_a(mouseX,mouseY,partial);
        int hovered=layout.rowAt(mouseX,mouseY,offset,count);
        if(hovered>=0) {
            BuildListStore.Row row=build.materials.get(hovered);
            if(field_73886_k.func_78256_a(row.name)>w-60)
                func_73731_b(field_73886_k,text(row.name,field_73880_f-16),8,8,0xFFFFFF);
        }
    }
    @Override protected void func_73864_a(int x,int y,int button) {
        // Resolve a row before a button can expand/minimize and change the layout.
        int row=minimized||session.build==null?-1:layout.rowAt(x,y,offset,session.build.materials.size());
        super.func_73864_a(x,y,button);
        // GuiScreen iterates its button list during a click. Rebuild after it finishes,
        // so expanding cannot also activate the new footer button under the cursor.
        if(rebuildControls){rebuildControls=false;func_73866_w_();}
        if(button==0&&row>=0)try {session.store.toggle(session.build,session.build.materials.get(row));message="";}
        catch(Exception e){message="Could not save progress.";BuildListMod.logger.warning(e.toString());}
    }
    @Override protected void func_73875_a(GuiButton button) {
        switch(button.field_73741_f) {
        case 1:minimized=true;rebuildControls=true;break;
        case 2:field_73882_e.func_71373_a(null);break;
        case 3:minimized=false;rebuildControls=true;break;
        case 4:BuildListClient.calculator();break;
        default:break;
        }
    }
    @Override protected void func_73869_a(char character,int code) {
        if(code==Keyboard.KEY_ESCAPE)field_73882_e.func_71373_a(null);
        else if(!minimized) {
            if(code==Keyboard.KEY_NEXT)offset+=layout.visibleRows;
            else if(code==Keyboard.KEY_PRIOR)offset-=layout.visibleRows;
            else if(code==Keyboard.KEY_HOME)offset=0;
            else if(code==Keyboard.KEY_END&&session.build!=null)offset=session.build.materials.size();
        }
        // The registered key handler alone toggles I (or its rebound key), on release.
    }
    @Override public void func_73867_d() {
        super.func_73867_d();
        if(minimized||session.build==null)return;
        int x=Mouse.getEventX()*field_73880_f/field_73882_e.field_71443_c;
        int y=field_73881_g-Mouse.getEventY()*field_73881_g/field_73882_e.field_71440_d-1;
        if(x<layout.left||x>=layout.left+layout.width||y<layout.rowsTop||y>=layout.rowsBottom)return;
        int wheel=Mouse.getEventDWheel();if(wheel!=0)offset=layout.clampOffset(offset+(wheel>0?-3:3),session.build.materials.size());
    }
}
