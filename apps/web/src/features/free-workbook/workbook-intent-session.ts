import { ApiRequestError } from '../../lib/auth-client';
import { createWorkbook, restoreWorkbook, type WorkbookMeta } from './client';
import { validateWorkbookIntent, writeWorkbookIntent, type StoredWorkbookIntent, type WorkbookIntent } from './workbook-intent-store';

export interface WorkbookIntentPorts {
  assertActive(): void;
  write(ownerId: string, intent: WorkbookIntent, expected: number | null): Promise<StoredWorkbookIntent>;
  create: typeof createWorkbook;
  restore: typeof restoreWorkbook;
  onStored?(record: StoredWorkbookIntent): void;
}
const defaults = { write: writeWorkbookIntent, create: createWorkbook, restore: restoreWorkbook };
function acknowledge(value: WorkbookMeta, intent: WorkbookIntent): WorkbookMeta {
  const data = intent.data, id = data.kind === 'restore' ? data.id : data.kind === 'create' ? data.snapshot.id : data.createSnapshot.id;
  const name = data.kind === 'restore' ? null : (data.kind === 'create' ? data.snapshot.name : data.createSnapshot.name).trim();
  if (!value || Array.isArray(value) || value.id !== id || value.revision !== (data.kind === 'restore' ? data.expected + 1 : 1) || typeof value.name !== 'string' || !value.name || value.name.length > 200 || name !== null && value.name !== name || typeof value.snapshotHash !== 'string' || !/^[a-f\d]{64}$/.test(value.snapshotHash) || typeof value.updatedAt !== 'string' || value.updatedAt.length > 40 || !Number.isFinite(Date.parse(value.updatedAt))) throw new Error('原操作回执身份或版本不匹配，结果仍待核实。');
  return { id: value.id, name: value.name, revision: value.revision, snapshotHash: value.snapshotHash, updatedAt: value.updatedAt };
}
/** Call only from an explicit user action. Every network boundary has a synchronous owner/scope
 * check. A reopened awaiting record always retries the exact original operation and body. */
export class WorkbookIntentSession {
  private running = false;
  readonly ports: WorkbookIntentPorts;
  constructor(readonly ownerId: string, private stored: StoredWorkbookIntent, ports: Pick<WorkbookIntentPorts, 'assertActive'> & Partial<Omit<WorkbookIntentPorts, 'assertActive'>>) {
    this.ports = { ...defaults, ...ports }; validateWorkbookIntent(stored.intent);
  }
  get record(): StoredWorkbookIntent { return { revision: this.stored.revision, intent: validateWorkbookIntent(this.stored.intent) }; }
  static async prepare(ownerId: string, intent: WorkbookIntent, ports: Pick<WorkbookIntentPorts, 'assertActive'> & Partial<Omit<WorkbookIntentPorts, 'assertActive'>>) {
    ports.assertActive(); const safe = validateWorkbookIntent(intent), stored = await (ports.write ?? defaults.write)(ownerId, safe, null);
    ports.onStored?.(stored); ports.assertActive(); return new WorkbookIntentSession(ownerId, stored, ports);
  }
  private async persist(intent: WorkbookIntent) {
    this.ports.assertActive(); const next = await this.ports.write(this.ownerId, intent, this.stored.revision);
    this.stored = next; this.ports.onStored?.(next); this.ports.assertActive(); return next;
  }
  async execute(): Promise<WorkbookMeta | null> {
    if (this.running) throw new Error('原操作正在核实，请等待。');
    const original = this.record.intent;
    if (original.phase === 'confirmed') return null;
    if (original.data.kind === 'import' && original.data.created) return original.data.created;
    this.running = true; const firstAttempt = original.phase === 'prepared'; let sent = false;
    try {
      await this.persist({ ...original, phase: 'awaiting-receipt', resolution: null });
      this.ports.assertActive(); sent = true;
      const data = original.data;
      const response = data.kind === 'restore' ? await this.ports.restore(data.id, data.expected, data.revision, data.operationId) : await this.ports.create(data.kind === 'create' ? data.snapshot : data.createSnapshot, data.operationId);
      this.ports.assertActive(); const ack = acknowledge(response, original);
      if (data.kind === 'import') await this.persist({ ...original, phase: 'awaiting-receipt', resolution: null, data: { ...data, created: ack } });
      else await this.persist({ ...original, phase: 'confirmed', resolution: 'succeeded' });
      return ack;
    } catch (cause) {
      // A response to a later retry cannot prove that the original request never committed.
      // In particular, loss of auth/permission always leaves the old operation unresolved.
      if (sent && firstAttempt && cause instanceof ApiRequestError && [400, 409, 413, 422].includes(cause.status)) {
        await this.persist({ ...original, phase: 'confirmed', resolution: 'rejected' });
      }
      throw cause;
    } finally { this.running = false; }
  }
  async rememberAsset(sourceMediaId: string, assetId: string) {
    const intent = this.record.intent; if (intent.data.kind !== 'import' || !intent.data.created || intent.phase !== 'awaiting-receipt') throw new Error('导入尚未创建或已经结束。');
    const existing = intent.data.assets.find(([source]) => source === sourceMediaId);
    if (existing) { if (existing[1] !== assetId) throw new Error('原图片资产回执不一致，请保留原记录。'); return this.record; }
    return this.persist({ ...intent, data: { ...intent.data, assets: [...intent.data.assets, [sourceMediaId, assetId]] } });
  }
  async advanceImage(index: number) {
    const intent = this.record.intent; if (intent.data.kind !== 'import' || intent.phase !== 'awaiting-receipt' || !intent.data.created) throw new Error('导入尚未创建或已经结束。');
    if (index < intent.data.imageIndex) return this.record; // Rebuilding an already acknowledged placement from original bytes.
    if (index !== intent.data.imageIndex) throw new Error('导入图片进度不连续。');
    return this.persist({ ...intent, data: { ...intent.data, imageIndex: index + 1 } });
  }
  /** Caller first durably stores the complete reconstructed snapshot. No network or automatic
   * formal workbook save happens here; successful import remains an explicitly unsaved draft. */
  async finishImport(durable: { workbookId: string; imageCount: number }) {
    const intent = this.record.intent;
    if (intent.data.kind !== 'import' || intent.phase !== 'awaiting-receipt' || !intent.data.created || durable.workbookId !== intent.data.createSnapshot.id || durable.imageCount !== intent.data.imageOperations.length || intent.data.imageIndex !== durable.imageCount) throw new Error('导入图片或完整本机草稿尚未保留，不能结束导入。');
    return this.persist({ ...intent, phase: 'confirmed', resolution: 'succeeded' });
  }
}
