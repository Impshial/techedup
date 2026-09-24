import test from 'node:test';
import assert from 'node:assert/strict';
import { createBuildList } from '../dist/build-list.js';
import { materialListExport } from '../dist/material-export.js';

const names = {machine:'Machine',second:'Second Machine',iron:'Iron Ore','fluid:1':'Water',micro:'Microblock'};
const nameFor = stack => names[stack.ref] || stack.ref;
const material = (ref,count,nbt) => ({stack:{ref,count:1,...(nbt?{nbt}:{})},count,reasons:['basic']});
const plan = {target:{ref:'machine',count:1},quantity:2};
const materials = [material('iron',6),material('fluid:1',1250),material('micro',4,'{"material":"manyullyn"}')];

test('JSON exports combined quantities, units, and exact variant data without mutating the saved list',()=>{
  const list=createBuildList();
  list.add(plan.target,plan.quantity,{materials,warnings:[]});
  list.add({ref:'second'},3,{materials:[material('iron',9)],warnings:[]});
  const before=JSON.stringify(list.entries);
  const file=materialListExport('json',list.entries,list.total().materials,nameFor);
  const data=JSON.parse(file.content);
  assert.equal(file.filename,'techit-build-list.json');
  assert.deepEqual(data.plans.map(item=>item.quantity),[2,3]);
  assert.equal(data.materials.find(item=>item.ref==='iron').quantity,15);
  assert.deepEqual(data.materials.find(item=>item.ref==='fluid:1'),{name:'Water',ref:'fluid:1',quantity:1250,unit:'mB'});
  assert.equal(data.materials.find(item=>item.ref==='micro').nbt,'{"material":"manyullyn"}');
  assert.equal(JSON.stringify(list.entries),before);
});

test('current-list exports exclude other plans in every format',()=>{
  for(const format of ['json','csv','markdown']) {
    const file=materialListExport(format,[plan],materials,nameFor,'current');
    assert.match(file.filename,/^techit-material-list\./);
    assert.doesNotMatch(file.content,/Second Machine/);
    if(format==='json')assert.equal(JSON.parse(file.content).materials.find(item=>item.ref==='iron').quantity,6);
    if(format==='csv')assert.match(file.content,/"Iron Ore","6","items","iron"/);
    if(format==='markdown')assert.match(file.content,/- \[ \] 6 × Iron Ore/);
  }
});

test('CSV quotes commas, quotes, and newlines and keeps spreadsheet formulas as text',()=>{
  const file=materialListExport('csv',[plan],[material('iron',1200),material('danger',2)],
    stack=>stack.ref==='danger'?'=1+1':'Ore, "rich"\nvariant');
  assert.ok(file.content.startsWith('\uFEFF"Item","Quantity","Unit","ID","NBT"\r\n'));
  assert.ok(file.content.includes('"Ore, ""rich""\nvariant","1200","items","iron",""'));
  assert.ok(file.content.includes('"\'=1+1","2","items","danger",""'));
  assert.ok(file.content.endsWith('\r\n'));
});

test('Markdown makes materials checkable, preserves fluid units, escapes names, and handles an empty material list',()=>{
  const file=materialListExport('markdown',[plan],materials,stack=>stack.ref==='iron'?'Iron *Ore* [A]':nameFor(stack));
  assert.equal(file.filename,'techit-build-list.md');
  assert.match(file.content,/- 2 × Machine/);
  assert.ok(file.content.includes('- [ ] 6 × Iron \\*Ore\\* \\[A\\]'));
  assert.ok(file.content.includes('- [ ] 1250 mB × Water'));
  assert.equal(file.content.match(/^- \[ \]/gm).length,3);
  const empty=materialListExport('markdown',[plan],[],nameFor);
  assert.match(empty.content,/No additional materials needed\./);
  assert.throws(()=>materialListExport('unknown',[plan],materials,nameFor),/Unknown export format/);
});
