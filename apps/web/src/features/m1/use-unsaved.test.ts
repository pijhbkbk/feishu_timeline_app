import { afterEach, describe, expect, it, vi } from 'vitest';

const hooks = vi.hoisted(() => ({ effects: [] as Array<() => void | (() => void)> }));
vi.mock('react', () => ({
  useEffect: (effect: () => void | (() => void)) => { hooks.effects.push(effect); },
  useRef: <T,>(value: T) => ({ current: value }),
}));

import { confirmM1Navigation, useM1NavigationGuard, useProjectUnsavedChanges } from './use-unsaved';

const indexKey = '__m1ProjectNavigationIndex';
type Entry = { url: string; state: Record<string, unknown> };
const cleanup: Array<() => void> = [];

function mountHook(render: () => void) {
  hooks.effects = [];
  render();
  const effects = hooks.effects.map(effect => effect()).filter((value): value is () => void => typeof value === 'function');
  let mounted = true;
  const dispose = () => {
    if (!mounted) return;
    mounted = false;
    for (const effect of effects) effect();
  };
  cleanup.push(dispose);
  return dispose;
}

function eventSurface() {
  const surface = new EventTarget();
  const add = surface.addEventListener.bind(surface);
  const remove = surface.removeEventListener.bind(surface);
  // Node's EventTarget does not match browser boolean capture removal; use
  // the equivalent object form so cleanup semantics remain browser-accurate.
  surface.addEventListener = (type, listener, options) => add(type, listener, typeof options === 'boolean' ? { capture: options } : options);
  surface.removeEventListener = (type, listener, options) => remove(type, listener, typeof options === 'boolean' ? { capture: options } : options);
  return surface;
}

function browserHistory() {
  const surface = eventSurface();
  const documentSurface = eventSurface();
  const location = { href: '/start' };
  const entries: Entry[] = [{ url: location.href, state: { __NA: true } }];
  const queuedDestinations: number[] = [];
  let cursor = 0;
  const confirm = vi.fn(() => true);
  const history = {
    get state() { return entries[cursor]!.state; },
    pushState(state: Record<string, unknown>, _unused: string, url?: string | URL | null) {
      entries.splice(cursor + 1);
      entries.push({ state, url: url == null ? location.href : String(url) });
      cursor++;
      location.href = entries[cursor]!.url;
    },
    replaceState(state: Record<string, unknown>, _unused: string, url?: string | URL | null) {
      entries[cursor] = { state, url: url == null ? location.href : String(url) };
      location.href = entries[cursor]!.url;
    },
    go: vi.fn((delta: number) => { queuedDestinations.push(cursor + delta); }),
  };
  Object.assign(surface, { history, location, confirm });
  vi.stubGlobal('window', surface);
  vi.stubGlobal('document', documentSurface);

  function traverseTo(destination: number) {
    if (destination < 0 || destination >= entries.length) return;
    cursor = destination;
    location.href = entries[cursor]!.url;
    const event = new Event('popstate');
    Object.defineProperty(event, 'state', { value: history.state });
    surface.dispatchEvent(event);
  }
  function flushRestoration() {
    let remaining = 10;
    while (queuedDestinations.length) {
      if (--remaining === 0) throw new Error('Unexpected restoration loop');
      traverseTo(queuedDestinations.shift()!);
    }
  }
  function push(url: string) { history.pushState({ __NA: true }, '', url); }
  function back() { traverseTo(cursor - 1); }
  function forward() { traverseTo(cursor + 1); }

  // Model only the relevant installed Next 15 effect contract: it captures
  // bound history methods, delegates through them, and restores those bound
  // functions during parent cleanup. No Next router behavior is mocked as PASS.
  function installNextHistoryWrapper() {
    const originalPush = history.pushState.bind(history);
    const originalReplace = history.replaceState.bind(history);
    history.pushState = (state, unused, url) => originalPush(state, unused, url);
    history.replaceState = (state, unused, url) => originalReplace(state, unused, url);
    const routerPop = vi.fn();
    surface.addEventListener('popstate', routerPop);
    let installed = true;
    const dispose = () => {
      if (!installed) return;
      installed = false;
      history.pushState = originalPush;
      history.replaceState = originalReplace;
      surface.removeEventListener('popstate', routerPop);
    };
    cleanup.push(dispose);
    return { dispose, routerPop };
  }
  return { history, location, entries, confirm, push, back, forward, flushRestoration, installNextHistoryWrapper, get cursor() { return cursor; } };
}

