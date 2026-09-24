"""Summarize a real runtime dump without silently accepting incomplete records."""
import argparse, collections, json
from pathlib import Path

def inspect(data):
    if data.get('format')!='techit-runtime-registry-v1': raise ValueError('Not a TechIt runtime export')
    unresolved=[];classes=collections.Counter();stacks=0;fluids=0
    def walk(value,path):
        nonlocal stacks,fluids
        if isinstance(value,dict):
            if 'unresolved' in value: unresolved.append({'path':path,**value})
            if value.get('kind')=='item': stacks+=1
            if value.get('kind')=='fluid': fluids+=1
            if 'class' in value and 'fields' in value: classes[value['class']]+=1
            for key,v in value.items():walk(v,path+'/'+key)
        elif isinstance(value,list):
            for i,v in enumerate(value):walk(v,path+'/'+str(i))
    for key,value in data.get('registries',{}).items():walk(value,key)
    outcomes=collections.Counter(r['status'] for r in data.get('coverage',[]))
    crafting=data.get('registries',{}).get('minecraft.crafting',[])
    recipes=collections.Counter(r.get('class','unknown') for r in crafting if isinstance(r,dict)) if isinstance(crafting,list) else {}
    return {'format':data['format'],'timestamp':data.get('timestamp'),'registryOutcomes':dict(outcomes),
            'itemVariants':len(data.get('items',{})),'oreGroups':len(data.get('oreDictionary',{})),
            'craftingRecords':len(crafting) if isinstance(crafting,list) else None,'craftingClasses':dict(recipes),
            'stackReferences':stacks,'fluidReferences':fluids,'unresolvedCount':len(unresolved),
            'unresolved':unresolved,'errors':data.get('errors',[]),'coverage':data.get('coverage',[]),
            'notes':['Captured record counts are not a guarantee of semantic recipe completeness.',
                     'Review unsupported classes, empty registries, procedural rules, catalysts, chances, and configuration before publishing.']}

def main():
    p=argparse.ArgumentParser();p.add_argument('export',type=Path);p.add_argument('--output',type=Path,default=Path('audit/runtime-review.json'));args=p.parse_args()
    result=inspect(json.loads(args.export.read_text(encoding='utf-8')))
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(json.dumps({k:v for k,v in result.items() if k not in ('unresolved','coverage','craftingClasses')},indent=2))

if __name__=='__main__':main()
