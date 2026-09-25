import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Catalog, calculateMaterialViews } from '../dist/planner.js';
import { createAskMe, answerQuestion, answerIssues, questionPlan } from '../dist/ask-me.js';
import { capturePage, createNavigation } from '../dist/navigation.js';

const catalog = new Catalog(JSON.parse(fs.readFileSync(new URL('../dist/catalog.json',import.meta.url),'utf8')));
const ask = createAskMe(catalog);
const ready = (text, selections) => {const result=ask.interpret(text,selections);assert.equal(result.status,'ready',JSON.stringify(result));return result.request;};
const s = (ref,count=1,extra={}) => ({ref,count,...extra});
function fixture(recipes, names = {}) {
  const refs=[...new Set(recipes.flatMap(r=>[r.output.ref,...r.inputs.map(s=>s.ref),...(r.outputs || []).map(s=>s.ref)]))];
  return new Catalog({version:3,ores:{},items:refs.map(ref=>({ref,name:names[ref] || ref})),recipes:recipes.map(r=>({type:'Crafting',calculable:true,...r}))});
}

test('both original questions resolve without changing item names, quantities or intent',()=>{
  const sticks=ready('How many sticks would it take to make 25 template carriage blocks?');
  assert.equal(sticks.targetRef,'item:1123:4@252148cea601');assert.equal(sticks.ingredientRef,'item:280:0');assert.equal(sticks.quantity,25);
  const answer=answerQuestion(catalog,sticks);
  assert.equal(answer.count,2496);
  // This live plan also has a sapling branch without an imported recipe.
  assert.ok(answer.issues.length,'missing branches must remain visible alongside the counted sticks');
  const request=ready('How many of each item in the basic processor assembly what I need to make 36 basic processor assembly items?');
  assert.equal(request.kind,'materials');assert.equal(request.targetRef,'item:5758:20');assert.equal(request.quantity,36);
  const result=answerQuestion(catalog,request),existing=calculateMaterialViews(catalog,s(request.targetRef),36);
  assert.deepEqual(result.views,existing);
  assert.ok(result.ingredients.length>0);
  assert.deepEqual(result.ingredients.map(row=>row.count),existing.ore.tree.children.map(node=>node.wanted));
});

test('supported wording, plurals, English quantities and default one',()=>{
  for(const text of ['What do I need for thirty-six Basic Processor Assemblies?', '36 Basic Processor Assemblies', 'What materials would I need to make 36 Basic Processor Assemblies?', 'Ingredients for 36 Basic Processor Assemblies'])assert.equal(ready(text).quantity,36);
  assert.equal(ready('ME Controller').quantity,1);
  assert.equal(ready('What do I need for a ME Controller?').quantity,1);
  assert.equal(ready('one hundred and twenty-five ME Controllers').quantity,125);
  assert.equal(ready('two thousand three hundred and six ME Controllers').quantity,2306);
  assert.equal(ready('1,000 ME Controllers').quantity,1000);
  assert.equal(ready('how much redstone do I need for 3 ME Controllers').ingredientRef,'item:331:0');
  assert.equal(ready('How many sticks do I need to craft 5 Template Carriages?').quantity,5);
  assert.equal(ready('Could you tell me what do I need for 3 ME Controllers, please?').quantity,3);
});

test('numeric and English quantities agree, including a hundred and a thousand',()=>{
  for (const [quantity,phrases] of [
    [1,['1','one','a']], [21,['21','twenty-one','twenty one']],
    [100,['100','one hundred','a hundred','A HUNDRED']],
    [125,['125','one hundred and twenty-five','a hundred and twenty-five','a hundred twenty five']],
    [1000,['1,000','one thousand','a thousand']],
    [1100,['1100','one thousand one hundred','a thousand and a hundred']],
    [1025,['1025','a thousand and twenty-five']],
    [100000,['100000','a hundred thousand']], [1000000,['1000000','one million','a million']],
  ]) for (const phrase of phrases) {
    for (const question of [`${phrase} ME Controllers`,`What do I need for ${phrase} ME Controllers?`,`How many sticks for ${phrase} ME Controllers?`]) {
      assert.equal(ready(question).quantity,quantity,question);
    }
  }
  const numeric=answerQuestion(catalog,ready('How much Minecraft Gold Ore for 100 Pulverized Gold?'));
  const words=answerQuestion(catalog,ready('How much Minecraft Gold Ore for a hundred Pulverized Gold?'));
  assert.equal(words.count,50);assert.deepEqual(words.views,numeric.views);assert.deepEqual(words.ingredients,numeric.ingredients);
  assert.equal(ready('a hundred Gold Ingots from Pulverized Gold').quantity,100);
  const c=new Catalog({version:3,ores:{},recipes:[],items:[{ref:'pearl',name:'Pearl',maxStackSize:16},{ref:'named',name:'A Hundred Stars'}]});
  const resolver=createAskMe(c);
  assert.equal(resolver.interpret('a hundred stacks of Pearls').request.quantity,1600);
  assert.equal(resolver.interpret('A Hundred Stars').request.quantity,1);
  assert.equal(resolver.interpret('a million stacks of Pearls').status,'error');
  assert.equal(ask.interpret('a hundred stacks of ME Controllers').status,'quantity');
  for (const phrase of ['a million and one','two million','a hundred and','a thousand and','a hundred a hundred','a hundred thousand thousand','zero']) {
    assert.equal(ask.interpret(`${phrase} ME Controllers`).status,'error',phrase);
  }
});

