import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Catalog, calculate } from '../dist/planner.js';
import { diagramSlots, groupItemsByMod, sortRecipeMethods, renderRecipeDiagram } from '../dist/recipe-view.js';

const s=(ref,count=1,extra={})=>({ref,count,...extra});
function catalog(recipes) {
  const ids=[...new Set(recipes.flatMap(r=>[r.output.ref,...r.inputs.map(s=>s.ref),...(r.outputs||[]).map(s=>s.ref)]))];
  return new Catalog({version:3,ores:{},items:ids.map(ref=>({ref,name:ref,names:[],kind:'item'})),recipes:recipes.map(r=>({calculable:true,type:'Test',...r}))});
}
const totals=r=>Object.fromEntries(r.materials.map(m=>[m.stack.ref,m.count]));

test('saw wear is shared across branches and replacement tools are counted',()=>{
  const tool=s('saw',1,{consume:false,toolDamage:1});
  const c=catalog([
    {id:'assemble',output:s('final'),inputs:[s('a',3),s('b',3)]},
    {id:'cut-a',output:s('a'),inputs:[tool,s('block')]},
    {id:'cut-b',output:s('b'),inputs:[tool,s('block')]},
    {id:'saw',output:s('saw'),inputs:[s('metal',2)]},
  ]);
  Object.assign(c.item('saw'),{maxDamage:3,metadata:'0'});
  const result=calculate(c,s('final'),1);
  assert.deepEqual(totals(result),{metal:4,block:6});
  assert.equal(result.tree.children[1].children[0].retained,1);
  assert.deepEqual(totals(calculate(c,s('final'),1,{inventory:{saw:1}})),{metal:2,block:6});
  Object.assign(c.item('saw'),{metadata:'2'});
  assert.deepEqual(totals(calculate(c,s('final'),1,{inventory:{saw:3}})),{block:6});
});

test('microblock recipes preserve materials, fence layout, and recursive cutting',()=>{
  const data=JSON.parse(fs.readFileSync(new URL('../dist/catalog.json',import.meta.url),'utf8'));
  const c=new Catalog(data),ref='item:10273:1@2da9e52da141';
  const fence=c.forItem(ref).find(r=>r.machine==='Extra Utilities · microblocks');
  assert.equal(fence.output.count,2);
  assert.deepEqual(fence.grid.map(row=>row.map(s=>s?Number(c.item(s.ref).metadata):null)),[[770,772,770],[770,772,770],[null,772,null]]);
  const micro=data.recipes.filter(r=>r.source==='forgemultipart.MicroRecipe (code + runtime materials)');
  assert.equal(new Set(micro.filter(r=>r.output.nbt).map(r=>r.output.nbt)).size,970);
  for(const recipe of data.recipes.filter(r=>r.machine==='Extra Utilities · microblocks'))
    assert.ok(recipe.inputs.filter(s=>s.nbt).every(s=>s.nbt===recipe.output.nbt),'Mixed microblock materials');
  const result=calculate(c,s(ref),2);
  assert.deepEqual(result.tree.children.map(n=>n.wanted),[4,3]);
  assert.equal(result.warnings.length,0);
  assert.ok(result.materials.every(m=>m.reasons.includes('basic')));
  const names=result.materials.map(m=>c.item(m.stack.ref).name);
  assert.ok(names.includes('Cobalt Ore')&&names.includes('Ardite Ore'));
  assert.ok(result.steps.some(step=>c.recipes.get(step.recipe).machine==='Smeltery · alloying'));
});
test('rounds batches and reuses guaranteed by-products across branches',()=>{
  const c=catalog([
    {id:'assemble',output:s('final'),inputs:[s('a',3),s('b',2)]},
    {id:'process',output:s('a',2),outputs:[s('a',2),s('b')],inputs:[s('ore',3)]}
  ]);
  const r=calculate(c,s('final'),1);
  assert.deepEqual(totals(r),{ore:6});
  assert.equal(r.tree.children[1].reused,2);
  assert.equal(r.leftovers.find(s=>s.stack.ref==='a').count,1);
});
test('a reusable cast is acquired once across different recipes',()=>{
  const c=catalog([
    {id:'assemble',output:s('final'),inputs:[s('a',2),s('b',3)]},
    {id:'a',output:s('a'),inputs:[s('ore',2),s('cast',1,{consume:false})]},
    {id:'b',output:s('b'),inputs:[s('ore',3),s('cast',1,{consume:false})]},
    {id:'cast',output:s('cast'),inputs:[s('resin',4)]}
  ]);
  assert.deepEqual(totals(calculate(c,s('final'),1)),{ore:13,resin:4});
  const owned=calculate(c,s('final'),1,{inventory:{cast:1}});
  assert.deepEqual(totals(owned),{ore:13});
  assert.equal(owned.usedInventory.find(s=>s.stack.ref==='cast').count,1);
});
test('chance-based by-products do not satisfy another ingredient',()=>{
  const c=catalog([
    {id:'assemble',output:s('final'),inputs:[s('a'),s('b')]},
    {id:'process',output:s('a'),outputs:[s('a'),s('b',1,{chance:.1})],inputs:[s('ore')]}
  ]);
  assert.deepEqual(totals(calculate(c,s('final'),1)),{ore:1,b:1});
});
test('inventory is shared across all branches, without double spending',()=>{
  const c=catalog([{id:'final',output:s('final'),inputs:[s('a'),s('b')]},{id:'a',output:s('a'),inputs:[s('ore',3)]},{id:'b',output:s('b'),inputs:[s('ore',4)]}]);
  assert.deepEqual(totals(calculate(c,s('final'),1,{inventory:{ore:5}})),{ore:2});
});
test('recipe loops are explicit external supplies, never infinite recursion',()=>{
  const c=catalog([{id:'a',output:s('a'),inputs:[s('b')]},{id:'b',output:s('b'),inputs:[s('a')]}]);
  const result=calculate(c,s('a'),1);
  assert.ok(result.warnings.some(w=>w.includes('loop')));
});
test('live data uses actual AE names, and gold blocks consume nine ingots',()=>{
  const d=JSON.parse(fs.readFileSync(new URL('../dist/catalog.json',import.meta.url),'utf8'));
  const c=new Catalog(d);
  assert.equal(c.item('item:742:6').name,'ME Access Terminal');
  assert.equal(c.item('item:745:0').name,'Certus Quartz Ore');
  const recipe=c.forItem('item:41:0').find(r=>r.source==='minecraft.crafting'&&r.inputs.every(s=>s.ref==='item:266:0'));
  assert.ok(recipe);
  assert.equal(recipe.inputs.reduce((n,s)=>n+s.count,0),9);
  assert.ok(d.recipes.some(r=>r.machine==='Induction smelter'));
  assert.ok(d.recipes.some(r=>r.machine==='Smeltery · alloying'));
});

