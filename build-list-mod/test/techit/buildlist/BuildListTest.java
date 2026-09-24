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
        System.out.println("PASS: automatic folders, real calculator export, numeric IDs, microblock NBT, RF states, fluids, persistent checkboxes, rename, validation, long integers, NBT lists and GUI linkage.");
    }
    static void expectRejected(BuildListStore store,File file,String text,String message)throws Exception {
        Files.write(file.toPath(),text.getBytes("UTF-8"));boolean rejected=false;
        try{store.load(file);}catch(IOException expected){rejected=true;}
        check(rejected,message);
    }
}
