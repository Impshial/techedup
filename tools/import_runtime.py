"""Normalize inspected live recipe registries. Unsupported rules stay explicit."""
from pathlib import Path
import argparse, collections, hashlib, json, re

ROOT=Path(__file__).resolve().parents[1]
def dump(v):return json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=False)
def fields(v):return v.get('fields',{}) if isinstance(v,dict) else {}
def entries(v):return v.get('entries',[]) if isinstance(v,dict) else []
def nbt(v):
    if v is None:return None
    if not isinstance(v,dict):return v
    c=v.get('class','').rsplit('.',1)[-1]; f=fields(v)
    if c=='NBTTagCompound':return {str(e['key']):nbt(e['value']) for e in sorted(entries(f.get('field_74784_a')),key=lambda e:str(e['key']))}
    if c=='NBTTagList':return {'type':c,'elementType':f.get('field_74746_b'),'value':[nbt(x) for x in f.get('field_74747_a',[])]}
    return {'type':c,'value':{k:x for k,x in f.items() if k!='field_74741_a'}}
def ref_for(v,ignore_nbt=False):
    meta='*' if v.get('meta')==32767 else v.get('meta',0)
    ref=f"item:{v['id']}:{meta}"
    tag=None if ignore_nbt else nbt(v.get('nbt'))
    if tag:ref+='@'+hashlib.sha256(dump(tag).encode()).hexdigest()[:12]
    return ref

