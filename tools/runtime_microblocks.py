"""Material-specific rules from Extra Utilities RecipeMicroBlocks and FMP MicroRecipe."""
import collections,json

def fields(v):return v.get('fields',{}) if isinstance(v,dict) else {}
def record(v):return {e['key']:e['value'] for e in v.get('entries',[])}
def material(item):
    tag=json.loads(item.get('nbt','null')) or {}
    value=tag.get('mat',{}).get('value',{}).get('field_74751_a')
    return value if isinstance(value,str) and value else None

def import_microblocks(im):
    parts=collections.defaultdict(dict)
    outputs=collections.defaultdict(dict)
    for item in im.items.values():
        mat=material(item)
        if not mat:continue
        if item.get('itemClass')=='codechicken.microblock.ItemMicroPart':parts[mat][int(item['metadata'])]=item
        if item.get('itemClass')=='extrautils.multipart.microblock.ItemMicroBlock':outputs[mat][(item['numericId'],int(item['metadata']))]=item
    def stack(item,count=1):return {'ref':item['ref'],'count':count,**({'nbt':item['nbt']} if item.get('nbt') else {})}
    # Every integer in RecipeMicroBlocks refers to a Forge Microblocks metadata
    # value. All those ingredients must carry the same material NBT as the output.
    source='extrautils.multipart.microblock.RecipeMicroBlocks'
    for n,recipe in enumerate(im.reg['minecraft.crafting']):
        if recipe.get('class')!=source:continue
        f=fields(recipe);out=recipe['recipeOutput'];width=f['recipeWidth']
        for mat,variants in outputs.items():
            def convert(mat=mat,variants=variants):
                output=variants.get((out['id'],out['meta']))
                if not output:return
                slots=[stack(parts[mat][value]) if isinstance(value,int) else im.stack(value,count=1) if value else None for value in f['recipeItems']]
                im.add(source,'Extra Utilities · microblocks',[s for s in slots if s],[stack(output,out['count'])],
                       grid=[slots[i:i+width] for i in range(0,len(slots),width)],crafting=True)
            im.attempt(source,str(n)+':'+mat,convert)

    source='forgemultipart.MicroRecipe (code + runtime materials)'
    materials=[record(v) for v in im.reg.get('forgemultipart.materials',[])]
    saws=[record(v) for v in im.reg.get('forgemultipart.saws',[])]
    maximum=im.reg.get('forgemultipart.maxCuttingStrength')
    saw_variants=collections.defaultdict(list)
    if parts and not materials:
        im.unhandled.append({'source':source,'error':'Runtime microblock material registry is missing'})
    for saw in saws:
        for item in im.items.values():
            if item['numericId']==saw['item']['id'] and item['kind']!='fluid':
                item['maxDamage']=saw['maxDamage']
                if 0<=int(item['metadata'])<=saw['maxDamage']:
                    saw_variants[saw['item']['id']].append({'ref':item['ref'],'count':1})
    cutting_choices={}
    for data in materials:
        mat=data['name'];variants=parts.get(mat,{})
        if not variants:continue
        def part(meta,count=1):return stack(variants[meta],count)
        def convert():
            block=im.stack(data['item'],count=1)
            if not block:raise ValueError('Material block identity missing')
            strength=data['cuttingStrength']
            if strength not in cutting_choices:
                cutting=[s for s in saws if s['cuttingStrength']>=strength or s['cuttingStrength']==maximum]
                cutting_choices[strength]=[v for saw in cutting for v in saw_variants[saw['item']['id']]]
            choices=cutting_choices[strength]
            if choices:
                group='alternatives:microblock-saws-'+str(data['cuttingStrength'])
                im.ores[group]=choices
                tool={'ref':group,'count':1,'consume':False,'toolDamage':1}
                def cut(ingredient,output,vertical):
                    im.add(source,'Microblock sawing',[tool,ingredient],[output],grid=[[tool],[ingredient]] if vertical else [[tool,ingredient]],details={'Saw durability per cut':1})
                if 4 in variants:cut(block,part(4,2),True)
                for meta in variants:
                    shape,size=meta>>8,meta&255
                    smaller=(shape<<8)|(size//2)
                    if size in (2,4) and smaller in variants:cut(part(meta),part(smaller,2),True)
                    split={0:3,1:3,3:2}.get(shape)
                    if split is not None and (split<<8|size) in variants:cut(part(meta),part(split<<8|size,2),False)
            def combine(inputs,output,grid=None):im.add(source,'Microblock assembly',inputs,[output],grid=grid)
            for size in (1,2,4):
                for shape in (0,1):
                    meta=shape<<8|size
                    if meta not in variants:continue
                    thick=shape<<8|(size*2)
                    if size==4:combine([part(meta),part(meta)],dict(block))
                    elif thick in variants:combine([part(meta),part(meta)],part(thick))
                if size in variants and (256|size) in variants:
                    filled=part(size);ring=[[filled,filled,filled],[filled,None,filled],[filled,filled,filled]]
                    combine([part(size) for _ in range(8)],part(256|size,8),ring)
                    combine([part(256|size)],part(size))
                if (768|size) in variants and size in variants:combine([part(768|size),part(768|size)],part(size))
                if (512|size) in variants:
                    if (768|size) in variants:combine([part(512|size),part(512|size)],part(768|size))
                    if size in variants:combine([part(512|size) for _ in range(4)],part(size))
        im.attempt(source,mat,convert)
