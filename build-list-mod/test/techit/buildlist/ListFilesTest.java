package techit.buildlist;

import java.io.*;
import java.lang.reflect.Field;
import java.nio.file.Files;
import java.util.*;
import net.minecraft.client.gui.GuiButton;

/** Exercises deletion and failed reloads through the same controls used in game. */
final class ListFilesTest {
    static void run(File root,byte[] fixture)throws Exception {
        BuildListStore store=new BuildListStore(new File(root,"file-changes"));
        File first=new File(store.directory,"Removed.techit.json"),second=new File(store.directory,"Remaining.techit.json");
        Files.write(first.toPath(),fixture);Files.write(second.toPath(),fixture);
        BuildListSession session=new BuildListSession(store);session.open(first);
        session.toggleRow(session.build.materials.get(0));
        File progress=new File(store.progressDirectory,session.build.fingerprint+".json");
        byte[] savedProgress=Files.readAllBytes(progress.toPath());
        File preference=new File(store.progressDirectory,"selection.json");
        BuildListScreen screen=new BuildListScreen(session);BuildListPopup popup=new BuildListPopup(session);
        Files.delete(first.toPath());
        for(int tick=0;tick<20;tick++){screen.func_73876_c();popup.func_73876_c();}
        checkCleared(session,screen,popup);
        BuildListTest.check(((List<?>)field(screen,"files")).equals(Collections.singletonList(second)),"picker removes deleted files and keeps remaining lists");
        BuildListTest.check(!preference.exists(),"deleted list is not remembered as the active selection");
        BuildListTest.check(Arrays.equals(savedProgress,Files.readAllBytes(progress.toPath())),"deleting exports preserves saved checkbox progress");

        // Delete every export, then press Reload before the next polling tick.
        Files.write(first.toPath(),fixture);session.open(first);
        screen=new BuildListScreen(session);popup=new BuildListPopup(session);
        Files.delete(first.toPath());Files.delete(second.toPath());
        reload(screen);
        checkCleared(session,screen,popup);
        BuildListTest.check(((List<?>)field(screen,"files")).isEmpty(),"Reload returns to an empty file picker");
        BuildListTest.check(BuildListSession.LIST_REMOVED.equals(field(screen,"message")),"missing file has a short notice instead of its absolute path");
        reload(screen);BuildListTest.check("".equals(field(screen,"message")),"Reload on an empty folder is harmless");
        BuildListTest.check(new BuildListSession(store).build==null,"restart cannot resurrect the deleted list");

        // Restoring an export recovers its checks; corruption must not retain its old rows.
        Files.write(first.toPath(),fixture);session.open(first);
        BuildListTest.check(!session.build.checked.isEmpty(),"restored export reuses its saved progress");
        screen=new BuildListScreen(session);popup=new BuildListPopup(session);
        Files.write(first.toPath(),"{invalid".getBytes("UTF-8"));reload(screen);
        checkCleared(session,screen,popup);
        BuildListTest.check("Could not open list.".equals(field(screen,"message")),"invalid reload is concise and cannot show a long path or parser error");

        // A deletion immediately before a checkbox click cannot write stale progress.
        Files.write(first.toPath(),fixture);session.open(first);popup=new BuildListPopup(session);
        savedProgress=Files.readAllBytes(progress.toPath());Files.delete(first.toPath());popup.toggleRow(0);
        BuildListTest.check(session.build==null&&popup.rows().isEmpty(),"checkbox click clears a deleted list immediately");
        BuildListTest.check(Arrays.equals(savedProgress,Files.readAllBytes(progress.toPath())),"stale checkbox click does not change progress");

        Files.write(second.toPath(),fixture);session.open(second);
        try {session.open(first);throw new AssertionError("missing list should not load");}catch(IOException expected){}
        BuildListTest.check(session.selected.equals(second)&&session.build!=null,"a missing dropdown choice does not discard another valid list");
        Files.delete(second.toPath());
        BuildListTest.check(new BuildListSession(store).build==null&&!preference.exists(),"startup forgets a saved selection removed while Minecraft was closed");
    }
    private static void reload(BuildListScreen screen){screen.func_73875_a(new GuiButton(106,0,0,"Reload"));}
    private static void checkCleared(BuildListSession session,BuildListScreen screen,BuildListPopup popup)throws Exception {
        popup.refreshLists();
        BuildListTest.check(session.selected==null&&session.build==null,"shared selected file and build are cleared");
        BuildListTest.check(field(screen,"selected")==null&&field(screen,"build")==null,"inventory screen clears its cached item list");
        BuildListTest.check(popup.rows().isEmpty(),"compact popup clears its cached item list");
    }
    private static Object field(Object target,String name)throws Exception {
        Field field=target.getClass().getDeclaredField(name);field.setAccessible(true);return field.get(target);
    }
}
