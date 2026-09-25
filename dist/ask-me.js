import { calculate, calculateMaterialViews, key } from './planner.js?v=8';
import { createCatalogFilters } from './ask-filters.js?v=1';
import { createRecipeUsageSearch } from './recipe-usage.js?v=1';

const help = 'Try “What do I need for a hundred Basic Processor Assemblies?”, “How many sticks for 25 Template Carriages?” or “List all planks”.';
const invalidQuantity = 'Choose a whole number from 1 to 1,000,000.';
const numberNames = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split(' ');
const numbers = new Map(numberNames.map((name, value) => [name, value]));
for (const [i, name] of 'twenty thirty forty fifty sixty seventy eighty ninety'.split(' ').entries()) numbers.set(name, (i + 2) * 10);
const numericWords = new Set([...numbers.keys(), 'hundred', 'thousand', 'million', 'and']);
const clean = text => String(text).trim().replace(/\s+/g, ' ');
const singular = word => ({leaves:'leaf', knives:'knife'}[word] || (word.endsWith('ies') ? word.slice(0,-3)+'y' : /(?:ches|shes|xes|zes|sses)$/.test(word) ? word.slice(0,-2) : /[^s]s$/.test(word) ? word.slice(0,-1) : word));
const normalize = text => clean(text.replace(/([a-z\d])([A-Z])/g, '$1 $2').toLowerCase().replace(/[^a-z0-9]+/g, ' ')).split(' ').map(singular).join(' ');
const stripArticle = text => text.replace(/^(?:the|a|an)\s+/i, '');
const error = message => ({status:'error', message, help});
const recipeVerbs = 'make|craft|build|get|produce|obtain|create';
const eachItemAction = new RegExp(`\\b(?:${recipeVerbs}|for)\\s+`, 'gi');
const ingredientTarget = new RegExp(`\\s+(?:${[
  '(?:(?:do|does|will|would|should|can|could)\\s+)?(?:go|goes)\\s+(?:into|in(?:\\s+to)?)',
  '(?:(?:is|are)\\s+|(?:will|would|should|can|could|must)\\s+be\\s+)?(?:used|needed|required|consumed)\\s+(?:in|for|to)',
  '(?:is|are)\\s+in',
  '(?:would|does|will)\\s+it\\s+take(?:\\s+(?:to|for))?',
  '(?:do|will|would|should|can|could|must)\\s+i\\s+(?:need|use)(?:\\s+(?:to|for|in))?',
  'to|for|in|into',
].join('|')})\\s+(?:(?:${recipeVerbs})\\s+)?`, 'gi');
const ingredientRequirement = new RegExp(`^(.+?)\\s+(?:do|does|will|would|should|can|could|must)\\s+(.+?)\\s+(?:need|require|use|take|consume|contain)(?:\\s+to\\s+(?:${recipeVerbs}))?((?:\\s+(?:using|from)\\s+.*)?)$`, 'i');
const generalQuestion = new RegExp(`^(?:what(?:\\s+(?:materials|ingredients|items))?\\s+(?:(?:do|will|would)\\s+i\\s+)?need\\s+(?:for|to\\s+(?:${recipeVerbs}))|(?:the\\s+)?(?:materials|ingredients|items)\\s+for|${recipeVerbs})\\s+(.+)$`, 'i');
const ingredientListQuestion = new RegExp(`^(?:what|which)(?:\\s+(?:are|is))?\\s+(?:the\\s+)?(?:ingredients|materials|items)(?:\\s+(?:are\\s+)?(?:needed|required))?\\s+(?:for|to\\s+(?:${recipeVerbs}))\\s+(.+)$`, 'i');
const howToQuestion = new RegExp(`^how\\s+(?:(?:do|can|would|should)\\s+i|to)\\s+(?:${recipeVerbs})\\s+(.+)$`, 'i');
const usageSeparator = /\s+(?:(?:that|which)\s+)?(?:(?:are|is)\s+)?(?:used|needed|required)\s+(?:in|for|to\s+(?:make|craft|build|produce))\b\s*/i;
const acrossMods = /\s+(?:from|in|across)\s+(?:any|all)\s+mods?\b/gi;

