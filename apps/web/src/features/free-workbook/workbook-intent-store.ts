import type { IWorkbookData } from '@univerjs/core';
import type { WorkbookMeta } from './client';
import { checkWorkbookBounds } from './contract';

export const WORKBOOK_INTENT_LIMITS = { bytes: 16 * 1024 * 1024, snapshotBytes: 7 * 1024 * 1024, sourceBytes: 5 * 1024 * 1024, images: 50 } as const;
export type WorkbookIntentData =
  | { kind: 'create'; snapshot: IWorkbookData; operationId: string }
  | { kind: 'restore'; id: string; revision: number; expected: number; operationId: string }
  | { kind: 'import'; createSnapshot: IWorkbookData; operationId: string; sourceFileName: string; sourceBytes: Uint8Array; imageOperations: string[]; created: WorkbookMeta | null; imageIndex: number; assets: [sourceMediaId: string, assetId: string][] };
export type WorkbookIntent = { version: 1; intentId: string; data: WorkbookIntentData } & (
  | { phase: 'prepared' | 'awaiting-receipt'; resolution: null }
  | { phase: 'confirmed'; resolution: 'succeeded' | 'rejected' }
);
export interface StoredWorkbookIntent { revision: number; intent: WorkbookIntent }
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const id = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(value);
const revision = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 1 && Number(value) <= 2147483646;
function invalid(): never { throw new Error('本机工作簿操作记录无效或超过上限；原记录保留，不会自动提交。'); }
function exact(value: Record<string, unknown>, keys: string[]) { if (Object.keys(value).length !== keys.length || Object.keys(value).some(key => !keys.includes(key))) invalid(); }
function snapshot(value: unknown): IWorkbookData {
  if (!object(value) || !uuid(value.id) || value.appVersion !== '1.0.4' || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 200 || !Array.isArray(value.sheetOrder) || !object(value.sheets) || !object(value.styles)) invalid();
  // JSON bytes are the API request identity. This is a storage bound, not server authorization.
  const json = JSON.stringify(value); if (new TextEncoder().encode(json).length > WORKBOOK_INTENT_LIMITS.snapshotBytes) invalid();
  const copy = JSON.parse(json) as IWorkbookData; checkWorkbookBounds(copy); return copy;
}
function meta(value: unknown, original: IWorkbookData): WorkbookMeta {
  if (!object(value)) invalid(); exact(value, ['id', 'name', 'revision', 'snapshotHash', 'updatedAt']);
  if (value.id !== original.id || value.name !== original.name.trim() || !revision(value.revision) || typeof value.snapshotHash !== 'string' || !/^[a-f\d]{64}$/.test(value.snapshotHash) || typeof value.updatedAt !== 'string' || value.updatedAt.length > 40 || !Number.isFinite(Date.parse(value.updatedAt))) invalid();
  return { ...value } as unknown as WorkbookMeta;
}
/** Returns a detached record. Binary XLSX is counted as bytes, never expanded into a JSON array.
 * This module has no network calls, account discovery, automatic retry or eviction. */
