"""Reproduce recipe panels from the installed GUI textures and NEI coordinates."""
from pathlib import Path
import io,json,re,zipfile
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
manifest=json.loads((ROOT/'audit/manifest.json').read_text(encoding='utf-8'))
archives={a['file']:a for a in manifest['archives']};out=ROOT/'dist/images/gui';out.mkdir(parents=True,exist_ok=True)
layouts={};provenance={}
def read(archive,entry):
    with zipfile.ZipFile(archives[archive]['path']) as z:return Image.open(io.BytesIO(z.read(entry))).convert('RGBA')
def save(name,im,inputs,outputs,**extra):
    filename=re.sub(r'[^a-z0-9]+','-',name.lower()).strip('-')+'.png';im.save(out/filename)
    layouts[name]={'image':'images/gui/'+filename,'width':im.width,'height':im.height,'inputs':inputs,'outputs':outputs,**extra}
def slot(x,y,w=16,h=16):return {'x':x,'y':y,'w':w,'h':h}
mc='minecraft-1.6.4-client.jar'
craft=read(mc,'assets/minecraft/textures/gui/container/crafting_table.png').crop((22,14,162,74))
save('Crafting',craft,[slot(8+x*18,3+y*18) for y in range(3) for x in range(3)],[slot(102,21)],grid=True)
for label in ['Extra Utilities · microblocks','Microblock sawing','Microblock assembly']:
    save(label,craft,[slot(8+x*18,3+y*18) for y in range(3) for x in range(3)],[slot(102,21)],grid=True)
furnace=read(mc,'assets/minecraft/textures/gui/container/furnace.png').crop((42,13,139,76))
save('Furnace',furnace,[slot(14,4)],[slot(74,22)],fuel=slot(14,40))
te='ThermalExpansion-3.0.0.6.jar';atlas=read(te,'assets/thermalexpansion/textures/gui/NEIHandler.png')
for kind,label in [('Furnace','Redstone furnace'),('Pulverizer','Pulverizer'),('Sawmill','Sawmill'),('Smelter','Induction smelter'),('Crucible','Magma crucible')]:
    code=(ROOT/f'audit/decompiled/{te}/thermalexpansion/plugins/nei/handlers/RecipeHandler{kind}.java').read_text(encoding='utf-8')
    im=atlas.crop((5,11,171,76))
    # The handler's fixed blits draw its slots, progress arrow and machine icon.
    for values in re.findall(r'GuiDraw\.drawTexturedModalRect\(([^;]+)\);',code):
        values=re.sub(r'\(int\)','',values)
        if not re.fullmatch(r'[\d,\s]+',values):continue
        x,y,u,v,w,h=map(int,values.split(','));im.alpha_composite(atlas.crop((u,v,u+w,v+h)),(x,y))
    ins=[slot(51,18)]+([slot(27,18)] if kind=='Smelter' else [])
    outs=[slot(111,27)] if kind=='Furnace' else [slot(111,18),slot(111,45)]
    if kind=='Crucible':
        im.alpha_composite(atlas.crop((32,96,50,158)),(147,2))
        outs=[slot(148,3,16,60)]
    save(label,im,ins,outs)
# The transposer changes arrow direction and moves the fluid between inputs/outputs.
for mode,arrow in [('fill',32),('extract',48)]:
    im=atlas.crop((5,11,171,76))
    for x,y,u,v,w,h in [(74,10,176,96,18,18),(71,37,224,96,26,26),(36,20,224,0,16,16),(147,2,32,96,18,62),(107,9,176,arrow,24,16)]:
        im.alpha_composite(atlas.crop((u,v,u+w,v+h)),(x,y))
    save('Fluid transposer · '+mode,im,[slot(75,11)]+([slot(148,3,16,60)] if mode=='fill' else []),[slot(75,41)]+([slot(148,3,16,60)] if mode=='extract' else []))
nei='NEIPlugins-1.1.0.6.jar';smelt=read(nei,'assets/neiplugins/gfx/tc_smeltery.png')
save('Smeltery · melting',smelt.crop((0,0,160,55)),[slot(28,21)],[slot(115,22,18,18)])
save('Smeltery · alloying',smelt.crop((0,62,160,127)),[],[slot(118,9,18,32)],alloyTank={'x':21,'y':9,'w':36,'h':32})
casting=read(nei,'assets/neiplugins/gfx/tc_cast.png')
for name,y in [('Casting table',0),('Casting basin',62)]:
    save(name,casting.crop((0,y,112,y+55)),[slot(30,8,6,11),slot(25,19)],[slot(80,18)])
save('Assembly table',read(mc,'assets/minecraft/textures/gui/container/crafting_table.png').crop((5,11,171,76)),
     [slot(25+x*18,6+y*18) for x,y in [(0,0),(1,0),(0,1),(1,1),(0,2),(1,2),(2,0),(2,1),(2,2)]],[slot(119,24)])
save('BuildCraft refinery',read('buildcraft-A-1.6.4-4.2.2.jar','assets/buildcraft/textures/gui/refinery_filter.png').crop((5,31,171,96)),[slot(33,23),slot(121,23)],[slot(77,23)])
save('Soldering station',read('LogisticsPipes-MC1.6.4-0.7.4.dev.294.jar','assets/logisticspipes/textures/gui/soldering_station_nei.png').crop((5,11,171,76)),
     [slot(39+x*18,6+y*18) for y in range(3) for x in range(3)]+[slot(102,6)],[slot(136,36)],grid=True,extraInputs=True)
