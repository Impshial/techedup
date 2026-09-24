# Minecraft build-list format, version 1

UTF-8 JSON with a `.techit.json` filename. Generate it using **Export → Minecraft**, not the calculator's general JSON option.

```json
{
  "format": "techit-minecraft-build-list",
  "version": 1,
  "minecraftVersion": "1.6.4",
  "modpack": "TechIt-ng",
  "scope": "current",
  "catalog": {"snapshot": null, "sha256": null},
  "plans": [
    {"ref": "item:917:4", "name": "Resonant Energy Cell", "quantity": 1,
     "kind": "item", "itemId": 917, "metadata": 4, "unit": "items",
     "chargeIndependent": true}
  ],
  "materials": []
}
```

The example illustrates the envelope and one target; real exports contain the calculated material rows. `scope` is `current` or `build`. `plans` preserves separate target entries; `materials` contains the displayed aggregated totals. This is a checklist, not a recipe graph.

Every row has `ref`, `name`, `quantity`, `kind`, and `unit`. Quantities are positive safe integers, at most 9,007,199,254,740,991. Materials may also include `reasons`, copied from the planner.

| Kind | Identity | Extra fields | Unit |
| --- | --- | --- | --- |
| `item` | `item:<id>:<metadata>` with optional `@<NBT hash>` | `itemId`, `metadata`, optional `nbt`, optional `chargeIndependent` | `items` |
| `fluid` | `fluid:<id>` | `fluidId`, optional `fluidName` (registry name preferred for lookup) | `mB` |
| `unresolved` | Unresolved catalog/group reference | No guessed numeric ID | `items` |

`nbt` is a **JSON string containing the catalog's typed NBT representation**. It is deliberately not decoded by JavaScript, so 64-bit integer literals retain their exact digits. A compound is an object of named tags; leaf tags use `{"type":"NBTTagInt","value":{"field_74748_a":123}}` and the equivalent SRG field for other scalar/array types. Lists use `{"type":"NBTTagList","value":[...]}`. The mod's `TypedNbt` decoder is the authoritative implementation. An item reference with an NBT hash must carry its NBT string.

`chargeIndependent` means the calculator groups the supported RF charge variants for material planning. It does not claim crafting produces a charged item. The exported NBT supplies the representative icon; the quantity is a count of items, not RF.

The importer checks the format/version, Minecraft version, positive integral quantities, and agreement between numeric fields and `ref`. Unknown kinds are rejected. Missing game items remain visible by their exported names. Limits are 4 MiB per file, 10,000 rows per section, 256 KiB per NBT string, and 32 levels of NBT nesting. Catalog provenance is retained for traceability; it is not a full installed-pack compatibility check.
