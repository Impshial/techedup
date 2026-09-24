"""Keep the installed GUI texture library for remaining machine adapters."""
from pathlib import Path
import hashlib,json,re,zipfile
ROOT=Path(__file__).resolve().parents[1]
manifest=json.loads((ROOT/'audit/manifest.json').read_text(encoding='utf-8'))
output=ROOT/'source/gui-assets';output.mkdir(parents=True,exist_ok=True)
records=[]
for archive in manifest['archives']:
    path=Path(archive['path'])
    if archive.get('nestedIn') or ('mods' not in path.parts and archive['file']!='minecraft-1.6.4-client.jar'):continue
    with zipfile.ZipFile(path) as jar:
        for entry in jar.namelist():
            if not entry.lower().endswith('.png') or not re.search(r'/(?:gui|guis|gfx)/',entry,re.I):continue
            data=jar.read(entry);digest=hashlib.sha256(data).hexdigest()
            target=output/(digest+'.png')
            if not target.exists():target.write_bytes(data)
            records.append({'archive':archive['file'],'entry':entry,'sha256':digest,'local':target.relative_to(ROOT).as_posix()})
(ROOT/'audit/gui-asset-inventory.json').write_text(json.dumps(records,indent=2),encoding='utf-8')
print('Archived',len(records),'GUI texture entries;',len({r['sha256'] for r in records}),'unique images.')
