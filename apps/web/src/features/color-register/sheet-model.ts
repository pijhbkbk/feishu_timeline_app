import type { RegisterRow } from './client';

export const EDITABLE_FIELDS = ['note', 'boardCode', 'manufacturer', 'paintType', 'registerMonth'] as const;
export type SheetField = typeof EDITABLE_FIELDS[number];
export type SheetChange = { id: string; field: string; value: string | null };
export type SheetPatch = { id: string; expectedRevision: number; changes: Partial<Record<SheetField, string | null>> };
type Values = Record<SheetField, string | null>;
type History = Array<{ id: string; field: SheetField; before: string | null; after: string | null }>;
export const SHEET_COLUMNS = [
  { key: 'name', label: '颜色名称', width: 150 }, { key: 'baseName', label: '生产基地', width: 130 },
  { key: 'note', label: '备注', width: 230 }, { key: 'boardCode', label: '色板编号', width: 145 },
  { key: 'manufacturer', label: '制作单位', width: 150 }, { key: 'paintType', label: '漆种', width: 150 },
  { key: 'formalCode', label: '正式编号', width: 135 }, { key: 'registerMonth', label: '入清单月份', width: 130 },
  { key: 'registerStatus', label: '清单状态', width: 120 }, { key: 'sourceSummary', label: '来源', width: 360 },
];
export function isSheetField(field: string): field is SheetField { return (EDITABLE_FIELDS as readonly string[]).includes(field); }
function values(row: RegisterRow): Values { return Object.fromEntries(EDITABLE_FIELDS.map(field => [field, row[field]])) as Values; }
export function editable(row: RegisterRow, field: string) { return field === 'note' || (isSheetField(field) && row.registerStatus === 'LISTED'); }

/** Business values have exactly one authority: the API. The sheet holds explicit drafts only. */
export class CatalogSheetModel {
  rows = new Map<string, RegisterRow>();
  desired = new Map<string, Values>();
  expected = new Map<string, number>();
  undoStack: History[] = [];
  redoStack: History[] = [];
  constructor(rows: RegisterRow[]) { rows.forEach(row => { this.rows.set(row.id, row); this.desired.set(row.id, values(row)); this.expected.set(row.id, row.revision); }); }
  display(id: string): RegisterRow { return { ...this.rows.get(id)!, ...this.desired.get(id)! }; }
  apply(changes: SheetChange[], recordHistory = true) {
    const history: History = [];
    for (const change of changes) {
      const row = this.rows.get(change.id);
      if (!row || !isSheetField(change.field) || !editable(row, change.field)) throw new Error('包含只读字段或无效记录，整次编辑未应用。');
      const before = this.desired.get(change.id)![change.field];
      if (before !== change.value) history.push({ ...change, field: change.field, before, after: change.value });
    }
    history.forEach(change => { this.desired.get(change.id)![change.field] = change.after; });
    if (recordHistory && history.length) { this.undoStack.push(history); this.redoStack = []; }
  }
  undo(): SheetChange[] { const entry = this.undoStack.pop(); if (!entry) return []; const changes = entry.map(x => ({ id: x.id, field: x.field, value: x.before })); this.apply(changes, false); this.redoStack.push(entry); return changes; }
  redo(): SheetChange[] { const entry = this.redoStack.pop(); if (!entry) return []; const changes = entry.map(x => ({ id: x.id, field: x.field, value: x.after })); this.apply(changes, false); this.undoStack.push(entry); return changes; }
  patches(): SheetPatch[] {
    return [...this.rows.values()].flatMap(row => {
      const changes = Object.fromEntries(EDITABLE_FIELDS.filter(field => this.desired.get(row.id)![field] !== row[field]).map(field => [field, this.desired.get(row.id)![field]]));
      return Object.keys(changes).length ? [{ id: row.id, expectedRevision: this.expected.get(row.id)!, changes }] : [];
    });
  }
  confirm(saved: RegisterRow[], submitted: SheetPatch[]) {
    // Preserve edits made while a request was in flight, including reverting to the old value.
    for (const row of saved) {
      const patch = submitted.find(x => x.id === row.id); const desired = this.desired.get(row.id);
      if (!patch || !desired) continue;
      for (const field of EDITABLE_FIELDS) if (Object.hasOwn(patch.changes, field) && desired[field] === patch.changes[field]) desired[field] = row[field];
      this.rows.set(row.id, row); this.expected.set(row.id, row.revision);
    }
  }
  latest(rows: RegisterRow[]) {
    const drafts = new Map(this.patches().map(patch => [patch.id, patch]));
    const externallyChanged = new Set(rows.filter(row => this.rows.get(row.id)?.revision !== row.revision).map(row => row.id));
    // Once another writer advances a record, old inverses must not borrow that new revision.
    this.undoStack = this.undoStack.filter(entry => !entry.some(change => externallyChanged.has(change.id)));
    this.redoStack = this.redoStack.filter(entry => !entry.some(change => externallyChanged.has(change.id)));
    for (const row of rows) {
      if (!this.rows.has(row.id)) continue;
      const draft = drafts.get(row.id);
      this.rows.set(row.id, row); this.desired.set(row.id, { ...values(row), ...draft?.changes });
      if (!draft) this.expected.set(row.id, row.revision);
    }
  }
  resolve(id: string, keep: boolean) { const row = this.rows.get(id)!; if (!keep) this.desired.set(id, values(row)); this.expected.set(id, row.revision); this.undoStack = []; this.redoStack = []; }
  conflicts() { return this.patches().filter(patch => this.rows.get(patch.id)!.revision !== patch.expectedRevision); }
  errors(paintTypes: string[], manufacturers: string[]) {
    return this.patches().flatMap(patch => Object.entries(patch.changes).flatMap(([field, value]) => {
      const label = SHEET_COLUMNS.find(column => column.key === field)!.label;
      const row = this.rows.get(patch.id)!;
      let message = '';
      if (value !== null && typeof value !== 'string') message = '只接受明确的文字值';
      else if (value && value.length > (field === 'note' ? 4000 : field === 'registerMonth' ? 7 : field === 'boardCode' ? 128 : 200)) message = '内容超长';
      else if (value?.startsWith('=')) message = '不接受公式，请输入明确业务值';
      else if (field === 'registerMonth' && value && !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) message = '使用 YYYY-MM 格式';
      else if (field === 'paintType' && value && value !== row.paintType && !paintTypes.includes(value)) message = '请选择已有漆种';
      else if (field === 'manufacturer' && value && value !== row.manufacturer && !manufacturers.includes(value)) message = '请选择已有制作单位';
      return message ? [{ id: row.id, field, message: `${row.name ?? '未命名'} · ${label}：${message}` }] : [];
    }));
  }
}