test('NBT variants use their catalog identity when spending owned inventory',()=>{
  const variant=s('item:500:0@abc123',1,{nbt:'{"material":"copper"}'});
  const c=catalog([{id:'assemble',output:s('final'),inputs:[variant]}]);
  assert.deepEqual(totals(calculate(c,s('final'),1,{inventory:{[variant.ref]:1}})),{});
});

test('machine panels retain shaped gaps, extra solder, and numbered NASA slots',()=>{
  const layouts=JSON.parse(fs.readFileSync(new URL('../dist/recipe-layouts.json',import.meta.url),'utf8'));
  const shaped={inputs:[s('a'),s('b'),s('iron')],grid:[[s('a'),null,s('b')],[null,null,null],[null,null,null]],output:s('out')};
  const solder=diagramSlots(shaped,layouts['Soldering station']);
  assert.equal(solder.filter(s=>s.role==='input').length,3);
  assert.equal(solder.find(s=>s.stack.ref==='b').pos.x,75);
  assert.equal(solder.find(s=>s.stack.ref==='iron').pos.x,102);
  const rocket=diagramSlots({inputs:[s('nose',1,{slot:1}),s('chest',1,{slot:16})],output:s('rocket')},layouts['micdoodle8.mods.galacticraft.api.GalacticraftRegistry#rocketBenchT1Recipes']);
  assert.equal(rocket.find(s=>s.stack.ref==='chest').pos.x,116);
  assert.equal(rocket.find(s=>s.stack.ref==='nose').pos.y,15);
});

test('mod tree sorts mods and item names, preserving duplicate names',()=>{
  const groups=groupItemsByMod([{mod:'Z',name:'A',ref:'a'},{mod:'A',name:'Part 10',ref:'b'},{mod:'A',name:'Part 2',ref:'c'},{mod:'A',name:'Part 2',ref:'d'}]);
  assert.deepEqual(groups.map(g=>g.name),['A','Z']);
  assert.deepEqual(groups[0].items.map(i=>i.ref),['c','d','b']);
});

test('every mapped live machine ingredient has a panel slot within its bounds',()=>{
  const data=JSON.parse(fs.readFileSync(new URL('../dist/catalog.json',import.meta.url),'utf8'));
  const layouts=JSON.parse(fs.readFileSync(new URL('../dist/recipe-layouts.json',import.meta.url),'utf8'));
  for(const recipe of data.recipes) {
    const layout=layouts[recipe.source]||layouts[recipe.machine];if(!layout)continue;
    const slots=diagramSlots(recipe,layout);
    assert.equal(slots.filter(s=>s.role==='input').length,recipe.inputs.length,recipe.machine+' dropped an ingredient');
    for(const {pos} of slots)assert.ok(pos.x>=0&&pos.y>=0&&pos.x+pos.w<=layout.width&&pos.y+pos.h<=layout.height,recipe.machine+' slot out of bounds');
  }
});

test('Manyullyn defaults to alloying from mineable inputs and exposes the alloying GUI',()=>{
  const data=JSON.parse(fs.readFileSync(new URL('../dist/catalog.json',import.meta.url),'utf8'));
  const layouts=JSON.parse(fs.readFileSync(new URL('../dist/recipe-layouts.json',import.meta.url),'utf8'));
  const c=new Catalog(data),result=calculate(c,s('fluid:33'),144);
  assert.equal(result.tree.recipe.machine,'Smeltery · alloying');
  assert.deepEqual(result.materials.map(m=>c.item(m.stack.ref).name).sort(),['Ardite Ore','Cobalt Ore']);
  assert.ok(result.materials.every(m=>m.reasons.includes('basic')));
  assert.equal(sortRecipeMethods(c.forItem('fluid:33'))[0].machine,'Smeltery · alloying');
  const markup=renderRecipeDiagram(c,result.tree.recipe,layouts,result.tree);
  assert.ok(markup.includes('images/gui/smeltery-alloying.png'));
  for(const name of ['Molten Cobalt','Molten Ardite','Molten Manyullyn'])assert.ok(markup.includes(name));
});
