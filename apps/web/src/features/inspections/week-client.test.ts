import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../lib/auth-client', () => ({apiRequest: vi.fn(async () => ({items: [], total: 0}))}));
import { apiRequest } from '../../lib/auth-client';
import { listActivities, readWeekStats } from './client';
const range = {fromDate: '2026-12-28', toDate: '2027-01-03'};
const query = (index: number) => new URL(String(vi.mocked(apiRequest).mock.calls[index]![0]), 'http://localhost');
describe('inspection server-scoped week queries', () => {
  beforeEach(() => vi.clearAllMocks());
  it('sends exactly the same date/base scope to paged records and server statistics', async () => {
    const signal = new AbortController().signal;
    await listActivities('base & one', 2, range, signal);await readWeekStats('base & one', range, signal);
    expect(query(0).pathname).toBe('/inspections/activities');expect(query(0).searchParams.get('page')).toBe('2');expect(query(0).searchParams.get('pageSize')).toBe('25');
    expect(query(1).pathname).toBe('/inspections/statistics');
    for (const index of [0, 1]) {
      expect(Object.fromEntries([...query(index).searchParams].filter(([key]) => !key.startsWith('page')))).toEqual({baseId: 'base & one', ...range});
      expect(vi.mocked(apiRequest).mock.calls[index]![1]?.signal).toBe(signal);
    }
    expect(apiRequest).toHaveBeenCalledTimes(2); // No whole-dataset fan-out or client slice.
  });
  it('retains the prior all-date daily activity mode', async () => {
    await listActivities('', 1);
    expect(Object.fromEntries(query(0).searchParams)).toEqual({page: '1', pageSize: '25'});
  });
});
