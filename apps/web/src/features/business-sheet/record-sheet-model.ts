import type { RecordSheetChange, RecordSheetConflict, RecordSheetIssue, RecordSheetPatch, RecordSheetRow, RecordSheetValue } from './record-sheet-types';
export type { RecordSheetRow, RecordSheetPatch, RecordSheetChange, RecordSheetIssue, RecordSheetConflict } from './record-sheet-types';
type Values = Record<string, RecordSheetValue>;
type History = Array<RecordSheetChange & { before: RecordSheetValue; after: RecordSheetValue }>;
export interface RecordSaveBatch { operationId: string; sequence: number; items: RecordSheetPatch[]; versions: Map<string, Map<string, number>> }
const own = (object: object, key: string) => Object.prototype.hasOwnProperty.call(object, key);
function sameDependencies(a: Readonly<Record<string, number>> = {}, b: Readonly<Record<string, number>> = {}) { return Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([id, revision]) => b[id] === revision); }
function dependencyRollback(old: Readonly<Record<string, number>> = {}, next: Readonly<Record<string, number>> = {}) { return Object.keys(old).length !== Object.keys(next).length || Object.entries(old).some(([id, revision]) => (next[id] ?? 0) < revision); }
function checked<T>(row: RecordSheetRow<T>): RecordSheetRow<T> {
  if (!row.id || !Number.isSafeInteger(row.revision) || row.revision < 1 || !row.values || !row.editable.every(field => own(row.values, field)) || Object.values(row.values).some(value => value !== null && typeof value !== 'string')) throw new Error('服务端记录身份、版本或字段无效。');
  if (row.dependencies && (Array.isArray(row.dependencies) || Object.entries(row.dependencies).some(([id, revision]) => !id || !Number.isSafeInteger(revision) || revision < 1))) throw new Error('关联事实版本无效。');
  return { ...row, values: { ...row.values }, editable: [...row.editable], ...(row.dependencies ? { dependencies: { ...row.dependencies } } : {}) };
}
/** Stable IDs and server revisions live outside editable cells. Selection/display
 * is O(1). Dirty/error/conflict work visits changed records only, never all rows. */
