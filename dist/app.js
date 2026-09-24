import { Catalog, calculate, key, fromKey } from './planner.js?v=6';
import { groupItemsByMod, renderRecipeDiagram, sortRecipeMethods } from './recipe-view.js?v=6';
import { createItemSearch } from './search.js?v=1';

const $ = selector => document.querySelector(selector);
const html = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => Number(n).toLocaleString();
const state = { catalog: null, ref: null, quantity: 1, tab: 'plan', query: '', craftable: false, itemLimit: 80, recipeLimit: 40, process: '', recipes: {}, members: {}, inventory: {}, result: null, target: null, layouts: {}, modOpen: {}, modLimits: {}, modGroups: [], expandedNodes: new Set(['0']) };
const names = stack => state.catalog.item(stack.ref).name;
const amount = stack => fmt(stack.count) + (stack.ref.startsWith('fluid:') ? ' mB' : '');
const isGroup = ref => ref.startsWith('ore:') || ref.startsWith('alternatives:') || ref.endsWith(':*');
function icon(ref, large = false) {
  const item = state.catalog.item(ref);
  return `<span class="icon${large ? ' large' : ''}" title="${html(item.image ? item.imageType : 'Image mapping needed')}" aria-hidden="true">${item.image ? `<img src="${html(item.image)}" alt="" loading="lazy">` : '<span class="unknown">?</span>'}</span>`;
}
function matches(query) {
  return state.findItems(query);
}
function modItems(group) {
  const limit=state.modLimits[group.name] || 60;
  return group.items.slice(0,limit).map(item => {
    const count=state.catalog.forItem(item.ref).length;
    return `<button class="item-button${item.ref===state.ref?' selected':''}" data-item="${html(item.ref)}" aria-pressed="${item.ref===state.ref}">${icon(item.ref)}<span class="item-name">${html(item.name)}</span>${count?`<span class="tiny-count">${count}</span>`:''}</button>`;
  }).join('')+(group.items.length>limit?`<button class="link-button mod-more" data-more-mod="${html(group.name)}">Show more · ${fmt(group.items.length-limit)}</button>`:'');
}
function renderIndex() {
  const items=matches(state.query).filter(item=>!state.craftable || state.catalog.forItem(item.ref).length);
  state.modGroups=groupItemsByMod(items);
  $('#result-count').textContent=fmt(items.length);$('#item-count').textContent=fmt(state.catalog.data.items.length);
  $('#item-list').innerHTML=state.modGroups.length?state.modGroups.map(group=>{
    const open=state.modOpen[group.name] ?? (!!state.query || group.items.some(i=>i.ref===state.ref));
    return `<details class="mod-group" data-mod="${html(group.name)}"${open?' open':''}><summary><span>${html(group.name)}</span><small>${fmt(group.items.length)}</small></summary><div class="mod-items">${open?modItems(group):''}</div></details>`;
  }).join(''):'<p class="empty">No matching items.</p>';
  $('#more-items').hidden=true;
}
function setTarget(ref, recipeId) {
  state.ref = ref;
  const methods = state.catalog.forItem(ref);
  const recipe = state.catalog.recipes.get(recipeId);
  const defaultStack = methods.find(r => !r.output.nbt)?.output || methods[0]?.output || { ref, count: 1 };
  state.target = { ...(recipe?.output.ref === ref ? recipe.output : defaultStack), count: 1 };
  if (recipe) state.recipes[key(state.target)] = recipe.id;
}
function select(ref, recipeId) {
  if (isGroup(ref)) return showAlternatives({ ref, count: 1 });
  setTarget(ref, recipeId); state.expandedNodes=new Set(['0']); state.quantity = 1; state.tab = 'plan'; state.recipeLimit = 40;state.process='';
  history.replaceState(null, '', '#' + encodeURIComponent(ref));
  renderIndex(); renderHeader(); renderView();
}
function renderHeader() {
  $('.tabs').hidden=false;
  const item=state.catalog.item(state.ref),count=state.catalog.forItem(state.ref).length;
  $('#selected').innerHTML=`<div class="selected-heading">${icon(state.ref,true)}<div class="selected-title"><h2>${html(item.name)}</h2><div class="item-meta"><span>${html(item.mod || '')}</span><span>${count} recipe${count===1?'':'s'}</span></div></div></div>`;
  $('#recipes-count').textContent=fmt(count);$('#uses-count').textContent=fmt(state.catalog.uses(state.ref).length);
}
function quantityControl() {
  return `<div class="quantity"><label for="quantity">Amount${state.ref.startsWith('fluid:')?' (mB)':''}</label><button data-quantity="-1" aria-label="Decrease quantity">−</button><input id="quantity" type="number" min="1" max="1000000" step="1" value="${state.quantity}" inputmode="numeric"><button data-quantity="1" aria-label="Increase quantity">+</button></div>`;
}
function recipeLabel(recipe) {
  const list = [...new Set(recipe.inputs.map(s => state.catalog.item(s.ref).name))];
  return `${recipe.machine || recipe.type} · makes ${amount(recipe.output)} · ${list.slice(0, 3).join(', ')}${list.length > 3 ? '…' : ''}`;
}
const reasons = { basic: 'Gather or mine', chosen: 'Obtain separately · your choice', missing: 'No recipe imported', ambiguous: 'Identity needs review', cycle: 'Recipe loop · external supply needed', unresolved: 'No usable member for this ingredient group', invalid: 'Custom or chance-based recipe · review required', limit: 'Expansion limit · review manually', owned: 'Covered by inventory, leftovers, or a reusable tool' };
function renderNode(node, level = 0, path = '0') {
  const identity = key(node.stack), methods = sortRecipeMethods(state.catalog.forStack(node.stack));
  const options = node.source ? state.catalog.options(node.source) : [];
  const description = (node.recipe ? `${node.recipe.machine || node.recipe.type} · ${fmt(node.runs)} batch${node.runs === 1 ? '' : 'es'} × ${amount(node.recipe.output)} output${node.extra ? ` · ${fmt(node.extra)} extra` : ''}` : reasons[node.status]) + (node.reusable ? ' · reusable tool/cast' : '');
  const line = `<div class="node-row">${icon(node.stack.ref)}<span class="node-name">${html(names(node.stack))}</span><span class="count">${amount({...node.stack,count:node.wanted})}</span></div>`;
  const controls = `<div class="node-controls">${methods.length ? `<select data-method="${html(identity)}" aria-label="Recipe for ${html(names(node.stack))}"><option value="">Automatic</option><option value="supply"${state.recipes[identity] === 'supply' ? ' selected' : ''}>Obtain separately</option>${methods.map(r => `<option value="${r.id}"${state.recipes[identity] === r.id ? ' selected' : ''}${!r.calculable ? ' disabled' : ''}>${html(recipeLabel(r))}${!r.calculable ? ' · needs review' : ''}</option>`).join('')}</select>` : ''}${options.length > 1 ? `<select data-member="${html(key(node.source))}" aria-label="Choose an equivalent ingredient">${options.map(s => `<option value="${html(key(s))}"${key(s) === identity ? ' selected' : ''}>${html(names(s))}</option>`).join('')}</select>` : ''}<button class="link-button" data-add-owned="${html(identity)}">I have some</button></div>`;
  const content = `<div class="node-detail">${html(description)}${node.have ? ` · ${fmt(node.have)} owned` : ''}${node.reused ? ` · ${fmt(node.reused)} from leftovers` : ''}</div>${controls}${node.recipe?renderRecipeDiagram(state.catalog,node.recipe,state.layouts,node):''}${node.children.length ? `<div class="tree">${node.children.map((s,i) => renderNode(s, level + 1,path+'.'+i)).join('')}</div>` : ''}`;
  return `<div class="node">${node.children.length ? `<details data-node="${path}"${state.expandedNodes.has(path) ? ' open' : ''}><summary>${line}</summary>${content}</details>` : line + content}</div>`;
}
function renderInventory() {
  return `<section class="card inventory"><details${Object.keys(state.inventory).length?' open':''}><summary>Materials you already have</summary><label for="inventory-search">Add an owned item</label><input id="inventory-search" type="search" placeholder="Search your materials…" autocomplete="off"><div id="inventory-matches"></div>${Object.entries(state.inventory).map(([id, count]) => `<div class="owned-row"><span>${html(names(fromKey(id)))}</span><input type="number" min="0" max="1000000000" value="${count}" step="1" data-owned="${html(id)}" aria-label="Owned ${html(names(fromKey(id)))}"><button data-remove-owned="${html(id)}" aria-label="Remove owned ${html(names(fromKey(id)))}">×</button></div>`).join('')}${Object.keys(state.inventory).length ? '<button id="clear-inventory" class="link-button">Clear inventory · plan from scratch</button>' : ''}</details></section>`;
}
function renderPlan() {
  state.result=null;
  try {state.result=calculate(state.catalog,state.target,state.quantity,state);}
  catch(error){$('#view').innerHTML=`<div class="notice">${html(error.message)}</div>`;return;}
  const result=state.result,materials=result.materials.slice().sort((a,b)=>names(a.stack).localeCompare(names(b.stack)));
  const machines=[...new Set(result.steps.map(s=>state.catalog.recipes.get(s.recipe).machine).filter(m=>m!=='Crafting'))];
  $('#view').innerHTML=`<div class="plan-layout"><section class="card"><div class="card-head"><h3>Crafting & processing tree</h3>${quantityControl()}</div><div class="card-body">${renderNode(result.tree)}</div></section><div class="supplies"><section class="card"><div class="card-head"><h3>Total materials</h3><small>${materials.length} types</small></div><div class="card-body">${materials.length?materials.map(s=>`<div class="material-row">${icon(s.stack.ref)}<span class="name">${html(names(s.stack))}<span class="supply-type">${html(s.reasons.map(r=>reasons[r]).join('; '))}</span></span><span class="count">${amount({...s.stack,count:s.count})}</span></div>`).join(''):'<p class="help">Covered by your inventory.</p>'}<button id="copy-list" class="primary wide">Copy material list</button></div>${result.leftovers.length?`<details class="leftovers"><summary>Leftovers & by-products</summary>${result.leftovers.map(s=>`${amount({...s.stack,count:s.count})} × ${html(names(s.stack))}`).join('<br>')}</details>`:''}</section>${renderInventory()}</div></div><details class="plan-info"><summary>Plan details</summary>${result.warnings.map(w=>`<p>${html(w)}</p>`).join('')}<p>Unimported recipes are marked in the materials list. Fuel, power, and machine construction are separate requirements. Chance-based outputs are excluded from guaranteed materials.</p>${machines.length?`<p>${machines.map(html).join(' · ')}</p>`:''}</details>`;
}
function recipeCard(recipe) {
  const details=Object.entries(recipe.details||{}).map(([k,v])=>`${html(k)}: ${html(v)}`).join(' · ');
  return `<article class="recipe-card"><div class="recipe-top"><div><h3>${html(recipe.machine || recipe.type)}</h3><span>${amount(recipe.output)} × ${html(names(recipe.output))}</span></div><button data-use-recipe="${recipe.id}" class="primary"${recipe.calculable?'':' disabled'}>Plan recipe</button></div>${renderRecipeDiagram(state.catalog,recipe,state.layouts)}<details class="recipe-details"><summary>Details</summary>${!recipe.calculable?'<p>Probabilistic output or custom behavior: automatic planning unavailable.</p>':''}${details?`<p>${details}</p>`:''}${(recipe.notes||[]).map(n=>`<p>${html(n)}</p>`).join('')}<p>${recipe.inputs.map(s=>`${amount(s)} × ${html(names(s))}${s.toolDamage?` (${s.toolDamage} durability per craft)`:s.consume===false?' (reusable)':''}`).join('<br>')}</p><p class="id">${html(recipe.source)}</p>${recipe.output.nbt?`<code>${html(recipe.output.nbt)}</code>`:''}</details></article>`;
}
function renderView() {
  document.querySelectorAll('[data-tab]').forEach(button => { button.classList.toggle('active', button.dataset.tab === state.tab); button.setAttribute('aria-current', button.dataset.tab === state.tab ? 'page' : 'false'); });
  if (state.tab === 'plan') return renderPlan();
  const all = sortRecipeMethods(state.tab === 'recipes' ? state.catalog.forItem(state.ref) : state.catalog.uses(state.ref));
  const processes=[...new Set(all.map(r=>r.machine||r.type))];
  const recipes=all.filter(r=>!state.process||(r.machine||r.type)===state.process);
  const filter=processes.length>1?`<div class="recipe-filter"><label for="process-filter">Process</label><select id="process-filter"><option value="">All processes · ${fmt(all.length)}</option>${processes.map(p=>`<option value="${html(p)}"${state.process===p?' selected':''}>${html(p)} · ${all.filter(r=>(r.machine||r.type)===p).length}</option>`).join('')}</select></div>`:'';
  $('#view').innerHTML = all.length ? filter+recipes.slice(0, state.recipeLimit).map(recipeCard).join('') + (recipes.length > state.recipeLimit ? `<button id="more-recipes" class="primary pagination">Show more · ${fmt(recipes.length - state.recipeLimit)} remaining</button>` : '') : `<div class="card empty"><h3>${state.tab === 'recipes' ? 'No imported recipe' : 'No imported uses'}</h3>${state.tab === 'recipes' ? 'This item may be gathered or made through a process not included in the export.' : 'No imported recipe uses this item directly or through one of its ore-dictionary groups.'}</div>`;
}
function openDialog(title, content) {
  $('#data-dialog h2').textContent = title; $('#data-content').innerHTML = content;
  if (!$('#data-dialog').open) $('#data-dialog').showModal();
}
function showAlternatives(stack) {
  const options = state.catalog.options(stack);
  openDialog(state.catalog.item(stack.ref).name, `<p>Matching items for <code>${html(stack.ref)}</code>. Null entries are excluded.</p>${options.length ? options.map(s => `<button class="item-button" data-item="${html(s.ref)}">${icon(s.ref)}<span class="item-name">${html(names(s))}<small>${html(s.ref)}</small></span></button>`).join('') : '<p>No usable members were included in the source file.</p>'}`);
}
function showData() {
  const d=state.catalog.data,s=d.summary;
  const rows=[['Crafting records captured in game',s.runtimeCraftingRecords],['Imported processes',s.processes],['Output recipe choices',s.recipes],['Item, block & fluid variants',s.items],['Ore/alternative groups',s.oreGroups],['Available images',s.images]];
  openDialog('Runtime data & coverage',`<p>Source: <b>${html(s.source)}</b><br>${html(s.timestamp)}</p><table>${rows.map(([label,count])=>`<tr><td>${label}</td><td>${fmt(count)}</td></tr>`).join('')}</table><h3>Coverage in progress</h3><p>The catalog uses exact runtime item IDs, metadata, NBT and display names. Machine recipes come from the loaded registries. ${fmt(s.unhandledRecords)} records still need separate handling or are display-only examples; these are not silently treated as working recipes.</p><details><summary>Imported registries</summary><table>${Object.entries(s.byRegistry||{}).map(([k,v])=>`<tr><td>${html(k)}</td><td>${fmt(v)}</td></tr>`).join('')}</table></details><h3>Images</h3><p>Images are matched by the game's texture names and item variants. A question mark means an image is still unavailable. Texture previews can differ from custom-rendered items or 3D block icons.</p><p class="id">Snapshot SHA-256: ${html(s.sha256)}</p>`);
}
async function copyList() {
  const result = state.result;
  if (!result) return;
  const lines = [`${state.quantity} × ${names(state.target)}`, '', ...result.materials.map(s => `${amount({...s.stack,count:s.count})} × ${names(s.stack)} — ${s.reasons.map(r => reasons[r]).join('; ')}`), '', ...result.warnings, 'Source: loaded TechIt-ng registries. Custom recipe coverage is still being checked.'];
  try { await navigator.clipboard.writeText(lines.join('\n')); $('#copy-list').textContent = 'Copied'; $('#live-status').textContent = 'Material list copied.'; }
  catch { openDialog('Copy material list', `<p>Select and copy the text below.</p><textarea style="width:100%;min-height:250px" aria-label="Material list">${html(lines.join('\n'))}</textarea>`); }
}
document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button || !state.catalog) return;
  const d = button.dataset;
  if (d.item) { if (!isGroup(d.item)) $('#data-dialog').close(); select(d.item); }
  else if (d.tab) { state.tab = d.tab; state.recipeLimit = 40; state.process=''; renderView(); }
  else if (d.quantity) { state.quantity = Math.max(1, Math.min(1000000, state.quantity + Number(d.quantity))); renderHeader(); renderView(); }
  else if (d.useRecipe) { const recipe = state.catalog.recipes.get(d.useRecipe); select(recipe.output.ref, recipe.id); }
  else if (d.addOwned) { state.inventory[d.addOwned] = (state.inventory[d.addOwned] || 0) + 1; renderPlan(); }
  else if (d.removeOwned) { delete state.inventory[d.removeOwned]; renderPlan(); }
  else if (button.id === 'clear-inventory') { state.inventory = {}; renderPlan(); }
  else if (d.moreMod) {state.modLimits[d.moreMod]=(state.modLimits[d.moreMod]||60)+60;renderIndex();}
  else if (button.id === 'more-items') { state.itemLimit += 80; renderIndex(); }
  else if (button.id === 'more-recipes') { state.recipeLimit += 40; renderView(); }
  else if (button.id === 'about') showData();
  else if (button.id === 'close-dialog') $('#data-dialog').close();
  else if (button.id === 'copy-list') copyList();
});
document.addEventListener('input', event => {
  if (!state.catalog) return;
  if (event.target.id === 'search') { state.query = event.target.value; state.modOpen={}; state.modLimits={}; state.itemLimit = 80; renderIndex(); }
  if (event.target.id === 'inventory-search') {
    const value = event.target.value.trim();
    $('#inventory-matches').innerHTML = value ? matches(value).slice(0, 8).map(item => `<button class="inventory-match" data-add-owned="${html(item.ref)}">${html(item.name)}</button>`).join('') : '';
  }
});
document.addEventListener('change', event => {
  if (!state.catalog) return;
  const input = event.target;
  if(input.id==='process-filter'){state.process=input.value;state.recipeLimit=40;renderView();return;}
  if (input.id === 'quantity') { state.quantity = Math.max(1, Math.min(1000000, Math.trunc(Number(input.value) || 1))); renderHeader(); renderView(); }
  else if (input.id === 'has-recipe') { state.craftable = input.checked; state.modOpen={}; state.modLimits={}; state.itemLimit = 80; renderIndex(); }
  else if (input.dataset.method) { if (input.value) state.recipes[input.dataset.method] = input.value; else delete state.recipes[input.dataset.method]; renderPlan(); }
  else if (input.dataset.member) { state.members[input.dataset.member] = input.value; renderPlan(); }
  else if (input.dataset.owned) { state.inventory[input.dataset.owned] = Math.max(0, Math.min(1000000000, Math.trunc(Number(input.value) || 0))); renderPlan(); }
});
document.addEventListener('keydown', event => { if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) { event.preventDefault(); $('#search').focus(); } });

