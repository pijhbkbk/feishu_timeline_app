import React, { type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '../lib/auth-client';
import type { VisualDeltaReviewWorkspaceResponse, VisualStagePreview } from '../lib/visual-delta-reviews-client';

// Node component scheduler exercises the actual callback chain, not browser events.
const hooks = vi.hoisted(() => ({ slots: [] as unknown[], index: 0, dirty: false,
  effects: [] as Array<() => void>, cleanups: new Map<number, () => void>() }));
const api = vi.hoisted(() => ({ load: vi.fn(), create: vi.fn(), update: vi.fn(), approve: vi.fn(), preview: vi.fn(), confirm: vi.fn() }));
const member: SessionUser = { id: 'author', username: 'synthetic', name: '合成评审人', email: null,
  departmentId: null, departmentName: null, authSource: 'local', teamAccessApproved: true,
  isSystemAdmin: false, roleCodes: ['quality_engineer'] };
vi.mock('react', async () => ({ ...await vi.importActual<typeof import('react')>('react'),
  useState: <T,>(initial: T | (() => T)) => {
    const index = hooks.index++;
    if (!(index in hooks.slots)) hooks.slots[index] = typeof initial === 'function' ? (initial as () => T)() : initial;
    return [hooks.slots[index], (value: T | ((old: T) => T)) => {
      const next = typeof value === 'function' ? (value as (old: T) => T)(hooks.slots[index] as T) : value;
      if (!Object.is(next, hooks.slots[index])) { hooks.slots[index] = next; hooks.dirty = true; }
    }];
  },
  useRef: <T,>(initial: T) => { const index = hooks.index++; if (!(index in hooks.slots)) hooks.slots[index] = { current: initial }; return hooks.slots[index]; },
  useEffect: (effect: () => void | (() => void), deps: readonly unknown[]) => {
    const index = hooks.index++, old = hooks.slots[index] as readonly unknown[] | undefined;
    if (old && old.length === deps.length && old.every((value, at) => Object.is(value, deps[at]))) return;
    hooks.slots[index] = deps;
    hooks.effects.push(() => { hooks.cleanups.get(index)?.(); const cleanup = effect(); if (cleanup) hooks.cleanups.set(index, cleanup); });
  },
}));
vi.mock('./auth-provider', () => ({ useAuth: () => ({ user: member }) }));
vi.mock('../lib/visual-delta-reviews-client', async () => ({
  ...await vi.importActual<typeof import('../lib/visual-delta-reviews-client')>('../lib/visual-delta-reviews-client'),
  fetchVisualDeltaReviewWorkspace: api.load, createVisualDeltaReview: api.create, updateVisualDeltaReview: api.update,
  approveVisualDeltaReview: api.approve, previewVisualDeltaStage: api.preview, confirmVisualDeltaStage: api.confirm,
}));
import { VisualDeltaReviewWorkspace, VisualDeltaReviewForm, VisualDeltaReviewHistory } from './visual-delta-review-workspace';
const date = '2026-10-19T00:00:00.000Z';
function workspace(): VisualDeltaReviewWorkspaceResponse {
  return { reviewMode: 'ACTUAL', massProductionCompleted: true, monthlyPlanActive: false, recurringTasks: [],
    project: { id: 'project', code: 'SYNTHETIC', name: '合成实际评审', currentNodeCode: 'VISUAL_COLOR_DIFFERENCE_REVIEW', currentNodeName: '实际目视评审', targetDate: null, riskLevel: 'LOW' },
    activeTask: { id: 'task', taskNo: 'SYNTHETIC-TASK', nodeCode: 'VISUAL_COLOR_DIFFERENCE_REVIEW', nodeName: '实际评审',
      taskRound: 1, status: 'IN_PROGRESS', isPrimary: true, isActive: true, assigneeUserId: null, assigneeUserName: null,
      assigneeDepartmentId: null, assigneeDepartmentName: null, dueAt: null, startedAt: date, completedAt: null,
      returnedAt: null, payload: null, availableActions: ['APPROVE'], createdAt: date, updatedAt: date },
    downstreamTask: null, items: [] };
}
const preview: VisualStagePreview = { taskId: 'task', taskVersion: date, canComplete: true, blockingReasons: [] };
let tree: ReactNode;
type Element = ReactElement<Record<string, unknown>>;
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  return React.isValidElement<Record<string, unknown>>(node) ? [node, ...elements(node.props.children as ReactNode)] : [];
}
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join('');
  return React.isValidElement<Record<string, unknown>>(node) ? text(node.props.children as ReactNode) : String(node ?? '');
}
async function flush(projectId = 'project') {
  for (let round = 0; round < 20; round++) {
    hooks.index = 0; hooks.dirty = false; tree = VisualDeltaReviewWorkspace({ projectId });
    hooks.effects.splice(0).forEach(effect => effect());
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    if (!hooks.dirty && !hooks.effects.length) return;
  }
  throw new Error('Component did not settle');
}
function button(label: string) {
  const element = elements(tree).find(item => item.type === 'button' && text(item.props.children as ReactNode) === label);
  expect(element).toBeDefined(); return element!;
}
function click(label: string) { const item = button(label); expect(item.props.disabled).not.toBe(true); (item.props.onClick as () => void)(); }
beforeEach(() => {
  hooks.slots = []; hooks.index = 0; hooks.dirty = false; hooks.effects = []; hooks.cleanups = new Map();
  Object.values(api).forEach(mock => mock.mockReset()); api.load.mockResolvedValue(workspace());
});
afterEach(() => hooks.cleanups.forEach(cleanup => cleanup()));
describe('actual visual review and explicit stage callbacks', () => {
  it('edits an admitted existing draft after the first monthly signature without creating another record', async () => {
    const current = workspace();
    current.reviewMode = 'LEGACY_MONTHLY'; current.monthlyPlanActive = true;
    current.recurringTasks = [{ id: 'period', periodIndex: 1, periodLabel: '2026-10', plannedDate: date,
      dueAt: null, reviewerId: 'first-author', status: 'COMPLETED' }];
    current.items = [{ id: 'existing-review', workflowTaskId: 'task', reviewType: 'VISUAL_COLOR_DIFFERENCE_REVIEW',
      reviewPeriod: '2026-10', isPeriodCompleted: false, canContinueCompletedPeriod: true,
      reviewConclusion: 'APPROVED', reviewDate: date, submittedAt: null, reviewerId: member.id,
      reviewerName: member.name, comment: '合成既存意见', conditionNote: null, rejectReason: null,
      returnToNodeCode: null, returnToNodeName: null, createdAt: date, updatedAt: date, attachment: null, attachmentHistory: [] }];
    api.load.mockResolvedValue(current); api.update.mockResolvedValue(current);
    await flush();
    expect(text(tree)).toContain('首条签署事实保留');
    expect(elements(tree).find(item => item.type === VisualDeltaReviewHistory)?.props.isReadOnly).toBe(false);
    click('继续填写'); await flush();
    const form = elements(tree).find(item => item.type === VisualDeltaReviewForm)!;
    expect(form.props.disabled).toBe(false);
    (form.props.onSubmit as () => void)(); await flush();
    expect(api.update).toHaveBeenCalledWith('project', 'existing-review', expect.objectContaining({ comment: '合成既存意见' }));
    expect(api.create).not.toHaveBeenCalled(); expect(api.confirm).not.toHaveBeenCalled();
  });
  it('saves a real date without requiring or inventing a month', async () => {
    await flush();
    expect(text(tree)).toContain('不生成固定月份义务');
    expect(elements(tree).some(item => item.type === 'select')).toBe(false);
    const value = { reviewDate: '2026-10-19', reviewerId: member.id, reviewConclusion: 'APPROVED',
      comment: '合成抽检意见', conditionNote: '', rejectReason: '' };
    const form = () => elements(tree).find(item => item.type === VisualDeltaReviewForm)!;
    (form().props.onChange as (value: unknown) => void)(value); await flush();
    api.create.mockResolvedValue(workspace()); (form().props.onSubmit as () => void)(); await flush();
    expect(api.create).toHaveBeenCalledWith('project', value);
    expect(api.preview).not.toHaveBeenCalled(); expect(api.confirm).not.toHaveBeenCalled();
  });
  it('keeps record approval separate from explicit preview and stage confirmation', async () => {
    const current = workspace();
    current.items = [{ id: 'review', workflowTaskId: 'task', reviewType: 'VISUAL_COLOR_DIFFERENCE_REVIEW',
      reviewPeriod: 'TASK', isPeriodCompleted: false, reviewConclusion: 'APPROVED', reviewDate: date,
      submittedAt: date, reviewerId: member.id, reviewerName: member.name, comment: '合成意见', conditionNote: null,
      rejectReason: null, returnToNodeCode: null, returnToNodeName: null, createdAt: date, updatedAt: date,
      attachment: null, attachmentHistory: [] }];
    api.load.mockResolvedValue(current); api.approve.mockResolvedValue({ ...current, items: [{ ...current.items[0]!, isPeriodCompleted: true }] });
    await flush();
    const history = elements(tree).find(item => item.type === VisualDeltaReviewHistory)!;
    (history.props.onApproveReview as (value: unknown) => void)(current.items[0]); await flush();
    expect(api.approve).toHaveBeenCalledWith('project', 'review');
    expect(api.confirm).not.toHaveBeenCalled(); expect(text(tree)).toContain('核对');
    api.preview.mockResolvedValue(preview); click('核对阶段完成条件'); await flush();
    expect(api.preview).toHaveBeenCalledWith('project', current.activeTask); expect(api.confirm).not.toHaveBeenCalled();
    api.confirm.mockResolvedValue({ ...current, activeTask: null }); click('确认本阶段完成'); await flush();
    expect(api.confirm).toHaveBeenCalledWith('project', preview); expect(text(tree)).toContain('后续颜色退出仍按年度依据');
  });
  it('shows unfinished actual items and never confirms a blocked preview', async () => {
    api.preview.mockResolvedValue({ ...preview, canComplete: false, blockingReasons: ['仍有 1 项已登记实际抽检未确认。'] });
    await flush(); click('核对阶段完成条件'); await flush();
    expect(text(tree)).toContain('仍有 1 项已登记实际抽检未确认');
    expect(button('确认本阶段完成').props.disabled).toBe(true); expect(api.confirm).not.toHaveBeenCalled();
  });
  it('keeps failed and stale stage previews from enabling a different project', async () => {
    api.preview.mockRejectedValueOnce(new Error('阶段已更新，请重新读取。'));
    await flush(); click('核对阶段完成条件'); await flush();
    expect(text(tree)).toContain('阶段已更新'); expect(elements(tree).some(item => text(item.props.children as ReactNode) === '确认本阶段完成')).toBe(false);
    let resolve!: (value: VisualStagePreview) => void;
    api.preview.mockImplementationOnce(() => new Promise<VisualStagePreview>(done => { resolve = done; }));
    click('核对阶段完成条件'); await flush(); await flush('other-project');
    resolve(preview); await flush('other-project');
    expect(elements(tree).some(item => item.type === 'button' && text(item.props.children as ReactNode) === '确认本阶段完成')).toBe(false);
    expect(api.confirm).not.toHaveBeenCalled();
  });
});
