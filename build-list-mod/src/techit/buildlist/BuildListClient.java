package techit.buildlist;

import cpw.mods.fml.client.registry.KeyBindingRegistry;
import cpw.mods.fml.common.TickType;
import cpw.mods.fml.common.registry.TickRegistry;
import cpw.mods.fml.relauncher.Side;
import java.util.EnumSet;
import net.minecraft.client.Minecraft;
import net.minecraft.client.settings.KeyBinding;
import net.minecraftforge.common.MinecraftForge;
import org.lwjgl.input.Keyboard;

public final class BuildListClient extends KeyBindingRegistry.KeyHandler {
    static boolean tabsAvailable;
    private static BuildListSession session;
    private static BuildListHud hud;
    private boolean toggleOnRelease;
    private BuildListClient(){super(new KeyBinding[]{new KeyBinding("TechIt checklist",Keyboard.KEY_I)},new boolean[]{false});}
    public static void initialize(){
        session=new BuildListSession(BuildListMod.store);
        BuildListClient handler=new BuildListClient();
        KeyBindingRegistry.registerKeyBinding(handler);
        hud=new BuildListHud(session,handler.getKeyBindings()[0]);
        MinecraftForge.EVENT_BUS.register(hud);
        TickRegistry.registerTickHandler(hud,Side.CLIENT);
        try {Class.forName("tconstruct.client.tabs.TabRegistry");BuildListTabs.register();tabsAvailable=true;}
        catch(ClassNotFoundException e){BuildListMod.logger.info("Inventory tabs unavailable; use the build-list key.");}
        catch(LinkageError e){BuildListMod.logger.warning("Inventory tab integration unavailable: "+e);}
    }
    static void calculator(){Minecraft.func_71410_x().func_71373_a(new BuildListScreen(session));}
    static void addTabs(java.util.List buttons,int x,int y){if(tabsAvailable)BuildListTabs.attach(buttons,x,y);}
    static void inventory(){
        if(tabsAvailable)BuildListTabs.inventory();
        else {Minecraft mc=Minecraft.func_71410_x();mc.func_71373_a(new net.minecraft.client.gui.inventory.GuiInventory(mc.field_71439_g));}
    }
    public String getLabel(){return "TechIt build lists";}
    public EnumSet<TickType> ticks(){return EnumSet.of(TickType.CLIENT);}
    public void keyDown(EnumSet<TickType> types,KeyBinding key,boolean tickEnd,boolean repeats){
        if(!tickEnd)return;
        Minecraft mc=Minecraft.func_71410_x();
        toggleOnRelease=mc.field_71439_g!=null&&(mc.field_71462_r==null||mc.field_71462_r instanceof BuildListPopup);
    }
    public void keyUp(EnumSet<TickType> types,KeyBinding key,boolean tickEnd) {
        if(!tickEnd)return;
        if(!toggleOnRelease)return;
        toggleOnRelease=false;
        hud.hotkey();
    }
}
