package techit.export;

import cpw.mods.fml.common.Mod;
import cpw.mods.fml.common.ITickHandler;
import cpw.mods.fml.common.TickType;
import cpw.mods.fml.common.event.FMLPreInitializationEvent;
import cpw.mods.fml.common.event.FMLInitializationEvent;
import cpw.mods.fml.common.registry.TickRegistry;
import cpw.mods.fml.relauncher.Side;
import com.google.gson.*;
import java.io.*;
import java.lang.reflect.*;
import java.util.*;

/** Temporary client-side diagnostic mod. Reads registries; never registers recipes. */
@Mod(modid="techitrecipeexport", name="TechIt Recipe Export", version="0.2.0", acceptedMinecraftVersions="[1.6.4]", dependencies="after:*")
public final class RecipeExporter implements ITickHandler {
    private File directory;
    private int ticks;
    private boolean done;
    private IconExporter iconExporter;
    private static final Gson JSON = new GsonBuilder().setPrettyPrinting().disableHtmlEscaping().serializeNulls().create();
    private static final Properties MAP = new Properties();
    private static final Properties NEI_IDS = new Properties();
    private static Class<?> stackClass;
    private static Class<?> fluidClass;
    private static Class<?> itemClass;
    private static Class<?> blockClass;
    private static Class<?> recipeClass;
    private static final Map<String,Object> ITEMS = new TreeMap<String,Object>();
    private static final Map<String,Object> ICON_STACKS = new LinkedHashMap<String,Object>();
    private static final List<Object> ERRORS = new ArrayList<Object>();
    private static final IdentityHashMap<Object,String> ORE_LISTS = new IdentityHashMap<Object,String>();
    private static int serializationWarnings;
    private static int nodes;
    private static int containerDepth;

