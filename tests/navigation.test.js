import test from 'node:test';
import assert from 'node:assert/strict';
import { capturePage, createNavigation } from '../dist/navigation.js';

function browserHistory() {
  const entries=[{state:null,url:'https://example.com/'},{state:null,url:'/'}];
  let position=1;
  return {
    onpop:()=>{},
    get state(){return structuredClone(entries[position].state);},
    get url(){return entries[position].url;},
    get length(){return entries.length;},
    replaceState(state,unused,url){entries[position]={state:structuredClone(state),url};},
    pushState(state,unused,url){entries.splice(++position,Infinity,{state:structuredClone(state),url});},
    back(){if(position){position--;this.onpop(this.state);}},
    forward(){if(position<entries.length-1){position++;this.onpop(this.state);}},
  };
}
const view=(ref=null,tab='plan')=>({ref,target:ref?{ref,count:1}:null,quantity:1,tab,query:'',craftable:false,recipeLimit:40,process:'',recipes:{},members:{},modOpen:{},modLimits:{},expandedNodes:new Set(['0'])});

test('Back and Forward restore calculator views before leaving the site',()=>{
  const history=browserHistory(),location={pathname:'/',search:''};
  let restored;
  const nav=createNavigation(history,location,page=>{restored=page;});history.onpop=entry=>nav.restore(entry);
  nav.start(capturePage(view()),'item index');
  assert.equal(nav.back(),false);
  nav.visit(capturePage(view('controller')),'ME Controller');
  const prior=view('controller','recipes');
  prior.quantity=12;prior.query='ME cont';prior.craftable=true;prior.process='Crafting';
  prior.recipes.controller='chosen-recipe';prior.members['ore:ingotIron']='iron';
  prior.expandedNodes.add('0.2');prior.modOpen['Applied Energistics']=true;
  nav.visit(capturePage(prior),'ME Controller recipes');
  nav.save(capturePage(prior,{scrollY:450,indexScroll:210}));
  nav.visit(capturePage(view('iron')),'Iron Ingot');
  assert.equal(nav.backLabel,'ME Controller recipes');
  assert.equal(nav.back(),true);
  assert.deepEqual(restored,capturePage(prior,{scrollY:450,indexScroll:210}));
  assert.equal(nav.backLabel,'ME Controller');
  history.forward();assert.equal(restored.ref,'iron');
  history.back();history.back();assert.equal(restored.ref,'controller');assert.equal(restored.tab,'plan');
  history.back();assert.equal(restored.ref,null);assert.equal(nav.backLabel,null);
  assert.equal(history.url,'/');
});

test('fresh visits open the index, reloads restore owned history, and new selections replace forward history',()=>{
  const history=browserHistory(),location={pathname:'/calculator/',search:'?pack=techit'};
  let nav=createNavigation(history,location,()=>{});history.onpop=entry=>nav.restore(entry);
  assert.equal(nav.start(capturePage(view()),'item index').ref,null);
  nav.visit(capturePage(view('item:10273:1@abc')),'Fence');
  assert.equal(history.url,'/calculator/?pack=techit#item%3A10273%3A1%40abc');
  const before=history.length;
  nav=createNavigation(history,location,()=>{});
  assert.equal(nav.start(capturePage(view()),'item index').ref,'item:10273:1@abc');
  assert.equal(nav.backLabel,'item index');assert.equal(history.length,before);
  nav.visit(capturePage(view('post')),'Post');history.back();
  nav.visit(capturePage(view('slab')),'Slab');history.forward();
  assert.equal(history.state.view.ref,'slab');
  assert.equal(history.length,before+1);
});

test('page snapshots are isolated and omit the large catalog and shared inventory',()=>{
  const state=view('fence');state.inventory={iron:9};state.catalog={large:true};
  state.recipes.fence='recipe-a';
  const page=capturePage(state);
  state.recipes.fence='recipe-b';state.expandedNodes.add('0.1');
  assert.equal(page.recipes.fence,'recipe-a');assert.deepEqual(page.expandedNodes,['0']);
  assert.ok(!('inventory' in page)&&!('catalog' in page));
});
