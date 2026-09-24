import test from 'node:test';
import assert from 'node:assert/strict';
import { createFavorites, favoritesStorageKey, renderFavoriteButton } from '../dist/favorites.js';
import { renderRecipeDiagram } from '../dist/recipe-view.js';

function memoryStorage() {
  const data=new Map();
  return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
}

test('favorites survive new sessions and preserve exact item variants and fluids',()=>{
  const storage=memoryStorage(),first=createFavorites(()=>storage);
  for(const ref of ['item:1478:2','item:25131:770@manyullyn','item:25131:770@ardite','fluid:33'])assert.equal(first.toggle(ref),true);
  const reopened=createFavorites(()=>storage);
  assert.deepEqual(reopened.refs,first.refs);
  assert.equal(reopened.toggle('item:25131:770@ardite'),true);
  const again=createFavorites(()=>storage);
  assert.equal(again.has('item:25131:770@ardite'),false);
  assert.equal(again.has('item:25131:770@manyullyn'),true);
  assert.equal(again.has('fluid:33'),true);
});

test('changes from another tab are merged before saving and clearing storage updates favorites',()=>{
  const storage=memoryStorage(),a=createFavorites(()=>storage),b=createFavorites(()=>storage);
  a.toggle('controller');b.toggle('furnace');
  a.refresh();assert.deepEqual(a.refs,['controller','furnace']);
  a.toggle('controller');b.refresh();assert.deepEqual(b.refs,['furnace']);
  storage.removeItem(favoritesStorageKey);b.refresh();assert.deepEqual(b.refs,[]);
});

test('saved charge variants resolve to one favorite across tabs and sessions',()=>{
  const storage=memoryStorage();
  storage.setItem(favoritesStorageKey,JSON.stringify({version:1,refs:['empty','full','microblock']}));
  const canonical=ref=>['empty','full'].includes(ref)?'cell':ref;
  const first=createFavorites(()=>storage,()=>{},canonical);
  assert.deepEqual(first.refs,['cell','microblock']);
  assert.equal(first.has('full'),true);
  first.toggle('cell');
  const second=createFavorites(()=>storage,()=>{},canonical);
  assert.deepEqual(second.refs,['microblock']);
  second.toggle('full');first.refresh();
  assert.deepEqual(first.refs,['microblock','cell']);
});

test('blocked storage and malformed saved data report an error without claiming a favorite was saved',()=>{
  const messages=[],storage=memoryStorage();
  const broken=createFavorites(()=>{throw new Error('Blocked');},message=>messages.push(message));
  assert.equal(broken.toggle('controller'),false);assert.equal(broken.has('controller'),false);
  assert.match(messages.at(-1),/could not be saved/);
  storage.setItem(favoritesStorageKey,'not json');
  const corrupt=createFavorites(()=>storage,message=>messages.push(message));
  assert.deepEqual(corrupt.refs,[]);assert.match(messages.at(-1),/could not be loaded/);
});

test('recipe grids keep item navigation without repeating favorite buttons',()=>{
  const items=new Map([['copper',{name:'Copper Ingot',kind:'item'}],['machine',{name:'Machine',kind:'item'}]]);
  const catalog={items,item:ref=>items.get(ref)||{name:ref},options:()=>[{ref:'copper',count:1}]};
  const recipe={inputs:[{ref:'ore:ingotCopper',count:2}],output:{ref:'machine',count:1},machine:'Crafting'};
  const markup=renderRecipeDiagram(catalog,recipe,{});
  assert.match(markup,/data-item="ore:ingotCopper"/);
  assert.match(markup,/data-item="machine"/);
  assert.doesNotMatch(markup,/data-favorite|favorite-toggle/);
  assert.match(renderFavoriteButton('item:"','A < B',false),/data-favorite="item:&quot;"/);
  assert.match(renderFavoriteButton('item','A < B',false),/Add A &lt; B to favorites/);
});
