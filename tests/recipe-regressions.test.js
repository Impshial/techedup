import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Catalog,calculate} from '../dist/planner.js';
import {createItemSearch} from '../dist/search.js';
import {renderIngredientChoice,renderRecipeDiagram} from '../dist/recipe-view.js';

const data=JSON.parse(fs.readFileSync(new URL('../dist/catalog.json',import.meta.url),'utf8'));
const catalog=new Catalog(data);
const stack=ref=>({ref,count:1});

test('Resonant Energy Cell uses four Enderium ingots and a recursively craftable Reinforced cell',()=>{
  const recipe=catalog.forItem('item:917:4').find(r=>r.source==='minecraft.crafting');
  assert.ok(recipe?.calculable);
  assert.deepEqual(recipe.grid.map(row=>row.map(s=>s?.ref||null)),[
    [null,'ore:ingotEnderium',null],['ore:ingotEnderium','item:917:3','ore:ingotEnderium'],[null,'ore:ingotEnderium',null]
  ]);
  const result=calculate(catalog,stack('item:917:4'),1);
  assert.equal(result.tree.status,'craft');
  assert.equal(result.tree.children.find(n=>n.stack.ref==='item:917:3').status,'craft');
  assert.ok(!result.materials.some(m=>['item:917:3','item:917:4'].includes(m.stack.ref)));
  // Test a real captured full input reference, independently of its NBT hash.
  const alias=Object.keys(data.aliases).find(ref=>data.aliases[ref]==='item:917:3');
  assert.ok(alias);
  const fromOwned=calculate(catalog,stack('item:917:4'),1,{inventory:{[alias]:1}});
  assert.equal(fromOwned.tree.children.find(n=>n.stack.ref==='item:917:3').status,'owned');
});

test('RF variants share index entries, recipes and inventory while microblock variants remain separate',()=>{
  const search=createItemSearch(catalog);
  assert.equal(search('Resonant Energy Cell').length,1);
  assert.equal(search('Hardened Flux Capacitor').length,1);
  const full='item:917:4@6e4e4b086a0f',empty='item:917:4@36c560d8fe5f';
  assert.equal(catalog.canonicalRef(full),'item:917:4');
  assert.deepEqual(catalog.forItem(full),catalog.forItem(empty));
  assert.equal(calculate(catalog,stack(full),1).tree.recipe.id,catalog.forItem(empty)[0].id);
  assert.deepEqual(catalog.canonicalInventory({[full]:1,[empty]:2}),{'item:917:4':3});
  assert.ok(catalog.item('item:917:4').image.startsWith('images/rendered/'));
  const fence='item:10273:1@2da9e52da141';
  assert.equal(catalog.canonicalRef(fence),fence);
  assert.ok(catalog.item(fence).nbt);
});

test('stick planks visibly expose the ore group and switching it changes the plan',()=>{
  const recipe=catalog.forItem('item:280:0').find(r=>r.inputs.length===2&&r.inputs.every(s=>s.ref==='ore:plankWood'));
  const options=catalog.options(recipe.inputs[0]);
  for(const meta of [0,1,2,3])assert.ok(options.some(s=>s.ref===`item:5:${meta}`));
  const result=calculate(catalog,stack('item:280:0'),4,{recipes:{'item:280:0':recipe.id},members:{'ore:plankWood':'item:5:0'}});
  assert.equal(result.tree.children[0].stack.ref,'item:5:0');
  assert.equal(result.tree.children[0].wanted,2);
  const html=renderIngredientChoice(catalog,result.tree.children[0].source,result.tree.children[0].stack);
  assert.match(html,/<span>Any wood planks<\/span>/);
  assert.match(html,/<option value="item:5:0" selected>/);
  assert.match(html,/Birch Wood Planks/);
  assert.match(renderRecipeDiagram(catalog,recipe,{},result.tree),/Any wood planks/);
});
