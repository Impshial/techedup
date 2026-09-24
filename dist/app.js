import { Catalog, calculateMaterialViews, key, fromKey } from './planner.js?v=8';
import { groupItemsByMod, renderRecipeDiagram, sortRecipeMethods, renderIngredientChoice } from './recipe-view.js?v=9';
import { createItemSearch } from './search.js?v=1';
import { capturePage, createNavigation } from './navigation.js?v=3';
import { createBuildList } from './build-list.js?v=2';
import { materialListExport } from './material-export.js?v=4';
import { createFavorites, favoritesStorageKey, renderFavoriteButton } from './favorites.js?v=2';

const $ = selector => document.querySelector(selector);
const html = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => Number(n).toLocaleString();
const state = { catalog: null, ref: null, quantity: 1, tab: 'plan', indexTab: 'all', query: '', indexQueries: {all: '', favorites: ''}, craftable: true, itemLimit: 80, recipeLimit: 40, process: '', recipes: {}, members: {}, inventory: {}, result: null, materialViews: null, oreLevel: false, target: null, layouts: {}, modOpen: {}, modLimits: {}, modGroups: [], expandedNodes: new Set(['0']) };
const names = stack => state.catalog.item(stack.ref).name;
const amount = stack => fmt(stack.count) + (stack.ref.startsWith('fluid:') ? ' mB' : '');
const isGroup = ref => ref.startsWith('ore:') || ref.startsWith('alternatives:') || ref.endsWith(':*');
let restoringPage = false, restoreFrame = 0, navigationReady = false, scrollTimer = 0;
const navigation = createNavigation(history, location, restorePage);
const buildList = createBuildList();
const favorites = createFavorites(()=>window.localStorage,message=>{
  $('#favorites-status').textContent=message;
  $('#favorites-status').hidden=!message;
},ref=>state.catalog?.canonicalRef(ref)||ref);
function favoriteButton(ref, extraClass = '') {
  return state.catalog.items.has(ref)?renderFavoriteButton(ref,state.catalog.item(ref).name,favorites.has(ref),extraClass):'';
}
function syncFavoriteButtons() {
  document.querySelectorAll('[data-favorite]').forEach(button=>{
    const ref=button.dataset.favorite,selected=favorites.has(ref);
    const label=`${selected?'Remove':'Add'} ${state.catalog.item(ref).name} ${selected?'from':'to'} favorites`;
    button.setAttribute('aria-pressed',String(selected));
    button.setAttribute('aria-label',label);button.title=label;
  });
}
function toggleFavorite(ref) {
  if(!favorites.toggle(ref))return;
  const list=$('#item-list'),scroll=list.scrollTop;
  const indexFocus=[...list.querySelectorAll('[data-favorite]')].indexOf(document.activeElement);
  renderIndex();list.scrollTop=scroll;syncFavoriteButtons();
  if(indexFocus>=0) {
    const buttons=list.querySelectorAll('[data-favorite]');
    (buttons[Math.min(indexFocus,buttons.length-1)] || $('#favorites-tab')).focus();
  }
  $('#live-status').textContent=`${state.catalog.item(ref).name} ${favorites.has(ref)?'added to':'removed from'} favorites.`;
}
function switchIndexTab(tab) {
  state.indexQueries[state.indexTab]=state.query;
  state.indexTab=tab;state.query=state.indexQueries[tab] || '';
  $('#search').value=state.query;state.modOpen={};state.modLimits={};
  renderIndex();$('#item-list').scrollTop=0;checkpoint();
}
const pageSnapshot = () => capturePage(state, {scrollY:window.scrollY,indexScroll:$('#item-list').scrollTop});
function checkpoint() {
  if(scrollTimer) {clearTimeout(scrollTimer);scrollTimer=0;}
  if(navigationReady && !restoringPage) navigation.save(pageSnapshot());
}
function saveScroll() {
  if(!navigationReady || restoringPage || scrollTimer) return;
  // Avoid browser history rate limits during continuous scrolling.
  scrollTimer=setTimeout(()=>{scrollTimer=0;checkpoint();},750);
}
function pageLabel() {
  if(!state.ref) return 'item index';
  return state.catalog.item(state.ref).name + (state.tab==='recipes'?' recipes':state.tab==='uses'?' uses':'');
}
function renderNavigation() {
  const back=navigation.backLabel;
  $('#page-navigation').hidden=back===null;
  $('#page-navigation').innerHTML=back===null?'':`<button class="navigation-back" data-back>← Back to ${html(back)}</button>`;
}
function restorePage(page) {
  if(restoreFrame) cancelAnimationFrame(restoreFrame);
  if(scrollTimer) {clearTimeout(scrollTimer);scrollTimer=0;}
  restoringPage=true;
  const {expandedNodes,scrollY,indexScroll,...view}=page;
  Object.assign(state,view,{indexTab:page.indexTab||'all',indexQueries:{all:page.query||'',favorites:'',...page.indexQueries},expandedNodes:new Set(expandedNodes)});
  if(state.ref)state.ref=state.catalog.canonicalRef(state.ref);
  if(state.target)state.target=state.catalog.canonicalStack(state.target);
  state.inventory=state.catalog.canonicalInventory(state.inventory);
  state.query=state.indexQueries[state.indexTab];
  if($('#data-dialog').open) $('#data-dialog').close();
  $('#search').value=state.query;
  $('#has-recipe').checked=state.craftable;
  renderIndex();renderNavigation();
  if(state.ref) {renderHeader();renderView();}
  else {
    state.result=null;
    $('.tabs').hidden=true;$('#selected').innerHTML='';
    $('#view').innerHTML='<p class="empty-selection">Choose an item from the index.</p>';
  }
  document.title=state.ref?`${state.catalog.item(state.ref).name} · Teched Up`:'Teched Up · Recipe calculator';
  restoreFrame=requestAnimationFrame(()=>{
    $('#item-list').scrollTop=indexScroll;
    window.scrollTo({top:scrollY,behavior:'instant'});
    restoreFrame=0;restoringPage=false;
    checkpoint();
  });
}
function visitPage() {
  const page=pageSnapshot();page.scrollY=0;
  navigation.visit(page,pageLabel());restorePage(page);
}
function showIndex() {
  if(!state.ref) return;
  checkpoint();state.ref=null;state.target=null;state.tab='plan';state.process='';
  visitPage();
}
function icon(ref, large = false) {
  const item = state.catalog.item(ref);
  return `<span class="icon${large ? ' large' : ''}" aria-hidden="true">${item.image ? `<img src="${html(item.image)}" alt="" loading="lazy">` : '<span class="unknown">?</span>'}</span>`;
}
function matches(query) {
  return state.findItems(query);
}
function modItems(group) {
  const limit=state.modLimits[group.name] || 60;
  return group.items.slice(0,limit).map(item => {
    const count=state.catalog.forItem(item.ref).length;
    const button=`<button class="item-button${item.ref===state.ref?' selected':''}" data-item="${html(item.ref)}" aria-pressed="${item.ref===state.ref}">${icon(item.ref)}<span class="item-name">${html(item.name)}</span>${count?`<span class="tiny-count">${count}</span>`:''}</button>`;
    return state.indexTab==='favorites'?`<div class="favorite-item-row">${button}${favoriteButton(item.ref)}</div>`:button;
  }).join('')+(group.items.length>limit?`<button class="link-button mod-more" data-more-mod="${html(group.name)}">Show more · ${fmt(group.items.length-limit)}</button>`:'');
}
function renderIndex() {
  const saved=state.indexTab==='favorites';
  const items=matches(state.query).filter(item=>(!saved||favorites.has(item.ref))&&(!state.craftable || state.catalog.forItem(item.ref).length));
  state.modGroups=groupItemsByMod(items);
  $('#result-count').textContent=fmt(items.length);
  $('#index-title').textContent=saved?'Favorites':'Item index';
  $('#search').placeholder=saved?'Search favorites…':'Search items or IDs…';
  document.querySelectorAll('[data-index-tab]').forEach(button=>{
    const selected=button.dataset.indexTab===state.indexTab;
    button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;
  });
  $('#index-panel').setAttribute('aria-labelledby',saved?'favorites-tab':'all-items-tab');
  $('#item-list').innerHTML=state.modGroups.length?state.modGroups.map(group=>{
    const open=state.modOpen[group.name] ?? (saved || !!state.query || group.items.some(i=>i.ref===state.ref));
    return `<details class="mod-group" data-mod="${html(group.name)}"${open?' open':''}><summary><span>${html(group.name)}</span><small>${fmt(group.items.length)}</small></summary><div class="mod-items">${open?modItems(group):''}</div></details>`;
  }).join(''):`<p class="empty">${saved?(favorites.refs.length?'No matching favorites.':'Tap a heart to save a favorite.'):'No matching items.'}</p>`;
  $('#more-items').hidden=true;
}
function setTarget(ref, recipeId) {
  ref=state.catalog.canonicalRef(ref);
  state.ref = ref;
  const methods = state.catalog.forItem(ref);
  const recipe = state.catalog.recipes.get(recipeId);
  const defaultStack = methods.find(r => !r.output.nbt)?.output || methods[0]?.output || { ref, count: 1 };
  state.target = { ...(recipe?.output.ref === ref ? recipe.output : defaultStack), count: 1 };
  if (recipe) state.recipes[key(state.target)] = recipe.id;
}
function select(ref, recipeId) {
  ref=state.catalog.canonicalRef(ref);
  if (isGroup(ref)) return showAlternatives({ ref, count: 1 });
  if (ref===state.ref && state.tab==='plan' && !recipeId) return;
  checkpoint();
  setTarget(ref, recipeId); state.expandedNodes=new Set(['0']); state.quantity = 1; state.tab = 'plan'; state.recipeLimit = 40;state.process='';
  visitPage();
}
function renderHeader() {
  $('.tabs').hidden=false;
  const item=state.catalog.item(state.ref),count=state.catalog.forItem(state.ref).length;
  $('#selected').innerHTML=`<div class="selected-heading">${icon(state.ref,true)}<div class="selected-title"><h2>${html(item.name)}${favoriteButton(state.ref)}</h2><div class="item-meta"><span>${html(item.mod || '')}</span><span>${count} recipe${count===1?'':'s'}</span></div></div></div>`;
  $('#recipes-count').textContent=fmt(count);$('#uses-count').textContent=fmt(state.catalog.uses(state.ref).length);
}
function quantityControl() {
  return `<div class="quantity"><label for="quantity">Amount${state.ref.startsWith('fluid:')?' (mB)':''}</label><button data-quantity="-1" aria-label="Decrease quantity">−</button><input id="quantity" type="number" min="1" max="1000000" step="1" value="${state.quantity}" inputmode="numeric"><button data-quantity="1" aria-label="Increase quantity">+</button></div>`;
}
function recipeLabel(recipe) {
  const list = [...new Set(recipe.inputs.map(s => state.catalog.item(s.ref).name))];
  return `${recipe.machine || recipe.type} · makes ${amount(recipe.output)} · ${list.slice(0, 3).join(', ')}${list.length > 3 ? '…' : ''}`;
}
const reasons = { basic: 'Gather or mine', chosen: 'Obtain separately · your choice', missing: 'No recipe imported', ambiguous: 'Identity needs review', cycle: 'Recipe loop · external supply needed', unresolved: 'No usable member for this ingredient group', invalid: 'Automatic planning unavailable for this recipe', limit: 'Expansion limit · review manually', owned: 'Covered by inventory, leftovers, or a reusable tool' };
function renderNode(node, level = 0, path = '0') {
  const identity = key(node.stack), methods = sortRecipeMethods(state.catalog.forStack(node.stack));
  const choice = renderIngredientChoice(state.catalog,node.source,node.stack);
  const description = (node.recipe ? `${node.recipe.machine || node.recipe.type} · ${fmt(node.runs)} batch${node.runs === 1 ? '' : 'es'} × ${amount(node.recipe.output)} output${node.extra ? ` · ${fmt(node.extra)} extra` : ''}` : reasons[node.status]) + (node.reusable ? ' · reusable tool/cast' : '');
  const line = `<div class="node-row">${icon(node.stack.ref)}<span class="node-name">${choice || html(names(node.stack))}</span>${favoriteButton(node.stack.ref)}<span class="count">${amount({...node.stack,count:node.wanted})}</span></div>`;
  const controls = `<div class="node-controls">${methods.length ? `<select data-method="${html(identity)}" aria-label="Recipe for ${html(names(node.stack))}"><option value="">Automatic</option><option value="supply"${state.recipes[identity] === 'supply' ? ' selected' : ''}>Obtain separately</option>${methods.map(r => `<option value="${r.id}"${state.recipes[identity] === r.id ? ' selected' : ''}${!r.calculable ? ' disabled' : ''}>${html(recipeLabel(r))}${!r.calculable ? ' · unavailable' : ''}</option>`).join('')}</select>` : ''}<button class="link-button" data-add-owned="${html(identity)}">I have some</button></div>`;
  const content = `<div class="node-detail">${html(description)}${node.have ? ` · ${fmt(node.have)} owned` : ''}${node.reused ? ` · ${fmt(node.reused)} from leftovers` : ''}</div>${controls}${node.recipe?renderRecipeDiagram(state.catalog,node.recipe,state.layouts,node):''}${node.children.length ? `<div class="tree">${node.children.map((s,i) => renderNode(s, level + 1,path+'.'+i)).join('')}</div>` : ''}`;
  return `<div class="node">${node.children.length ? `<details data-node="${path}"${state.expandedNodes.has(path) ? ' open' : ''}><summary>${line}</summary>${content}</details>` : line + content}</div>`;
}
function renderInventory() {
  return `<section class="card inventory"><details${Object.keys(state.inventory).length?' open':''}><summary>Materials you already have</summary><label for="inventory-search">Add an owned item</label><input id="inventory-search" type="search" placeholder="Search your materials…" autocomplete="off"><div id="inventory-matches"></div>${Object.entries(state.inventory).map(([id, count]) => `<div class="owned-row"><span>${html(names(fromKey(id)))}</span><input type="number" min="0" max="1000000000" value="${count}" step="1" data-owned="${html(id)}" aria-label="Owned ${html(names(fromKey(id)))}"><button data-remove-owned="${html(id)}" aria-label="Remove owned ${html(names(fromKey(id)))}">×</button></div>`).join('')}${Object.keys(state.inventory).length ? '<button id="clear-inventory" class="link-button">Clear inventory · plan from scratch</button>' : ''}</details></section>`;
}
function materialRows(materials) {
  return materials.map(s=>`<div class="material-row">${icon(s.stack.ref)}<span class="name">${html(names(s.stack))}${materialDescription(s)?`<span class="supply-type">${html(materialDescription(s))}</span>`:''}</span>${favoriteButton(s.stack.ref)}<span class="count">${amount({...s.stack,count:s.count})}</span></div>`).join('');
}
const currentMaterialView = () => state.materialViews?.[state.oreLevel?'ore':'processed'];
function materialDescription(material) {
  if(state.oreLevel && material.products?.length) return '→ '+[...new Set(material.products.map(names))].sort().join(', ');
  return material.reasons.map(reason=>reason==='processed'?'':reason==='basic'?'Used directly':reasons[reason]).filter(Boolean).join('; ');
}
function oreLevelControl(scope) {
  return `<label class="ore-level"><input type="checkbox" data-ore-level="${scope}"${state.oreLevel?' checked':''}> Ore Level</label>`;
}
function setOreLevel(checked) {
  state.oreLevel=checked;
  if(state.tab==='plan' && state.materialViews && state.ref) renderMaterials();
  if($('#data-dialog').open && $('#data-dialog').classList.contains('build-dialog')) {
    const materials=buildList.total(state.oreLevel).materials.sort((a,b)=>names(a.stack).localeCompare(names(b.stack)));
    $('.build-materials').innerHTML=materials.length?materialRows(materials):'<p class="help">Covered by your inventory.</p>';
    $('.build-total-heading small').textContent=`${materials.length} types`;
    $('#copy-build').textContent='Copy total';$('#build-copy-fallback').hidden=true;
  }
  document.querySelectorAll('[data-ore-level]').forEach(input=>{input.checked=state.oreLevel;});
}
function updateBuildControls() {
  document.querySelectorAll('[data-view-build]').forEach(button=>{button.hidden=!buildList.size;});
  document.querySelectorAll('[data-build-count]').forEach(label=>{label.textContent=fmt(buildList.size);});
}
function addToBuildList() {
  if(!state.result) return;
  buildList.add(state.target,state.quantity,currentMaterialView(),state.materialViews);
  updateBuildControls();
  const button=$('#add-build');
  button.textContent='Added to build list';
  setTimeout(()=>{if(button.isConnected)button.textContent='Add to build list';},1600);
  $('#live-status').textContent=`Added ${amount({...state.target,count:state.quantity})} × ${names(state.target)} to the build list. ${buildList.size} plans.`;
}
function exportControl(scope) {
  return `<details id="${scope}-export-menu" class="material-export" data-export-scope="${scope}"><summary aria-label="Export ${scope==='current'?'current material list':'build list'}">Export <span aria-hidden="true">▾</span></summary><div class="export-options"><button type="button" data-material-export="minecraft">Minecraft</button><button type="button" data-material-export="json">JSON</button><button type="button" data-material-export="csv">CSV</button><button type="button" data-material-export="markdown">Markdown Checklist</button></div></details>`;
}
function showBuildList() {
  const entries=buildList.entries,total=buildList.total(state.oreLevel);
  const materials=total.materials.sort((a,b)=>names(a.stack).localeCompare(names(b.stack)));
  const content=entries.length?`<div class="build-scroll"><div class="build-plans-heading"><span>${entries.length} plan${entries.length===1?'':'s'}</span><button id="clear-build" class="link-button">Clear list</button></div><div class="build-plans">${entries.map(entry=>`<div class="build-entry">${icon(entry.target.ref)}<span class="name">${html(names(entry.target))}</span>${favoriteButton(entry.target.ref)}<span class="count">${amount({...entry.target,count:entry.quantity})}</span><button class="remove-build" data-remove-build="${entry.id}" aria-label="Remove ${html(names(entry.target))} from build list">×</button></div>`).join('')}</div><div class="build-total-heading"><h3>Total materials</h3>${oreLevelControl('build')}<small>${materials.length} types</small></div><div class="build-materials">${materials.length?materialRows(materials):'<p class="help">Covered by your inventory.</p>'}</div></div><div class="build-dialog-actions"><div class="build-action-buttons"><button id="copy-build" class="primary">Copy total</button>${exportControl('build')}</div><p id="build-export-error" class="export-error" role="alert" hidden></p><div id="build-copy-fallback" hidden></div></div>`:'<p class="help build-empty">Your build list is empty.</p>';
  openDialog('Build list',content,'build-dialog');
}
function removeFromBuildList(id) {
  const entries=buildList.entries,index=entries.findIndex(entry=>entry.id===id);
  if(index<0)return;
  const name=names(entries[index].target);
  buildList.remove(id);updateBuildControls();showBuildList();
  const next=buildList.entries[Math.min(index,buildList.size-1)];
  (next?$(`[data-remove-build="${next.id}"]`):$('#close-dialog')).focus();
  $('#live-status').textContent=`Removed ${name} from the build list.`;
}
async function copyBuildList() {
  const total=buildList.total(state.oreLevel);
  const lines=['Build list',...buildList.entries.map(entry=>`${amount({...entry.target,count:entry.quantity})} × ${names(entry.target)}`),'','Total materials',...total.materials.sort((a,b)=>names(a.stack).localeCompare(names(b.stack))).map(s=>`${amount({...s.stack,count:s.count})} × ${names(s.stack)}${materialDescription(s)?' — '+materialDescription(s):''}`),...(!total.materials.length?['Covered by your inventory.']:[]),...(total.warnings.length?['',...total.warnings]:[])];
  const text=lines.join('\n'),button=$('#copy-build');
  try {
    await navigator.clipboard.writeText(text);
    if(button.isConnected)button.textContent='Copied';
    $('#live-status').textContent='Build list total copied.';
  } catch {
    const fallback=$('#build-copy-fallback');
    if(!fallback)return;
    fallback.hidden=false;
    fallback.innerHTML=`<textarea readonly aria-label="Copy build list total">${html(text)}</textarea>`;
    fallback.querySelector('textarea').select();
    $('#live-status').textContent='Select and copy the build list total.';
  }
}
function exportMaterials(format,menu) {
  const scope=menu.dataset.exportScope,current=scope==='current';
  if(current?!state.result:!buildList.size)return;
  try {
    const entries=current?[{target:state.target,quantity:state.quantity}]:buildList.entries;
    // Exports always contain processed materials, independent of the display toggle.
    const materials=current?state.materialViews.processed.materials:buildList.total(false).materials;
    const file=materialListExport(format,entries,materials,names,scope,state.catalog);
    const url=URL.createObjectURL(new Blob([file.content],{type:file.type}));
    const link=document.createElement('a');
    link.href=url;link.download=file.filename;menu.append(link);
    link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
    menu.open=false;menu.querySelector('summary').focus();
    $(`#${scope}-export-error`).hidden=true;
    $('#live-status').textContent=`Exported ${file.filename}.`;
  } catch {
    $(`#${scope}-export-error`).hidden=false;
    $(`#${scope}-export-error`).textContent='Export failed. Please try again.';
  }
}
function renderPlan() {
  state.result=null;state.materialViews=null;
  try {state.materialViews=calculateMaterialViews(state.catalog,state.target,state.quantity,state);state.result=state.materialViews.ore;}
  catch(error){$('#view').innerHTML=`<div class="notice">${html(error.message)}</div>`;return;}
  const result=state.result;
  $('#view').innerHTML=`<div class="plan-layout"><section class="card"><div class="card-head"><h3>Crafting & processing tree</h3>${quantityControl()}</div><div class="card-body">${renderNode(result.tree)}</div></section><div class="supplies"><section class="card materials-card"></section>${renderInventory()}</div></div>`;
  renderMaterials();
}
function renderMaterials() {
  const result=currentMaterialView(),materials=result.materials.slice().sort((a,b)=>names(a.stack).localeCompare(names(b.stack)));
  const card=$('.materials-card'),leftoversOpen=$('.leftovers')?.open;
  if(!card.querySelector('.card-head'))card.innerHTML=`<div class="card-head materials-heading"><h3>Total materials</h3>${oreLevelControl('current')}<small></small></div><div class="card-body"></div>`;
  card.querySelector('[data-ore-level]').checked=state.oreLevel;
  card.querySelector('.card-head small').textContent=`${materials.length} types`;
  card.querySelector('.card-body').innerHTML=`${materials.length?materialRows(materials):'<p class="help">Covered by your inventory.</p>'}<div class="material-add-actions"><button id="add-build" class="primary" title="Add this plan's material quantities">Add to build list</button>${exportControl('current')}</div><p id="current-export-error" class="export-error" role="alert" hidden></p><div class="material-list-actions"><button id="copy-list" class="link-button">Copy only this list</button><button class="link-button" data-view-build${buildList.size?'':' hidden'}>View total · <span data-build-count>${buildList.size}</span></button></div>`;
  card.querySelector('.leftovers')?.remove();
  if(result.leftovers.length)card.insertAdjacentHTML('beforeend',`<details class="leftovers"${leftoversOpen?' open':''}><summary>Leftovers & by-products</summary><ul class="leftover-list">${result.leftovers.map(s=>`<li>${amount({...s.stack,count:s.count})} × ${html(names(s.stack))}</li>`).join('')}</ul></details>`);
}

