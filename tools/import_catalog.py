"""Build the website from source/minetweaker_new.log without executing its contents."""
import csv
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import re
import zipfile

ROOT = Path(__file__).resolve().parents[1]
HEADERS = {'Recipes:', 'Liquids:', 'Entities:', 'Ore Dictionary:', 'Names:', 'Blocks:', 'Smelting:'}


def split_ref(ref):
    match = re.fullmatch(r'(.*):(\d+|\*)', ref)
    return (match[1], match[2]) if match else (ref, '0')


def clean_ref(ref):
    ref = ref.removeprefix('block:')
    base, meta = split_ref(ref)
    return base if meta == '0' else ref


def null_named(value):
    return 'null' in value.lower()


class Parser:
    def __init__(self, text):
        self.text, self.pos = text, 0

    def ws(self):
        while self.pos < len(self.text):
            if self.text[self.pos].isspace():
                self.pos += 1
            elif self.text.startswith('//', self.pos):
                end = self.text.find('\n', self.pos)
                self.pos = len(self.text) if end < 0 else end + 1
            else:
                return

    def take(self, value):
        self.ws()
        if not self.text.startswith(value, self.pos):
            raise ValueError(f'Expected {value!r} at character {self.pos}')
        self.pos += len(value)

    def tag(self):
        self.take('(')
        start = self.pos
        depth, quote, escape = 1, False, False
        while self.pos < len(self.text):
            char = self.text[self.pos]
            self.pos += 1
            if quote:
                if escape:
                    escape = False
                elif char == '\\':
                    escape = True
                elif char == '"':
                    quote = False
            elif char == '"':
                quote = True
            elif char == '(':
                depth += 1
            elif char == ')':
                depth -= 1
                if depth == 0:
                    return self.text[start:self.pos - 1]
        raise ValueError('Unclosed NBT tag')

    def value(self):
        self.ws()
        if self.text.startswith('null', self.pos):
            self.pos += 4
            return None  # Empty crafting slot, not an item called Null.
        if self.text.startswith('[', self.pos):
            self.pos += 1
            values = []
            self.ws()
            while not self.text.startswith(']', self.pos):
                values.append(self.value())
                self.ws()
                if self.text.startswith(']', self.pos):
                    break
                self.take(',')
            self.take(']')
            return values
        self.take('<')
        end = self.text.find('>', self.pos)
        if end < 0:
            raise ValueError('Unclosed item reference')
        result = {'ref': clean_ref(self.text[self.pos:end]), 'count': 1}
        self.pos = end + 1
        self.ws()
        if self.text.startswith('.withTag', self.pos):
            self.pos += len('.withTag')
            result['nbt'] = self.tag()
        self.ws()
        if self.text.startswith('*', self.pos):
            self.pos += 1
            self.ws()
            match = re.match(r'\d+', self.text[self.pos:])
            if not match:
                raise ValueError('Invalid stack count')
            result['count'] = int(match[0])
            self.pos += len(match[0])
        return result

    def recipe(self):
        match = re.match(r'recipes\.add(Shaped|Shapeless)', self.text)
        if not match:
            raise ValueError('Unsupported recipe syntax')
        self.pos = match.end()
        self.take('(')
        output = self.value()
        self.take(',')
        inputs = self.value()
        self.take(')')
        self.take(';')
        self.ws()
        if self.pos != len(self.text):
            raise ValueError('Trailing content after recipe')
        kind = match[1].lower()
        if not isinstance(output, dict) or not isinstance(inputs, list):
            raise ValueError('Invalid recipe structure')
        grid = inputs if kind == 'shaped' else None
        if grid and (not all(isinstance(row, list) for row in grid) or len({len(row) for row in grid}) != 1):
            raise ValueError('Invalid crafting grid')
        flat = [s for row in grid for s in row if s is not None] if grid else [s for s in inputs if s is not None]
        if not all(isinstance(s, dict) for s in flat):
            raise ValueError('Invalid ingredient')
        return {'type': kind, 'output': output, 'inputs': flat,
                'calculable': all(s['count'] > 0 for s in [output, *flat]),
                **({'grid': grid} if grid else {})}


