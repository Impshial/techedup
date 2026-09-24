package techit.buildlist;

import java.io.File;
import java.lang.reflect.Field;
import java.util.*;
import net.minecraft.client.gui.GuiButton;
import net.minecraft.client.gui.GuiScreen;

/** Tests real popup controls and actions without drawing or opening a game window. */
final class PopupTest {
    static void run(BuildListSession session,File first,File second)throws Exception {
        session.open(first);session.store.setCompleted(session.build,false);
        BuildListPopup popup=new BuildListPopup(session);
        popup.field_73880_f=427;popup.field_73881_g=240;popup.func_73866_w_();
        BuildListTest.check(popup.rows()==session.build.materials,"popup starts with material totals");
        checkButtons(popup,6);
        popup.toggleRow(0);
        Set<String> checked=new HashSet<String>(session.build.checked);
        BuildListTest.check(checked.contains(session.build.materials.get(0).key),"material rows still check off");
        popup.func_73875_a(button(popup,6));popup.func_73866_w_();
        BuildListTest.check(popup.rows()==session.build.plans,"To Build shows the actual planned targets and counts");
        popup.toggleRow(0);
        BuildListTest.check(checked.equals(session.build.checked),"To Build cannot modify material or target checkboxes");
        popup.func_73875_a(button(popup,7));
        ChecklistLayout layout=new ChecklistLayout(popup.field_73880_f,popup.field_73881_g);
        popup.func_73864_a(layout.left+12,layout.top+75+20+5,0);
        BuildListTest.check(session.selected.equals(second)&&popup.rows()==session.build.plans,"dropdown selection changes the shared list and preserves To Build mode");
        popup.func_73875_a(button(popup,1));popup.func_73866_w_();
        checkButtons(popup,2);
        BuildListTest.check(button(popup,3)!=null&&button(popup,2)!=null,"minimized popup exposes only restore and close");
        checked=new HashSet<String>(session.build.checked);popup.toggleRow(1);
        BuildListTest.check(checked.equals(session.build.checked),"minimized popup cannot check hidden rows");
        popup.func_73875_a(button(popup,3));popup.func_73866_w_();
        checkButtons(popup,6);
        popup.func_73875_a(button(popup,5));popup.func_73866_w_();
        BuildListTest.check(popup.rows()==session.build.materials,"Materials restores the current list's materials");
        checked=new HashSet<String>(session.build.checked);
        popup.func_73875_a(button(popup,7));popup.toggleRow(0);
        BuildListTest.check(checked.equals(session.build.checked),"an open dropdown cannot toggle materials underneath it");
    }
    @SuppressWarnings("unchecked") private static List<GuiButton> buttons(BuildListPopup popup)throws Exception {
        Field field=GuiScreen.class.getDeclaredField("field_73887_h");field.setAccessible(true);
        return (List<GuiButton>)field.get(popup);
    }
    private static GuiButton button(BuildListPopup popup,int id)throws Exception {
        for(GuiButton button:buttons(popup))if(button.field_73741_f==id)return button;
        throw new AssertionError("Missing popup button "+id);
    }
    private static void checkButtons(BuildListPopup popup,int count)throws Exception {
        BuildListTest.check(buttons(popup).size()==count,"only the current state's buttons are present");
        Field height=GuiButton.class.getDeclaredField("field_73745_b");height.setAccessible(true);
        for(GuiButton button:buttons(popup)) {
            BuildListTest.check(height.getInt(button)==20,"button texture includes its bottom border without sampling the next hover-state strip");
            BuildListTest.check(button.field_73743_d+20<=popup.field_73881_g-6,"button bottom fits inside the screen margin");
            if(button.field_73742_g) {
                BuildListTest.check(button.func_73736_c(null,button.field_73746_c+1,button.field_73743_d+19),"last button row is clickable");
                BuildListTest.check(!button.func_73736_c(null,button.field_73746_c+1,button.field_73743_d+20),"space under button is not clickable");
            }
        }
    }
}
