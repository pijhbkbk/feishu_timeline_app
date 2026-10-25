import React, { type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Exercise the real dialog handlers without a browser renderer; the immutable
// candidate's GUI checks cover native dialog/focus behavior separately.
const hooks = vi.hoisted(() => ({ values: [] as unknown[], index: 0 }));
const detail = vi.hoisted(() => ({ id: 'color-a', name: 'Synthetic A', base: null, hueStandard: null, formalCode: null, registerMonth: null, registerStatus: 'LISTED', productionApprovalStatus: 'UNKNOWN', note: null, pendingReasons: [], versions: [], versionsPage: 2, versionsTotalPages: 3, systemProduction: { items: [], undatedRecordCount: 0, hasMore: false }, production: [], productionLimit: 120, sources: [], provenance: [], projects: [] }));
vi.mock('react', async () => ({
  ...await vi.importActual<typeof import('react')>('react'),
  useState: <T,>(initial: T) => {
    const index = hooks.index++;
    if (!(index in hooks.values)) hooks.values[index] = index === 0 ? detail : index === 1 ? false : initial;
    return [hooks.values[index], (next: T) => { hooks.values[index] = next; }];
  },
  useRef: () => ({ current: null }), useEffect: () => undefined,
}));
vi.mock('next/link', () => ({ default: 'a' }));
vi.mock('./annual-review', () => ({ AnnualReviewPanel: () => null }));
vi.mock('./standard-correction', () => ({ StandardCorrection: () => null }));
import { AnnualReviewPanel } from './annual-review';
import { StandardCorrection } from './standard-correction';
import { RegisterDetails } from './register-details';
type Element = ReactElement<Record<string, unknown>>;
function elements(node: ReactNode): Element[] {
  if (!React.isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...React.Children.toArray(node.props.children as ReactNode).flatMap(elements)];
}
const close = vi.fn(), back = vi.fn(), confirm = vi.fn();
function render(withReturn = true) { hooks.index = 0; return RegisterDetails({ id: 'color-a', onClose: close, ...(withReturn ? { onReturnToRecord: back } : {}) }); }
function annual() { return elements(render()).find(node => node.type === AnnualReviewPanel)!.props; }
function correction() { return elements(render()).find(node => node.type === StandardCorrection)!.props; }
function returnToRecord() { (annual().onReturnToRecord as () => void)(); }
beforeEach(() => { hooks.values = []; hooks.index = 0; close.mockReset(); back.mockReset(); confirm.mockReset(); vi.stubGlobal('window', { confirm }); });
afterEach(() => vi.unstubAllGlobals());
describe('record dialog return protection', () => {
  it('closes cleanly using the record callback and retains compatibility with older callers', () => {
    returnToRecord(); expect(back).toHaveBeenCalledOnce(); expect(close).not.toHaveBeenCalled(); expect(confirm).not.toHaveBeenCalled();
    (elements(render(false)).find(node => node.type === AnnualReviewPanel)!.props.onReturnToRecord as () => void)();
    expect(close).toHaveBeenCalledOnce();
  });
  it.each(['annual', 'correction'])('keeps %s edits on cancellation and returns only after confirmation', kind => {
    if (kind === 'annual') (annual().onDirtyChange as (value: boolean) => void)(true);
    else (correction().onEditingChange as (value: boolean) => void)(true);
    confirm.mockReturnValueOnce(false); returnToRecord(); expect(back).not.toHaveBeenCalled();
    confirm.mockReturnValueOnce(true); returnToRecord(); expect(back).toHaveBeenCalledOnce(); expect(confirm).toHaveBeenCalledTimes(2);
  });
  it.each(['annual', 'correction'])('blocks return, close and Escape while %s save is pending', kind => {
    const panel = kind === 'annual' ? annual() : correction(); (panel.onBusyChange as (value: boolean) => void)(true);
    expect(annual().returnDisabled).toBe(true); returnToRecord();
    const dialog = render(); const button = elements(dialog).find(node => node.type === 'button')!;
    const pagination = elements(dialog).find(node => node.props['aria-label'] === '标准版本分页')!;
    expect(elements(pagination).filter(node => node.type === 'button').every(node => node.props.disabled === true)).toBe(true);
    expect(kind === 'annual' ? correction().saveDisabled : annual().saveDisabled).toBe(true);
    expect(button.props.disabled).toBe(true); (button.props.onClick as () => void)();
    const preventDefault = vi.fn(); dialog.props.onCancel({ preventDefault } as unknown as React.SyntheticEvent<HTMLDialogElement>);
    expect(preventDefault).toHaveBeenCalledOnce(); expect(close).not.toHaveBeenCalled(); expect(back).not.toHaveBeenCalled(); expect(confirm).not.toHaveBeenCalled();
    (panel.onBusyChange as (value: boolean) => void)(false); returnToRecord(); expect(back).toHaveBeenCalledOnce();
  });
});
