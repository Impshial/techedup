package techit.buildlist;

/** Coordinates are Minecraft's scaled GUI pixels, including at small resolutions. */
final class ChecklistLayout {
    static final int ROW_HEIGHT=25;
    final int left,top,width,height,rowsTop,rowsBottom,visibleRows;
    final int badgeLeft,badgeTop,badgeWidth;
    ChecklistLayout(int screenWidth,int screenHeight) {
        width=Math.min(240,screenWidth-12);
        height=Math.min(330,screenHeight-12);
        left=screenWidth-width-6;top=screenHeight-height-6;
        rowsTop=top+41;
        visibleRows=Math.max(0,(height-76)/ROW_HEIGHT);
        rowsBottom=rowsTop+visibleRows*ROW_HEIGHT;
        badgeWidth=Math.min(128,screenWidth-12);
        badgeLeft=screenWidth-badgeWidth-6;badgeTop=screenHeight-28;
    }
    int clampOffset(int offset,int count){return Math.max(0,Math.min(offset,Math.max(0,count-visibleRows)));}
    int rowAt(int x,int y,int offset,int count) {
        if(x<left+6||x>=left+width-12||y<rowsTop||y>=rowsBottom)return -1;
        int index=offset+(y-rowsTop)/ROW_HEIGHT;
        return index<count?index:-1;
    }
}