export function validateWorkbookIntent(value: unknown): WorkbookIntent {
  if (!object(value)) invalid(); exact(value, ['version', 'intentId', 'phase', 'resolution', 'data']);
  if (value.version !== 1 || !uuid(value.intentId) || !['prepared', 'awaiting-receipt', 'confirmed'].includes(String(value.phase)) || (value.phase === 'confirmed' ? !['succeeded', 'rejected'].includes(String(value.resolution)) : value.resolution !== null) || !object(value.data)) invalid();
  const raw = value.data; let data: WorkbookIntentData;
  if (!id(raw.operationId)) invalid();
  if (raw.kind === 'create') { exact(raw, ['kind', 'snapshot', 'operationId']); data = { kind: 'create', snapshot: snapshot(raw.snapshot), operationId: raw.operationId }; }
  else if (raw.kind === 'restore') {
    exact(raw, ['kind', 'id', 'revision', 'expected', 'operationId']); if (!uuid(raw.id) || !revision(raw.revision) || !revision(raw.expected) || raw.revision > raw.expected) invalid();
    data = { kind: 'restore', id: raw.id, revision: raw.revision, expected: raw.expected, operationId: raw.operationId };
  } else if (raw.kind === 'import') {
    exact(raw, ['kind', 'createSnapshot', 'operationId', 'sourceFileName', 'sourceBytes', 'imageOperations', 'created', 'imageIndex', 'assets']);
    if (typeof raw.sourceFileName !== 'string' || !raw.sourceFileName.trim() || raw.sourceFileName.length > 255 || [...raw.sourceFileName].some(char => char.charCodeAt(0) < 32) || !(raw.sourceBytes instanceof Uint8Array) || !raw.sourceBytes.byteLength || raw.sourceBytes.byteLength > WORKBOOK_INTENT_LIMITS.sourceBytes) invalid();
    if (!Array.isArray(raw.imageOperations) || raw.imageOperations.length > WORKBOOK_INTENT_LIMITS.images || raw.imageOperations.some(item => !id(item) || item === raw.operationId) || new Set(raw.imageOperations).size !== raw.imageOperations.length || !Number.isSafeInteger(raw.imageIndex) || Number(raw.imageIndex) < 0 || Number(raw.imageIndex) > raw.imageOperations.length || !Array.isArray(raw.assets) || raw.assets.length > raw.imageOperations.length) invalid();
    const assets: [string, string][] = [], sources = new Set<string>();
    for (const pair of raw.assets) { if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== 'string' || !pair[0] || pair[0].length > 512 || [...pair[0]].some(char => char.charCodeAt(0) < 32) || sources.has(pair[0]) || !uuid(pair[1])) invalid(); sources.add(pair[0]); assets.push([pair[0], pair[1]]); }
    const createSnapshot = snapshot(raw.createSnapshot);
    if (Object.values(createSnapshot.sheets).some(sheet => !!sheet.backgroundImage || Object.values(sheet.cellData ?? {}).some(row => Object.keys(row ?? {}).length)) || createSnapshot.resources?.some(resource => resource.data && resource.data !== '{}')) invalid();
    const created = raw.created === null ? null : meta(raw.created, createSnapshot);
    if (!created && (raw.imageIndex !== 0 || assets.length) || value.phase === 'prepared' && (created || raw.imageIndex !== 0 || assets.length) || value.phase === 'confirmed' && value.resolution === 'succeeded' && (!created || raw.imageIndex !== raw.imageOperations.length)) invalid();
    data = { kind: 'import', createSnapshot, operationId: raw.operationId, sourceFileName: raw.sourceFileName, sourceBytes: new Uint8Array(raw.sourceBytes), imageOperations: [...raw.imageOperations] as string[], created, imageIndex: Number(raw.imageIndex), assets };
  } else invalid();
  const safe = { version: 1, intentId: value.intentId, phase: value.phase, resolution: value.resolution, data } as WorkbookIntent;
  const binary = data.kind === 'import' ? data.sourceBytes.byteLength : 0;
  const json = JSON.stringify(data.kind === 'import' ? { ...safe, data: { ...data, sourceBytes: null } } : safe);
  if (new TextEncoder().encode(json).length + binary > WORKBOOK_INTENT_LIMITS.bytes) invalid();
  return safe;
}
function sameBytes(left: Uint8Array, right: Uint8Array) { return left.byteLength === right.byteLength && left.every((value, index) => value === right[index]); }
function immutableData(data: WorkbookIntentData) { return data.kind === 'import' ? { ...data, sourceBytes: null, created: null, imageIndex: 0, assets: [] } : data; }
/** A slot's identity and original request never change. Import receipts advance atomically;
 * old snapshots, operation keys, source bytes and already acknowledged assets are immutable. */
