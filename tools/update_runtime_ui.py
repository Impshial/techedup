"""One-time UI migration from the old log-only preview to the runtime catalog."""
from pathlib import Path
p=Path(__file__).resolve().parents[1]/'dist/app.js'
s=p.read_text(encoding='utf-8')
start=s.index('function renderPlan() {');end=s.index('function renderView() {',start)
s=s[:start]+'''function renderPlan() {
  state.result = null;
  try { state.result = calculate(state.catalog, state.target, state.quantity, state); }
  catch (error) { $('#view').innerHTML = `<div class="notice">${html(error.message)}</div>`; return; }
  const result = state.result;
  const materials = result.materials.slice().sort((a,b) => names(a.stack).localeCompare(names(b.stack)));
  const missing = materials.filter(m => m.reasons.includes('missing')).length;
  const machines = [...new Set(result.steps.map(s => state.catalog.recipes.get(s.recipe).machine).filter(m => m !== 'Crafting'))];
  const warning = result.warnings.map(text => `<div class="notice">${html(text)}</div>`).join('');
  $('#view').innerHTML = `${warning}${missing ? `<div class="notice">${missing} ingredient type${missing === 1 ? '' : 's'} reached a branch without an imported production recipe. These are listed separately from confirmed gathering materials.</div>` : ''}<div class="plan-layout"><section class="card"><div class="card-head"><h3>Crafting & processing tree</h3><small>${fmt(result.steps.reduce((n,s) => n+s.runs,0))} batches</small></div><div class="card-body"><p class="help">Change a recipe or equivalent ingredient at any step. Fluids use millibuckets (mB).</p>${renderNode(result.tree)}</div></section><div class="supplies"><section class="card"><div class="card-head"><h3>Total materials</h3><small>${materials.length} types</small></div><div class="material-status"><span>${result.warnings.length || missing ? 'Some branches need review' : 'Combined across all branches'}</span></div><div class="card-body">${materials.length ? materials.map(s => `<div class="material-row">${icon(s.stack.ref)}<span class="name">${html(names(s.stack))}<span class="supply-type">${html(s.reasons.map(r => reasons[r]).join('; '))}</span></span><span class="count">${amount({...s.stack,count:s.count})}</span></div>`).join('') : '<p class="help">Your inventory covers the required materials.</p>'}<button id="copy-list" class="primary wide">Copy material list</button></div>${result.leftovers.length ? `<div class="leftovers"><b>Left over and guaranteed by-products</b><br>${result.leftovers.map(s => `${amount({...s.stack,count:s.count})} × ${html(names(s.stack))}`).join('<br>')}</div>` : ''}</section>${renderInventory()}</div></div>${machines.length ? `<div class="card card-body"><h3>Processes needed</h3><p>${machines.map(html).join(' · ')}</p></div>` : ''}<p class="plan-note">Whole batches, shared leftovers, returned containers, and reusable casts are included. Chance-based by-products are shown in recipe details and never counted as guaranteed materials. Machine construction and fuel selection are separate requirements. Coverage is still being checked against custom mod rules.</p>`;
}
function recipeCard(recipe,index) {
  const grid = recipe.grid;
  const quantities = new Map();
  for(const input of recipe.inputs) {
    const id=key(input)+(input.consume===false?'tool':''); const row=quantities.get(id)||{stack:input,count:0}; row.count+=input.count;quantities.set(id,row);
  }
  const buttons=[...quantities.values()].map(s => `<button class="ingredient-chip" data-item="${html(s.stack.ref)}">${amount({...s.stack,count:s.count})} × ${html(names(s.stack))}${s.stack.consume===false?' · reusable':''}${isGroup(s.stack.ref)?' · choose equivalent':''}</button>`).join('');
  const drawing=grid ? `<div class="craft-grid" style="grid-template-columns:repeat(${Math.max(...grid.map(r=>r.length))},1fr)">${grid.flat().map(s => `<div class="slot">${s?`<button data-item="${html(s.ref)}" title="${html(names(s))}" aria-label="Inspect ${html(names(s))}">${icon(s.ref)}</button>`:''}</div>`).join('')}</div>` : `<div class="machine-label">${html(recipe.machine)}</div>`;
  const outputCards=(recipe.outputs||[recipe.output]).map(s=>`<button class="ingredient-chip" data-item="${html(s.ref)}">${amount(s)} × ${html(names(s))}${s.chance!==undefined&&s.chance!==1?` · ${fmt(s.chance*100)}% chance`:''}</button>`).join('');
  return `<article class="recipe-card"><div class="recipe-top"><div><h3>${html(recipe.machine || recipe.type)}</h3><small>${html(recipe.source || '')}</small></div><button data-use-recipe="${recipe.id}" class="primary"${recipe.calculable?'':' disabled'}>Plan this recipe</button></div>${!recipe.calculable?'<div class="notice">Shown for reference. This output is probabilistic or its custom behavior needs verification before automatic planning.</div>':''}<div class="recipe-display">${drawing}<span class="recipe-arrow" aria-hidden="true">→</span><div class="recipe-result">${icon(recipe.output.ref,true)}<div><h4>${amount(recipe.output)} × ${html(names(recipe.output))}</h4><span class="id">${html(recipe.output.ref)}</span></div></div></div><h4>Ingredients</h4><div class="ingredient-list">${buttons}</div><h4>Outputs</h4><div class="ingredient-list">${outputCards}</div>${Object.keys(recipe.details||{}).length?`<p class="plan-note">${Object.entries(recipe.details).map(([k,v])=>html(k)+': '+html(v)).join(' · ')}</p>`:''}${(recipe.notes||[]).map(n=>`<p class="plan-note">${html(n)}</p>`).join('')}${recipe.output.nbt?`<details class="plan-note"><summary>Variant data (NBT)</summary><code>${html(recipe.output.nbt)}</code></details>`:''}</article>`;
}
''' + s[end:]
start=s.index('function showData() {');end=s.index('async function copyList()',start)
s=s[:start]+'''function showData() {
  const d=state.catalog.data,s=d.summary;
  const rows=[['Crafting records captured in game',s.runtimeCraftingRecords],['Imported processes',s.processes],['Output recipe choices',s.recipes],['Item, block & fluid variants',s.items],['Ore/alternative groups',s.oreGroups],['Available images',s.images]];
  openDialog('Runtime data & coverage',`<p>Source: <b>${html(s.source)}</b><br>${html(s.timestamp)}</p><table>${rows.map(([label,count])=>`<tr><td>${label}</td><td>${fmt(count)}</td></tr>`).join('')}</table><h3>Coverage in progress</h3><p>The catalog uses exact runtime item IDs, metadata, NBT and display names. Machine recipes come from the loaded registries. ${fmt(s.unhandledRecords)} records still need separate handling or are display-only examples; these are not silently treated as working recipes.</p><details><summary>Imported registries</summary><table>${Object.entries(s.byRegistry||{}).map(([k,v])=>`<tr><td>${html(k)}</td><td>${fmt(v)}</td></tr>`).join('')}</table></details><h3>Images</h3><p>Images are matched by the game's texture names and item variants. A question mark means an image is still unavailable. Texture previews can differ from custom-rendered items or 3D block icons.</p><p class="id">Snapshot SHA-256: ${html(s.sha256)}</p>`);
}
''' + s[end:]
s=s.replace("'Source: minetweaker_new.log. Smelting and machine recipes are not included.'","'Source: loaded TechIt-ng registries. Custom recipe coverage is still being checked.'")
s=s.replace("if (!d.item.startsWith('ore:') && !d.item.endsWith(':*'))", "if (!isGroup(d.item))")
s=s.replace("? requested : 'tile.workbench'", "? requested : (state.catalog.items.has('item:58:0') ? 'item:58:0' : state.catalog.data.items[0].ref)")
s=s.replace("$('#source-label').textContent = 'minetweaker_new.log';", "$('#source-label').textContent = 'Live game data · coverage in progress';")
s=s.replace('No recipe in this file','No imported recipe').replace('No uses in this file','No imported uses')
p.write_text(s,encoding='utf-8')
