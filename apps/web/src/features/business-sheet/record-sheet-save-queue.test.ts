import { it } from 'vitest';
import assert from 'node:assert/strict';
import { RecordSheetModel } from './record-sheet-model';
import { RecordSheetSaveQueue, type RecordSaveSnapshot } from './record-sheet-save-queue';
import type { RecordSheetPatch, RecordSheetRow } from './record-sheet-types';
const row = (quantity = '10', revision = 1): RecordSheetRow => ({ id: 'a', revision, values: { quantity }, editable: ['quantity'] });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
async function main() {
  let count = 0; const eq = (actual: unknown, expected: unknown) => { assert.deepEqual(actual, expected); count++; };
  const model = new RecordSheetModel([row()]); const first = deferred<RecordSheetRow[]>(); const calls: { items: RecordSheetPatch[]; id: string }[] = [];
  const states: RecordSaveSnapshot[] = [];
  const queue = new RecordSheetSaveQueue(model, { delayMs: 300, onState: state => states.push(state), save: async (items, id) => { calls.push({ items: structuredClone(items), id }); return calls.length === 1 ? first.promise : [row(items[0]!.changes.quantity!, 3)]; } });
  model.apply([{ id: 'a', field: 'quantity', value: '20' }]); const active = queue.flush(); model.apply([{ id: 'a', field: 'quantity', value: '30' }]); queue.changed(); const duplicate = queue.flush(); eq(calls.length, 1); eq(active === duplicate, true); first.resolve([row('20', 2)]); await active; eq(model.value('a', 'quantity'), '30'); eq(queue.state.status, 'pending'); await queue.flush(); eq(calls.length, 2); eq(calls[1]!.items[0]!.expectedRevision, 2); eq(queue.state.status, 'saved'); queue.dispose();
  const uncertain = new RecordSheetModel([row()]); const replayCalls: { items: RecordSheetPatch[]; id: string }[] = []; let attempt = 0;
  const retry = new RecordSheetSaveQueue(uncertain, { onState: () => {}, save: async (items, id) => { replayCalls.push({ items: structuredClone(items), id }); attempt++; if (attempt === 1) throw new Error('response lost'); if (attempt === 2) throw Object.assign(new Error('login expired'), { status: 401 }); return [row(items[0]!.changes.quantity!, attempt === 3 ? 2 : 3)]; } });
  uncertain.apply([{ id: 'a', field: 'quantity', value: '20' }]); await retry.flush(); eq(retry.state.status, 'uncertain'); uncertain.apply([{ id: 'a', field: 'quantity', value: '30' }]); retry.changed(); await retry.flush(); eq(replayCalls.length, 1); await retry.retry(); eq(retry.state.status, 'uncertain'); await retry.retry(); eq(replayCalls[0]!.id, replayCalls[1]!.id); eq(replayCalls[0]!.id, replayCalls[2]!.id); eq(replayCalls[2]!.items[0]!.changes.quantity, '20'); eq(uncertain.value('a', 'quantity'), '30'); await retry.flush(); eq(replayCalls[3]!.items[0]!.expectedRevision, 2); eq(replayCalls[3]!.id !== replayCalls[0]!.id, true); retry.dispose();
  const conflicted = new RecordSheetModel([row()]); let conflictCalls = 0;
  const conflictQueue = new RecordSheetSaveQueue(conflicted, { onState: () => {}, onConflict: async () => { conflicted.latest([row('15', 2)]); }, save: async items => { if (++conflictCalls === 1) throw Object.assign(new Error('version conflict'), { status: 409 }); return [row(items[0]!.changes.quantity!, 3)]; } });
  conflicted.apply([{ id: 'a', field: 'quantity', value: '20' }]); await conflictQueue.flush(); eq(conflictQueue.state.status, 'conflict'); eq(conflicted.conflicts()[0]!.fields[0]!.server, '15'); eq(conflicted.value('a', 'quantity'), '20'); conflicted.resolve('a', true); conflictQueue.resume(); await conflictQueue.flush(); eq(conflictQueue.state.status, 'saved'); conflictQueue.dispose();
  let automatic = 0;
  const autoModel = new RecordSheetModel([row()], (_row, _field, value) => value === 'bad' ? 'invalid' : undefined);
  const auto = new RecordSheetSaveQueue(autoModel, { delayMs: 10, onState: () => {}, save: async items => { automatic++; return [row(items[0]!.changes.quantity!, 2)]; } });
  autoModel.apply([{ id: 'a', field: 'quantity', value: 'bad' }]); auto.changed(); eq(auto.state.status, 'invalid'); autoModel.apply([{ id: 'a', field: 'quantity', value: '12' }]); auto.changed(); autoModel.apply([{ id: 'a', field: 'quantity', value: '13' }]); auto.changed(); await new Promise(done => setTimeout(done, 25)); eq(automatic, 1); eq(auto.state.status, 'saved'); auto.dispose();
  const closeModel = new RecordSheetModel([row()]); const closeResponse = deferred<RecordSheetRow[]>(); let emittedAfterClose = 0; let closed = false;
  const closeQueue = new RecordSheetSaveQueue(closeModel, { onState: () => { if (closed) emittedAfterClose++; }, save: () => closeResponse.promise }); closeModel.apply([{ id: 'a', field: 'quantity', value: '20' }]); const closeActive = closeQueue.flush(); closeQueue.dispose(); closed = true; closeResponse.resolve([row('20', 2)]); await closeActive; eq(emittedAfterClose, 0);
  console.log(JSON.stringify({ result: 'PASS', assertions: count, coverage: ['serial batches', 'in-flight edits', '300ms default / test debounce coalescing', 'uncertain retry operation ID', 'replay auth does not discard operation', '409 current server value', 'explicit conflict resolution', 'invalid input not sent', 'dispose no late callbacks'] }, null, 2));
}
it('serializes saves and preserves uncertain operations, conflicts and disposal', main);
