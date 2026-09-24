# TechIt recipe calculator

Static website for the installed Minecraft 1.6.4 TechIt-ng pack. Recipe data comes from the loaded game registries, backed by inspection of the installed mod code and configuration. Earlier MineTweaker log imports are obsolete.

The preview is served at http://127.0.0.1:4173/. It starts with no item selected. The index groups items by mod; selected plans start with only their root expanded. Recipes and reverse uses include a process filter. Plans support quantities, recipe and ore-dictionary alternatives, reusable tools, guaranteed by-products, and owned inventory.

## Storage

There is no database server. `dist/catalog.json` is the normalized recipe catalog and `dist/recipe-layouts.json` describes the machine panels. PNG assets live under `dist/images/`. Exact numeric IDs, metadata, and normalized NBT identify item variants. Inventory and recipe choices currently live in browser memory and reset on reload.

`source/runtime/recipes-*.json` retains original game snapshots. `source/runtime/catalog.json` is rebuilt from them; `audit/` stores source hashes, normalization exceptions, image provenance, and inspected code. Only `dist/` is served by the website.

## Build and run

For the website, only Node.js is needed to validate the committed static files. Python can serve the local preview:

```powershell
npm run build
node --test tests/*.test.js
python -m http.server 4173 --bind 127.0.0.1 --directory dist
```

## Deploy with Vercel

1. In Vercel, choose **Add New → Project** and import `Impshial/techit`.
2. Keep the root directory at the repository root. The checked-in `vercel.json` selects **Other**, runs `npm run build`, skips dependency installation, and serves `dist`.
3. Deploy. No environment variables, database, Python, Minecraft installation, or running game are required on Vercel.

Use the GitHub integration for deployments; the image collection exceeds Vercel's CLI source-file count limit. The settings follow [Vercel's project configuration](https://vercel.com/docs/project-configuration/vercel-json) and [deployment limits](https://vercel.com/docs/limits).

The build validates the committed catalog and all referenced images. It does not regenerate game data. Runtime source dumps and audit artifacts stay local and are excluded from Git.

## Updating game data locally

Run `npm run data:import` (or `python tools/build_runtime.py`) from the original workspace with its staged runtime snapshots, installation audit, and Minecraft assets. This reads the latest staged snapshot, extracts exact source textures, imports matching completed inventory renders, and reconstructs recipe panels. Pillow is required; the script can use the bundled runtime or `TECHIT_IMAGE_PYTHON`. These local inputs are deliberately not required for a fresh GitHub checkout to build or deploy. Commit the resulting `dist` changes to publish a new catalog.

## Current coverage

The September 23, 23:46 snapshot provides 24,715 item/block/fluid variants and 50,486 output recipe choices across 49,914 distinct processes. Twelve are smeltery alloying processes. There are 24,614 images, including 24,538 exact game-rendered catalog variants, and 35 integrated recipe panels. Rebuilding after a new capture may change these counts.

The inspected Extra Utilities and Forge Multipart rules generate material-specific recipes for all 970 registered materials. Fences and pipe jackets preserve their exact material NBT. Cutting, thinning, hollowing, filling, and basic recombination expand to the actual source block; saw choices respect cutting strength and count durability across branches. Equivalent bulk and mixed-thickness gluing arrangements are currently represented by their basic recombination paths rather than every possible grid combination.

Alloying is listed before recycling/melting alternatives. Automatic planning favors paths to known gathering materials over paths ending at an intermediate whose production recipe is missing. Missing branches remain labeled; they are never silently called mineable resources.

Coverage is still incomplete. Some custom/NBT-dependent recipe handlers and directly implemented machine rules need semantic adapters. Captured NEI examples are corroborating evidence, not automatically working production recipes. Fuel, power, and machine construction are separate requirements; probabilistic by-products do not satisfy guaranteed requirements.

Exporter 0.2.0 is installed and its first live inventory capture is imported. The capture produced 24,585 raw-stack images; canonical NBT normalization merges duplicate stack identities into 24,538 rendered catalog variants. Remaining texture previews are labeled separately from inventory renders. The 101 entries without an image comprise 96 transparent road-marking microblocks, four malformed/unconfigured placeholder stacks, and Pig Iron fluid, whose runtime texture name has no matching installed texture. The captured errors remain in `audit/rendered-image-report.json`; no substitute material images are invented. See `exporter/README.md` for capture and import details. No user-supplied image IDs are needed.
