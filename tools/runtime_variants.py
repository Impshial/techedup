"""Group reviewed RF charge/configuration states for material planning.

Keep original references as aliases for links, favorites and owned inventory.
Only the named RF implementations are covered; other NBT (materials, fluids,
enchantments, contents, etc.) remains part of the identity. Run after icons are
imported so the canonical item retains an actual inventory render.
"""
import collections
import hashlib
import json


ENERGY_CELL='thermalexpansion.block.energycell.ItemBlockEnergyCell'
RF_CLASSES={
    'thermalexpansion.item.tool.ItemCapacitor',
    'tonius.simplyjetpacks.item.jetpack.ItemJetpack',
    'tonius.simplyjetpacks.item.jetpack.ItemArmoredJetpack',
    'tonius.simplyjetpacks.item.jetpack.ItemPotatoJetpack',
    *('redstonearsenal.item.tool.'+name for name in (
        'ItemAxeRF','ItemWrenchBattleRF','ItemWrenchRF','ItemPickaxeRF',
        'ItemShovelRF','ItemSickleRF','ItemSwordRF')),
}
CELL_STATE={'Energy','Facing','SideCache','Send','Receive','Disable','Setting'}


def packed(value):
    return json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False)


def normalize_material_variants(data):
    groups=collections.defaultdict(list)
    untouched=[]
    for item in data['items']:
        cls=item.get('itemClass')
        if cls!=ENERGY_CELL and cls not in RF_CLASSES:
            untouched.append(item)
            continue
        tag=json.loads(item.get('nbt') or '{}')
        identity={k:v for k,v in tag.items() if k not in (CELL_STATE if cls==ENERGY_CELL else {'Energy'})}
        ref=item['baseRef']
        if identity:ref+='@'+hashlib.sha256(packed(identity).encode()).hexdigest()[:12]
        groups[ref].append((item,identity))
    aliases=dict(data.get('aliases',{}))
    canonical={}
    for ref,members in groups.items():
        # Prefer an uncharged inventory render to texture-only previews.
        def rank(member):
            item,_=member
            energy=json.loads(item.get('nbt') or '{}').get('Energy',{}).get('value',{}).get('field_74748_a',0)
            return (item.get('imageType')!='in-game inventory render',energy!=0,not bool(item.get('image')),item['ref'])
        original,tag=min(members,key=rank)
        item={**original,'ref':ref}
        item.pop('nbt',None)
        if tag:item['nbt']=packed(tag)
        item['chargeIndependent']=True
        canonical[ref]=item
        for old,_ in members:
            if old['ref']!=ref:aliases[old['ref']]=ref
    items=untouched+list(canonical.values())
    def stack(value):
        if value is None:return None
        ref=aliases.get(value['ref'],value['ref'])
        if ref not in canonical:return value
        result={**value,'ref':ref}
        result.pop('nbt',None)
        if canonical[ref].get('nbt'):result['nbt']=canonical[ref]['nbt']
        return result
    # Normalize the whole process, then deduplicate equivalent output recipes.
    recipes={}
    for recipe in data['recipes']:
        changed={**recipe,'output':stack(recipe['output'])}
        for field in ('inputs','outputs','returns'):
            if field in recipe:changed[field]=[stack(s) for s in recipe[field]]
        if recipe.get('grid'):changed['grid']=[[stack(s) for s in row] for row in recipe['grid']]
        if changed!=recipe:
            process={k:v for k,v in changed.items() if k not in ('id','processId','output','lines','calculable')}
            changed['processId']=hashlib.sha256(packed(process).encode()).hexdigest()[:18]
            output_index=changed.get('outputs',[changed['output']]).index(changed['output'])
            changed['id']=changed['processId']+'-'+str(output_index)
        recipes[changed['id']]=changed
    data['recipes']=list(recipes.values())
    data['items']=sorted(items,key=lambda i:(i['name'].casefold(),i['ref']))
    data['aliases']=aliases
    for group,members in data['ores'].items():
        data['ores'][group]=list({packed(stack(s)):stack(s) for s in members}.values())
    summary=data['summary']
    summary.update(items=len(items),recipes=len(recipes),processes=len({r['processId'] for r in recipes.values()}),
                   images=sum(bool(i.get('image')) for i in items),
                   renderedImages=sum(i.get('imageType')=='in-game inventory render' for i in items),
                   chargeVariantAliases=len(aliases))
    summary['byRegistry']=dict(collections.Counter(r['source'] for r in {r['processId']:r for r in recipes.values()}.values()))
    return data
