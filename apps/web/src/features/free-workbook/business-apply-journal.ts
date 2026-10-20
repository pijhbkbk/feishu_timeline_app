import type { BusinessApplyReceipt, BusinessApplyRequest } from './business-apply';
import type { BusinessMappingBinding, BusinessMappingTarget } from './business-mapping';

export const BUSINESS_JOURNAL_LIMITS = { slotsPerActor: 4, bytesPerSlot: 1024 * 1024, receipts: 2000 } as const;
export type BusinessJournalPhase = 'prepared' | 'awaiting-receipt' | 'confirmed' | 'rejected';
export interface BusinessApplyCheckpoint {
  version: 1; actorId: string; workbookId: string; binding: BusinessMappingBinding;
  target: BusinessMappingTarget; reason: string; activityRevision: number | null;
  phase: BusinessJournalPhase; everAmbiguous: boolean;
  request: BusinessApplyRequest | null; receipts: BusinessApplyReceipt[];
}
export interface StoredBusinessApplyJournal { revision: number; checkpoint: BusinessApplyCheckpoint }
export type BusinessApplyPersistence = { actorId: string; persist: (checkpoint: BusinessApplyCheckpoint) => Promise<void> };
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const hash = (value: unknown) => typeof value === 'string' && /^[a-f\d]{64}$/.test(value);
const revision = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 1 && (value as number) <= 2147483647;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function invalid(): never { throw new Error('本机业务请求记录无效或超过上限，请保留记录并核对；不会自动重新提交。'); }
/** Validation never grants authorization; recovered requests are only sent on an explicit click
 * using the current native session. Other accounts are not loaded or enumerated. */
