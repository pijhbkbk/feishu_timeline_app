import { it } from 'vitest';
import assert from 'node:assert/strict';
import { RecordSheetModel, type RecordSheetRow } from './record-sheet-model';
it('preserves stable identity, atomic validation, CAS drafts and inverse history', () => {
const row = (id: string, quantity = '10', revision = 1): RecordSheetRow => ({ id, revision, values: { name: '同名', quantity, note: null, status: 'LOCKED' }, editable: ['quantity', 'note'] });
let count = 0;
const ok = (condition: unknown) => { assert(condition); count++; };
const eq = (actual: unknown, expected: unknown) => { assert.deepEqual(actual, expected); count++; };
const throws = (fn: () => unknown) => { assert.throws(fn); count++; };
const model = new RecordSheetModel([row('a'), row('b')], (_row, field, value) => field === 'quantity' && value !== null && !/^\d+$/.test(value) ? '数量须为非负整数。' : undefined);
model.apply([{ id: 'a', field: 'quantity', value: '20' }]); eq(model.dirtyCount, 1); eq(model.value('b', 'quantity'), '10');
const batch = model.beginBatch(50, 'op-1')!; eq(batch.items, [{ id: 'a', expectedRevision: 1, changes: { quantity: '20' } }]);
model.apply([{ id: 'a', field: 'quantity', value: '30' }]); model.confirm([row('a', '20', 2)], batch); eq(model.value('a', 'quantity'), '30'); eq(model.patches()[0]!.expectedRevision, 2); eq(model.patches()[0]!.changes.quantity, '30');
const second = model.beginBatch(50, 'op-2')!; model.apply([{ id: 'a', field: 'quantity', value: '20' }]); eq(model.dirtyCount, 0); model.confirm([row('a', '30', 3)], second); eq(model.value('a', 'quantity'), '20'); eq(model.dirtyCount, 1); eq(model.patches()[0]!.expectedRevision, 3);
const third = model.beginBatch(50, 'op-3')!; model.confirm([row('a', '20', 4)], third); eq(model.dirtyCount, 0);
model.undo(); eq(model.patches()[0]!.expectedRevision, 4); eq(model.value('a', 'quantity'), '30'); // saved undo is a new inverse patch
model.redo(); eq(model.value('a', 'quantity'), '20'); eq(model.dirtyCount, 0);
model.apply([{ id: 'b', field: 'quantity', value: 'invalid' }]); eq(model.errors().length, 1); eq(model.value('b', 'quantity'), 'invalid'); throws(() => model.beginBatch());
model.apply([{ id: 'b', field: 'quantity', value: '12' }]); eq(model.errors().length, 0);
throws(() => model.apply([{ id: 'a', field: 'note', value: 'must-not-apply' }, { id: 'b', field: 'status', value: 'BYPASS' }])); eq(model.value('a', 'note'), null);
throws(() => model.apply([{ id: 'a', field: 'note', value: '=A1' }]));
model.latest([row('a', '20', 4), row('b', '11', 2)]); eq(model.value('b', 'quantity'), '12'); eq(model.conflicts().length, 1); eq(model.conflicts()[0]!.fields, [{ field: 'quantity', server: '11', desired: '12' }]); eq(model.undoStack.length, 3); // only a's history survives
throws(() => model.beginBatch()); model.resolve('b', true); eq(model.conflicts().length, 0); eq(model.beginBatch(50, 'explicit')!.items[0]!.expectedRevision, 2);
model.latest([row('a', '20', 4)]); ok(model.conflicts()[0]!.missing); eq(model.value('b', 'quantity'), '12'); throws(() => model.resolve('b', true)); model.resolve('b', false); eq(model.display('b'), undefined);
const normalized = new RecordSheetModel([row('n')]); normalized.apply([{ id: 'n', field: 'note', value: ' space ' }]); const nb = normalized.beginBatch()!;
normalized.confirm([{ ...row('n', '10', 2), values: { ...row('n').values, note: 'space' } }], nb); eq(normalized.value('n', 'note'), 'space'); eq(normalized.dirtyCount, 0);
normalized.apply([{ id: 'n', field: 'note', value: 'next' }]); const partial = normalized.beginBatch()!; throws(() => normalized.confirm([], partial)); eq(normalized.value('n', 'note'), 'next');
throws(() => new RecordSheetModel([row('x'), row('x')])); throws(() => model.latest([row('x'), row('x')]));
const multi = new RecordSheetModel([row('a'), row('b')]); multi.apply([{ id: 'b', field: 'quantity', value: '11' }, { id: 'a', field: 'note', value: 'A' }]); const mb = multi.beginBatch(1, 'batch-one')!; eq(mb.items.length, 1); multi.confirm([row('b', '11', 2)], mb); eq(multi.patches().map(p => p.id), ['a']);
// 1000 × 20 is not a browser performance claim; this checks stable-id semantics
// and O(1) display cache reuse without scanning or mutating another same-name row.
const large = new RecordSheetModel(Array.from({ length: 1000 }, (_, i) => ({ id: `r${i}`, revision: 1, values: Object.fromEntries(Array.from({ length: 20 }, (_, j) => [`f${j}`, `${i}:${j}`])), editable: Array.from({ length: 20 }, (_, j) => `f${j}`) })));
const untouched = large.display('r0'); large.apply([{ id: 'r999', field: 'f19', value: 'updated' }]); ok(large.display('r0') === untouched); eq(large.patches().length, 1); eq(large.value('r0', 'f19'), '0:19');
console.log(JSON.stringify({ result: 'PASS', assertions: count, coverage: ['stable-ID same-name records', 'in-flight edit', 'in-flight revert to old confirmed value', 'normalization', 'saved inverse undo/redo', 'atomic read-only rejection', 'validation retains input', 'conflict and explicit resolve', 'missing row', 'partial/duplicate responses', 'bounded batches', '1000x20 identity/cache'], browserPerformance: 'NOT_MEASURED' }, null, 2));

});
