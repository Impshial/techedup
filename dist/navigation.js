const marker = 'techit-navigation-v1';
const owned = entry => entry?.type === marker && entry.view && typeof entry.label === 'string';

// Keep only page state in history, never the catalog or calculated recipe tree.
export function capturePage(state, scroll = {}) {
  const fields = ['ref', 'target', 'quantity', 'tab', 'query', 'craftable', 'recipeLimit', 'process', 'recipes', 'members', 'modOpen', 'modLimits'];
  return structuredClone({
    ...Object.fromEntries(fields.map(field => [field, state[field]])),
    expandedNodes: [...state.expandedNodes],
    scrollY: scroll.scrollY || 0,
    indexScroll: scroll.indexScroll || 0,
  });
}

export function createNavigation(history, location, onRestore) {
  let current, home;
  const url = view => location.pathname + location.search + (view.ref ? '#' + encodeURIComponent(view.ref) : '');
  const write = method => history[method](structuredClone(current), '', url(current.view));
  return {
    start(view, label) {
      home = { type: marker, view: structuredClone(view), label, backLabel: null };
      // A fresh visit stays on the index; reload/return restores an owned entry.
      current = owned(history.state) ? structuredClone(history.state) : structuredClone(home);
      write('replaceState');
      return structuredClone(current.view);
    },
    save(view) {
      if (!current) return;
      if (JSON.stringify(view) === JSON.stringify(current.view)) return;
      current.view = structuredClone(view);
      write('replaceState');
    },
    visit(view, label) {
      current = { type: marker, view: structuredClone(view), label, backLabel: current.label };
      write('pushState');
    },
    restore(entry) {
      current = owned(entry) ? structuredClone(entry) : structuredClone(home);
      if (!owned(entry)) write('replaceState');
      onRestore(structuredClone(current.view));
    },
    back() {
      if (current?.backLabel == null) return false;
      history.back();
      return true;
    },
    get backLabel() { return current?.backLabel ?? null; },
  };
}