async function start() {
  try {
    const response = await fetch('./catalog.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Could not load the recipe catalog.');
    state.catalog = new Catalog(await response.json());
    state.findItems = createItemSearch(state.catalog);
    history.replaceState(null,'',location.pathname+location.search);
    $('#loaded-count').textContent = fmt(state.catalog.data.recipes.length) + ' recipes loaded';
    const panels=await fetch('./recipe-layouts.json',{cache:'no-store'});
    if(panels.ok)state.layouts=await panels.json();
    renderIndex();
    $('.tabs').hidden=true;
    $('#selected').innerHTML='';
    $('#view').innerHTML='<p class="empty-selection">Choose an item from the index.</p>';
    $('#live-status').textContent = 'Recipe catalog ready.';
  } catch (error) { $('#item-list').innerHTML = '<p class="empty">Catalog unavailable.</p>'; $('#view').innerHTML = `<div class="notice">${html(error.message)}</div>`; }
}
document.addEventListener('toggle',event=>{
  const target=event.target;
  if(!target.isConnected)return;
  if(target.dataset.node) {if(target.open)state.expandedNodes.add(target.dataset.node);else state.expandedNodes.delete(target.dataset.node);}
  if(target.dataset.mod) {
    state.modOpen[target.dataset.mod]=target.open;
    const list=target.querySelector('.mod-items');
    if(target.open&&!list.innerHTML){const group=state.modGroups.find(g=>g.name===target.dataset.mod);if(group)list.innerHTML=modItems(group);}
  }
},true);
start();
