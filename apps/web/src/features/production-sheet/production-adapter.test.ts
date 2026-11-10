import { it } from 'vitest';
import assert from 'node:assert/strict';
import { emptyProductionFilters, finalizeProductionImports, parseProductionQuantity, prepareProductionImport, productionQuery, productionRow, productionSourceSummary, productionUpdates, validateProduction, type ProductionFact } from './production-adapter';
import type { ExchangeInput } from '../business-sheet/record-exchange';
it('validates production grain, identity, quantities and Excel roundtrip commands', () => {
const fact: ProductionFact = { id: 'fact-a', colorId: 'color-a', colorName: '同名蓝', colorCode: 'COL-A', baseId: 'base-a', baseName: '甲基地', month: '2026-10', quantity: '10', unit: '台', revision: 2, metricScope: 'MONTHLY_ACTUAL_TOTAL_V1', metricScopeLabel: '月度实际总量（全车型，不分产线和班次）', rowKind: 'MONTH_TOTAL', editable: true, originalSource: null };
const context = { facts: new Map([[fact.id, fact]]), colors: [{ id: 'color-a', name: '同名蓝', base: { id: 'base-a', name: '甲基地' } }, { id: 'color-b', name: '同名蓝', base: { id: 'base-b', name: '乙基地' } }], chosenBaseId: 'base-a', chosenColorId: 'color-a' };
const input = (values: Record<string, string | null>, options: Partial<ExchangeInput> = {}): ExchangeInput => ({ row: 2, clientId: 'draft-2', id: fact.id, revision: 2, values, source: { fileName: '测试.xlsx', sheetName: '月度产量', rowNumbers: [2], fileHash: 'a'.repeat(64) }, errors: [], ...options });
let count = 0; const eq = (a: unknown, b: unknown) => { assert.deepEqual(a, b); count++; }; const throws = (fn: () => unknown) => { assert.throws(fn); count++; };
eq(parseProductionQuantity(null), null); eq(parseProductionQuantity(''), null); eq(parseProductionQuantity('0'), 0); eq(parseProductionQuantity('0008'), 8);
for (const value of ['-1', '1.5', '1e3', '1000000001', 'Infinity', '=1+1']) throws(() => parseProductionQuantity(value));
eq(productionUpdates([{ id: fact.id, expectedRevision: 2, changes: { quantity: '8' } }]), [{ kind: 'update', id: 'fact-a', expectedRevision: 2, quantity: 8 }]);
throws(() => productionUpdates([{ id: fact.id, expectedRevision: 2, changes: { quantity: '8', month: '2026-09' } }]));
eq(productionRow(fact).editable, ['quantity']); eq(productionRow(fact, false).editable, []); eq(productionRow({ ...fact, quantity: null }).values.quantity, null);
eq(validateProduction(productionRow(fact), 'quantity', '8'), undefined); assert(validateProduction(productionRow(fact), 'month', '2026-09')); count++;
eq(prepareProductionImport(input({ quantity: '8' }), [], context).data, { kind: 'update', id: 'fact-a', expectedRevision: 2, quantity: 8 });
eq(prepareProductionImport(input({ quantity: null }), [], context).status, 'unchanged'); eq(prepareProductionImport(input({ quantity: null }), ['quantity'], context).data, { kind: 'update', id: 'fact-a', expectedRevision: 2, quantity: null });
eq(prepareProductionImport(input({ quantity: '10' }), [], context).status, 'unchanged'); eq(prepareProductionImport(input({ quantity: '8', month: '2026-09' }), [], context).status, 'error');
eq(prepareProductionImport(input({ quantity: '8' }, { id: 'not-authorized' }), [], context).status, 'error'); eq(prepareProductionImport(input({ quantity: '8' }, { revision: 1 }), [], context).status, 'error');
eq(prepareProductionImport(input({ quantity: '8', photos: 'https://example.invalid/x.png' }), [], context).status, 'error');
const newInput = input({ month: '2026-11', quantity: '8', rowKind: 'MONTH_TOTAL' }, { id: null, revision: null });
const created = prepareProductionImport(newInput, [], context); eq(created.status, 'create'); eq((created.data as { colorId: string }).colorId, 'color-a');
eq(prepareProductionImport(input({ month: '2026-11', quantity: '8' }, { id: null, revision: null }), [], context).status, 'error');
eq(prepareProductionImport(input({ ...newInput.values, rowKind: '合计' }, { id: null, revision: null }), [], context).status, 'error');
eq(prepareProductionImport(input({ ...newInput.values, month: '2026-10' }, { id: null, revision: null }), [], context).status, 'error');
eq(prepareProductionImport(input({ ...newInput.values, colorId: 'color-b' }, { id: null, revision: null }), [], context).status, 'error');
eq(prepareProductionImport(input({ ...newInput.values, colorName: '其他颜色' }, { id: null, revision: null }), [], context).status, 'error');
eq(prepareProductionImport(newInput, [], { ...context, chosenBaseId: '', chosenColorId: '' }).status, 'error');
for (const values of [{ unit: '吨' }, { scope: '车间班次' }, { sourceSummary: '伪造来源' }, { colorCode: '未知编号' }] as Record<string, string | null>[]) eq(prepareProductionImport({ ...newInput, values: { ...newInput.values, ...values } }, [], context).status, 'error');
eq(finalizeProductionImports([created, { ...created, input: { ...created.input, clientId: 'draft-3' } }]).map(plan => plan.status), ['error', 'error']);
eq(finalizeProductionImports([created]).map(plan => plan.status), ['create']);
eq(productionQuery({ ...emptyProductionFilters, baseId: 'base-a', fromMonth: '2026-10', toMonth: '2026-10' }).toString(), 'baseId=base-a&fromMonth=2026-10&toMonth=2026-10');
throws(() => productionQuery({ ...emptyProductionFilters, fromMonth: '2026-13' })); throws(() => productionQuery({ ...emptyProductionFilters, fromMonth: '2026-10', toMonth: '2026-09' }));
console.log(JSON.stringify({ result: 'PASS', assertions: count, coverage: ['null differs from zero', 'bounded integer quantities', '10 to 8 keeps fact ID', 'only quantity writes', 'blank ignored / explicit clear', 'no-op import', 'protected fields', 'unknown ID no create fallback', 'revision conflict', 'explicit new monthly total grain', 'same-name colors use chosen stable IDs', 'duplicate grain', 'summary rows rejected', 'month filters'] }, null, 2));

});

