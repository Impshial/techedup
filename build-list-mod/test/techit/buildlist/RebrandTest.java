package techit.buildlist;

import java.io.File;
import java.nio.file.Files;
import java.util.Arrays;

/** Branding changes must preserve existing files, selection and checkbox progress. */
final class RebrandTest {
    static void run(File root,byte[] fixture)throws Exception {
        File upgraded=new File(root,"upgrade"),legacy=new File(upgraded,"techit-builds");
        BuildListTest.check(legacy.mkdirs(),"legacy installation created");
        File oldFile=new File(legacy,"Old build.techit.json");Files.write(oldFile.toPath(),fixture);
        BuildListStore first=new BuildListStore(upgraded);
        BuildListTest.check(first.directory.equals(legacy),"existing installations keep the original data folder");
        BuildListSession session=new BuildListSession(first);
        session.toggleRow(session.build.materials.get(0));
        String checkedKey=session.build.materials.get(0).key;
        BuildListSession resumed=new BuildListSession(new BuildListStore(upgraded));
        BuildListTest.check(resumed.selected.equals(oldFile)&&resumed.build.checked.contains(checkedKey),"old export, selection and checks survive the rebrand");
        File newFile=new File(legacy,"New build.techedup.json");Files.write(newFile.toPath(),fixture);
        BuildListTest.check(first.files().size()==2,"old and new filename extensions both appear in the picker");
        resumed.open(newFile);
        BuildListTest.check(resumed.build.title.equals("New build")&&resumed.build.checked.contains(checkedKey),"new suffix is hidden in titles and does not reset unchanged export progress");
        resumed=new BuildListSession(new BuildListStore(upgraded));
        BuildListTest.check(resumed.selected.equals(newFile)&&resumed.build.checked.contains(checkedKey),"new filenames restore as the selected list after restart");
        BuildListTest.check(Arrays.equals(fixture,Files.readAllBytes(oldFile.toPath())),"legacy export is not rewritten");
        BuildListTest.check(!new File(upgraded,BuildListStore.DIRECTORY).exists(),"upgrade does not create a competing empty folder");
        File guide=new File(legacy,"README.txt");
        BuildListTest.check(new String(Files.readAllBytes(guide.toPath()),"UTF-8").contains("Teched Up"),"folder instructions use the new brand");
        Files.write(guide.toPath(),"My own instructions".getBytes("UTF-8"));new BuildListStore(upgraded);
        BuildListTest.check(new String(Files.readAllBytes(guide.toPath()),"UTF-8").equals("My own instructions"),"user-written folder instructions are preserved");
        BuildListStore fresh=new BuildListStore(new File(root,"fresh-brand"));
        BuildListTest.check(fresh.directory.getName().equals("teched-up-builds")&&fresh.progressDirectory.isDirectory(),"new installations create the branded folder structure");
        BuildListTest.check(BuildListStore.listTitle(new File("MACHINE.TECHEDUP.JSON")).equals("MACHINE"),"new suffix handling is case insensitive");
        BuildListTest.check(!BuildListStore.isExportName("notes.json"),"unrelated JSON files remain excluded");
        System.out.println("PASS: Teched Up exports, legacy folders and filenames, restored selection, persistent checks and custom instructions.");
    }
}
