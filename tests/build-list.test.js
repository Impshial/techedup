import test from 'node:test';
import assert from 'node:assert/strict';
import { createBuildList } from '../dist/build-list.js';
import { key } from '../dist/planner.js';

const material=(ref,count,reasons=['basic'],nbt)=>({stack:{ref,count:1,...(nbt?{nbt}:{})},count,reasons});
const result=(materials,warnings=[])=>({materials,warnings});
const totals=list=>Object.fromEntries(list.total().materials.map(m=>[key(m.stack),m.count]));

test('five machine plans sum the displayed quantities once, including fluids and recipe boundaries',()=>{
  const list=createBuildList();
  list.add({ref:'machine-a'},3,result([material('iron',12),material('fluid:1',500)]));
  list.add({ref:'machine-b'},1,result([material('iron',4),material('redstone',2)]));
  list.add({ref:'machine-c'},2,result([material('iron',6),material('fluid:1',250)]));
  list.add({ref:'machine-d'},1,result([material('iron',1,['missing']),material('diamond',1)],['A recipe is missing.']));
  list.add({ref:'machine-e'},1,result([material('redstone',5)],['A recipe is missing.']));
  assert.equal(list.size,5);
  assert.deepEqual(totals(list),{iron:23,'fluid:1':750,redstone:7,diamond:1});
  assert.deepEqual(list.total().materials.find(m=>m.stack.ref==='iron').reasons,['basic','missing']);
  assert.deepEqual(list.total().warnings,['A recipe is missing.']);
});

test('saved plans are independent snapshots and preserve exact NBT variants',()=>{
  const list=createBuildList(),target={ref:'machine',count:1};
  const plan=result([material('microblock',4,['missing'],'manyullyn'),material('microblock',2,['missing'],'ardite')]);
  list.add(target,2,plan);
  target.ref='another-machine';plan.materials[0].count=999;plan.materials[0].stack.nbt='changed';
  assert.deepEqual(totals(list),{'microblock\u001fmanyullyn':4,'microblock\u001fardite':2});
  assert.equal(list.entries[0].target.ref,'machine');
  const exposed=list.entries;exposed[0].materials.length=0;
  assert.equal(list.total().materials.length,2);
});

test('repeated plans can be removed separately and clear resets the total',()=>{
  const list=createBuildList(),target={ref:'machine'},plan=result([material('iron',4)]);
  const first=list.add(target,1,plan),second=list.add(target,1,plan);
  assert.notEqual(first,second);
  assert.equal(totals(list).iron,8);
  list.remove(first);
  assert.equal(totals(list).iron,4);
  assert.equal(list.entries[0].id,second);
  list.clear();
  assert.equal(list.size,0);
  assert.deepEqual(list.total(),{materials:[],warnings:[]});
  list.add(target,1,result([]));
  assert.equal(list.size,1);
  assert.deepEqual(list.total().materials,[]);
});
