"""Import exact ID/metadata/NBT inventory renders from a matching runtime snapshot."""
from pathlib import Path
import argparse, hashlib, json, re, shutil
from import_runtime import ROOT, dump, ref_for

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--catalog',type=Path,default=ROOT/'source/runtime/catalog.json')
    parser.add_argument('--icons',type=Path)
    args=parser.parse_args()
    catalog=json.loads(args.catalog.read_text(encoding='utf-8'))
    snapshot=catalog['summary'].get('snapshot')
    if not snapshot:
        print('No snapshot identity; rebuild the runtime catalog first.');return
    directory=args.icons or ROOT/'source/runtime/icons'/Path(snapshot).stem
    index_path=directory/'index.json'
    if not index_path.is_file():
        print('Rendered icons pending for',snapshot);return
    index=json.loads(index_path.read_text(encoding='utf-8'))
    if index.get('format')!='techit-rendered-icons-v1' or not index.get('complete') or index.get('snapshot')!=snapshot:
        raise SystemExit('Icon index must be complete and match the catalog snapshot.')
    source=ROOT/'source/runtime'/snapshot
    if hashlib.sha256(source.read_bytes()).hexdigest()!=catalog['summary']['sha256']:
        raise SystemExit('Catalog snapshot hash mismatch.')
    raw=json.loads(source.read_text(encoding='utf-8'))
    items={i['ref']:i for i in catalog['items']}
    output=ROOT/'dist/images/rendered';output.mkdir(parents=True,exist_ok=True)
    report={'snapshot':snapshot,'mapped':0,'assets':{},'errors':index.get('errors',[]),'missing':[]}
    rendered_refs=set()
    for key,filename in index['icons'].items():
        if not re.fullmatch(r'[0-9a-f]{64}\.png',filename):raise ValueError('Unexpected rendered asset filename')
        value=raw['items'].get(key)
        if value is None:raise ValueError('Icon key absent from matching snapshot')
        item=items.get(ref_for(value))
        if item is None:continue # Wildcards and Null entries are not catalog items.
        original=directory/filename
        if not original.is_file():raise FileNotFoundError(original)
        if filename not in report['assets']:
            if original.read_bytes()[:8]!=b'\x89PNG\r\n\x1a\n':raise ValueError('Not a PNG: '+filename)
            shutil.copyfile(original,output/filename)
            report['assets'][filename]=hashlib.sha256(original.read_bytes()).hexdigest()
        item['image']='images/rendered/'+filename
        item['imageType']='in-game inventory render'
        rendered_refs.add(item['ref'])
    report['mapped']=len(rendered_refs)
    report['missing']=[i['ref'] for i in catalog['items'] if i['kind']!='fluid' and i.get('imageType')!='in-game inventory render']
    catalog['summary']['images']=sum(bool(i.get('image')) for i in catalog['items'])
    catalog['summary']['renderedImages']=report['mapped']
    args.catalog.write_text(dump(catalog),encoding='utf-8')
    (ROOT/'audit/rendered-image-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print('Imported',report['mapped'],'rendered variants;',len(report['missing']),'item variants still need rendering.')

if __name__=='__main__':main()
