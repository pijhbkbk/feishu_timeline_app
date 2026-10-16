import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { parseSheetChanges } from './color-register.rules';

const request = (changes: Record<string, unknown>) => ({ operationId: 'sheet-command-1', items: [{ id: 'color_1', expectedRevision: 3, changes }] });

describe('color sheet command input boundary', () => {
  it('retains literal Chinese text, leading-zero board codes, and explicit null separately from omitted fields', () => {
    expect(parseSheetChanges(request({ note: '中文\n保留 0001', boardCode: '0000123', registerMonth: '2026-01', manufacturer: null }))).toEqual({
      operationId: 'sheet-command-1', reason: null, items: [{ id: 'color_1', expectedRevision: 3, changes: { note: '中文\n保留 0001', boardCode: '0000123', manufacturer: null, registerMonth: '2026-01' } }],
    });
    expect(parseSheetChanges(request({ note: null })).items[0]!.changes).not.toHaveProperty('boardCode');
  });

  it.each(['name', 'base', 'productionBaseId', 'formalCode', 'registerStatus', 'currentStandardVersionId', 'id', 'revision', 'technicalData', 'sourceReference'])('rejects the controlled field %s rather than silently ignoring it', field => {
    expect(() => parseSheetChanges(request({ note: '合法值', [field]: 'forged' }))).toThrow();
  });

  it('rejects unknown command and item fields and empty changes', () => {
    expect(() => parseSheetChanges({ ...request({ note: 'x' }), actorId: 'someone-else' })).toThrow();
    expect(() => parseSheetChanges({ operationId: 'op', items: [{ id: 'c', expectedRevision: 1, changes: { note: 'x' }, version: 2 }] })).toThrow();
    expect(() => parseSheetChanges(request({}))).toThrow();
  });

  it.each([
    { note: 3 }, { note: undefined }, { note: 'a'.repeat(4001) }, { note: 'a\0b' },
    { boardCode: 123 }, { boardCode: { f: '=1+1', v: '2' } }, { boardCode: 'x'.repeat(129) },
    { manufacturer: 'x'.repeat(201) }, { paintType: ['水性'] }, { registerMonth: '2026-13' }, { registerMonth: '0000-01' },
  ])('rejects invalid typed or oversized field values and identifies their record', changes => {
    try { parseSheetChanges(request(changes)); throw new Error('expected rejection'); }
    catch (error) { expect((error as { getResponse: () => unknown }).getResponse()).toMatchObject({ colorId: 'color_1' }); }
  });

  it('bounds batches, rejects duplicate identities, validates revision, and canonicalizes ID order', () => {
    const row = { id: 'z', expectedRevision: 1, changes: { note: 'x' } };
    for (const items of [[], [row, row], Array.from({ length: 51 }, (_, i) => ({ ...row, id: `c${i}` }))]) {
      expect(() => parseSheetChanges({ operationId: 'op', items })).toThrow();
    }
    for (const revision of [0, -1, 1.5, '1', 2147483648]) expect(() => parseSheetChanges({ operationId: 'op', items: [{ ...row, expectedRevision: revision }] })).toThrow();
    expect(parseSheetChanges({ operationId: 'op', reason: '  依据新标准  ', items: [row, { ...row, id: 'a' }] })).toMatchObject({ reason: '依据新标准', items: [{ id: 'a' }, { id: 'z' }] });
  });
});
