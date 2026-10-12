/** Business identity deliberately lives outside the editable workbook. */
export interface BusinessSheetColumn { key: string; label: string; width: number }
export interface BusinessSheetRow { id: string; values: (string | null)[]; editable: boolean[] }
export interface BusinessSheetChange { id: string; field: string; value: string | null }
export interface BusinessSheetUpdate extends BusinessSheetChange { expectedValue?: string | null }
export interface CellPosition { row: number; col: number }
export interface ValidatedMutation { changes: BusinessSheetChange[]; error: string | null }
type CellPatch = Record<string, unknown> | null;
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
export const VALUE_MUTATION = 'sheet.mutation.set-range-values';
const FORMAT_MUTATIONS = new Set([
  'sheet.mutation.set-worksheet-col-width', 'sheet.mutation.set-worksheet-row-height',
  'sheet.mutation.set-worksheet-row-is-auto-height', 'sheet.mutation.set-worksheet-row-auto-height',
  'sheet.mutation.set-frozen', 'sheet.mutation.toggle-gridlines', 'sheet.mutation.set-gridlines-color',
]);
export function allowedSheetMutation(id: string): boolean { return id === VALUE_MUTATION || FORMAT_MUTATIONS.has(id); }
export function forbiddenSheetCommand(id: string): boolean {
  return /(?:insert|remove|delete|move-range|move-row|move-col|reorder|sort|merge|copy-worksheet|rename-sheet|hide-row|hide-col|protection|defined-name|hyperlink|image|drawing|formula|validation|conditional|range-theme|custom-metadata)/.test(id)
    && /^(?:sheet|sheets|sidebar)\./.test(id);
}

export class BusinessSheetModel {
  readonly columns: readonly BusinessSheetColumn[];
  readonly rows: BusinessSheetRow[];
  private readonly rowById = new Map<string, number>();
  private readonly colByKey = new Map<string, number>();
  constructor(rows: BusinessSheetRow[], columns: BusinessSheetColumn[]) {
    if (!columns.length || columns.length > 100 || rows.length > 500) throw new Error('清单一次最多显示 500 行和 100 列。');
    this.columns = columns.map(value => ({ ...value }));
    columns.forEach((column, index) => {
      if (!column.key || this.colByKey.has(column.key)) throw new Error('清单字段必须唯一。');
      this.colByKey.set(column.key, index);
    });
    this.rows = rows.map((row, index) => {
      if (!row.id || this.rowById.has(row.id) || row.values.length !== columns.length || row.editable.length !== columns.length) throw new Error('清单记录身份或字段数量无效。');
      this.rowById.set(row.id, index + 1);
      return { ...row, values: [...row.values], editable: [...row.editable] };
    });
  }
  position(id: string, field: string): CellPosition | null {
    const row = this.rowById.get(id); const col = this.colByKey.get(field);
    return row === undefined || col === undefined ? null : { row, col };
  }
  identity(row: number, col: number): { id: string; field: string } | null {
    const item = this.rows[row - 1]; const column = this.columns[col];
    return item && column ? { id: item.id, field: column.key } : null;
  }
  value(row: number, col: number): string | null {
    return row === 0 ? this.columns[col]?.label ?? null : this.rows[row - 1]?.values[col] ?? null;
  }
  editable(row: number, col: number): boolean { return this.rows[row - 1]?.editable[col] === true; }
  apply(changes: readonly BusinessSheetChange[]): void {
    for (const change of changes) {
      const position = this.position(change.id, change.field);
      if (position) this.rows[position.row - 1]!.values[position.col] = change.value;
    }
  }
  /** Validate every cell before applying any cell. This also guards clipboard/fill/undo mutations. */
  validate(matrix: unknown): ValidatedMutation {
    const reject = (error: string): ValidatedMutation => ({ changes: [], error });
    if (!record(matrix)) return reject('不能清空整张业务清单。');
    const changes: BusinessSheetChange[] = []; let count = 0;
    for (const [rowKey, cells] of Object.entries(matrix)) {
      if (!/^(0|[1-9]\d*)$/.test(rowKey) || !record(cells)) return reject('单元格范围无效。');
      const row = Number(rowKey);
      for (const [colKey, raw] of Object.entries(cells)) {
        if (++count > 50000) return reject('一次修改的单元格过多。');
        const col = Number(colKey);
        if (!/^(0|[1-9]\d*)$/.test(colKey) || row > this.rows.length || col >= this.columns.length) return reject('不能在业务记录范围之外输入。');
        if (raw !== null && !record(raw)) return reject('单元格内容无效。');
        const patch: CellPatch = raw;
        if (patch && (Object.keys(patch).some(key => !['v', 't', 's', 'p', 'f', 'si', 'ref', 'ft', 'fd', 'custom'].includes(key)) || (patch.custom !== undefined && patch.custom !== null))) return reject('单元格包含不支持的内容。');
        if (patch && ['f', 'si', 'ref', 'ft', 'fd'].some(key => patch[key] !== undefined && patch[key] !== null && patch[key] !== '')) return reject('业务清单不支持公式，请输入文本。');
        if (patch && own(patch, 'p') && patch.p === null && !own(patch, 'v')) return reject('不能仅移除单元格正文。');
        let next = this.value(row, col); let hasValue = patch === null;
        if (patch === null) next = null;
        else if (patch.p !== undefined && patch.p !== null) {
          if (!record(patch.p) || !record(patch.p.body) || typeof patch.p.body.dataStream !== 'string') return reject('仅支持文本单元格。');
          const body = patch.p.body;
          if (['customBlocks', 'customRanges', 'tables'].some(key => Array.isArray(body[key]) && body[key].length)) return reject('业务单元格不支持图片、链接或嵌入对象。');
          next = (body.dataStream as string).replace(/\r\n$/, ''); hasValue = true;
        } else if (own(patch, 'v')) {
          if (patch.v !== null && patch.v !== undefined && !['string', 'number', 'boolean'].includes(typeof patch.v)) return reject('仅支持文本单元格。');
          next = patch.v === undefined || patch.v === null ? null : String(patch.v); hasValue = true;
        }
        if (hasValue && next !== null && /^\s*=/.test(next)) return reject('业务清单不支持公式，请输入文本。');
        if (hasValue && next !== null && [...next].some(char => char.charCodeAt(0) < 32 && !['\t', '\n', '\r'].includes(char))) return reject('单元格包含不支持的控制字符。');
        if (hasValue && next !== null && next.length > 32767) return reject('单元格文本过长。');
        if (hasValue && next === '') next = null;
        if (hasValue && next !== this.value(row, col)) {
          if (!this.editable(row, col)) return reject(row === 0 ? '表头不能修改。' : '所选内容含只读字段，未保存任何修改。');
          const identity = this.identity(row, col)!;
          changes.push({ ...identity, value: next });
        }
      }
    }
    return { changes, error: null };
  }
}
