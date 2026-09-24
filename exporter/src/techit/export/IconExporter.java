package techit.export;

import java.awt.image.BufferedImage;
import java.io.*;
import java.nio.ByteBuffer;
import java.security.MessageDigest;
import java.util.*;
import javax.imageio.ImageIO;
import com.google.gson.GsonBuilder;
import org.lwjgl.BufferUtils;
import org.lwjgl.opengl.*;

/** Render copied stacks through Minecraft/Forge's actual GUI item renderer. */
final class IconExporter {
    private final Iterator<Map.Entry<String,Object>> pending;
    private final Map<String,Object> index=new LinkedHashMap<String,Object>();
    private final List<Object> errors=new ArrayList<Object>();
    private final File directory;
    private final String snapshot;
    private final int total;
    private Object renderer;
    private int framebuffer,texture,depth,completed;
    private static final int SIZE=64;
    IconExporter(File folder,String source,Map<String,Object> stacks)throws Exception {
        directory=new File(folder,"icons");directory.mkdirs();snapshot=source;total=stacks.size();
        pending=new LinkedHashMap<String,Object>(stacks).entrySet().iterator();
        renderer=RecipeExporter.clazz("net.minecraft.client.renderer.entity.RenderItem").newInstance();
        if(!GLContext.getCapabilities().GL_EXT_framebuffer_object)throw new IOException("OpenGL framebuffer extension unavailable");
        int oldFramebuffer=GL11.glGetInteger(EXTFramebufferObject.GL_FRAMEBUFFER_BINDING_EXT);
        int oldRenderbuffer=GL11.glGetInteger(EXTFramebufferObject.GL_RENDERBUFFER_BINDING_EXT);
        GL11.glPushAttrib(GL11.GL_ALL_ATTRIB_BITS);
        try {
            framebuffer=EXTFramebufferObject.glGenFramebuffersEXT();
            EXTFramebufferObject.glBindFramebufferEXT(EXTFramebufferObject.GL_FRAMEBUFFER_EXT,framebuffer);
            texture=GL11.glGenTextures();GL11.glBindTexture(GL11.GL_TEXTURE_2D,texture);
            GL11.glTexParameteri(GL11.GL_TEXTURE_2D,GL11.GL_TEXTURE_MIN_FILTER,GL11.GL_NEAREST);
            GL11.glTexParameteri(GL11.GL_TEXTURE_2D,GL11.GL_TEXTURE_MAG_FILTER,GL11.GL_NEAREST);
            GL11.glTexImage2D(GL11.GL_TEXTURE_2D,0,GL11.GL_RGBA8,SIZE,SIZE,0,GL11.GL_RGBA,GL11.GL_UNSIGNED_BYTE,(ByteBuffer)null);
            EXTFramebufferObject.glFramebufferTexture2DEXT(EXTFramebufferObject.GL_FRAMEBUFFER_EXT,EXTFramebufferObject.GL_COLOR_ATTACHMENT0_EXT,GL11.GL_TEXTURE_2D,texture,0);
            depth=EXTFramebufferObject.glGenRenderbuffersEXT();
            EXTFramebufferObject.glBindRenderbufferEXT(EXTFramebufferObject.GL_RENDERBUFFER_EXT,depth);
            EXTFramebufferObject.glRenderbufferStorageEXT(EXTFramebufferObject.GL_RENDERBUFFER_EXT,GL14.GL_DEPTH_COMPONENT24,SIZE,SIZE);
            EXTFramebufferObject.glFramebufferRenderbufferEXT(EXTFramebufferObject.GL_FRAMEBUFFER_EXT,EXTFramebufferObject.GL_DEPTH_ATTACHMENT_EXT,EXTFramebufferObject.GL_RENDERBUFFER_EXT,depth);
            if(EXTFramebufferObject.glCheckFramebufferStatusEXT(EXTFramebufferObject.GL_FRAMEBUFFER_EXT)!=EXTFramebufferObject.GL_FRAMEBUFFER_COMPLETE_EXT)throw new IOException("Icon framebuffer incomplete");
        } catch(Exception e) {
            close();throw e;
        } finally {
            EXTFramebufferObject.glBindFramebufferEXT(EXTFramebufferObject.GL_FRAMEBUFFER_EXT,oldFramebuffer);
            EXTFramebufferObject.glBindRenderbufferEXT(EXTFramebufferObject.GL_RENDERBUFFER_EXT,oldRenderbuffer);
            GL11.glPopAttrib();
        }
        status(false);
    }
    boolean tick()throws Exception {
        Object mc=RecipeExporter.call(RecipeExporter.clazz("net.minecraft.client.Minecraft"),"func_71410_x");
        if(RecipeExporter.field(mc,"field_71441_e")==null)return false;
        long deadline=System.nanoTime()+20000000L;int count=0;
        while(pending.hasNext()&&count++<8) {
            Map.Entry<String,Object> next=pending.next();
            try {index.put(next.getKey(),render(next.getValue()));}
            catch(Throwable e){errors.add(RecipeExporter.map("key",next.getKey(),"error",RecipeExporter.error(e)));}
            completed++;
            if(System.nanoTime()>=deadline)break;
        }
        if(completed%100<8)status(false);
        if(pending.hasNext())return false;
        status(true);close();return true;
    }
    private String render(Object original)throws Exception {
        Object mc=RecipeExporter.call(RecipeExporter.clazz("net.minecraft.client.Minecraft"),"func_71410_x");
        Object stack=RecipeExporter.call(original,"func_77946_l");
        Object font=RecipeExporter.field(mc,"field_71466_p");
        Object manager=RecipeExporter.call(mc,"func_110434_K");
        int oldFramebuffer=GL11.glGetInteger(EXTFramebufferObject.GL_FRAMEBUFFER_BINDING_EXT);
        int mode=GL11.glGetInteger(GL11.GL_MATRIX_MODE),active=GL11.glGetInteger(GL13.GL_ACTIVE_TEXTURE);
        ByteBuffer pixels=BufferUtils.createByteBuffer(SIZE*SIZE*4);
        GL11.glPushAttrib(GL11.GL_ALL_ATTRIB_BITS);GL11.glPushClientAttrib(GL11.GL_CLIENT_PIXEL_STORE_BIT|GL11.GL_CLIENT_VERTEX_ARRAY_BIT);
        GL13.glActiveTexture(GL13.GL_TEXTURE0);
        GL11.glMatrixMode(GL11.GL_PROJECTION);GL11.glPushMatrix();
        GL11.glMatrixMode(GL11.GL_MODELVIEW);GL11.glPushMatrix();
        GL11.glMatrixMode(GL11.GL_TEXTURE);GL11.glPushMatrix();
        try {
            EXTFramebufferObject.glBindFramebufferEXT(EXTFramebufferObject.GL_FRAMEBUFFER_EXT,framebuffer);
            GL11.glDrawBuffer(EXTFramebufferObject.GL_COLOR_ATTACHMENT0_EXT);GL11.glReadBuffer(EXTFramebufferObject.GL_COLOR_ATTACHMENT0_EXT);
            GL11.glViewport(0,0,SIZE,SIZE);GL11.glDisable(GL11.GL_SCISSOR_TEST);
            GL11.glDisable(GL11.GL_STENCIL_TEST);GL11.glDisable(GL11.GL_FOG);
            GL11.glColorMask(true,true,true,true);GL11.glDepthMask(true);
            GL11.glClearColor(0,0,0,0);GL11.glClear(GL11.GL_COLOR_BUFFER_BIT|GL11.GL_DEPTH_BUFFER_BIT);
            GL11.glMatrixMode(GL11.GL_PROJECTION);GL11.glLoadIdentity();GL11.glOrtho(0,16,16,0,1000,3000);
            GL11.glMatrixMode(GL11.GL_TEXTURE);GL11.glLoadIdentity();
            GL11.glMatrixMode(GL11.GL_MODELVIEW);GL11.glLoadIdentity();GL11.glTranslatef(0,0,-2000);
            GL11.glEnable(GL11.GL_TEXTURE_2D);GL11.glEnable(GL11.GL_DEPTH_TEST);GL11.glEnable(GL11.GL_ALPHA_TEST);
            GL11.glAlphaFunc(GL11.GL_GREATER,0.01f);GL11.glEnable(GL11.GL_BLEND);
            GL14.glBlendFuncSeparate(GL11.GL_SRC_ALPHA,GL11.GL_ONE_MINUS_SRC_ALPHA,GL11.GL_ONE,GL11.GL_ONE_MINUS_SRC_ALPHA);
            GL11.glColor4f(1,1,1,1);
            RecipeExporter.call(RecipeExporter.clazz("net.minecraft.client.renderer.RenderHelper"),"func_74520_c");
            RecipeExporter.call(renderer,"func_82406_b",font,manager,stack,0,0);
            GL11.glPixelStorei(GL11.GL_PACK_ALIGNMENT,1);
            GL11.glReadPixels(0,0,SIZE,SIZE,GL11.GL_RGBA,GL11.GL_UNSIGNED_BYTE,pixels);
        } finally {
            GL13.glActiveTexture(GL13.GL_TEXTURE0);
            GL11.glMatrixMode(GL11.GL_TEXTURE);GL11.glPopMatrix();
            GL11.glMatrixMode(GL11.GL_MODELVIEW);GL11.glPopMatrix();
            GL11.glMatrixMode(GL11.GL_PROJECTION);GL11.glPopMatrix();GL11.glMatrixMode(mode);
            EXTFramebufferObject.glBindFramebufferEXT(EXTFramebufferObject.GL_FRAMEBUFFER_EXT,oldFramebuffer);
            GL11.glPopClientAttrib();GL11.glPopAttrib();GL13.glActiveTexture(active);
        }
        byte[] rgba=new byte[SIZE*SIZE*4];pixels.position(0);pixels.get(rgba);
        BufferedImage image=decode(rgba,SIZE);
        String name=hex(MessageDigest.getInstance("SHA-256").digest(rgba))+".png";
        File file=new File(directory,name);if(!file.exists())ImageIO.write(image,"png",file);
        return name;
    }
    static BufferedImage decode(byte[] rgba,int size)throws IOException {
        BufferedImage image=new BufferedImage(size,size,BufferedImage.TYPE_INT_ARGB);int visible=0;
        for(int y=0;y<size;y++)for(int x=0;x<size;x++) {
            int p=(y*size+x)*4,r=rgba[p]&255,g=rgba[p+1]&255,b=rgba[p+2]&255,a=rgba[p+3]&255;
            if(a>0)visible++;image.setRGB(x,size-1-y,(a<<24)|(r<<16)|(g<<8)|b);
        }
        if(visible==0)throw new IOException("Renderer produced a transparent icon");
        return image;
    }
    static String hex(byte[] bytes){StringBuilder out=new StringBuilder();for(byte b:bytes)out.append(String.format("%02x",b&255));return out.toString();}
    private void status(boolean done)throws IOException {
        RecipeExporter.write(new File(directory,"progress.json"),new GsonBuilder().setPrettyPrinting().create().toJson(RecipeExporter.map("snapshot",snapshot,"complete",done,"completed",completed,"total",total,"images",index.size(),"errors",errors.size())));
        if(done)RecipeExporter.write(new File(directory,"index.json"),new GsonBuilder().setPrettyPrinting().create().toJson(RecipeExporter.map("format","techit-rendered-icons-v1","snapshot",snapshot,"complete",true,"icons",index,"errors",errors)));
    }
    void close(){if(depth!=0)EXTFramebufferObject.glDeleteRenderbuffersEXT(depth);if(texture!=0)GL11.glDeleteTextures(texture);if(framebuffer!=0)EXTFramebufferObject.glDeleteFramebuffersEXT(framebuffer);depth=texture=framebuffer=0;}
}
