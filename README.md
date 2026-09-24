# Teched Up recipe calculator

Static website for the installed Minecraft 1.6.4 TechIt-ng pack. Recipe data comes from the loaded game registries, backed by inspection of the installed mod code and configuration. Earlier MineTweaker log imports are obsolete.

The preview is served at http://127.0.0.1:4173/. Fresh visits start with no item selected. The index groups items by mod; newly selected plans start with only their root expanded. Browser Back/Forward and the named Back button restore previous item/tab views, quantities, recipe choices, searches, filters, and tree expansion. Reloading an existing history entry restores that view. Owned inventory remains shared across views during the session. Recipes and reverse uses include a process filter. Plans support quantities, recipe and ore-dictionary alternatives, reusable tools, guaranteed by-products, and owned inventory.

Interchangeable ingredients show their group and selection even when their branch is collapsed (for example, **Any wood planks**). Long pages expose a Back to Top arrow. Reviewed RF items share one material-planning entry across charge states; old variant references still resolve for navigation, favorites, and inventory. Crafting a cell does not generate RF: upgrades retain the input cell's energy.

Total materials starts at the processed level: ingots, dusts, crystals, planks, fluids, and similar resource forms. Components still expand into their materials. **Ore Level** switches to the full raw requirements and labels each raw material with the processed materials it contributes to, including reused processing leftovers. Materials used directly remain in either view. The page and Build list popup share this switch for the current session; new sessions start unchecked. Saved plans retain both calculations, recipe choices, and inventory deductions, so switching the combined list does not replan earlier entries. Copy follows the displayed view; every export format always uses processed material totals.

## Storage

There is no database server. `dist/catalog.json` is the normalized recipe catalog and `dist/recipe-layouts.json` describes the machine panels. PNG assets live under `dist/images/`. Exact numeric IDs, metadata, and normalized NBT identify item variants. Recipe choices and view state are saved in the tab's browser-history entries. Owned inventory lives in browser memory and resets on reload.

`source/runtime/recipes-*.json` retains original game snapshots. `source/runtime/catalog.json` is rebuilt from them; `audit/` stores source hashes, normalization exceptions, image provenance, and inspected code. Only `dist/` is served by the website.

## Minecraft build-list mod

The client-side [Teched Up Build List mod](build-list-mod/README.md) displays exported lists in a green checkmark tab beside the pack's inventory tabs. **I** shows a compact checklist HUD docked on the right while gameplay remains active. Press **I** again to use its controls; **I** or Escape returns to gameplay. It includes minimize, close, and **Open calculator** controls. Download the [1.6.4 mod JAR](dist/downloads/teched-up-build-list-0.4.0.jar) and put it in the instance's `minecraft/mods` folder before launching; replace older Teched Up or TechIt Build List JARs.

Choose **Export → Minecraft** for the current plan or combined Build list. Save the `.techedup.json` file into `minecraft/teched-up-builds`, then use **Refresh** in the mod. New installations create that folder and its progress directory on first load. Existing installations keep `minecraft/techit-builds` and continue to accept `.techit.json` files; **Open folder** opens the active location. Checkboxes persist across game sessions; no running website or server mod is required. See the [instructions and format documentation](build-list-mod/README.md) for details.

## Build and run

For the website, only Node.js is needed to validate the committed static files. Python can serve the local preview:

```powershell
npm run build
node --test tests/*.test.js
python -m unittest discover -s tests -p '*_test.py'
python -m http.server 4173 --bind 127.0.0.1 --directory dist
```

## Deploy with Vercel

1. In Vercel, choose **Add New → Project** and import `Impshial/techedup`.
2. Keep the root directory at the repository root. The checked-in `vercel.json` selects **Other**, runs `npm run build`, skips dependency installation, and serves `dist`.
3. Deploy. No environment variables, database, Python, Minecraft installation, or running game are required on Vercel.

Use the GitHub integration for deployments; the image collection exceeds Vercel's CLI source-file count limit. The settings follow [Vercel's project configuration](https://vercel.com/docs/project-configuration/vercel-json) and [deployment limits](https://vercel.com/docs/limits).

The build validates the committed catalog and all referenced images. It does not regenerate game data. Runtime source dumps and audit artifacts stay local and are excluded from Git.

## Updating game data locally

Run `npm run data:import` (or `python tools/build_runtime.py`) from the original workspace with its staged runtime snapshots, installation audit, and Minecraft assets. This reads the latest staged snapshot, extracts exact source textures, imports matching completed inventory renders, and reconstructs recipe panels. Pillow is required; the script can use the bundled runtime or `TECHIT_IMAGE_PYTHON`. These local inputs are deliberately not required for a fresh GitHub checkout to build or deploy. Commit the resulting `dist` changes to publish a new catalog.

## Current coverage

The September 23, 23:46 snapshot provides 24,673 item/block/fluid entries after grouping reviewed RF states, and 50,486 output recipe choices across 49,914 distinct processes. Twelve are smeltery alloying processes. There are 24,572 images, including 24,500 exact game-rendered entries, and 35 integrated recipe panels. Rebuilding after a new capture may change these counts.

The inspected Extra Utilities and Forge Multipart rules generate material-specific recipes for all 970 registered materials. Fences and pipe jackets preserve their exact material NBT. Cutting, thinning, hollowing, filling, and basic recombination expand to the actual source block; saw choices respect cutting strength and count durability across branches. Equivalent bulk and mixed-thickness gluing arrangements are currently represented by their basic recombination paths rather than every possible grid combination.

Alloying is listed before recycling/melting alternatives. Automatic planning favors paths to known gathering materials over paths ending at an intermediate whose production recipe is missing. Missing branches remain labeled; they are never silently called mineable resources.

Coverage is still incomplete. Some custom/NBT-dependent recipe handlers and directly implemented machine rules need semantic adapters. Captured NEI examples are corroborating evidence, not automatically working production recipes. Fuel, power, and machine construction are separate requirements; probabilistic by-products do not satisfy guaranteed requirements.

Exporter 0.2.0's live inventory capture is imported. The capture produced 24,585 raw-stack images; canonical NBT normalization initially maps 24,538 rendered variants, with subsequent RF grouping retaining 24,500 rendered entries. The 101 entries without an image comprise 96 transparent road-marking microblocks, four malformed/unconfigured placeholder stacks, and Pig Iron fluid, whose runtime texture name has no matching installed texture. The captured errors remain in `audit/rendered-image-report.json`; no substitute material images are invented. See `exporter/README.md` for capture and import details and `tools/RECIPE_ADAPTERS.md` for the RF upgrade adapter. No user-supplied image IDs are needed.
