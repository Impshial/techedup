const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function sortRecipeMethods(recipes) {
  const rank=r=>/alloy/i.test(r.machine||'')?0:1;
  return recipes.slice().sort((a,b)=>rank(a)-rank(b)||(a.machine||a.type||'').localeCompare(b.machine||b.type||''));
}
export function groupItemsByMod(items) {
  const groups = new Map();
  for (const item of items) { const mod=item.mod || 'Unassigned'; if(!groups.has(mod))groups.set(mod,[]);groups.get(mod).push(item); }
  return [...groups].sort(([a],[b])=>a.localeCompare(b)).map(([name,items])=>({name,items:items.sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true})||a.ref.localeCompare(b.ref))}));
}
export function diagramSlots(recipe,layout) {
  let inputs=recipe.inputs;
  if(layout.grid) {
    inputs=Array(9).fill(null);
    if(recipe.grid)recipe.grid.forEach((row,y)=>row.forEach((s,x)=>{if(y<3&&x<3)inputs[y*3+x]=s;}));
    else recipe.inputs.slice(0,9).forEach((s,i)=>inputs[i]=s);
    if(layout.extraInputs&&recipe.grid)inputs.push(...recipe.inputs.slice(recipe.grid.flat().filter(Boolean).length));
  }
  if(layout.inputSlots)inputs=layout.inputs.map((_,i)=>recipe.inputs.find(s=>s.slot===layout.inputSlots[i]));
  const positions=layout.alloyTank ? recipe.inputs.map((_,i)=>({x:layout.alloyTank.x+i*layout.alloyTank.w/recipe.inputs.length,y:layout.alloyTank.y,w:layout.alloyTank.w/recipe.inputs.length,h:layout.alloyTank.h})) : layout.inputs;
  return [...positions.map((pos,i)=>({pos,stack:inputs[i],role:'input'})),...layout.outputs.map((pos,i)=>({pos,stack:(recipe.outputs||[recipe.output])[i],role:'output'}))].filter(s=>s.stack);
}
export function renderRecipeDiagram(catalog,recipe,layouts,node=null,favoriteButton=()=>'') {
  function displayStack(s) {
    if(catalog.items.has(s.ref))return s;
    const selected=node?.children.find(c=>c.source?.ref===s.ref)?.stack;
    return {...(selected||catalog.options(s)[0]||s),count:s.count,consume:s.consume,chance:s.chance};
  }
  function contents(s) {
    const shown=displayStack(s),item=catalog.item(shown.ref),fluid=item.kind==='fluid';
    const label=`${s.count.toLocaleString()}${fluid?' mB':''} × ${item.name}${s.toolDamage?` (${s.toolDamage} durability per craft)`:s.consume===false?' (reusable)':''}${s.chance!==undefined&&s.chance<1?` (${s.chance*100}% chance)`:''}`;
    const color=item.color==null?'#647f9b':'#'+(item.color&0xffffff).toString(16).padStart(6,'0');
    return `<button class="diagram-item${fluid?' fluid':''}" data-item="${esc(s.ref)}" title="${esc(label)}" aria-label="${esc(label)}">${item.image?`<img src="${esc(item.image)}" alt="" loading="lazy">`:fluid?`<span class="fluid-fill" style="background:${color}"></span>`:'<span class="unknown">?</span>'}${!fluid&&s.count>1?`<span class="diagram-count">${s.count.toLocaleString()}</span>`:''}${s.consume===false&&!s.toolDamage?'<span class="diagram-reusable" aria-hidden="true">∞</span>':''}</button>${favoriteButton(shown.ref,'diagram-favorite')}`;
  }
  const layout=layouts[recipe.source]||layouts[recipe.machine];
  let diagram;
  if(layout) {
    const slots=diagramSlots(recipe,layout).map(({stack,pos,role})=>`<div class="diagram-slot ${role}" style="left:${pos.x/layout.width*100}%;top:${pos.y/layout.height*100}%;width:${pos.w/layout.width*100}%;height:${pos.h/layout.height*100}%">${contents(stack)}</div>`).join('');
    diagram=`<div class="game-panel" style="width:${layout.width*2}px;aspect-ratio:${layout.width}/${layout.height}"><img class="panel-background" src="${esc(layout.image)}" alt="${esc(recipe.machine)} recipe layout">${slots}</div>`;
  } else {
    const inputGrid=recipe.grid || Array.from({length:Math.ceil(recipe.inputs.length/3)},(_,i)=>recipe.inputs.slice(i*3,i*3+3));
    const columns=recipe.grid?Math.max(...recipe.grid.map(row=>row.length)):Math.min(3,recipe.inputs.length);
    diagram=`<div class="generic-process"><div class="process-slots" style="grid-template-columns:repeat(${Math.max(1,columns)},36px)">${inputGrid.flat().map(s=>`<div class="process-slot">${s?contents(s):''}</div>`).join('')}</div><span class="recipe-arrow" aria-hidden="true">→</span><div class="process-slots outputs">${(recipe.outputs||[recipe.output]).map(s=>`<div class="process-slot">${contents(s)}</div>`).join('')}</div></div>`;
  }
  const captions=[...recipe.inputs,...(recipe.outputs||[recipe.output])].filter(s=>s.ref.startsWith('fluid:')||(s.chance??1)<1).map(s=>`${s.count.toLocaleString()}${s.ref.startsWith('fluid:')?' mB':''} ${catalog.item(s.ref).name}${(s.chance??1)<1?` · ${s.chance*100}%`:''}`);
  return `<div class="process-diagram">${diagram}${captions.length?`<div class="diagram-caption">${captions.map(esc).join(' · ')}</div>`:''}</div>`;
}
