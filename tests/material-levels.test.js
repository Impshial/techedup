import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Catalog, calculateMaterialViews, key} from '../dist/planner.js';
import {createBuildList} from '../dist/build-list.js';
import {materialListExport} from '../dist/material-export.js';

const s=(ref,count=1)=>({ref,count});
const counts=view=>Object.fromEntries(view.materials.map(m=>[key(m.stack),m.count]));
function fixture() {
  const recipes=[
    {id:'machine',output:s('machine'),inputs:[s('gear'),s('stick',3),s('fluid:2',250)]},
    {id:'gear',output:s('gear'),inputs:[s('ingot',4)]},
    {id:'stick',output:s('stick',4),inputs:[s('planks',2)]},
    {id:'planks',output:s('planks',4),inputs:[s('log')]},
    {id:'ingot',machine:'Furnace',output:s('ingot'),inputs:[s('dust')]},
    {id:'dust',machine:'Pulverizer',output:s('dust',2),inputs:[s('ore')],outputs:[s('dust',2),s('bonus')]},
    {id:'fluid',output:s('fluid:2',1000),inputs:[s('raw',2)]},
  ];
  const refs=[...new Set(recipes.flatMap(r=>[r.output.ref,...r.inputs.map(x=>x.ref),...(r.outputs||[]).map(x=>x.ref)]))];
  const c=new Catalog({version:3,items:refs.map(ref=>({ref,name:ref})),ores:{'ore:ingotIron':[s('ingot')],'ore:dustIron':[s('dust')],'ore:plankWood':[s('planks')]},recipes:recipes.map(r=>({type:'Crafting',calculable:true,...r}))});
  for(const ref of ['ore','log','raw'])c.raw.add(ref);
  return c;
}

test('processed totals expand components but stop at ingots, planks and fluids, preserving the ore tree',()=>{
  const c=fixture(),views=calculateMaterialViews(c,s('machine'),1);
  assert.deepEqual(counts(views.processed),{ingot:4,planks:2,'fluid:2':250});
  assert.deepEqual(counts(views.ore),{ore:2,log:1,raw:2});
  assert.equal(views.processed.tree.children[0].stack.ref,'gear');
  assert.equal(views.processed.tree.children[0].children[0].status,'processed');
  assert.equal(views.ore.tree.children[0].children[0].recipe.id,'ingot');
  const destinations=Object.fromEntries(views.ore.materials.map(m=>[m.stack.ref,m.products.map(p=>p.ref)]));
  assert.deepEqual(destinations,{ore:['ingot'],log:['planks'],raw:['fluid:2']});
  assert.deepEqual(Object.fromEntries(views.processed.leftovers.map(m=>[m.stack.ref,m.count])),{stick:1});
  assert.deepEqual(Object.fromEntries(views.ore.leftovers.map(m=>[m.stack.ref,m.count])),{bonus:2,planks:2,stick:1,'fluid:2':750});
});

test('both levels account for owned materials and preserve explicit external supply choices',()=>{
  const c=fixture(),views=calculateMaterialViews(c,s('machine'),1,{inventory:{ingot:1,planks:1,'fluid:2':50}});
  assert.deepEqual(counts(views.processed),{ingot:3,planks:1,'fluid:2':200});
  assert.deepEqual(counts(views.ore),{ore:2,log:1,raw:2});
  const chosen=calculateMaterialViews(c,s('machine'),1,{recipes:{gear:'supply'}});
  assert.equal(counts(chosen.processed).gear,1);assert.equal(counts(chosen.ore).gear,1);
  assert.ok(!chosen.ore.materials.some(m=>m.stack.ref==='ore'));
});

test('build totals switch all saved plans together and merge raw product labels without mutating snapshots',()=>{
  const c=fixture(),list=createBuildList(),views=calculateMaterialViews(c,s('machine'),1);
  list.add(s('machine'),1,views.processed,views);
  list.add(s('machine'),1,views.ore,views);
  views.processed.materials[0].count=999;views.ore.materials[0].products[0].ref='changed';
  assert.deepEqual(counts(list.total(false)),{ingot:8,planks:4,'fluid:2':500});
  assert.deepEqual(counts(list.total(true)),{ore:4,log:2,raw:4});
  assert.deepEqual(list.total(true).materials.find(m=>m.stack.ref==='ore').products.map(p=>p.ref),['ingot']);
  list.remove(list.entries[0].id);
  assert.deepEqual(counts(list.total()),{ingot:4,planks:2,'fluid:2':250});
});

