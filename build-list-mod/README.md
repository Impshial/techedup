# TechIt Build List — Minecraft 1.6.4

A client mod that opens calculator exports as checklists in Minecraft. The book tab joins the pack's existing inventory tabs. **J** also opens the screen; change “TechIt build lists” in Minecraft's Controls if that key is already assigned.

## Install

1. Download [techit-build-list-0.1.0.jar](../dist/downloads/techit-build-list-0.1.0.jar).
2. With Minecraft closed, put the JAR in the TechIt-ng instance's `minecraft/mods` folder, then launch the game.

The mod creates `minecraft/techit-builds` and `minecraft/techit-builds/.progress` on its first load. No server installation or recipe-exporter mod is required. It adds no blocks, items, or world data.

Built for Minecraft **1.6.4**, Forge **9.11.1.965**, and the TechIt-ng numeric item IDs. Inventory tabs use the shared tab API supplied by the installed Tinkers' Construct/Galacticraft versions. If the API is absent, use the configurable key instead.

## Import a list

1. In the calculator, choose **Export → Minecraft** beside **Add to build list** for the current plan, or inside **View total** for all saved plans.
2. Save or move the downloaded `.techit.json` file into `minecraft/techit-builds`. **Open folder** in the mod opens this exact directory. Browsers normally download to Downloads unless configured to ask where to save.
3. Open the book tab, click **Refresh**, then choose the file. A new export does not require a game restart.

For this PrismLauncher installation, the folder is:

```text
%APPDATA%\PrismLauncher\instances\TechIt-ng\minecraft\techit-builds
```

You can rename exports to distinguish projects; keep the `.techit.json` ending. **Reload** rereads an open file after replacing it. **Lists** returns to the file picker.

## Use the checklist

- **Materials / To build** switches between gathering totals and target machines/items.
- Click a row to mark it complete. Progress saves immediately and survives closing Minecraft.
- Search filters the current list; **Hide completed** hides checked rows. Scroll with the mouse wheel or Page Up/Page Down.
- Item icons use the game's renderer and exact exported metadata/NBT, including microblock materials. Fluid amounts are in mB. Item totals also show stack counts where useful.
- The inventory tab or **Inventory** button returns to the inventory; Escape closes the screen.

Progress is manual: version 0.1.0 does not count inventory contents or craft items. Each export is a snapshot of the calculator's **processed material totals**, even when the website's Ore Level display is checked. The mod neither recalculates recipes nor connects to the website. Use the same pack/configuration as the calculator because numeric IDs can differ between installations.

Progress files live under `.progress`, keyed by the export's SHA-256. Renaming an unchanged export preserves progress. Changing its contents starts a new checklist. Original exports are never modified, and deleting the mod leaves the lists and progress available.

## Build and test

From the repository root on Windows:

```powershell
python tools/build_build_list_mod.py
python tools/test_build_list_mod.py
node --test tests/minecraft-export.test.js
```

The build reads the existing PrismLauncher Minecraft, Forge, Gson, LWJGL, ASM, and TConstruct JARs. Set `PRISM_HOME` to a different PrismLauncher directory or `TECHIT_JDK` to a JDK 8 `bin` directory if needed. The configured instance name is `TechIt-ng`.

The output is `build-list-mod/techit-build-list-0.1.0.jar`, compiled as Java 7 bytecode. Copy a tested release into `dist/downloads/` to publish it with the site. Only this mod's own classes and metadata are distributed; generated Minecraft/Forge compile dependencies remain ignored local build files.

The offline integration test imports real calculator exports, restores exact typed NBT (including 64-bit values), tests file validation and saved progress, and checks the packaged bytecode. The book tab and empty list screen have also been confirmed in the installed game. Rendering and checking off a populated list still need an in-game check.

See [FORMAT.md](FORMAT.md) for the export contract.
