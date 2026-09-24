package techit.buildlist;

import java.io.*;
import java.awt.Desktop;
import java.text.NumberFormat;
import java.util.*;
import net.minecraft.client.gui.*;
import net.minecraft.item.ItemStack;
import org.lwjgl.input.Keyboard;
import org.lwjgl.input.Mouse;

public final class BuildListScreen extends GuiScreen {
    private final BuildListStore store;
    private final BuildListSession session;
    private BuildListStore.Build build;
    private File selected;
    private List<File> files=new ArrayList<File>();
    private GuiTextField search;
    private GuiButton hideButton,modeButton;
    private int left,top,panelWidth,panelHeight,rowsTop,rowsBottom,offset;
    private int refreshTicks;
    private boolean hideCompleted,showPlans;
    private String query="",message="";
    private final BuildListIcons icons=new BuildListIcons();
    private final Map<File,Boolean> completion=new HashMap<File,Boolean>();
    private static final NumberFormat NUM=NumberFormat.getIntegerInstance(Locale.US);
    BuildListScreen(BuildListSession session){
        this.session=session;this.store=session.store;session.chooseOnlyList();
        build=session.build;selected=session.selected;message=session.message;
        if(store!=null)files=store.files();else message=BuildListMod.error;
    }
    @Override public void func_73866_w_() {
        Keyboard.enableRepeatEvents(true);
        panelWidth=Math.min(440,field_73880_f-16);panelHeight=Math.min(340,field_73881_g-46);
        left=(field_73880_f-panelWidth)/2;top=Math.max(32,(field_73881_g-panelHeight+24)/2);
        rowsTop=top+64;rowsBottom=top+panelHeight-49;
        field_73887_h.clear();
        search=new GuiTextField(field_73886_k,left+10,top+35,Math.max(70,panelWidth-211),18);
        search.func_73804_f(100);search.func_73782_a(query);
        hideButton=new GuiButton(102,left+panelWidth-194,top+34,100,20,hideCompleted?"Show completed":"Hide completed");
        modeButton=new GuiButton(103,left+panelWidth-90,top+34,80,20,showPlans?"Materials":"To build");
        hideButton.field_73742_g=build!=null&&!showPlans;modeButton.field_73742_g=build!=null;
        field_73887_h.add(hideButton);field_73887_h.add(modeButton);
        int y=top+panelHeight-26,w=(panelWidth-26)/4;
        field_73887_h.add(new GuiButton(104,left+10,y,w,20,build==null?"Refresh":"Lists"));
        field_73887_h.add(new GuiButton(105,left+14+w,y,w,20,"Open folder"));
        field_73887_h.add(new GuiButton(106,left+18+w*2,y,w,20,"Reload"));
        field_73887_h.add(new GuiButton(107,left+22+w*3,y,w,20,"Inventory"));
        BuildListClient.addTabs(field_73887_h,left,top);
    }
    @Override public boolean func_73868_f(){return false;}
    @Override public void func_73876_c(){
        if(search!=null)search.func_73780_a();
        if(++refreshTicks>=20){refreshTicks=0;refreshLists();}
    }
    void refreshLists() {
        List<File> next=session.refreshFiles();
        boolean changed=build!=null&&build!=session.build;
        if(changed||!files.equals(next))completion.clear();
        files=next;
        if(changed) {
            build=session.build;selected=session.selected;message=session.message;
            offset=0;query="";icons.clear();
            if(search!=null)search.func_73782_a("");
            updateButtons();
        }
    }
    private void updateButtons() {
        if(hideButton!=null)hideButton.field_73742_g=build!=null&&!showPlans;
        if(modeButton!=null)modeButton.field_73742_g=build!=null;
        for(Object value:field_73887_h) {
            GuiButton button=(GuiButton)value;
            if(button.field_73741_f==104)button.field_73744_e=build==null?"Refresh":"Lists";
        }
    }
    @Override public void func_73874_b(){Keyboard.enableRepeatEvents(false);}
    private String text(String value,int width){return field_73886_k.func_78269_a(value,Math.max(8,width));}
    private int visibleCount(){return Math.max(1,(rowsBottom-rowsTop)/27);}
    private List<File> visibleFiles(){List<File> result=new ArrayList<File>();for(File file:files)if(file.getName().toLowerCase(Locale.ROOT).contains(query.toLowerCase(Locale.ROOT)))result.add(file);return result;}
    private List<BuildListStore.Row> visibleRows(){
        List<BuildListStore.Row> result=new ArrayList<BuildListStore.Row>();if(build==null)return result;
        for(BuildListStore.Row row:showPlans?build.plans:build.materials)
            if((showPlans||!hideCompleted||!build.checked.contains(row.key))&&row.name.toLowerCase(Locale.ROOT).contains(query.toLowerCase(Locale.ROOT)))result.add(row);
        return result;
    }
    private Boolean completed(File file) {
        if(!completion.containsKey(file))try {
            completion.put(file,BuildListStore.completed(file.equals(session.selected)?session.build:store.load(file)));
        }catch(IOException e){completion.put(file,null);}
        return completion.get(file);
    }
    @Override public void func_73863_a(int mouseX,int mouseY,float partial) {
        func_73873_v_();
        func_73734_a(left-2,top-2,left+panelWidth+2,top+panelHeight+2,0xFF080B10);
        func_73734_a(left,top,left+panelWidth,top+panelHeight,0xFFCBD0D7);
        func_73734_a(left+2,top+2,left+panelWidth-2,top+26,0xFF24374D);
        func_73731_b(field_73886_k,text(build==null?"Build Lists":build.title,panelWidth-24),left+10,top+9,0xFFFFFF);
        search.func_73795_f();
        if(query.isEmpty()&&!search.func_73806_l())func_73731_b(field_73886_k,"Search...",left+14,top+40,0x777777);
        func_73734_a(left+8,rowsTop-3,left+panelWidth-8,rowsBottom,0xFF1F2A38);
        int count=build==null?visibleFiles().size():visibleRows().size();offset=Math.max(0,Math.min(offset,Math.max(0,count-visibleCount())));
        List<File> shownFiles=build==null?visibleFiles():null;List<BuildListStore.Row> rows=build==null?null:visibleRows();
        for(int i=0;i<visibleCount()&&i+offset<count;i++) {
            int y=rowsTop+i*27;boolean hover=mouseX>=left+9&&mouseX<left+panelWidth-14&&mouseY>=y&&mouseY<y+26;
            if(hover)func_73734_a(left+9,y,left+panelWidth-14,y+26,0xFF364B63);
            if(build==null) {
                File file=shownFiles.get(i+offset);
                Boolean done=completed(file);
                func_73734_a(left+16,y+7,left+28,y+19,0xFF9DAABC);
                func_73734_a(left+17,y+8,left+27,y+18,0xFF1F2A38);
                if(Boolean.TRUE.equals(done))BuildListIcons.checkmark(left+16,y+10,1);
                else if(done==null)func_73731_b(field_73886_k,"?",left+19,y+9,0xFFB4A4);
                func_73731_b(field_73886_k,text(BuildListStore.listTitle(file),panelWidth-56),left+36,y+8,Boolean.TRUE.equals(done)?0x94B39E:0xFFFFFF);
            } else drawRow(rows.get(i+offset),y);
        }
        if(count==0) {
            String empty=build==null?(files.isEmpty()?"Save an export using Open folder.":"No matching lists."):"No materials to show.";
            func_73731_b(field_73886_k,text(empty,panelWidth-32),left+16,rowsTop+12,0xCCD6E4);
        }
        if(count>visibleCount()) {
            int track=rowsBottom-rowsTop,thumb=Math.max(10,track*visibleCount()/count),y=rowsTop+(track-thumb)*offset/Math.max(1,count-visibleCount());
            func_73734_a(left+panelWidth-12,rowsTop,left+panelWidth-9,rowsBottom,0xFF536377);
            func_73734_a(left+panelWidth-12,y,left+panelWidth-9,y+thumb,0xFFB9D6F7);
        }
        String status=message;
        if(status.isEmpty()) {
            if(build==null)status=files.size()+" list"+(files.size()==1?"":"s");
            else {List<BuildListStore.Row> all=showPlans?build.plans:build.materials;int done=0;for(BuildListStore.Row row:all)if(build.checked.contains(row.key))done++;
                status=showPlans?all.size()+" item"+(all.size()==1?"":"s")+" to build":"Materials - "+done+" / "+all.size()+" completed";}
        }
        func_73731_b(field_73886_k,text(status,panelWidth-20),left+10,top+panelHeight-42,message.isEmpty()||BuildListSession.LIST_REMOVED.equals(message)?0x34465B:0x8B2020);
        super.func_73863_a(mouseX,mouseY,partial);
    }
    private void drawRow(BuildListStore.Row row,int y) {
        boolean checked=!showPlans&&build.checked.contains(row.key);
        if(!showPlans) {
            func_73734_a(left+16,y+7,left+28,y+19,0xFF9DAABC);
            func_73734_a(left+17,y+8,left+27,y+18,0xFF1F2A38);
            if(checked)BuildListIcons.checkmark(left+16,y+10,1);
        }
        ItemStack item=icons.stack(row);int inset=showPlans?19:0;
        icons.draw(field_73882_e,row,left+35-inset,y+4);
        String count=NUM.format(row.quantity)+(row.kind.equals("fluid")?" mB":"");
        int quantityWidth=field_73886_k.func_78256_a(count),right=left+panelWidth-20;
        func_73731_b(field_73886_k,count,right-quantityWidth,y+3,checked?0x88B699:0xFFFFFF);
        func_73731_b(field_73886_k,text(row.name,panelWidth-84+inset-quantityWidth),left+59-inset,y+3,checked?0x91A497:0xFFFFFF);
        String detail="";
        if(row.kind.equals("fluid"))detail="Fluid";
        else if(item!=null) {
            int size=Math.max(1,item.func_77976_d());long full=row.quantity/size,leftover=row.quantity%size;
            detail=size>1&&full>0?NUM.format(full)+" stack"+(full==1?"":"s")+(leftover>0?" + "+leftover:""):"";
        } else detail=row.kind.equals("unresolved")?"Unresolved ingredient":"Item unavailable in this instance";
        if(icons.failed(row))detail="Icon unavailable";
        func_73731_b(field_73886_k,text(detail,panelWidth-82+inset),left+59-inset,y+15,0xA8B8CD);
    }
    @Override protected void func_73864_a(int x,int y,int button) {
        super.func_73864_a(x,y,button);search.func_73793_a(x,y,button);
        if(button!=0||x<left+9||x>=left+panelWidth-14||y<rowsTop||y>=rowsBottom)return;
        int index=offset+(y-rowsTop)/27;
        try {
            if(build==null) {
                List<File> shown=visibleFiles();if(index<shown.size()) {
                    File file=shown.get(index);
                    if(x>=left+14&&x<left+31) {
                        session.toggleCompleted(file);completion.clear();message="";
                    } else open(file);
                }
            } else if(!showPlans) {
                List<BuildListStore.Row> rows=visibleRows();
                if(index<rows.size()){if(session.toggleRow(rows.get(index)))message="";else refreshLists();}
            }
        }catch(Exception e){refreshLists();message=BuildListSession.LIST_REMOVED.equals(e.getMessage())?BuildListSession.LIST_REMOVED:"Could not save progress.";BuildListMod.logger.warning(e.toString());}
    }
    private void open(File file) {
        try {
            session.open(file);build=session.build;selected=session.selected;
            message=session.message;offset=0;query="";icons.clear();
            if(search!=null)search.func_73782_a("");
        } catch(IOException e){refreshLists();message=session.message;}
        updateButtons();
    }
    @Override protected void func_73875_a(GuiButton button) {
        try {
            switch(button.field_73741_f) {
            case 102:hideCompleted=!hideCompleted;offset=0;hideButton.field_73744_e=hideCompleted?"Show completed":"Hide completed";break;
            case 103:showPlans=!showPlans;offset=0;icons.clear();modeButton.field_73744_e=showPlans?"Materials":"To build";hideButton.field_73742_g=!showPlans;break;
            case 104:build=null;selected=null;files=session.refreshFiles();completion.clear();query="";offset=0;message="";func_73866_w_();break;
            case 105:if(store!=null&&Desktop.isDesktopSupported())Desktop.getDesktop().open(store.directory);else message="Folder: minecraft/"+(store==null?BuildListStore.DIRECTORY:store.directory.getName());break;
            case 106:if(store!=null){if(selected!=null)open(selected);else {refreshLists();completion.clear();message="";}}break;
            case 107:BuildListClient.inventory();break;
            default:break;
            }
        }catch(Exception e){refreshLists();message="Could not complete action.";BuildListMod.logger.warning(e.toString());}
    }
    @Override protected void func_73869_a(char character,int code) {
        if(code==Keyboard.KEY_ESCAPE){field_73882_e.func_71373_a(null);return;}
        if(search.func_73802_a(character,code)){query=search.func_73781_b();offset=0;return;}
        if(code==Keyboard.KEY_NEXT)offset+=visibleCount();else if(code==Keyboard.KEY_PRIOR)offset-=visibleCount();
    }
    @Override public void func_73867_d() {
        super.func_73867_d();int wheel=Mouse.getEventDWheel();if(wheel!=0)offset+=wheel>0?-3:3;
    }
}
