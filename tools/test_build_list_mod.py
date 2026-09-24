"""Compile and test the reader against an actual calculator export and real game NBT classes."""
from pathlib import Path
import subprocess, zipfile
ROOT=Path(__file__).resolve().parents[1]
# Build only when requested; importing this module is not needed by the website.
import build_build_list_mod as build
output=ROOT/'build-list-mod/test-build';output.mkdir(exist_ok=True)
subprocess.run(['node',str(ROOT/'build-list-mod/test/export-fixture.mjs')],check=True,cwd=ROOT)
cp=str(build.CLASSES)+';'+build.CP
build.run(build.JDK/'javac.exe','-encoding','UTF-8','-source','7','-target','7','-cp',cp,'-d',output,*sorted((ROOT/'build-list-mod/test/techit').rglob('*.java')))
build.run(build.JDK/'java.exe','-cp',str(output)+';'+cp,'techit.buildlist.BuildListTest',output,output/'from-calculator.techit.json')
with zipfile.ZipFile(ROOT/'build-list-mod/techit-build-list-0.1.0.jar') as jar:
    assert all(n.startswith('techit/buildlist/') or n=='mcmod.info' for n in jar.namelist()),'Third-party classes leaked into distribution'
    for name in jar.namelist():
        if name.endswith('.class'):assert int.from_bytes(jar.read(name)[6:8],'big')==51,'Requires Java newer than 7'
print('PASS: JAR contains only the mod and metadata, with Java 7 bytecode.')
