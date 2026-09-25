import test from 'node:test';
import assert from 'node:assert/strict';
import { Catalog } from '../dist/planner.js';
import { createAskMe } from '../dist/ask-me.js';
import { createRecipeUsageSearch } from '../dist/recipe-usage.js';

const s=(ref,count=1,extra={})=>({ref,count,...extra});
function fixture(items,recipes,ores={}) {
  return new Catalog({version:3,items,ores,recipes:recipes.map((recipe,index)=>({id:String(index),type:'Crafting',calculable:true,...recipe}))});
}

test('uses span multiple processing steps, alternate members, mods, and unrelated item families',()=>{
  const items=[
    {ref:'red',name:'Red Ore',mod:'Mining'}, {ref:'blue',name:'Blue Ore',mod:'Mining'},
    {ref:'dust',name:'Red Dust'}, {ref:'ingot',name:'Red Ingot'}, {ref:'ingot2',name:'Blue Ingot'},
    {ref:'chip',name:'Basic Processor',mod:'Circuits'}, {ref:'chip2',name:'Advanced Processor',mod:'Other Circuits'},
    {ref:'fluid:oil',name:'Oil',kind:'fluid'}, {ref:'fluid:fuel',name:'Fuel',kind:'fluid'},
    {ref:'engine',name:'Oil Engine',mod:'Engines'}, {ref:'isolated',name:'Green Ore'},
  ];
  const c=fixture(items,[
    {output:s('dust',2),inputs:[s('red')]}, {output:s('ingot'),inputs:[s('dust')]},
    {output:s('ingot2'),inputs:[s('blue')]},
    {output:s('chip'),inputs:[s('ore:ingotMetal'),s('ore:ingotMetal')]},
    {output:s('chip2'),inputs:[s('chip')]},
    {output:s('fluid:fuel',1000),inputs:[s('fluid:oil',1000)]},
    {output:s('engine'),inputs:[s('fluid:fuel',1000)]},
  ],{'ore:ingotMetal':[s('ingot'),s('ingot2')]});
  const ask=createAskMe(c), result=ask.interpret('list ten ores used to make processors');
  assert.equal(result.status,'list');assert.equal(result.total,2);
  assert.deepEqual(result.items.map(item=>item.ref),['blue','red'],'rank the shorter processing route first');
  assert.deepEqual(result.relationships.red.map(use=>use.item.ref),['chip','chip2']);
  assert.deepEqual(result.relationships.red[0].steps.map(step=>step.output.ref),['dust','ingot','chip']);
  assert.equal(result.relationships.blue.length,2,'repeated ingredient slots count an output once');
  const fluids=ask.interpret('show one fluid used in engines');
  assert.equal(fluids.status,'list');assert.equal(fluids.total,2);assert.equal(fluids.items[0].ref,'fluid:fuel');
  assert.equal(fluids.relationships['fluid:fuel'][0].item.ref,'engine');
  assert.deepEqual(ask.interpret('list five Green Ores used in processors').items,[]);
});

test('relationships preserve NBT and wildcard alternatives and terminate on recipe loops',()=>{
  const items=[{ref:'ore',name:'Ore'},{ref:'plate@red',name:'Plate',nbt:'red'}, {ref:'plate@blue',name:'Plate',nbt:'blue'},
    {ref:'red',name:'Red Device'}, {ref:'blue',name:'Blue Device'},
    {ref:'item:5:0',name:'Oak Planks'}, {ref:'item:5:1',name:'Spruce Planks'}, {ref:'wood',name:'Wood Device'}];
  const c=fixture(items,[{output:s('plate@red',1,{nbt:'red'}),inputs:[s('ore')]},
    {output:s('red'),inputs:[s('plate@red',1,{nbt:'red'})]}, {output:s('blue'),inputs:[s('plate@blue',1,{nbt:'blue'})]},
    {output:s('plate@red',1,{nbt:'red'}),inputs:[s('red')]}, {output:s('wood'),inputs:[s('item:5:*')]},
  ]);
  const search=createRecipeUsageSearch(c);
  const matches=search([items[0]],[items[3],items[4]]);
  assert.equal(matches.length,1);assert.deepEqual(matches[0].uses.map(use=>use.item.ref),['red']);
  assert.equal(matches[0].uses[0].steps.length,2);
  assert.deepEqual(search([items[5],items[6]],[items[7]]).map(match=>match.item.ref).sort(),['item:5:0','item:5:1']);
  assert.equal(search([items[3]],[items[3]]).length,0,'an item is not its own ingredient result');
});

test('only consumed inputs and guaranteed outputs establish contribution routes',()=>{
  const items=['ore','tool','worn','primary','bonus','chance','unknown','machine','toolMachine','chanceMachine','unknownMachine'].map(ref=>({ref,name:ref}));
  const c=fixture(items,[
    {output:s('primary'),outputs:[s('primary'),s('bonus',1,{chance:1}),s('chance',1,{chance:0.1})],inputs:[s('ore'),s('tool',1,{consume:false}),s('worn',1,{toolDamage:1})]},
    {output:s('machine'),inputs:[s('bonus')]}, {output:s('toolMachine'),inputs:[s('tool')]},
    {output:s('chanceMachine'),inputs:[s('chance')]}, {output:s('unknown'),inputs:[s('ore')],calculable:false},
    {output:s('unknownMachine'),inputs:[s('unknown')]},
  ]);
  const matches=createRecipeUsageSearch(c)(items.slice(0,3),[c.item('machine'),c.item('chanceMachine'),c.item('unknownMachine')]);
  assert.deepEqual(matches.map(match=>match.item.ref),['ore']);
  assert.deepEqual(matches[0].uses.map(use=>use.item.ref),['machine']);
  assert.equal(matches[0].uses[0].steps[0].byproduct,true);
});

test('generic material usage searches retain term exclusions and exact numbered item names',()=>{
  const c=fixture([{ref:'wood',name:'Birch Planks'},{ref:'iron',name:'Iron Ingot'},{ref:'gear',name:'64 Bit Gear'}],
    [{output:s('gear'),inputs:[s('wood'),s('iron')]}]);
  const ask=createAskMe(c),r=ask.interpret('show ten materials excluding birch used in gears');
  assert.equal(r.status,'list');assert.deepEqual(r.items.map(item=>item.ref),['iron']);
  assert.equal(ask.interpret('list 64 Bit Gear').limit,null);
  assert.equal(ask.interpret('list five 64 Bit Gears').limit,5);
  assert.equal(ask.interpret('show zero ores used in gears').status,'error');
});
