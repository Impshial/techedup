package techit.buildlist;

import java.io.*;
import java.nio.file.*;
import java.util.*;
import net.minecraft.nbt.*;

/** Runs against real 1.6.4 NBT classes, without starting a game or touching user saves. */
public final class BuildListTest {
    static void check(boolean value,String message){if(!value)throw new AssertionError(message);}
    public static void main(String[] args)throws Exception {
        File root=new File(args[0],"run-"+UUID.randomUUID().toString());
        check(!root.exists(),"test starts without the folder structure");
        BuildListStore store=new BuildListStore(root);
        check(store.directory.isDirectory()&&store.progressDirectory.isDirectory(),"first load creates both folders");
        File file=new File(store.directory,"from-calculator.techit.json");
        byte[] original=Files.readAllBytes(new File(args[1]).toPath());Files.write(file.toPath(),original);
        check(store.files().size()==1,"list picker only sees exports");
        BuildListStore.Build build=store.load(file);
        check(build.plans.size()==3&&build.materials.size()==3,"reads exported plans and material totals");
        BuildListStore.Row micro=null,fluid=null,cell=null;
        for(BuildListStore.Row row:build.materials){if(row.itemId==10273)micro=row;if(row.kind.equals("fluid"))fluid=row;if(row.itemId==917)cell=row;}
        check(micro!=null&&micro.metadata==1&&micro.quantity==6,"numeric ID, metadata and count");
        check(TypedNbt.parse(micro.nbt).func_74779_i("mat").equals("tile.tconstruct.metalblock_2"),"exact microblock material restored");
        check(fluid!=null&&fluid.fluidName.equals("manyullyn.molten")&&fluid.quantity==288,"fluid identity and millibuckets");
        check(cell!=null&&cell.chargeIndependent,"RF charge grouping retained");
        store.toggle(build,micro);store.toggle(build,fluid);
        BuildListStore reopened=new BuildListStore(root);
        BuildListStore.Build restored=reopened.load(file);
        check(restored.checked.contains(micro.key)&&restored.checked.contains(fluid.key),"checkboxes survive a new session");
        reopened.toggle(restored,micro);
        check(!reopened.load(file).checked.contains(micro.key),"unchecking persists");
        check(Arrays.equals(original,Files.readAllBytes(file.toPath())),"original export never modified");
        File renamed=new File(store.directory,"renamed.techit.json");Files.write(renamed.toPath(),original);
        check(reopened.load(renamed).checked.contains(fluid.key),"renaming a list preserves progress");
        BuildListSession session=new BuildListSession(store);
        check(session.build==null,"multiple exports require a deliberate list selection");
        session.open(file);
        BuildListSession resumed=new BuildListSession(reopened);
        check(resumed.selected.equals(file)&&resumed.build.checked.contains(fluid.key),"last selected list and checks survive restart");
        check(!BuildListStore.completed(resumed.build),"partial materials do not mark the master list complete");
        reopened.setCompleted(resumed.build,true);
        check(BuildListStore.completed(reopened.load(file)),"master checkbox marks all materials and saves once");
        for(BuildListStore.Row plan:resumed.build.plans)check(!resumed.build.checked.contains(plan.key),"master completion leaves To build items informational");
        reopened.toggle(resumed.build,resumed.build.materials.get(0));
        check(!BuildListStore.completed(resumed.build),"unchecking one material clears master completion");
        reopened.setCompleted(resumed.build,false);
        check(reopened.load(file).checked.isEmpty(),"master uncheck clears material progress");
        resumed.toggleCompleted(renamed);
        check(BuildListStore.completed(resumed.build),"checking a duplicate list also updates the active popup's shared progress");
        BuildListStore.write(new File(store.progressDirectory,"selection.json"),"{\"file\":\"../outside.techit.json\"}");
        check(new BuildListSession(store).build==null,"invalid saved selection cannot escape the export directory");
        BuildListStore onlyStore=new BuildListStore(new File(root,"single"));
        Files.copy(file.toPath(),new File(onlyStore.directory,file.getName()).toPath());
        check(new BuildListSession(onlyStore).build!=null,"one export opens directly in the compact checklist");
        for(int[] size:new int[][]{{1920,1080},{854,480},{427,240},{320,240},{220,160}}) {
            ChecklistLayout layout=new ChecklistLayout(size[0],size[1]);
            check(layout.left>=0&&layout.top>=0&&layout.left+layout.width==size[0]-6,"popup stays docked within the right edge");
            check(layout.top+layout.height==size[1]-6,"popup expands upward from the bottom right");
            check(layout.badgeLeft+layout.badgeWidth==size[0]-6&&layout.badgeTop+20==size[1]-6,"minimized control keeps its screen margin");
            check(layout.width==204,"popup is fifteen percent narrower than the original 240 pixels");
            check(layout.rowsBottom<=layout.top+layout.height-37,"rows do not overlap footer controls");
            int offset=layout.clampOffset(1000,35);
            check(offset+layout.visibleRows==35,"scroll reaches the last material");
            check(layout.rowAt(layout.left+8,layout.rowsTop,offset,35)==offset,"visible hit target maps to its scrolled material");
            check(layout.rowAt(layout.left+8,layout.rowsBottom,offset,35)==-1,"footer cannot toggle a material");
            check(layout.clampOffset(9,0)==0&&layout.clampOffset(-9,35)==0,"empty and negative scrolls are bounded");
        }
        PopupTest.run(resumed,file,renamed);
        HudTest.run(resumed,file);
        ListFilesTest.run(root,original);
        RebrandTest.run(root,original);
        String text=new String(original,"UTF-8");
        expectRejected(store,file,text.replace("\"version\": 1","\"version\": 99"),"unknown version");
        expectRejected(store,file,text.replace("\"minecraftVersion\": \"1.6.4\"","\"minecraftVersion\": \"1.7.10\""),"different game version");
        expectRejected(store,file,text.replace("\"quantity\": 6","\"quantity\": 0.5"),"fractional quantity");
        expectRejected(store,file,text.replace("\"itemId\": 10273","\"itemId\": 1"),"mismatched item reference");
        String tags="{\"big\":{\"type\":\"NBTTagLong\",\"value\":{\"field_74753_a\":9223372036854775807}},\"list\":{\"type\":\"NBTTagList\",\"elementType\":10,\"value\":[{\"id\":{\"type\":\"NBTTagShort\",\"value\":{\"field_74752_a\":16}}}]}}";
        NBTTagCompound nbt=TypedNbt.parse(tags);
        check(nbt.func_74763_f("big")==Long.MAX_VALUE,"64-bit NBT does not lose precision");
        check(((NBTTagCompound)nbt.func_74761_m("list").func_74743_b(0)).func_74765_d("id")==16,"compound lists restore correctly");
        Class.forName("techit.buildlist.BuildListScreen",false,BuildListTest.class.getClassLoader());
        Class.forName("techit.buildlist.BuildListTabs",false,BuildListTest.class.getClassLoader());
        Class.forName("techit.buildlist.BuildListPopup",false,BuildListTest.class.getClassLoader());
        java.lang.reflect.Constructor<BuildListClient> constructor=BuildListClient.class.getDeclaredConstructor();constructor.setAccessible(true);
        net.minecraft.client.settings.KeyBinding[] keys=constructor.newInstance().getKeyBindings();
        check(keys.length==1&&keys[0].field_74512_d==23,"only I is registered; J stays free for JourneyMap");
        check(keys[0].field_74515_c.equals("TechIt checklist"),"saved key binding identity survives its translated display-name change");
        System.out.println("PASS: automatic folders, calculator export, NBT, fluids, persistent checks, shared selection, master completion, popup bounds/scrolling, validation and GUI linkage.");
    }
    static void expectRejected(BuildListStore store,File file,String text,String message)throws Exception {
        Files.write(file.toPath(),text.getBytes("UTF-8"));boolean rejected=false;
        try{store.load(file);}catch(IOException expected){rejected=true;}
        check(rejected,message);
    }
}
