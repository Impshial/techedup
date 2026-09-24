"""Extract exact runtime-named textures. Never guess an icon from an item name."""
from pathlib import Path
import argparse, collections, hashlib, io, json, zipfile
from PIL import Image, ImageChops
from import_runtime import ROOT, dump

def main():
    p=argparse.ArgumentParser();p.add_argument('--catalog',type=Path,default=ROOT/'source/runtime/catalog.json');args=p.parse_args()
    data=json.loads(args.catalog.read_text(encoding='utf-8'))
    manifest=json.loads((ROOT/'audit/manifest.json').read_text(encoding='utf-8'))
    sources=collections.defaultdict(list);archives={}
    for a in manifest['archives']:
        path=Path(a['path'])
        # Nested API bundles, installers and unused resource packs are not loaded assets.
        if a.get('nestedIn') or ('mods' not in path.parts and a['file']!='minecraft-1.6.4-client.jar'):continue
        z=zipfile.ZipFile(path);archives[str(path)]=z
        for name in z.namelist():
            if name.startswith('assets/') and name.lower().endswith('.png'):
                sources[name.lower()].append((str(path),name))
    output=ROOT/'dist/images/runtime';output.mkdir(parents=True,exist_ok=True)
    report={'mapped':0,'missing':[],'assets':{},'notes':['Flat source-texture previews; custom inventory renderers require a rendered-icon export.']}
    cache={}
    def layer(v):
        name=v['name'];domain,name=name.split(':',1) if ':' in name else ('minecraft',name)
        entry=f"assets/{domain}/textures/{'blocks' if v['sheet']==0 else 'items'}/{name}.png"
        matches=sources.get(entry.lower(),[])
        if not matches:raise ValueError('Texture not found: '+entry)
        choices=[(path,n,archives[path].read(n)) for path,n in matches]
        if len({hashlib.sha256(b).hexdigest() for _,_,b in choices})>1:raise ValueError('Conflicting loaded textures: '+entry)
        path,n,b=choices[0];im=Image.open(io.BytesIO(b)).convert('RGBA')
        if im.height>im.width:
            # Minecraft's vertical animated strips: use the first declared frame.
            frame=0;meta=n+'.mcmeta'
            if meta in archives[path].namelist():
                m=json.loads(archives[path].read(meta));frames=m.get('animation',{}).get('frames',[])
                if frames:frame=frames[0].get('index',0) if isinstance(frames[0],dict) else frames[0]
            im=im.crop((0,frame*im.width,im.width,(frame+1)*im.width))
        tint=v.get('tint',16777215)
        im=ImageChops.multiply(im,Image.new('RGBA',im.size,((tint>>16)&255,(tint>>8)&255,tint&255,255)))
        return im,{'archive':Path(path).name,'entry':n,'sha256':hashlib.sha256(b).hexdigest(),'tint':tint}
    for item in data['items']:
        layers=item.get('textureLayers',[])
        # This AE version's ItemBlock icon getter returns metadata-zero textures
        # for every variant. Suppress these proven-wrong previews until rendered.
        if item.get('itemClass')=='appeng.common.base.AppEngMultiItemBlock' and item['metadata']!='0':layers=[]
        if not layers:
            if not item.get('image'):report['missing'].append({'ref':item['ref'],'reason':'Custom renderer or no texture reference'})
            continue
        signature=dump(layers)
        if signature not in cache:
            try:
                decoded=[layer(v) for v in layers];size=max(max(im.size) for im,_ in decoded)
                result=Image.new('RGBA',(size,size))
                for im,_ in decoded:result.alpha_composite(im.resize((size,size),Image.Resampling.NEAREST))
                filename=hashlib.sha256(signature.encode()).hexdigest()[:20]+'.png';result.save(output/filename)
                cache[signature]='images/runtime/'+filename
                report['assets'][filename]=[provenance for _,provenance in decoded]
            except (ValueError,OSError,KeyError) as e:cache[signature]={'error':str(e)}
        value=cache[signature]
        if isinstance(value,dict):report['missing'].append({'ref':item['ref'],'reason':value['error']});continue
        item['image']=value;item['imageType']='source texture preview';report['mapped']+=1
    data['summary']['images']=sum(bool(i.get('image')) for i in data['items'])
    data['summary']['imageAssets']=len(report['assets'])
    args.catalog.write_text(dump(data),encoding='utf-8')
    (ROOT/'audit/image-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps({'images':data['summary']['images'],'uniqueAssets':len(report['assets']),'missing':len(report['missing'])}))
    for z in archives.values():z.close()

if __name__=='__main__':main()
