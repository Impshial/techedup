export const key = s => s.ref + (s.nbt && !s.ref.includes('@') ? '\u001f' + s.nbt : '');
export const fromKey = value => { const [ref, ...nbt] = value.split('\u001f'); return { ref, count: 1, ...(nbt.length ? { nbt: nbt.join('\u001f') } : {}) }; };
export const base = ref => ref.replace(/@[^:]+$/, '').replace(/:(?:\d+|\*)$/, '');
export const titleCase = text => text.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[._]/g, ' ').replace(/^./, x => x.toUpperCase());

// Resource forms are supply boundaries in the processed-material view. Components
// (gears, circuits, tools and machines) still expand through their chosen recipes.
export function isProcessedMaterial(catalog, stack, recipe = null) {
  if (catalog.raw.has(stack.ref)) return false;
  return stack.ref.startsWith('fluid:')
    || catalog.roles(stack.ref).some(role => /^ore:(?:ingot|dust|gem|crystal|nugget|plate|sheet)[A-Z]|^ore:(?:plankWood|glass|glassHardened|itemRubber)$/.test(role))
    // Several AE/Tinkers materials have no ore tag. Match whole material names,
    // not microblocks or components whose names merely contain a material.
    || /(?:^|\s)(?:ingot|dust|powder|crystal|gem|nugget|plate|planks|brick)$|^(?:silicon|rubber|glass|plastic)$/i.test(catalog.item(stack.ref).name)
    // Untagged direct refining outputs are also materials. A furnace recipe
    // alone is insufficient: processors smelt assemblies and must still expand.
    || /^(?:Furnace|Redstone furnace|ProjectRed electric furnace|Pulverizer|Quartz grindstone|Sawmill)$/.test(recipe?.machine || recipe?.type || '')
      && recipe.inputs.length > 0 && recipe.inputs.filter(input=>input.consume!==false).every(input=>catalog.options(input).some(option=>catalog.raw.has(option.ref)));
}