test('catalog-list requests accept natural variations and plurals',()=>{
  const expected=ask.interpret('give me a list of planks');
  assert.equal(expected.status,'list');assert.ok(expected.items.length>5);
  assert.ok(expected.items.some(item=>item.ref==='item:5:0'));
  assert.ok(expected.items.some(item=>item.ref==='item:5:2'));
  const refs=result=>result.items.map(item=>item.ref);
  for (const text of [
    'list all planks','List planks!','list out all the planks','give me all planks',
    'show me planks','show a list of planks','A list of planks',
    'Please give me a list of all the planks.', 'Could you please list all planks?',
    'Can you show me all the planks?', 'Can I see a list of planks?',
    "I'd like a list of planks", 'What types of planks are there?',
    'Which kinds of planks are available in the pack?', 'What planks are available?',
    'Which planks can I find in this modpack?', 'Could you tell me what types of planks are available?',
    'list all available planks in the catalog, please', 'give me a list of plank',
    'What are all the planks?', 'show me every kind of plank', 'I want a list of planks',
  ]) {
    const result=ask.interpret(text);
    assert.equal(result.status,'list',text);assert.deepEqual(refs(result),refs(expected),text);
  }
  const sand=ask.interpret('list all sands');
  assert.equal(sand.status,'list');assert.ok(sand.items.some(item=>item.ref==='item:12:0'));
  assert.deepEqual(refs(sand),refs(ask.interpret('show me a list of sand')));
  assert.ok(!sand.items.some(item=>/sandstone|sandwich/i.test(item.name)));
  assert.equal(ask.interpret('list all unknownxyz').items.length,0);
  assert.equal(ask.interpret('list '+ 'x'.repeat(400)).status,'error');
  for (const text of ['list ingredients for a hundred ME Controllers','show me the materials for 100 ME Controllers','Could you show me what do I need for 100 ME Controllers?']) {
    assert.equal(ready(text).quantity,100,text);
  }
});

test('counted lists accept digits and words while crafting requests keep their quantities',()=>{
  for (const [text,limit] of [['Show 5 ores',5],['list 10 planks',10],['Show me five ores',5],['List the top ten planks',10],['give me a list of a hundred planks',100],['show the first five kinds of planks',5]]) {
    const result=ask.interpret(text);assert.equal(result.status,'list',text);
    assert.equal(result.limit,limit);assert.equal(result.items.length,limit);assert.ok(result.total>=limit);
  }
  for (const text of ['show a hundred ME Controllers','Could you show me 100 ME Controllers?']) {
    const result=ask.interpret(text);assert.equal(result.status,'list');assert.equal(result.limit,100);
    assert.equal(result.total,1);assert.equal(result.items.length,1);
  }
  assert.equal(ready('how do I make a hundred ME Controllers').quantity,100);
  for (const text of ['list 0 ores','show -5 ores','list 1.5 planks','show one two ores','list 1000001 ores','show two stacks of planks']) assert.equal(ask.interpret(text).status,'error',text);
  const filtered=ask.interpret('Show ten Chisel planks excluding birch');
  assert.equal(filtered.items.length,10);assert.ok(filtered.items.every(item=>item.mod==='Chisel' && !/birch/i.test(item.name)));
  const fluids=ask.interpret('list 5 fluids');assert.equal(fluids.items.length,5);assert.ok(fluids.items.every(item=>item.ref.startsWith('fluid:')));
});

test('counted usage lists trace processing and show every matching output across mods',()=>{
  const result=ask.interpret('Show 5 ores used in chests');
  assert.equal(result.status,'list');assert.equal(result.limit,5);assert.equal(result.items.length,5);
  assert.ok(result.total>=5);assert.equal(result.usesQuery,'chests');
  const mods=new Set();
  for (const item of result.items) {
    assert.ok(result.relationships[item.ref].length>0);
    for (const use of result.relationships[item.ref]) {
      mods.add(use.item.mod);assert.ok(/chest/i.test(use.item.name));
      assert.equal(use.steps[0].input.ref,item.ref);assert.equal(use.steps.at(-1).output.ref,use.item.ref);
      for (let i=0;i<use.steps.length;i++) {
        assert.ok(catalog.recipes.get(use.steps[i].recipeId).calculable);
        if(i)assert.equal(use.steps[i-1].to,use.steps[i].from);
      }
    }
  }
  assert.ok(mods.size>1);
  const gold=ask.interpret('list five Minecraft gold ores used to make Gold Chests from any mod');
  assert.equal(gold.status,'list');assert.ok(gold.items.some(item=>item.ref==='item:14:0'));
  const use=gold.relationships['item:14:0'].find(use=>use.item.ref==='item:831:1');
  assert.ok(use);assert.ok(use.steps.some(step=>step.output.ref==='item:266:0'));
  const pistons=ask.interpret('list ten ingots used for pistons');
  assert.equal(pistons.status,'list');assert.ok(pistons.items.length>0 && pistons.items.length<=10);
  assert.ok(Object.values(pistons.relationships).flat().every(use=>/piston/i.test(use.item.name)));
  const scoped=ask.interpret('show five ores used in Applied Energistics chests');
  assert.equal(scoped.status,'list');assert.ok(scoped.items.length>0);
  assert.ok(Object.values(scoped.relationships).flat().every(use=>use.item.mod==='Applied Energistics'));
  assert.deepEqual(scoped.filters.includeMods,[],'an output mod must not restrict the source material mod');
  assert.equal(ask.interpret('show five ores used in').status,'error');
  assert.equal(ask.interpret('show five ores used in unknownxyz').status,'error');
});

