package techit.buildlist;

import java.util.List;
import net.minecraft.client.Minecraft;
import net.minecraft.util.ResourceLocation;
import org.lwjgl.opengl.GL11;
import tconstruct.client.tabs.AbstractTab;
import tconstruct.client.tabs.TabRegistry;

/** Uses the installed TConstruct/Galacticraft inventory-tab API without replacing its tabs. */
public final class BuildListTabs extends AbstractTab {
    private static final ResourceLocation TEXTURE=new ResourceLocation("textures/gui/container/creative_inventory/tabs.png");
    private BuildListTabs(){super(0,0,0,null);}
    static void register(){TabRegistry.registerTab(new BuildListTabs());}
    static void attach(List buttons,int x,int y){TabRegistry.updateTabValues(x,y,BuildListTabs.class);TabRegistry.addTabsToList(buttons);}
    static void inventory(){TabRegistry.openInventoryGui();}
    public boolean shouldAddToList(){return true;}
    public void onTabClicked(){BuildListClient.calculator();}
    @Override public void func_73737_a(Minecraft mc,int mouseX,int mouseY) {
        if(!field_73748_h)return;
        GL11.glColor4f(1,1,1,1);
        mc.func_110434_K().func_110577_a(TEXTURE);
        func_73729_b(field_73746_c,field_73743_d,field_73741_f==2?0:28,field_73742_g?0:32,28,field_73742_g?28:32);
        BuildListIcons.checkmark(field_73746_c+8,field_73743_d+12,1);
        if(mouseX>=field_73746_c&&mouseX<field_73746_c+28&&mouseY>=field_73743_d&&mouseY<field_73743_d+28) {
            func_73734_a(mouseX+8,mouseY-12,mouseX+70,mouseY,0xEE172333);
            func_73731_b(mc.field_71466_p,"Build List",mouseX+11,mouseY-10,0xFFFFFF);
        }
    }
}
