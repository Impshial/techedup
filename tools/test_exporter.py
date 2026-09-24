from pathlib import Path
import subprocess
ROOT=Path(__file__).resolve().parents[1]
PRISM=Path(r'C:\Users\impsh\AppData\Roaming\PrismLauncher')
JDK=Path(r'C:\Program Files\Eclipse Adoptium\jdk-8.0.462.8-hotspot\bin')
cp=';'.join(str(p) for p in [ROOT/'exporter/build',PRISM/'libraries/net/minecraftforge/forge/1.6.4-9.11.1.965/forge-1.6.4-9.11.1.965-universal.jar',PRISM/'libraries/com/google/code/gson/gson/2.2.2/gson-2.2.2.jar',next((PRISM/'libraries/org/lwjgl/lwjgl/lwjgl').rglob('lwjgl-*.jar'))])
out=ROOT/'exporter/test-build';out.mkdir(exist_ok=True)
subprocess.run([str(JDK/'javac.exe'),'-source','7','-target','7','-cp',cp,'-d',str(out),str(ROOT/'exporter/test/techit/export/ExporterTest.java')],check=True)
subprocess.run([str(JDK/'java.exe'),'-cp',str(out)+';'+cp,'techit.export.ExporterTest'],check=True)
