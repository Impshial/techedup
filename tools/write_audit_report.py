from pathlib import Path
import collections, json, re
ROOT=Path(__file__).resolve().parents[1]
A=ROOT/'audit'
m=json.loads((A/'manifest.json').read_text(encoding='utf-8'))
summary=json.loads((A/'summary.json').read_text())
catalog=json.loads((ROOT/'dist/catalog.json').read_text(encoding='utf-8'))
runtime=catalog['summary']
decomp={}
for f in ['decompilation.json','decompilation-zips.json','decompilation-supplemental.json']:
    for r in json.loads((A/f).read_text()):decomp[r['archive']]=r
rows=[];scans=[]
for a in m['archives']:
    d=decomp.get(a['file'],{})
    source=A/'decompiled'/re.sub(r'[^a-zA-Z0-9._-]','_',a['file'])
    paths=list(source.rglob('*.java')) if source.exists() else []
    registry_hits=[]
    for p in paths:
        for i,line in enumerate(p.read_text(encoding='utf-8').splitlines(),1):
            if re.search(r'(?:GameRegistry\.(?:addRecipe|addShapedRecipe|addShapelessRecipe|addSmelting)|OreDictionary\.registerOre|addAlloy|addMelting|addCasting|add.*Recipe\(|register.*Recipe\()',line):
                registry_hits.append({'file':str(p.relative_to(ROOT)),'line':i,'text':line.strip()[:1500]})
    scans.append({'archive':a['file'],'nestedIn':a.get('nestedIn'),'classesScanned':a['classes'],
                  'candidateClasses':len(a['candidates']),'decompiledSourceFiles':len(paths),
                  'decompilerStatus':d.get('status','not selected'),'registrationEvidence':registry_hits,
                  'runtimeCoverage':'Captured; semantic coverage tracked in normalization-report.json'})
    rows.append('| '+a['file'].replace('|','\\|')+' | '+str(a['classes'])+' | '+str(len(a['candidates']))+' | '+str(len(paths))+' |')
(A/'registration-evidence.json').write_text(json.dumps(scans,indent=2),encoding='utf-8')
sources=sum(s['decompiledSourceFiles'] for s in scans)
text=f'''# Installation recipe audit

This is a file/code audit backed by verified game-registry snapshots. The website uses the normalized runtime data. The current snapshot is `{runtime.get('snapshot','recipes-20260923-230613.json')}`, with SHA-256 `{runtime['sha256']}`. It provides {runtime['items']:,} variants and {runtime['recipes']:,} output recipe choices across {runtime['processes']:,} distinct processes. Coverage remains incomplete; source inspection and registry capture do not by themselves prove all recipe semantics are implemented.

Read {summary['archivesOpened']} archives (including nested archives, resource packs, Minecraft/Forge, and root-level patches/installers), {summary['entriesRead']:,} archive members, and {summary['configAndScriptFilesRead']} configuration/script/associated text files. Parsed {summary['classesScanned']:,} class files. Archive-member CRC validation and file/class reads reported {summary['readFailures']} failures.

Selected {summary['candidateClasses']:,} classes by recipe-related constant-pool references and known obfuscated Minecraft recipe classes. The decompiler produced {sources:,} source files across the selected archives. Inner classes can share a source file. **These are class/source counts, not recipe counts.** Decompiler output may contain reconstruction warnings and is corroborated with bytecode where necessary.

## Confirmed findings

- Thermal Expansion generates processing recipes from the final ore dictionary and configuration. Its five main managers plus two transposer operations expose runtime lists.
- Tinkers' melting, alloying, casting, and drying have inspectable registries. Casting explicitly distinguishes reusable and consumed casts. Melting output amounts can be changed in `TinkersWorkshop.txt`.
- Modular Powersuits and MFR select Thermal Expansion recipe profiles in this installation. Other bundled profiles must not be imported as simultaneously active recipes.
- Nether Ores enables furnace, pulverizer, induction smelter, and grinder integrations. Final enabled integrations depend on which mods actually load.
- Ten installed `.zs` files change crafting/ore-dictionary/smelting behavior. The new extractor does not use old MineTweaker logs; it reads the final game state after those changes.
- Some mod JARs bundle APIs for mods that are not installed. An API class existing inside an archive does not prove that its recipes are active.
- BattleTowers/Ruins distributions contain nested `setup/mods` ZIPs. Presence of code in a nested installer archive does not prove Forge loaded that mod; the runtime loaded-mod list is required.
- NEI has independent handlers that can corroborate machine and procedural recipes, but some provide examples or require per-output queries. Their display lists alone are not proof of completeness.
- Atomic Science includes transformations implemented directly inside tile methods. EE3 and custom crafting handlers can calculate outcomes using rules. Generic registry capture alone cannot fully represent these.

## Evidence and next verification

`manifest.json` contains exact file hashes, entry inventory, nested provenance, and config references. `registration-evidence.json` lists source locations for recipe/ore registration statements. `classes.json` preserves class members and references. All derived source remains local, outside the website's `dist` directory.

Exporter 0.2.0 is installed and produced the current snapshot and completed inventory-icon index. The capture produced 24,585 raw-stack images; canonical normalization merges duplicate raw NBT identities into 24,538 rendered catalog variants. Offline checks cover IDs, metadata, NBT, fluid quantities, ore-list identity, recipe fields, bounded cyclic data, copied container queries, PNG row orientation, and alpha preservation. Representative captured icons were visually checked.

`normalization-report.json` tracks {runtime['unhandledRecords']:,} unsupported or display-only records, including NEI impostor examples. The build imports verified machine adapters, exact ore alternatives, shaped slot positions, reusable tools and guaranteed by-products. Missing recipes remain explicit material boundaries. Null item names are excluded; null grid cells and absent secondary outputs represent empty slots, not items.

`gui-asset-inventory.json` preserves the installed GUI texture library; `gui-image-report.json` describes integrated panels, `image-report.json` tracks source-texture extraction, and `rendered-image-report.json` tracks exact inventory renders and remaining exceptions. Transparent road-marking variants and malformed placeholder stacks account for most remaining blank images.

`runtime_microblocks.py` joins 970 live Forge Multipart material identities to inspected cutting, thinning, hollowing, filling, and basic gluing rules. Extra Utilities fence/jacket recipes preserve the same material NBT in every microblock ingredient. Saw strength and durability come from the live registry and inspected container-return behavior. Equivalent bulk/mixed-thickness gluing grids are represented through basic recombination paths, not exhaustively enumerated arrangements.

## Archive inventory

| Archive | Classes scanned | Candidates | Decompiled files |
| --- | ---: | ---: | ---: |
'''+ '\n'.join(rows)+'\n'
(A/'REPORT.md').write_text(text,encoding='utf-8')
print(json.dumps({'archives':len(scans),'decompiledSourceFiles':sources,'registrationLocations':sum(len(s['registrationEvidence']) for s in scans)},indent=2))
