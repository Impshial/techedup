package techit.buildlist;

import com.google.gson.*;
import java.io.*;
import java.nio.file.*;
import java.util.List;
import java.util.Locale;

/** One selected export shared by the full screen and compact checklist. */
final class BuildListSession {
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
        } catch(Exception e){selected=null;message="Choose your build list again.";}
        chooseOnlyList();
    }

    void chooseOnlyList() {
        if(store==null||build!=null)return;
        List<File> files=store.files();
        if(files.size()==1)try {open(files.get(0));}catch(IOException e){message=e.getMessage();}
    }

    void open(File file)throws IOException {
        BuildListStore.Build next=store.load(file);
        JsonObject saved=new JsonObject();saved.addProperty("file",file.getName());
        File preference=new File(store.progressDirectory,"selection.json"),pending=new File(store.progressDirectory,"selection.pending");
        BuildListStore.write(pending,saved.toString());
        try {Files.move(pending.toPath(),preference.toPath(),StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING);}
        catch(AtomicMoveNotSupportedException e){Files.move(pending.toPath(),preference.toPath(),StandardCopyOption.REPLACE_EXISTING);}
        selected=file;build=next;message=next.warning;
    }
    void toggleCompleted(File file)throws IOException {
        BuildListStore.Build list=file.equals(selected)?build:store.load(file);
        store.setCompleted(list,!BuildListStore.completed(list));
        // Renamed or duplicate exports share a fingerprint and therefore progress.
        if(build!=null&&build.fingerprint.equals(list.fingerprint))build.checked=list.checked;
    }
}