const live=new Catalog(JSON.parse(fs.readFileSync(new URL('../dist/catalog.json',import.meta.url),'utf8')));
test('live ME Controller uses ingots and crystals in processed view, with traced ore destinations',()=>{
  const views=calculateMaterialViews(live,s('item:742:2'),1);
  const names=view=>view.materials.map(m=>live.item(m.stack.ref).name);
  assert.ok(names(views.processed).includes('Iron Ingot'));
  assert.ok(names(views.processed).includes('Fluix Crystal'));
  assert.ok(names(views.processed).includes('Fluix Dust'));
  assert.ok(!names(views.processed).includes('Iron Ore'));
  assert.ok(views.ore.materials.some(m=>m.products.some(p=>live.item(p.ref).name==='Iron Ingot')));
  const quartzOre=views.ore.materials.find(m=>live.item(m.stack.ref).name==='Certus Quartz Ore');
  assert.ok(quartzOre.products.some(p=>live.item(p.ref).name==='Fluix Dust'),'quartz left over from earlier processing also contributes to Fluix Dust');
  // Selecting a material itself still expands its recipe: sticks require planks.
  const sticks=calculateMaterialViews(live,s('item:280:0'),4);
  assert.ok(names(sticks.processed).some(name=>name.includes('Planks')));
  assert.ok(!names(sticks.processed).some(name=>name==='Stick'));
});

test('ore product labels follow guaranteed by-products into a later material',()=>{
  const c=fixture();
  const data=structuredClone(c.data);
  data.items.push({ref:'crystal',name:'Crystal'},{ref:'second-machine',name:'Second machine'});
  data.recipes.push({id:'crystal',calculable:true,type:'Crafting',output:s('crystal'),inputs:[s('bonus')]},
    {id:'second-machine',calculable:true,type:'Crafting',output:s('second-machine'),inputs:[s('ingot'),s('crystal')]});
  const catalog=new Catalog(data);catalog.raw.add('ore');
  const views=calculateMaterialViews(catalog,s('second-machine'),1);
  assert.deepEqual(counts(views.ore),{ore:1});
  assert.deepEqual(new Set(views.ore.materials[0].products.map(p=>p.ref)),new Set(['ingot','crystal']));
  assert.deepEqual(counts(views.processed),{ingot:1,crystal:1});
});

test('a smelted circuit is still a component rather than a processed resource',()=>{
  const c=fixture();
  const recipe={id:'circuit',type:'Furnace',machine:'Furnace',calculable:true,output:s('circuit'),inputs:[s('gear')]};
  c.items.set('circuit',{ref:'circuit',name:'Circuit'});c.recipes.set(recipe.id,recipe);
  c.outputs.set('circuit',[recipe]);c.outputRefs.set('circuit',[recipe]);
  const parent={id:'parent',type:'Crafting',calculable:true,output:s('parent'),inputs:[s('circuit')]};
  c.items.set('parent',{ref:'parent',name:'Parent'});c.recipes.set(parent.id,parent);
  c.outputs.set('parent',[parent]);c.outputRefs.set('parent',[parent]);
  assert.deepEqual(counts(calculateMaterialViews(c,s('parent'),1).processed),{ingot:4});
});

test('all export formats accept processed build totals after adding a plan in ore mode',()=>{
  const target=s('item:742:2'),views=calculateMaterialViews(live,target,1),list=createBuildList();
  list.add(target,1,views.ore,views);
  const nameFor=stack=>live.item(stack.ref).name;
  for(const format of ['json','csv','markdown','minecraft']) {
    const file=materialListExport(format,list.entries,list.total(false).materials,nameFor,'build',live);
    assert.match(file.content,/Iron Ingot/);
    assert.doesNotMatch(file.content,/Iron Ore/);
  }
});
