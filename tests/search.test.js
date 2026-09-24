import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Catalog } from '../dist/planner.js';
import { createItemSearch } from '../dist/search.js';

const catalog = new Catalog(JSON.parse(fs.readFileSync(new URL('../dist/catalog.json', import.meta.url), 'utf8')));
const search = createItemSearch(catalog);

test('ardite finds actual variants without matching hidden custardItem suffixes', () => {
  const results = search('ardite');
  assert.ok(results.some(item => item.name === 'Ardite Ore'));
  assert.ok(results.some(item => item.name === 'Ardite Ingot'));
  assert.ok(results.some(item => item.name === 'Magmatic Florb (Molten Ardite)'));
  assert.ok(!results.some(item => /Custard|Cutting Board|Mustard/i.test(item.name)));
  assert.deepEqual(search('  ARDITE ').map(i => i.ref), results.map(i => i.ref));
  assert.ok(search('mustard').some(item => item.name === 'Mustard'));
  assert.ok(search('cutting board').some(item => item.name === 'Cutting Board'));
});

test('exact IDs, internal identifiers, ore groups, and combined mod/name searches still work', () => {
  assert.deepEqual(search('item:16215:0').map(i => i.name), ['Custard']);
  assert.ok(search('item.PamHarvestCraft:custardItem').some(i => i.name === 'Custard'));
  assert.ok(search('ingotArdite').some(i => i.name === 'Ardite Ingot'));
  assert.ok(search('ingotardite').some(i => i.name === 'Ardite Ingot'));
  assert.ok(search('ore:ingotArdite').some(i => i.name === 'Ardite Ingot'));
  assert.ok(search('tinkers ardite').some(i => i.name === 'Ardite Ore'));
  assert.equal(search('').length, catalog.data.items.length);
  assert.equal(search('no-such-item-xyz').length, 0);
});
