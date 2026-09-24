# Teched Up Build List — Minecraft 1.6.4

A client mod that opens calculator exports as checklists in Minecraft. A **green checkmark** joins the pack's inventory tabs. **I** shows a compact checklist HUD on the right; change **Teched Up checklist** in Minecraft's Controls to rebind it. The default applies only when no saved binding exists. **J** is left available for JourneyMap.

## Install

1. Download [teched-up-build-list-0.4.0.jar](../dist/downloads/teched-up-build-list-0.4.0.jar).
2. With Minecraft closed, put the JAR in the TechIt-ng instance's `minecraft/mods` folder, replacing any older `teched-up-build-list` or `techit-build-list` JAR, then launch the game.

New installations create `minecraft/teched-up-builds` and its `.progress` folder on first load. Existing installations continue using `minecraft/techit-builds`, preserving lists, selection, and checks. **Open folder** always opens the active directory. Older `.techit.json` exports are still accepted. No server installation or recipe-exporter mod is required. It adds no blocks, items, or world data.

Built for Minecraft **1.6.4**, Forge **9.11.1.965**, and the TechIt-ng numeric item IDs. Inventory tabs use the shared tab API supplied by the installed Tinkers' Construct/Galacticraft versions. If the API is absent, use the configurable key instead.

## Import a list

1. In the calculator, choose **Export → Minecraft** beside **Add to build list** for the current plan, or inside **View total** for all saved plans.
2. Click **Open folder** in the mod and save or move the downloaded `.techedup.json` file there. This is `minecraft/teched-up-builds` for new installs or the existing `minecraft/techit-builds` folder on upgrades. Browsers normally download to Downloads unless configured to ask where to save.
3. Open the green checkmark tab, click **Refresh** (or **Lists** when another list is open), then choose the file. A single export opens automatically. A new export does not require a game restart.

For this existing PrismLauncher installation, the folder remains:

```text
%APPDATA%\PrismLauncher\instances\TechIt-ng\minecraft\techit-builds
```

Exports are named after their planned items, for example `Resonant Energy Cell.techedup.json` or `2x ME Controller + Pulverizer.techedup.json`. You can rename them to distinguish projects; keep the `.techedup.json` ending. **Reload** rereads an open file after replacing it. **Lists** returns to the file picker. Removed files disappear from both views while they are open. If the selected file is removed, the inventory view returns to the picker and the popup clears its items. **Reload** also clears an unavailable list; short status messages replace file paths, with technical details kept in the game log.

## Checklist HUD

- Press **I** to show the selected checklist while playing. Movement, mouse-look, mining, placing blocks and hotbar scrolling work normally.
- Press **I** again to enable the cursor for its controls. Press **I** or Escape to resume gameplay with the checklist still visible. Escape closes an open list dropdown first.
- Use **Materials** for checkable totals and **To Build** for target items and quantities. The last selected list is remembered across game sessions.
- In cursor mode, click the list-name dropdown to switch saved lists, click material rows to check them off, and scroll over the list or use Page Up/Page Down.
- **_** minimizes to the bottom right and immediately resumes gameplay. Press **I**, then click **Build list ^** to expand it. **x** hides the checklist completely.
- **Open calculator** opens the full inventory tab with the same list and progress.

The HUD temporarily hides while other screens are open and follows Minecraft's F1 setting. The in-game hint uses your configured key. Cursor mode releases the mouse for clicking; it does not pause the world.

## Use the checklist

- **Materials / To build** switches between gathering totals and target machines/items. To build is informational, without checkboxes.
- Click a row to mark it complete. Progress saves immediately and survives closing Minecraft.
- Search filters the current list; **Hide completed** hides checked rows. Scroll with the mouse wheel or Page Up/Page Down.
- Item icons use the game's renderer and exact exported metadata/NBT, including microblock materials. Fluid amounts are in mB. Item totals also show stack counts where useful.
- The inventory tab or **Inventory** button returns to the inventory; Escape closes the screen.
- In the master list picker, each checkbox reflects whether all materials are complete. Click the checkbox to mark or clear the whole material list; click its name to open it.

Progress is manual: version 0.4.0 does not count inventory contents or craft items. Each export is a snapshot of the calculator's **processed material totals**, even when the website's Ore Level display is checked. The mod neither recalculates recipes nor connects to the website. Use the same pack/configuration as the calculator because numeric IDs can differ between installations.

Progress files live under `.progress`, keyed by the export's SHA-256. `selection.json` remembers the last selected filename. Renaming an unchanged export preserves progress. Changing its contents starts a new checklist. Original exports are never modified, and deleting the mod leaves the lists and progress available.

## Build and test

From the repository root on Windows:

```powershell
python tools/build_build_list_mod.py
python tools/test_build_list_mod.py
node --test tests/minecraft-export.test.js
```

The build reads the existing PrismLauncher Minecraft, Forge, Gson, Guava, LWJGL, ASM, and TConstruct JARs. Set `PRISM_HOME` to a different PrismLauncher directory or `TECHIT_JDK` to a JDK 8 `bin` directory if needed. The configured instance name is `TechIt-ng`.

The output is `build-list-mod/teched-up-build-list-0.4.0.jar`, compiled as Java 7 bytecode. Copy a tested release into `dist/downloads/` to publish it with the site. Only this mod's own classes and metadata are distributed; generated Minecraft/Forge compile dependencies remain ignored local build files.

The offline integration test imports real calculator exports, restores exact typed NBT (including 64-bit values), tests saved progress, master completion, shared selection, popup bounds and scrolling, actual button hit areas, view/list switching, file deletion during an open GUI, failed reloads, progress preservation, HUD/cursor transitions, Escape and minimize behavior, old/new export filenames, upgrades with saved progress, and checks the packaged bytecode. HUD rendering and gameplay input still need an in-game check; the offline tests do not render a game window.

See [FORMAT.md](FORMAT.md) for the export contract.
