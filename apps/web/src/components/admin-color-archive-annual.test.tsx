import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// Drive the actual effect/load callback; only the renderer and HTTP boundary are replaced.
const hooks = vi.hoisted(() => ({ slots: [] as unknown[], index: 0, effects: [] as Array<() => void>, cleanups: new Map<number, () => void>(), dirty: false }));
const request = vi.hoisted(() => vi.fn());
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return { ...actual,
    useState: <T,>(initial: T) => {
      const index = hooks.index++;
      if (!(index in hooks.slots)) hooks.slots[index] = initial;
      return [hooks.slots[index], (value: T) => { if (!Object.is(hooks.slots[index], value)) { hooks.slots[index] = value; hooks.dirty = true; } }];
    },
    useEffect: (effect: () => void | (() => void), deps: unknown[]) => {
      const index = hooks.index++, previous = hooks.slots[index] as unknown[] | undefined;
      if (previous?.length === deps.length && previous.every((value, at) => Object.is(value, deps[at]))) return;
      hooks.slots[index] = deps;
      hooks.effects.push(() => { hooks.cleanups.get(index)?.(); const cleanup = effect(); if (cleanup) hooks.cleanups.set(index, cleanup); else hooks.cleanups.delete(index); });
    },
  };
});
vi.mock('next/link', () => ({ default: 'a' }));
vi.mock('./auth-provider', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('../lib/admin-client', () => ({ fetchAdminColorArchive: request }));
vi.mock('../features/color-register/annual-review', () => ({ AnnualReviewPanel: ({ colorId }: { colorId: string }) => <section>独立年度记录 {colorId}</section> }));
vi.mock('./admin-color-database-r26', () => ({ formatColorStatus: (value: string) => value, formatDate: (value: string) => value }));
import { ApiRequestError } from '../lib/auth-client';
import { AdminColorArchiveR26 } from './admin-color-archive-r26';

beforeEach(() => { hooks.slots = []; hooks.index = 0; hooks.effects = []; hooks.cleanups = new Map(); hooks.dirty = false; request.mockReset(); });
afterEach(() => hooks.cleanups.forEach(cleanup => cleanup()));
async function renderLoaded(colorId = 'historical-color') {
  for (let attempt = 0; attempt < 10; attempt++) {
    hooks.index = 0; hooks.dirty = false;
    const html = renderToStaticMarkup(<AdminColorArchiveR26 colorId={colorId} />);
    hooks.effects.splice(0).forEach(effect => effect());
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    if (!hooks.dirty) return html;
  }
  throw new Error('Archive view did not settle.');
}
function expectIndependentContent(html: string) {
  expect(html).toContain('独立年度记录 historical-color');
  expect(html).toContain('返回颜色数据库');
}

it('keeps annual review available and describes only the missing development archive after its specific 404', async () => {
  request.mockRejectedValue(new ApiRequestError('颜色档案不存在。', 404));
  const html = await renderLoaded();
  expect(request).toHaveBeenCalledWith('historical-color');
  expect(html).toContain('role="status"');
  expect(html).toContain('未找到可展示的开发项目资料档案。');
  expect(html).not.toContain('颜色档案不存在。');
  expect(html).not.toContain('role="alert"');
  expectIndependentContent(html);
});

it('keeps annual review and return mounted while the legacy archive request is still loading', async () => {
  request.mockImplementation(() => new Promise(() => undefined));
  const html = await renderLoaded();
  expect(html).toContain('正在加载颜色档案');
  expect(html).not.toContain('未找到可展示的开发项目资料档案。');
  expectIndependentContent(html);
});

it.each([
  new ApiRequestError('无权访问该功能。', 403),
  new ApiRequestError('服务暂时不可用。', 500),
  new ApiRequestError('请求路径不存在。', 404),
  new ApiRequestError('颜色档案不存在。', 403),
  new Error('网络连接失败。'),
])('keeps unrelated HTTP/network failures as alerts: $message', async error => {
  request.mockRejectedValue(error);
  const html = await renderLoaded();
  expect(html).toContain('role="alert"');
  expect(html).toContain(error.message);
  expect(html).not.toContain('未找到可展示的开发项目资料档案。');
  expectIndependentContent(html);
});

it('renders a successfully loaded development archive without missing/error notice', async () => {
  request.mockResolvedValue({ name: '合成开发颜色', status: 'ACTIVE', code: 'SYNTH-COLOR', displayColor: null, completenessPercent: 0, vehicleModels: [], colorType: null, suppliers: [], firstProject: { name: '合成开发项目', code: 'SYNTH-PROJECT' }, projects: [], materialCount: 0, coveredSteps: 0, materialsHasMore: false, stages: [], unclassifiedMaterials: [] });
  const html = await renderLoaded();
  expect(html).toContain('合成开发颜色');
  expect(html).not.toContain('未找到可展示的开发项目资料档案。');
  expect(html).not.toContain('role="alert"');
  expectIndependentContent(html);
});

it.each([
  new ApiRequestError('颜色档案不存在。', 404),
  new ApiRequestError('无权访问该功能。', 403),
])('clears the previous archive when the reused route changes to a different color: $status', async error => {
  request.mockResolvedValueOnce({ name: '旧颜色开发档案', status: 'ACTIVE', code: 'SYNTH-OLD', displayColor: null, completenessPercent: 0, vehicleModels: [], colorType: null, suppliers: [], firstProject: { name: '旧项目', code: 'SYNTH-OLD-PROJECT' }, projects: [], materialCount: 0, coveredSteps: 0, materialsHasMore: false, stages: [], unclassifiedMaterials: [] });
  expect(await renderLoaded('old-color')).toContain('旧颜色开发档案');
  request.mockRejectedValueOnce(error);
  const html = await renderLoaded('new-color');
  expect(request).toHaveBeenLastCalledWith('new-color');
  expect(html).not.toContain('旧颜色开发档案');
  expect(html).not.toContain('SYNTH-OLD');
  expect(html).toContain('独立年度记录 new-color');
  expect(html).toContain('返回颜色数据库');
  if (error.status === 404) {
    expect(html).toContain('未找到可展示的开发项目资料档案。');
    expect(html).not.toContain('role="alert"');
  } else {
    expect(html).toContain('role="alert"');
    expect(html).toContain(error.message);
    expect(html).not.toContain('未找到可展示的开发项目资料档案。');
  }
});
