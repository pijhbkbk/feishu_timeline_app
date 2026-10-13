import React, { type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RegisterRow } from './client';
import type { BusinessSheetCanvasProps } from '../business-sheet/canvas';

// This project uses Node-only Vitest without a DOM renderer. Keep a small hook
// scheduler for the actual workspace component, and replace only its native
// canvas/API boundaries. The separate T07b real-browser test covers React/DOM and
// Univer focus/Enter behavior; no production helpers are copied into this test.
const hooks = vi.hoisted(() => ({ slots: [] as unknown[], index: 0, dirty: false, effects: [] as Array<() => void>, cleanups: [] as Array<() => void> }));
const api = vi.hoisted(() => ({ readCatalog: vi.fn(), saveCatalog: vi.fn(), fetchRegisterDetail: vi.fn() }));
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  const equal = (a: readonly unknown[] | undefined, b: readonly unknown[] | undefined) => a !== undefined && b !== undefined && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const memo = <T,>(factory: () => T, deps: readonly unknown[]) => {
    const index = hooks.index++, old = hooks.slots[index] as { value: T; deps: readonly unknown[] } | undefined;
    if (old && equal(old.deps, deps)) return old.value;
    const next = { value: factory(), deps }; hooks.slots[index] = next; return next.value;
  };
  return { ...actual,
    useState: <T,>(initial: T | (() => T)) => {
      const index = hooks.index++;
      if (!(index in hooks.slots)) hooks.slots[index] = typeof initial === 'function' ? (initial as () => T)() : initial;
      return [hooks.slots[index], (value: T | ((before: T) => T)) => {
        const next = typeof value === 'function' ? (value as (before: T) => T)(hooks.slots[index] as T) : value;
        if (!Object.is(next, hooks.slots[index])) { hooks.slots[index] = next; hooks.dirty = true; }
      }];
    },
    useRef: <T,>(initial: T) => { const index = hooks.index++; if (!(index in hooks.slots)) hooks.slots[index] = { current: initial }; return hooks.slots[index]; },
    useMemo: memo,
    useCallback: <T,>(callback: T, deps: readonly unknown[]) => memo(() => callback, deps),
    useEffect: (effect: () => void | (() => void), deps?: readonly unknown[]) => {
      const index = hooks.index++, old = hooks.slots[index] as { deps: readonly unknown[] | undefined; cleanup?: () => void } | undefined;
      if (old && equal(old.deps, deps)) return;
      const next: { deps: readonly unknown[] | undefined; cleanup?: () => void } = { deps }; hooks.slots[index] = next;
      hooks.effects.push(() => { old?.cleanup?.(); const cleanup = effect(); if (cleanup) { next.cleanup = cleanup; hooks.cleanups.push(cleanup); } });
    },
  };
});
vi.mock('next/link', () => ({ default: 'a' }));
vi.mock('../../components/auth-provider', () => ({ useAuth: () => ({ user: { id: 'member', teamAccessApproved: true, isSystemAdmin: false } }) }));
vi.mock('../m1/use-unsaved', () => ({ useProjectUnsavedChanges: () => undefined }));
vi.mock('./sheet-client', () => api);
vi.mock('./client', () => ({ fetchRegisterDetail: api.fetchRegisterDetail }));
vi.mock('./register-details', () => ({ RegisterDetails: () => null }));
vi.mock('./source-workbook', () => ({ SourceWorkbook: () => null }));
vi.mock('./image-sheet-import', () => ({ ColorImageSheetImport: () => null, colorExchangeRow: (value: unknown) => value }));
vi.mock('../business-sheet/image-panel', () => ({ SheetImagePanel: () => null }));
vi.mock('../business-sheet/use-images', () => ({ useSheetImages: () => ({ images: [], pending: false }) }));
vi.mock('../business-sheet/canvas', () => ({ BusinessSheetCanvas: () => null }));

