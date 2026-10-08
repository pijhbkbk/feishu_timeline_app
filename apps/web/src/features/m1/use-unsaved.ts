'use client';
import { useEffect, useRef } from 'react';

const dirtyReaders = new Set<() => boolean>();
const indexKey = '__m1ProjectNavigationIndex';
function isDirty() { return [...dirtyReaders].some(read => read()); }
export function confirmM1Navigation() {
  return !isDirty() || window.confirm('有未保存的修改，确定离开？');
}

// One history owner survives route changes. A per-form history patch can retain
// the previous route's position when Next unmounts/mounts neighboring forms.
export function useM1NavigationGuard() {
  useEffect(() => {
    let position = Number.isInteger(window.history.state?.[indexKey]) ? Number(window.history.state[indexKey]) : 0;
    let restoring = false;
    let active = true;
    const originalPush = window.history.pushState;
    const originalReplace = window.history.replaceState;
    const withPosition = (state: unknown, index: number) => ({ ...(state && typeof state === 'object' ? state : {}), [indexKey]: index });
    originalReplace.call(window.history, withPosition(window.history.state, position), '', window.location.href);
    const push: History['pushState'] = function (state, unused, url) {
      if (!active) { originalPush.call(window.history, state, unused, url); return; }
      position += 1;
      originalPush.call(window.history, withPosition(state, position), unused, url);
    };
    const replace: History['replaceState'] = function (state, unused, url) {
      if (!active) { originalReplace.call(window.history, state, unused, url); return; }
      originalReplace.call(window.history, withPosition(state, position), unused, url);
    };
    window.history.pushState = push;
    window.history.replaceState = replace;
    const unload = (event: BeforeUnloadEvent) => {
      if (isDirty()) { event.preventDefault(); event.returnValue = ''; }
    };
    const followLink = (event: MouseEvent) => {
      if (!isDirty() || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href]');
      if (!link || link.target === '_blank' || link.hasAttribute('download') || link.href === window.location.href) return;
      if (!confirmM1Navigation()) { event.preventDefault(); event.stopImmediatePropagation(); }
    };
    const pop = (event: PopStateEvent) => {
      // The router already renders the retained form. Do not replay a restore
      // action into Next after the user's rejected traversal is rolled back.
      if (restoring) { restoring = false; event.stopImmediatePropagation(); return; }
      const destination = Number.isInteger(event.state?.[indexKey]) ? Number(event.state[indexKey]) : position - 1;
      if (!confirmM1Navigation()) {
        event.stopImmediatePropagation();
        restoring = true;
        window.history.go(position - destination || 1);
      } else position = destination;
    };
    window.addEventListener('beforeunload', unload);
    document.addEventListener('click', followLink, true);
    window.addEventListener('popstate', pop, true);
    return () => {
      // Next may retain a bound wrapper across effect cleanup/remount.
      // Such a wrapper must become a transparent delegate, not a second owner.
      active = false;
      window.removeEventListener('beforeunload', unload);
      document.removeEventListener('click', followLink, true);
      window.removeEventListener('popstate', pop, true);
      if (window.history.pushState === push) window.history.pushState = originalPush;
      if (window.history.replaceState === replace) window.history.replaceState = originalReplace;
    };
  }, []);
}

export function useProjectUnsavedChanges(dirty: boolean) {
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty;
  useEffect(() => {
    const read = () => dirtyRef.current;
    dirtyReaders.add(read);
    return () => { dirtyReaders.delete(read); };
  }, []);
  return () => { dirtyRef.current = false; };
}