test('catalog lists include raw items and ore members, retain variants, and deduplicate aliases',()=>{
  const c=new Catalog({version:3,aliases:{old:'oak'},ores:{'ore:plankWood':[s('oak'),s('odd')]},recipes:[],items:[
    {ref:'oak',name:'Oak Wood Planks',mod:'Minecraft'}, {ref:'old',name:'Oak Wood Planks',mod:'Minecraft'},
    {ref:'odd',name:'Wooden Board',mod:'Example'},
    {ref:'birch@a',name:'Birch Planks',mod:'Example'}, {ref:'birch@b',name:'Birch Planks',mod:'Example'},
    {ref:'sand',name:'Sand',mod:'Minecraft'}, {ref:'sandstone',name:'Sandstone',mod:'Minecraft'},
  ]});
  const resolver=createAskMe(c), refs=text=>resolver.interpret(text).items.map(item=>item.ref).sort();
  assert.deepEqual(refs('list planks'),['birch@a','birch@b','oak','odd']);
  assert.deepEqual(refs('list Minecraft planks'),['oak']);
  assert.deepEqual(refs('show me all plankWood'),['oak','odd']);
  assert.deepEqual(refs('list ore:plankWood'),['oak','odd']);
  assert.deepEqual(refs('list sands'),['sand']);
});

test('catalog exclusions handle both supplied examples and equivalent wording',()=>{
  const list=text=>{const result=ask.interpret(text);assert.equal(result.status,'list',JSON.stringify(result));return result;};
  const planks=list('list planks').items, ores=list('list ores').items;
  assert.ok(planks.some(item=>item.mod==='Chisel'));assert.ok(ores.some(item=>item.mod==='Thermal Expansion'));
  for (const phrase of ['excluding','not using','not including','except','except for','without','not from','not in','not with','but not','do not include',"don't include",'leave out','other than','apart from','omitting']) {
    const result=list(`Give me a list of planks ${phrase} the chisel mod`);
    assert.deepEqual(result.items,planks.filter(item=>item.mod!=='Chisel'),phrase);
    assert.deepEqual(result.filters.excludeMods,['Chisel']);assert.equal(result.query,'planks');
  }
  const oreResult=list('give me a list of ores not including thermal expansion');
  assert.deepEqual(oreResult.items,ores.filter(item=>item.mod!=='Thermal Expansion'));
  assert.deepEqual(list('list ores excluding Thermal Expansion and Minecraft').items,ores.filter(item=>!['Thermal Expansion','Minecraft'].includes(item.mod)));
  assert.deepEqual(list('excluding the Chisel mod, give me a list of planks').items,planks.filter(item=>item.mod!=='Chisel'));
  assert.deepEqual(list('list planks excluding anything from the Chisel mod, please').items,planks.filter(item=>item.mod!=='Chisel'));
});

test('mod qualifiers work before, within and after catalog questions',()=>{
  const expected=ask.interpret('list planks').items.filter(item=>item.mod==='Chisel');
  for (const text of [
    'Chisel, give me a list of planks', 'From the Chisel mod, give me a list of planks',
    'give me a Chisel list of planks', 'give me a list of Chisel planks',
    'give me a list of planks Chisel', 'give me a list of planks from Chisel',
    'give me a list from Chisel of planks', 'give me a list of planks in the Chisel mod',
    'What Chisel planks are available?', 'Could you Chisel please list all planks?',
  ]) {
    const result=ask.interpret(text);
    assert.equal(result.status,'list',text);assert.deepEqual(result.items,expected,text);
    assert.deepEqual(result.filters.includeMods,['Chisel']);
  }
  const all=ask.interpret('list planks').items;
  assert.deepEqual(ask.interpret('list planks from Chisel or Minecraft').items,all.filter(item=>['Chisel','Minecraft'].includes(item.mod)));
  const byMod=ask.interpret('list all items from Thermal Expansion');
  assert.equal(byMod.status,'list');assert.ok(byMod.items.length>0);
  assert.ok(byMod.items.every(item=>item.mod==='Thermal Expansion'));
});

