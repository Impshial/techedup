import { createAskMe, answerQuestion, answerIssues, questionPlan } from './ask-me.js?v=11';
import { renderRecipeDiagram } from './recipe-view.js?v=9';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = value => Number(value).toLocaleString();

export function mountAskMe({catalog, getSettings, openPlan, icon, materialDescription}) {
  const form = document.querySelector('#ask-form'), input = document.querySelector('#ask-question');
  const panel = document.querySelector('#ask-answer'), live = document.querySelector('#ask-status');
  const resolver = createAskMe(catalog);
  let question = '', selections = {}, result = null, answer = null, preferenceKey = '', listLimit = 40;
  const label = stack => catalog.item(stack.ref).name;
  const amount = (stack,count) => fmt(count)+(stack.ref.startsWith('fluid:') ? ' mB' : '');
  function list(rows, direct = false) {
    return `<ul class="ask-materials">${rows.slice().sort((a,b) => label(a.stack).localeCompare(label(b.stack))).map(row => {
      const description = direct ? (row.reusable ? 'Reusable tool' : '') : materialDescription(row);
      return `<li>${icon(row.stack.ref)}<span class="name">${escape(label(row.stack))}${description ? `<small>${escape(description)}</small>` : ''}</span><strong>${amount(row.stack,row.count)}</strong></li>`;
    }).join('')}</ul>`;
  }
  function filterLabel(filters) {
    const excluded = [...filters.excludeMods,...filters.excludeTerms];
    return [filters.includeMods.length ? `From: ${filters.includeMods.join(' or ')}.` : '', excluded.length ? `Excluding: ${excluded.join(', ')}.` : ''].filter(Boolean).join(' ');
  }
  function usageList(item) {
    const uses = result.relationships?.[item.ref];
    if (!uses) return '';
    const rows = uses.map(use=>{
      const path = [label(item),...use.steps.map(step=>{
        const recipe = catalog.recipes.get(step.recipeId);
        return `${label(step.output)} (${recipe?.machine || recipe?.type || 'Recipe'}${step.byproduct ? ', guaranteed by-product' : ''})`;
      })].join(' → ');
      return `<li><button type="button" class="link-button" data-item="${escape(use.item.ref)}">${escape(use.item.name)}</button><small>${escape(use.item.mod || '')} · ${escape(use.item.ref)}</small><p>${escape(path)}</p></li>`;
    }).join('');
    return `<details class="ask-uses"><summary>Used in ${fmt(uses.length)} matching item${uses.length === 1 ? '' : 's'}</summary><ul>${rows}</ul></details>`;
  }
  function recipeIngredients(plan, settings) {
    const tree = plan.tree || plan.views.ore.tree;
    const directEmpty = tree.status === 'owned' ? 'Covered by inventory or an earlier crafting batch.' : 'No final crafting recipe available for this plan.';
    const recipe = tree.recipe ? `<p class="ask-caption">${escape(tree.recipe.machine || tree.recipe.type)} · ${amount(tree.recipe.output,tree.recipe.output.count)} output per batch</p>${renderRecipeDiagram(catalog,tree.recipe,settings.layouts || {},tree)}<p class="ask-caption">${fmt(tree.runs)} batch${tree.runs === 1 ? '' : 'es'}${tree.extra ? ` · ${fmt(tree.extra)} extra output` : ''}</p>` : '';
    return recipe + (plan.ingredients.length ? list(plan.ingredients,true) : `<p class="ask-help">${directEmpty}</p>`);
  }
  function render(focus = false) {
    const oreFocused = document.activeElement?.id === 'ask-ore-level';
    let title = 'Ask Me', body;
    if (result.status === 'ready') {
      const settings = getSettings(), view = answer.views[settings.oreLevel ? 'ore' : 'processed'];
      title = answer.plans ? 'Combined build' : `${amount(answer.target,answer.request.quantity)} × ${label(answer.target)}`;
      const issues = answerIssues(answer,settings.oreLevel);
      body = issues.length ? `<div class="ask-warning"><strong>Partial calculation</strong><p>${issues.map(escape).join(' ')}</p></div>` : '';
      const usedMaterials = (answer.usingMaterials || []).map(label).join(', ');
      if (usedMaterials) body += `<p class="ask-caption">Using ${escape(usedMaterials)}</p>`;
      if (answer.plans) body += `<h3 class="ask-target-heading">To build</h3><ul class="ask-materials ask-targets">${answer.plans.map((plan,index)=>`<li>${icon(plan.target.ref)}<span class="name">${escape(label(plan.target))}${plan.usingMaterials.length ? `<small>Using ${escape(plan.usingMaterials.map(label).join(', '))}</small>` : ''}<button type="button" class="link-button" data-ask-open="${index}" aria-label="Open crafting plan for ${escape(amount(plan.target,plan.request.quantity)+' × '+label(plan.target))}">Open crafting plan</button></span><strong>${amount(plan.target,plan.request.quantity)}</strong></li>`).join('')}</ul><p class="ask-caption">Totals share inventory, reusable tools, and crafting leftovers across these items.</p>`;
      if (answer.ingredient) {
        body += issues.length && !answer.count ? '<p class="ask-help">The recipe is incomplete, so I can’t determine this ingredient’s total.</p>'
          : `<p class="ask-count"><strong>${amount(answer.ingredient,answer.count)} × ${escape(label(answer.ingredient))}</strong><span>${issues.length ? 'Counted in the resolved branches; the final total may be higher.' : answer.count ? 'Needed with your current recipe choices.' : 'Not needed with your current recipes and inventory.'}</span></p>`;
      } else {
        const recipes = answer.plans ? answer.plans.map(plan=>`<details class="ask-plan"><summary>${escape(amount(plan.target,plan.request.quantity)+' × '+label(plan.target))}</summary>${recipeIngredients(plan,settings)}</details>`).join('') : recipeIngredients(answer,settings);
        body += `<div class="ask-breakdowns"><section><h3>Recipe ingredients</h3>${recipes}</section><section><div class="ask-materials-heading"><h3>${answer.plans ? 'Combined materials' : 'Total materials'}</h3><label class="ore-level"><input id="ask-ore-level" type="checkbox" data-ore-level="ask"${settings.oreLevel ? ' checked' : ''}> Ore Level</label></div>${view.materials.length ? list(view.materials) : '<p class="ask-help">No additional materials needed.</p>'}</section></div>`;
      }
      if (answer.inventoryUsed) body += '<p class="ask-caption">Your owned inventory is included. Recipe ingredients show the remaining crafting batches; totals account for what you already have.</p>';
      if (!answer.plans) body += '<button type="button" class="primary" data-ask-open>Open crafting plan</button>';
      live.textContent = `${title}. ${answer.plans ? answer.plans.map(plan=>`${amount(plan.target,plan.request.quantity)} ${label(plan.target)}`).join(', ')+'. ' : ''}${usedMaterials ? `Using ${usedMaterials}. ` : ''}${issues.length ? 'Partial calculation. ' : ''}${answer.ingredient ? (issues.length && !answer.count ? 'Ingredient total unavailable.' : `${amount(answer.ingredient,answer.count)} ${label(answer.ingredient)} needed.`) : 'Recipe ingredients and total materials are ready.'}`;
    } else if (result.status === 'list') {
      title = result.usesQuery ? `“${result.query}” used in “${result.usesQuery}”` : `Items matching “${result.query}”`;
      const count = result.items.length, shown = Math.min(count,listLimit);
      const filterText = filterLabel(result.filters), targetFilterText = result.targetFilters ? filterLabel(result.targetFilters) : '';
      body = count ? `<p class="ask-help">${fmt(result.total)} matching item${result.total === 1 ? '' : 's'}${result.limit ? ` · requested ${fmt(result.limit)}` : ''}. Select an item to open it.</p>${result.usesQuery ? '<p class="ask-caption">Ranked by shortest recipe path, then number of matching outputs. Expand an item to see its uses and processing steps. Other recipe ingredients may also be needed.</p>' : ''}<ul class="ask-choices ask-catalog${result.usesQuery ? ' ask-usage-results' : ''}">${result.items.slice(0,listLimit).map(item => {
        const recipes = catalog.forItem(item.ref).length;
        return `<li><button type="button" data-item="${escape(item.ref)}">${icon(item.ref)}<span>${escape(item.name)}<small>${escape(item.mod || 'Unknown mod')} · ${recipes ? `${fmt(recipes)} recipe${recipes === 1 ? '' : 's'}` : 'No imported recipe'}</small><small>${escape(item.ref)}</small></span></button>${usageList(item)}</li>`;
      }).join('')}</ul><p class="ask-caption">Showing ${fmt(shown)} of ${fmt(result.total)} items${result.limit ? ` (limit ${fmt(result.limit)})` : ''}.</p>${shown < count ? '<button type="button" class="link-button" data-ask-more>Show more items</button>' : ''}`
        : `<p class="ask-help">${result.usesQuery ? 'No matching recipe paths were found in the imported catalog.' : 'No matching catalog items.'} Try another name, material type, or ore group.</p>`;
      if (targetFilterText) body = `<p class="ask-caption ask-target-filter-summary">Matching outputs — ${escape(targetFilterText)}</p>` + body;
      if (filterText) body = `<p class="ask-caption ask-filter-summary">${escape(filterText)}</p>` + body;
      live.textContent = `${title}. ${filterText} ${targetFilterText} ${fmt(result.total)} matching catalog items. ${count ? `Showing ${fmt(shown)}${result.limit ? `, limited to ${fmt(result.limit)}` : ''}.` : ''}`;
    } else if (result.status === 'choice') {
      body = `<p class="ask-help">${escape(result.message)}</p><div class="ask-choices">${result.choices.map(item => `<button type="button" data-ask-choice="${escape(item.ref)}">${icon(item.ref)}<span>${escape(item.name)}<small>${escape(item.mod || '')} · ${escape(item.ref)}</small></span></button>`).join('')}</div>${result.more ? '<p class="ask-caption">More matches exist. Use a fuller name or item ID to narrow it down.</p>' : ''}`;
      live.textContent = result.message;
    } else if (result.status === 'quantity') {
      body = `<p class="ask-help">${escape(result.message)}</p><form id="ask-count-form"><label for="ask-item-count">Item count</label><input id="ask-item-count" type="number" min="1" max="1000000" step="1" required inputmode="numeric"><button class="primary" type="submit">Calculate</button></form>`;
      live.textContent = result.message;
    } else {
      body = `<p class="ask-help">${escape(result.message)}</p>${result.help ? `<p class="ask-caption">${escape(result.help)}</p>` : ''}`;
      live.textContent = result.message;
    }
    panel.innerHTML = `<div class="ask-answer-head"><div><small>Ask Me</small><h2 id="ask-answer-title" tabindex="-1">${escape(title)}</h2></div><button type="button" class="ask-dismiss" data-ask-dismiss aria-label="Dismiss answer">×</button></div><div class="ask-answer-body">${body}</div>`;
    panel.hidden = false;
    if (oreFocused) panel.querySelector('#ask-ore-level')?.focus({preventScroll:true});
    if (focus) {panel.querySelector('#ask-answer-title').focus({preventScroll:true});panel.scrollIntoView({block:'start',behavior:'instant'});}
  }
  function compute() {
    const settings = getSettings();
    preferenceKey = JSON.stringify([settings.recipes,settings.members,settings.inventory]);
    answer = answerQuestion(catalog,result.request,settings);
  }
  function submit() {
    try { result = resolver.interpret(question,selections,getSettings()); if (result.status === 'ready') compute(); }
    catch (error) { result = {status:'error', message:error.message || 'This question could not be calculated.'}; answer = null; }
    render(true);
  }
  form.addEventListener('submit', event => {event.preventDefault();question = input.value;selections = {};answer = null;listLimit = 40;submit();});
  panel.addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button) return;
    if (button.hasAttribute('data-ask-dismiss')) { panel.hidden = true;result = answer = null;live.textContent = '';input.focus(); }
    else if (button.hasAttribute('data-ask-choice') && result.status === 'choice') { selections[result.slot] = button.dataset.askChoice;submit(); }
    else if (button.hasAttribute('data-ask-more') && result.status === 'list') {const previous = listLimit;listLimit += 40;render();panel.querySelectorAll('.ask-catalog>li>button')[previous]?.focus({preventScroll:true});}
    else if (button.hasAttribute('data-ask-open') && answer) {openPlan(questionPlan(answer,Number(button.dataset.askOpen || 0)));}
  });
  panel.addEventListener('submit', event => {
    if (event.target.id !== 'ask-count-form') return;
    event.preventDefault();selections[result.slot || 'quantity'] = Number(panel.querySelector('#ask-item-count').value);submit();
  });
  form.querySelector('button').disabled = false;input.disabled = false;
  return {
    refresh() {
      if (!answer || panel.hidden || result.status !== 'ready') return;
      try {
        const settings = getSettings();
        if (preferenceKey !== JSON.stringify([settings.recipes,settings.members,settings.inventory])) compute();
      } catch (error) {result = {status:'error', message:error.message};answer = null;}
      render();
    },
  };
}

export function observeAskHeader() {
  const header = document.querySelector('.topbar');
  const measure = () => document.documentElement.style.setProperty('--header-height', `${header.getBoundingClientRect().height}px`);
  const observer = new ResizeObserver(measure);observer.observe(header);measure();
}
