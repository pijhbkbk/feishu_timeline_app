import { describe, expect, it, vi } from 'vitest';
import { readProductionFacts, emptyProductionFilters, type ProductionList } from './production-adapter';
const request = vi.hoisted(() => vi.fn());
vi.mock('../../lib/auth-client', () => ({ apiRequest: request }));
const page = (hash: string, id: string): ProductionList => ({ items: [{ id } as never], total: 2, page: 1, pageSize: 1, totalPages: 2, snapshotHash: hash,
  scope: '', reconciliationFactCount: 0, reconciliationExcluded: true, unsupportedDimensions: [] });
describe('production page counting consistency', () => {
  it('refuses mixing pages from two different basis/fact versions', async () => {
    request.mockReset().mockResolvedValueOnce(page('old', 'a')).mockResolvedValueOnce(page('new', 'b'));
    await expect(readProductionFacts(emptyProductionFilters, new AbortController().signal)).rejects.toThrow('口径改变');
  });
  it('retains distinct model records and original IDs when all pages share one version', async () => {
    request.mockReset().mockResolvedValueOnce(page('same', 'a')).mockResolvedValueOnce(page('same', 'b'));
    expect((await readProductionFacts(emptyProductionFilters, new AbortController().signal)).items.map(row => row.id)).toEqual(['a', 'b']);
  });
});