test('term exclusions combine with mod filters without dropping allowed variants',()=>{
  const items=[
    {ref:'birch@one',name:'Birch Planks',mod:'Chisel'}, {ref:'birch@two',name:'Birch Planks',mod:'Chisel'},
    {ref:'oak',name:'Oak Planks',mod:'Chisel'}, {ref:'dark',name:'Dark Oak Planks',mod:'Example'},
    {ref:'pine',name:'Pine Planks',mod:'Chisel'}, {ref:'raw',name:'Chisel Planks',mod:'Example'},
    {ref:'base',name:'Red Ore',mod:'ProjectRed'}, {ref:'extension',name:'Red Ore',mod:'ProjectRed-Exploration'},
    {ref:'tinker',name:'Ore',mod:"Tinkers' Construct"},
  ];
  const resolver=createAskMe(new Catalog({version:3,ores:{},recipes:[],items}));
  const refs=text=>{const r=resolver.interpret(text);assert.equal(r.status,'list',JSON.stringify(r));return r.items.map(item=>item.ref).sort();};
  assert.deepEqual(refs('list Chisel planks excluding birch'),['oak','pine']);
  assert.deepEqual(refs('list planks excluding birch and oak'),['pine','raw']);
  assert.deepEqual(refs('list planks excluding Chisel and oak'),['raw']);
  assert.deepEqual(refs('list planks not using the Chisel mod'),['dark','raw'],'filter the actual mod, not words in the item name');
  assert.deepEqual(refs('list Chisel planks excluding oak and pine'),['birch@one','birch@two']);
  assert.deepEqual(refs('list Chisel planks excluding birch, oak and pine'),[]);
  assert.deepEqual(refs('list planks excluding birch@one'),['birch@two','dark','oak','pine','raw']);
  assert.deepEqual(refs('ProjectRed-Exploration list all ores'),['extension']);
  assert.deepEqual(refs('list ores excluding ProjectRed'),['extension','tinker']);
  assert.deepEqual(refs("list ores from Tinkers' Construct"),['tinker']);
  assert.deepEqual(refs('list ores from tinkers construct'),['tinker']);
});

test('invalid or contradictory filters never silently return an unfiltered list',()=>{
  for (const text of ['list planks excluding','list planks not using','list planks excluding the Chisle mod','list planks excluding Unknownxyz','list Chisel planks excluding Chisel','list ores not including Thermal Expansoin']) {
    const result=ask.interpret(text);assert.equal(result.status,'error',text);assert.ok(result.message);
  }
  const request=ready('How much Minecraft Gold Ore for a hundred Pulverized Gold?');
  assert.equal(request.ingredientRef,'item:14:0');assert.equal(request.quantity,100);
  assert.equal(ready('50 Gold Ingots from Pulverized Gold').usingRef,'item:8883:1');
  assert.equal(ask.interpret('2 ME Controllers without copper').status,'error','catalog filters must not silently change a recipe calculation');
});

test('how-to questions default to one and scale recipe batches without changing output yield',()=>{
  for(const [text,quantity,ore,extra] of [
    ['how do I make pulverized gold',1,1,1],
    ['how do I make 50 pulverized gold',50,25,0],
    ['How can I produce fifty Pulverized Gold?',50,25,0],
    ['How to craft 51 Pulverized Gold?',51,26,1],
  ]) {
    const request=ready(text);
    assert.equal(request.kind,'materials');assert.equal(request.quantity,quantity);
    assert.equal(request.targetRef,'item:8883:1');
    const answer=answerQuestion(catalog,request);
    assert.equal(answer.views.ore.tree.recipe.machine,'Pulverizer');
    assert.equal(answer.views.ore.tree.recipe.output.count,2);
    assert.equal(answer.views.ore.tree.runs,ore);assert.equal(answer.views.ore.tree.extra,extra);
    assert.deepEqual(answer.ingredients.map(row=>[row.stack.ref,row.count]),[['item:14:0',ore]]);
    assert.deepEqual(answerIssues(answer,false),[]);
  }
  assert.equal(ask.interpret('How do I make 50 Pulverized Gold and 3 ME Controllers?').status,'error');
  assert.equal(ask.interpret('How do I power my base?').status,'error');
});

test('ingredient-list questions recognize natural wording and calculate both breakdowns',()=>{
  const questions = [
    'what are the ingredients for 50 basic processor assembly',
    'What are the materials for fifty Basic Processor Assemblies?',
    'What ingredients are needed to make 50 Basic Processor Assemblies?',
    'What are the ingredients required for 50 Basic Processor Assemblies?',
    'Which items are required to craft 50 Basic Processor Assemblies?',
  ];
  for (const question of questions) {
    const request=ready(question);
    assert.equal(request.kind,'materials');assert.equal(request.quantity,50);
    assert.equal(request.targetRef,'item:5758:20');
  }
  const answer=answerQuestion(catalog,ready(questions[0]));
  assert.equal(answer.views.ore.tree.runs,50);
  assert.ok(answer.ingredients.length>0);
  assert.deepEqual(answer.views,calculateMaterialViews(catalog,s('item:5758:20'),50));
  assert.equal(ask.interpret('What are the ingredients for 50 Basic Processor Assemblies and 2 ME Controllers?').status,'error');
});

