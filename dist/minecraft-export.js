// The GUI mod reads this versioned format directly; PNGs and recipes stay on the site.
export function minecraftBuildListExport(entries, materials, nameFor, scope, catalog) {
  if (!catalog) throw new Error('Minecraft export requires the item catalog.');
  function record(original, quantity) {
    if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error('Invalid material quantity.');
    const stack=catalog.canonicalStack(original),item=catalog.item(stack.ref);
    const row={ref:stack.ref,name:nameFor(stack),quantity};
    const match=/^item:(\d+):(\d+)(?:@[a-f0-9]+)?$/.exec(stack.ref);
    if(match) {
      Object.assign(row,{kind:'item',itemId:Number(match[1]),metadata:Number(match[2]),unit:'items'});
      // Keep the typed NBT string intact, including 64-bit integer literals.
      const nbt=stack.nbt || item.nbt;
      if(stack.ref.includes('@')&&!nbt)throw new Error('Missing item variant data.');
      if(nbt)row.nbt=nbt;
      if(item.chargeIndependent)row.chargeIndependent=true;
    } else if(/^fluid:\d+$/.test(stack.ref)) {
      Object.assign(row,{kind:'fluid',fluidId:Number(stack.ref.slice(6)),unit:'mB'});
      if(item.names?.[0])row.fluidName=item.names[0];
    } else Object.assign(row,{kind:'unresolved',unit:'items'});
    return row;
  }
  const summary=catalog.data.summary || {};
  const data={format:'techit-minecraft-build-list',version:1,minecraftVersion:'1.6.4',modpack:'TechIt-ng',scope,
    catalog:{snapshot:summary.snapshot || null,sha256:summary.sha256 || null},
    plans:entries.map(entry=>record(entry.target,entry.quantity)),
    materials:materials.map(material=>({...record(material.stack,material.count),reasons:[...(material.reasons || [])]}))
      .sort((a,b)=>a.name.localeCompare(b.name)||a.ref.localeCompare(b.ref))};
  return {filename:(scope==='current'?'techit-material-list':'techit-build-list')+'.techit.json',
    type:'application/json;charset=utf-8',content:JSON.stringify(data,null,2)+'\n'};
}
