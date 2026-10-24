import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../lib/auth-client', () => ({ apiRequest: vi.fn() }));
import { apiRequest } from '../../lib/auth-client';
import { loadInspectionColors, loadInspectionProjects, projectColorScope, readProjectColorScope } from './query-scope';

const detail = { id: 'project-1', name: '合成项目', primaryColorId: 'color-1', colorId: 'color-1',
  colorName: '合成颜色', productionBaseId: 'base-1', productionBaseName: '合成基地' };

describe('inspection queries from an explicit project color', () => {
  beforeEach(() => vi.clearAllMocks());
  it('uses the exact primary color and its base, not the project review link', async () => {
    vi.mocked(apiRequest).mockResolvedValue(detail);
    const signal = new AbortController().signal;
    expect(await readProjectColorScope('project-1', signal)).toEqual({ projectId: 'project-1', colorId: 'color-1', baseId: 'base-1',
      label: '合成项目 · 合成颜色 · 合成基地' });
    expect(apiRequest).toHaveBeenCalledExactlyOnceWith('/projects/project-1', { signal });
  });
  it.each([
    { ...detail, primaryColorId: null },
    { ...detail, colorId: 'display-fallback' },
    { ...detail, productionBaseId: null },
    { ...detail, id: 'different-project' },
  ])('rejects incomplete or mismatched associations without a global fallback', value => {
    expect(() => projectColorScope('project-1', value)).toThrow('不能据名称推测');
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it.each([new Error('403'), new DOMException('timed out', 'TimeoutError')])('preserves failed project reads without querying activities', async error => {
    vi.mocked(apiRequest).mockRejectedValue(error);
    await expect(readProjectColorScope('project-1', new AbortController().signal)).rejects.toBe(error);
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });
  it('bounds and encodes each choice page and keeps its request cancellation signal', async () => {
    const signal = new AbortController().signal;
    vi.mocked(apiRequest).mockResolvedValueOnce({ items: [{ id: 'p', name: '项目', code: 'P', colorName: null }], totalPages: 3 });
    expect((await loadInspectionProjects('A & B', '2', signal)).next).toBe('3');
    vi.mocked(apiRequest).mockResolvedValueOnce({ items: [{ id: 'c', name: '颜色', formalCode: '00017', base: { name: '基地' } }], total: 21 });
    expect((await loadInspectionColors('base/1', '蓝色', null, signal)).next).toBe('2');
    const calls = vi.mocked(apiRequest).mock.calls;
    expect(Object.fromEntries(new URL(String(calls[0]![0]), 'http://localhost').searchParams)).toEqual({ page: '2', pageSize: '20', keyword: 'A & B' });
    expect(Object.fromEntries(new URL(String(calls[1]![0]), 'http://localhost').searchParams)).toEqual({ page: '1', pageSize: '20', search: '蓝色', baseId: 'base/1' });
    expect(calls.every(call => call[1]?.signal === signal)).toBe(true);
  });
  it('distinguishes same-name colors using the color-register base contract', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ items: [
      { id: 'color-hq', name: '新汉玉白', formalCode: null, base: { name: '新港本部' } },
      { id: 'color-sd', name: '新汉玉白', formalCode: null, base: { name: '山东青州' } },
      { id: 'color-unassigned', name: '待关联颜色', formalCode: '00017', base: null },
    ], total: 3 });
    expect(await loadInspectionColors('', '新汉玉白', null, new AbortController().signal)).toEqual({ items: [
      { id: 'color-hq', label: '新汉玉白', detail: '新港本部 · 正式编号未填' },
      { id: 'color-sd', label: '新汉玉白', detail: '山东青州 · 正式编号未填' },
      { id: 'color-unassigned', label: '待关联颜色', detail: '基地未关联 · 00017' },
    ], next: null });
  });
});