test('natural production questions resolve quantities and calculate the gold ore requirement',()=>{
  for(const amount of ['much','many']) for(const relation of ['to get','for']) {
    const question=`How ${amount} gold ore do I need ${relation} 50 pulverized gold?`;
    const request=ready(question,{ingredient:'item:14:0'});
    assert.equal(request.kind,'ingredient');assert.equal(request.ingredientRef,'item:14:0');
    assert.equal(request.targetRef,'item:8883:1');assert.equal(request.quantity,50);
    assert.equal(answerQuestion(catalog,request).count,25,question);
  }
  for(const verb of ['get','produce','obtain','create']) {
    const question=`How much gold ore do I need to ${verb} 50 pulverized gold?`;
    const choices=ask.interpret(question);
    assert.equal(choices.status,'choice');assert.equal(choices.slot,'ingredient');
    assert.deepEqual(choices.choices.map(item=>item.ref).sort(),['item:14:0','item:638:0']);
    const request=ready(question,{ingredient:'item:14:0'});
    assert.equal(request.quantity,50);assert.equal(request.targetRef,'item:8883:1');
    const answer=answerQuestion(catalog,request);
    assert.equal(answer.count,25);assert.deepEqual(answer.issues,[]);
    assert.equal(ready(`What do I need to ${verb} fifty pulverized gold?`).quantity,50);
    assert.equal(ready(`How many of each item do I need to ${verb} 50 pulverized gold?`).quantity,50);
  }
  assert.equal(ready('How much Minecraft Gold Ore will it take to get 51 Pulverized Gold?').quantity,51);
  const rounded=answerQuestion(catalog,ready('How much Minecraft Gold Ore is required to produce 51 Pulverized Gold?'));
  assert.equal(rounded.count,26);
  assert.equal(ask.interpret('What do I need to get 50 Pulverized Gold and 2 ME Controllers?').status,'error');
});

test('item IDs and embedded or leading numbers survive quantity parsing',()=>{
  assert.equal(ready('item:5758:20').quantity,1);
  assert.equal(ready('36 item:5758:20').targetRef,'item:5758:20');
  assert.equal(ready('3 ME 16k Storage').quantity,3);
  assert.equal(catalog.item(ready('ME 16k Storage').targetRef).name,'ME 16k Storage');
  const c=new Catalog({version:3,ores:{},recipes:[],items:[{ref:'special',name:'64 Bit Chip'},{ref:'ring',name:'One Ring'},{ref:'double',name:'Double Stone Slab'}]});
  assert.equal(createAskMe(c).interpret('64 Bit Chip').request.quantity,1);
  assert.equal(createAskMe(c).interpret('One Ring').request.quantity,1);
  assert.equal(createAskMe(c).interpret('3 Double Stone Slabs').request.quantity,3);
});

test('ambiguous or fuzzy names require an explicit choice, preserving variant IDs',()=>{
  const typo=ask.interpret('25 Templtae Carriages');
  assert.equal(typo.status,'choice');assert.equal(typo.slot,'target');
  assert.equal(typo.choices[0].name,'Template Carriage');
  assert.equal(ready('25 Templtae Carriages',{target:typo.choices[0].ref}).quantity,25);
  const ingredient=ask.interpret('How much iron for 10 ME Controllers?');
  assert.equal(ingredient.status,'choice');assert.equal(ingredient.slot,'ingredient');assert.ok(ingredient.choices.length<=5);
  const items=[{ref:'x@aaa',name:'Panel',mod:'One'},{ref:'x@bbb',name:'Panel',mod:'Two'},{ref:'x@no-recipe',name:'Panel',mod:'Three'}];
  const recipes=items.slice(0,2).map((item,index)=>({id:'panel-'+index,calculable:true,output:s(item.ref),inputs:[s('raw')]}));
  const resolver=createAskMe(new Catalog({version:3,ores:{},recipes,items}));
  const match=resolver.interpret('2 Panels');assert.equal(match.status,'choice');assert.equal(match.choices.length,2);
  assert.equal(resolver.interpret('2 Panels',{target:'x@bbb'}).request.targetRef,'x@bbb');
  assert.equal(resolver.interpret('2 One Panels').request.targetRef,'x@aaa');
});

test('stack requests use explicit catalog sizes or ask for an item count',()=>{
  const stack=ask.interpret('two stacks of ME Controllers');assert.equal(stack.status,'quantity');
  assert.equal(ready('two stacks of ME Controllers',{quantity:128}).quantity,128);
  const c=new Catalog({version:3,ores:{},recipes:[],items:[{ref:'a',name:'Pearl',maxStackSize:16}]});
  assert.equal(createAskMe(c).interpret('2 stacks of Pearls').request.quantity,32);
  assert.equal(ask.interpret('2 stacks of ME Controllers',{quantity:0}).status,'error');
});

