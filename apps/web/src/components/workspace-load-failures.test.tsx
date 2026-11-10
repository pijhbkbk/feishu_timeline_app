import React, { type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Node-only component scheduler: exercise real loaders and retry callbacks,
// replacing only React's renderer and the network boundary. Browser UI is separate.
const hooks = vi.hoisted(() => ({ slots: [] as unknown[], index: 0, dirty: false, effects: [] as Array<() => void>, cleanups: [] as Array<() => void> }));
const api = vi.hoisted(() => ({ materials: vi.fn(), attachments: vi.fn(), cabin: vi.fn(), context: vi.fn() }));
const route = vi.hoisted(() => ({ search: 'from=dashboard' }));
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return { ...actual,
    useState: <T,>(initial: T | (() => T)) => {
      const index = hooks.index++;
      if (!(index in hooks.slots)) hooks.slots[index] = typeof initial === 'function' ? (initial as () => T)() : initial;
      return [hooks.slots[index], (value: T | ((old: T) => T)) => {
        const next = typeof value === 'function' ? (value as (old: T) => T)(hooks.slots[index] as T) : value;
        if (!Object.is(next, hooks.slots[index])) { hooks.slots[index] = next; hooks.dirty = true; }
      }];
    },
    useRef: <T,>(initial: T) => { const index = hooks.index++; if (!(index in hooks.slots)) hooks.slots[index] = { current: initial }; return hooks.slots[index]; },
    useMemo: <T,>(factory: () => T) => factory(),
    useEffect: (effect: () => void | (() => void), deps?: readonly unknown[]) => {
      const index = hooks.index++, old = hooks.slots[index] as readonly unknown[] | undefined;
      if (old && deps && old.length === deps.length && old.every((item, at) => Object.is(item, deps[at]))) return;
      hooks.slots[index] = deps;
      hooks.effects.push(() => { const cleanup = effect(); if (cleanup) hooks.cleanups.push(cleanup); });
    },
  };
});
vi.mock('next/link', () => ({ default: 'a' }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(route.search), useRouter: () => ({}) }));
vi.mock('./auth-provider', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('../lib/dashboard-client', async () => ({ ...await vi.importActual<typeof import('../lib/dashboard-client')>('../lib/dashboard-client'), fetchDashboardProjectTimelines: api.materials }));
vi.mock('../lib/attachments-client', async () => ({ ...await vi.importActual<typeof import('../lib/attachments-client')>('../lib/attachments-client'), fetchAttachmentsWorkspace: api.attachments }));
vi.mock('../lib/reviews-client', async () => ({ ...await vi.importActual<typeof import('../lib/reviews-client')>('../lib/reviews-client'), fetchCabinReviewWorkspace: api.cabin, fetchCabinReviewPageOptions: async () => [] }));
vi.mock('../lib/auth-client', async () => ({ ...await vi.importActual<typeof import('../lib/auth-client')>('../lib/auth-client'), apiRequest: api.context }));
vi.mock('../features/v2/use-r26-readonly-data', () => ({ useR26ReadOnlyData: () => ({ loading: false, error: null, refresh: vi.fn(), data: {
  project: { id: 'project-1', code: 'P-1', name: '合成项目' },
  flowMap: { colorName: '合成颜色', nodes: [{ nodeCode: 'MASS_PRODUCTION', taskId: 'task-1', stepName: '生产记录', statusLabel: '进行中' }] }, projectRecords: [],
} }) }));

import { MaterialsCenter } from './materials-center';
import { AttachmentsWorkspace } from './attachments-workspace';
import { CabinReviewWorkspace } from './cabin-review-workspace';
import { M1NodeWorkspace } from '../features/m1/node-workspace';
import { M1RecordReturn } from '../features/m1/record-return';
import { ColorProjectOverview } from '../features/color-projects/project-overview';
import { nodeReturnHref } from '../features/m1/context';

type Element = ReactElement<Record<string, unknown>>;
let tree: ReactNode;
function elements(node: ReactNode): Element[] {
  if (!React.isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...React.Children.toArray([node.props.children, node.props.actions] as ReactNode[]).flatMap(elements)];
}
function text(node: ReactNode): string {
  return React.isValidElement<Record<string, unknown>>(node)
    ? [node.props.title, node.props.description, node.props.message, ...React.Children.toArray(node.props.children as ReactNode)].map(value => text(value as ReactNode)).join('')
    : String(node ?? '');
}
async function flush(component: () => ReactNode) {
  for (let round = 0; round < 15; round++) {
    hooks.index = 0; hooks.dirty = false; tree = component();
    hooks.effects.splice(0).forEach(effect => effect());
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    if (!hooks.dirty && !hooks.effects.length) return;
  }
  throw new Error('Component did not settle');
}
function retry(label = '重试') {
  const button = elements(tree).find(item => item.type === 'button' && text(item.props.children as ReactNode) === label);
  expect(button).toBeDefined(); (button!.props.onClick as () => void)();
}
beforeEach(() => {
  vi.useFakeTimers(); hooks.slots = []; hooks.index = 0; hooks.dirty = false; hooks.effects = []; hooks.cleanups = [];
  vi.stubGlobal('window', { setInterval, clearInterval });
  // Next supplies the automatic JSX runtime; this Node test transform uses React.
  vi.stubGlobal('React', React);
  Object.values(api).forEach(mock => mock.mockReset());
  route.search = 'from=dashboard';
});
afterEach(() => { hooks.cleanups.forEach(cleanup => cleanup()); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('workspace initial failure and recovery', () => {
  it('exposes the first materials failure and retries successfully without a page reload', async () => {
    api.materials.mockRejectedValueOnce(new Error('网络连接失败')).mockResolvedValueOnce({ items: [], lastUpdatedAt: '2026-10-19T00:00:00Z' });
    await flush(MaterialsCenter);
    expect(text(tree)).toContain('网络连接失败');
    expect(text(tree)).not.toContain('正在加载材料提交平台');
    expect(elements(tree).some(item => item.props.href === '/projects')).toBe(true);
    retry(); await flush(MaterialsCenter);
    expect(api.materials).toHaveBeenCalledTimes(2);
    expect(elements(tree).some(item => item.props['data-testid'] === 'materials-page')).toBe(true);
    expect(text(tree)).not.toContain('网络连接失败');
  });
  it('keeps loaded material data after a background failure and clears the error on background recovery', async () => {
    const payload = { items: [], lastUpdatedAt: '2026-10-19T00:00:00Z' };
    api.materials.mockResolvedValueOnce(payload).mockRejectedValueOnce(new Error('暂时离线')).mockResolvedValueOnce(payload);
    await flush(MaterialsCenter);
    await vi.advanceTimersByTimeAsync(30_000); await flush(MaterialsCenter);
    expect(text(tree)).toContain('暂时离线');
    expect(elements(tree).some(item => item.props['data-testid'] === 'materials-page')).toBe(true);
    await vi.advanceTimersByTimeAsync(30_000); await flush(MaterialsCenter);
    expect(text(tree)).not.toContain('暂时离线');
    expect(api.materials).toHaveBeenCalledTimes(3);
  });
  for (const [name, request, component, fallbackTab] of [
    ['project materials', api.attachments, () => AttachmentsWorkspace({ projectId: 'project-1', mode: 'materials' }), 'materials'],
    ['cabin review', api.cabin, () => CabinReviewWorkspace({ projectId: 'project-1' }), undefined],
  ] as const) it(`${name} shows a failed request with retry and a safe return`, async () => {
    request.mockRejectedValue(new Error('请求失败'));
    await flush(component);
    expect(text(tree)).toContain('请求失败');
    expect(text(tree)).not.toContain('正在加载');
    const back = elements(tree).find(item => item.type === M1RecordReturn);
    expect(back?.props.projectId).toBe('project-1'); expect(back?.props.fallbackTab).toBe(fallbackTab);
    retry(); await flush(component); expect(request).toHaveBeenCalledTimes(2);
  });
  it('keeps the originating dashboard and node available when node context fails', async () => {
    api.context.mockRejectedValue(new Error('节点不可读取'));
    await flush(() => M1NodeWorkspace({ projectId: 'project-1', taskId: 'task-1' }));
    expect(text(tree)).toContain('节点不可读取');
    expect(elements(tree).some(item => item.props.href === '/dashboard?project=project-1&taskId=task-1')).toBe(true);
    retry('重新加载'); await flush(() => M1NodeWorkspace({ projectId: 'project-1', taskId: 'task-1' }));
    expect(api.context).toHaveBeenCalledTimes(2);
  });
  it('carries project list filters through a tracking-node visit and its return', async () => {
    route.search = 'from=list&tab=tracking&listKeyword=灰色&listStage=MASS_PRODUCTION&listPage=3';
    api.context.mockResolvedValue(null);
    await flush(() => {
      const page = ColorProjectOverview({ projectId: 'project-1' });
      return (page.type as (props: { projectId: string }) => ReactNode)(page.props);
    });
    const link = elements(tree).find(item => item.type === 'a' && text(item.props.children as ReactNode) === '查看记录');
    expect(link?.props.href).toBe('/projects/project-1/tasks/task-1?from=project&tab=tracking&listKeyword=%E7%81%B0%E8%89%B2&listStage=MASS_PRODUCTION&listPage=3');
    expect(nodeReturnHref('project-1', 'task-1', String(link?.props.href).split('?')[1]!)).toContain('tab=tracking&taskId=task-1&listKeyword=%E7%81%B0%E8%89%B2&listStage=MASS_PRODUCTION&listPage=3&from=list');
  });
});