def parse_source(raw):
    text = raw.decode('utf-8-sig')
    lines = text.splitlines()
    names, all_names, ores = defaultdict(list), defaultdict(set), {}
    block_names, block_all_names = defaultdict(list), defaultdict(set)
    entities, liquids, failures, removed = [], [], [], []
    section, ore = None, None
    starts, boundaries = [], []
    ignored_comments = 0
    for index, line in enumerate(lines, 1):
        stripped = line.strip()
        if stripped.startswith('//'):
            ignored_comments += 1
            boundaries.append(index)
            continue
        if stripped in HEADERS:
            section, ore = stripped, None
            boundaries.append(index)
            continue
        if line.startswith('recipes.'):
            starts.append(index)
            boundaries.append(index)
            continue
        match = re.fullmatch(r'<([^>]+)> -- (.*)', line)
        if match and section in ('Names:', 'Blocks:', 'Liquids:'):
            ref, name = clean_ref(match[1]), match[2]
            is_block_label = match[1].startswith('block:')
            target_names = block_names if is_block_label else names
            target_all = block_all_names if is_block_label else all_names
            target_all[ref].add(name)
            if null_named(ref) or null_named(name):
                removed.append({'line': index, 'kind': 'name', 'ref': ref})
                continue
            if section == 'Liquids:':
                liquids.append({'ref': ref, 'name': name})
            elif name not in target_names[ref]:
                target_names[ref].append(name)
        elif section == 'Entities:' and ' -- ' in line:
            ref, name = line.split(' -- ', 1)
            if not null_named(ref + name):
                entities.append({'ref': ref, 'name': name})
        elif section == 'Ore Dictionary:':
            match = re.fullmatch(r'Ore entries for <(ore:[^>]+)> :', line)
            if match:
                ore = match[1]
                ores[ore] = []
            elif ore and stripped.startswith('<'):
                try:
                    parser = Parser(stripped)
                    stack = parser.value()
                    parser.ws()
                    if parser.pos != len(parser.text):
                        raise ValueError('Trailing ore data')
                    if not null_named(stack['ref']):
                        if stack not in ores[ore]:
                            ores[ore].append(stack)
                    else:
                        removed.append({'line': index, 'kind': 'ore member', 'ref': stack['ref']})
                except ValueError as error:
                    failures.append({'line': index, 'error': str(error), 'text': line})

    # Prefer ItemStack names to generic Block labels (e.g. Oak Wood vs Wood).
    for ref, labels in block_names.items():
        if ref not in all_names:
            names[ref] = labels
            all_names[ref] = block_all_names[ref]
    # A surviving label must not hide other conflicting or excluded labels.
    ambiguous = {ref for ref, labels in all_names.items() if len(labels) > 1}
    entirely_null = {ref for ref, labels in all_names.items() if labels and all(null_named(n) for n in labels)}
    def excluded(ref):
        return null_named(ref) or split_ref(ref)[0] in entirely_null

    boundaries = sorted(set(boundaries + [len(lines) + 1]))
    next_boundary = dict(zip(boundaries, boundaries[1:]))
    recipes, dedup = [], {}
    for start in starts:
        chunk = '\n'.join(lines[start - 1:next_boundary[start] - 1]).strip()
        # Comment-only records never enter the parser.
        try:
            recipe = Parser(chunk).recipe()
        except ValueError as error:
            failures.append({'line': start, 'error': str(error), 'text': chunk})
            continue
        if any(excluded(s['ref']) for s in [recipe['output'], *recipe['inputs']]):
            removed.append({'line': start, 'kind': 'recipe', 'ref': recipe['output']['ref']})
            continue
        canonical = json.dumps(recipe, sort_keys=True, ensure_ascii=False)
        if canonical in dedup:
            dedup[canonical]['lines'].append(start)
            continue
        recipe['id'] = 'r-' + hashlib.sha256(canonical.encode()).hexdigest()[:16]
        recipe['lines'] = [start]
        recipes.append(recipe)
        dedup[canonical] = recipe
    for group in ores:
        ores[group] = [s for s in ores[group] if not excluded(s['ref'])]

    refs = {ref for ref in names if not excluded(ref)}
    for recipe in recipes:
        refs.update(s['ref'] for s in [recipe['output'], *recipe['inputs']])
    for members in ores.values():
        refs.update(s['ref'] for s in members)
    items = []
    for ref in sorted(refs):
        if ref.startswith('ore:') or ref.endswith(':*') or excluded(ref):
            continue
        base, meta = split_ref(ref)
        exact_names = names.get(ref, [])
        labels = exact_names or names.get(base, [])
        usable = [n for n in labels if not n.endswith('.name')]
        name = usable[0] if len(usable) == 1 else ref
        if not exact_names and meta != '0' and name != ref:
            name += f' · metadata {meta}'
        is_ambiguous = base in ambiguous or '*' in base
        items.append({'ref': ref, 'name': name, 'names': labels, 'metadata': meta,
                      'kind': 'block' if ref.startswith(('tile.', 'fluid.')) else 'item',
                      'ambiguous': is_ambiguous})
    summary = {'source': 'minetweaker_new.log', 'sha256': hashlib.sha256(raw).hexdigest(),
               'sourceBytes': len(raw), 'recipeEntries': len(starts), 'recipes': len(recipes),
               'recipeTypes': dict(Counter(r['type'] for r in recipes)),
               'duplicatesCombined': sum(len(r['lines']) - 1 for r in recipes),
               'nullRecipesExcluded': sum(x['kind'] == 'recipe' for x in removed),
               'nullNamesExcluded': sum(x['kind'] == 'name' for x in removed),
               'zeroQuantityRecipes': sum(not r['calculable'] for r in recipes),
               'commentsIgnored': ignored_comments, 'parseFailures': len(failures),
               'oreGroups': len(ores), 'items': len(items), 'liquids': len(liquids), 'entities': len(entities),
               'smelting': 0, 'ambiguousItems': sum(x['ambiguous'] for x in items)}
    return {'version': 2, 'summary': summary, 'items': items, 'recipes': recipes, 'ores': ores,
            'liquids': liquids, 'entities': entities}, {'failures': failures, 'excluded': removed}


