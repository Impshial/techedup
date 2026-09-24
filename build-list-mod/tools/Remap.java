import java.io.*;
import java.util.*;
import java.util.jar.*;
import org.objectweb.asm.*;
import org.objectweb.asm.commons.*;

/** Local compile dependency only. The resulting Minecraft/Forge jar is never distributed. */
public final class Remap {
    public static void main(String[] args)throws Exception {
        final Map<String,String> classes=new HashMap<String,String>(),methods=new HashMap<String,String>(),fields=new HashMap<String,String>();
        BufferedReader in=new BufferedReader(new FileReader(args[0]));
        for(String line;(line=in.readLine())!=null;){String[] p=line.split(" ");
            if(p[0].equals("CL:"))classes.put(p[1],p[2]);
            if(p[0].equals("FD:"))fields.put(p[1],p[2].substring(p[2].lastIndexOf('/')+1));
            if(p[0].equals("MD:"))methods.put(p[1]+p[2],p[3].substring(p[3].lastIndexOf('/')+1));
        }in.close();
        final Map<String,String[]> parents=new HashMap<String,String[]>();
        Map<String,byte[]> code=new LinkedHashMap<String,byte[]>();
        for(int n=2;n<args.length;n++) {
            JarFile jar=new JarFile(args[n]);
            Enumeration<JarEntry> entries=jar.entries();
            while(entries.hasMoreElements()) {
                JarEntry entry=entries.nextElement();if(!entry.getName().endsWith(".class"))continue;
                InputStream stream=jar.getInputStream(entry);ByteArrayOutputStream buffer=new ByteArrayOutputStream();byte[] chunk=new byte[8192];
                for(int count;(count=stream.read(chunk))!=-1;)buffer.write(chunk,0,count);stream.close();
                byte[] bytes=buffer.toByteArray();ClassReader reader=new ClassReader(bytes);
                String[] supers=new String[reader.getInterfaces().length+1];supers[0]=reader.getSuperName();System.arraycopy(reader.getInterfaces(),0,supers,1,supers.length-1);
                parents.put(reader.getClassName(),supers);code.put(reader.getClassName(),bytes);
            }jar.close();
        }
        Remapper mapper=new Remapper(){
            public String map(String name){return classes.containsKey(name)?classes.get(name):name;}
            private String lookup(Map<String,String> mapping,String owner,String suffix,Set<String> visited) {
                if(owner==null||!visited.add(owner))return null;
                String value=mapping.get(owner+"/"+suffix);if(value!=null)return value;
                String[] supers=parents.get(owner);if(supers!=null)for(String parent:supers){value=lookup(mapping,parent,suffix,visited);if(value!=null)return value;}
                return null;
            }
            public String mapMethodName(String owner,String name,String desc){String value=lookup(methods,owner,name+desc,new HashSet<String>());return value==null?name:value;}
            public String mapFieldName(String owner,String name,String desc){String value=lookup(fields,owner,name,new HashSet<String>());return value==null?name:value;}
        };
        JarOutputStream out=new JarOutputStream(new FileOutputStream(args[1]));
        for(Map.Entry<String,byte[]> entry:code.entrySet()) {
            ClassWriter writer=new ClassWriter(0);new ClassReader(entry.getValue()).accept(new RemappingClassAdapter(writer,mapper),ClassReader.EXPAND_FRAMES);
            out.putNextEntry(new JarEntry(mapper.map(entry.getKey())+".class"));out.write(writer.toByteArray());out.closeEntry();
        }out.close();
    }
}
