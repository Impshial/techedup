package techit.export;

import java.lang.reflect.*;
import java.util.*;

/** Offline serialization checks. Does not launch Minecraft or modify the installation. */
public final class ExporterTest {
    public static final class FakeStack {
        public int field_77993_c=42,field_77994_a=3,meta=32767;
        public Object field_77990_d=new Tag();
        public int func_77960_j(){return meta;}
        public String func_82833_r(){return "Test ingot";}
        public String func_77977_a(){return "item.test";}
        public FakeItem func_77973_b(){return new FakeItem();}
        public FakeStack func_77946_l(){FakeStack c=new FakeStack();c.meta=meta;c.field_77994_a=field_77994_a;return c;}
    }
    public static final class FakeItem {
        public FakeStack getContainerItemStack(FakeStack s){s.meta++;s.field_77994_a=1;return s;}
    }
    public static final class Tag {public String material="copper"; public int charge=7;}
    public static final class Fluid { public int fluidID=9,amount=144;public Object tag=null; }
    public static final class Alloy {public Fluid result=new Fluid();public List<Fluid> mixers=Arrays.asList(new Fluid(),new Fluid());}
    public static final class Loop {public Object self=this;}
    static void set(String name,Object value)throws Exception{Field f=RecipeExporter.class.getDeclaredField(name);f.setAccessible(true);f.set(null,value);}
    static Object get(String name)throws Exception{Field f=RecipeExporter.class.getDeclaredField(name);f.setAccessible(true);return f.get(null);}
    static Object encode(Object x)throws Exception{return RecipeExporter.encode(x,0,new IdentityHashMap<Object,Boolean>());}
    static void check(boolean b,String message){if(!b)throw new AssertionError(message);}
    public static void main(String[] args)throws Exception {
        set("stackClass",FakeStack.class);set("fluidClass",Fluid.class);
        FakeStack s=new FakeStack(); Map<?,?> item=(Map<?,?>)encode(s);
        check(item.get("id").equals(42)&&item.get("meta").equals(32767)&&item.get("count").equals(3),"Exact ID, wildcard, quantity");
        check(item.get("nbt")!=null,"NBT is retained");
        check(s.meta==32767&&s.field_77994_a==3,"Container API never receives registry-owned stack");
        check(((Map<?,?>)get("ITEMS")).size()==2,"Recursive container variants terminate");
        List<FakeStack> ore=new ArrayList<FakeStack>();ore.add(s);
        ((IdentityHashMap<Object,String>)get("ORE_LISTS")).put(ore,"ingotCopper");
        Map<?,?> token=(Map<?,?>)encode(ore);
        check(token.get("kind").equals("ore")&&token.get("name").equals("ingotCopper"),"Ore dictionary identity is retained");
        check(encode(new ArrayList<FakeStack>(ore)) instanceof List,"Equal alternatives are not falsely labeled as a shared ore list");
        Map<?,?> fluid=(Map<?,?>)encode(new Fluid());check(fluid.get("amount").equals(144),"Fluid millibuckets survive");
        Map<?,?> alloy=(Map<?,?>)encode(new Alloy());check(((Map<?,?>)alloy.get("fields")).containsKey("mixers"),"Machine recipe fields retained");
        int before=(Integer)get("serializationWarnings");encode(new Loop());check((Integer)get("serializationWarnings")>before,"Cycles explicitly reported");
        check(RecipeExporter.call(s,"func_77960_j").equals(32767),"Reflected getter");
        byte[] rgba={(byte)255,0,0,(byte)255,0,(byte)255,0,(byte)128,0,0,(byte)255,(byte)255,0,0,0,0};
        java.awt.image.BufferedImage icon=IconExporter.decode(rgba,2);
        check(icon.getRGB(0,0)==0xff0000ff&&icon.getRGB(0,1)==0xffff0000,"Framebuffer rows flip into PNG coordinates");
        check(icon.getRGB(1,1)==0x8000ff00&&icon.getRGB(1,0)==0,"PNG alpha is preserved");
        boolean blank=false;try{IconExporter.decode(new byte[16],2);}catch(java.io.IOException e){blank=true;}
        check(blank,"Invisible renders are reported instead of counted as images");
        System.out.println("PASS: IDs, wildcard metadata, counts, NBT, container-copy safety, bounded variants, ore identity, fluids, machine fields, cycles, reflection.");
    }
}
