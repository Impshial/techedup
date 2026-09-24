package techit.buildlist;

import com.google.gson.*;
import net.minecraft.nbt.*;
import java.util.Map;

/** Restore the exporter's typed NBT without converting longs through floating point. */
public final class TypedNbt {
    public static NBTTagCompound parse(String json) {
        return compound("",new JsonParser().parse(json).getAsJsonObject(),0);
    }
    private static NBTTagCompound compound(String name,JsonObject object,int depth) {
        if(depth>32)throw new IllegalArgumentException("NBT nesting is too deep");
        NBTTagCompound result=new NBTTagCompound(name);
        for(Map.Entry<String,JsonElement> entry:object.entrySet())result.func_74782_a(entry.getKey(),tag(entry.getKey(),entry.getValue().getAsJsonObject(),depth+1));
        return result;
    }
    private static NBTBase tag(String name,JsonObject object,int depth) {
        if(depth>32)throw new IllegalArgumentException("NBT nesting is too deep");
        if(!object.has("type")||!object.get("type").isJsonPrimitive())return compound(name,object,depth);
        String type=object.get("type").getAsString();
        if(type.equals("NBTTagList")) {
            NBTTagList list=new NBTTagList(name);byte elementType=0;
            for(JsonElement value:object.getAsJsonArray("value")) {
                NBTBase member=tag("",value.getAsJsonObject(),depth+1);
                if(elementType!=0&&elementType!=member.func_74732_a())throw new IllegalArgumentException("Mixed NBT list types");
                elementType=member.func_74732_a();list.func_74742_a(member);
            }return list;
        }
        JsonObject value=object.getAsJsonObject("value");
        if(type.equals("NBTTagByte"))return new NBTTagByte(name,value.get("field_74756_a").getAsByte());
        if(type.equals("NBTTagShort"))return new NBTTagShort(name,value.get("field_74752_a").getAsShort());
        if(type.equals("NBTTagInt"))return new NBTTagInt(name,value.get("field_74748_a").getAsInt());
        if(type.equals("NBTTagLong"))return new NBTTagLong(name,value.get("field_74753_a").getAsBigDecimal().longValueExact());
        if(type.equals("NBTTagFloat"))return new NBTTagFloat(name,value.get("field_74750_a").getAsFloat());
        if(type.equals("NBTTagDouble"))return new NBTTagDouble(name,value.get("field_74755_a").getAsDouble());
        if(type.equals("NBTTagString"))return new NBTTagString(name,value.get("field_74751_a").getAsString());
        if(type.equals("NBTTagByteArray")) {
            JsonArray a=value.getAsJsonArray("field_74754_a");byte[] bytes=new byte[a.size()];for(int i=0;i<bytes.length;i++)bytes[i]=a.get(i).getAsByte();return new NBTTagByteArray(name,bytes);
        }
        if(type.equals("NBTTagIntArray")) {
            JsonArray a=value.getAsJsonArray("field_74749_a");int[] ints=new int[a.size()];for(int i=0;i<ints.length;i++)ints[i]=a.get(i).getAsInt();return new NBTTagIntArray(name,ints);
        }
        throw new IllegalArgumentException("Unsupported NBT type: "+type);
    }
}