function catalogListQuery(text, exactItem) {
  text = text.replace(/^(?:(?:can|could|would|will)\s+you\s+(?:please\s+)?|(?:can|could|may)\s+i\s+(?:please\s+)?(?:see|have|get)\s+|i(?:'d|\s+would)\s+like\s+|i\s+want\s+)/i, '').replace(/^please\s+/i, '').replace(/^tell\s+me\s+/i, '');
  const match = /^(?:(?:give|show)\s+(?:me\s+)?(?:(?:a|the)\s+)?list(?:\s+of)?|list(?:\s+out)?|(?:give|show)(?:\s+me)?|(?:a|the)\s+list\s+of)\s+(.+)$/i.exec(text)
    || /^(?:what|which)\s+(?:(?:are|is)\s+)?((?:(?:all|the|different|available)\s+)*(?:types?|kinds?|variet(?:y|ies)|variants?)\s+of\s+.+)$/i.exec(text)
    || /^(?:what|which)\s+(.+?)\s+(?:are\s+(?:there|available)|can\s+i\s+(?:find|use|get))(?:\s+.*)?$/i.exec(text)
    || /^(?:what|which)\s+are\s+(.+)$/i.exec(text);
  if (!match) return null;
  let query = match[1].replace(/(?:\s+(?:are\s+)?(?:there|available))?(?:\s+in\s+(?:(?:this|the)\s+)?(?:pack|modpack|catalog|game))?$/i, '')
    .replace(/^(?:(?:all|every|of|the|different|available|top|first)\s+|(?:types?|kinds?|variet(?:y|ies)|variants?|list)\s+of\s+)+/i, '').trim();
  // Listing recipe ingredients is still a calculation, not a catalog search.
  if (/^(?:ingredients|materials|items)\s+(?:for|to|needed|required)\b|^(?:what|which|how)\b/i.test(query)) return null;
  let limit = null;
  if (!exactItem(query) && (/^[+-]?\d|^a\s+(?:hundred|thousand|million)\b/i.test(query) || numericWords.has(query.split(' ')[0].toLowerCase()))) {
    const parsed = quantityAndName(query,exactItem);
    if (parsed.status === 'error') return parsed;
    if (parsed.unit !== 'items') return error('Use an item count for the number of list results, not stacks.');
    limit = parsed.quantity;query = parsed.targetText.replace(/^(?:types?|kinds?|variet(?:y|ies))\s+of\s+/i,'');
  }
  return {kind:'list',targetText:stripArticle(query),limit};
}

function smallNumber(words) {
  if (!words.length) return 0;
  if (words.length === 1 && numbers.has(words[0])) return numbers.get(words[0]);
  if (words.length === 2 && numbers.get(words[0]) >= 20 && numbers.get(words[1]) > 0 && numbers.get(words[1]) < 10) return numbers.get(words[0]) + numbers.get(words[1]);
  const hundred = words.indexOf('hundred');
  if (hundred === 1 && numbers.get(words[0]) >= 1 && numbers.get(words[0]) <= 9) {
    const tail = words.slice(2); if (tail[0] === 'and') {tail.shift();if (!tail.length) return null;}
    const rest = smallNumber(tail);
    if (rest !== null && rest < 100) return numbers.get(words[0]) * 100 + rest;
  }
  return null;
}
function englishNumber(words) {
  let total = 0, rest = words;
  for (const [name, scale] of [['million',1000000], ['thousand',1000]]) {
    const index = rest.indexOf(name);
    if (index < 0) continue;
    const group = smallNumber(rest.slice(0,index));
    if (!group) return null;
    total += group * scale; rest = rest.slice(index + 1);
    if (rest[0] === 'and') {rest = rest.slice(1);if (!rest.length) return null;}
  }
  const tail = smallNumber(rest);
  return tail === null ? null : total + tail;
}
function quantityAndName(text, exactItem) {
  text = clean(text);
  // A number in an actual item name (or ID) must not become its quantity.
  if (exactItem(text)) return {quantity:1, targetText:text, unit:'items'};
  // "a" is a multiplier in "a hundred", but an article in "a controller".
  if (!/^a\s+(?:hundred|thousand|million)\b/i.test(text)) text = stripArticle(text);
  let quantity = 1, remaining = text;
  const digits = /^([+-]?\d[\d,]*(?:\.\d+)?(?:e[+-]?\d+)?)(?:\s+|$)/i.exec(text);
  if (digits) {
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(digits[1])) return error(invalidQuantity);
    quantity = Number(digits[1].replaceAll(',', '')); remaining = text.slice(digits[0].length);
  } else {
    const words = text.replace(/(?<=[a-z])-(?=[a-z])/gi, ' ').split(' ');
    let length = 0;
    while (length < words.length && (numericWords.has(words[length].toLowerCase())
      || /^a$/i.test(words[length]) && /^(?:hundred|thousand|million)$/i.test(words[length+1] || ''))) length++;
    if (length) {
      quantity = englishNumber(words.slice(0,length).map(word => /^a$/i.test(word) ? 'one' : word.toLowerCase()));
      remaining = words.slice(length).join(' ');
    }
  }
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000000) return error(invalidQuantity);
  const stack = /^stacks?\s+(?:of\s+)?/i.exec(remaining);
  if (stack) remaining = remaining.slice(stack[0].length);
  remaining = stripArticle(remaining).replace(/^(?:items?|blocks?)\s+of\s+/i, '').trim();
  if (!remaining) return error('Include the item you want to make.');
  return {quantity, targetText:remaining, unit:stack ? 'stacks' : 'items'};
}

function ingredientQuestion(text, exactItem) {
  const splits = [...text.matchAll(ingredientTarget)].map(split => ({
    ingredientText:text.slice(0,split.index), targetText:text.slice(split.index + split[0].length),
  }));
  // The target can also precede the verb: "How many chips does one machine use?"
  const requirement = ingredientRequirement.exec(text);
  if (requirement) splits.unshift({ingredientText:requirement[1],targetText:requirement[2]+requirement[3]});
  for (const split of splits) split.ingredientText = stripArticle(split.ingredientText.replace(/^of\s+/i, ''));
  // Prefer a complete catalog name when a name itself contains "in" or "for".
  return splits.find(split => exactItem(split.ingredientText)) || splits[0];
}

function parseQuestion(question, exactItem) {
  let text = clean(question).replace(/[?!.]+$/, '').replace(/,?\s+please$/i, '').replace(/^please\s+/i, '').trim();
  if (!text || text.length > 400) return error(text ? 'Keep the question under 400 characters.' : 'Enter an item or recipe question.');
  const listQuery = catalogListQuery(text,exactItem);
  if (listQuery !== null) return listQuery;
  text = text.replace(/^(?:can|could|would|will)\s+you\s+(?:please\s+)?/i, '').replace(/^(?:tell|show|give)(?:\s+me)?\s+/i, '');
  let targetText, ingredientText = null, usingText = null;
  if (/^how\s+many\s+(?:of\s+)?(?:each|every)\b/i.test(text)) {
    // Accept the repeated target and awkward wording in “each item in X ... make 36 X”.
    const actions = [...text.matchAll(eachItemAction)];
    const action = actions.at(-1);
    if (action) targetText = text.slice(action.index + action[0].length);
  } else if (/^how\s+(?:many|much)\s+/i.test(text)) {
    const rest = text.replace(/^how\s+(?:many|much)\s+/i, '');
    const split = ingredientQuestion(rest,exactItem);
    if (split) ({ingredientText,targetText} = split);
  } else {
    const general = generalQuestion.exec(text) || ingredientListQuestion.exec(text) || howToQuestion.exec(text)
      || /^(?:list|(?:show|give)(?:\s+me)?)\s+(?:the\s+)?(?:ingredients|materials|items)\s+for\s+(.+)$/i.exec(text);
    if (general) targetText = general[1];
    else if (!/^(?:how|what|why|which|where|when|can|could|should|i)\b/i.test(text)) targetText = text;
  }
  if (!targetText || (ingredientText !== null && !ingredientText)) return error('I can calculate one item’s recipe or ingredient quantities.');
  const using = /^(.*?)\s+(?:using|from)(?:\s+(.*))?$/i.exec(targetText);
  if (using && !exactItem(targetText)) {
    targetText = using[1]; usingText = stripArticle((using[2] || '').trim());
    if (!usingText) return error('Name the material after “using” or “from”.');
    if (!exactItem(usingText) && /\b(?:and|plus|using|from)\b|[+;]/i.test(usingText)) return error('Use “or” between acceptable material alternatives.');
  }
  const parsed = quantityAndName(targetText, exactItem);
  if (parsed.status === 'error') return parsed;
  let instructions = text;
  if (usingText) instructions = instructions.replace(/\s+(?:using|from)\s+/i, ' ');
  if (usingText && exactItem(usingText)) instructions = instructions.replace(usingText,'');
  if (exactItem(parsed.targetText)) instructions = instructions.replace(parsed.targetText,'');
  if (ingredientText && exactItem(ingredientText)) instructions = instructions.replace(ingredientText,'');
  if (/\b(?:using|except|without|instead|cheapest|best|twice|double|half|compare)\b/i.test(instructions)) return error('Ask about one build and its ingredients at a time.');
  if (!exactItem(parsed.targetText) && /\b(?:and|plus)\b|[+;]/i.test(parsed.targetText)) return error('Ask about one build at a time.');
  const usingTexts = usingText ? (exactItem(usingText) ? [usingText] : usingText.split(/\s+or\s+/i).map(stripArticle)) : [];
  if (usingTexts.some(value => !value.trim()) || /\bor$/i.test(usingText || '')) return error('Name a material on each side of “or”.');
  return {...parsed, ingredientText, usingText, usingTexts, kind:ingredientText ? 'ingredient' : 'materials'};
}

// One insertion, deletion, substitution or adjacent transposition, for suggestions only.
function closeWord(a, b) {
  if (a === b) return true;
  if (a.length < 4 || b.length < 4 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0; while (i < a.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i+1) === b.slice(i+1) || (a[i] === b[i+1] && a[i+1] === b[i] && a.slice(i+2) === b.slice(i+2));
  return a.length > b.length ? a.slice(i+1) === b.slice(i) : a.slice(i) === b.slice(i+1);
}

export function createAskMe(catalog) {
  const entries = [...new Map(catalog.data.items.map(item => [catalog.canonicalRef(item.ref), catalog.item(item.ref)])).values()].map(item => {
    const name = normalize(item.name), mod = normalize(item.mod || '');
    return {item, name, tokens:name.split(' '), aliases:new Set([item.ref, ...(item.names || [])].map(s => s.toLowerCase())), labels:new Set([name, `${mod} ${name}`, `${name} ${mod}`])};
  });
  const extractFilters = createCatalogFilters(entries.map(entry=>entry.item.mod));
  const findRecipeUses = createRecipeUsageSearch(catalog);
  let listEntries;
  function catalogList(query, filters = {includeMods:[],excludeMods:[],excludeTerms:[]}, allowAll = false) {
    if (/^(?:all(?:\s+items?)?|items?|things|everything)$/i.test(query)) {query = '';allowAll = true;}
    const normalized = normalize(query), words = normalized.split(' ').filter(Boolean), id = query.toLowerCase();
    if (!words.length && !filters.includeMods.length && !allowAll) return error('Name the items you want to list, such as planks or sands.');
    listEntries ||= entries.map(entry => {
      const roles = catalog.roles(entry.item.ref);
      return {...entry, searchTokens:new Set(normalize([entry.item.name,entry.item.mod || '',...roles.map(role=>role.replace(/^ore:/,''))].join(' ')).split(' ')), identifiers:new Set([entry.item.ref,...roles,...roles.map(role=>role.replace(/^ore:/,''))].map(value=>value.toLowerCase()))};
    });
    const termMatches = (entry,term) => entry.identifiers.has(term.toLowerCase()) || normalize(term).split(' ').every(word=>entry.searchTokens.has(word));
    for (const term of filters.excludeTerms) {
      if (!listEntries.some(entry=>termMatches(entry,term))) return error(`No catalog items or mods match the exclusion “${term}”. Try its full name.`);
    }
    // Whole words avoid matching sand to sandstone or sandwiches. Keep variants
    // distinct and put the closest names ahead of related shapes and components.
    const items = listEntries.filter(entry => (!filters.includeMods.length || filters.includeMods.includes(entry.item.mod))
      && !filters.excludeMods.includes(entry.item.mod)
      && !filters.excludeTerms.some(term=>termMatches(entry,term))
      && (normalized === 'fluid' ? entry.item.kind === 'fluid' || entry.item.ref.startsWith('fluid:')
        : normalized === 'block' ? entry.item.kind === 'block'
        : entry.identifiers.has(id) || words.every(word => entry.searchTokens.has(word))))
      .sort((a,b) => Number(b.name===normalized)-Number(a.name===normalized) || a.tokens.length-b.tokens.length || a.item.name.localeCompare(b.item.name) || (a.item.mod || '').localeCompare(b.item.mod || '') || a.item.ref.localeCompare(b.item.ref))
      .map(entry => entry.item);
    return {status:'list', query:query || 'all items', filters, items};
  }
  function candidates(text) {
    const literal = normalize(text), query = normalize(stripArticle(text)), id = text.trim().toLowerCase();
    // Display names outrank hidden registry aliases ("redstone" is also a fluid alias).
    let exact = entries.filter(entry => entry.labels.has(literal));
    if (!exact.length) exact = entries.filter(entry => entry.labels.has(query));
    if (!exact.length) exact = entries.filter(entry => entry.aliases.has(id));
    if (!exact.length && /\s+(?:item|block)$/.test(query)) exact = entries.filter(entry => entry.labels.has(query.replace(/\s+(?:item|block)$/, '')));
    if (exact.length) return {exact:true, items:exact.map(entry => entry.item)};
    const words = query.replace(/\s+(?:item|block)$/, '').split(' ').filter(Boolean);
    if (!words.length) return {exact:false, items:[]};
    const scored = [];
    for (const entry of entries) {
      let edits = 0; const available = [...entry.tokens];
      for (const word of words) {
        let index = available.indexOf(word);
        if (index < 0) { index = available.findIndex(token => closeWord(word, token)); edits++; }
        if (index < 0) { edits = Infinity; break; }
        available.splice(index,1);
      }
      if (Number.isFinite(edits)) scored.push({item:entry.item, edits, score:edits*10+available.length});
    }
    scored.sort((a,b) => a.score-b.score || a.item.name.localeCompare(b.item.name) || a.item.ref.localeCompare(b.item.ref));
    return {exact:false, items:scored.map(entry => entry.item), literalItems:scored.filter(entry => !entry.edits).map(entry => entry.item)};
  }
  function listAnswer(request,filters,relation = null) {
    if (relation && /^(?:items?|materials?|ingredients?)$/i.test(request.targetText)) request = {...request,targetText:''};
    // Generic material queries in a usage search may consider the whole catalog.
    const result = catalogList(request.targetText,filters,!!relation);
    if (request.targetText === '' && relation) result.query = 'materials';
    if (result.status !== 'list') return result;
    if (relation) {
      const target = catalogList(relation.text,relation.filters);
      if (target.status !== 'list') return target;
      const targets = target.items.filter(item=>catalog.forItem(item.ref).some(recipe=>recipe.calculable));
      if (!targets.length) return error(`No matching items with usable recipes for “${relation.text}”. Try a fuller item name.`);
      if (targets.length > 200 || result.items.length*targets.length > 500000) return error('That matches too many possible recipe relationships. Use a more specific material or destination item name.');
      const matches = findRecipeUses(result.items,targets);
      result.items = matches.map(match=>match.item);
      result.relationships = Object.fromEntries(matches.map(match=>[match.item.ref,match.uses]));
      result.usesQuery = relation.text;result.targetFilters = relation.filters;
    }
    result.total = result.items.length;result.limit = request.limit;
    if (request.limit) result.items = result.items.slice(0,request.limit);
    if (result.relationships) result.relationships = Object.fromEntries(result.items.map(item=>[item.ref,result.relationships[item.ref]]));
    return result;
  }
  return {
    interpret(question, selections = {}, settings = {}) {
      if (clean(question).length > 400) return error('Keep the question under 400 characters.');
      question = String(question).replace(acrossMods,'');
      const usage = usageSeparator.exec(question);
      if (usage) {
        const source = extractFilters(question.slice(0,usage.index));
        const request = parseQuestion(source.text, text=>candidates(text).exact);
        const recipeQuestion = request.limit == null && /^(?:what|which)\b/i.test(source.text)
          && /^(?:ingredients|materials|items)$/i.test(request.targetText || '') && /\b(?:needed|required)\b/i.test(usage[0]);
        if (request.kind === 'list' && !recipeQuestion) {
          const target = extractFilters(question.slice(usage.index+usage[0].length));
          if (source.message || target.message) return error(source.message || target.message);
          const text = stripArticle(clean(target.text)).replace(/^(?:all|any)\s+/i,'') || (target.filters.includeMods.length ? 'all items' : '');
          if (!text) return error('Name the items the listed materials should be used in.');
          return listAnswer(request,source.filters,{text,filters:target.filters});
        }
      }
      const filtered = extractFilters(question);
      if (filtered.active) {
        const request = parseQuestion(filtered.text, text => candidates(text).exact);
        if (request.kind === 'list') return filtered.message ? error(filtered.message) : listAnswer(request,filtered.filters);
        if (request.status === 'error') return request;
      }
      const request = parseQuestion(question, text => candidates(text).exact);
      if (request.status === 'error') return request;
      if (request.kind === 'list') return listAnswer(request,filtered.filters);
      for (const slot of ['target', ...(request.kind === 'ingredient' ? ['ingredient'] : [])]) {
        const text = request[slot+'Text'], found = candidates(text);
        if (slot === 'target' && (found.items.length > 1 || !found.exact)) found.items = found.items.filter(item => catalog.forItem(item.ref).length);
        const label = slot === 'target' ? 'item' : 'ingredient';
        const selected = found.items.find(item => item.ref === selections[slot]);
        if (selected || found.exact && found.items.length === 1) request[slot+'Ref'] = (selected || found.items[0]).ref;
        else if (found.items.length) return {status:'choice', slot, text, choices:found.items.slice(0,5), more:found.items.length>5, message:`Which ${label} did you mean?`};
        else return error(`No matching ${label} for “${text}”. Try its full name or item ID.`);
      }
      if (request.usingTexts.length) {
        const refs = [], scope = materialChoiceScope(catalog,questionTarget(catalog,request.targetRef),settings);
        for (const [index,text] of request.usingTexts.entries()) {
          const slot = request.usingTexts.length === 1 ? 'using' : `using:${index}`, found = candidates(text);
          const relevant = found.items.filter(item => scope.has(item.ref));
          const choices = relevant.length ? relevant : found.items;
          const literal = found.exact ? choices : choices.filter(item => found.literalItems?.includes(item));
          const selected = choices.find(item => item.ref === selections[slot]);
          if (selected) refs.push(selected.ref);
          else if (request.usingTexts.length > 1 && literal.length) {
            // "or" permits the named sets, e.g. oak or birch. Typos still need confirmation.
            refs.push(...literal.map(item => item.ref));
          } else if (found.exact && choices.length === 1) refs.push(choices[0].ref);
          else if (choices.length) return {status:'choice', slot, text, choices:choices.slice(0,5), more:choices.length>5, message:`Which material did you mean by “${text}”?`};
          else return error(`No matching material for “${text}”. Try its full name or item ID.`);
        }
        request.usingRefs = [...new Set(refs)];
        if (request.usingRefs.length === 1) request.usingRef = request.usingRefs[0];
      }
      if (request.unit === 'stacks') {
        const item = catalog.item(request.targetRef), size = item.maxStackSize;
        if (selections.quantity !== undefined) request.quantity = selections.quantity;
        else if (Number.isSafeInteger(size) && size > 0) request.quantity *= size;
        else return {status:'quantity', message:`The stack size for ${item.name} isn’t in the catalog. Enter the number of items.`, targetRef:item.ref};
      }
      if (!Number.isSafeInteger(request.quantity) || request.quantity < 1 || request.quantity > 1000000) return error(invalidQuantity);
      return {status:'ready', request};
    },
  };
}

export function questionTarget(catalog, ref) {
  ref = catalog.canonicalRef(ref);
  const methods = catalog.forItem(ref), item = catalog.item(ref);
  return {...(methods.find(r => !r.output.nbt)?.output || methods[0]?.output || {ref, ...(item.nbt ? {nbt:item.nbt} : {})}), count:1};
}
const incompleteReasons = new Set(['missing', 'ambiguous', 'cycle', 'unresolved', 'invalid', 'limit']);
function problems(result) {
  const messages = new Set(result.warnings);
  if (result.materials.some(row => row.reasons.some(reason => incompleteReasons.has(reason)))) messages.add('Some recipe branches could not be fully calculated.');
  return [...messages];
}

function materialChoiceScope(catalog, target, preferences) {
  const refs = new Set(), inspected = new Set();
  function inspect(stack) {
    refs.add(catalog.canonicalRef(stack.ref));
    if (inspected.has(key(stack))) return;
    inspected.add(key(stack));
    for (const recipe of catalog.forStack(stack).filter(recipe => recipe.calculable)) {
      for (const input of recipe.inputs.filter(input => input.consume !== false)) {
        for (const option of catalog.options(input)) refs.add(catalog.canonicalRef(option.ref));
      }
    }
  }
  function visit(node) {
    for (const option of node.source ? catalog.options(node.source) : [node.stack]) inspect(option);
    node.children.forEach(visit);
  }
  visit(calculate(catalog,target,1,{...preferences,inventory:{}}).tree);
  return refs;
}

// Match actual recipe alternatives, including one processing step from the
// requested resource (for example a log -> its planks). No material names or
// item IDs are special-cased, and no changes escape this answer's preferences.
function applyMaterialChoice(catalog, target, materials, preferences) {
  const allowed = new Set(materials.map(key)), routes = new Map();
  const inventory = catalog.canonicalInventory(preferences.inventory);
  const owned = stack => (inventory[key(stack)] || 0) > 0;
  const matching = stack => {
    const id = key(stack);
    if (!routes.has(id)) routes.set(id, catalog.forStack(stack).filter(recipe => {
      const consumed = recipe.inputs.filter(input => input.consume !== false);
      return recipe.calculable && consumed.some(input => catalog.options(input).some(option => allowed.has(key(option))));
    }));
    return routes.get(id);
  };
  const chooseRecipe = (stack, current) => {
    const methods = matching(stack), preferred = preferences.recipes[key(stack)];
    return methods.find(recipe => recipe.id === preferred)
      || methods.find(recipe => recipe.id === current?.id)
      || methods.find(recipe => (recipe.machine || recipe.type) === (current?.machine || current?.type))
      || methods.slice().sort((a,b) => catalog.recipeDepth(a)-catalog.recipeDepth(b) || a.inputs.length-b.inputs.length)[0];
  };
  const selectRecipe = (stack, recipe, node) => {
    preferences.recipes[key(stack)] = recipe.id;
    for (const input of recipe.inputs.filter(input => input.consume !== false)) {
      const options = catalog.options(input);
      const current = node.children.find(child => child.source && key(child.source) === key(input))?.stack;
      const choices = options.filter(option => allowed.has(key(option))).sort((a,b) =>
        Number(key(b)===preferences.members[key(input)])-Number(key(a)===preferences.members[key(input)])
        || Number(owned(b))-Number(owned(a))
        || Number(current && key(b)===key(current))-Number(current && key(a)===key(current))
        || (catalog.depth.get(key(a)) ?? Infinity)-(catalog.depth.get(key(b)) ?? Infinity));
      if (options.length > 1 && choices.length) preferences.members[key(input)] = key(choices[0]);
    }
  };
  for (let pass = 0; pass < 8; pass++) {
    const before = JSON.stringify([preferences.recipes,preferences.members]);
    // Find alternatives even when owned components hide their recipe branches.
    const tree = calculate(catalog,target,1,{...preferences,inventory:{}}).tree;
    function visit(node) {
      const options = node.source ? catalog.options(node.source) : [];
      if (options.length > 1) {
        const candidates = options.map(stack => ({stack, recipe:allowed.has(key(stack)) ? null : chooseRecipe(stack,node.recipe)}))
          .filter(choice => allowed.has(key(choice.stack)) || choice.recipe);
        const available = choice => owned(choice.stack) || !!choice.recipe?.inputs.some(input => input.consume !== false && catalog.options(input).some(option => allowed.has(key(option)) && owned(option)));
        candidates.sort((a,b) =>
          Number(key(b.stack)===preferences.members[key(node.source)])-Number(key(a.stack)===preferences.members[key(node.source)])
          || Number(available(b))-Number(available(a))
          || Number(key(b.stack)===key(node.stack))-Number(key(a.stack)===key(node.stack))
          || (catalog.depth.get(key(a.stack)) ?? Infinity)-(catalog.depth.get(key(b.stack)) ?? Infinity));
        const selected = candidates[0];
        if (selected) {
          preferences.members[key(node.source)] = key(selected.stack);
          if (selected.recipe) selectRecipe(selected.stack,selected.recipe,node);
          return;
        }
      }
      if (allowed.has(key(node.stack))) return;
      const recipe = node.recipe && chooseRecipe(node.stack,node.recipe);
      if (recipe) { selectRecipe(node.stack,recipe,node);return; }
      node.children.forEach(visit);
    }
    visit(tree);
    if (before === JSON.stringify([preferences.recipes,preferences.members])) {
      const used = new Map();
      function collect(node) {
        if (allowed.has(key(node.stack))) {used.set(key(node.stack),node.stack);return;}
        node.children.forEach(collect);
      }
      collect(tree);
      if (!used.size) throw new Error(`${materials.length === 1 ? catalog.item(materials[0].ref).name+' isn’t a usable ingredient or processing input' : 'None of those materials are usable ingredients or processing inputs'} in this plan. Choose a compatible material or change the recipe.`);
      return [...used.values()];
    }
  }
  throw new Error('This material choice could not be resolved. Choose a more specific recipe in the crafting plan.');
}

export function answerQuestion(catalog, request, settings = {}) {
  const preferences = structuredClone({recipes:settings.recipes || {}, members:settings.members || {}, inventory:settings.inventory || {}});
  const target = questionTarget(catalog, request.targetRef);
  const requestedMaterials = (request.usingRefs || (request.usingRef ? [request.usingRef] : [])).map(ref => questionTarget(catalog,ref));
  const usingMaterials = requestedMaterials.length ? applyMaterialChoice(catalog,target,requestedMaterials,preferences) : [];
  const views = calculateMaterialViews(catalog, target, request.quantity, preferences);
  const tree = views.ore.tree, ingredients = new Map();
  for (const node of tree.children) {
    const id = key(node.stack), row = ingredients.get(id) || {stack:node.stack, count:0, reusable:false};
    row.count += node.wanted; row.reusable ||= !!node.reusable; ingredients.set(id,row);
  }
  const answer = {request, target, preferences, views, usingMaterials, ingredients:[...ingredients.values()], inventoryUsed:views.ore.usedInventory.length>0 || views.processed.usedInventory.length>0};
  if (request.kind === 'ingredient') {
    const ingredient = questionTarget(catalog, request.ingredientRef);
    // This boundary belongs only to the answer, never to the user's recipe choices.
    const focused = calculate(catalog, target, request.quantity, {...preferences, recipes:{...preferences.recipes, [key(ingredient)]:'supply'}});
    answer.ingredient = ingredient;
    answer.count = focused.materials.filter(row => key(row.stack) === key(ingredient)).reduce((sum,row) => sum+row.count,0);
    answer.issues = problems(focused);
    answer.inventoryUsed = focused.usedInventory.length > 0;
  }
  return answer;
}

export function answerIssues(answer, oreLevel) {
  return answer.request.kind === 'ingredient' ? answer.issues : problems(answer.views[oreLevel ? 'ore' : 'processed']);
}

// Leave inventory shared, and keep the temporary ingredient boundary out of navigation.
export function questionPlan(answer) {
  return structuredClone({ref:answer.target.ref, target:answer.target, quantity:answer.request.quantity, recipes:answer.preferences.recipes, members:answer.preferences.members});
}