export class Catalog {
  constructor(data) {
    this.data = data;
    this.aliases = data.aliases || {};
    this.items = new Map(data.items.map(item => [item.ref, item]));
    this.recipes = new Map(data.recipes.map(r => [r.id, r]));
    this.outputs = new Map(); this.outputRefs = new Map(); this.inputRefs = new Map();
    this.families = new Map(); this.oreMembership = new Map(); this.optionsCache = new Map();
    for (const item of data.items) {
      const family = base(item.ref);
      if (!this.families.has(family)) this.families.set(family, []);
      this.families.get(family).push({ ref: item.ref, count: 1 });
    }
    for (const [group, members] of Object.entries(data.ores)) for (const stack of members) {
      if (!this.oreMembership.has(stack.ref)) this.oreMembership.set(stack.ref, new Set());
      this.oreMembership.get(stack.ref).add(group);
    }
    for (const recipe of data.recipes) {
      const id = key(recipe.output);
      if (!this.outputs.has(id)) this.outputs.set(id, []);
      this.outputs.get(id).push(recipe);
      if (!this.outputRefs.has(recipe.output.ref)) this.outputRefs.set(recipe.output.ref, []);
      this.outputRefs.get(recipe.output.ref).push(recipe);
      for (const stack of recipe.inputs) {
        if (!this.inputRefs.has(stack.ref)) this.inputRefs.set(stack.ref, new Set());
        this.inputRefs.get(stack.ref).add(recipe.id);
      }
    }
    this.raw = new Set();
    for (const item of data.items) {
      const roles = this.roles(item.ref);
      const natural = roles.some(role => /^ore:(ore[A-Z]|crop[A-Z]|treeLeaves$|treeSapling$|dustRedstone$)/.test(role))
        || roles.includes('ore:logWood') && !/quarter|plank|stripped|slab|panel|cover|hollow/i.test(item.name)
        || ['item:3:0','item:4:0','item:12:0','item:13:0','item:263:0','item:264:0','item:368:0','item:388:0','item:331:0','item:352:0','item:287:0','item:289:0','item:337:0','fluid:1'].includes(item.ref);
      const ingot = roles.find(role => /^ore:ingot[A-Z]/.test(role));
      const recipes = this.forItem(item.ref);
      // An ingot made only by packing/unpacking is a supply boundary. Alloys with
      // actual material inputs still expand; missing smelting is not fabricated.
      const conversionOnly = ingot && recipes.every(recipe => recipe.inputs.every(input => {
        const allowed = ['ore:ingot', 'ore:nugget', 'ore:block'].map(prefix => prefix + ingot.slice('ore:ingot'.length));
        return input.ref === item.ref || allowed.includes(input.ref) || this.roles(input.ref).some(role => allowed.includes(role));
      }));
      if (natural || data.version < 3 && conversionOnly) this.raw.add(item.ref);
    }
    this.depth = new Map();
    for (const recipe of data.recipes) for (const input of recipe.inputs) for (const option of this.options(input)) {
      if (this.raw.has(option.ref)) this.depth.set(key(option), 0);
      else if (!this.forStack(option).length) this.depth.set(key(option), 1000);
    }
    for (let pass = 0; pass < 32; pass++) {
      let changed = false;
      for (const recipe of data.recipes) {
        if (!recipe.calculable || this.item(recipe.output.ref).ambiguous) continue;
        const value = this.recipeDepth(recipe);
        if (value < (this.depth.get(key(recipe.output)) ?? Infinity)) { this.depth.set(key(recipe.output), value); changed = true; }
      }
      if (!changed) break;
    }
  }
  item(ref) {
    ref = this.canonicalRef(ref);
    return this.items.get(ref) || { ref, name: ref.startsWith('ore:') ? titleCase(ref.slice(4)) : ref.startsWith('alternatives:') ? 'Equivalent ingredients' : ref.endsWith(':*') ? (this.items.get(base(ref)+':0')?.name || base(ref)) + ' (any variant)' : ref, kind: ref.startsWith('ore:') ? 'ore group' : 'item' };
  }
  roles(ref) { return [...new Set([...(this.oreMembership.get(ref) || []), ...(this.oreMembership.get(ref.replace(/@[^:]+$/, '')) || []), ...(this.oreMembership.get(base(ref) + ':*') || [])])]; }
  canonicalRef(ref) { return this.aliases[ref] || ref; }
  canonicalStack(stack) {
    const ref = this.canonicalRef(stack.ref);
    if (ref === stack.ref) return stack;
    const result = { ...stack, ref }; delete result.nbt;
    if (this.items.get(ref)?.nbt) result.nbt = this.items.get(ref).nbt;
    return result;
  }
  canonicalInventory(inventory = {}) {
    const result = {};
    for (const [id, count] of Object.entries(inventory)) {
      const canonical = key(this.canonicalStack(fromKey(id)));
      if (Number.isSafeInteger(count) && count > 0) result[canonical] = (result[canonical] || 0) + count;
    }
    return result;
  }
  forItem(ref) { return this.outputRefs.get(this.canonicalRef(ref)) || []; }
  forStack(stack) { return this.outputs.get(key(this.canonicalStack(stack))) || []; }
  options(stack) {
    stack = this.canonicalStack(stack);
    const identity = key(stack);
    if (this.optionsCache.has(identity)) return this.optionsCache.get(identity);
    let values;
    if (stack.ref.startsWith('ore:') || stack.ref.startsWith('alternatives:')) values = this.data.ores[stack.ref] || [];
    else if (stack.ref.endsWith(':*')) values = this.families.get(base(stack.ref)) || [];
    else return [stack];
    values = values.flatMap(s => s.ref.endsWith(':*') ? (this.families.get(base(s.ref)) || []).map(v => ({ ...v, ...(s.nbt ? { nbt: s.nbt } : {}) })) : [s]);
    values = values.map(s => ({ ...s, count: 1, ...(stack.nbt ? { nbt: stack.nbt } : {}) }));
    const result = [...new Map(values.map(s => [key(s), s])).values()];
    this.optionsCache.set(identity, result);
    return result;
  }
  recipeDepth(recipe) {
    if (!recipe.calculable) return Infinity;
    const values = recipe.inputs.map(s => Math.min(...this.options(s).map(o => this.item(o.ref).ambiguous ? Infinity : this.depth.get(key(o)) ?? Infinity)));
    return 1 + Math.max(0, ...values);
  }
  uses(ref) {
    ref = this.canonicalRef(ref);
    const refs = new Set([ref, base(ref) + ':*', ...this.roles(ref)]);
    const ids = new Set([...refs].flatMap(r => [...(this.inputRefs.get(r) || [])]));
    return [...new Map([...ids].map(id => this.recipes.get(id)).map(r => [r.processId || r.id,r])).values()];
  }
}

