import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DateSystem, LocaleType, type ICellData, type IWorkbookData } from '@univerjs/core';
import { apiRequest } from '../../lib/auth-client';
import { PERSON_COLUMNS, personChanges } from '../person-sheet/person-adapter';
import { CATALOG_COLUMNS, previewCatalogImport } from '../color-register/sheet-exchange';
import { PRODUCTION_IMPORT_COLUMNS, prepareProductionImport, finalizeProductionImports, type ProductionFact } from '../production-sheet/production-adapter';
import { exchangeColumns, exchangeRows, prepareInspectionImport, finalizeInspectionPlans, type ImportBindings } from '../inspections/exchange';
import type { Snapshot } from '../inspections/client';
import { assertBusinessMappingCurrent, prepareBusinessMapping, BUSINESS_MAPPING_LIMITS, type BusinessMappingDefinition, type BusinessMappingSource } from './business-mapping';

vi.mock('../../lib/auth-client', () => ({ apiRequest: vi.fn() }));
const bookId = '572766eb-ecb3-49c4-9d34-9242236d976a';
function source(cells: Record<number, Record<number, ICellData>> = {}): BusinessMappingSource {
  const snapshot: IWorkbookData = { id: bookId, name: '合成映射', appVersion: '1.0.4', locale: LocaleType.ZH_CN, styles: {}, sheetOrder: ['first', 'chosen'], sheets: {
    first: { id: 'first', name: '非选中页', rowCount: 10, columnCount: 10, cellData: { 1: { 0: { v: '不要误选首页' } } } },
    chosen: { id: 'chosen', name: '人员原表', rowCount: 10000, columnCount: 256, cellData: cells },
  } };
  return { workbookId: bookId, formalRevision: 3, sourceSnapshotHash: 'a'.repeat(64), snapshot };
}
function definition(): BusinessMappingDefinition {
  return { target: { kind: 'person' }, sheetId: 'chosen', headerRow: 0, range: { startRow: 1, endRow: 3, startColumn: 0, endColumn: 3 }, fields: [{ column: 0, field: '__id' }, { column: 1, field: '__revision' }, { column: 2, field: 'name' }, { column: 3, field: 'note' }], clearFields: [] };
}
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
beforeEach(() => vi.clearAllMocks());