export function validateWorkbookIntentTransition(previous: WorkbookIntent | null, next: WorkbookIntent): void {
  if (!previous) { if (next.phase !== 'prepared') throw new Error('新操作必须先以未发送状态落盘。'); return; }
  if (previous.intentId !== next.intentId || JSON.stringify(immutableData(previous.data)) !== JSON.stringify(immutableData(next.data))) throw new Error('原操作身份或请求内容不可更换；请先核实原请求。');
  if (previous.phase === 'confirmed' && (next.phase !== 'confirmed' || previous.resolution !== next.resolution) || previous.phase === 'awaiting-receipt' && next.phase === 'prepared' || previous.phase === 'prepared' && next.phase === 'confirmed') throw new Error('未知请求不能退回未发送，已确认结果不能改写。');
  if (previous.data.kind === 'import' && next.data.kind === 'import') {
    const before = previous.data, after = next.data;
    if (previous.phase === 'confirmed' && (JSON.stringify(before.created) !== JSON.stringify(after.created) || before.imageIndex !== after.imageIndex || JSON.stringify(before.assets) !== JSON.stringify(after.assets))) throw new Error('已确认导入的进度不能改变。');
    if (!sameBytes(before.sourceBytes, after.sourceBytes) || before.created && JSON.stringify(before.created) !== JSON.stringify(after.created) || after.imageIndex < before.imageIndex || after.imageIndex > before.imageIndex + 1 || after.assets.length < before.assets.length || after.assets.length > before.assets.length + 1 || before.assets.some(([source, asset], index) => after.assets[index]?.[0] !== source || after.assets[index]?.[1] !== asset)) throw new Error('导入原件、回执或图片进度不可替换、回退或跳步。');
  }
}
const DB = 'timeline-free-workbook-intents-v1', STORE = 'intents';
type Entry = StoredWorkbookIntent & { ownerId: string };
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('浏览器无法持久保存工作簿操作，尚未发送请求。')); return; }
    const request = indexedDB.open(DB, 1); let ended = false;
    const timer = setTimeout(() => { ended = true; reject(new Error('本机工作簿操作记录打开超时。')); }, 5000);
    request.onupgradeneeded = () => { request.result.createObjectStore(STORE, { keyPath: 'ownerId' }); };
    request.onerror = () => { clearTimeout(timer); reject(new Error('无法打开本机工作簿操作记录。')); };
    request.onsuccess = () => { clearTimeout(timer); if (ended) request.result.close(); else { request.result.onversionchange = () => request.result.close(); resolve(request.result); } };
  });
}
async function transaction<T>(ownerId: string, mode: IDBTransactionMode, run: (store: IDBObjectStore, current: StoredWorkbookIntent | null, result: (value: T) => void) => void): Promise<T> {
  if (!id(ownerId)) invalid(); const db = await open();
  try { return await new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode), store = tx.objectStore(STORE); let result: T, problem = '', ended = false;
    const fail = (message: string) => { if (ended) return; problem = message; tx.abort(); };
    const timer = setTimeout(() => fail('本机操作超时，原请求记录保留。'), 5000);
    tx.oncomplete = () => { ended = true; clearTimeout(timer); resolve(result); };
    tx.onabort = tx.onerror = () => { ended = true; clearTimeout(timer); reject(new Error(problem || '本机操作记录未能保存，不能开始新请求。')); };
    const request = store.get(ownerId);
    request.onsuccess = () => { try {
      const entry = request.result as Entry | undefined;
      if (entry && (entry.ownerId !== ownerId || !revision(entry.revision))) invalid();
      run(store, entry ? { revision: entry.revision, intent: validateWorkbookIntent(entry.intent) } : null, value => { result = value; });
    } catch (cause) { fail(cause instanceof Error ? cause.message : '本机操作记录无效。'); } };
  }); } finally { db.close(); }
}
export function readWorkbookIntent(ownerId: string): Promise<StoredWorkbookIntent | null> {
  return transaction(ownerId, 'readonly', (_store, current, result) => result(current));
}
export function writeWorkbookIntent(ownerId: string, intent: WorkbookIntent, expectedRevision: number | null): Promise<StoredWorkbookIntent> {
  const safe = validateWorkbookIntent(intent); if (expectedRevision !== null && !revision(expectedRevision)) invalid();
  return transaction(ownerId, 'readwrite', (store, current, result) => {
    if ((current?.revision ?? null) !== expectedRevision) throw new Error('另一页面已改变本账号的操作记录，请重新读取。');
    validateWorkbookIntentTransition(current?.intent ?? null, safe);
    const next = (expectedRevision ?? 0) + 1; if (!revision(next)) invalid();
    const entry = { ownerId, revision: next, intent: safe }; store.put(entry); result({ revision: next, intent: safe });
  });
}
export function removeWorkbookIntent(ownerId: string, intentId: string, expectedRevision: number, options: { cancelPrepared?: true } = {}): Promise<void> {
  if (!uuid(intentId) || !revision(expectedRevision)) invalid();
  return transaction(ownerId, 'readwrite', (store, current, result) => {
    if (!current || current.revision !== expectedRevision || current.intent.intentId !== intentId) throw new Error('原操作记录身份或版本已变化，不能删除。');
    if (current.intent.phase !== 'confirmed' && !(current.intent.phase === 'prepared' && options.cancelPrepared === true)) throw new Error('未知请求不能删除；未发送请求须明确取消。');
    store.delete(ownerId); result(undefined);
  });
}
