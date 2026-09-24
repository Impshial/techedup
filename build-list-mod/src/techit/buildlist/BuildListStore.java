package techit.buildlist;

import com.google.gson.*;
import java.io.*;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;

/** File contract and progress persistence; independent of the Minecraft client. */
public final class BuildListStore {
    public final File directory,progressDirectory;
    private static final Gson JSON=new GsonBuilder().setPrettyPrinting().disableHtmlEscaping().create();
    public BuildListStore(File minecraftDirectory)throws IOException {
        directory=new File(minecraftDirectory,"techit-builds");progressDirectory=new File(directory,".progress");
        ensureDirectory(directory);ensureDirectory(progressDirectory);
        File guide=new File(directory,"README.txt");
        if(!guide.exists())write(guide,"Export > Minecraft in the TechIt calculator. Save the .techit.json file here.\r\nOpen TechIt Build Lists in game and click Refresh.\r\n.progress contains saved checkboxes. Original exports are never edited.\r\n");
    }
    private static void ensureDirectory(File folder)throws IOException {
        if(!folder.isDirectory()&&!folder.mkdirs())throw new IOException("Cannot create "+folder.getAbsolutePath());
    }
    public List<File> files() {
        File[] files=directory.listFiles(new FilenameFilter(){public boolean accept(File dir,String name){return name.toLowerCase(Locale.ROOT).endsWith(".techit.json");}});
        List<File> result=new ArrayList<File>();if(files!=null)for(File file:files)if(file.isFile())result.add(file);
        Collections.sort(result,new Comparator<File>(){public int compare(File a,File b){return a.getName().compareToIgnoreCase(b.getName());}});
        return result;
    }
    public static final class Row {
        public String ref,name,kind,fluidName,nbt,key;
        public int itemId,metadata,fluidId;
        public long quantity;
        public boolean chargeIndependent;
    }
    public static final class Build {
        public String title,fingerprint;
        public List<Row> plans=new ArrayList<Row>(),materials=new ArrayList<Row>();
        public Set<String> checked=new HashSet<String>();
        public String warning="";
    }
    public static boolean completed(Build build) {
        for(Row row:build.materials)if(!build.checked.contains(row.key))return false;
        return true;
    }
    public Build load(File file)throws IOException {
        if(!file.getCanonicalFile().getParentFile().equals(directory.getCanonicalFile()))throw new IOException("Choose a file in techit-builds.");
        try {
            byte[] bytes=readBytes(file,4*1024*1024);
            JsonObject root=new JsonParser().parse(new String(bytes,"UTF-8")).getAsJsonObject();
            if(!"techit-minecraft-build-list".equals(string(root,"format"))||integer(root,"version",1,1)!=1)throw new IOException("Use Export > Minecraft in the calculator.");
            if(!"1.6.4".equals(string(root,"minecraftVersion")))throw new IOException("This list is for a different Minecraft version.");
            Build build=new Build();build.title=file.getName().replaceFirst("(?i)\\.techit\\.json$","");
            build.fingerprint=hex(MessageDigest.getInstance("SHA-256").digest(bytes));
            build.plans=rows(root.getAsJsonArray("plans"),"plans");build.materials=rows(root.getAsJsonArray("materials"),"materials");
            File progress=new File(progressDirectory,build.fingerprint+".json");
            if(progress.isFile())try {
                JsonArray saved=new JsonParser().parse(new String(readBytes(progress,1024*1024),"UTF-8")).getAsJsonObject().getAsJsonArray("checked");
                for(JsonElement key:saved)build.checked.add(key.getAsString());
            } catch(Exception e){build.warning="Saved progress could not be read. The original file is unchanged.";}
            return build;
        } catch(IOException e){throw e;}catch(Exception e){throw new IOException("Invalid Minecraft build-list file: "+e.getMessage(),e);}
    }
    static List<Row> rows(JsonArray values,String section)throws IOException {
        if(values==null||values.size()>10000)throw new IOException("Missing or oversized "+section+" list.");
        List<Row> rows=new ArrayList<Row>();int index=0;
        for(JsonElement value:values) {
            JsonObject item=value.getAsJsonObject();Row row=new Row();row.key=section+":"+index++;
            row.ref=string(item,"ref");row.name=string(item,"name").replaceAll("\u00a7.","").replaceAll("[\\r\\n\\t]"," ");
            if(row.ref.length()>512||row.name.length()>512)throw new IOException("Item name or identifier is too long.");
            row.quantity=integer(item,"quantity",1,9007199254740991L);row.kind=string(item,"kind");
            if(row.kind.equals("item")) {
                row.itemId=(int)integer(item,"itemId",1,32767);row.metadata=(int)integer(item,"metadata",0,32767);
                if(!row.ref.matches("item:"+row.itemId+":"+row.metadata+"(?:@[a-f0-9]+)?"))throw new IOException("Item identifier does not match its ID and metadata.");
                if(item.has("nbt")){row.nbt=string(item,"nbt");if(row.nbt.length()>262144)throw new IOException("Item NBT is too large.");}
                if(row.ref.contains("@")&&row.nbt==null)throw new IOException("Missing item variant data.");
                row.chargeIndependent=item.has("chargeIndependent")&&item.get("chargeIndependent").getAsBoolean();
            } else if(row.kind.equals("fluid")) {
                row.fluidId=(int)integer(item,"fluidId",0,Integer.MAX_VALUE);
                if(!row.ref.equals("fluid:"+row.fluidId))throw new IOException("Fluid identifier mismatch.");
                if(item.has("fluidName"))row.fluidName=string(item,"fluidName");
            } else if(!row.kind.equals("unresolved"))throw new IOException("Unknown material kind.");
            rows.add(row);
        }
        return rows;
    }
    static String string(JsonObject obj,String name)throws IOException {
        JsonElement value=obj.get(name);
        if(value==null||!value.isJsonPrimitive()||!value.getAsJsonPrimitive().isString())throw new IOException("Missing "+name+".");
        return value.getAsString();
    }
    static long integer(JsonObject obj,String name,long min,long max)throws IOException {
        try {
            JsonElement value=obj.get(name);
            if(value==null||!value.isJsonPrimitive()||!value.getAsJsonPrimitive().isNumber())throw new Exception();
            long n=value.getAsBigDecimal().longValueExact();if(n<min||n>max)throw new Exception();return n;
        } catch(Exception e){throw new IOException("Invalid "+name+".");}
    }
    public void toggle(Build build,Row row)throws IOException {
        Set<String> next=new HashSet<String>(build.checked);if(!next.remove(row.key))next.add(row.key);
        saveProgress(build,next);
    }
    public void setCompleted(Build build,boolean completed)throws IOException {
        Set<String> next=new HashSet<String>(build.checked);
        for(Row row:build.materials)if(completed)next.add(row.key);else next.remove(row.key);
        saveProgress(build,next);
    }
    private void saveProgress(Build build,Set<String> next)throws IOException {
        JsonObject saved=new JsonObject();JsonArray checked=new JsonArray();
        List<String> sorted=new ArrayList<String>(next);Collections.sort(sorted);for(String key:sorted)checked.add(new JsonPrimitive(key));
        saved.add("checked",checked);
        File file=new File(progressDirectory,build.fingerprint+".json"),pending=new File(progressDirectory,build.fingerprint+".pending");
        write(pending,JSON.toJson(saved));
        try {Files.move(pending.toPath(),file.toPath(),StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING);}
        catch(AtomicMoveNotSupportedException e){Files.move(pending.toPath(),file.toPath(),StandardCopyOption.REPLACE_EXISTING);}
        build.checked=next;
    }
    static byte[] readBytes(File file,int max)throws IOException {
        if(file.length()>max)throw new IOException("File is too large.");
        InputStream in=new FileInputStream(file);ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] buffer=new byte[8192];
        try{for(int n;(n=in.read(buffer))!=-1;){if(out.size()+n>max)throw new IOException("File is too large.");out.write(buffer,0,n);}}finally{in.close();}
        return out.toByteArray();
    }
    static void write(File file,String text)throws IOException {Writer out=new OutputStreamWriter(new FileOutputStream(file),"UTF-8");try{out.write(text);}finally{out.close();}}
    static String hex(byte[] bytes){StringBuilder result=new StringBuilder();for(byte b:bytes)result.append(String.format("%02x",b&255));return result.toString();}
}