test('invalid quantities, conditions, multiple builds and unsupported advice never guess',()=>{
  for(const text of ['0 ME Controllers','-2 ME Controllers','1.5 ME Controllers','1,00 ME Controllers','1e3 ME Controllers','1000001 ME Controllers','one two ME Controllers','How do I power my base?', 'What about twice that?', '2 ME Controllers and 3 Furnaces','2 ME Controllers without copper',''])assert.equal(ask.interpret(text).status,'error',text);
  assert.equal(ask.interpret('How many sticks for 3 unknownxyz?').status,'error');
});

test('using modifiers select several wood types and preserve the current plan preferences',()=>{
  for (const [name,wood,planks] of [['Oak Wood','item:17:0','item:5:0'],['Spruce Wood','item:17:1','item:5:1'],['Jungle Wood','item:17:3','item:5:3']]) {
    const request=ready(`what are the ingredients for 50 basic processor assemblies using ${name}`);
    assert.equal(request.usingRef,wood);assert.equal(request.quantity,50);
    const settings={members:{'ore:plankWood':'item:5:2'},recipes:{},inventory:{[wood]:5}};
    const before=structuredClone(settings),answer=answerQuestion(catalog,request,settings);
    assert.deepEqual(settings,before);
    assert.equal(answer.preferences.members['ore:plankWood'],planks);
    assert.equal(answer.views.processed.materials.find(row=>row.stack.ref===planks).count,50);
    assert.equal(answer.views.ore.materials.find(row=>row.stack.ref===wood).count,8);
    assert.ok(!answer.views.ore.materials.some(row=>row.stack.ref==='item:17:2'));
    assert.ok(!answer.views.processed.materials.some(row=>row.stack.ref==='item:5:2'));
    assert.equal(answer.inventoryUsed,true);
    const plan=questionPlan(answer);
    assert.equal(plan.quantity,50);assert.equal(plan.members['ore:plankWood'],planks);
    assert.deepEqual(calculateMaterialViews(catalog,plan.target,plan.quantity,{...plan,inventory:settings.inventory}),answer.views);
  }
  const focused=answerQuestion(catalog,ready('How many sticks for 50 Basic Processor Assemblies using Oak Wood?'));
  assert.equal(focused.count,100);assert.equal(focused.preferences.members['ore:plankWood'],'item:5:0');
  assert.ok(!Object.values(focused.preferences.recipes).includes('supply'));
  const preferred={recipes:{'item:5:0':'97aa9d24a3aae371fd-0'}};
  const sawmill=answerQuestion(catalog,ready('50 Basic Processor Assemblies using Oak Wood'),preferred);
  assert.equal(sawmill.preferences.recipes['item:5:0'],preferred.recipes['item:5:0']);
  assert.equal(sawmill.views.ore.materials.find(row=>row.stack.ref==='item:17:0').count,9);
});

test('material modifiers preserve name ambiguity, exact variants, and reject unusable choices',()=>{
  const contextual=ready('50 Basic Processor Assemblies using Oak Wood Planks');
  assert.equal(contextual.usingRef,'item:5:0','prefer the exact named material accepted by this recipe over unrelated decorative variants');
  const typo=ask.interpret('50 Basic Processor Assemblies using Sprcue Wood');
  assert.equal(typo.status,'choice');assert.equal(typo.slot,'using');
  assert.equal(ready('50 Basic Processor Assemblies using Sprcue Wood',{using:'item:17:1'}).usingRef,'item:17:1');
  const exact=answerQuestion(catalog,ready('50 Basic Processor Assemblies using item:5:0'));
  assert.equal(exact.preferences.members['ore:plankWood'],'item:5:0');
  assert.throws(()=>answerQuestion(catalog,ready('50 Basic Processor Assemblies using Bedrock')),/isn’t a usable ingredient/);
  const alchemy=answerQuestion(catalog,ready('50 Basic Processor Assemblies using Diamond'));
  assert.ok(alchemy.views.ore.materials.some(row=>row.stack.ref==='item:264:0'));
  assert.ok(answerIssues(alchemy,true).length,'a compatible recipe with an unimported input must still show its incomplete branch');
  for(const text of ['50 Basic Processor Assemblies using','50 Basic Processor Assemblies using Oak Wood and Spruce Wood','50 Basic Processor Assemblies using unknownxyz'])assert.equal(ask.interpret(text).status,'error');
});

test('target suggestions omit recipe-less variants while raw ingredient lookups remain available',()=>{
  assert.equal(ready('how do I make an energy cell').targetRef,'item:744:5');
  assert.equal(catalog.forItem('item:744:5@77e2c19bb9ad').length,0);
  const query=ask.interpret('how much gold ore do I need for 50 pulverized gold');
  assert.equal(query.status,'choice');assert.equal(query.slot,'ingredient');
  assert.ok(query.choices.some(item=>item.ref==='item:14:0'));
});