it('keeps explicit model import identities and exported counting columns separate from original totals', () => {
  const context = { facts: new Map<string, ProductionFact>(), colors: [{ id: 'c', name: '合成色', base: { id: 'b', name: '基地' } }], chosenBaseId: 'b', chosenColorId: 'c' };
  const make = (model: string, rowKind = 'MODEL_DETAIL'): ExchangeInput => ({ row: 2, clientId: model, id: null, revision: null, errors: [],
    values: { month: '2026-10', quantity: '10', rowKind, vehicleModel: model }, source: { fileName: '合成.xlsx', sheetName: '车型', rowNumbers: [2], fileHash: 'a'.repeat(64) } });
  const a = prepareProductionImport(make('车型甲'), [], context), b = prepareProductionImport(make('车型乙'), [], context);
  assert.equal(a.status, 'create'); assert.equal(b.status, 'create');
  assert.deepEqual(finalizeProductionImports([a, b]).map(value => value.status), ['create', 'create']);
  assert.deepEqual(finalizeProductionImports([a, a]).map(value => value.status), ['error', 'error']);
  assert.equal(prepareProductionImport(make(''), [], context).status, 'error');
  assert.equal(prepareProductionImport(make('车型甲', 'MONTH_TOTAL'), [], context).status, 'error');
  const fact: ProductionFact = { id: 'f', colorId: 'c', colorName: '合成色', colorCode: '', baseId: 'b', baseName: '基地', month: '2026-10',
    quantity: '10', unit: '台', revision: 1, metricScope: 'MONTHLY_MODEL_DETAIL_V1', metricScopeLabel: '车型明细', rowKind: 'MODEL_DETAIL', vehicleModel: '车型甲',
    editable: true, originalSource: null, includedInOperationalTotal: false, effectiveQuantity: null, countingStatus: '保留对账，不计入统计' };
  const values = productionRow(fact).values;
  assert.equal(values.quantity, '10'); assert.equal(values.effectiveQuantity, null); assert.equal(values.vehicleModel, '车型甲');
  assert.equal(values.countingStatus, '保留对账，不计入统计');
  const update = { ...make('车型甲'), id: 'f', revision: 1, values: { ...values, quantity: '8' } };
  assert.equal(prepareProductionImport(update, [], { ...context, facts: new Map([['f', fact]]) }).status, 'update');
  assert.equal(prepareProductionImport({ ...update, values: { ...update.values, vehicleModel: '车型乙' } }, [], { ...context, facts: new Map([['f', fact]]) }).status, 'error');
});

it('keeps monthly facts usable when legacy provenance is incomplete, without changing the source or identity', () => {
  const source = Object.freeze({ synthetic: true, seed: 'annual-ui', purpose: '13-month-boundary' });
  const fact: ProductionFact = { id: 'legacy-fact', colorId: 'color-a', colorName: '合成颜色', colorCode: 'SYNTH', baseId: 'base-a', baseName: '合成基地', month: '2025-09', quantity: '20', unit: '台', revision: 3, metricScope: 'MONTHLY_ACTUAL_TOTAL_V1', metricScopeLabel: '月度实际总量', rowKind: 'MONTH_TOTAL', editable: true, originalSource: source };
  const row = productionRow(fact);
  assert.equal(row.id, fact.id); assert.equal(row.revision, 3); assert.equal(row.values.quantity, '20');
  assert.equal(row.meta?.originalSource, source); assert.equal(row.values.sourceSummary, '来源信息待核对');
  assert.deepEqual(row.editable, ['quantity']);
  assert.equal(productionSourceSummary({fileName: '合成.xlsx', sheetName: '产量', rowNumbers: [2, 4]}), '合成.xlsx / 产量 / 2、4');
  assert.equal(productionSourceSummary(null), null);
  for (const invalid of [false, 1, 'source', [], {}, {fileName: 'a.xlsx', sheetName: '产量'}, {fileName: 'a.xlsx', sheetName: '产量', rowNumbers: ['2']}, {fileName: 'a.xlsx', sheetName: '产量', rowNumbers: [0]}, {fileName: 'a.xlsx', sheetName: '产量', rowNumbers: [1048577]}, {fileName: 'a.xlsx', sheetName: '产量', rowNumbers: Array(201).fill(1)}]) assert.equal(productionSourceSummary(invalid), '来源信息待核对');
});
