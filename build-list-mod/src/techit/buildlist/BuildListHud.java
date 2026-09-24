package techit.buildlist;

import cpw.mods.fml.common.ITickHandler;
import cpw.mods.fml.common.TickType;
import java.util.EnumSet;
import net.minecraft.client.Minecraft;
import net.minecraft.client.settings.GameSettings;
import net.minecraft.client.settings.KeyBinding;
import net.minecraftforge.client.event.RenderGameOverlayEvent;
import net.minecraftforge.event.ForgeSubscribe;
import org.lwjgl.opengl.GL11;

/** Passive HUD rendering never opens a screen or consumes gameplay input. */
public final class BuildListHud implements ITickHandler,BuildListPopup.Controller {
    private final BuildListHudState state=new BuildListHudState();
    private final BuildListSession session;
    private final BuildListPopup popup;
    private final KeyBinding key;

    BuildListHud(BuildListSession session,KeyBinding key) {
        this.session=session;this.key=key;popup=new BuildListPopup(session,this);
    }
    private boolean inWorld(Minecraft mc){return mc.field_71439_g!=null&&mc.field_71441_e!=null;}
    void hotkey() {
        Minecraft mc=Minecraft.func_71410_x();
        if(!inWorld(mc)||(mc.field_71462_r!=null&&mc.field_71462_r!=popup))return;
        if(!state.visible()){session.chooseOnlyList();popup.refreshLists();}
        state.hotkey(true,false);
        if(state.cursor())mc.func_71373_a(popup);
        else if(mc.field_71462_r==popup)mc.func_71373_a(null);
    }
    public void resumeGame(){state.resumeGame();closeCursor();}
    public void hide(){state.hide();closeCursor();}
    public void closed(){state.resumeGame();}
    private void closeCursor() {
        Minecraft mc=Minecraft.func_71410_x();
        if(mc.field_71462_r==popup)mc.func_71373_a(null);
    }
    @ForgeSubscribe public void render(RenderGameOverlayEvent.Post event) {
        if(event.type!=RenderGameOverlayEvent.ElementType.ALL)return;
        Minecraft mc=Minecraft.func_71410_x();
        if(!state.draw(inWorld(mc),mc.field_71462_r!=null,mc.field_71474_y.field_74319_N))return;
        // Item rendering changes GL state. Leave the rest of the HUD exactly as found.
        int matrixMode=GL11.glGetInteger(GL11.GL_MATRIX_MODE);
        GL11.glPushAttrib(GL11.GL_ALL_ATTRIB_BITS);
        GL11.glMatrixMode(GL11.GL_MODELVIEW);GL11.glPushMatrix();
        try {
            GL11.glDisable(GL11.GL_DEPTH_TEST);GL11.glDisable(GL11.GL_LIGHTING);
            GL11.glEnable(GL11.GL_BLEND);GL11.glBlendFunc(GL11.GL_SRC_ALPHA,GL11.GL_ONE_MINUS_SRC_ALPHA);
            GL11.glColor4f(1,1,1,1);
            popup.drawHud(mc,event.resolution,event.partialTicks,GameSettings.func_74298_c(key.field_74512_d));
        } finally {
            GL11.glMatrixMode(GL11.GL_MODELVIEW);GL11.glPopMatrix();
            GL11.glPopAttrib();GL11.glMatrixMode(matrixMode);
        }
    }
    public String getLabel(){return "TechIt checklist HUD";}
    public EnumSet<TickType> ticks(){return EnumSet.of(TickType.CLIENT);}
    public void tickStart(EnumSet<TickType> types,Object... data){}
    public void tickEnd(EnumSet<TickType> types,Object... data) {
        Minecraft mc=Minecraft.func_71410_x();
        if(!inWorld(mc)){state.hide();return;}
        // Minecraft updates the popup itself only while its cursor screen is open.
        if(state.visible()&&mc.field_71462_r!=popup)popup.func_73876_c();
    }
}
