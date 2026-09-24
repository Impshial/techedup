package techit.buildlist;

import java.util.List;
import net.minecraft.client.Minecraft;
import net.minecraft.item.ItemStack;
import tconstruct.client.tabs.AbstractTab;
import tconstruct.client.tabs.TabRegistry;

/** Uses the installed TConstruct/Galacticraft inventory-tab API without replacing its tabs. */
public final class BuildListTabs extends AbstractTab {
    private BuildListTabs(){super(0,0,0,new ItemStack(340,1,0));}
    static void register(){TabRegistry.registerTab(new BuildListTabs());}
    static void attach(List buttons,int x,int y){TabRegistry.updateTabValues(x,y,BuildListTabs.class);TabRegistry.addTabsToList(buttons);}
    static void inventory(){TabRegistry.openInventoryGui();}
    public boolean shouldAddToList(){return true;}
    public void onTabClicked(){Minecraft.func_71410_x().func_71373_a(new BuildListScreen(BuildListMod.store));}
    @Override public void func_73737_a(Minecraft mc,int mouseX,int mouseY) {
        super.func_73737_a(mc,mouseX,mouseY);
        if(mouseX>=field_73746_c&&mouseX<field_73746_c+28&&mouseY>=field_73743_d&&mouseY<field_73743_d+28) {
            func_73734_a(mouseX+8,mouseY-12,mouseX+70,mouseY,0xEE172333);
            func_73731_b(mc.field_71466_p,"Build List",mouseX+11,mouseY-10,0xFFFFFF);
        }
    }
}
