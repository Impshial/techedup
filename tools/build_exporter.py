from pathlib import Path
import json, re, subprocess, zipfile
ROOT=Path(__file__).resolve().parents[1]
PRISM=Path(r'C:\Users\impsh\AppData\Roaming\PrismLauncher')
JDK=Path(r'C:\Program Files\Eclipse Adoptium\jdk-8.0.462.8-hotspot\bin')
build=ROOT/'exporter/build'
build.mkdir(parents=True,exist_ok=True)
mapping={}
for line in (ROOT/'audit/minecraft-1.6.4.srg').read_text().splitlines():
    p=line.split()
    if p[0]=='CL:':
        mapping['class.'+p[2].replace('/','.')]=p[1].replace('/','.')
        mapping['className.'+p[1].replace('/','.')]=p[2].replace('/','.')
    elif p[0]=='FD:':
        obf=p[1].split('/')[-1];srg=p[2].split('/')[-1]
        mapping['field.'+srg]=obf
        mapping['fieldName.'+p[1].replace('/','.')]=srg
    elif p[0]=='MD:': mapping['method.'+p[3].split('/')[-1]]=p[1].split('/')[-1]
(build/'techit-mappings.properties').write_text('\n'.join(k+'='+v for k,v in sorted(mapping.items())),encoding='ascii')
ids={}
for p in (ROOT/'audit/decompiled').rglob('*.java'):
    text=p.read_text(encoding='utf-8')
    if 'loadCraftingRecipes' not in text: continue
    package=re.search(r'^package ([\w.]+);',text,re.M)
    if not package: continue
    values=set(re.findall(r'output[Ii][Dd]\.equals\("([a-zA-Z0-9._-]+)"\)',text))
    values-= {'item','liquid'}
    if values: ids[package[1]+'.'+p.stem]=','.join(sorted(values))
(build/'techit-nei-identifiers.properties').write_text('\n'.join(k+'='+v for k,v in sorted(ids.items())),encoding='ascii')
forge=PRISM/'libraries/net/minecraftforge/forge/1.6.4-9.11.1.965/forge-1.6.4-9.11.1.965-universal.jar'
gson=PRISM/'libraries/com/google/code/gson/gson/2.2.2/gson-2.2.2.jar'
lwjgl=next((PRISM/'libraries/org/lwjgl/lwjgl/lwjgl').rglob('lwjgl-*.jar'))
cmd=[str(JDK/'javac.exe'),'-encoding','UTF-8','-source','7','-target','7','-classpath',';'.join(map(str,[forge,gson,lwjgl])),'-d',str(build),*map(str,(ROOT/'exporter/src/techit/export').glob('*.java'))]
subprocess.run(cmd,check=True)
(build/'mcmod.info').write_text(json.dumps([{'modid':'techitrecipeexport','name':'TechIt Recipe Export','version':'0.2.0','mcversion':'1.6.4','description':'Temporary registry and inventory-icon exporter. Rendering uses copied item stacks and a separate framebuffer.'}]),encoding='utf-8')
out=ROOT/'exporter/techit-recipe-export-0.2.0.jar'
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
    for p in build.rglob('*'):
        if p.is_file():z.write(p,p.relative_to(build).as_posix())
print(out)