import { BusinessSheetCanvas } from '../business-sheet/canvas';
import { RegisterDetails } from './register-details';
import { ColorRegisterWorkspace } from './workspace';
const row = (id: string, base: string): RegisterRow => ({ id, colorId: id, name: '同名蓝', base: { id: base, name: base }, formalCode: null, manufacturer: null, paintType: null, boardCode: null, registerMonth: null, registerStatus: 'LISTED', productionApprovalStatus: 'UNKNOWN', note: `备注-${id}`, revision: 1, currentStandardVersionId: null, sourceSummary: null });
type Element = ReactElement<Record<string, unknown>>;
function elements(node: ReactNode): Element[] {
  if (!React.isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...React.Children.toArray(node.props.children as ReactNode).flatMap(elements)];
}
function text(node: ReactNode): string { return React.isValidElement<Record<string, unknown>>(node) ? React.Children.toArray(node.props.children as ReactNode).map(text).join('') : String(node ?? ''); }
let tree: ReactNode;
let finish: ReturnType<typeof vi.fn>;
let commitOnFinish = false;
function canvas() { return elements(tree).find(item => item.type === BusinessSheetCanvas)!.props as unknown as BusinessSheetCanvasProps; }
async function flush() {
  for (let round = 0; round < 15; round++) {
    hooks.index = 0; hooks.dirty = false; tree = ColorRegisterWorkspace();
    const current = canvas();
    current.runtimeRef.current = { finishEditing: finish, updateValues: vi.fn() } as unknown as NonNullable<BusinessSheetCanvasProps['runtimeRef']['current']>;
    hooks.effects.splice(0).forEach(effect => effect());
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    if (!hooks.dirty && !hooks.effects.length) return;
  }
  throw new Error('Workspace hook harness did not settle');
}
function detailsButton() { return elements(tree).find(item => item.type === 'button' && text(item.props.children as ReactNode).includes('查看业务详情与历史'))!; }
beforeEach(() => {
  vi.useFakeTimers(); hooks.slots = []; hooks.effects = []; hooks.cleanups = []; hooks.index = 0; hooks.dirty = false; commitOnFinish = false;
  vi.stubGlobal('window', { location: { search: '' }, setTimeout, clearTimeout, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  api.readCatalog.mockResolvedValue({ items: [row('a', '基地甲'), row('b', '基地乙')], total: 2, facets: { bases: [], statuses: ['LISTED'] } });
  api.saveCatalog.mockReset(); api.fetchRegisterDetail.mockResolvedValue({ sources: [], projects: [] });
  finish = vi.fn(async () => {
    const current = canvas();
    if (commitOnFinish) current.onChanges([{ id: 'a', field: 'note', value: '刚结束原生编辑产生的草稿' }]);
    current.onSelection('b', 2, 2); // Univer endEditingAsync(true) behaves like Enter.
  });
});
afterEach(() => { hooks.cleanups.forEach(cleanup => cleanup()); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('color detail target during native editor completion', () => {
  it('keeps the clicked record ID when native completion selects the next row', async () => {
    await flush(); expect(canvas().selection.id).toBe('a');
    const button = detailsButton(); expect(button.props.disabled).toBe(false);
    (button.props.onClick as () => void)(); await flush();
    expect(finish).toHaveBeenCalledOnce(); expect(canvas().selection.id).toBe('b');
    expect(elements(tree).find(item => item.type === RegisterDetails)?.props.id).toBe('a');
    expect(api.saveCatalog).not.toHaveBeenCalled();
  });
  it('blocks details when finishing a native edit creates a pending business change', async () => {
    await flush(); commitOnFinish = true;
    const button = detailsButton(); expect(button.props.disabled).toBe(false);
    (button.props.onClick as () => void)(); await flush();
    expect(finish).toHaveBeenCalledOnce(); expect(canvas().selection.id).toBe('b');
    expect(elements(tree).some(item => item.type === RegisterDetails)).toBe(false);
    expect(text(tree)).toContain('请先保存或处理待保存内容，再打开业务详情。');
    expect(detailsButton().props.disabled).toBe(true); expect(api.saveCatalog).not.toHaveBeenCalled();
  });
});
