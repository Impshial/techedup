package techit.buildlist;

/** Visibility is separate from Minecraft's current screen and mouse focus. */
final class BuildListHudState {
    private enum Mode { HIDDEN, HUD, CURSOR }
    private Mode mode=Mode.HIDDEN;

    boolean visible(){return mode!=Mode.HIDDEN;}
    boolean cursor(){return mode==Mode.CURSOR;}
    void hotkey(boolean inWorld,boolean otherScreen) {
        if(!inWorld||otherScreen)return;
        mode=mode==Mode.HUD?Mode.CURSOR:Mode.HUD;
    }
    void resumeGame(){if(visible())mode=Mode.HUD;}
    void hide(){mode=Mode.HIDDEN;}
    boolean draw(boolean inWorld,boolean screenOpen,boolean hideGui) {
        return visible()&&inWorld&&!screenOpen&&!hideGui;
    }
}