blood='Blood Magic v1.0.1b.zip'
save('Alchemy set',read(blood,'assets/alchemicalwizardry/gui/nei/alchemy.png').crop((5,11,171,76)),[slot(x,y) for x,y in [(76,3),(51,19),(101,19),(64,47),(88,47)]],[slot(76,25)])
save('Blood altar',read(blood,'assets/alchemicalwizardry/gui/nei/altar.png').crop((5,11,171,76)),[slot(38,2)],[slot(132,32)])
gc='Galacticraft-1.6.4-2.0.12.1026.jar'
save('Galacticraft compressor',read(gc,'assets/galacticraftcore/textures/gui/ingotCompressor.png').crop((18,17,155,95)),
     [slot(1+x*18,1+y*18) for y in range(3) for x in range(3)],[slot(120,21)],grid=True,fuel=slot(37,58))
atlas=read(gc,'assets/galacticraftcore/textures/gui/circuitFabricator.png')
panel=Image.new('RGBA',(168,99))
panel.alpha_composite(atlas.crop((3,4,171,68)),(0,0))
panel.alpha_composite(atlas.crop((73,68,169,103)),(70,64))
save('Circuit fabricator',panel,[slot(x+2,y-9) for x,y in [(10,22),(69,51),(69,69),(117,51),(140,25)]],[slot(149,82)],inputSlots=list(range(5)))
# Registry slot numbers follow the machine container, not the NEI example ordering.
nasa='micdoodle8.mods.galacticraft.api.GalacticraftRegistry#'
def bench(name,texture,height,positions,result):
    save(nasa+name,read(gc,'assets/'+texture).crop((3,4,171,4+height)),[slot(x-3,y-4) for x,y in positions],[slot(result[0]-3,result[1]-4)],inputSlots=list(range(1,len(positions)+1)))
bench('rocketBenchT1Recipes','galacticraftcore/textures/gui/rocketbench.png',130,
      [(48,19)]+[(39,37+y*18) for y in range(4)]+[(57,37+y*18) for y in range(4)]+[(21,91),(21,109),(48,109),(75,91),(75,109)]+[(93+x*26,12) for x in range(3)],(142,96))
bench('buggyBenchRecipes','galacticraftcore/textures/gui/buggybench.png',130,
      [(39+x*18,41+y*18) for x in range(3) for y in range(4)]+[(21+x*72,41+y*54) for x in range(2) for y in range(2)]+[(93+x*26,12) for x in range(3)],(142,106))
bench('rocketBenchT2Recipes','galacticraftmars/textures/gui/schematic_rocket_T2.png',140,
      [(48,19)]+[(39,37+y*18) for y in range(5)]+[(57,37+y*18) for y in range(5)]+[(21,91),(21,109),(21,127),(48,127),(75,91),(75,109),(75,127)]+[(93+x*26,12) for x in range(3)],(142,114))
bench('cargoRocketRecipes','galacticraftmars/textures/gui/schematic_rocket_cargo.png',125,
      [(48,18),(48,36)]+[(39,54+y*18) for y in range(3)]+[(57,54+y*18) for y in range(3)]+[(21,90),(21,108),(48,108),(75,90),(75,108)]+[(93+x*26,12) for x in range(3)],(142,96))
save('Quartz grindstone',read('appeng-rv14-finale3-mc16x.jar','assets/appeng/textures/guis/grinder.png').crop((5,11,171,76)),[slot(7,6)],[slot(107,42)])
save('Aludel',read('EquivalentExchange3-1.6.4-0.1.142.jar','assets/ee3/textures/gui/aludel.png').crop((5,11,171,98)),[slot(39,7),slot(39,28)],[slot(115,28)],fuel=slot(39,63))
save('HarvestCraft presser',read("Pam's HarvestCraft 1.6.4 v1.1.4.zip",'assets/pamharvestcraft/textures/gui/presser.png').crop((5,5,171,76)),[slot(75,18)],[slot(57,49),slot(93,49)])
cfm='MrCrayfishFurnitureModv3.3.4(1.6.4).jar'
save('Furniture oven',read(cfm,'assets/cfm/textures/gui/oven.png').crop((0,0,176,76)),[slot(7,7)],[slot(117,7)])
save('Furniture freezer',read(cfm,'assets/cfm/textures/gui/freezer.png').crop((5,11,171,76)),[slot(58,16)],[slot(118,16)],fuel=slot(27,16))
tcon='TConstruct_mc1.6.4_EX.30.jar'
atlas=read(tcon,'assets/tinker/textures/gui/toolparts.png');im=atlas.crop((5,11,171,76))
im.alpha_composite(atlas.crop((0,166,98,202)),(34,15))
save('Part builder',im,[slot(53,16),slot(35,16)],[slot(97,16),slot(115,16)])
save('Stencil table',read(tcon,'assets/tinker/textures/gui/patternshaper.png').crop((5,11,171,76)),[slot(43,24)],[slot(101,24)])
save('ProjectRed electric furnace',read('ProjectRedBase-1.6.4-4.3.7.32.jar','assets/projectred/textures/gui/furnace.png').crop((5,11,171,76)),[slot(39,26)],[slot(99,26)])
for key,layout in layouts.items():provenance[key]={'layout':layout,'source':'Installed texture and decompiled recipe-handler coordinates'}
(ROOT/'dist/recipe-layouts.json').write_text(json.dumps(layouts,separators=(',',':')),encoding='utf-8')
(ROOT/'audit/gui-image-report.json').write_text(json.dumps(provenance,indent=2),encoding='utf-8')
print('Extracted',len(layouts),'recipe panels')
