import { RecordSheetModel, type RecordSaveBatch } from './record-sheet-model';
import type { RecordSaveState, RecordSheetChange, RecordSheetPatch, RecordSheetRow } from './record-sheet-types';
export interface RecordSaveSnapshot { status: RecordSaveState; message: string; confirmed: number; pending: number; operationId?: string }
export interface RecordSaveQueueOptions<TMeta> {
  save(items: RecordSheetPatch[], operationId: string): Promise<RecordSheetRow<TMeta>[]>;
  onState(state: RecordSaveSnapshot): void;
  onConfirmed?(updates: RecordSheetChange[]): void;
  onConflict?(): Promise<void>;
  delayMs?: number;
  batchSize?: number;
}
function statusCode(error: unknown): number | undefined { return error && typeof error === 'object' && 'status' in error && typeof error.status === 'number' ? error.status : undefined; }
const message = (error: unknown) => error instanceof Error ? error.message : '保存失败，请检查后重试。';
/** One shared serial save coordinator per workspace. A failed/uncertain request
 * pauses automatic writes; only explicit retry can resume it. */
export class RecordSheetSaveQueue<TMeta = unknown> {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private active: Promise<void> | null = null;
  private unconfirmed: RecordSaveBatch | null = null;
  private attempts = 0;
  private paused = false;
  private disposed = false;
  private confirmed = 0;
  private stateValue: RecordSaveSnapshot = { status: 'idle', message: '', confirmed: 0, pending: 0 };
  constructor(readonly model: RecordSheetModel<TMeta>, private readonly options: RecordSaveQueueOptions<TMeta>) {}
  get state() { return this.stateValue; }
  get busy() { return this.active !== null; }
  get uncertain() { return this.unconfirmed !== null && this.paused; }
  private emit(status: RecordSaveState, detail = '') {
    this.stateValue = { status, message: detail, confirmed: this.confirmed, pending: this.model.dirtyCount, ...(this.unconfirmed ? { operationId: this.unconfirmed.operationId } : {}) };
    if (!this.disposed) this.options.onState(this.stateValue);
  }
  private cancelTimer() { if (this.timer) clearTimeout(this.timer); this.timer = null; }
  changed() {
    if (this.disposed) return;
    this.cancelTimer();
    if (this.paused || this.active) { this.emit(this.stateValue.status, this.stateValue.message); return; }
    if (this.model.conflicts().length) { this.emit('conflict', '服务器记录已改变，请核对当前值与输入。'); return; }
    if (this.model.errors().length) { this.emit('invalid', '输入已保留，请先修正标出的字段。'); return; }
    if (!this.model.dirtyCount) { this.emit(this.confirmed ? 'saved' : 'idle'); return; }
    this.emit('pending');
    this.timer = setTimeout(() => { this.timer = null; void this.flush(); }, this.options.delayMs ?? 300);
  }
  flush(): Promise<void> {
    if (this.disposed || this.paused) return Promise.resolve();
    this.cancelTimer(); if (this.active) return this.active;
    let batch: RecordSaveBatch | null;
    try { batch = this.unconfirmed ?? this.model.beginBatch(this.options.batchSize ?? 50); }
    catch (error) { this.emit(this.model.conflicts().length ? 'conflict' : 'invalid', message(error)); return Promise.resolve(); }
    if (!batch) { this.emit(this.confirmed ? 'saved' : 'idle'); return Promise.resolve(); }
    this.unconfirmed = batch;
    const replay = this.attempts > 0; this.attempts++;
    this.emit('saving');
    const run = async () => {
      try {
        const saved = await this.options.save(batch.items, batch.operationId);
        if (this.disposed) return;
        const updates = this.model.confirm(saved, batch);
        this.unconfirmed = null; this.attempts = 0; this.confirmed += saved.length;
        this.options.onConfirmed?.(updates);
        this.emit(this.model.dirtyCount ? 'pending' : 'saved');
      } catch (error) {
        if (this.disposed) return;
        this.paused = true;
        const code = statusCode(error);
        // On a replay, auth/route failures cannot prove whether the original
        // request committed. Keep its operation ID until the result is known.
        const rejected = code !== undefined && (replay ? [400, 409, 422] : [400, 401, 403, 404, 409, 422]).includes(code);
        if (rejected) { this.unconfirmed = null; this.attempts = 0; }
        this.emit(code === 409 ? 'conflict' : rejected ? 'failed' : 'uncertain', `${message(error)}；已确认 ${this.confirmed} 条，其余输入保留。${rejected ? '请处理后重试。' : '请核实原请求，重试沿用原操作标识。'}`);
        if (code === 409 && this.options.onConflict) {
          try { await this.options.onConflict(); } catch { /* Preserve original failure and drafts. */ }
          this.emit('conflict', this.stateValue.message);
        }
      }
    };
    this.active = run().finally(() => { this.active = null; if (!this.disposed && !this.paused) this.changed(); });
    return this.active;
  }
  /** Flush retries the exact unconfirmed request before any new edits. */
  async retry() { if (this.disposed) return; this.paused = false; await this.flush(); }
  async suspend() { this.cancelTimer(); this.paused = true; await this.active; }
  /** Call only after an explicit conflict resolution or a successful refresh.
   * An uncertain operation must still be verified via retry, never discarded. */
  resume() { if (this.unconfirmed || this.disposed) return; this.paused = false; this.changed(); }
  dispose() { this.disposed = true; this.cancelTimer(); }
}
