import { expect, it } from 'vitest';
import { dashboardProjectQuery } from './dashboard-query';
it('stays within the real project-list API maximum and omits empty search', () => {
  expect(dashboardProjectQuery('')).toBe('/projects?page=1&pageSize=50');
  const params = new URL(dashboardProjectQuery(' 合成 & 白 '), 'http://localhost').searchParams;
  expect(params.get('keyword')).toBe('合成 & 白');
  expect(params.get('pageSize')).toBe('50');
});
