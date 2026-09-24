import { key } from './planner.js?v=8';

// Save the displayed material lists, including recipe choices and inventory deductions.
// Totals deliberately sum those snapshots without replanning or sharing leftovers.
export function createBuildList() {
  let entries = [], nextId = 1;
  return {
    get entries() { return structuredClone(entries); },
    get size() { return entries.length; },
    add(target, quantity, result, levels = null) {
      const entry = structuredClone({ id: nextId++, target, quantity,
        materials: result.materials, warnings: result.warnings,
        ...(levels ? { levels: Object.fromEntries(Object.entries(levels).map(([level, view]) => [level, { materials: view.materials, warnings: view.warnings }])) } : {}) });
      entries.push(entry);
      return entry.id;
    },
    remove(id) { entries = entries.filter(entry => entry.id !== id); },
    clear() { entries = []; },
    total(oreLevel = false) {
      const materials = new Map(), warnings = new Set();
      for (const entry of entries) {
        const view = entry.levels?.[oreLevel ? 'ore' : 'processed'] || entry;
        for (const material of view.materials) {
          const identity = key(material.stack);
          const total = materials.get(identity) || { stack: structuredClone(material.stack), count: 0, reasons: new Set() };
          total.count += material.count;
          for (const reason of material.reasons) total.reasons.add(reason);
          if (material.products) {
            total.products = [...new Map([...(total.products || []), ...material.products].map(stack => [key(stack), structuredClone(stack)])).values()];
          }
          materials.set(identity, total);
        }
        for (const warning of view.warnings) warnings.add(warning);
      }
      return { materials: [...materials.values()].map(material => ({ ...material, reasons: [...material.reasons] })), warnings: [...warnings] };
    },
  };
}