export class RecordSheetModel<TMeta = unknown> {
  readonly rows = new Map<string, RecordSheetRow<TMeta>>();
  private readonly desired = new Map<string, Values>();
  private readonly displayCache = new Map<string, RecordSheetRow<TMeta>>();
  private readonly expected = new Map<string, number>();
  private readonly expectedDependencies = new Map<string, Readonly<Record<string, number>>>();
  private readonly dirtyFields = new Map<string, Set<string>>();
  private readonly versions = new Map<string, Map<string, number>>();
  private readonly errorsById = new Map<string, RecordSheetIssue[]>();
  private readonly missing = new Set<string>();
  private sequence = 0;
  private patchCache: RecordSheetPatch[] | null = [];
  readonly undoStack: History[] = [];
  readonly redoStack: History[] = [];
  constructor(rows: readonly RecordSheetRow<TMeta>[], private readonly validate?: (row: RecordSheetRow<TMeta>, field: string, value: RecordSheetValue) => string | undefined) {
    for (const raw of rows) { const row = checked(raw); if (this.rows.has(row.id)) throw new Error('服务端记录 ID 重复。'); this.rows.set(row.id, row); this.desired.set(row.id, { ...row.values }); this.expected.set(row.id, row.revision); this.expectedDependencies.set(row.id, { ...row.dependencies }); }
  }
  get dirtyCount() { return this.dirtyFields.size; }
  display(id: string): RecordSheetRow<TMeta> | undefined {
    const row = this.rows.get(id); if (!row) return;
    let cached = this.displayCache.get(id);
    if (!cached) { cached = { ...row, values: { ...this.desired.get(id)! }, editable: this.missing.has(id) ? [] : row.editable }; this.displayCache.set(id, cached); }
    return cached;
  }
  value(id: string, field: string): RecordSheetValue | undefined { return this.desired.get(id)?.[field]; }
  private refresh(id: string, fields: Iterable<string>) {
    const row = this.rows.get(id)!, values = this.desired.get(id)!;
    const dirty = this.dirtyFields.get(id) ?? new Set<string>();
    for (const field of fields) { if (values[field] !== row.values[field]) dirty.add(field); else dirty.delete(field); }
    if (dirty.size) this.dirtyFields.set(id, dirty); else { this.dirtyFields.delete(id); this.expected.set(id, row.revision); this.expectedDependencies.set(id, { ...row.dependencies }); }
    const current = { ...row, values };
    const issues = [...dirty].flatMap(field => {
      const message = this.missing.has(id) ? '此记录已不可读取，不能继续保存。' : !row.editable.includes(field) ? '此字段当前不可编辑，请重新读取或放弃此修改。' : this.validate?.(current, field, values[field]!);
      return message ? [{ id, field, message }] : [];
    });
    if (issues.length) this.errorsById.set(id, issues); else this.errorsById.delete(id);
    this.displayCache.delete(id); this.patchCache = null;
  }
  apply(changes: readonly RecordSheetChange[], recordHistory = true): RecordSheetChange[] {
    const staged = new Map<string, Map<string, RecordSheetValue>>();
    for (const change of changes) {
      const row = this.rows.get(change.id);
      if (!row || this.missing.has(change.id) || !row.editable.includes(change.field) || !own(row.values, change.field)) throw new Error('包含无效记录或只读字段，整次编辑未应用。');
      if (change.value !== null && (typeof change.value !== 'string' || change.value.length > 32767 || /^\s*=/.test(change.value) || [...change.value].some(char => char.charCodeAt(0) < 32 && !['\t', '\n', '\r'].includes(char)))) throw new Error('字段只接受明确的文本或空值，不能输入公式或控制字符。');
      let fields = staged.get(change.id); if (!fields) { fields = new Map(); staged.set(change.id, fields); }
      fields.set(change.field, change.value); // deterministic last input for one batched cell
    }
    const history: History = [];
    for (const [id, fields] of staged) {
      const values = this.desired.get(id)!;
      for (const [field, value] of fields) {
        const before = values[field]!; if (before === value) continue;
        history.push({ id, field, value, before, after: value }); values[field] = value;
        let versions = this.versions.get(id); if (!versions) { versions = new Map(); this.versions.set(id, versions); } versions.set(field, ++this.sequence);
      }
      this.refresh(id, fields.keys());
    }
    if (recordHistory && history.length) { this.undoStack.push(history); this.redoStack.length = 0; }
    return history.map(({ id, field, after }) => ({ id, field, value: after }));
  }
  undo(): RecordSheetChange[] { const entry = this.undoStack.at(-1); if (!entry) return []; const result = this.apply(entry.map(({ id, field, before }) => ({ id, field, value: before })), false); this.undoStack.pop(); this.redoStack.push(entry); return result; }
  redo(): RecordSheetChange[] { const entry = this.redoStack.at(-1); if (!entry) return []; const result = this.apply(entry.map(({ id, field, after }) => ({ id, field, value: after })), false); this.redoStack.pop(); this.undoStack.push(entry); return result; }
  patches(): readonly RecordSheetPatch[] {
    return this.patchCache ??= [...this.dirtyFields].map(([id, fields]) => ({ id, expectedRevision: this.expected.get(id)!, ...(this.rows.get(id)?.dependencies ? { expectedDependencies: { ...this.expectedDependencies.get(id) } } : {}), changes: Object.fromEntries([...fields].map(field => [field, this.desired.get(id)![field]!])) }));
  }
  errors(): readonly RecordSheetIssue[] { return [...this.errorsById.values()].flat(); }
  conflicts(): RecordSheetConflict[] {
    return this.patches().filter(patch => this.missing.has(patch.id) || patch.expectedRevision !== this.rows.get(patch.id)!.revision || !sameDependencies(this.expectedDependencies.get(patch.id), this.rows.get(patch.id)!.dependencies)).map(patch => ({ id: patch.id, missing: this.missing.has(patch.id), expectedRevision: patch.expectedRevision, currentRevision: this.rows.get(patch.id)!.revision, fields: Object.keys(patch.changes).map(field => ({ field, server: this.rows.get(patch.id)!.values[field] ?? null, desired: this.desired.get(patch.id)![field]! })) }));
  }
  beginBatch(limit = 50, operationId: string = crypto.randomUUID()): RecordSaveBatch | null {
    if (this.errors().length || this.conflicts().length) throw new Error('先处理校验错误或版本冲突，再保存。');
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error('保存批次上限无效。');
    const items = this.patches().slice(0, limit).map(patch => ({ ...patch, changes: { ...patch.changes } })); if (!items.length) return null;
    return { operationId, sequence: this.sequence, items, versions: new Map(items.map(patch => [patch.id, new Map(Object.keys(patch.changes).map(field => [field, this.versions.get(patch.id)?.get(field) ?? 0]))])) };
  }
  confirm(saved: readonly RecordSheetRow<TMeta>[], batch: RecordSaveBatch, related: readonly RecordSheetRow<TMeta>[] = []): RecordSheetChange[] {
    const submitted = new Map(batch.items.map(item => [item.id, item])); const seen = new Set<string>();
    const normalized = saved.map(raw => { const row = checked(raw), patch = submitted.get(row.id), old = this.rows.get(row.id); if (!patch || !old || seen.has(row.id) || row.revision < old.revision || row.revision < patch.expectedRevision || dependencyRollback(old.dependencies, row.dependencies) || (patch.expectedDependencies && dependencyRollback(patch.expectedDependencies, row.dependencies)) || Object.keys(old.values).some(field => !own(row.values, field))) throw new Error('保存响应记录或版本不完整；保留输入并核实原操作结果。'); seen.add(row.id); return row; });
    if (seen.size !== submitted.size) throw new Error('保存响应缺少记录；保留输入并核实原操作结果。');
    // Validate every related row before mutating anything. Only a shared parent
    // fact can advance here; a different primary-fact revision needs a refresh.
    const siblings = related.map(raw => {
      const row = checked(raw), old = this.rows.get(row.id);
      if (!old || seen.has(row.id) || row.revision !== old.revision || Object.keys(old.values).some(field => !own(row.values, field)) || Object.keys(old.dependencies ?? {}).length !== Object.keys(row.dependencies ?? {}).length || Object.entries(old.dependencies ?? {}).some(([id, revision]) => (row.dependencies?.[id] ?? 0) < revision)) throw new Error('关联保存响应身份或版本不完整；保留输入并核实原操作结果。');
      seen.add(row.id); return row;
    });
    const updates: RecordSheetChange[] = [];
    for (const row of normalized) {
      const patch = submitted.get(row.id)!, old = this.rows.get(row.id)!, values = this.desired.get(row.id)!;
      for (const [field, server] of Object.entries(row.values)) {
        const before = values[field];
        const unchangedSinceSend = (this.versions.get(row.id)?.get(field) ?? 0) === (batch.versions.get(row.id)?.get(field) ?? 0);
        if (own(patch.changes, field) ? unchangedSinceSend : values[field] === old.values[field] && (this.versions.get(row.id)?.get(field) ?? 0) <= batch.sequence) values[field] = server;
        if (before !== values[field]) updates.push({ id: row.id, field, value: values[field]! });
      }
      this.rows.set(row.id, row); this.expected.set(row.id, row.revision); this.expectedDependencies.set(row.id, { ...row.dependencies }); this.missing.delete(row.id); this.refresh(row.id, Object.keys(values));
    }
    for (const row of siblings) {
      const old = this.rows.get(row.id)!, values = this.desired.get(row.id)!;
      for (const [field, server] of Object.entries(row.values)) {
        const before = values[field];
        // A return to the old value after sending is still a new user intent.
        // The batch sequence preserves it without snapshotting every sibling.
        if (values[field] === old.values[field] && (this.versions.get(row.id)?.get(field) ?? 0) <= batch.sequence) values[field] = server;
        if (before !== values[field]) updates.push({ id: row.id, field, value: values[field]! });
      }
      this.rows.set(row.id, row); this.expectedDependencies.set(row.id, { ...row.dependencies });
      this.refresh(row.id, Object.keys(values));
    }
    return updates;
  }
  /** Full authorized refresh. Keeps drafts, marks missing rows, invalidates
   * inverses touched by another writer, and never silently rebases conflicts. */
  latest(incoming: readonly RecordSheetRow<TMeta>[]) {
    const next = new Map<string, RecordSheetRow<TMeta>>();
    for (const raw of incoming) { const row = checked(raw); if (next.has(row.id)) throw new Error('刷新结果包含重复 ID。'); next.set(row.id, row); }
    for (const [id, row] of next) if (this.rows.has(id) && (row.revision < this.rows.get(id)!.revision || dependencyRollback(this.rows.get(id)!.dependencies, row.dependencies))) throw new Error('刷新版本倒退，请核对环境或缓存。');
    const changed = new Set<string>();
    for (const [id, previous] of [...this.rows]) {
      const row = next.get(id);
      if (!row) {
        changed.add(id);
        if (this.dirtyFields.has(id)) { this.missing.add(id); this.refresh(id, Object.keys(this.desired.get(id)!)); }
        else { this.rows.delete(id); this.desired.delete(id); this.expected.delete(id); this.expectedDependencies.delete(id); this.displayCache.delete(id); this.versions.delete(id); }
        continue;
      }
      if (row.revision !== previous.revision || !sameDependencies(row.dependencies, previous.dependencies)) changed.add(id);
      const dirty = this.dirtyFields.get(id), values = this.desired.get(id)!;
      this.rows.set(id, row); this.missing.delete(id);
      for (const [field, value] of Object.entries(row.values)) if (!dirty?.has(field)) values[field] = value;
      if (!dirty?.size) { this.expected.set(id, row.revision); this.expectedDependencies.set(id, { ...row.dependencies }); }
      this.refresh(id, Object.keys(values)); next.delete(id);
    }
    for (const [id, row] of next) { this.rows.set(id, row); this.desired.set(id, { ...row.values }); this.expected.set(id, row.revision); this.expectedDependencies.set(id, { ...row.dependencies }); }
    const trim = (history: History[]) => { const kept = history.filter(entry => !entry.some(change => changed.has(change.id))); history.splice(0, history.length, ...kept); };
    trim(this.undoStack); trim(this.redoStack); this.patchCache = null;
  }
  resolve(id: string, keep: boolean) {
    const row = this.rows.get(id); if (!row) return;
    if (this.missing.has(id)) { if (keep) throw new Error('已不可读取的记录不能继续保存；可复制输入后放弃草稿。'); this.rows.delete(id); this.desired.delete(id); this.dirtyFields.delete(id); this.expected.delete(id); this.expectedDependencies.delete(id); this.errorsById.delete(id); this.missing.delete(id); this.displayCache.delete(id); this.patchCache = null; }
    else { if (!keep) this.desired.set(id, { ...row.values }); this.expected.set(id, row.revision); this.expectedDependencies.set(id, { ...row.dependencies }); this.refresh(id, Object.keys(this.desired.get(id)!)); }
    for (const history of [this.undoStack, this.redoStack]) { const kept = history.filter(entry => !entry.some(change => change.id === id)); history.splice(0, history.length, ...kept); }
  }
}
