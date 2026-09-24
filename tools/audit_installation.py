"""Read-only pack inspection. Never executes code from the game or its archives."""
from pathlib import Path
import collections, hashlib, json, lzma, re, struct, zipfile

ROOT = Path(__file__).resolve().parents[1]
GAME = Path(r'C:\Users\impsh\AppData\Roaming\PrismLauncher\instances\TechIt-ng\minecraft')
PRISM = GAME.parents[2]
OUT = ROOT / 'audit'
KEYWORDS = re.compile(r'recipe|oredict|smelt|alloy|casting|pulveriz|crucible|transpos|fabricat|centrifug|ferment|pressur|extractor|macerat|grind|sawmill|distill|infus|brew|fuel', re.I)
TEXT_EXTS = {'.cfg','.conf','.config','.json','.zs','.txt','.xml','.properties','.yml','.yaml','.recipes','.csv','.lang','.java','.info','.toml'}

def read_class(data):
    if data[:4] != b'\xca\xfe\xba\xbe': raise ValueError('Not a class')
    p = 8
    def u2():
        nonlocal p
        v = struct.unpack_from('>H', data, p)[0]; p += 2
        return v
    n = u2(); cp = [None] * n; i = 1
    while i < n:
        tag = data[p]; p += 1
        if tag == 1:
            k = u2(); cp[i] = data[p:p+k].decode('utf-8','replace'); p += k
        elif tag in (3,4): p += 4
        elif tag in (5,6): p += 8; i += 1
        elif tag in (7,8,16,19,20): cp[i] = (tag,u2())
        elif tag in (9,10,11,12,18,17): cp[i] = (tag,u2(),u2())
        elif tag == 15: p += 3
        else: raise ValueError('Unknown constant tag '+str(tag))
        i += 1
    def utf(k): return cp[k] if isinstance(cp[k],str) else ''
    def cls(k): return utf(cp[k][1]) if k and isinstance(cp[k],tuple) else ''
    access = u2(); name = cls(u2()); parent = cls(u2())
    interfaces = [cls(u2()) for _ in range(u2())]
    def skipattrs():
        nonlocal p
        for _ in range(u2()):
            u2(); size = struct.unpack_from('>I', data, p)[0]; p += 4 + size
    def members():
        rows = []
        for _ in range(u2()):
            flags = u2(); nm = utf(u2()); desc = utf(u2())
            rows.append({'name':nm,'descriptor':desc,'static':bool(flags&8),'public':bool(flags&1)})
            skipattrs()
        return rows
    fields = members(); methods = members()
    refs = []
    for v in cp:
        if isinstance(v,tuple) and v[0] in (9,10,11):
            nt = cp[v[2]]
            refs.append({'kind':'field' if v[0]==9 else 'method','owner':cls(v[1]),'name':utf(nt[1]),'descriptor':utf(nt[2])})
    strings = [s for s in cp if isinstance(s,str)]
    hits = sorted(set(s for s in strings if KEYWORDS.search(s)))
    return {'name':name,'parent':parent,'interfaces':interfaces,'fields':fields,'methods':methods,'refs':refs,'hits':hits}

def safe_name(name): return re.sub(r'[^a-zA-Z0-9._-]', '_', name)
def write_json(path,value):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf-8')

