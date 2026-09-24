package techit.buildlist;

import java.util.*;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Gui;
import net.minecraft.client.renderer.RenderHelper;
import net.minecraft.client.renderer.entity.RenderItem;
import net.minecraft.client.renderer.texture.TextureMap;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraftforge.fluids.*;
import org.lwjgl.opengl.GL11;

/** Shared item/NBT and fluid rendering for both checklist views. */
final class BuildListIcons extends Gui {
    private final RenderItem renderer=new RenderItem();
    private final Map<String,ItemStack> icons=new HashMap<String,ItemStack>();
    private final Set<String> badIcons=new HashSet<String>();
    void clear(){icons.clear();badIcons.clear();}
    boolean failed(BuildListStore.Row row){return badIcons.contains(row.key);}
    ItemStack stack(BuildListStore.Row row) {
        if(!row.kind.equals("item"))return null;
        if(icons.containsKey(row.key))return icons.get(row.key);
        ItemStack stack=null;
        try {
            if(row.itemId>0&&row.itemId<Item.field_77698_e.length&&Item.field_77698_e[row.itemId]!=null) {
                stack=new ItemStack(row.itemId,1,row.metadata);
                if(row.nbt!=null)stack.field_77990_d=TypedNbt.parse(row.nbt);
            }
        }catch(Exception e){badIcons.add(row.key);BuildListMod.logger.warning("Item icon "+row.ref+": "+e.getMessage());}
        icons.put(row.key,stack);return stack;
    }
    void draw(Minecraft mc,BuildListStore.Row row,int x,int y) {
        ItemStack item=stack(row);
        GL11.glPushAttrib(GL11.GL_ALL_ATTRIB_BITS);GL11.glPushMatrix();
        try {
            if(item!=null&&!failed(row)) {
                RenderHelper.func_74520_c();
                renderer.func_82406_b(mc.field_71466_p,mc.func_110434_K(),item.func_77946_l(),x,y);
            } else if(row.kind.equals("fluid")&&!failed(row)) {
                Fluid fluid=row.fluidName==null?FluidRegistry.getFluid(row.fluidId):FluidRegistry.getFluid(row.fluidName);
                if(fluid!=null&&fluid.getIcon()!=null) {
                    mc.func_110434_K().func_110577_a(TextureMap.field_110575_b);
                    int color=fluid.getColor();GL11.glColor4f((color>>16&255)/255f,(color>>8&255)/255f,(color&255)/255f,1);
                    func_94065_a(x,y,fluid.getIcon(),16,16);
                } else func_73731_b(mc.field_71466_p,"?",x+5,y+4,0xABBAD0);
            } else func_73731_b(mc.field_71466_p,"?",x+5,y+4,0xABBAD0);
        } catch(Throwable e) {
            badIcons.add(row.key);BuildListMod.logger.warning("Item renderer "+row.ref+": "+e.getClass().getSimpleName());
        } finally {GL11.glPopMatrix();GL11.glPopAttrib();RenderHelper.func_74518_a();GL11.glColor4f(1,1,1,1);}
    }
    static void checkmark(int x,int y,int scale) {
        // Bold pixel check, independent of fonts, texture packs and item IDs.
        for(int i=0;i<4;i++)func_73734_a(x+i*scale,y+(4+i)*scale,x+(i+2)*scale,y+(6+i)*scale,0xFF146B2F);
        for(int i=0;i<8;i++)func_73734_a(x+(3+i)*scale,y+(7-i)*scale,x+(5+i)*scale,y+(9-i)*scale,0xFF146B2F);
        for(int i=0;i<4;i++)func_73734_a(x+i*scale,y+(3+i)*scale,x+(i+2)*scale,y+(5+i)*scale,0xFF51E56E);
        for(int i=0;i<8;i++)func_73734_a(x+(3+i)*scale,y+(6-i)*scale,x+(5+i)*scale,y+(8-i)*scale,0xFF51E56E);
    }
}
