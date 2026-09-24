// Hosting uses the committed catalog; only local data imports need Minecraft.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const files = ['index.html', 'style.css', 'app.js', 'planner.js', 'search.js', 'recipe-view.js', 'navigation.js', 'build-list.js', 'material-export.js', 'minecraft-export.js', 'favorites.js', 'catalog.json', 'recipe-layouts.json', 'downloads/techit-build-list-0.3.0.jar'];
const localFile = relative => {
  assert.equal(typeof relative, 'string', 'Asset path must be a string');
  const resolved = path.resolve(root, relative);
  assert.ok(resolved.startsWith(root), `Asset outside dist: ${relative}`);
  assert.ok(fs.statSync(resolved).isFile(), `Missing file: ${relative}`);
  return resolved;
};
for (const name of files) localFile(name);
const data = JSON.parse(fs.readFileSync(localFile('catalog.json'), 'utf8'));
const layouts = JSON.parse(fs.readFileSync(localFile('recipe-layouts.json'), 'utf8'));
assert.ok(data.items.length > 0 && data.recipes.length > 0, 'Catalog is empty');
const images = new Set(data.items.filter(item => item.image).map(item => item.image));
for (const layout of Object.values(layouts)) images.add(layout.image);
for (const image of images) localFile(image);
const html = fs.readFileSync(localFile('index.html'), 'utf8');
for (const match of html.matchAll(/(?:src|href)="\.\/([^"?#]+)(?:[?#][^"]*)?"/g)) localFile(match[1]);
console.log(`Ready to deploy: ${data.items.length.toLocaleString()} variants, ${data.recipes.length.toLocaleString()} recipe options, ${images.size.toLocaleString()} image files.`);
