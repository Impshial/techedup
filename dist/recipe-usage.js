import { key } from './planner.js?v=8';

// Index consumed ingredients -> guaranteed outputs, preserving actual variants.
// A route proves that an ingredient contributes to an output; it is not a full
// build plan and does not claim that the other recipe inputs are available.
export function createRecipeUsageSearch(catalog) {
  let incoming;
  const identity = stack => key(catalog.canonicalStack(stack));
  function index() {
    incoming = new Map();
    for (const recipe of catalog.data.recipes) {
      if (!recipe.calculable) continue;
      const outputs = recipe.outputs?.length ? recipe.outputs : [recipe.output];
      for (const [outputIndex,output] of outputs.entries()) {
        if ((output.chance ?? 1) < 1 || !(output.count > 0) || catalog.item(output.ref).ambiguous) continue;
        const to = identity(output);
        if (!incoming.has(to)) incoming.set(to,new Map());
        for (const input of recipe.inputs) {
          if (input.consume === false || input.toolDamage || !(input.count > 0)) continue;
          for (const option of catalog.options(input)) {
            if (catalog.item(option.ref).ambiguous) continue;
            const from = identity(option);
            const previous = incoming.get(to).get(from);
            if (from === to || previous && (!previous.byproduct || outputIndex>0)) continue;
            incoming.get(to).set(from,{from,to,input:catalog.canonicalStack(option),output:catalog.canonicalStack(output),recipeId:recipe.id,byproduct:outputIndex>0});
          }
        }
      }
    }
  }
  return (sources,targets) => {
    if (!incoming) index();
    const matches = sources.map(item=>({item,id:identity(item),uses:[]}));
    for (const target of targets) {
      const root = identity(target), paths = new Map([[root,null]]), queue = [root];
      for (let i=0;i<queue.length;i++) {
        for (const [from,edge] of incoming.get(queue[i]) || []) {
          if (paths.has(from)) continue;
          paths.set(from,edge);queue.push(from);
        }
      }
      for (const match of matches) {
        if (match.id === root || !paths.has(match.id)) continue;
        const steps = [];
        let id = match.id;
        while (id !== root) {const edge = paths.get(id);steps.push(edge);id = edge.to;}
        match.uses.push({item:target,steps});
      }
    }
    const results = matches.filter(match=>match.uses.length);
    for (const match of results) {
      match.uses.sort((a,b)=>a.steps.length-b.steps.length || a.item.name.localeCompare(b.item.name) || a.item.ref.localeCompare(b.item.ref));
    }
    return results.sort((a,b)=>a.uses[0].steps.length-b.uses[0].steps.length || b.uses.length-a.uses.length || a.item.name.localeCompare(b.item.name) || a.item.ref.localeCompare(b.item.ref));
  };
}
