import { beforeEach, expect, it, vi } from 'vitest';
import { apiRequest } from '../../lib/auth-client';
import { readCatalog } from '../color-register/sheet-client';
import { readPersons } from '../person-sheet/person-adapter';
import { readProductionFacts } from '../production-sheet/production-adapter';
import { readSnapshot } from '../inspections/client';
import { loadMappingContext } from './mapping-context';
vi.mock('../../lib/auth-client', async original => ({ ...await original<typeof import('../../lib/auth-client')>(), apiRequest: vi.fn() }));
vi.mock('../color-register/sheet-client', () => ({ readCatalog: vi.fn() }));
vi.mock('../person-sheet/person-adapter', async original => ({ ...await original<typeof import('../person-sheet/person-adapter')>(), readPersons: vi.fn() }));
vi.mock('../production-sheet/production-adapter', async original => ({ ...await original<typeof import('../production-sheet/production-adapter')>(), readProductionFacts: vi.fn() }));
vi.mock('../inspections/client', async original => ({ ...await original<typeof import('../inspections/client')>(), readSnapshot: vi.fn() }));
beforeEach(() => { vi.clearAllMocks(); });
it('does not treat truncated directory/catalog as evidence of absence', async () => {
  vi.mocked(readPersons).mockResolvedValue({ items: [], departments: [], hasMore: true });
  await expect(loadMappingContext({ kind: 'person' }, AbortSignal.timeout(1000))).rejects.toThrow('上限');
  vi.mocked(readCatalog).mockResolvedValue({ items: [], total: 2001, totalPages: 41, page: 1, pageSize: 50, facets: { bases: [], statuses: [] } });
  await expect(loadMappingContext({ kind: 'color' }, AbortSignal.timeout(1000))).rejects.toThrow('上限');
});
it('uses server-side exact production filters and refuses partial matching facts', async () => {
  vi.mocked(readCatalog).mockResolvedValue({ items: [{ id: 'color', name: '合成色', base: { id: 'base', name: '合成基地' } }] as Awaited<ReturnType<typeof readCatalog>>['items'], total: 1, totalPages: 1, page: 1, pageSize: 50, facets: { bases: [], statuses: [] } });
  vi.mocked(readProductionFacts).mockResolvedValue({ items: [], total: 1, hasMore: true, page: 1, pageSize: 50, totalPages: 1, scope: 'MONTHLY_ACTUAL_TOTAL_V1', reconciliationFactCount: 0, reconciliationExcluded: true, unsupportedDimensions: [] });
  const signal = AbortSignal.timeout(1000); await expect(loadMappingContext({ kind: 'production', colorId: 'color', baseId: 'base' }, signal)).rejects.toThrow('范围超过');
  expect(readProductionFacts).toHaveBeenCalledWith({ colorId: 'color', baseId: 'base', fromMonth: '', toMonth: '' }, signal);
});
it('bounds standard dictionary before following any further pages and preserves explicit activity identity', async () => {
  vi.mocked(readSnapshot).mockResolvedValue({ activity: { id: 'activity' }, occurrences: [{ id: 'occ', colorId: 'color' }] } as Awaited<ReturnType<typeof readSnapshot>>);
  vi.mocked(apiRequest).mockResolvedValue({ versions: [], versionsTotal: 2001, versionsTotalPages: 41 });
  const signal = AbortSignal.timeout(1000);
  await expect(loadMappingContext({ kind: 'inspection', activityId: 'activity', layer: 'measurement', occurrenceId: 'occ', measurementId: null, objectId: null, colorId: null, standardVersionId: null }, signal)).rejects.toThrow('标准版本超过');
  expect(readSnapshot).toHaveBeenCalledWith('activity', signal); expect(apiRequest).toHaveBeenCalledTimes(1); expect(vi.mocked(apiRequest).mock.calls[0]![0]).toBe('/color-register/color?versionsPage=1&versionsPageSize=50');
});