afterEach(() => {
  for (const dispose of cleanup.splice(0).reverse()) dispose();
  hooks.effects = [];
  vi.unstubAllGlobals();
});

describe('M1 persistent unsaved navigation guard', () => {
  it('ignores a disposed wrapper retained by Next.bind after StrictMode remount and branching history', () => {
    const browser = browserHistory();
    const firstGuard = mountHook(useM1NavigationGuard);
    const firstNext = browser.installNextHistoryWrapper();
    // React passive effect disconnection is parent-first; reconnection is child-first.
    firstNext.dispose();
    firstGuard();
    mountHook(useM1NavigationGuard);
    const next = browser.installNextHistoryWrapper();

    browser.push('/a');
    browser.push('/b');
    browser.back();
    browser.push('/c');
    browser.back();
    browser.push('/d');
    browser.push('/e');
    expect(browser.entries.map(entry => entry.url)).toEqual(['/start', '/a', '/d', '/e']);
    expect(browser.entries.map(entry => entry.state[indexKey])).toEqual([0, 1, 2, 3]);

    mountHook(() => { useProjectUnsavedChanges(true); });
    browser.confirm.mockReturnValue(false);
    const routerCalls = next.routerPop.mock.calls.length;
    browser.back();
    expect(browser.history.go).toHaveBeenLastCalledWith(1);
    browser.flushRestoration();
    expect(browser.location.href).toBe('/e');
    expect(browser.cursor).toBe(3);
    expect(next.routerPop).toHaveBeenCalledTimes(routerCalls);
  });

  it('can reject back repeatedly without replaying the rejected or restoring pop to Next', () => {
    const browser = browserHistory();
    mountHook(useM1NavigationGuard);
    const next = browser.installNextHistoryWrapper();
    browser.push('/overview');
    browser.push('/draft');
    mountHook(() => { useProjectUnsavedChanges(true); });
    browser.confirm.mockReturnValue(false);

    for (let count = 0; count < 2; count++) {
      browser.back();
      expect(browser.history.go).toHaveBeenLastCalledWith(1);
      browser.flushRestoration();
      expect(browser.location.href).toBe('/draft');
      expect(browser.history.state[indexKey]).toBe(2);
    }
    expect(browser.confirm).toHaveBeenCalledTimes(2);
    expect(next.routerPop).not.toHaveBeenCalled();
  });

  it('restores the current form when dirty forward is rejected and allows a later accepted traversal', () => {
    const browser = browserHistory();
    mountHook(useM1NavigationGuard);
    const next = browser.installNextHistoryWrapper();
    browser.push('/draft');
    browser.push('/later');
    browser.back();
    expect(browser.location.href).toBe('/draft');
    mountHook(() => { useProjectUnsavedChanges(true); });
    browser.confirm.mockReturnValue(false);
    const routerCalls = next.routerPop.mock.calls.length;

    browser.forward();
    expect(browser.history.go).toHaveBeenLastCalledWith(-1);
    browser.flushRestoration();
    expect(browser.location.href).toBe('/draft');
    expect(browser.history.state[indexKey]).toBe(1);
    expect(next.routerPop).toHaveBeenCalledTimes(routerCalls);

    browser.confirm.mockReturnValue(true);
    browser.forward();
    expect(browser.location.href).toBe('/later');
    expect(next.routerPop).toHaveBeenCalledTimes(routerCalls + 1);
  });

  it('removes an unmounted form reader while preserving another dirty form and explicit allowLeave', () => {
    const browser = browserHistory();
    mountHook(useM1NavigationGuard);
    const disposeFirst = mountHook(() => { useProjectUnsavedChanges(true); });
    let allowLeave: (() => void) | undefined;
    const disposeSecond = mountHook(() => { allowLeave = useProjectUnsavedChanges(true); });
    browser.confirm.mockReturnValue(false);
    expect(confirmM1Navigation()).toBe(false);
    disposeFirst();
    expect(confirmM1Navigation()).toBe(false);
    allowLeave!();
    expect(confirmM1Navigation()).toBe(true);
    disposeSecond();
    browser.confirm.mockClear();
    expect(confirmM1Navigation()).toBe(true);
    expect(browser.confirm).not.toHaveBeenCalled();
  });
});
