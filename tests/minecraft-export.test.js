import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Catalog,calculate} from '../dist/planner.js';
import {materialListExport} from '../dist/material-export.js';
import {createBuildList} from '../dist/build-list.js';

const data=JSON.parse(fs.readFileSync(new URL('../dist/catalog.json',import.meta.url),'utf8'));
const catalog=new Catalog(data),nameFor=stack=>catalog.item(stack.ref).name;
const fence={ref:'item:10273:1@2da9e52da141',count:1};

test('Minecraft export resolves numeric IDs, exact microblock NBT and fluid names for the GUI mod',()=>{
  const entries=[{target:fence,quantity:2},{target:{ref:'item:917:4@6e4e4b086a0f'},quantity:1}];
  const materials=[{stack:fence,count:4,reasons:['chosen']},{stack:{ref:'fluid:33'},count:288,reasons:['basic']}];
  const before=JSON.stringify({entries,materials});
  const file=materialListExport('minecraft',entries,materials,nameFor,'build',catalog);
  const result=JSON.parse(file.content);
  assert.equal(file.filename,'2x Block of Manyullyn Fence + Resonant Energy Cell.techedup.json');
  assert.equal(result.format,'techit-minecraft-build-list');
  assert.equal(result.version,1);assert.equal(result.minecraftVersion,'1.6.4');
  assert.equal(result.catalog.sha256,data.summary.sha256);
  assert.deepEqual(result.plans[0],{ref:fence.ref,name:'Block of Manyullyn Fence',quantity:2,kind:'item',itemId:10273,metadata:1,unit:'items',nbt:catalog.item(fence.ref).nbt});
  assert.equal(result.plans[1].ref,'item:917:4');assert.equal(result.plans[1].chargeIndependent,true);
  assert.equal(result.materials.find(row=>row.kind==='fluid').fluidName,'manyullyn.molten');
  assert.equal(result.materials.find(row=>row.kind==='fluid').quantity,288);
  assert.equal(JSON.stringify({entries,materials}),before);
});

test('current Minecraft export stays separate from the combined build-list export',()=>{
  const target={ref:'item:917:4',count:1},result=calculate(catalog,target,1),build=createBuildList();
  build.add(target,1,result);build.add(target,2,calculate(catalog,target,2));
  const current=materialListExport('minecraft',[{target,quantity:1}],result.materials,nameFor,'current',catalog);
  const total=materialListExport('minecraft',build.entries,build.total().materials,nameFor,'build',catalog);
  assert.equal(current.filename,'Resonant Energy Cell.techedup.json');
  assert.equal(total.filename,'Resonant Energy Cell + 2x Resonant Energy Cell.techedup.json');
  assert.equal(JSON.parse(current.content).plans.length,1);
  assert.equal(JSON.parse(total.content).plans.length,2);
  const counts=file=>new Map(JSON.parse(file.content).materials.map(row=>[row.ref,row.quantity]));
  assert.ok(counts(total).get('item:368:0')>counts(current).get('item:368:0'));
});

test('Minecraft export filenames handle Windows characters, reserved names and long multi-item plans',()=>{
  const target={ref:'item:1:0',count:1};
  const make=(name,entries=[{target,quantity:1}])=>materialListExport('minecraft',entries,[],()=>name,'build',catalog).filename;
  assert.equal(make('A/B: "Cell"? <I> | *.'),'A B Cell I.techedup.json');
  assert.equal(make('CON'),'Teched Up CON.techedup.json');
  assert.equal(make('...'),'Build list.techedup.json');
  const name='Long machine name '.repeat(30);
  const a=make(name),b=make(name,[{target,quantity:2}]);
  assert.ok(a.length<=180);assert.ok(b.length<=180);assert.notEqual(a,b);
  assert.match(a,/ - [a-f0-9]{8}\.techedup\.json$/);
});

test('Minecraft export preserves unresolved rows and long NBT integers instead of inventing item IDs',()=>{
  const nbt='{"long":{"type":"NBTTagLong","value":{"field_74753_a":9223372036854775807}}}';
  const materials=[{stack:{ref:'ore:missing'},count:2,reasons:['unresolved']},
    {stack:{ref:'item:1:0@abc',nbt},count:1,reasons:['chosen']}];
  const file=materialListExport('minecraft',[],materials,nameFor,'current',catalog);
  const rows=JSON.parse(file.content).materials;
  assert.equal(rows.find(row=>row.ref==='ore:missing').kind,'unresolved');
  assert.equal(rows.find(row=>row.ref==='item:1:0@abc').nbt,nbt);
  assert.throws(()=>materialListExport('minecraft',[],[{stack:{ref:'item:1:0@abc'},count:1}],nameFor,'current',catalog),/variant data/);
  assert.throws(()=>materialListExport('minecraft',[],[{stack:{ref:'item:1:0'},count:0}],nameFor,'current',catalog),/quantity/);
});