export function validateBusinessApplyCheckpoint(value: unknown, actorId: string, workbookId: string): BusinessApplyCheckpoint {
  if (!identifier(actorId) || !identifier(workbookId)) return invalid();
  let serialized: string; try { serialized = JSON.stringify(value); } catch { return invalid(); }
  if (!serialized || new TextEncoder().encode(serialized).length > BUSINESS_JOURNAL_LIMITS.bytesPerSlot) return invalid();
  if (!object(value) || value.version !== 1 || value.actorId !== actorId || value.workbookId !== workbookId || !['prepared', 'awaiting-receipt', 'confirmed', 'rejected'].includes(String(value.phase)) || typeof value.everAmbiguous !== 'boolean' || typeof value.reason !== 'string' || value.reason.length > 1000) return invalid();
  const binding = value.binding, target = value.target;
  if (!object(binding) || binding.workbookId !== workbookId || !revision(binding.formalRevision) || !hash(binding.sourceSnapshotHash) || !hash(binding.fullJSONHash) || !hash(binding.mappingHash) || !object(target) || !['color', 'person', 'production', 'inspection'].includes(String(target.kind))) return invalid();
  const targetKeys = target.kind === 'inspection' ? ['kind', 'activityId', 'layer', 'objectId', 'colorId', 'occurrenceId', 'measurementId', 'standardVersionId'] : target.kind === 'production' ? ['kind', 'baseId', 'colorId'] : ['kind'];
  if (Object.keys(target).length !== targetKeys.length || Object.keys(target).some(key => !targetKeys.includes(key)) || Object.entries(target).some(([key, item]) => key.endsWith('Id') && item !== null && !identifier(item))) return invalid();
  if (target.kind === 'inspection' ? !identifier(target.activityId) || !['occurrence', 'measurement', 'reading', 'defect'].includes(String(target.layer)) || !revision(value.activityRevision) : value.activityRevision !== null) return invalid();
  if (!Array.isArray(value.receipts) || value.receipts.length > BUSINESS_JOURNAL_LIMITS.receipts) return invalid();
  for (const row of value.receipts) if (!object(row) || !identifier(row.id) || !identifier(row.clientId) || !identifier(row.operationId) || !revision(row.revision) || !Number.isSafeInteger(row.sourceRow) || (row.sourceRow as number) < 1 || (row.sourceRow as number) > 10000) return invalid();
  if (new Set(value.receipts.map(row => (row as BusinessApplyReceipt).clientId)).size !== value.receipts.length) return invalid();
  if (value.phase === 'prepared' && value.everAmbiguous) return invalid();
  if (value.phase === 'confirmed' || value.phase === 'rejected') { if (value.request !== null || value.everAmbiguous) return invalid(); }
  else {
    const request = value.request;
    if (!object(request) || !identifier(request.operationId) || !['POST', 'PATCH'].includes(String(request.method)) || typeof request.bodyJSON !== 'string' || new TextEncoder().encode(request.bodyJSON).length > 512 * 1024 || !Array.isArray(request.plans) || request.plans.length < 1 || request.plans.length > 50) return invalid();
    const expectedPath = target.kind === 'person' ? request.method === 'POST' ? '/persons' : '/persons/sheet' : target.kind === 'color' ? '/color-register/sheet' : target.kind === 'production' ? '/production-facts/batch' : `/inspections/activities/${encodeURIComponent(String(target.activityId))}/batch`;
    if (request.path !== expectedPath || target.kind !== 'person' && request.method !== 'PATCH') return invalid();
    let body: unknown; try { body = JSON.parse(request.bodyJSON); } catch { return invalid(); }
    if (!object(body) || body.operationId !== request.operationId || !Array.isArray(body.items) || body.items.length !== request.plans.length || target.kind === 'inspection' && body.expectedRevision !== value.activityRevision) return invalid();
    for (const plan of request.plans) {
      if (!object(plan) || !['create', 'update'].includes(String(plan.status)) || !object(plan.input) || !identifier(plan.input.clientId) || !Number.isSafeInteger(plan.input.row) || (plan.input.row as number) < 1 || (plan.input.row as number) > 10000 || !object(plan.input.values) || !Array.isArray(plan.input.errors) || plan.input.errors.length || !object(plan.input.source) || !object(plan.data)) return invalid();
      if (plan.status === 'update' ? !identifier(plan.input.id) || !revision(plan.input.revision) : plan.input.id !== null || plan.input.revision !== null) return invalid();
      const clientId = plan.input.clientId;
      if (value.receipts.some(row => (row as BusinessApplyReceipt).clientId === clientId)) return invalid();
    }
    if (new Set(request.plans.map(plan => (plan as { input: { clientId: string } }).input.clientId)).size !== request.plans.length) return invalid();
  }
  return JSON.parse(serialized) as BusinessApplyCheckpoint;
}
const DB = 'timeline-free-workbook-business-apply-v1', STORE = 'commands';
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('此浏览器无法持久保存业务请求，尚未发送任何新请求。')); return; }
    const request = indexedDB.open(DB, 1); let ended = false;
    const timer = setTimeout(() => { ended = true; reject(new Error('本机业务请求日志读取超时，尚未发送新请求。')); }, 5000);
    request.onupgradeneeded = () => { const store = request.result.createObjectStore(STORE, { keyPath: ['actorId', 'workbookId'] }); store.createIndex('actorId', 'actorId'); };
    request.onerror = () => { clearTimeout(timer); reject(new Error('无法打开本机业务请求日志。')); };
    request.onsuccess = () => { clearTimeout(timer); if (ended) request.result.close(); else resolve(request.result); };
  });
}
type Entry = StoredBusinessApplyJournal & { actorId: string; workbookId: string };
async function transaction<T>(actorId: string, workbookId: string, mode: IDBTransactionMode, run: (store: IDBObjectStore, tx: IDBTransaction, current: Entry | undefined, result: (value: T) => void, fail: (message: string) => void) => void): Promise<T> {
  if (!identifier(actorId) || !identifier(workbookId)) return invalid();
  const db = await open();
  try { return await new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode), store = tx.objectStore(STORE); let result: T, problem: string | null = null;
    const fail = (message: string) => { problem = message; tx.abort(); };
    const timer = setTimeout(() => fail('本机业务请求日志操作超时；未确认的请求已保留。'), 5000);
    tx.oncomplete = () => { clearTimeout(timer); resolve(result); };
    tx.onabort = tx.onerror = () => { clearTimeout(timer); reject(new Error(problem ?? '本机业务请求日志未能保存；请保留此窗口。')); };
    const request = store.get([actorId, workbookId]);
    request.onsuccess = () => { try { run(store, tx, request.result as Entry | undefined, value => { result = value; }, fail); } catch { fail('本机业务请求日志无效；未发送新请求。'); } };
  }); } finally { db.close(); }
}
export function readBusinessApplyJournal(actorId: string, workbookId: string) {
  return transaction<StoredBusinessApplyJournal | null>(actorId, workbookId, 'readonly', (_store, _tx, current, result) => {
    if (!current) { result(null); return; }
    if (!revision(current.revision)) return invalid();
    result({ revision: current.revision, checkpoint: validateBusinessApplyCheckpoint(current.checkpoint, actorId, workbookId) });
  });
}
export async function writeBusinessApplyJournal(checkpoint: BusinessApplyCheckpoint, expectedRevision: number | null): Promise<number> {
  const safe = validateBusinessApplyCheckpoint(checkpoint, checkpoint.actorId, checkpoint.workbookId);
  return transaction<number>(safe.actorId, safe.workbookId, 'readwrite', (store, _tx, current, result, fail) => {
    if ((current?.revision ?? null) !== expectedRevision) { fail('另一页面已改变此工作簿的业务请求日志，请重新打开并核对原请求。'); return; }
    const next = (expectedRevision ?? 0) + 1; if (!revision(next)) return invalid();
    const save = () => { store.put({ actorId: safe.actorId, workbookId: safe.workbookId, revision: next, checkpoint: safe } satisfies Entry); result(next); };
    if (current) save();
    else { const count = store.index('actorId').count(IDBKeyRange.only(safe.actorId)); count.onsuccess = () => { if (count.result >= BUSINESS_JOURNAL_LIMITS.slotsPerActor) fail('此账号已有 4 个工作簿业务请求记录，请先核对并结束其中已确认的记录；不会删除未知请求。'); else save(); }; }
  });
}
export function clearBusinessApplyJournal(actorId: string, workbookId: string, expectedRevision: number) {
  return transaction<void>(actorId, workbookId, 'readwrite', (store, _tx, current, result, fail) => {
    if (!current || current.revision !== expectedRevision) { fail('业务请求记录已改变，请重新读取后核对。'); return; }
    const safe = validateBusinessApplyCheckpoint(current.checkpoint, actorId, workbookId);
    if (safe.phase !== 'confirmed' && safe.phase !== 'rejected') { fail('尚未确认的业务请求不能丢弃，请重试原请求。'); return; }
    store.delete([actorId, workbookId]); result(undefined);
  });
}
/** Only the prepared phase can be cancelled. Every sender must CAS-persist awaiting-receipt
 * before network; a racing sender or an already dispatched request therefore fails this CAS. */
export function cancelPreparedBusinessApplyJournal(actorId: string, workbookId: string, expectedRevision: number) {
  return transaction<void>(actorId, workbookId, 'readwrite', (store, _tx, current, result, fail) => {
    if (!current || current.revision !== expectedRevision) { fail('原请求记录已变化，请重新读取。'); return; }
    const safe = validateBusinessApplyCheckpoint(current.checkpoint, actorId, workbookId);
    if (safe.phase !== 'prepared' || safe.everAmbiguous) { fail('请求可能已经发送，不能取消；请核实原请求。'); return; }
    store.delete([actorId, workbookId]); result(undefined);
  });
}
