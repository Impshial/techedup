"""Build the static site from the latest staged runtime export and installed assets."""
from pathlib import Path
import os, subprocess, sys, importlib.util, json
ROOT=Path(__file__).resolve().parents[1]
image_python=sys.executable
if importlib.util.find_spec('PIL') is None:
    bundled=Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
    image_python=os.environ.get('TECHIT_IMAGE_PYTHON',str(bundled))
    if not Path(image_python).is_file():raise SystemExit('Pillow is required. Set TECHIT_IMAGE_PYTHON to a Python installation with Pillow.')
for exe,script in [(sys.executable,'import_runtime.py'),(image_python,'extract_runtime_images.py'),(sys.executable,'import_rendered_icons.py'),(image_python,'extract_recipe_guis.py')]:
    subprocess.run([exe,str(ROOT/'tools'/script)],cwd=ROOT,check=True)
catalog=ROOT/'source/runtime/catalog.json';data=json.loads(catalog.read_text(encoding='utf-8'))
from runtime_variants import normalize_material_variants, packed
data=normalize_material_variants(data)
catalog.write_text(packed(data),encoding='utf-8')
missing=[i['image'] for i in data['items'] if i.get('image') and not (ROOT/'dist'/i['image']).is_file()]
if missing:raise SystemExit('Image files missing: '+str(missing[:5]))
pending=ROOT/'dist/catalog.pending.json';pending.write_bytes(catalog.read_bytes());pending.replace(ROOT/'dist/catalog.json')
print('Website catalog updated:',data['summary']['recipes'],'recipe choices;',data['summary']['images'],'images.')