export function calculate(catalog, target, amount, preferences = {}) {
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1000000) throw new Error('Choose a whole number from 1 to 1,000,000.');
  const choices = preferences.recipes || {};
  const members = preferences.members || {};
  const inventory = new Map(Object.entries(catalog.canonicalInventory(preferences.inventory)));
  const extras = new Map(), totals = new Map(), warnings = new Set(), steps = [], used = new Map(), reusable = new Map(), durability = new Map();
  let nodes = 0;
  function draw(pool, id, wanted) {
    const n = Math.min(pool.get(id) || 0, wanted);
    if (n) pool.set(id, pool.get(id) - n);
    return n;
  }
  function supply(node, reason) {
    node.status = reason;
    if (!node.need) return node;
    const id = key(node.stack);
    const entry = totals.get(id) || { stack: node.stack, count: 0, reasons: new Set() };
    entry.count += node.need; entry.reasons.add(reason); totals.set(id, entry);
    return node;
  }
  function chooseMember(input, path) {
    const options = catalog.options(input);
    const preferred = options.find(s => key(s) === members[key(input)]);
    if (preferred) return preferred;
    const priority = stack => (path.has(key(stack)) ? 1e8 : 0) + (catalog.item(stack.ref).ambiguous ? 1e7 : 0)
      - ((inventory.get(key(stack)) || 0) > 0 || input.toolDamage && (durability.get(key(stack)) || 0) > 0 ? 1e6 : 0) + (catalog.depth.get(key(stack)) ?? 10000);
    return options.slice().sort((a, b) => priority(a) - priority(b))[0];
  }
  function expand(stack, wanted, path, level, source = null) {
    if (!Number.isSafeInteger(wanted) || wanted > 1e12) throw new Error('This plan is too large. Reduce the target quantity.');
    const id = key(stack);
    const have = draw(inventory, id, wanted);
    const reused = draw(extras, id, wanted - have);
    const node = { stack, wanted, have, reused, need: wanted - have - reused, children: [], source };
    if (have) used.set(id, (used.get(id) || 0) + have);
    if (!node.need) { node.status = 'owned'; return node; }
    if (++nodes > 1800 || level > 40) { warnings.add('The expansion limit was reached. Remaining branches need review.'); return supply(node, 'limit'); }
    const preferred = choices[id];
    if (preferred === 'supply') return supply(node, 'chosen');
    if (catalog.item(stack.ref).ambiguous) { warnings.add('A shared item identifier needs an ID mapping before its recipe can be expanded accurately.'); return supply(node, 'ambiguous'); }
    if (!preferred && catalog.raw.has(stack.ref)) return supply(node, 'basic');
    if (path.has(id)) { warnings.add('A recipe loop needs an external supply or a different recipe choice.'); return supply(node, 'cycle'); }
    const methods = catalog.forStack(stack);
    if (!methods.length) return supply(node, 'missing');
    const valid = methods.filter(r => r.calculable);
    const selected = methods.find(r => r.id === preferred);
    if (selected && !selected.calculable || !valid.length) { warnings.add('Automatic planning is unavailable for this recipe.'); return supply(node, 'invalid'); }
    const score = recipe => (catalog.recipeDepth(recipe) === Infinity ? 10000 : catalog.recipeDepth(recipe)) + recipe.inputs.length / 100;
    const recipe = selected || valid.slice().sort((a, b) => score(a) - score(b))[0];
    if (preferences.materialLevel === 'processed' && level > 0 && isProcessedMaterial(catalog, stack, recipe)) return supply(node, 'processed');
    node.recipe = recipe; node.runs = Math.ceil(node.need / recipe.output.count);
    node.produced = node.runs * recipe.output.count; node.extra = node.produced - node.need; node.status = 'craft';
    const nextPath = new Set(path); nextPath.add(id);
    const inputs = new Map();
    for (const input of recipe.inputs) {
      const resolved = chooseMember(input, nextPath);
      const actual = resolved || input;
      const identity = key(actual) + '\u001e' + key(input) + (input.consume === false ? '\u001etool' : '');
      const entry = inputs.get(identity) || { stack: actual, source: input, count: 0, uses: 0, unresolved: !resolved, reusable: input.consume === false };
      entry.count += input.count * (input.consume === false ? 1 : node.runs);
      entry.uses += (input.toolDamage || 0) * input.count * node.runs;
      inputs.set(identity, entry);
    }
    for (const input of inputs.values()) {
      if (input.unresolved) {
        warnings.add('An ingredient group has no usable members after excluded Null items were removed.');
        node.children.push(supply({ stack: input.stack, source: input.source, wanted: input.count, need: input.count, children: [] }, 'unresolved'));
      } else if (input.reusable) {
        const tool = catalog.item(input.stack.ref);
        if (input.uses && tool.maxDamage > 0) {
          // Crafting returns the damaged saw; Forge discards it above maxDamage.
          // Retain its remaining uses across branches, including owned tools.
          const capacity = tool.maxDamage + 1 - Number(tool.metadata || 0);
          const remaining = durability.get(key(input.stack)) || 0;
          const retainedUses = Math.min(remaining, input.uses);
          const acquire = Math.ceil((input.uses - retainedUses) / capacity);
          const child = expand(input.stack, acquire, nextPath, level + 1, input.source);
          durability.set(key(input.stack), remaining + acquire * capacity - input.uses);
          child.wanted = acquire + (retainedUses ? 1 : 0);
          child.reusable = true; child.toolUses = input.uses; child.retained = retainedUses ? 1 : 0;
          node.children.push(child);
          continue;
        }
        const held = reusable.get(key(input.stack)) || 0;
        const child = expand(input.stack, Math.max(0, input.count - held), nextPath, level + 1, input.source);
        child.wanted = input.count; child.reusable = true; child.retained = Math.min(held,input.count);
        reusable.set(key(input.stack), Math.max(held,input.count));
        node.children.push(child);
      } else node.children.push(expand(input.stack, input.count, nextPath, level + 1, input.source));
    }
    // Extras cannot feed the prerequisites that are needed to create this batch.
    if (node.extra) extras.set(id, (extras.get(id) || 0) + node.extra);
    for (const out of recipe.outputs || []) if (key(out) !== id && (out.chance ?? 1) === 1) extras.set(key(out),(extras.get(key(out)) || 0)+out.count*node.runs);
    for (const returned of recipe.returns || []) extras.set(key(returned),(extras.get(key(returned)) || 0)+returned.count*node.runs);
    steps.push({ stack, recipe: recipe.id, runs: node.runs, produced: node.produced });
    return node;
  }
  const tree = expand(catalog.canonicalStack(target), amount, new Set(), 0);
  return { tree, materials: [...totals.values()].map(t => ({ ...t, reasons: [...t.reasons] })), warnings: [...warnings], steps,
    leftovers: [...extras].filter(([, count]) => count).map(([id, count]) => ({ stack: fromKey(id), count })),
    usedInventory: [...used].map(([id, count]) => ({ stack: fromKey(id), count })) };
}

