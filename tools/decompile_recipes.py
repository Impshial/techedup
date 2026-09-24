"""Decompile the classes identified by the all-archive constant-pool audit."""
from pathlib import Path
import concurrent.futures, json, re, subprocess, shutil, sys
ROOT=Path(__file__).resolve().parents[1]
JAVA=r'C:\Program Files\Eclipse Adoptium\jdk-8.0.462.8-hotspot\bin\java.exe'
def run(a):
    names=sorted(set(n.split('$')[0].replace('/','.') for n in a['candidates']))
    if not names: return {'archive':a['file'],'status':'no keyword candidates','classes':0}
    dest=ROOT/'audit'/'decompiled'/re.sub(r'[^a-zA-Z0-9._-]','_',a['file'])
    dest.mkdir(parents=True,exist_ok=True)
    source=Path(a['path'])
    if source.suffix.lower()=='.zip':
        local=ROOT/'audit'/'jar-copies'/(dest.name+'.jar')
        local.parent.mkdir(parents=True,exist_ok=True); shutil.copyfile(source,local)
        source=local
    cmd=[JAVA,'-Xmx1200m','-jar',str(ROOT/'tools/vendor/cfr-0.152.jar'),str(source),'--outputdir',str(dest),'--jarfilter','('+'|'.join(re.escape(n) for n in names)+')','--silent','true','--clobber','true']
    try:
        r=subprocess.run(cmd,capture_output=True,text=True,timeout=240)
        (dest/'decompiler.log').write_text(r.stdout+r.stderr,encoding='utf-8')
        result={'archive':a['file'],'status':'finished' if r.returncode==0 else 'error','candidateTopLevelClasses':len(names),'sourceFiles':len(list(dest.rglob('*.java'))),'returncode':r.returncode}
    except Exception as e: result={'archive':a['file'],'status':'error','error':str(e)}
    print(json.dumps(result),flush=True)
    return result
if __name__=='__main__':
    manifest=json.loads((ROOT/'audit/manifest.json').read_text(encoding='utf-8'))
    archives=manifest['archives']
    if '--zip-only' in sys.argv: archives=[a for a in archives if a['path'].endswith('.zip')]
    if '--supplemental' in sys.argv: archives=[a for a in archives if a.get('nestedIn') or a['file']=='minecraft-1.6.4-client.jar']
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        results=list(pool.map(run,archives))
    filename='decompilation-zips.json' if '--zip-only' in sys.argv else 'decompilation.json'
    if '--supplemental' in sys.argv: filename='decompilation-supplemental.json'
    (ROOT/'audit'/filename).write_text(json.dumps(results,indent=2),encoding='utf-8')
