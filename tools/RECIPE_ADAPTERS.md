# RF upgrades and item state

Verified against the installed CoFHCore 2.0.0.5 and Thermal Expansion 3.0.0.6 classes and the September 23, 23:46 runtime capture.

`cofh.util.UpgradeRecipe` extends Forge's `ShapedOreRecipe`. Its only override is the crafting result: it copies NBT from `upgradeSlot` using `ItemHelper.copyTag`, or returns the ordinary result when that slot has no NBT. It has no random output. The importer enables this exact class, validates the slot, and keeps the default ingredient's NBT so other container upgrades have a reproducible from-scratch path. Other classes containing `UpgradeRecipe` remain subject to their own adapter checks.

`BlockEnergyCell.initialize` registers the Resonant upgrade as four `ingotEnderium` entries surrounding a Reinforced Energy Cell, with one output. The input's stored RF is carried over, not generated. `ItemBlockEnergyCell` stores RF in `Energy`; facing, side configuration, transfer limits and redstone controls are operational state rather than different craftable materials.

`runtime_variants.py` runs after image import. It groups only the listed Thermal Expansion, Redstone Arsenal and Simply Jetpacks implementations. Capacitors and tools ignore only `Energy`; energy cells also ignore their known configuration fields. Numeric ID, metadata, and all other NBT remain distinct. In particular, material-specific microblocks, fluid contents, enchantments and unrelated mods are not collapsed. The group retains a real uncharged inventory render when available.

Recipe inputs, outputs, grids, returned containers and ore memberships are normalized together. Original references are saved as aliases for old history entries, favorites and owned inventory. The catalog represents crafting materials; it does not promise a fully charged output or add a fictitious charging recipe.

Regression checks:

```powershell
python -m unittest discover -s tests -p '*_test.py'
node --test tests/recipe-regressions.test.js tests/favorites.test.js
```