export function calculateMaterialViews(catalog, target, amount, preferences = {}) {
  const ore = calculate(catalog, target, amount, { ...preferences, materialLevel: 'ore' });
  const products = new Map(), extraOrigins = new Map();
  function takeOrigins(id, count) {
    const sources = new Set(), batches = extraOrigins.get(id) || [];
    while(count > 0 && batches.length) {
      const batch = batches[0], taken = Math.min(count, batch.count);
      for(const source of batch.sources) sources.add(source);
      count -= taken;batch.count -= taken;if(!batch.count)batches.shift();
    }
    return sources;
  }
  function saveOrigins(stack, count, sources) {
    if(!count)return;
    const id=key(stack), batches=extraOrigins.get(id) || [];
    batches.push({count,sources:new Set(sources)});extraOrigins.set(id,batches);
  }
  function trace(node, product = null, root = true) {
    // Retain the outer material (ingot), rather than replacing it with each
    // intermediate along its processing chain (dust, molten metal, etc.).
    if (!product && !root && node.recipe && isProcessedMaterial(catalog, node.stack, node.recipe)) product = node.stack;
    const sources=takeOrigins(key(node.stack),node.reused || 0), fresh=new Set();
    if(node.recipe) {
      for(const child of node.children) for(const source of trace(child,product,false)) fresh.add(source);
      saveOrigins(node.stack,node.extra,fresh);
      for(const out of node.recipe.outputs || []) if(key(out)!==key(node.stack) && (out.chance ?? 1)===1) saveOrigins(out,out.count*node.runs,fresh);
      for(const out of node.recipe.returns || []) saveOrigins(out,out.count*node.runs,fresh);
      for(const source of fresh)sources.add(source);
    } else if(node.need) sources.add(key(node.stack));
    if(product) for(const source of sources) {
      const targets=products.get(source) || new Map();
      if(key(product)!==source)targets.set(key(product),product);
      products.set(source,targets);
    }
    return sources;
  }
  trace(ore.tree);
  ore.materials = ore.materials.map(material => ({ ...material, products: [...(products.get(key(material.stack))?.values() || [])] }));
  const processed = calculate(catalog, target, amount, { ...preferences, materialLevel: 'processed' });
  return { ore, processed };
}