test('from selects a valid input recipe and keeps processed and ore totals distinct',()=>{
  const request=ready('50 gold ingots from pulverized gold');
  assert.equal(request.targetRef,'item:266:0');assert.equal(request.quantity,50);
  assert.equal(request.usingRef,'item:8883:1');
  const answer=answerQuestion(catalog,request);
  assert.deepEqual(answer.ingredients.map(row=>[row.stack.ref,row.count]),[['item:8883:1',50]]);
  assert.deepEqual(answer.views.processed.materials.map(row=>[row.stack.ref,row.count]),[['item:8883:1',50]]);
  assert.deepEqual(answer.views.ore.materials.map(row=>[row.stack.ref,row.count]),[['item:14:0',25]]);
  assert.equal(answer.usingMaterials[0].ref,'item:8883:1');
  const plan=questionPlan(answer);
  assert.deepEqual(calculateMaterialViews(catalog,plan.target,plan.quantity,plan),answer.views);
});

test('or accepts material alternatives in full and short questions without adding quantities',()=>{
  const full=ready('How do I make 10 chests using oak or birch');
  const short=ready('10 chests using oak or birch');
  assert.deepEqual(full,short);assert.equal(short.quantity,10);
  for (const [settings,selected] of [
    [{},'item:5:2'],
    [{members:{'ore:plankWood':'item:5:0'}},'item:5:0'],
    [{members:{'ore:plankWood':'item:5:1'}},'item:5:2'],
    [{inventory:{'item:5:0':80}},'item:5:0'],
  ]) {
    const before=structuredClone(settings),answer=answerQuestion(catalog,short,settings);
    assert.deepEqual(settings,before);
    assert.deepEqual(answer.ingredients.map(row=>[row.stack.ref,row.count]),[[selected,80]]);
    assert.equal(answer.usingMaterials[0].ref,selected);
    assert.equal(questionPlan(answer).members['ore:plankWood'],selected);
    if(settings.inventory) {assert.equal(answer.views.processed.materials.length,0);assert.equal(answer.inventoryUsed,true);}
  }
  const typo=ask.interpret('10 chests using oak or brich');
  assert.equal(typo.status,'choice');assert.equal(typo.slot,'using:1');
  assert.equal(ask.interpret('10 chests using oak or brich',{'using:1':'item:17:2'}).status,'ready');
  const logs=answerQuestion(catalog,ready('10 chests using Oak Wood or Birch Wood'),{inventory:{'item:17:0':20}});
  assert.equal(logs.preferences.members['ore:plankWood'],'item:5:0');
  assert.equal(logs.views.ore.materials.length,0);
  for(const question of ['10 chests using oak or','10 chests using oak or unknownxyz','50 Gold Ingots from'])assert.equal(ask.interpret(question).status,'error');
});

test('material selection is catalog-driven for metals, processing recipes and NBT variants',()=>{
  const c=fixture([
    {id:'machine',output:s('machine'),inputs:[s('ore:metal',3)]},
    {id:'red',output:s('redIngot'),inputs:[s('redOre')]},
    {id:'blue-a',output:s('blue@a',2),inputs:[s('blueOre'),s('flux'),s('cast',1,{consume:false})]},
    {id:'blue-b',output:s('blue@b',2),inputs:[s('blueOre'),s('flux'),s('cast',1,{consume:false})]},
  ],{machine:'Machine',redIngot:'Red Ingot','blue@a':'Blue Ingot','blue@b':'Blue Ingot',blueOre:'Blue Ore'});
  c.data.ores['ore:metal']=[s('redIngot'),s('blue@a'),s('blue@b')];c.optionsCache.clear();
  for(const ref of ['blueOre','redOre','cast','flux'])c.raw.add(ref);
  const resolver=createAskMe(c),request=resolver.interpret('How do I make 4 Machines using Blue Ore?').request;
  const settings={members:{'ore:metal':'blue@b'},recipes:{},inventory:{blueOre:2}},before=structuredClone(settings);
  const answer=answerQuestion(c,request,settings);
  assert.equal(answer.preferences.members['ore:metal'],'blue@b');
  assert.equal(answer.views.ore.materials.find(row=>row.stack.ref==='blueOre').count,4);
  assert.equal(answer.views.ore.materials.find(row=>row.stack.ref==='flux').count,6);
  assert.equal(answer.views.ore.materials.find(row=>row.stack.ref==='cast').count,1);
  assert.deepEqual(settings,before);
  const variants=resolver.interpret('4 Machines using Blue Ingot');
  assert.equal(variants.status,'choice');assert.deepEqual(variants.choices.map(item=>item.ref),['blue@a','blue@b']);
  const selected=resolver.interpret('4 Machines using Blue Ingot',{using:'blue@b'}).request;
  assert.equal(answerQuestion(c,selected).preferences.members['ore:metal'],'blue@b');
  const either=resolver.interpret('4 Machines using Red Ore or Blue Ore',{},settings);
  assert.equal(either.status,'ready');
  assert.equal(answerQuestion(c,either.request,settings).preferences.members['ore:metal'],'blue@b');
  const live=answerQuestion(catalog,ready('How do I make 50 Pulverized Gold using Minecraft Gold Ore?'),{inventory:{'item:14:0':5}});
  assert.equal(live.views.ore.materials.find(row=>row.stack.ref==='item:14:0').count,20);
});

