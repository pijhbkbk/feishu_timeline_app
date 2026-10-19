import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ values: [] as unknown[] }));
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return { ...actual, useState: (initial: unknown) => [state.values.length ? state.values.shift() : initial, vi.fn()], useEffect: () => undefined };
});
vi.mock('./auth-provider', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('../features/color-register/annual-review', () => ({ AnnualReviewPanel: ({ colorId }: { colorId: string }) => <section>独立年度记录 {colorId}</section> }));
vi.mock('./admin-color-database-r26', () => ({ formatColorStatus: (value: string) => value, formatDate: (value: string) => value }));
import { AdminColorArchiveR26 } from './admin-color-archive-r26';

it('keeps annual review available when a historical register color has no legacy development archive', () => {
  state.values = [null, false, '颜色档案不存在。'];
  const html = renderToStaticMarkup(<AdminColorArchiveR26 colorId="historical-color" />);
  expect(html).toContain('颜色档案不存在。');
  expect(html).toContain('独立年度记录 historical-color');
  expect(html).toContain('返回颜色数据库');
});

it('keeps annual review and return mounted while the legacy archive request is still loading', () => {
  state.values = [null, true, null];
  const html = renderToStaticMarkup(<AdminColorArchiveR26 colorId="historical-color" />);
  expect(html).toContain('正在加载颜色档案');
  expect(html).toContain('独立年度记录 historical-color');
  expect(html).toContain('返回颜色数据库');
});