def add_verified_textures(data):
    # Explicit vanilla mappings only. No matching images by a similar display name.
    vanilla = Path(r'C:\Users\impsh\AppData\Roaming\PrismLauncher\libraries\com\mojang\minecraft\1.6.4\minecraft-1.6.4-client.jar')
    mappings = {
        'tile.workbench': 'blocks/crafting_table_front', 'tile.wood': 'blocks/planks_oak',
        'tile.wood:1': 'blocks/planks_spruce', 'tile.wood:2': 'blocks/planks_birch', 'tile.wood:3': 'blocks/planks_jungle',
        'tile.log': 'blocks/log_oak', 'tile.log:1': 'blocks/log_spruce', 'tile.log:2': 'blocks/log_birch', 'tile.log:3': 'blocks/log_jungle',
        'item.ingotIron': 'items/iron_ingot', 'item.ingotGold': 'items/gold_ingot', 'item.stick': 'items/stick',
        'item.diamond': 'items/diamond', 'item.emerald': 'items/emerald', 'item.redstone': 'items/redstone_dust',
        'item.coal': 'items/coal', 'item.coal:1': 'items/charcoal', 'item.paper': 'items/paper',
        'item.book': 'items/book_normal', 'item.bucket': 'items/bucket_empty', 'item.bucketWater': 'items/bucket_water',
        'item.bucketLava': 'items/bucket_lava', 'item.bowl': 'items/bowl', 'item.apple': 'items/apple',
        'tile.stonebrick': 'blocks/cobblestone', 'tile.stone': 'blocks/stone', 'tile.dirt': 'blocks/dirt',
        'tile.sand': 'blocks/sand', 'tile.glass': 'blocks/glass', 'tile.furnace': 'blocks/furnace_front_off',
        'tile.blockIron': 'blocks/iron_block', 'tile.blockGold': 'blocks/gold_block', 'tile.blockDiamond': 'blocks/diamond_block',
        'tile.oreIron': 'blocks/iron_ore', 'tile.oreGold': 'blocks/gold_ore', 'tile.oreCoal': 'blocks/coal_ore',
        'tile.oreDiamond': 'blocks/diamond_ore', 'tile.oreRedstone': 'blocks/redstone_ore',
        'tile.obsidian': 'blocks/obsidian', 'tile.lightgem': 'blocks/glowstone', 'item.yellowDust': 'items/glowstone_dust',
        'item.enderPearl': 'items/ender_pearl', 'item.eyeOfEnder': 'items/ender_eye', 'item.blazeRod': 'items/blaze_rod',
        'item.blazePowder': 'items/blaze_powder', 'item.sugar': 'items/sugar', 'item.wheat': 'items/wheat',
        'item.string': 'items/string', 'item.flint': 'items/flint', 'item.feather': 'items/feather',
        'item.slimeball': 'items/slimeball', 'item.netherStar': 'items/nether_star', 'item.goldNugget': 'items/gold_nugget'
    }
    destination = ROOT / 'dist' / 'images'
    destination.mkdir(parents=True, exist_ok=True)
    if vanilla.is_file():
        with zipfile.ZipFile(vanilla) as jar:
            for item in data['items']:
                texture = mappings.get(item['ref'])
                if not texture:
                    continue
                member = 'assets/minecraft/textures/' + texture + '.png'
                if member not in jar.namelist():
                    continue
                content = jar.read(member)
                filename = hashlib.sha256(content).hexdigest()[:16] + '.png'
                (destination / filename).write_bytes(content)
                item['image'] = 'images/' + filename
                item['imageType'] = 'block-face texture' if '/blocks/' in member else 'item texture'
    data['summary']['images'] = sum('image' in item for item in data['items'])


def build():
    data, diagnostics = parse_source((ROOT / 'source/minetweaker_new.log').read_bytes())
    if not data['recipes']:
        raise SystemExit('No usable recipes found; refusing to replace the website catalog.')
    add_verified_textures(data)
    (ROOT / 'dist/catalog.json').write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    (ROOT / 'source/import-report.json').write_text(json.dumps({'summary': data['summary'], **diagnostics}, ensure_ascii=False, indent=2), encoding='utf-8')
    with (ROOT / 'source/image-mapping.csv').open('w', newline='', encoding='utf-8') as stream:
        writer = csv.writer(stream)
        writer.writerow(['log_identifier', 'metadata', 'numeric_item_id', 'display_name', 'image_file', 'nbt_json'])
        for item in data['items']:
            base, meta = split_ref(item['ref'])
            writer.writerow([base, meta, '', item['name'], '', ''])
    print(json.dumps(data['summary'], indent=2))


if __name__ == '__main__':
    build()
