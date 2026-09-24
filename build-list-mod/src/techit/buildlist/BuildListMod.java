package techit.buildlist;

import cpw.mods.fml.common.Mod;
import cpw.mods.fml.common.FMLCommonHandler;
import cpw.mods.fml.common.event.FMLPreInitializationEvent;
import cpw.mods.fml.common.event.FMLPostInitializationEvent;
import cpw.mods.fml.common.network.NetworkMod;
import java.util.logging.Logger;

@Mod(modid="techitbuildlist",name="Teched Up Build List",version="0.4.0",acceptedMinecraftVersions="[1.6.4]",dependencies="after:TConstruct;after:GalacticraftCore")
@NetworkMod(clientSideRequired=false,serverSideRequired=false)
public final class BuildListMod {
    static BuildListStore store;
    static String error="";
    static Logger logger=Logger.getLogger("TechedUpBuildList");
    @Mod.EventHandler public void preinit(FMLPreInitializationEvent event) {
        if(!FMLCommonHandler.instance().getSide().isClient())return;
        logger=event.getModLog();
        try{store=new BuildListStore(event.getModConfigurationDirectory().getParentFile());}
        catch(Exception e){error="Build-list folder unavailable.";logger.warning("Could not create the Teched Up build-list folder: "+e);}
    }
    @Mod.EventHandler public void init(FMLPostInitializationEvent event) {
        if(FMLCommonHandler.instance().getSide().isClient())BuildListClient.initialize();
    }
}
