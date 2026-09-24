package techit.buildlist;

import java.io.File;
import java.util.HashSet;
import java.util.Set;
import net.minecraft.client.gui.GuiButton;
import org.lwjgl.input.Keyboard;

/** Exercises HUD/cursor transitions and the real popup's exit actions without GL. */
final class HudTest {
    private static final class Controls implements BuildListPopup.Controller {
        final BuildListHudState state=new BuildListHudState();
        int resumes,hides;
        public void resumeGame(){resumes++;state.resumeGame();}
        public void hide(){hides++;state.hide();}
        public void closed(){state.resumeGame();}
    }
    static void run(BuildListSession session,File file)throws Exception {
        Controls controls=new Controls();BuildListHudState state=controls.state;
        BuildListTest.check(!state.visible(),"HUD starts hidden");
        state.hotkey(false,false);state.hotkey(true,true);
        BuildListTest.check(!state.visible(),"menus and typing in another screen do not open the HUD");
        state.hotkey(true,false);
        BuildListTest.check(state.draw(true,false,false)&&!state.cursor(),"first press shows the HUD without requesting a cursor screen");
        BuildListTest.check(!state.draw(false,false,false)&&!state.draw(true,true,false)&&!state.draw(true,false,true),"HUD stays out of menus, other screens and F1 screenshots");
        state.hotkey(true,true);
        BuildListTest.check(!state.cursor(),"the key cannot steal focus from inventory or chat");
        state.hotkey(true,false);
        BuildListTest.check(state.cursor(),"second press deliberately enters cursor mode");

        session.open(file);
        BuildListPopup popup=new BuildListPopup(session,controls);
        popup.field_73880_f=427;popup.field_73881_g=240;popup.func_73866_w_();
        Set<String> before=new HashSet<String>(session.build.checked);
        popup.func_73869_a('w',Keyboard.KEY_W);
        popup.func_73875_a(new GuiButton(7,0,0,""));
        popup.func_73869_a((char)0,Keyboard.KEY_ESCAPE);
        BuildListTest.check(controls.resumes==0&&state.cursor(),"Escape closes the list dropdown before leaving cursor mode");
        popup.func_73869_a((char)0,Keyboard.KEY_ESCAPE);
        BuildListTest.check(controls.resumes==1&&state.visible()&&!state.cursor(),"Escape returns to gameplay and leaves the HUD visible");
        BuildListTest.check(before.equals(session.build.checked),"mode switching does not change material progress");

        state.hotkey(true,false);
        popup.func_73875_a(new GuiButton(1,0,0,""));popup.func_73866_w_();
        BuildListTest.check(controls.resumes==2&&state.draw(true,false,false)&&!state.cursor(),"minimize immediately resumes gameplay with the HUD badge");
        state.hotkey(true,false);
        popup.func_73875_a(new GuiButton(3,0,0,""));popup.func_73866_w_();
        BuildListTest.check(state.cursor(),"restoring the badge keeps deliberate cursor access to the list");
        state.hotkey(true,false);popup.func_73874_b();
        BuildListTest.check(state.visible()&&!state.cursor(),"the bound key returns to gameplay without hiding the list");
        state.hotkey(true,false);popup.func_73874_b();
        BuildListTest.check(state.visible()&&!state.cursor(),"opening another screen relinquishes cursor mode but remembers the HUD");
        state.hotkey(true,false);popup.func_73875_a(new GuiButton(2,0,0,""));popup.func_73874_b();
        BuildListTest.check(controls.hides==1&&!state.visible(),"closing with x stays hidden after the screen-close callback");
        state.hotkey(true,false);
        BuildListTest.check(state.draw(true,false,false)&&!state.cursor(),"reopening after x starts in gameplay mode again");
        Class.forName("techit.buildlist.BuildListHud",false,HudTest.class.getClassLoader());
        System.out.println("PASS: passive HUD, explicit cursor mode, dropdown Escape, minimize, close, screen changes and input-state guards.");
    }
}
