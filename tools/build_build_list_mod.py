"""Build a Java 7/SRG client mod against the installed 1.6.4 jars, without redistributing them."""
from pathlib import Path
import json, lzma, os, subprocess, zipfile

ROOT=Path(__file__).resolve().parents[1]
MOD=ROOT/'build-list-mod'
BUILD=MOD/'build'
BUILD.mkdir(parents=True,exist_ok=True)
PRISM=Path(os.environ.get('PRISM_HOME',str(Path.home()/'AppData/Roaming/PrismLauncher')))
JDK=Path(os.environ.get('TECHIT_JDK',r'C:/Program Files/Eclipse Adoptium/jdk-8.0.462.8-hotspot/bin'))
LIB=PRISM/'libraries'
FORGE=LIB/'net/minecraftforge/forge/1.6.4-9.11.1.965/forge-1.6.4-9.11.1.965-universal.jar'
MC=LIB/'com/mojang/minecraft/1.6.4/minecraft-1.6.4-client.jar'
ASM=LIB/'org/ow2/asm/asm-all/4.1/asm-all-4.1.jar'
GSON=LIB/'com/google/code/gson/gson/2.2.2/gson-2.2.2.jar'
LWJGL=next((LIB/'org/lwjgl/lwjgl/lwjgl').rglob('lwjgl-*.jar'))
MAPPING=BUILD/'minecraft-1.6.4.srg'
if not MAPPING.exists():
    with zipfile.ZipFile(FORGE) as jar:MAPPING.write_bytes(lzma.decompress(jar.read('deobfuscation_data-1.6.4.lzma')))
DEPS=BUILD/'minecraft-forge-srg.jar'

def run(*args):subprocess.run(list(map(str,args)),check=True,cwd=ROOT)

if not DEPS.exists() or DEPS.stat().st_mtime<max(p.stat().st_mtime for p in (MC,FORGE,MAPPING,MOD/'tools/Remap.java')):
    run(JDK/'javac.exe','-source','7','-target','7','-cp',ASM,'-d',BUILD,MOD/'tools/Remap.java')
    pending=BUILD/'minecraft-forge-srg.pending.jar'
    run(JDK/'java.exe','-cp',str(BUILD)+';'+str(ASM),'Remap',MAPPING,pending,MC,FORGE)
    pending.replace(DEPS)
CLASSES=BUILD/'classes';CLASSES.mkdir(exist_ok=True)
TCONSTRUCT=PRISM/'instances/TechIt-ng/minecraft/mods/TConstruct_mc1.6.4_EX.30.jar'
CP=';'.join(map(str,[DEPS,GSON,LWJGL,TCONSTRUCT]))
sources=sorted((MOD/'src').rglob('*.java'))
if sources:
    run(JDK/'javac.exe','-encoding','UTF-8','-source','7','-target','7','-cp',CP,'-d',CLASSES,*sources)
    info=[{'modid':'techitbuildlist','name':'TechIt Build List','version':'0.2.1','mcversion':'1.6.4',
           'description':'Client-side build lists exported by the TechIt calculator. Open with the configurable build-list key.'}]
    (CLASSES/'mcmod.info').write_text(json.dumps(info),encoding='utf-8')
    out=MOD/'techit-build-list-0.2.1.jar'
    with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as jar:
        for file in CLASSES.rglob('*'):
            if file.is_file():jar.write(file,file.relative_to(CLASSES).as_posix())
    print(out)
else:print('Compile dependencies ready:',DEPS)
