"""Machine adapters checked against this installation's decompiled tile code."""
import collections, json, math, zipfile
from pathlib import Path

def fields(v):return v.get('fields',{}) if isinstance(v,dict) else {}

def import_machines(im):
    r=im.reg
    def item(id,meta=0,count=1):return im.stack({'kind':'item','id':id,'meta':meta,'count':count})
    def named(unlocalized):
        matches=[i for i in im.items.values() if unlocalized in i['names'] and '@' not in i['ref']]
        if len(matches)!=1:raise ValueError('Exact ingredient identity not unique: '+unlocalized)
        return {'ref':matches[0]['ref'],'count':1}
    def fluid(name,count):
        id=next(k for k,v in im.fluid_names.items() if v==name)
        return im.stack({'kind':'fluid','id':id,'amount':count})
    def first_ore_options(names,include=None):
        order={name:int(id) for id,name in im.data['oreDictionaryIds'].items()}
        memberships=collections.defaultdict(set)
        for name,values in im.data['oreDictionary'].items():
            for value in values:memberships[(value['id'],value['meta'])].add(name)
        values=[include] if include else []
        for (id,meta),groups in memberships.items():
            all_groups=groups|memberships.get((id,32767),set())
            if min(all_groups,key=lambda g:order[g]) in names:values.append({'kind':'item','id':id,'meta':meta,'count':1})
        if not values:raise ValueError('No runtime members for first-ore matching')
        return im.stack(values)

    for kind in ('petalRecipes','runeAltarRecipes','manaInfusionRecipes'):
        source='vazkii.botania.api.BotaniaAPI#'+kind
        for n,v in enumerate(r.get(source,[])):
            def convert(v=v):
                f=fields(v);details={};notes=[]
                if kind=='manaInfusionRecipes':
                    inputs=[im.stack(f['input'],count=1)];machine='Mana pool';details['Mana']=f['mana']
                else:
                    inputs=[im.stack(x,count=1) for x in f['inputs']]
                    if kind=='petalRecipes':
                        machine='Petal apothecary';inputs += [item(295),fluid('water',1000)]
                    else:
                        machine='Runic altar';inputs.append(named('tile.botania:livingrock0'));details['Mana']=f['mana']
                        notes.append('Activate with a Wand of the Forest. The wand is not consumed.')
                im.add(source,machine,inputs,[im.stack(f['output'])],details=details,notes=notes)
            im.attempt(source,n,convert)

    source='WayofTime.alchemicalWizardry.api.alchemy.AlchemyRecipeRegistry#recipes'
    for n,v in enumerate(r.get(source,[])):
        f=fields(v)
        im.attempt(source,n,lambda f=f:im.add(source,'Alchemy set',[im.stack(x,count=1) for x in f['recipe'] if x],[im.stack(f['output'])],crafting=True,
            details={'LP':f['amountNeeded']*100,'Minimum blood orb tier':f['bloodOrbLevel']},
            notes=['Requires a bound blood orb in the separate orb slot; the orb is not consumed.']))
    source='WayofTime.alchemicalWizardry.api.altarRecipeRegistry.AltarRecipeRegistry#altarRecipes'
    for n,v in enumerate(r.get(source,[])):
        def altar(v=v):
            f=fields(v)
            if f['canBeFilled']:raise ValueError('Orb charging rule, not a fixed item-producing recipe')
            im.add(source,'Blood altar',[im.stack(f['requiredItem'],count=1)],[im.stack(f['result'])],details={'Base LP':f['liquidRequired'],'Minimum altar tier':f['minTier'],'Base consumption per tick':f['consumptionRate'],'Drain on interruption':f['drainRate']},notes=['Runes and interrupted processing can change the LP cost.'])
        im.attempt(source,n,altar)

    source='logisticspipes.recipes.SolderingStationRecipes#recipes'
    for n,v in enumerate(r.get(source,[])):
        def solder(v=v):
            f=fields(v);grid=[im.stack(x,count=1,ignore_nbt=True) if x else None for x in f['source']]
            # getTagetForRecipe decrements one per grid slot even when the
            # registered example stack has a larger stackSize. Slot 9 uses iron.
            im.add(source,'Soldering station',[x for x in grid if x]+[item(265)],[im.stack(f['result'])],grid=[grid[x:x+3] for x in range(0,9,3)],
                details={'Energy':'BuildCraft power; heat and progress dependent'},calculable=f['handler'] is None,
                notes=['One extra iron ingot is consumed from the solder slot.']+(['The result handler assigns a new paired-card UUID; NBT-dependent planning needs an adapter.'] if f['handler'] else []))
        im.attempt(source,n,solder)

    source='mrtjp.projectred.expansion.FurnaceRecipeLib$#MODULE$'
    for n,v in enumerate(fields(r.get(source)).get('recipes',[])):
        def furnace(v=v):
            f=fields(v)
            # Some subclasses replace the fixed input with an ore dictionary rule.
            if v['class']=='mrtjp.projectred.expansion.RecipeFurnace':ingredient=im.stack(f['in'],count=1)
            elif 'oreDicID' in f:
                ore=im.data['oreDictionaryIds'].get(str(f['oreDicID']))
                ingredient=first_ore_options({ore},include=f['in']) if ore else im.stack(f['in'],count=1)
            else:raise ValueError('ProjectRed custom matching needs review: '+v['class'])
            im.add(source,'ProjectRed electric furnace',[ingredient],[im.stack(f['out'])],details={'Ticks':f['ticks'],'Power':'Requires electricity'})
        im.attempt(source,n,furnace)

    source='atomicscience.TileChemicalExtractor (code + runtime identities)'
    def extract_deuterium():
        ratio=r['atomicscience.Settings#DEUTERIUM_RATIO']
        im.add(source,'Chemical extractor',[fluid('water',ratio*100)],[fluid('deuterium',100)],details={'Ticks':280,'Energy per active tick':5000},notes=['Keep uranium out of the material slot to select water extraction.'])
    im.attempt(source,'deuterium',extract_deuterium)
    # Atomic Science 1.2 uses the first registered ore ID, not any matching group.
    def uranium():
        output=r['atomicscience.AtomicScience#itemYellowCake']
        im.add(source,'Chemical extractor',[first_ore_options({'dropUranium','oreUranium'}),fluid('water',1000)],[item(output['id'],count=3)],details={'Ticks':280,'Energy per active tick':5000})
    im.attempt(source,'yellowcake',uranium)
    def cell():
        output=r['atomicscience.AtomicScience#itemDeuteriumCell']
        im.add(source,'Chemical extractor · fill cell',[first_ore_options({'cellEmpty'}),fluid('deuterium',200)],[item(output['id'])])
    im.attempt(source,'fill cell',cell)

    # Pattern.getPatternCost, PatternBuilder.getToolPart, PartBuilderLogic and
    # TEventHandler.craftPart from TConstruct_mc1.6.4_EX.30.jar.
    pattern_costs=[2,1,2,2,2,2,1,1,1,1,2,2,1,1,6,6,16,16,16,16,16,16,6,6,2,2]
    source='tconstruct.library.crafting.PatternBuilder#instance'
    pattern_builder=fields(r.get(source));materials=[fields(x) for x in pattern_builder.get('materials',[])]
    sets={x['key']:fields(x['value']) for x in pattern_builder.get('materialSets',{}).get('entries',[])}
    patterns={x['id'] for x in pattern_builder.get('toolPatterns',[]) if x.get('class')=='tconstruct.items.Pattern'}
    # NEI may not yet have populated its subtype list. These exact variants are
    # also specified by Pattern.java and TContent, with names in the installed JAR.
    root=Path(__file__).resolve().parents[1]
    archive=next(a for a in json.loads((root/'audit/manifest.json').read_text(encoding='utf-8'))['archives'] if a['file']=='TConstruct_mc1.6.4_EX.30.jar')
    with zipfile.ZipFile(archive['path']) as z:
        lang=dict(line.split('=',1) for line in z.read('assets/tinker/lang/en_US.lang').decode('utf-8').splitlines() if '=' in line and not line.startswith(('#','//')))
        pattern_names=['ingot','rod','pickaxe','shovel','axe','swordblade','largeguard','mediumguard','crossbar','binding','frypan','sign','knifeblade','chisel','largerod','toughbinding','largeplate','broadaxe','scythe','excavator','largeblade','hammerhead','fullguard','bowstring','fletching','arrowhead']
        for pid in patterns:
            base=im.items.get(f'item:{pid}:0')
            if not base:continue
            for meta,name in enumerate(pattern_names[1:],1):
                ref=f'item:{pid}:{meta}';unlocalized='item.tconstruct.Pattern.'+name
                if ref not in im.items:
                    im.items[ref]={**base,'ref':ref,'baseRef':ref,'metadata':str(meta),'name':lang[unlocalized+'.name'],'names':[unlocalized],
                        'textureLayers':[{'name':'tinker:materials/pattern_'+name,'pass':0,'sheet':1,'tint':16777215}],
                        'identitySource':'Installed Pattern/TContent code, English localization, and runtime pattern item ID'}
                    im.items[ref].pop('image',None)
    mappings=r.get('tconstruct.library.TConstructRegistry#patternPartMapping',{}).get('entries',[])
    for n,mapping in enumerate(mappings):
        pid,meta,material_id=mapping['key']
        if pid not in patterns:continue
        seen=set()
        for material in materials:
            signature=(material['item']['id'],material['damage'])
            if signature in seen:continue
            seen.add(signature)
            if sets[material['key']]['materialID']!=material_id:continue
            def part(material=material,mapping=mapping,pid=pid,meta=meta):
                value=material['value'];cost=pattern_costs[meta]
                ingredient=item(material['item']['id'],material['damage'],math.ceil(cost/value))
                pattern=item(pid,meta)
                if not pattern:raise ValueError('Pattern identity missing')
                pattern['consume']=False;outputs=[im.stack(mapping['value'])]
                if cost!=value and cost%2==1:outputs.append(im.stack(sets[material['key']]['shard']))
                im.add(source,'Part builder',[ingredient,pattern],outputs,details={'Material cost (half-units)':cost})
            im.attempt(source,n,part)
    for n,custom in enumerate(r.get('tconstruct.library.TConstructRegistry#customMaterials',[])):
        if custom['class'] not in ('tconstruct.library.tools.BowstringMaterial','tconstruct.library.tools.FletchingMaterial'):continue
        def custom_part(custom=custom):
            f=fields(custom);meta=23 if custom['class'].endswith('BowstringMaterial') else 24
            if len(patterns)!=1:raise ValueError('Wood pattern identity not unique')
            pattern=item(next(iter(patterns)),meta);pattern['consume']=False
            im.add(source,'Part builder',[im.stack(f['input'],count=math.ceil(pattern_costs[meta]/f['value'])),pattern],[im.stack(f['craftingItem'])])
        im.attempt(source,'custom-'+str(n),custom_part)
    # The stencil GUI skips index 21 (metadata 22, Full Guard); it is loot-only.
    for pid in patterns:
        for meta in range(1,26):
            if meta==22:continue
            def stencil(pid=pid,meta=meta):
                blanks=[i for i in im.items.values() if i.get('itemClass')=='tconstruct.items.CraftingItem' and i['name']=='Blank Pattern' and i['metadata']=='0']
                if len(blanks)!=1:raise ValueError('Blank Pattern identity not unique')
                im.add('tconstruct.StencilTableLogic (code + runtime identities)','Stencil table',[{'ref':blanks[0]['ref'],'count':1}],[item(pid,meta)])
            im.attempt('tconstruct.StencilTableLogic',meta,stencil)