function recipeCard(recipe) {
  const details=Object.entries(recipe.details||{}).map(([k,v])=>`${html(k)}: ${html(v)}`).join(' · ');
  return `<article class="recipe-card"><div class="recipe-top"><div><h3>${html(recipe.machine || recipe.type)}</h3><span class="recipe-output-label">${amount(recipe.output)} × ${html(names(recipe.output))}${favoriteButton(recipe.output.ref)}</span></div><button data-use-recipe="${recipe.id}" class="primary"${recipe.calculable?'':' disabled'}>Plan recipe</button></div>${renderRecipeDiagram(state.catalog,recipe,state.layouts)}<details class="recipe-details"><summary>Details</summary>${!recipe.calculable?`<p>${(recipe.output.chance??1)<1?'Chance-based output: automatic planning unavailable.':'Automatic planning is not supported for this recipe yet.'}</p>`:''}${details?`<p>${details}</p>`:''}${(recipe.notes||[]).map(n=>`<p>${html(n)}</p>`).join('')}<p>${recipe.inputs.map(s=>`<button type="button" class="link-button recipe-detail-item" data-item="${html(s.ref)}">${amount(s)} × ${html(names(s))}${s.toolDamage?` (${s.toolDamage} durability per craft)`:s.consume===false?' (reusable)':''}</button>`).join('<br>')}</p><p class="id">${html(recipe.source)}</p>${recipe.output.nbt?`<code>${html(recipe.output.nbt)}</code>`:''}</details></article>`;
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
function openDialog(title, content, className = '') {
  $('#data-dialog').className=className;
  $('#data-dialog h2').textContent = title; $('#data-content').innerHTML = content;
  if (!$('#data-dialog').open) $('#data-dialog').showModal();
}
function showAlternatives(stack) {
  const options = state.catalog.options(stack).filter(option=>state.catalog.forStack(option).length);
  openDialog(state.catalog.item(stack.ref).name, options.length ? options.map(s => `<div class="favorite-item-row"><button class="item-button" data-item="${html(s.ref)}">${icon(s.ref)}<span class="item-name">${html(names(s))}<small>${html(s.ref)}</small></span></button>${favoriteButton(s.ref)}</div>`).join('') : '<p>No matching items with recipes.</p>');
}
function showData() {
  const d=state.catalog.data,s=d.summary;
  const rows=[['Crafting records captured in game',s.runtimeCraftingRecords],['Imported processes',s.processes],['Output recipe choices',s.recipes],['Item, block & fluid variants',s.items],['Ore/alternative groups',s.oreGroups],['Available images',s.images]];
  openDialog('Runtime data & coverage',`<p>Source: <b>${html(s.source)}</b><br>${html(s.timestamp)}</p><table>${rows.map(([label,count])=>`<tr><td>${label}</td><td>${fmt(count)}</td></tr>`).join('')}</table><h3>Coverage in progress</h3><p>The catalog uses exact runtime item IDs, metadata, NBT and display names. Machine recipes come from the loaded registries. ${fmt(s.unhandledRecords)} records still need separate handling or are display-only examples; these are not silently treated as working recipes.</p><details><summary>Imported registries</summary><table>${Object.entries(s.byRegistry||{}).map(([k,v])=>`<tr><td>${html(k)}</td><td>${fmt(v)}</td></tr>`).join('')}</table></details><h3>Images</h3><p>Images are matched by the game's texture names and item variants. A question mark means an image is still unavailable. Texture previews can differ from custom-rendered items or 3D block icons.</p><p class="id">Snapshot SHA-256: ${html(s.sha256)}</p>`);
}
async function copyList() {
  const result = currentMaterialView();
  if (!result) return;
  const lines = [`${state.quantity} × ${names(state.target)}`, '', ...result.materials.map(s => `${amount({...s.stack,count:s.count})} × ${names(s.stack)}${materialDescription(s)?' — '+materialDescription(s):''}`), '', ...result.warnings, 'Source: loaded TechIt-ng registries. Custom recipe coverage is still being checked.'];
  try { await navigator.clipboard.writeText(lines.join('\n')); $('#copy-list').textContent = 'Copied'; $('#live-status').textContent = 'Material list copied.'; }
  catch { openDialog('Copy only this list', `<p>Select and copy the text below.</p><textarea style="width:100%;min-height:250px" aria-label="Material list">${html(lines.join('\n'))}</textarea>`); }
}
document.addEventListener('click', event => {
  document.querySelectorAll('[data-export-scope][open]').forEach(menu=>{if(!menu.contains(event.target))menu.open=false;});
  if(event.target.closest('a[data-home]') && state.catalog) {event.preventDefault();showIndex();return;}
  const button = event.target.closest('button');
  if (!button || !state.catalog) return;
  const d = button.dataset;
  if (d.favorite) {event.preventDefault();event.stopPropagation();toggleFavorite(d.favorite);return;}
  else if (d.indexTab) {switchIndexTab(d.indexTab);return;}
  else if ('viewBuild' in d) {showBuildList();return;}
  else if (button.id === 'add-build') {addToBuildList();return;}
  else if (d.removeBuild) {removeFromBuildList(Number(d.removeBuild));return;}
  else if (button.id === 'clear-build') {buildList.clear();updateBuildControls();showBuildList();$('#close-dialog').focus();$('#live-status').textContent='Build list cleared.';return;}
  else if (button.id === 'copy-build') {copyBuildList();return;}
  else if (d.materialExport) {exportMaterials(d.materialExport,button.closest('[data-export-scope]'));return;}
  else if ('back' in d) {checkpoint();navigation.back();return;}
  else if ('home' in d) {showIndex();return;}
  else if (d.item) { if (!isGroup(d.item)) $('#data-dialog').close(); select(d.item); }
  else if (d.tab) { if(d.tab===state.tab)return;checkpoint();state.tab = d.tab; state.recipeLimit = 40; state.process=''; visitPage(); }
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
  checkpoint();
});
document.addEventListener('input', event => {
  if (!state.catalog) return;
  if (event.target.id === 'search') { state.query = event.target.value; state.indexQueries[state.indexTab]=state.query; state.modOpen={}; state.modLimits={}; state.itemLimit = 80; renderIndex(); }
  if (event.target.id === 'inventory-search') {
    const value = event.target.value.trim();
    $('#inventory-matches').innerHTML = value ? matches(value).slice(0, 8).map(item => `<button class="inventory-match" data-add-owned="${html(item.ref)}">${html(item.name)}</button>`).join('') : '';
  }
  checkpoint();
});
document.addEventListener('change', event => {
  if (!state.catalog) return;
  const input = event.target;
  if(input.dataset.oreLevel){setOreLevel(input.checked);return;}
  if(input.id==='process-filter'){state.process=input.value;state.recipeLimit=40;renderView();checkpoint();return;}
  if (input.id === 'quantity') { state.quantity = Math.max(1, Math.min(1000000, Math.trunc(Number(input.value) || 1))); renderHeader(); renderView(); }
  else if (input.id === 'has-recipe') { state.craftable = input.checked; state.modOpen={}; state.modLimits={}; state.itemLimit = 80; renderIndex(); }
  else if (input.dataset.method) { if (input.value) state.recipes[input.dataset.method] = input.value; else delete state.recipes[input.dataset.method]; renderPlan(); }
  else if (input.dataset.member) { state.members[input.dataset.member] = input.value; renderPlan(); }
  else if (input.dataset.owned) { state.inventory[input.dataset.owned] = Math.max(0, Math.min(1000000000, Math.trunc(Number(input.value) || 0))); renderPlan(); }
  checkpoint();
});
document.addEventListener('keydown', event => { if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) { event.preventDefault(); $('#search').focus(); } });
document.addEventListener('keydown',event=>{
  const menu=$('[data-export-scope][open]');
  if(!menu?.open)return;
  if(event.key==='Escape') {event.preventDefault();menu.open=false;menu.querySelector('summary').focus();return;}
  if(!menu.contains(event.target) || !['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
  event.preventDefault();
  const buttons=[...menu.querySelectorAll('[data-material-export]')],index=buttons.indexOf(event.target);
  const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:index<0?(event.key==='ArrowUp'?buttons.length-1:0):(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;
  buttons[next].focus();
});
document.addEventListener('focusin',event=>{
  document.querySelectorAll('[data-export-scope][open]').forEach(menu=>{if(!menu.contains(event.target))menu.open=false;});
});
document.addEventListener('keydown',event=>{
  if(!state.catalog || !event.target.matches('[data-index-tab]') || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();
  const tab=event.key==='Home'?'all':event.key==='End'?'favorites':state.indexTab==='all'?'favorites':'all';
  switchIndexTab(tab);$(`[data-index-tab="${tab}"]`).focus();
});

async function start() {
  try {
    const response = await fetch('./catalog.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Could not load the recipe catalog.');
    state.catalog = new Catalog(await response.json());
    favorites.refresh();
    state.findItems = createItemSearch(state.catalog);
    $('#loaded-count').textContent = fmt(state.catalog.data.recipes.length) + ' recipes loaded';
    const panels=await fetch('./recipe-layouts.json',{cache:'no-store'});
    if(panels.ok)state.layouts=await panels.json();
    history.scrollRestoration='manual';
    const page=navigation.start(pageSnapshot(),'item index');
    navigationReady=true;restorePage(page);
    $('#live-status').textContent = 'Recipe catalog ready.';
  } catch (error) { console.error(error); $('#item-list').innerHTML = '<p class="empty">Catalog unavailable.</p>'; $('#view').innerHTML = `<div class="notice">${html(error.message)}</div>`; }
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
  checkpoint();
},true);
window.addEventListener('popstate',event=>{if(navigationReady)navigation.restore(event.state);});
window.addEventListener('storage',event=>{
  if(event.key!==favoritesStorageKey && event.key!==null)return;
  if(favorites.refresh() && state.catalog) {renderIndex();syncFavoriteButtons();}
});
window.addEventListener('scroll',saveScroll,{passive:true});
function updateBackToTop() { $('#back-to-top').hidden=window.scrollY<200; }
window.addEventListener('scroll',updateBackToTop,{passive:true});
window.addEventListener('resize',updateBackToTop);
$('#back-to-top').addEventListener('click',()=>{
  window.scrollTo({top:0,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
});
updateBackToTop();
$('#item-list').addEventListener('scroll',saveScroll,{passive:true});
start();
