import { minecraftBuildListExport } from './minecraft-export.js?v=1';

const csvCell = value => {
  let text = String(value ?? '');
  // Keep names and IDs as text when opened in a spreadsheet.
  if (typeof value === 'string' && /^\s*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
};
const markdownText = value => String(value).replace(/[\r\n]+/g, ' ').replace(/[\\`*_[\]<>]/g, '\\$&');

export function materialListExport(format, entries, materials, nameFor, scope = 'build', catalog = null) {
  if(format==='minecraft')return minecraftBuildListExport(entries,materials,nameFor,scope,catalog);
  const filename = scope === 'current' ? 'techit-material-list' : 'techit-build-list';
  const title = scope === 'current' ? 'Material list' : 'Build list';
  const record = (stack, quantity) => ({
    name: nameFor(stack), ref: stack.ref, quantity,
    unit: stack.ref.startsWith('fluid:') ? 'mB' : 'items',
    ...(stack.nbt ? { nbt: stack.nbt } : {}),
  });
  const plans = entries.map(entry => record(entry.target, entry.quantity));
  const totals = materials.map(material => record(material.stack, material.count))
    .sort((a,b) => a.name.localeCompare(b.name) || a.ref.localeCompare(b.ref));
  if (format === 'json') return {
    filename: filename + '.json', type: 'application/json;charset=utf-8',
    content: JSON.stringify({ version: 1, plans, materials: totals }, null, 2) + '\n',
  };
  if (format === 'csv') return {
    filename: filename + '.csv', type: 'text/csv;charset=utf-8',
    content: '\uFEFF' + [['Item','Quantity','Unit','ID','NBT'], ...totals.map(item => [item.name,item.quantity,item.unit,item.ref,item.nbt || ''])]
      .map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n',
  };
  if (format === 'markdown') {
    const line = item => `${item.quantity}${item.unit === 'mB' ? ' mB' : ''} × ${markdownText(item.name)}`;
    return {
      filename: filename + '.md', type: 'text/markdown;charset=utf-8',
      content: ['# ' + title,'','## To build','',...plans.map(item => '- ' + line(item)),
        '','## Materials','',...totals.map(item => '- [ ] ' + line(item)),
        ...(!totals.length ? ['No additional materials needed.'] : []),''].join('\n'),
    };
  }
  throw new Error('Unknown export format');
}
