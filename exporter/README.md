# TechIt runtime exporter

For Minecraft 1.6.4, Forge 9.11.1.965, and this installation's inspected mod versions.

Version 0.2.0 is installed and produced `recipes-20260923-234649.json` plus its completed inventory-icon index. The run attempted 24,697 copied stacks, produced 24,585 images, and recorded 112 failed renders (110 transparent results and two invalid Botania color indices). Normalization merges duplicate raw NBT identities. The previous installed 0.1.1 JAR is backed up in `installed-0.1.1-backup.jar`.

## Capture

1. Close TechIt-ng normally, replace the old exporter with `techit-recipe-export-0.2.0.jar`, and launch the instance.
2. Load a world, open inventory once so NEI can populate its variants, then leave the world running.
3. `minecraft/techit-export/LATEST.txt` points to the timestamped registry snapshot. The initial registry read starts about ten seconds after world load and can briefly pause the game.
4. Icon rendering then runs in small batches on the client thread. `techit-export/icons/progress.json` reports progress; completed captures produce `icons/index.json`. Keep the world running until it is complete.
5. `FAILED.txt` reports a registry export failure; `ICONS_FAILED.txt` reports an icon-session failure. Individual icon failures are retained in the completed index rather than counted as successes. Check timestamps because older diagnostics may remain.

For another capture without a restart, create `techit-export/REQUEST_EXPORT`. A pending icon run finishes before the next request is processed. `additional-roots.json` can supply read-only reflection roots with `label`, `class`, and a `fields` path.

## What it reads

Crafting and furnace records, ore dictionary IDs/members, registered fluids and containers, loaded mods and Forge item ownership, explicit machine registries, and enumerable NEI display recipes are captured separately. Item names, numeric IDs, metadata, typed NBT, container returns, and texture references are preserved. Both NEI and creative subtype enumeration contribute item variants.

The icon exporter renders copied stacks through Minecraft/Forge's inventory renderer into a separate 64x64 framebuffer. PNGs are deduplicated by rendered pixel hash. The index retains the raw snapshot item key, allowing an exact metadata/NBT match. Fluid names, tint colors, and still-texture references are captured through Forge's fluid API.

The exporter registers no items, blocks, recipes, commands, or world generation. It reads recipe/item registries and writes diagnostic exports; it does not inspect player inventories or world chunks. The completed run verified inventory rendering for the installed pack, including Forge microblocks, Extra Utilities fences/jackets, and Applied Energistics blocks. Some world-only, transparent, or malformed stacks still do not produce an inventory image.

## Stage and import

Copy a completed snapshot into `source/runtime/`. Copy its matching icon index and PNG files into `source/runtime/icons/<snapshot filename without .json>/`. Then run:

```powershell
python tools/build_runtime.py
```

The importer refuses incomplete or mismatched icon indexes and verifies the snapshot hash. It joins each raw item key through normalized numeric ID/metadata/NBT, copies the corresponding PNG into the website, and writes `audit/rendered-image-report.json` with remaining gaps.

## Verification and limits

```powershell
python tools/build_exporter.py
python tools/test_exporter.py
```

The build uses the installed JDK 8, Forge, Gson, LWJGL, and Forge's SRG mappings. Offline checks cover serialization, variants, container-copy safety, ore-list identity, fluids, cycles, framebuffer row orientation, and PNG alpha. In-game evidence is retained in the staged snapshot and matching icon index; representative captured images were visually checked.

Captured registries are not necessarily calculable recipes. Adapters must verify quantities, catalysts, probabilities, energy, and dynamic rules. NEI may show examples or omit conditions. Cyclic/unsupported/bounded serialization results are explicit; `coverageComplete` remains false until unresolved systems are handled. These are local client recipes; a remote server can differ.
