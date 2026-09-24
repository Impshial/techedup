import { key } from './planner.js?v=6';

// Save the displayed material lists, including recipe choices and inventory deductions.
// Totals deliberately sum those snapshots without replanning or sharing leftovers.
export function createBuildList() {
  let entries = [], nextId = 1;
  return {
    get entries() { return structuredClone(entries); },
    get size() { return entries.length; },
    add(target, quantity, result) {
      const entry = structuredClone({ id: nextId++, target, quantity,
        materials: result.materials, warnings: result.warnings });
      entries.push(entry);
      return entry.id;
    },
    remove(id) { entries = entries.filter(entry => entry.id !== id); },
    clear() { entries = []; },
    total() {
      const materials = new Map(), warnings = new Set();
      for (const entry of entries) {
        for (const material of entry.materials) {
          const identity = key(material.stack);
          const total = materials.get(identity) || { stack: structuredClone(material.stack), count: 0, reasons: new Set() };
          total.count += material.count;
          for (const reason of material.reasons) total.reasons.add(reason);
          materials.set(identity, total);
        }
        for (const warning of entry.warnings) warnings.add(warning);
      }
      return { materials: [...materials.values()].map(material => ({ ...material, reasons: [...material.reasons] })), warnings: [...warnings] };
    },
  };
}
