package techit.buildlist;

import com.google.gson.*;
import java.io.*;
import java.nio.file.*;
import java.util.List;
import java.util.Locale;

/** One selected export shared by the full screen and compact checklist. */
final class BuildListSession {
    static final String LIST_REMOVED="List removed.";
    final BuildListStore store;
    BuildListStore.Build build;
    File selected;
    String message="";

    BuildListSession(BuildListStore store) {
        this.store=store;
        if(store==null)return;
        File preference=new File(store.progressDirectory,"selection.json");
        if(preference.isFile())try {
            JsonObject saved=new JsonParser().parse(new String(BuildListStore.readBytes(preference,4096),"UTF-8")).getAsJsonObject();
            String name=BuildListStore.string(saved,"file");
            // Preferences may only name a direct child export, never a path.
            if(name.indexOf('/')>=0||name.indexOf('\\')>=0||!name.toLowerCase(Locale.ROOT).endsWith(".techit.json"))throw new IOException("Invalid saved list name.");
            File file=new File(store.directory,name);
            if(file.isFile()){selected=file;build=store.load(file);message=build.warning;}
            else {clearSelection();message=LIST_REMOVED;}
        } catch(Exception e){clearSelection();message="Choose your build list again.";}
        chooseOnlyList();
    }

    void chooseOnlyList() {
        List<File> files=refreshFiles();
        if(store==null||build!=null)return;
        if(files.size()==1)try {open(files.get(0));}catch(IOException e){message=e.getMessage();}
    }

    List<File> refreshFiles() {
        clearMissingSelection();
        return store==null?java.util.Collections.<File>emptyList():store.files();
    }

    private void clearSelection() {
        selected=null;build=null;
        // Keep fingerprinted checkbox progress, but forget the missing selection.
        if(store!=null)try {Files.deleteIfExists(new File(store.progressDirectory,"selection.json").toPath());}
        catch(IOException e){BuildListMod.logger.warning("Could not clear the saved build-list selection: "+e);}
    }

    private void clearMissingSelection() {
        if(selected!=null&&!selected.isFile()){clearSelection();message=LIST_REMOVED;}
    }

    void open(File file)throws IOException {
        try {
            BuildListStore.Build next=store.load(file);
            JsonObject saved=new JsonObject();saved.addProperty("file",file.getName());
            File preference=new File(store.progressDirectory,"selection.json"),pending=new File(store.progressDirectory,"selection.pending");
            BuildListStore.write(pending,saved.toString());
            try {Files.move(pending.toPath(),preference.toPath(),StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING);}
            catch(AtomicMoveNotSupportedException e){Files.move(pending.toPath(),preference.toPath(),StandardCopyOption.REPLACE_EXISTING);}
            selected=file;build=next;message=next.warning;
        } catch(IOException e) {
            if(file.equals(selected))clearSelection();
            message=file.isFile()?"Could not open list.":LIST_REMOVED;
            BuildListMod.logger.warning("Could not open build list: "+e);
            throw new IOException(message,e);
        }
    }
    boolean toggleRow(BuildListStore.Row row)throws IOException {
        clearMissingSelection();
        if(build==null||!build.materials.contains(row))return false;
        store.toggle(build,row);return true;
    }
    void toggleCompleted(File file)throws IOException {
        clearMissingSelection();
        if(!file.isFile()){message=LIST_REMOVED;throw new IOException(message);}
        BuildListStore.Build list=file.equals(selected)?build:store.load(file);
        store.setCompleted(list,!BuildListStore.completed(list));
        // Renamed or duplicate exports share a fingerprint and therefore progress.
        if(build!=null&&build.fingerprint.equals(list.fingerprint))build.checked=list.checked;
    }
}