describe('explicit free workbook business mapping', () => {
  it('selects the named sheet and data region, preserves text identity and omits blank rows', async () => {
    const input = source({ 0: { 2: { v: '姓名' } }, 1: { 0: { v: 'person_A' }, 1: { v: 5 }, 2: { v: '合成人员甲' } }, 2: { 2: { v: '合成人员乙' } }, 4: { 2: { v: '选区外' } } });
    const preview = await prepareBusinessMapping(input, definition(), PERSON_COLUMNS);
    expect(preview.counts).toEqual({ newRecords: 1, existingRecords: 1, errors: 0, skippedBlankRows: 1 });
    expect(preview.rows[0]?.input).toMatchObject({ row: 2, id: 'person_A', revision: 5, values: { name: '合成人员甲', note: null }, source: { sheetName: '人员原表', rowNumbers: [2], fileName: '自由工作簿：合成映射' } });
    expect(preview.rows[1]?.input.id).toBeNull();
    expect(preview.rows[0]?.input.source.fileHash).toBe(preview.binding.fullJSONHash);
    expect(preview.binding.fullJSONHash).toMatch(/^[a-f\d]{64}$/);
    expect(preview.headers.find(header => header.field === 'name')?.text).toBe('姓名');
    expect(preview.requiresDomainValidation).toBe(true); expect(preview.includesImages).toBe(false);
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it('never merges same-name people or guesses their identities from source rows', async () => {
    const preview = await prepareBusinessMapping(source({ 1: { 2: { v: '同名合成人员' } }, 2: { 2: { v: '同名合成人员' } } }), definition(), PERSON_COLUMNS);
    expect(preview.rows.map(row => row.intent)).toEqual(['new-record', 'new-record']);
    expect(preview.rows.map(row => row.input.id)).toEqual([null, null]);
    expect(new Set(preview.rows.map(row => row.input.clientId)).size).toBe(2);
    expect(preview.rows.every(row => row.input.clientId.length <= 128)).toBe(true);
  });
  it('marks every duplicate ID and all missing/invalid revision cases as errors', async () => {
    const input = source({ 1: { 0: { v: 'same' }, 1: { v: 1 } }, 2: { 0: { v: 'same' }, 1: { v: 2 } }, 3: { 0: { v: 'other' } } });
    const preview = await prepareBusinessMapping(input, definition(), PERSON_COLUMNS);
    expect(preview.counts.errors).toBe(3);
    expect(preview.rows.slice(0, 2).every(row => row.input.errors.some(error => error.includes('重复')))).toBe(true);
    for (const value of [0, -1, 1.5, 'NaN', 2147483648]) {
      const result = await prepareBusinessMapping(source({ 1: { 0: { v: 'existing' }, 1: { v: value } } }), definition(), PERSON_COLUMNS);
      expect(result.rows[0]?.intent).toBe('error');
    }
  });
  it('rejects numeric IDs and orphan revisions instead of promoting rows to creates', async () => {
    const preview = await prepareBusinessMapping(source({ 1: { 0: { v: 12 }, 1: { v: 1 } }, 2: { 1: { v: 3 }, 2: { v: '无 ID' } } }), definition(), PERSON_COLUMNS);
    expect(preview.rows.every(row => row.intent === 'error')).toBe(true);
    expect(preview.rows[0]?.input.id).toBe('12'); // Kept for an error display, never used as a row-based identity.
  });
  it('preserves primitive and rich text semantics, raw cell types, and blank-vs-zero', async () => {
    const mapping = definition(); mapping.fields = [{ column: 2, field: 'name' }, { column: 3, field: 'note' }];
    const input = source({ 1: { 2: { v: false }, 3: { v: 0 } }, 2: { 2: { v: 'stale cache', p: { id: 'rich', body: { dataStream: '富文本\r\n', textRuns: [] }, documentStyle: {} } } }, 3: { 2: { v: '00123', t: 4 }, 3: { v: 45292, s: { n: { pattern: 'yyyy-mm-dd' } } } } });
    const preview = await prepareBusinessMapping(input, mapping, PERSON_COLUMNS);
    expect(preview.rows[0]?.input.values).toEqual({ name: 'false', note: '0' });
    expect(preview.rows[0]?.cellKinds).toEqual({ name: 'boolean', note: 'number' });
    expect(preview.rows[1]?.input.values.name).toBe('富文本'); expect(preview.rows[1]?.cellKinds.name).toBe('rich-text');
    expect(preview.rows[2]?.input.values).toEqual({ name: '00123', note: '45292' }); // No guessed date conversion.
  });
  it('rejects formulas, formula caches, error values and embedded links without altering source', async () => {
    const bad: ICellData[] = [{ f: '=SUM(A1:A2)', v: 99 }, { si: 'shared', v: 99 }, { v: ' =SUM(A1:A2)' }, { v: '#REF!' }, { v: 'link', custom: { hyperlink: 'https://example.invalid' } }, { p: { id: 'rich', body: { dataStream: '链接\r\n', customRanges: [{ rangeId: 'link', startIndex: 0, endIndex: 2, rangeType: 0 }] }, documentStyle: {} } }];
    for (const cell of bad) {
      const input = source({ 1: { 2: cell } }), before = JSON.stringify(input.snapshot);
      const preview = await prepareBusinessMapping(input, definition(), PERSON_COLUMNS);
      expect(preview.rows[0]?.intent).toBe('error'); expect(JSON.stringify(input.snapshot)).toBe(before);
    }
  });
  it('rejects merged data cells instead of filling down or duplicating top-left values', async () => {
    const input = source({ 1: { 2: { v: '合并姓名' } } }); input.snapshot.sheets.chosen!.mergeData = [{ startRow: 1, endRow: 2, startColumn: 2, endColumn: 3 }];
    const preview = await prepareBusinessMapping(input, definition(), PERSON_COLUMNS);
    expect(preview.counts.errors).toBe(2); expect(preview.rows.every(row => row.input.errors.some(error => error.includes('合并区域')))).toBe(true);
  });
  it('reads sparse bottom-right data with an explicit small region, including hidden rows', async () => {
    const input = source({ 9999: { 255: { v: '末行合成人员' } } }); input.snapshot.sheets.chosen!.rowData = { 9999: { hd: 1 } };
    const mapping = { ...definition(), headerRow: 9998, range: { startRow: 9999, endRow: 9999, startColumn: 255, endColumn: 255 }, fields: [{ column: 255, field: 'name' }] };
    const preview = await prepareBusinessMapping(input, mapping, PERSON_COLUMNS);
    expect(preview.rows[0]?.input.row).toBe(10000); expect(preview.counts.newRecords).toBe(1);
    expect(Object.keys(input.snapshot.sheets.chosen!.cellData ?? {})).toEqual(['9999']);
  });
  it('requires explicit safe fields, unique columns, data below header, and mapped clear fields', async () => {
    const variants: BusinessMappingDefinition[] = [
      { ...definition(), sheetId: 'missing' }, { ...definition(), headerRow: 2 },
      { ...definition(), fields: [{ column: 4, field: 'name' }] },
      { ...definition(), fields: [{ column: 2, field: 'name' }, { column: 3, field: 'name' }] },
      { ...definition(), fields: [{ column: 2, field: 'name' }, { column: 2, field: 'note' }] },
      { ...definition(), fields: [{ column: 2, field: 'isSystemAdmin' }] },
      { ...definition(), fields: [{ column: 2, field: '__proto__' }] },
      { ...definition(), clearFields: ['__id'] }, { ...definition(), clearFields: ['mobile'] },
    ];
    for (const mapping of variants) await expect(prepareBusinessMapping(source(), mapping, PERSON_COLUMNS)).rejects.toThrow();
    await expect(prepareBusinessMapping(source(), definition(), [{ key: 'constructor', label: '危险字段' }])).rejects.toThrow();
  });
  it('bounds source bytes and selected rows/columns before iterating data', async () => {
    for (const range of [{ startRow: 1, endRow: 2001, startColumn: 0, endColumn: 3 }, { startRow: 1, endRow: 3, startColumn: 0, endColumn: 100 }]) await expect(prepareBusinessMapping(source(), { ...definition(), range }, PERSON_COLUMNS)).rejects.toThrow('单次映射');
    const large = source({ 1: { 2: { v: 'x'.repeat(BUSINESS_MAPPING_LIMITS.snapshotBytes) } } });
    await expect(prepareBusinessMapping(large, definition(), PERSON_COLUMNS)).rejects.toThrow('大小上限');
    await expect(prepareBusinessMapping(source({ 1: { 2: { v: Number.NaN } } }), definition(), PERSON_COLUMNS)).rejects.toThrow('JSON');
  });
});

describe('preview source binding and apply guard', () => {
  it('binds opaque formal hash separately from full JSON hash and guards unchanged input synchronously', async () => {
    const input = source({ 1: { 2: { v: '合成人员' } } }), mapping = definition();
    const preview = await prepareBusinessMapping(input, mapping, PERSON_COLUMNS);
    expect(preview.binding.sourceSnapshotHash).not.toBe(preview.binding.fullJSONHash);
    expect(assertBusinessMappingCurrent(preview, input, mapping, PERSON_COLUMNS)).toBeUndefined();
    expect(Object.isFrozen(preview.rows[0]?.input.values)).toBe(true);
    expect(() => { preview.rows[0]!.input.values.name = '篡改预览'; }).toThrow();
    expect(() => assertBusinessMappingCurrent(clone(preview), input, mapping, PERSON_COLUMNS)).toThrow('重新预览');
  });
  it('invalidates changed values, insertion/deletion/sort, other sheets, sheet order, styles and resources', async () => {
    const input = source({ 1: { 2: { v: '甲' } }, 2: { 2: { v: '乙' } } }), mapping = definition();
    const preview = await prepareBusinessMapping(input, mapping, PERSON_COLUMNS);
    const edits: Array<(value: BusinessMappingSource) => void> = [
      value => { value.snapshot.sheets.chosen!.cellData![1]![2]!.v = '改值'; },
      value => { value.snapshot.sheets.chosen!.rowCount = 9999; },
      value => { delete value.snapshot.sheets.chosen!.cellData![1]; },
      value => { const cells = value.snapshot.sheets.chosen!.cellData!; [cells[1], cells[2]] = [cells[2]!, cells[1]!]; },
      value => { value.snapshot.sheets.first!.cellData![1]![0]!.v = '其他页修改'; },
      value => { value.snapshot.sheetOrder.reverse(); },
      value => { value.snapshot.styles.changed = { bl: 1 }; },
      value => { value.snapshot.resources = [{ name: 'SHEET_DRAWING_PLUGIN', data: '{}' }]; },
    ];
    for (const edit of edits) { const changed = clone(input); edit(changed); expect(() => assertBusinessMappingCurrent(preview, changed, mapping, PERSON_COLUMNS)).toThrow('重新预览'); }
  });
  it('invalidates formal versions/hashes, mapping, range, header, clears, dictionaries and target defaults', async () => {
    const input = source(), mapping = definition(), preview = await prepareBusinessMapping(input, mapping, PERSON_COLUMNS);
    for (const changed of [{ ...input, formalRevision: 4 }, { ...input, sourceSnapshotHash: 'b'.repeat(64) }, { ...input, workbookId: '672766eb-ecb3-49c4-9d34-9242236d976a' }]) expect(() => assertBusinessMappingCurrent(preview, changed, mapping, PERSON_COLUMNS)).toThrow();
    for (const changed of [{ ...mapping, fields: mapping.fields.slice(1) }, { ...mapping, range: { ...mapping.range, endRow: 2 } }, { ...mapping, clearFields: ['note'] }, { ...mapping, target: { kind: 'color' as const } }]) expect(() => assertBusinessMappingCurrent(preview, input, changed, PERSON_COLUMNS)).toThrow('重新预览');
    expect(() => assertBusinessMappingCurrent(preview, input, mapping, PERSON_COLUMNS.slice(1))).toThrow();
    const production: BusinessMappingDefinition = { ...mapping, target: { kind: 'production', colorId: null, baseId: null } };
    const selected = await prepareBusinessMapping(input, production, PERSON_COLUMNS);
    expect(() => assertBusinessMappingCurrent(selected, input, { ...production, target: { kind: 'production', colorId: 'color1', baseId: 'base1' } }, PERSON_COLUMNS)).toThrow('重新预览');
  });
  it('captures an immutable input before hashing; edits while hashing cannot sneak into its preview', async () => {
    const input = source({ 1: { 2: { v: '原值' } } }), mapping = definition();
    const waiting = prepareBusinessMapping(input, mapping, PERSON_COLUMNS);
    input.snapshot.sheets.chosen!.cellData![1]![2]!.v = '后来输入'; mapping.clearFields = ['note'];
    const preview = await waiting;
    expect(preview.rows[0]?.input.values.name).toBe('原值'); expect(preview.definition.clearFields).toEqual([]);
    expect(() => assertBusinessMappingCurrent(preview, input, mapping, PERSON_COLUMNS)).toThrow('重新预览');
  });
  it('does not derive business identity or commands from a repeat preview or changed row order', async () => {
    const input = source({ 1: { 2: { v: '甲' } }, 2: { 2: { v: '乙' } } }), mapping = definition();
    const first = await prepareBusinessMapping(input, mapping, PERSON_COLUMNS), repeated = await prepareBusinessMapping(input, mapping, PERSON_COLUMNS);
    expect(first.rows.map(row => row.input.clientId)).toEqual(repeated.rows.map(row => row.input.clientId));
    input.snapshot.sheets.chosen!.cellData = { 1: { 2: { v: '乙' } }, 2: { 2: { v: '甲' } } };
    const reordered = await prepareBusinessMapping(input, mapping, PERSON_COLUMNS);
    expect(reordered.rows[0]?.input.clientId).not.toBe(first.rows[0]?.input.clientId);
    expect(reordered.rows.every(row => row.input.id === null)).toBe(true); expect(apiRequest).not.toHaveBeenCalled();
  });
});

describe('existing domain contracts remain authoritative', () => {
  const fact: ProductionFact = { id: 'fact1', revision: 4, colorId: 'color1', colorName: '合成绿', colorCode: 'SYN', baseId: 'base1', baseName: '合成基地', month: '2026-09', quantity: '20', unit: '台', metricScope: 'MONTH_TOTAL', metricScopeLabel: '月度实际总量（全车型，不分产线和班次）', rowKind: 'MONTH_TOTAL', editable: true, originalSource: null };
  const context = () => ({ facts: new Map([[fact.id, fact]]), colors: [{ id: 'color1', name: '合成绿', base: { id: 'base1', name: '合成基地' } }], chosenBaseId: 'base1', chosenColorId: 'color1' });
  it.each([[undefined, 46296, 'yyyy-m'], [DateSystem.Date1900, 46296, 'yyyy-mm'], [DateSystem.Date1904, 44834, 'yyyy-mm']] as const)('maps an explicitly formatted month in date system %s without changing captured source', async (dateSystem, serial, pattern) => {
    const input = source({ 1: { 0: { v: serial, t: 2, s: 'monthStyle' }, 1: { v: 10 }, 2: { v: 'MONTH_TOTAL' } } });
    if (dateSystem !== undefined) input.snapshot.dateSystem = dateSystem;
    input.snapshot.styles.monthStyle = { n: { pattern } };
    const before = JSON.stringify(input.snapshot);
    const mapping: BusinessMappingDefinition = { ...definition(), target: { kind: 'production', baseId: 'base1', colorId: 'color1' }, fields: [{ column: 0, field: 'month' }, { column: 1, field: 'quantity' }, { column: 2, field: 'rowKind' }] };
    const preview = await prepareBusinessMapping(input, mapping, PRODUCTION_IMPORT_COLUMNS);
    expect(preview.rows[0]?.input.values.month).toBe('2026-10');
    expect(preview.rows[0]?.cellKinds.month).toBe('number');
    expect(prepareProductionImport(preview.rows[0]!.input, [], context())).toMatchObject({ status: 'create', data: { month: '2026-10', quantity: 10 } });
    expect(JSON.stringify(input.snapshot)).toBe(before);
    expect(() => assertBusinessMappingCurrent(preview, input, mapping, PRODUCTION_IMPORT_COLUMNS)).not.toThrow();
    input.snapshot.styles.monthStyle!.n!.pattern = 'yyyy/mm/dd';
    expect(() => assertBusinessMappingCurrent(preview, input, mapping, PRODUCTION_IMPORT_COLUMNS)).toThrow('重新预览');
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it.each([undefined, 'General', 'yyyy/mm/dd', 'mm:ss', '[Red]yyyy-mm', 'yyyy-mm;@'])('does not guess an ambiguous numeric month format %s', async pattern => {
    const input = source({ 1: { 0: { v: 46296, ...(pattern ? { s: { n: { pattern } } } : {}) }, 2: { v: 'MONTH_TOTAL' } } });
    const mapping: BusinessMappingDefinition = { ...definition(), target: { kind: 'production', baseId: 'base1', colorId: 'color1' }, fields: [{ column: 0, field: 'month' }, { column: 2, field: 'rowKind' }] };
    const preview = await prepareBusinessMapping(input, mapping, PRODUCTION_IMPORT_COLUMNS);
    expect(preview.rows[0]?.input.values.month).toBe('46296');
    expect(prepareProductionImport(preview.rows[0]!.input, [], context()).status).toBe('error');
  });
  it.each([0, 60, -1, 46296.5, 2958466, 1568704638905, Number.MAX_SAFE_INTEGER])('rejects pseudo dates, hidden time and out-of-range serial %s', async serial => {
    const input = source({ 1: { 0: { v: serial, s: { n: { pattern: 'yyyy-m' } } } } });
    const mapping: BusinessMappingDefinition = { ...definition(), target: { kind: 'production', baseId: 'base1', colorId: 'color1' }, fields: [{ column: 0, field: 'month' }] };
    const preview = await prepareBusinessMapping(input, mapping, PRODUCTION_IMPORT_COLUMNS);
    expect(preview.rows[0]?.intent).toBe('error');
  });
  it.each([[0, '1904-01'], [2957003, '9999-12'], [2957004, null], [1568704637443, null], [Number.MAX_SAFE_INTEGER, null]] as const)('bounds the 1904 month serial %s before conversion', async (serial, expected) => {
    const input = source({ 1: { 0: { v: serial, s: { n: { pattern: 'yyyy-mm' } } } } });
    input.snapshot.dateSystem = DateSystem.Date1904;
    const mapping: BusinessMappingDefinition = { ...definition(), target: { kind: 'production', baseId: 'base1', colorId: 'color1' }, fields: [{ column: 0, field: 'month' }] };
    const preview = await prepareBusinessMapping(input, mapping, PRODUCTION_IMPORT_COLUMNS);
    if (expected) expect(preview.rows[0]?.input.values.month).toBe(expected);
    else expect(preview.rows[0]?.intent).toBe('error');
  });
  it('keeps month-styled IDs numeric and rejects formula caches before month normalization', async () => {
    const input = source({ 1: { 0: { v: 46296, s: { n: { pattern: 'yyyy-m' } } }, 1: { v: 1 }, 2: { v: 46296, f: '=TODAY()', s: { n: { pattern: 'yyyy-m' } } } } });
    const mapping: BusinessMappingDefinition = { ...definition(), target: { kind: 'production', baseId: 'base1', colorId: 'color1' }, fields: [{ column: 0, field: '__id' }, { column: 1, field: '__revision' }, { column: 2, field: 'month' }] };
    const preview = await prepareBusinessMapping(input, mapping, PRODUCTION_IMPORT_COLUMNS);
    expect(preview.rows[0]?.cellKinds.__id).toBe('number');
    expect(preview.rows[0]?.input.errors.join(' ')).toMatch(/公式/);
    expect(preview.rows[0]?.input.errors.join(' ')).toMatch(/记录 ID/);
    expect(preview.rows[0]?.intent).toBe('error');
  });
  it('feeds production ID/revision updates into the real adapter without incrementing or bypassing conflicts', async () => {
    const mapping: BusinessMappingDefinition = { ...definition(), target: { kind: 'production', baseId: 'base1', colorId: 'color1' }, fields: [{ column: 0, field: '__id' }, { column: 1, field: '__revision' }, { column: 2, field: 'quantity' }] };
    const preview = await prepareBusinessMapping(source({ 1: { 0: { v: 'fact1' }, 1: { v: 4 }, 2: { v: 0 } }, 2: { 0: { v: 'unknown' }, 1: { v: 1 }, 2: { v: 5 } } }), mapping, PRODUCTION_IMPORT_COLUMNS);
    const update = prepareProductionImport(preview.rows[0]!.input, [], context());
    expect(update).toMatchObject({ status: 'update', data: { kind: 'update', id: 'fact1', expectedRevision: 4, quantity: 0 } });
    expect(prepareProductionImport(preview.rows[1]!.input, [], context()).status).toBe('error');
    expect(prepareProductionImport(preview.rows[0]!.input, [], { ...context(), facts: new Map([[fact.id, { ...fact, revision: 5 }]]) }).status).toBe('error');
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it('preserves production new-record scope, duplicate-grain rejection and unknown quantity semantics', async () => {
    const mapping: BusinessMappingDefinition = { ...definition(), target: { kind: 'production', baseId: 'base1', colorId: 'color1' }, fields: [{ column: 0, field: 'month' }, { column: 1, field: 'quantity' }, { column: 2, field: 'rowKind' }] };
    const preview = await prepareBusinessMapping(source({ 1: { 0: { v: '2026-10' }, 2: { v: 'MONTH_TOTAL' } }, 2: { 0: { v: '2026-10' }, 1: { v: 20 }, 2: { v: 'MONTH_TOTAL' } }, 3: { 0: { v: '2026-11' }, 1: { v: 20 }, 2: { v: '合计' } } }), mapping, PRODUCTION_IMPORT_COLUMNS);
    const plans = preview.rows.map(row => prepareProductionImport(row.input, [], context()));
    expect(plans[0]).toMatchObject({ status: 'create', data: { quantity: null, colorId: 'color1', baseId: 'base1' } });
    expect(finalizeProductionImports(plans).every(plan => plan.status === 'error')).toBe(true);
  });
  it('keeps empty updates distinct from explicitly selected clears in the actual production adapter', async () => {
    const mapping: BusinessMappingDefinition = { ...definition(), target: { kind: 'production', baseId: 'base1', colorId: 'color1' }, fields: [{ column: 0, field: '__id' }, { column: 1, field: '__revision' }, { column: 2, field: 'quantity' }] };
    const preview = await prepareBusinessMapping(source({ 1: { 0: { v: 'fact1' }, 1: { v: 4 } } }), mapping, PRODUCTION_IMPORT_COLUMNS);
    expect(prepareProductionImport(preview.rows[0]!.input, [], context()).status).toBe('unchanged');
    expect(prepareProductionImport(preview.rows[0]!.input, ['quantity'], context())).toMatchObject({ status: 'update', data: { quantity: null } });
  });
  it('keeps ambiguous departments as errors and does not grant personnel roles', async () => {
    const mapping = { ...definition(), fields: [{ column: 2, field: 'name' }, { column: 3, field: 'departmentName' }] };
    const preview = await prepareBusinessMapping(source({ 1: { 2: { v: '合成人员' }, 3: { v: '同名部门' } } }), mapping, PERSON_COLUMNS);
    expect(() => personChanges(preview.rows[0]!.input.values, [{ id: 'dept1', name: '同名部门' }, { id: 'dept2', name: '同名部门' }])).toThrow('不唯一');
    expect(preview.requiresDomainValidation).toBe(true); expect(apiRequest).not.toHaveBeenCalled();
  });
  it('reuses real inspection object/color bindings and duplicate rules without advancing review', async () => {
    const snapshot: Snapshot = { activity: { id: 'activity1', revision: 2, activityDate: '2026-10-20', productionBaseId: 'base1', productionBase: { id: 'base1', name: '合成基地' }, batchLabel: null, note: null, projectId: null, recurringTaskId: null, reviewRecordId: null, reviewRecord: null }, occurrences: [], measurements: [], readings: [], defects: [] };
    const bindings: ImportBindings = { standards: [], standardVersionId: '', objectId: 'object1', colorId: 'color1', occurrenceId: '', measurementId: '',
      objects: [{ id: 'object1', objectCode: 'SYN-01', objectKind: 'SAMPLE', vin: null, vehicleModel: null, vehicleClass: null, revision: 1, sampleId: null }], colors: [{ id: 'color1', name: '合成绿', formalCode: null, boardCode: null }] };
    const mapping: BusinessMappingDefinition = { ...definition(), target: { kind: 'inspection', activityId: 'activity1', layer: 'occurrence', objectId: 'object1', colorId: 'color1', occurrenceId: null, measurementId: null, standardVersionId: null }, fields: [{ column: 2, field: 'note' }] };
    const input = source({ 1: { 2: { v: '合成记录甲' } }, 2: { 2: { v: '合成记录乙' } } }), preview = await prepareBusinessMapping(input, mapping, exchangeColumns('occurrence'));
    const plans = preview.rows.map(row => prepareInspectionImport(snapshot, 'occurrence', exchangeRows(snapshot, 'occurrence'), bindings, row.input, []));
    expect(plans[0]).toMatchObject({ status: 'create', data: { kind: 'create', entity: 'occurrence', objectId: 'object1', colorId: 'color1', values: { overallConclusion: 'PENDING' } } });
    expect(finalizeInspectionPlans(plans).every(plan => plan.status === 'error')).toBe(true);
    expect(prepareInspectionImport(snapshot, 'occurrence', [], { ...bindings, objectId: '' }, preview.rows[0]!.input, []).status).toBe('error');
    snapshot.activity.reviewRecord = { id: 'review1', submittedAt: '2026-10-20T01:00:00Z', result: 'PENDING' };
    expect(prepareInspectionImport(snapshot, 'occurrence', [], bindings, preview.rows[0]!.input, []).status).toBe('error');
    const changedTarget: BusinessMappingDefinition = { ...mapping, target: { ...mapping.target as Extract<BusinessMappingDefinition['target'], { kind: 'inspection' }>, activityId: 'activity2' } };
    expect(() => assertBusinessMappingCurrent(preview, input, changedTarget, exchangeColumns('occurrence'))).toThrow('重新预览');
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it('retains numeric color cell types and never fabricates a system template to gain update permission', async () => {
    const columns = CATALOG_COLUMNS.filter(column => !['id', 'revision'].includes(column.field)).map(column => ({ key: column.field, label: column.label }));
    const mapping: BusinessMappingDefinition = { ...definition(), target: { kind: 'color' }, fields: [{ column: 2, field: 'name' }, { column: 3, field: 'boardCode' }] };
    const preview = await prepareBusinessMapping(source({ 1: { 2: { v: '合成绿' }, 3: { v: 123 } } }), mapping, columns);
    expect(preview.rows[0]?.cellKinds.boardCode).toBe('number'); expect(preview.rows[0]?.intent).toBe('new-record');
    expect('template' in preview).toBe(false);
    const catalog = previewCatalogImport({ fileName: '自由工作簿预览', template: false, sheets: [{ id: 'chosen', name: '人员原表', mergedRanges: [], rows: [[{ value: '颜色名称' }, { value: '色板编号' }], [{ value: '合成绿' }, { value: 123 }]] }] }, { sheetId: 'chosen', headerRow: 1, mapping: { 0: 'name', 1: 'boardCode' } }, []);
    expect(catalog.records[0]?.status).toBe('pending'); expect(catalog.canSubmit).toBe(false);
  });
});
