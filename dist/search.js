// Split internal camelCase words before searching so custardItem cannot match ardite.
const separateWords = value => String(value ?? '')
  .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
  .replace(/([a-z\d])([A-Z])/g, '$1 $2')
  .toLowerCase();

export function createItemSearch(catalog) {
  const index = catalog.data.items.map(item => {
    const aliases = [...(item.names || []), ...catalog.roles(item.ref)];
    return {
      item,
      text: [item.name, item.mod, item.ref, ...aliases].map(separateWords).join(' '),
      identifiers: new Set([item.ref, ...aliases, ...aliases.filter(a => a.startsWith('ore:')).map(a => a.slice(4))].map(a => a.toLowerCase()))
    };
  });
  return query => {
    const exact = query.trim().toLowerCase();
    const words = separateWords(query).trim().split(/\s+/).filter(Boolean);
    return index.filter(entry => entry.identifiers.has(exact) || words.every(word => entry.text.includes(word))).map(entry => entry.item);
  };
}