    @Mod.EventHandler public void preinit(FMLPreInitializationEvent e) {
        directory = new File(e.getModConfigurationDirectory().getParentFile(), "techit-export");
    }
    @Mod.EventHandler public void init(FMLInitializationEvent e) {
        if (cpw.mods.fml.common.FMLCommonHandler.instance().getSide().isClient()) TickRegistry.registerTickHandler(this, Side.CLIENT);
    }
    public void tickStart(EnumSet<TickType> type, Object... data) {}
    public EnumSet<TickType> ticks() { return EnumSet.of(TickType.CLIENT); }
    public String getLabel() { return "TechIt recipe registry export"; }
    public void tickEnd(EnumSet<TickType> type, Object... data) {
        if(iconExporter!=null) {
            try {if(iconExporter.tick())iconExporter=null;}
            catch(Throwable e) {
                try{write(new File(directory,"ICONS_FAILED.txt"),error(e));}catch(Throwable ignored){}
                iconExporter.close();iconExporter=null;
            }
            return;
        }
        if (done) {
            if(++ticks % 40 != 0)return;
            File request=new File(directory,"REQUEST_EXPORT");
            if(!request.isFile())return;
            if(!request.delete())return;
            done=false;ticks=190;
        }
        try {
            if (MAP.isEmpty()) {
                InputStream in = getClass().getResourceAsStream("/techit-mappings.properties");
                if (in == null) throw new IOException("Missing Minecraft mappings");
                try { MAP.load(in); } finally { in.close(); }
                in=getClass().getResourceAsStream("/techit-nei-identifiers.properties");
                if(in!=null)try{NEI_IDS.load(in);}finally{in.close();}
            }
            Object mc = call(clazz("net.minecraft.client.Minecraft"), "func_71410_x");
            if (field(mc,"field_71441_e") == null || field(mc,"field_71439_g") == null) { ticks=0; return; }
            // Let NEI and client integrations finish loading, then read on the client thread.
            if (++ticks < 200) return;
            done=true;
            export();
        } catch (Throwable e) {
            done=true;
            try { directory.mkdirs(); write(new File(directory,"FAILED.txt"), error(e)); } catch (Throwable ignored) {}
            e.printStackTrace();
        }
    }
    static Class<?> clazz(String name) throws Exception {
        ClassLoader loader=RecipeExporter.class.getClassLoader();
        try { return Class.forName(name,false,loader); }
        catch (ClassNotFoundException e) { return Class.forName(MAP.getProperty("class."+name,name),false,loader); }
    }
    static Object field(Object obj,String name) throws Exception {
        Class<?> c=obj instanceof Class ? (Class<?>)obj : obj.getClass();
        String mapped=MAP.getProperty("field."+name,name);
        for(Class<?> k=c;k!=null;k=k.getSuperclass()) {
            for(String n:new String[]{name,mapped}) {
                try { Field f=k.getDeclaredField(n); f.setAccessible(true); return f.get(obj instanceof Class?null:obj); }
                catch(NoSuchFieldException ignored) {}
            }
        }
        throw new NoSuchFieldException(c.getName()+"."+name);
    }
    static Object call(Object obj,String name,Object... args) throws Exception {
        Class<?> c=obj instanceof Class?(Class<?>)obj:obj.getClass();
        String mapped=MAP.getProperty("method."+name,name);
        for(String n:new String[]{name,mapped}) for(Class<?> k=c;k!=null;k=k.getSuperclass()) {
            for(Method m:k.getDeclaredMethods()) {
                if(!m.getName().equals(n)||m.getParameterTypes().length!=args.length) continue;
                Class<?>[] p=m.getParameterTypes(); boolean match=true;
                for(int i=0;i<p.length;i++) if(args[i]!=null&&!boxed(p[i]).isInstance(args[i])) {match=false;break;}
                if(!match)continue;
                m.setAccessible(true); return m.invoke(obj instanceof Class?null:obj,args);
            }
        }
        throw new NoSuchMethodException(c.getName()+"."+name+"/"+args.length);
    }
    static Class<?> boxed(Class<?> c) {
        if(c==int.class)return Integer.class; if(c==boolean.class)return Boolean.class;
        if(c==long.class)return Long.class; if(c==float.class)return Float.class;
        if(c==double.class)return Double.class; if(c==short.class)return Short.class;
        if(c==byte.class)return Byte.class; return c;
    }
    static Map<String,Object> map(Object... kv) {
        Map<String,Object> m=new LinkedHashMap<String,Object>();
        for(int i=0;i<kv.length;i+=2)m.put((String)kv[i],kv[i+1]); return m;
    }
    static String error(Throwable e) {
        while(e instanceof InvocationTargetException && e.getCause()!=null)e=e.getCause();
        return e.getClass().getName()+": "+String.valueOf(e.getMessage());
    }
    static void write(File file,String text) throws IOException {
        Writer w=new OutputStreamWriter(new FileOutputStream(file),"UTF-8");
        try {w.write(text);}finally{w.close();}
    }
    interface Read { Object get() throws Exception; }
    private final Map<String,Object> registry=new LinkedHashMap<String,Object>();
    private final List<Object> coverage=new ArrayList<Object>();
    private void capture(String name,Read read) {
        int before=serializationWarnings;
        nodes=0;
        try {
            Object raw=read.get();
            Object encoded=encode(raw,0,new IdentityHashMap<Object,Boolean>());
            registry.put(name,encoded);
            int count=raw instanceof Map?((Map<?,?>)raw).size():raw instanceof Collection?((Collection<?>)raw).size():raw!=null&&raw.getClass().isArray()?Array.getLength(raw):raw==null?0:1;
            if(raw instanceof Map && ((Map<?,?>)raw).get("recipeCount") instanceof Number)count=((Number)((Map<?,?>)raw).get("recipeCount")).intValue();
            coverage.add(map("registry",name,"status",raw==null?"null":count==0?"empty":"captured","rootEntries",count,"serializationWarnings",serializationWarnings-before));
        }catch(Throwable e){
            coverage.add(map("registry",name,"status","failed","error",error(e)));
        }
    }
    private void method(final String label,final String cls,final String method) {
        capture(label,new Read(){public Object get()throws Exception{return call(clazz(cls),method);}});
    }
    private void fields(final String cls,String... fields) {
        for(final String f:fields) capture(cls+"#"+f,new Read(){public Object get()throws Exception{return field(clazz(cls),f);}});
    }
    private void export() throws Exception {
        directory.mkdirs();
        registry.clear();coverage.clear();
        stackClass=clazz("net.minecraft.item.ItemStack");
        fluidClass=clazz("net.minecraftforge.fluids.FluidStack");
        itemClass=clazz("net.minecraft.item.Item");
        blockClass=clazz("net.minecraft.block.Block");
        recipeClass=clazz("net.minecraft.item.crafting.IRecipe");
        ITEMS.clear();ICON_STACKS.clear();ERRORS.clear();ORE_LISTS.clear(); serializationWarnings=0;
        Map<String,Object> ores=new TreeMap<String,Object>();
        Map<String,Object> oreIds=new TreeMap<String,Object>();
        Class<?> ore=clazz("net.minecraftforge.oredict.OreDictionary");
        String[] names=(String[])call(ore,"getOreNames");
        Arrays.sort(names);
        for(String name:names) {
            nodes=0;
            Object list=call(ore,"getOres",name);
            oreIds.put(String.valueOf(call(ore,"getOreID",name)),name);
            ores.put(name,encode(list,0,new IdentityHashMap<Object,Boolean>()));
            ORE_LISTS.put(list,name);
        }
        capture("minecraft.crafting",new Read(){public Object get()throws Exception{
            return call(call(clazz("net.minecraft.item.crafting.CraftingManager"),"func_77594_a"),"func_77592_b");
        }});
        capture("minecraft.furnace",new Read(){public Object get()throws Exception{
            return call(clazz("net.minecraft.item.crafting.FurnaceRecipes"),"func_77602_a");
        }});
        for(String machine:new String[]{"Furnace","Pulverizer","Sawmill","Smelter","Crucible"})
            method("thermalexpansion."+machine,"thermalexpansion.util.crafting."+machine+"Manager","getRecipeList");
        method("thermalexpansion.TransposerFill","thermalexpansion.util.crafting.TransposerManager","getFillRecipeList");
        method("thermalexpansion.TransposerExtract","thermalexpansion.util.crafting.TransposerManager","getExtractionRecipeList");
        for(String name:new String[]{"SmeltingList","TemperatureList","RenderIndex","AlloyList"})
            method("tconstruct."+name,"tconstruct.library.crafting.Smeltery","get"+name);
        for(final String kind:new String[]{"Table","Basin"}) capture("tconstruct."+kind+"Casting",new Read(){public Object get()throws Exception{
            return call(call(clazz("tconstruct.library.TConstructRegistry"),"get"+kind+"Casting"),"getCastingRecipes");
        }});
        fields("tconstruct.library.crafting.DryingRackRecipes","recipes");
        fields("tconstruct.library.TConstructRegistry","patternPartMapping","toolMaterials","toolMaterialStrings","bowMaterials","arrowMaterials","customMaterials");
        fields("tconstruct.library.crafting.ToolBuilder","instance");
        fields("tconstruct.library.crafting.PatternBuilder","instance");
        method("tconstruct.detailing","tconstruct.library.TConstructRegistry","getChiselDetailing");
        fields("buildcraft.api.recipes.AssemblyRecipe","assemblyRecipes");
        method("buildcraft.refinery","buildcraft.api.recipes.RefineryRecipes","getRecipes");
        fields("vazkii.botania.api.BotaniaAPI","petalRecipes","runeAltarRecipes","manaInfusionRecipes","oreWeights");
        fields("WayofTime.alchemicalWizardry.api.alchemy.AlchemyRecipeRegistry","recipes");
        fields("WayofTime.alchemicalWizardry.api.altarRecipeRegistry.AltarRecipeRegistry","altarRecipes");
        fields("WayofTime.alchemicalWizardry.api.bindingRegistry.BindingRegistry","bindingRecipes");
        fields("WayofTime.alchemicalWizardry.api.summoningRegistry.SummoningRegistry","summoningList");
        fields("micdoodle8.mods.galacticraft.api.recipe.CompressorRecipes","recipes");
        fields("micdoodle8.mods.galacticraft.api.recipe.CircuitFabricatorRecipes","recipes");
        fields("micdoodle8.mods.galacticraft.api.GalacticraftRegistry","rocketBenchT1Recipes","buggyBenchRecipes","rocketBenchT2Recipes","cargoRocketRecipes");
        capture("appeng.grinder",new Read(){public Object get()throws Exception{
            return call(call(clazz("appeng.api.Util"),"getGrinderRecipeManage"),"getRecipes");
        }});
        fields("extrautils.tileentity.enderconstructor.EnderConstructorRecipesHandler","recipes");
        fields("com.mrcrayfish.furniture.api.FurnitureAPI","mineBayRecipes","ovenRecipes","freezerRecipes","printerRecipes");
        fields("com.mrcrayfish.furnitureapi.OvenRecipesAPI","recipeList");
        fields("assets.pamharvestcraft.PamOtherRecipes","combItems","combItemsDamage","combResult1","combResult2");
        fields("calclavia.api.atomicscience.QuantumAssemblerRecipes","RECIPES");
        fields("calclavia.api.resonantinduction.recipe.MachineRecipes","INSTANCE");
        fields("calclavia.lib.prefab.fluid.FluidMixtureRegistry","fluidMergeResults");
        fields("com.pahimar.ee3.recipe.RecipesAludel","aludelRegistry");
        fields("mrtjp.projectred.expansion.FurnaceRecipeLib$","MODULE$");
        fields("powercrystals.minefactoryreloaded.MFRRegistry","_laserOres","_laserPreferredOres","_sludgeDrops","_breederFoods","_plantables","_harvestables","_grindables","_ranchables");
        fields("erogenousbeef.bigreactors.common.BRRegistry","_reactorFluidToSolid","_reactorSolidToFuel","_reactorSolidToWaste","_reactorFluids");
        method("forge.fluidContainers","net.minecraftforge.fluids.FluidContainerRegistry","getRegisteredFluidContainerData");
        method("forge.fluids","net.minecraftforge.fluids.FluidRegistry","getRegisteredFluids");
        method("forge.fluidIDs","net.minecraftforge.fluids.FluidRegistry","getRegisteredFluidIDs");
        capture("forge.fluidDisplay",new Read(){public Object get()throws Exception{
            List<Object> records=new ArrayList<Object>();
            Map<?,?> fluids=(Map<?,?>)call(clazz("net.minecraftforge.fluids.FluidRegistry"),"getRegisteredFluids");
            for(Object fluid:fluids.values()) {
                Map<String,Object> display=map("id",call(fluid,"getID"),"name",call(fluid,"getName"));
                try{display.put("displayName",call(fluid,"getLocalizedName"));}catch(Throwable ignored){}
                try{display.put("color",call(fluid,"getColor"));}catch(Throwable ignored){}
                try {
                    Object icon=call(fluid,"getStillIcon");
                    if(icon!=null)display.put("textureName",call(icon,"func_94215_i"));
                }catch(Throwable e){display.put("textureError",error(e));}
                records.add(display);
            }
            return records;
        }});
        fields("logisticspipes.recipes.SolderingStationRecipes","recipes");
        fields("atomicscience.AtomicScience","itemCell","itemFissileFuel","itemBreedingRod","itemDarkMatter","itemAntimatter","itemDeuteriumCell","itemWaterCell","itemYellowCake","itemUranium","FLUIDSTACK_WATER","FLUIDSTACK_HE","FLUIDSTACK_ZHENG","FLUIDSTACK_DEUTERIUM","FLUIDSTACK_ZANG_SHUI");
        fields("atomicscience.Settings","HE_QI_RATIO","DEUTERIUM_RATIO","STEAM_MULTIPLIER","ALLOW_OREDICT");
        fields("thermalexpansion.block.dynamo.TileDynamoCompression","fuels","coolants");
        fields("thermalexpansion.block.dynamo.TileDynamoMagmatic","fuels");
        fields("thermalexpansion.block.dynamo.TileDynamoReactant","fuels");
        fields("buildcraft.api.fuels.IronEngineFuel","fuels");
        capture("fml.loadedMods",new Read(){public Object get()throws Exception{
            List<Object> mods=new ArrayList<Object>();
            for(cpw.mods.fml.common.ModContainer mod:cpw.mods.fml.common.Loader.instance().getActiveModList())
                mods.add(map("id",mod.getModId(),"name",mod.getName(),"version",mod.getVersion(),"source",mod.getSource()==null?null:mod.getSource().getName()));
            return mods;
        }});
        // NEI's independent handler copies provide display recipes for procedural handlers.
        captureNEI();
        additionalRoots();
        capture("forge.itemOwners",new Read(){public Object get()throws Exception{return field(clazz("cpw.mods.fml.common.registry.GameData"),"idMap");}});
        capture("forgemultipart.materials",new Read(){public Object get()throws Exception{
            List<Object> records=new ArrayList<Object>();
            Object materials=call(clazz("codechicken.microblock.MicroMaterialRegistry"),"getIdMap");
            for(int i=0;i<Array.getLength(materials);i++) {
                Object pair=Array.get(materials,i),material=call(pair,"_2");
                records.add(map("name",call(pair,"_1"),"item",call(material,"getItem"),"cuttingStrength",call(material,"getCutterStrength")));
            }
            return records;
        }});
        method("forgemultipart.maxCuttingStrength","codechicken.microblock.MicroMaterialRegistry","getMaxCuttingStrength");
        capture("forgemultipart.saws",new Read(){public Object get()throws Exception{
            List<Object> records=new ArrayList<Object>();
            Class<?> saw=clazz("codechicken.microblock.Saw");
            Object[] items=(Object[])field(itemClass,"field_77698_e");
            Constructor<?> ctor=stackClass.getConstructor(int.class,int.class,int.class);
            for(int i=0;i<items.length;i++)if(saw.isInstance(items[i])) {
                Object stack=ctor.newInstance(i,1,0);
                records.add(map("item",stack,"cuttingStrength",call(items[i],"getCuttingStrength",call(stack,"func_77946_l")),"maxDamage",call(items[i],"func_77612_l")));
            }
            return records;
        }});
        captureItems();
        Map<String,Object> result=map("format","techit-runtime-registry-v1","exporterVersion","0.2.0","minecraft","1.6.4","timestamp",new Date().toString(),"oreDictionary",ores,"oreDictionaryIds",oreIds,"registries",registry,"items",ITEMS,"coverage",coverage,"errors",ERRORS,"serializationWarnings",serializationWarnings);
        String stamp=new java.text.SimpleDateFormat("yyyyMMdd-HHmmss").format(new Date());
        File output=new File(directory,"recipes-"+stamp+".json");
        write(output,JSON.toJson(result));
        write(new File(directory,"LATEST.txt"),output.getAbsolutePath()+"\n");
        System.out.println("[TechIt Recipe Export] Wrote "+output.getAbsolutePath()+"; inspect coverage before importing.");
        try{iconExporter=new IconExporter(directory,output.getName(),ICON_STACKS);}
        catch(Throwable e){write(new File(directory,"ICONS_FAILED.txt"),error(e));}
    }
    // Extra read roots can be added after static review without reloading mod code.
    // Each path contains fields only: no method calls, constructors, or assignments.
    private void additionalRoots() {
        File specs=new File(directory,"additional-roots.json");
        if(!specs.isFile())return;
        try {
            Reader reader=new InputStreamReader(new FileInputStream(specs),"UTF-8");
            JsonArray roots;
            try{roots=new JsonParser().parse(reader).getAsJsonArray();}finally{reader.close();}
            for(JsonElement element:roots) {
                final JsonObject spec=element.getAsJsonObject();
                final String label=spec.get("label").getAsString();
                capture("additional."+label,new Read(){public Object get()throws Exception{
                    Object value=clazz(spec.get("class").getAsString());
                    for(JsonElement part:spec.getAsJsonArray("fields"))value=field(value,part.getAsString());
                    if(value instanceof Class)throw new IOException("A field path is required");
                    return value;
                }});
            }
        }catch(Throwable e){ERRORS.add(map("where","additional-roots.json","error",error(e)));}
    }
    private void captureNEI() {
        try {
            Object list=field(clazz("codechicken.nei.recipe.GuiCraftingRecipe"),"craftinghandlers");
            for(final Object handler:new ArrayList<Object>((Collection<?>)list)) {
                final String name=handler.getClass().getName();
                if(name.equals("me.heldplayer.plugins.nei.mystcraft.client.WritingDeskRecipeHandler")) {
                    coverage.add(map("registry","nei."+name,"status","requires-adapter","reason","Procedural symbol-copying display traverses unrelated symbol/world data; needs a dedicated rule adapter"));
                    continue;
                }
                Set<String> identifiers=new LinkedHashSet<String>();
                for(String getter:new String[]{"getRecipeId","getRecipeIdent","getOverlayIdentifier"}) {
                    try{Object id=call(handler,getter);if(id instanceof String&&((String)id).length()>0)identifiers.add((String)id);}catch(Exception ignored){}
                }
                String known=NEI_IDS.getProperty(name,"");
                if(known.length()>0)identifiers.addAll(Arrays.asList(known.split(",")));
                identifiers.remove("item");identifiers.remove("liquid");
                if(identifiers.isEmpty())coverage.add(map("registry","nei."+name,"status","requires-adapter","reason","No enumeration identifier; output-by-output inspection required"));
                for(final String overlay:identifiers)capture("nei."+name+"#"+overlay,new Read(){public Object get()throws Exception{
                    Object copy=call(handler,"getRecipeHandler",overlay,new Object[0]);
                    Object cache=field(copy,"arecipes");
                    int count=((Collection<?>)cache).size();
                    // Preserve CachedRecipe fields: positioned alternatives, fluids, energies, chances.
                    return map("overlay",overlay,"displayName",call(copy,"getRecipeName"),"recipeCount",count,"cachedRecipes",cache);
                }});
            }
        }catch(Throwable e){ERRORS.add(map("where","NEI enumeration","error",error(e)));}
    }
    private void captureItems() {
        try {
            // NEI contains actual subtype/NBT variants; supplement every registered item at meta 0.
            Object list=field(clazz("codechicken.nei.ItemList"),"items");
        if(list instanceof Collection)for(Object s:new ArrayList<Object>((Collection<?>)list)){nodes=0;stack(s);}
        }catch(Throwable e){ERRORS.add(map("where","NEI item list","error",error(e)));}
        try {
            Object[] items=(Object[])field(clazz("net.minecraft.item.Item"),"field_77698_e");
            Constructor<?> ctor=stackClass.getConstructor(int.class,int.class,int.class);
            for(int i=0;i<items.length;i++)if(items[i]!=null) {
                try{nodes=0;stack(ctor.newInstance(i,1,0));}catch(Throwable e){ERRORS.add(map("where","item "+i,"error",error(e)));}
                try {
                    List<Object> variants=new ArrayList<Object>();
                    Object tab=call(items[i],"func_77640_w");
                    call(items[i],"func_77633_a",i,tab,variants);
                    for(Object variant:variants){nodes=0;stack(variant);}
                }catch(Throwable e){ERRORS.add(map("where","subtypes "+i,"error",error(e)));}
            }
        }catch(Throwable e){ERRORS.add(map("where","item registry","error",error(e)));}
    }
    static Object stack(Object s)throws Exception {
        if(s==null)return null;
        int id=((Number)field(s,"field_77993_c")).intValue();
        int amount=((Number)field(s,"field_77994_a")).intValue();
        int meta=((Number)call(s,"func_77960_j")).intValue();
        Object tag=field(s,"field_77990_d");
        Object nbt=tag==null?null:encode(tag,0,new IdentityHashMap<Object,Boolean>());
        Map<String,Object> result=map("kind","item","id",id,"meta",meta,"count",amount,"nbt",nbt);
        String key=id+":"+meta+(nbt==null?"":"|"+JSON.toJson(nbt));
        if(!ITEMS.containsKey(key)) {
            Map<String,Object> item=map("id",id,"meta",meta,"nbt",nbt);
            ITEMS.put(key,item);
            try{item.put("name",call(s,"func_82833_r"));}catch(Throwable e){item.put("nameError",error(e));}
            try{item.put("unlocalized",call(s,"func_77977_a"));}catch(Throwable e){item.put("unlocalizedError",error(e));}
            try{
                Object obj=call(s,"func_77973_b");
                item.put("itemClass",obj.getClass().getName());
                if(containerDepth==0) {
                    containerDepth++;
                    try{item.put("containerItem",encode(call(obj,"getContainerItemStack",call(s,"func_77946_l")),0,new IdentityHashMap<Object,Boolean>()));}
                    finally{containerDepth--;}
                }
            }catch(Throwable e){item.put("containerError",error(e));}
            if(meta!=32767 && meta>=0) {
                String display=String.valueOf(item.get("name"));
                if(!java.util.regex.Pattern.compile("\\bnull\\b",java.util.regex.Pattern.CASE_INSENSITIVE).matcher(display).find()) {
                    try{ICON_STACKS.put(key,call(s,"func_77946_l"));}catch(Throwable ignored){}
                }
                try {
                    Object obj=call(s,"func_77973_b");
                    Object copy=call(s,"func_77946_l");
                    List<Object> icons=new ArrayList<Object>();
                    int passes=1;
                    try{passes=((Number)call(obj,"getRenderPasses",meta)).intValue();}catch(Exception ignored){}
                    for(int pass=0;pass<Math.min(passes,16);pass++) {
                        Object icon;
                        try{icon=call(obj,"getIcon",copy,pass);}catch(NoSuchMethodException e){icon=call(copy,"func_77954_c");}
                        if(icon==null)continue;
                        Object tint=16777215;
                        try{tint=call(obj,"func_82790_a",copy,pass);}catch(Exception ignored){}
                        icons.add(map("name",call(icon,"func_94215_i"),"pass",pass,"tint",tint,"sheet",call(copy,"func_94608_d")));
                    }
                    item.put("textureLayers",icons);
                    item.put("textureNote","Source textures; custom renderers and 3D block models can differ from this preview.");
                }catch(Throwable e){item.put("textureError",error(e));}
            }
        }
        return result;
    }
    static Object encode(Object value,int depth,IdentityHashMap<Object,Boolean> path)throws Exception {
        if(++nodes>300000){serializationWarnings++;return map("unresolved","registry node limit");}
        if(value==null || value instanceof String || value instanceof Number || value instanceof Boolean)return value;
        if(value instanceof Character || value instanceof Enum)return String.valueOf(value);
        if(value instanceof Class)return map("className",((Class<?>)value).getName());
        if(stackClass!=null&&stackClass.isInstance(value))return stack(value);
        if(itemClass!=null&&itemClass.isInstance(value))return map("kind","itemType","id",field(value,"field_77779_bT"),"class",value.getClass().getName());
        if(blockClass!=null&&blockClass.isInstance(value))return map("kind","blockType","id",field(value,"field_71990_ca"),"class",value.getClass().getName());
        if(depth>22){serializationWarnings++;return map("unresolved","depth limit","class",value.getClass().getName());}
        if(path.containsKey(value)){serializationWarnings++;return map("unresolved","cycle","class",value.getClass().getName());}
        if(ORE_LISTS.containsKey(value))return map("kind","ore","name",ORE_LISTS.get(value));
        path.put(value,true);
        try {
            if(fluidClass!=null&&fluidClass.isInstance(value))return map("kind","fluid","id",field(value,"fluidID"),"amount",field(value,"amount"),"nbt",encode(field(value,"tag"),depth+1,path));
            if(value instanceof Map){
                List<Object> entries=new ArrayList<Object>();
                for(Map.Entry<?,?> e:((Map<?,?>)value).entrySet())entries.add(map("key",encode(e.getKey(),depth+1,path),"value",encode(e.getValue(),depth+1,path)));
                return map("kind","map","entries",entries);
            }
            if(value instanceof Collection){
                List<Object> result=new ArrayList<Object>();
                for(Object v:(Collection<?>)value)result.add(encode(v,depth+1,path));return result;
            }
            if(value.getClass().isArray()){
                List<Object> result=new ArrayList<Object>();
                for(int i=0;i<Array.getLength(value);i++)result.add(encode(Array.get(value,i),depth+1,path));return result;
            }
            if(value.getClass().getName().startsWith("scala.collection.")){
                List<Object> result=new ArrayList<Object>();Object iterator=call(value,"iterator");
                while(Boolean.TRUE.equals(call(iterator,"hasNext")))result.add(encode(call(iterator,"next"),depth+1,path));return result;
            }
            String cls=value.getClass().getName();
            if(cls.startsWith("java.")||cls.startsWith("sun.")||cls.startsWith("net.minecraft.world.")||cls.startsWith("net.minecraft.client.renderer.")) {
                serializationWarnings++;return map("unresolved","unsupported object","class",cls);
            }
            Map<String,Object> fields=new TreeMap<String,Object>();
            for(Class<?> k=value.getClass();k!=null&&k!=Object.class;k=k.getSuperclass()) {
                for(Field f:k.getDeclaredFields()) {
                    if(Modifier.isStatic(f.getModifiers())||f.isSynthetic()||f.getName().startsWith("this$"))continue;
                    String key=MAP.getProperty("fieldName."+k.getName()+"."+f.getName(),f.getName());
                    if(fields.containsKey(key))key=k.getName()+"."+key;
                    try{f.setAccessible(true);fields.put(key,encode(f.get(value),depth+1,path));}
                    catch(Throwable e){serializationWarnings++;fields.put(key,map("unresolved",error(e)));}
                }
            }
            Map<String,Object> result=map("class",MAP.getProperty("className."+cls,cls),"fields",fields);
            if(recipeClass!=null&&recipeClass.isInstance(value)) {
                try{result.put("recipeOutput",stack(call(value,"func_77571_b")));}
                catch(Throwable e){result.put("outputError",error(e));serializationWarnings++;}
            }
            return result;
        }finally{path.remove(value);}
    }
}
