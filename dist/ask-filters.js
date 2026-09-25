const clean = text => String(text).trim().replace(/\s+/g, ' ');
const modKey = text => text.toLowerCase().replace(/[^a-z0-9]/g, '');
const exclusion = "(?:but\\s+)?not(?:\\s+(?:using|including|from|in|with))?|do\\s+not\\s+include|don['’]t\\s+include|leave\\s+out|leaving\\s+out|other\\s+than|apart\\s+from|except(?:\\s+for)?|excluding|exclude|without|omitting";
const command = "(?:please\\s+)?(?:(?:give|show)(?:\\s+me)?|list|what|which|can\\s+you|could\\s+you)\\b";

// Recognize catalog mod names before interpreting the sentence. Longest names
// win, so ProjectRed-Exploration is not mistaken for the base ProjectRed mod.
export function createCatalogFilters(modNames) {
  const names = new Map();
  const patterns = [];
  for (const name of [...new Set(modNames.filter(Boolean))]) {
    for (const alias of new Set([name,name.replace(/^the\s+/i, '')])) {
      names.set(modKey(alias),name);
      const words = alias.replace(/([a-z\d])([A-Z])/g, '$1 $2').match(/[a-z0-9]+/gi);
      if (words?.length) patterns.push(words.join("[\\s'’:_-]*"));
    }
  }
  const pattern = patterns.sort((a,b)=>b.length-a.length).join('|');
  const modPattern = pattern ? new RegExp(`\\b(?:(?:only|just)\\s+)?(?:(?:from|in|by|using|including|for)\\s+)?(?:the\\s+)?(?:mods?\\s+)?(${pattern})\\b(?:['’]s)?(?:\\s+mods?)?(?:\\s*[,;:])?`, 'gi') : null;
  function extractMods(text) {
    const mods = [];
    if (modPattern) text = text.replace(modPattern, (_,name) => {mods.push(names.get(modKey(name)));return '\uE000';});
    text = text.replace(/\uE000(?:\s*(?:and|or|[,;&])?\s*\uE000)*/gi, ' ');
    return {text:clean(text),mods:[...new Set(mods)]};
  }
  const negativePattern = new RegExp(`\\b(?:${exclusion})\\b\\s*(.*?)(?=\\s*(?:[,;]\\s*)?(?:${command}|(?:${exclusion})\\b)|\\s+but\\s+(?:from|in|using|including)\\b|$)`, 'gi');
  return question => {
    const excludeMods = [], excludeTerms = [];
    let message = '';
    let text = String(question).replace(/[?!.]+$/, '').replace(/,?\s+please$/i, '');
    text = text.replace(negativePattern, (_,clause) => {
      const found = extractMods(clause);
      excludeMods.push(...found.mods);
      const terms = found.text.split(/[,;]|\b(?:and|or)\b/i).map(term => clean(term).replace(/^(?:(?:all|the|a|an|any|items?|blocks?|anything)(?:\s+|$)|(?:from|in|using|including)\s+)+/i, '').trim()).filter(Boolean);
      if (!found.mods.length && !terms.length) message = 'Name the mod or items you want to exclude.';
      if (terms.some(term=>/\bmods?\b/i.test(term))) message = `Unknown mod in “${clean(clause)}”. Use its full catalog name.`;
      excludeTerms.push(...terms);
      return ' ';
    });
    const included = extractMods(text);
    text = included.text.replace(/\s+but\s+/gi,' ').replace(/\(\s*\)/g,' ').replace(/^\s*[,;:]|[,;:]\s*$/g,'').trim();
    const filters = {includeMods:included.mods,excludeMods:[...new Set(excludeMods)],excludeTerms:[...new Set(excludeTerms)]};
    const conflict = filters.includeMods.find(mod=>filters.excludeMods.includes(mod));
    if (conflict) message = `${conflict} is both included and excluded. Choose one filter for that mod.`;
    return {text,filters,message,active:!!(message || Object.values(filters).some(values=>values.length))};
  };
}