test('ingredient queries sum branches at a temporary boundary and keep settings immutable',()=>{
  const c=fixture([{id:'final',output:s('machine'),inputs:[s('a',2),s('b',3)]},
    {id:'a',output:s('a'),inputs:[s('stick',3)]},{id:'b',output:s('b'),inputs:[s('stick',2)]},
    {id:'sticks',output:s('stick',4),inputs:[s('plank',2)]}]);c.raw.add('plank');
  const request={kind:'ingredient',targetRef:'machine',ingredientRef:'stick',quantity:2};
  const prefs={inventory:{stick:5},recipes:{a:'a'},members:{}},before=structuredClone(prefs);
  const result=answerQuestion(c,request,prefs);
  assert.equal(result.count,19);assert.equal(result.inventoryUsed,true);assert.deepEqual(prefs,before);
  assert.deepEqual(questionPlan(result).recipes,{a:'a'});
  assert.ok(result.views.ore.materials.some(row=>row.stack.ref==='plank'));
});

test('batches, reusable tools and guaranteed by-products keep planner semantics',()=>{
  const c=fixture([{id:'final',output:s('machine',2),inputs:[s('a',2),s('bonus',1),s('cast',1,{consume:false})]},
    {id:'a',output:s('a',2),inputs:[s('ore',3)],outputs:[s('a',2),s('bonus')]},
    {id:'bonus',output:s('bonus'),inputs:[s('ore')]}]);c.raw.add('ore');c.raw.add('cast');
  const result=answerQuestion(c,{kind:'materials',targetRef:'machine',quantity:3});
  assert.equal(result.views.ore.tree.runs,2);assert.equal(result.views.ore.tree.extra,1);
  assert.equal(result.ingredients.find(row=>row.stack.ref==='a').count,4);
  assert.equal(result.ingredients.find(row=>row.stack.ref==='cast').reusable,true);
  assert.equal(result.ingredients.find(row=>row.stack.ref==='cast').count,1);
  const focused=answerQuestion(c,{kind:'ingredient',targetRef:'machine',quantity:3,ingredientRef:'bonus'});
  assert.equal(focused.count,0);assert.deepEqual(focused.issues,[]);
});

test('recipe preferences and ore alternatives are honored by both answer views',()=>{
  const request=ready('36 Basic Processor Assemblies');
  const preferences={recipes:{'item:5758:18':'supply'},members:{},inventory:{'item:331:0':10}};
  const result=answerQuestion(catalog,request,preferences);
  assert.deepEqual(result.views,calculateMaterialViews(catalog,result.target,36,preferences));
  assert.notDeepEqual(result.views.ore.materials,result.views.processed.materials);
  const c=fixture([{id:'final',output:s('machine'),inputs:[s('ore:plankWood',2)]}],{birch:'Birch',oak:'Oak'});
  c.data.ores['ore:plankWood']=[s('birch'),s('oak')];c.optionsCache.clear();c.raw.add('birch');c.raw.add('oak');
  const selected=answerQuestion(c,{kind:'materials',targetRef:'machine',quantity:1},{members:{'ore:plankWood':'oak'}});
  assert.equal(selected.ingredients[0].stack.ref,'oak');
});

test('missing recipes and cycles mark zero ingredient counts as incomplete',()=>{
  const c=fixture([{id:'final',output:s('machine'),inputs:[s('missing')]},{id:'unused',output:s('stick'),inputs:[s('plank')]}]);
  const result=answerQuestion(c,{kind:'ingredient',targetRef:'machine',ingredientRef:'stick',quantity:1});
  assert.equal(result.count,0);assert.ok(answerIssues(result,false).length);
  const general=answerQuestion(c,{kind:'materials',targetRef:'machine',quantity:1});assert.ok(answerIssues(general,false).length);
  const cycle=fixture([{id:'a',output:s('a'),inputs:[s('b')]},{id:'b',output:s('b'),inputs:[s('a')]}]);
  assert.ok(answerIssues(answerQuestion(cycle,{kind:'materials',targetRef:'a',quantity:1}),true).length);
});

test('opening an answer keeps its quantity and Back restores the prior plan',()=>{
  const answer=answerQuestion(catalog,ready('36 Basic Processor Assemblies'));
  const previous={ref:'item:280:0',target:s('item:280:0'),quantity:7,tab:'recipes',expandedNodes:new Set(['0']),recipes:{},members:{}};
  const entries=[];let restored;
  const history={state:null,replaceState(value){this.state=value;entries[entries.length-1]=value;},pushState(value){this.state=value;entries.push(value);},back(){entries.pop();this.state=entries.at(-1);nav.restore(this.state);}};
  entries.push(null);
  const nav=createNavigation(history,{pathname:'/',search:''},page=>restored=page);
  nav.start(capturePage(previous),'Stick recipes');
  const next={...previous,...questionPlan(answer),tab:'plan'};nav.visit(capturePage(next),'Basic Processor Assembly');
  assert.equal(history.state.view.quantity,36);assert.equal(history.state.view.tab,'plan');
  nav.back();assert.equal(restored.quantity,7);assert.equal(restored.ref,'item:280:0');assert.equal(restored.tab,'recipes');
});
