import { describe, expect, it } from 'vitest';
import { actualQuantity, parseProductionBatch, productionFilters } from './production-facts.rules';
const create = { kind: 'create', clientId: 'draft1', colorId: 'color1', baseId: 'base1', month: '2026-09', quantity: 10, rowKind: 'MONTH_TOTAL' };
describe('monthly production input contract', () => {
  it('preserves unknown versus confirmed zero', () => { expect(actualQuantity(null)).toBeNull(); expect(actualQuantity(0)).toBe(0); });
  it.each([undefined, '', '10', -1, 0.5, Number.NaN, 1000000001])('rejects invalid quantity %s', value => { expect(() => actualQuantity(value)).toThrow(); });
  it('updates the original fact and requires its client-visible revision', () => {
    expect(parseProductionBatch({ operationId: 'op1', items: [{ kind: 'update', id: 'fact1', expectedRevision: 3, quantity: 8 }] }).items[0]).toEqual({ kind: 'update', id: 'fact1', expectedRevision: 3, quantity: 8 });
    expect(() => parseProductionBatch({ operationId: 'op1', items: [{ kind: 'update', id: 'fact1', quantity: 8 }] })).toThrow();
  });
  it('rejects duplicate business keys even with different draft IDs', () => {
    expect(() => parseProductionBatch({ operationId: 'op1', items: [create, { ...create, clientId: 'draft2' }] })).toThrow(/重复/);
  });
  it.each(['DETAIL', 'SUBTOTAL', 'UNKNOWN', undefined])('does not add %s rows to an existing total', rowKind => {
    expect(() => parseProductionBatch({ operationId: 'op1', items: [{ ...create, quantity: 100 }, { ...create, clientId: '40', quantity: 40, rowKind }, { ...create, clientId: '60', quantity: 60, rowKind }] })).toThrow();
  });
  it('rejects identity mutation and arbitrary source or scope injection', () => {
    for (const field of ['metricScope', 'sourceRowId', 'colorId', 'baseId', 'month']) expect(() => parseProductionBatch({ operationId: 'op1', items: [{ kind: 'update', id: 'f1', expectedRevision: 1, quantity: 8, [field]: 'other' }] })).toThrow();
  });
  it('uses a calendar month without converting browser timezones', () => {
    expect(parseProductionBatch({ operationId: 'op1', items: [create] }).items[0]).toMatchObject({ month: '2026-09' });
    expect(() => parseProductionBatch({ operationId: 'op1', items: [{ ...create, month: '2026-13' }] })).toThrow();
    expect(() => productionFilters({ fromMonth: '2026-10', toMonth: '2026-09' })).toThrow();
  });
});