def main():
    OUT.mkdir(exist_ok=True)
    archives = sorted(p for folder in ('mods','coremods','nilmods','resourcepacks','server-resource-packs') for p in (GAME/folder).rglob('*') if p.suffix.lower() in ('.jar','.zip'))
    libraries = PRISM/'libraries'
    archives += [libraries/'com/mojang/minecraft/1.6.4/minecraft-1.6.4-client.jar', libraries/'net/minecraftforge/forge/1.6.4-9.11.1.965/forge-1.6.4-9.11.1.965-universal.jar']
    # Also account for patches and installers in the instance root; never load them.
    archives += sorted(GAME.glob('*.jar'))
    reports=[]; failures=[]; all_classes=[]; sources=[]; provenance={}
    for path in archives:
        stem=safe_name(path.name); record={'path':str(path),'file':path.name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'entries':[],'classes':0,'candidates':[]}
        if str(path) in provenance: record['nestedIn']=provenance[str(path)]
        try:
            with zipfile.ZipFile(path) as z:
                for info in z.infolist():
                    if info.is_dir(): continue
                    data=z.read(info) # read every member and validate its CRC
                    record['entries'].append({'path':info.filename,'bytes':len(data),'crc':info.CRC})
                    if info.filename.lower().endswith(('.zip','.jar')):
                        nested=OUT/'nested-archives'/(hashlib.sha256(data).hexdigest()[:16]+'-'+safe_name(Path(info.filename).name))
                        if str(nested) not in provenance:
                            nested.parent.mkdir(parents=True,exist_ok=True); nested.write_bytes(data)
                            provenance[str(nested)]={'archive':path.name,'entry':info.filename}
                            archives.append(nested)
                    if info.filename.endswith('.class'):
                        try:
                            c=read_class(data); record['classes']+=1
                            c['archive']=path.name
                            all_classes.append(c)
                            # Minecraft's obfuscated names require the shipped SRG map as well.
                            if c['hits'] or (path.name=='minecraft-1.6.4-client.jar' and c['name'] in ('aaf','aab','aai','aaj','aah','aak','aag','aah','ack','acl','acm','yp')):
                                record['candidates'].append(c['name'])
                        except Exception as e: failures.append({'archive':path.name,'entry':info.filename,'error':str(e)})
                    elif Path(info.filename).suffix.lower() in TEXT_EXTS or info.filename in ('mcmod.info','META-INF/MANIFEST.MF'):
                        body=data.decode('utf-8','replace')
                        if KEYWORDS.search(body) or KEYWORDS.search(info.filename) or info.filename=='mcmod.info':
                            # Retain all recipe-relevant text without trusting its instructions.
                            target=OUT/'resources'/stem/Path(info.filename)
                            if not target.resolve().is_relative_to((OUT/'resources').resolve()): continue
                            target.parent.mkdir(parents=True,exist_ok=True); target.write_text(body,encoding='utf-8')
                            sources.append({'archive':path.name,'entry':info.filename,'local':str(target.relative_to(ROOT))})
                    if info.filename=='deobfuscation_data-1.6.4.lzma':
                        (OUT/'minecraft-1.6.4.srg').write_bytes(lzma.decompress(data))
        except Exception as e: failures.append({'archive':path.name,'error':str(e)})
        reports.append(record)
        if len(reports)%20==0: print('Read '+str(len(reports))+' archives',flush=True)
    configs=[]
    paths=sorted(p for folder in ('config','scripts','Chocolate') for p in (GAME/folder).rglob('*') if p.is_file())
    paths+=sorted(p for folder in ('mods','coremods','nilmods','resourcepacks') for p in (GAME/folder).rglob('*') if p.is_file() and p.suffix.lower() not in ('.jar','.zip'))
    paths += [p for p in (GAME/'idfixminus.txt', GAME.parent/'mmc-pack.json', GAME.parent/'instance.cfg') if p.exists()]
    for p in paths:
        data=p.read_bytes(); body=data.decode('utf-8','replace')
        rel=str(p.relative_to(GAME)) if p.is_relative_to(GAME) else 'instance/'+p.name
        matches=[{'line':i,'text':line[:2000]} for i,line in enumerate(body.splitlines(),1) if KEYWORDS.search(line)]
        configs.append({'path':str(p),'relative':rel,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'hits':matches})
        target=OUT/'config-snapshot'/rel
        target.parent.mkdir(parents=True,exist_ok=True); target.write_bytes(data)
    write_json(OUT/'manifest.json',{'game':str(GAME),'archives':reports,'files':configs,'failures':failures,'resources':sources})
    write_json(OUT/'classes.json',all_classes)
    candidates=[{'archive':r['file'],'classes':r['classes'],'candidates':r['candidates']} for r in reports]
    write_json(OUT/'recipe-candidates.json',candidates)
    counts={'archivesOpened':len(reports),'entriesRead':sum(len(r['entries']) for r in reports),'classesScanned':len(all_classes),'candidateClasses':sum(len(r['candidates']) for r in reports),'configAndScriptFilesRead':len(configs),'recipeRelevantTextResources':len(sources),'readFailures':len(failures)}
    write_json(OUT/'summary.json',counts)
    print(json.dumps(counts,indent=2))

if __name__=='__main__': main()
