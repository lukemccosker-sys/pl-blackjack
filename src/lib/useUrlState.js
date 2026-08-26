import { useSearchParams } from 'react-router-dom';

/**
 * Page view state that lives in the URL instead of component state.
 *
 * On a phone this is what makes the hardware back button and the iOS
 * back-swipe behave: switching to a sub-view pushes a history entry, so "back"
 * returns to the previous view rather than exiting the app. It also makes the
 * views linkable, and survives a refresh.
 *
 * The default value is kept OUT of the query string so URLs stay clean.
 *
 * @param {string} key       query-string key
 * @param {string[]} allowed permitted values; anything else falls back
 * @param {string} fallback  the default view
 */
export function useUrlState(key, allowed, fallback) {
  const [params, setParams] = useSearchParams();
  const raw = params.get(key);
  const value = allowed.includes(raw) ? raw : fallback;

  const setValue = (next) => {
    setParams(prev => {
      const p = new URLSearchParams(prev);
      if (next === fallback || !allowed.includes(next)) p.delete(key);
      else p.set(key, next);
      return p;
    });
  };

  return [value, setValue];
}
