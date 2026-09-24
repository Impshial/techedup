export const favoritesStorageKey = 'techit-favorites-v1';
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function renderFavoriteButton(ref, name, selected, extraClass = '') {
  const label = `${selected ? 'Remove' : 'Add'} ${name} ${selected ? 'from' : 'to'} favorites`;
  return `<button type="button" class="favorite-toggle ${extraClass}" data-favorite="${escape(ref)}" aria-pressed="${selected}" aria-label="${escape(label)}" title="${escape(label)}"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg></button>`;
}

export function createFavorites(getStorage, onError = () => {}, canonicalRef = ref => ref) {
  let refs = new Set();
  function read() {
    const raw = getStorage().getItem(favoritesStorageKey);
    if (raw === null) return new Set();
    const data = JSON.parse(raw);
    if (data?.version !== 1 || !Array.isArray(data.refs) || data.refs.some(ref => typeof ref !== 'string' || !ref)) {
      throw new Error('Invalid favorites data');
    }
    return new Set(data.refs.map(canonicalRef));
  }
  const store = {
    has: ref => refs.has(canonicalRef(ref)),
    get refs() { return [...refs]; },
    refresh() {
      try { refs = read(); onError(''); return true; }
      catch { onError('Favorites could not be loaded in this browser.'); return false; }
    },
    toggle(ref) {
      if (typeof ref !== 'string' || !ref) return false;
      ref = canonicalRef(ref);
      try {
        // Read before writing so another open calculator tab keeps its changes.
        const next = read();
        if (next.has(ref)) next.delete(ref); else next.add(ref);
        getStorage().setItem(favoritesStorageKey, JSON.stringify({ version: 1, refs: [...next] }));
        refs = next; onError(''); return true;
      } catch { onError('Favorites could not be saved in this browser.'); return false; }
    },
  };
  store.refresh();
  return store;
}