class Importer:
    def __init__(self,data):
        self.data=data;self.reg=data['registries'];self.items={};self.recipes={};self.ores={};self.unhandled=[];self.counts=collections.Counter();self.containers={};self.names=collections.defaultdict(list);self.fluid_names={}
        old=ROOT/'source/vanilla-image-map.json'
        if not old.exists() and (ROOT/'dist/catalog.json').exists():
            previous=json.loads((ROOT/'dist/catalog.json').read_text(encoding='utf-8'))
            old.write_text(dump({i['ref']:{k:i[k] for k in ('image','imageType')} for i in previous['items'] if i.get('image')}),encoding='utf-8')
        images=json.loads(old.read_text(encoding='utf-8')) if old.exists() else {}
        classes=json.loads((ROOT/'audit/classes.json').read_text(encoding='utf-8'))
        parents={c['name'].replace('/','.'):c['parent'].replace('/','.') for c in classes}
        class_archives={c['name'].replace('/','.'):c['archive'] for c in classes}
        mods=[{e['key']:e['value'] for e in entries(v)} for v in self.reg['fml.loadedMods']]
        mod_names={m['id']:m['name'] for m in mods};mod_names.update({'Minecraft':'Minecraft','minecraft':'Minecraft'})
        mod_archives=collections.defaultdict(list)
        for m in mods:
            if m['source']!='minecraft.jar':mod_archives[m['source']].append(m)
        domains=collections.defaultdict(set)
        for a in json.loads((ROOT/'audit/manifest.json').read_text(encoding='utf-8'))['archives']:
            if a['file'] not in mod_archives:continue
            owner=mod_archives[a['file']][0]['name']
            for e in a['entries']:
                parts=e['path'].split('/')
                if len(parts)>2 and parts[0]=='assets' and parts[1]!='minecraft':domains[parts[1].lower()].add(owner)
        owners={str(e['key']):fields(e['value']) for e in entries(self.reg.get('forge.itemOwners',self.reg.get('additional.forge.itemOwners')))}
        def mod_for(v):
            owner=owners.get(str(v['id']),{});mod_id=owner.get('forcedModId') or owner.get('modId')
            if mod_id:return mod_names.get(mod_id,mod_id),'runtime registry'
            cls=v.get('itemClass','');archive=class_archives.get(cls);matches=mod_archives.get(archive,[])
            if len(matches)==1:return matches[0]['name'],'class archive'
            # Source-archive modules are kept together until Forge supplies owners.
            if matches:return matches[0]['name'],'mod archive (includes bundled modules)'
            if cls.startswith('net.minecraft.') and v['id']<=422:return 'Minecraft','vanilla class and ID'
            texture_owners=set()
            for layer in v.get('textureLayers',[]):
                if ':' in layer['name']:texture_owners.update(domains.get(layer['name'].split(':')[0].lower(),set()))
            if len(texture_owners)==1:return next(iter(texture_owners)),'texture namespace archive'
            return 'Unassigned','owner pending'
        def is_block(cls):
            seen=set()
            while cls and cls not in seen:
                if cls=='net.minecraft.item.ItemBlock':return True
                seen.add(cls);cls=parents.get(cls)
            return False
        for v in data['items'].values():
            if v['meta']==32767:continue
            name=re.sub(r'§.','',v.get('name') or v.get('unlocalized') or f"Item {v['id']}:{v['meta']}")
            if re.search(r'\bnull\b',name,re.I):continue
            ref=ref_for(v);base=f"item:{v['id']}:{v['meta']}";tag=nbt(v.get('nbt'))
            item={'ref':ref,'name':name,'names':[v.get('unlocalized','')],'metadata':str(v['meta']),'numericId':v['id'],'kind':'block' if is_block(v.get('itemClass')) else 'item','itemClass':v.get('itemClass'),'ambiguous':False,'baseRef':base}
            item['mod'],item['modSource']=mod_for(v)
            if tag:item['nbt']=dump(tag)
            if v.get('textureLayers'):item['textureLayers']=v['textureLayers']
            if not tag:
                unloc=v.get('unlocalized','');image=images.get(unloc+(f":{v['meta']}" if v['meta'] else '')) or images.get(unloc)
                if image:item.update(image)
            self.items[ref]=item;self.names[v.get('unlocalized','')].append(ref)
            if v.get('containerItem'):self.containers[ref]=v['containerItem']
        self.fluid_metadata={}
        for e in entries(self.reg.get('forge.fluidIDs')):self.fluid_names[e['value']]=e['key']
        for e in entries(self.reg.get('forge.fluids')):
            f=fields(e['value']);owner=mod_for({'id':f.get('blockID',-1),'itemClass':e['value'].get('class','')})
            self.fluid_metadata[e['key']]={'color':f.get('color'),'mod':owner[0] if owner[0]!='Unassigned' else 'Fluids'}
        for value in self.reg.get('forge.fluidDisplay',[]):
            f={e['key']:e['value'] for e in entries(value)}
            meta=self.fluid_metadata.setdefault(f['name'],{'mod':'Fluids'})
            if f.get('displayName'):meta['name']=f['displayName']
            if f.get('color') is not None:meta['color']=f['color']
            if f.get('textureName'):meta['textureLayers']=[{'name':f['textureName'],'sheet':0,'pass':0,'tint':f.get('color',16777215)}]
        # Earlier exporter versions can corroborate names from exact florb-fill NBT.
        if not self.fluid_names:
            known={e['key'] for e in entries(self.reg.get('forge.fluids'))}
            def strings(x):
                if isinstance(x,str):yield x
                elif isinstance(x,dict):
                    for y in x.values():yield from strings(y)
                elif isinstance(x,list):
                    for y in x:yield from strings(y)
            for r in self.reg.get('thermalexpansion.TransposerFill',[]):
                f=fields(r);ns=set(strings(f['output'].get('nbt')))&known
                if len(ns)==1:self.fluid_names[f['fluid']['id']]=next(iter(ns))
        for name,members in data['oreDictionary'].items():
            self.ores['ore:'+name]=[s for v in members if (s:=self.stack(v,count=1,ignore_nbt=True))]

    def stack(self,v,count=None,ignore_nbt=False):
        if v is None:return None
        if isinstance(v,str):return {'ref':'ore:'+v,'count':count or 1}
        if isinstance(v,list):
            opts=[s for x in v if (s:=self.stack(x,count=1,ignore_nbt=ignore_nbt))]
            ref='alternatives:'+hashlib.sha256(dump(opts).encode()).hexdigest()[:12]
            self.ores[ref]=opts
            return {'ref':ref,'count':1 if count is None else count}
        if not isinstance(v,dict):raise ValueError('Ingredient representation needs an adapter: '+str(v))
        k=v.get('kind');f=fields(v);c=v.get('class','')
        if k=='ore':return {'ref':'ore:'+v['name'],'count':1 if count is None else count}
        if k=='item':
            if v['id']<=0:return None
            ref=ref_for(v,ignore_nbt);meta=v.get('meta',0);tag=None if ignore_nbt else nbt(v.get('nbt'))
            if meta!=32767 and ref not in self.items:
                # A real registry reference may lack a vanilla-meta-zero display record.
                relatives=[i for i in self.items.values() if i['numericId']==v['id'] and i['metadata']==str(meta)]
                if relatives:
                    item={**relatives[0],'ref':ref,'baseRef':f"item:{v['id']}:{meta}"};item.pop('nbt',None)
                    if tag:item['nbt']=dump(tag)
                    self.items[ref]=item
                else:return None
            s={'ref':ref,'count':v.get('count',1) if count is None else count}
            if tag:s['nbt']=dump(tag)
            return s
        if k=='fluid':
            ref='fluid:'+str(v['id']);name=self.fluid_names.get(v['id'],f"Fluid #{v['id']} (name pending)")
            self.items.setdefault(ref,{'ref':ref,'name':name.replace('.',' ').title(),'names':[name],'metadata':'0','numericId':v['id'],'kind':'fluid','unit':'mB','ambiguous':False,'baseRef':ref,**self.fluid_metadata.get(name,{'mod':'Fluids'})})
            return {'ref':ref,'count':v['amount'] if count is None else count}
        if c.endswith('WrappedStack'):
            return self.stack(f['wrappedStack'],count=f.get('stackSize',1),ignore_nbt=ignore_nbt)
        if c.endswith('OreStack'):return {'ref':'ore:'+f['oreName'],'count':f.get('stackSize',1) if count is None else count}
        if c.endswith('ItemKeyStack'):
            return self.stack(f['key'],count=f.get('stackSize',1))
        if c.endswith('ItemKey') and 'itemID' in f:
            return self.stack({'kind':'item','id':f['itemID'],'meta':f['itemDamage'],'nbt':f.get('tag'),'count':count or 1})
        if c.endswith('SimpleItemMatcher'):
            if f.get('oredictName'):return self.stack(f['oredictName'],count=1)
            if f.get('id') is not None:return self.stack({'kind':'item','id':f['id'],'meta':f.get('meta') or 0,'count':1})
            opts=[{'ref':ref,'count':1} for ref in self.names.get(f.get('unlocalizedName'),[]) if '@' not in ref]
            if not opts:return None
            if len(opts)==1:return opts[0]
            ref='alternatives:'+hashlib.sha256(dump(opts).encode()).hexdigest()[:12];self.ores[ref]=opts
            return {'ref':ref,'count':1}
        if 'stack' in f:return self.stack(f['stack'],count=count,ignore_nbt=ignore_nbt)
        raise ValueError('Unsupported ingredient '+c)

    def add(self,source,machine,inputs,outputs,*,grid=None,details=None,notes=None,calculable=True,crafting=False):
        if not outputs or any(x is None for x in outputs) or any(x is None for x in inputs):raise ValueError('Missing item/name in required input or output')
        combined={}
        for output in outputs:
            k=(output['ref'],output.get('nbt'),output.get('chance',1))
            if k in combined:combined[k]['count']+=output['count']
            else:combined[k]={**output}
        outputs=list(combined.values())
        if any(x['count']<=0 for x in inputs+outputs):calculable=False
        r={'type':machine,'machine':machine,'inputs':inputs,'outputs':outputs,'details':details or {},'notes':notes or [],'calculable':calculable,'source':source}
        if grid:r['grid']=grid
        if crafting:
            returns=[]
            for s in inputs:
                container=self.containers.get(s['ref'])
                if not container:continue
                returned=self.stack(container)
                if returned and returned['ref']==s['ref']:s['consume']=False
                elif returned:returns.append({**returned,'count':s['count']})
            r['returns']=returns
        identity=hashlib.sha256(dump(r).encode()).hexdigest()[:18];r['processId']=identity
        for i,out in enumerate(outputs):
            row={**r,'id':identity+'-'+str(i),'output':out,'calculable':calculable and out.get('chance',1)==1,'lines':[]}
            self.recipes[row['id']]=row
        self.counts[source]+=1

    def attempt(self,source,index,fn):
        try:fn()
        except (ValueError,KeyError,TypeError,IndexError) as e:self.unhandled.append({'source':source,'index':index,'reason':str(e)})

    def crafting(self,r,source='minecraft.crafting'):
        c=r['class'];f=fields(r)
        if c in ('extrautils.multipart.microblock.RecipeMicroBlocks','codechicken.microblock.MicroRecipe$'):return # Material-aware adapters run after catalog initialization.
        if 'Impostor' in c:raise ValueError('Display-only example; matching is implemented by a separate procedural recipe')
        if not r.get('recipeOutput'):raise ValueError('Procedural recipe; no fixed output')
        output=self.stack(r['recipeOutput']);note=[]
        if 'ingredients' in f and c.endswith('JSONRecipe'):
            cols=f['ingredients'];height=max(map(len,cols));slots=[cols[x][y] if y<len(cols[x]) else None for y in range(height) for x in range(len(cols))];width=len(cols)
        else:
            slots=f.get('input',f.get('field_77574_d',f.get('field_77579_b',f.get('recipeItems'))))
            width=f.get('width',f.get('field_77576_b',f.get('recipeWidth',0)))
        if not isinstance(slots,list):raise ValueError('Custom recipe needs a dedicated ingredient adapter: '+c)
        preserve=bool(f.get('checkNBT'))
        normalized=[self.stack(s,count=1,ignore_nbt=not preserve) if s is not None else None for s in slots]
        if any(s is not None and n is None for s,n in zip(slots,normalized)):raise ValueError('Unresolved crafting ingredient identity')
        # Reject classes known to add important matching/consumption conditions until reviewed.
        special=('Unstable','DifficultySpecific','RecipeGBEnchanting','RecipeMagicalWood','ShapelessToolRecipe','JetpackUpgradingRecipe','UpgradeRecipe','ShapedOreNBTRecipe','ShapelessOreNBTRecipe')
        conditional=any(x in c for x in special)
        if conditional:note.append('Custom matching, NBT transfer, or tool behavior needs verification before automatic planning.')
        grid=[normalized[i:i+width] for i in range(0,len(normalized),width)] if width else None
        self.add(source,'Crafting' if source=='minecraft.crafting' else 'Galacticraft compressor',[s for s in normalized if s], [output],grid=grid,notes=note,calculable=not conditional,crafting=source=='minecraft.crafting')

    def run(self):
        for i,r in enumerate(self.reg['minecraft.crafting']):self.attempt('minecraft.crafting',i,lambda r=r:self.crafting(r))
        f=fields(self.reg['minecraft.furnace'])
        for group,meta in [('field_77604_b',False),('metaSmeltingList',True)]:
            for i,e in enumerate(entries(f.get(group))):
                key=e['key'];v={'kind':'item','id':key[0] if meta else key,'meta':key[1] if meta else 32767,'count':1}
                self.attempt('minecraft.furnace',i,lambda v=v,e=e:self.add('minecraft.furnace','Furnace',[self.stack(v)],[self.stack(e['value'])],details={'fuel':'Required; depends on fuel choice'}))
        labels={'Furnace':'Redstone furnace','Pulverizer':'Pulverizer','Sawmill':'Sawmill','Smelter':'Induction smelter','Crucible':'Magma crucible','TransposerFill':'Fluid transposer · fill','TransposerExtract':'Fluid transposer · extract'}
        for name,label in labels.items():
            source='thermalexpansion.'+name
            for i,r in enumerate(self.reg.get(source,[])):
                def convert(r=r):
                    f=fields(r);ins=[self.stack(f.get('primaryInput',f.get('input')))];outs=[self.stack(f.get('primaryOutput',f.get('output')))];secondary=f.get('secondaryOutput')
                    if name=='Smelter':ins.append(self.stack(f['secondaryInput']))
                    if name=='TransposerFill':ins.append(self.stack(f['fluid']))
                    if name=='TransposerExtract':
                        # TE always returns the extracted fluid; chance applies to the item.
                        outs[0]['chance']=f['chance']/100;outs.append(self.stack(f['fluid']))
                    if secondary:outs.append({**self.stack(secondary),'chance':f['secondaryChance']/100})
                    self.add(source,label,ins,outs,details={'RF':f['energy']})
                self.attempt(source,i,convert)
        temperatures={tuple(e['key']):e['value'] for e in entries(self.reg.get('tconstruct.TemperatureList'))}
        for i,e in enumerate(entries(self.reg.get('tconstruct.SmeltingList'))):
            v={'kind':'item','id':e['key'][0],'meta':e['key'][1],'count':1}
            self.attempt('tconstruct.SmeltingList',i,lambda e=e,v=v:self.add('tconstruct.SmeltingList','Smeltery · melting',[self.stack(v)],[self.stack(e['value'])],details={'Temperature':temperatures.get(tuple(e['key'])),'fuel':'Smeltery fuel required'}))
        for i,r in enumerate(self.reg.get('tconstruct.AlloyList',[])):
            f=fields(r);self.attempt('tconstruct.AlloyList',i,lambda f=f:self.add('tconstruct.AlloyList','Smeltery · alloying',[self.stack(x) for x in f['mixers']],[self.stack(f['result'])]))
        for kind in ('Table','Basin'):
            source='tconstruct.'+kind+'Casting'
            for i,r in enumerate(self.reg.get(source,[])):
                def cast(r=r):
                    f=fields(r);ins=[self.stack(f['castingMetal'])]
                    if f['cast']:ins.append({**self.stack(f['cast']),'consume':f['consumeCast']})
                    self.add(source,'Casting '+kind.lower(),ins,[self.stack(f['output'])],details={'Cooling ticks':f['coolTime']})
                self.attempt(source,i,cast)
        src='tconstruct.library.crafting.DryingRackRecipes#recipes'
        for i,r in enumerate(self.reg.get(src,[])):
            f=fields(r);self.attempt(src,i,lambda f=f:self.add(src,'Drying rack',[self.stack(f['input'])],[self.stack(f['result'])],details={'Ticks':f['time']}))
        src='buildcraft.api.recipes.AssemblyRecipe#assemblyRecipes'
        for i,r in enumerate(self.reg.get(src,[])):
            def assemble(r=r):
                f=fields(r);ins=[]
                for v in f['input']:
                    if isinstance(v,int):ins[-1]['count']=v
                    else:ins.append(self.stack(v))
                self.add(src,'Assembly table',ins,[self.stack(f['output'])],details={'MJ':f['energy']})
            self.attempt(src,i,assemble)
        for i,r in enumerate(self.reg.get('buildcraft.refinery',[])):
            f=fields(r);self.attempt('buildcraft.refinery',i,lambda f=f:self.add('buildcraft.refinery','BuildCraft refinery',[self.stack(f[x]) for x in ('ingredient1','ingredient2') if f[x]],[self.stack(f['result'])],details={'MJ':f['energy'],'Ticks':f['delay']}))
        src='appeng.grinder'
        for i,r in enumerate(self.reg.get(src,[])):
            f=fields(r);self.attempt(src,i,lambda f=f:self.add(src,'Quartz grindstone',[self.stack(f['in'])],[self.stack(f['out'])],details={'Turns':f['energy']}))
        src='micdoodle8.mods.galacticraft.api.recipe.CompressorRecipes#recipes'
        for i,r in enumerate(self.reg.get(src,[])):self.attempt(src,i,lambda r=r:self.crafting(r,src))
        src='micdoodle8.mods.galacticraft.api.recipe.CircuitFabricatorRecipes#recipes'
        for i,e in enumerate(entries(self.reg.get(src))):self.attempt(src,i,lambda e=e:self.add(src,'Circuit fabricator',[dict(self.stack(x,count=1),slot=n) for n,x in enumerate(e['key']) if x],[self.stack(e['value'])]))
        for name in ('rocketBenchT1Recipes','rocketBenchT2Recipes','cargoRocketRecipes','buggyBenchRecipes'):
            src='micdoodle8.mods.galacticraft.api.GalacticraftRegistry#'+name
            for i,r in enumerate(self.reg.get(src,[])):
                f=fields(r);self.attempt(src,i,lambda f=f:self.add(src,'NASA workbench',[dict(self.stack(e['value'],count=1),slot=e['key']) for e in entries(f['input']) if e['value']],[self.stack(f['output'])]))
        src='assets.pamharvestcraft.PamOtherRecipes#'
        for i,itemid in enumerate(self.reg.get(src+'combItems',[])):
            def press(i=i,itemid=itemid):
                inp=self.stack({'kind':'item','id':itemid,'meta':self.reg[src+'combItemsDamage'][i],'count':1})
                out=[self.stack(self.reg[src+k][i]) for k in ('combResult1','combResult2') if self.reg[src+k][i]]
                self.add(src+'combItems','HarvestCraft presser',[inp],out)
            self.attempt(src+'combItems',i,press)
        for kind in ('ovenRecipes','freezerRecipes'):
            src='com.mrcrayfish.furniture.api.FurnitureAPI#'+kind
            for i,r in enumerate(self.reg.get(src,[])):
                f=fields(r);self.attempt(src,i,lambda f=f:self.add(src,'Furniture '+('oven' if kind=='ovenRecipes' else 'freezer'),[self.stack(f['input'])],[self.stack(f['output'])]))
        src='com.mrcrayfish.furnitureapi.OvenRecipesAPI#recipeList'
        for i,e in enumerate(entries(self.reg.get(src))):self.attempt(src,i,lambda e=e:self.add(src,'HarvestCraft oven',[self.stack({'kind':'item','id':e['key'],'meta':32767,'count':1})],[self.stack(e['value'])]))
        src='com.pahimar.ee3.recipe.RecipesAludel#aludelRegistry'
        for i,r in enumerate(fields(self.reg.get(src)).get('aludelRecipes',[])):
            f=fields(r);self.attempt(src,i,lambda f=f:self.add(src,'Aludel',[self.stack(f['inputStack']),self.stack(f['dustStack'])],[self.stack(f['recipeOutput'])]))
        from runtime_machines import import_machines
        import_machines(self)
        from runtime_microblocks import import_microblocks
        import_microblocks(self)
        # Preserve coverage: these registries have not yet received semantic adapters.
        pending=[c for c in self.data['coverage'] if c['registry'] not in self.counts and not c['registry'].startswith('nei.')]
        recipes=list(self.recipes.values());items=sorted(self.items.values(),key=lambda i:(i['name'].casefold(),i['ref']))
        summary={'source':'Live TechIt-ng registries','timestamp':self.data['timestamp'],'recipes':len(recipes),'processes':len({r['processId'] for r in recipes}),'items':len(items),'oreGroups':len(self.ores),'liquids':sum(i['kind']=='fluid' for i in items),'images':sum(bool(i.get('image')) for i in items),'unhandledRecords':len(self.unhandled),'runtimeCraftingRecords':len(self.reg['minecraft.crafting']),'coverageComplete':False,'byRegistry':dict(collections.Counter(r['source'] for r in {r['processId']:r for r in recipes}.values()))}
        return {'version':3,'summary':summary,'items':items,'recipes':recipes,'ores':self.ores,'liquids':[i for i in items if i['kind']=='fluid'],'entities':[],'coverage':{'unhandled':self.unhandled,'otherRegistries':pending}}

def main():
    p=argparse.ArgumentParser();p.add_argument('source',nargs='?',type=Path);p.add_argument('--output',type=Path,default=ROOT/'source/runtime/catalog.json');args=p.parse_args()
    source=args.source or max((ROOT/'source/runtime').glob('recipes-*.json'))
    data=json.loads(source.read_text(encoding='utf-8'));result=Importer(data).run()
    result['summary']['sha256']=hashlib.sha256(source.read_bytes()).hexdigest()
    result['summary']['snapshot']=source.name
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(dump(result),encoding='utf-8')
    (ROOT/'audit/normalization-report.json').write_text(json.dumps(result['coverage'],indent=2),encoding='utf-8')
    print(json.dumps(result['summary'],indent=2))
if __name__=='__main__':main()
