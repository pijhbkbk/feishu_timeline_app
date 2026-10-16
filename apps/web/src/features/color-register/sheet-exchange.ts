import ExcelJS from 'exceljs';
import { Inflate, strFromU8, zipSync } from 'fflate';

/**
 * Adapted from Personal Sheets src/formats/zip.ts and src/formats/xlsx.ts
 * (01c3009ba79151705d4fef716a7c92568ae2ee45). This module only exchanges
 * values; all writes must use the authenticated color-register business API.
 * Import this module dynamically from the browser UI; it has no Node imports.
 */
export const CATALOG_XLSX_LIMITS = { fileBytes: 5 * 1024 * 1024, expandedBytes: 20 * 1024 * 1024, rows: 1000, columns: 32, sheets: 32, zipEntries: 512 } as const;
const TEMPLATE_MARKER = 'COLOR_CATALOG_TEMPLATE_V1';
const TEMPLATE_SHEET = '颜色清单';
const METADATA_SHEET = '_颜色清单模板';

/** Structural subset of client.ts RegisterRow; no second business model. */
export interface CatalogExchangeRow {
  id: string; revision: number; name: string | null; base: { id: string; name: string } | null;
  note: string | null; boardCode: string | null; manufacturer: string | null; paintType: string | null;
  formalCode: string | null; registerMonth: string | null; registerStatus: string;
  productionApprovalStatus: string; sourceSummary: string | null;
}
export type CatalogEditableField = 'note' | 'boardCode' | 'manufacturer' | 'paintType' | 'registerMonth';
export type CatalogField = CatalogEditableField | 'id' | 'revision' | 'name' | 'baseName' | 'formalCode' | 'registerStatus' | 'productionApprovalStatus' | 'sourceSummary';
export const CATALOG_COLUMNS: ReadonlyArray<{ field: CatalogField; label: string; editable: boolean; hidden?: boolean; width: number }> = [
  { field: 'id', label: '记录ID', editable: false, hidden: true, width: 38 },
  { field: 'revision', label: '记录版本', editable: false, hidden: true, width: 12 },
  { field: 'name', label: '颜色名称', editable: false, width: 20 },
  { field: 'baseName', label: '生产基地', editable: false, width: 18 },
  { field: 'note', label: '备注', editable: true, width: 32 },
  { field: 'boardCode', label: '色板编号', editable: true, width: 22 },
  { field: 'manufacturer', label: '制作单位', editable: true, width: 22 },
  { field: 'paintType', label: '漆种', editable: true, width: 18 },
  { field: 'formalCode', label: '正式编号', editable: false, width: 22 },
  { field: 'registerMonth', label: '入清单月份', editable: true, width: 16 },
  { field: 'registerStatus', label: '清单状态', editable: false, width: 18 },
  { field: 'productionApprovalStatus', label: '生产批准状态', editable: false, width: 18 },
  { field: 'sourceSummary', label: '来源信息', editable: false, width: 36 },
];
const EDITABLE = new Set<CatalogField>(CATALOG_COLUMNS.filter(column => column.editable).map(column => column.field));
const FIELD_NAMES = new Set<CatalogField>(CATALOG_COLUMNS.map(column => column.field));
const COLUMN_LABELS = new Map(CATALOG_COLUMNS.map(column => [column.field, column.label]));

export interface CatalogImportCell { value: string | number | boolean | null; error?: string; }
export interface CatalogImportSheet { id: string; name: string; rows: CatalogImportCell[][]; mergedRanges: string[]; }
export interface CatalogImportWorkbook { fileName: string; template: boolean; sheets: CatalogImportSheet[]; }
/** Column indices are zero-based; headerRow is the displayed one-based row. */
export type CatalogColumnMapping = Partial<Record<number, CatalogField>>;
export interface CatalogImportOptions {
  sheetId: string; headerRow: number; mapping?: CatalogColumnMapping;
  /** Only explicitly selected fields may clear an existing value via an empty cell. */
  clearBlankFields?: readonly CatalogEditableField[];
  /** Optional existing dictionaries: never create unknown items while importing. */
  paintTypes?: readonly string[]; manufacturers?: readonly string[];
}
export interface CatalogImportIssue { row: number; field?: CatalogField; message: string; }
export interface CatalogFieldDiff { field: CatalogField; label: string; before: string | null; after: string | null; editable: boolean; }
export interface CatalogImportChange { id: string; expectedRevision: number; changes: Partial<Record<CatalogEditableField, string | null>>; }
export interface CatalogImportRecord {
  row: number; id: string | null; status: 'update' | 'unchanged' | 'error' | 'conflict' | 'pending';
  values: Partial<Record<CatalogField, string | null>>;
  diffs: CatalogFieldDiff[]; errors: CatalogImportIssue[]; message: string; requiresReason: boolean;
}
export interface CatalogImportPreview {
  template: boolean; mode: 'template-update' | 'ordinary-preview';
  counts: { added: number; updated: number; unchanged: number; errors: number; conflicts: number; pending: number };
  mapping: CatalogColumnMapping; unmappedColumns: Array<{ column: number; header: string }>;
  records: CatalogImportRecord[]; errors: CatalogImportIssue[]; changes: CatalogImportChange[];
  requiresReason: boolean; canSubmit: boolean;
}

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(bytes: Uint8Array): number {
  let result = 0xffffffff;
  for (const byte of bytes) result = CRC_TABLE[(result ^ byte) & 255]! ^ (result >>> 8);
  return (result ^ 0xffffffff) >>> 0;
}

/** Validate ZIP metadata before any allocation, then verify actual bytes/CRC. */
export function inspectCatalogArchive(bytes: Uint8Array): Record<string, Uint8Array> {
  if (bytes.byteLength > CATALOG_XLSX_LIMITS.fileBytes) throw new Error('Excel 文件不能超过 5 MiB。');
  if (bytes.byteLength < 22) throw new Error('Excel 文件不是完整的 XLSX 归档。');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--) {
    if (view.getUint32(offset, true) === 0x06054b50 && offset + 22 + view.getUint16(offset + 20, true) === bytes.length) { end = offset; break; }
  }
  if (end < 0) throw new Error('Excel 归档目录损坏。');
  if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true)) throw new Error('不支持分卷 Excel 归档。');
  const count = view.getUint16(end + 10, true);
  let position = view.getUint32(end + 16, true);
  const directoryStart = position;
  const directorySize = view.getUint32(end + 12, true);
  if (!count || count > CATALOG_XLSX_LIMITS.zipEntries || count !== view.getUint16(end + 8, true) || position + directorySize !== end) throw new Error('Excel 归档目录或文件数量超限。');
  const entries = new Map<string, { size: number; crc: number; method: number; contentStart: number; compressed: number }>();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let expanded = 0;
  for (let index = 0; index < count; index++) {
    if (position + 46 > end || view.getUint32(position, true) !== 0x02014b50) throw new Error('Excel 归档目录被截断。');
    const flags = view.getUint16(position + 8, true), method = view.getUint16(position + 10, true);
    const compressed = view.getUint32(position + 20, true), size = view.getUint32(position + 24, true);
    const nameLength = view.getUint16(position + 28, true), extraLength = view.getUint16(position + 30, true), commentLength = view.getUint16(position + 32, true);
    const localOffset = view.getUint32(position + 42, true);
    const next = position + 46 + nameLength + extraLength + commentLength;
    if (next > end || localOffset + 30 > directoryStart) throw new Error('Excel 归档条目被截断。');
    const name = decoder.decode(bytes.subarray(position + 46, position + 46 + nameLength));
    if (!name || name.startsWith('/') || name.includes('\\') || name.includes('\0') || name.split('/').includes('..') || /^[A-Za-z]:/.test(name) || entries.has(name)) throw new Error('Excel 归档包含不安全或重复路径。');
    if ((flags & 1) || (method !== 0 && method !== 8) || view.getUint32(localOffset, true) !== 0x04034b50) throw new Error('不支持加密或异常压缩格式。');
    const localNameLength = view.getUint16(localOffset + 26, true), localExtraLength = view.getUint16(localOffset + 28, true);
    const contentStart = localOffset + 30 + localNameLength + localExtraLength;
    if (contentStart + compressed > directoryStart || decoder.decode(bytes.subarray(localOffset + 30, localOffset + 30 + localNameLength)) !== name || view.getUint16(localOffset + 8, true) !== method || view.getUint16(localOffset + 6, true) !== flags) throw new Error('Excel 归档目录与内容不一致。');
    if ((expanded += size) > CATALOG_XLSX_LIMITS.expandedBytes || (compressed > 0 && size / compressed > 2000)) throw new Error('Excel 解压后超过 20 MiB 或压缩比例异常。');
    entries.set(name, { size, crc: view.getUint32(position + 16, true), method, contentStart, compressed });
    position = next;
  }
  if (position !== end) throw new Error('Excel 归档目录长度不一致。');
  const files: Record<string, Uint8Array> = Object.create(null) as Record<string, Uint8Array>;
  let actualExpanded = 0;
  for (const [name, entry] of entries) {
    const compressed = bytes.subarray(entry.contentStart, entry.contentStart + entry.compressed);
    const chunks: Uint8Array[] = []; let length = 0;
    const accept = (chunk: Uint8Array) => {
      length += chunk.length; actualExpanded += chunk.length;
      if (length > entry.size || actualExpanded > CATALOG_XLSX_LIMITS.expandedBytes) throw new Error('Excel 实际解压大小超出声明或 20 MiB 上限。');
      chunks.push(chunk);
    };
    if (entry.method === 0) accept(compressed);
    else {
      // Never allocate from an untrusted declared size or inflate an entire
      // compressed file before checking its real output length.
      const stream = new Inflate(chunk => accept(chunk));
      if (!compressed.length) stream.push(compressed, true);
      for (let offset = 0; offset < compressed.length; offset += 1024) stream.push(compressed.subarray(offset, offset + 1024), offset + 1024 >= compressed.length);
    }
    if (length !== entry.size) throw new Error('Excel 归档解压大小不一致。');
    const file = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { file.set(chunk, offset); offset += chunk.length; }
    if (crc32(file) !== entry.crc) throw new Error('Excel 归档字节校验失败。');
    files[name] = file;
    if (/\.(?:xml|rels)$/i.test(name) && /<!DOCTYPE|<!ENTITY/i.test(strFromU8(file))) throw new Error('Excel XML 不允许外部实体。');
  }
  if (!files['[Content_Types].xml'] || !files['xl/workbook.xml']) throw new Error('请选择 .xlsx 工作簿文件。');
  return files;
}

function columnNumber(letters: string): number {
  return [...letters].reduce((column, letter) => column * 26 + letter.charCodeAt(0) - 64, 0);
}
/** A bad dimension or sparse far-away cell must be rejected before ExcelJS loads it. */
function inspectSheetBounds(files: Record<string, Uint8Array>): void {
  const sheets = Object.entries(files).filter(([name]) => /^xl\/worksheets\/[^/]+\.xml$/i.test(name));
  if (!sheets.length || sheets.length > CATALOG_XLSX_LIMITS.sheets) throw new Error('工作表数量须为 1–32。');
  for (const [, bytes] of sheets) {
    const xml = strFromU8(bytes);
    for (const match of xml.matchAll(/<(?:[\w.-]+:)?(?:c|dimension|mergeCell)\b[^>]*\b(?:r|ref)\s*=\s*["']([^"']+)["']/g)) {
      const range = match[1]!;
      for (const address of range.split(':')) {
        const coordinate = /^([A-Z]+)([1-9]\d*)$/.exec(address);
        if (!coordinate || Number(coordinate[2]) > CATALOG_XLSX_LIMITS.rows || columnNumber(coordinate[1]!) > CATALOG_XLSX_LIMITS.columns) throw new Error('工作表最多支持 1000 行（含表头）、32 列，请缩小导入范围。');
      }
    }
    for (const match of xml.matchAll(/<(?:[\w.-]+:)?row\b[^>]*\br\s*=\s*["'](\d+)["']/g)) {
      if (Number(match[1]) > CATALOG_XLSX_LIMITS.rows || Number(match[1]) < 1) throw new Error('工作表行号超出 1–1000。');
    }
  }
}

function importCell(cell: ExcelJS.Cell): CatalogImportCell {
  const value = cell.value;
  if (cell.type === ExcelJS.ValueType.Formula || (value && typeof value === 'object' && ('formula' in value || 'sharedFormula' in value))) return { value: null, error: '公式不能写入业务记录；请先在 Excel 中转为明确的值。' };
  if (value === null || value === undefined) return { value: null };
  if (typeof value === 'string' || typeof value === 'boolean') return { value };
  if (typeof value === 'number') return Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value)) ? { value } : { value: null, error: '数值超出可准确读取范围；编号请使用文本格式。' };
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? { value: null, error: '日期无效。' } : { value: value.toISOString().slice(0, 10) };
  if ('richText' in value) return { value: value.richText.map(part => part.text).join('') };
  if ('hyperlink' in value) return { value: value.text };
  return { value: null, error: '不支持此单元格值；错误值、图片和公式缓存不能作为业务输入。' };
}

export async function readCatalogWorkbook(bytes: Uint8Array, fileName = '颜色清单.xlsx'): Promise<CatalogImportWorkbook> {
  const files = inspectCatalogArchive(bytes);
  inspectSheetBounds(files);
  const workbook = new ExcelJS.Workbook();
  // ExcelJS declares a Buffer-like argument; Uint8Array is its supported browser input.
  // Only hand the bounded, verified contents to the second parser. It must not
  // reinterpret an original archive with conflicting size or offset metadata.
  const verifiedArchive = zipSync(files, { level: 0 });
  await workbook.xlsx.load(verifiedArchive as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const marker = workbook.getWorksheet(METADATA_SHEET)?.getCell('A1').value;
  const template = marker === TEMPLATE_MARKER;
  const sheets: CatalogImportSheet[] = [];
  for (const sheet of workbook.worksheets) {
    if (sheet.name === METADATA_SHEET && template) continue;
    if (sheet.rowCount > CATALOG_XLSX_LIMITS.rows || sheet.columnCount > CATALOG_XLSX_LIMITS.columns) throw new Error('工作表最多支持 1000 行（含表头）、32 列。');
    const rows: CatalogImportCell[][] = [];
    for (let row = 1; row <= sheet.rowCount; row++) {
      rows.push(Array.from({ length: sheet.columnCount }, (_, column) => importCell(sheet.getCell(row, column + 1))));
    }
    sheets.push({ id: String(sheet.id), name: sheet.name, rows, mergedRanges: [...(sheet.model.merges ?? [])] });
  }
  return { fileName, template, sheets };
}

export function suggestCatalogMapping(sheet: CatalogImportSheet, headerRow: number): CatalogColumnMapping {
  const mapping: CatalogColumnMapping = {};
  const labels = new Map(CATALOG_COLUMNS.map(column => [column.label, column.field]));
  for (const [index, cell] of (sheet.rows[headerRow - 1] ?? []).entries()) {
    const field = labels.get(String(cell.value ?? '').trim());
    if (field) mapping[index] = field;
  }
  return mapping;
}

function rowValue(row: CatalogExchangeRow, field: CatalogField): string | null {
  if (field === 'baseName') return row.base?.name ?? null;
  const value = row[field];
  return value === null ? null : String(value);
}
function isBlank(value: CatalogImportCell['value']): boolean { return value === null || (typeof value === 'string' && value.trim() === ''); }
function normalizedCell(cell: CatalogImportCell, field: CatalogField): string | null {
  if (isBlank(cell.value)) return null;
  const value = String(cell.value);
  if (field === 'registerMonth' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value.slice(0, 7);
  return value;
}
function editableError(field: CatalogEditableField, value: string | null, options: CatalogImportOptions): string | undefined {
  if (value === null) return;
  const max = field === 'note' ? 4000 : field === 'boardCode' ? 128 : 200;
  if (value.includes('\0') || value.length > max) return `${COLUMN_LABELS.get(field)}不能含空字符，且最多 ${max} 字。`;
  if (field === 'registerMonth' && !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return '入清单月份请使用 YYYY-MM。';
  const dictionary = field === 'paintType' ? options.paintTypes : field === 'manufacturer' ? options.manufacturers : undefined;
  if (dictionary && !dictionary.includes(value)) return `${COLUMN_LABELS.get(field)}未匹配现有选项，不会自动新建。`;
}

export function previewCatalogImport(workbook: CatalogImportWorkbook, options: CatalogImportOptions, authorizedRows: readonly CatalogExchangeRow[]): CatalogImportPreview {
  const sheet = workbook.sheets.find(candidate => candidate.id === options.sheetId);
  if (!sheet) throw new Error('请选择存在的工作表。');
  if (!Number.isInteger(options.headerRow) || options.headerRow < 1 || options.headerRow > sheet.rows.length) throw new Error('请选择有效的表头行。');
  const mapping = options.mapping ?? suggestCatalogMapping(sheet, options.headerRow);
  const mappingEntries = Object.entries(mapping).filter((entry): entry is [string, CatalogField] => entry[1] !== undefined);
  const template = workbook.template && sheet.name === TEMPLATE_SHEET;
  const preview: CatalogImportPreview = {
    template, mode: template ? 'template-update' : 'ordinary-preview',
    counts: { added: 0, updated: 0, unchanged: 0, errors: 0, conflicts: 0, pending: 0 },
    mapping, unmappedColumns: [], records: [], errors: [], changes: [], requiresReason: false, canSubmit: false,
  };
  const mappingValues = new Set<CatalogField>();
  for (const [column, field] of mappingEntries) {
    if (!Number.isInteger(Number(column)) || Number(column) < 0 || Number(column) >= CATALOG_XLSX_LIMITS.columns || !FIELD_NAMES.has(field)) throw new Error('列映射包含无效字段。');
    if (mappingValues.has(field)) preview.errors.push({ row: options.headerRow, field, message: `多列映射到${COLUMN_LABELS.get(field)}，请保留一列。` });
    mappingValues.add(field);
  }
  if (template && (!mappingValues.has('id') || !mappingValues.has('revision'))) preview.errors.push({ row: options.headerRow, message: '系统模板必须保留记录 ID 与记录版本列。' });
  for (const [column, cell] of (sheet.rows[options.headerRow - 1] ?? []).entries()) {
    if (!mapping[column] && !isBlank(cell.value)) preview.unmappedColumns.push({ column, header: String(cell.value) });
  }
  const byId = new Map(authorizedRows.map(row => [row.id, row]));
  if (byId.size !== authorizedRows.length) throw new Error('当前读取的记录 ID 重复，请重新读取。');
  const idColumn = mappingEntries.find(([, field]) => field === 'id')?.[0];
  const idCounts = new Map<string, number>();
  for (const cells of sheet.rows.slice(options.headerRow)) {
    const id = idColumn === undefined ? '' : String(cells[Number(idColumn)]?.value ?? '').trim();
    if (id) idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
  }
  const clear = new Set(options.clearBlankFields ?? []);
  for (let index = options.headerRow; index < sheet.rows.length; index++) {
    const cells = sheet.rows[index]!;
    if (!cells.some(cell => cell.error || !isBlank(cell.value))) continue;
    const id = idColumn === undefined ? null : String(cells[Number(idColumn)]?.value ?? '').trim() || null;
    const record: CatalogImportRecord = { row: index + 1, id, status: 'unchanged', values: {}, diffs: [], errors: [], message: '', requiresReason: false };
    const issue = (message: string, field?: CatalogField) => record.errors.push({ row: index + 1, ...(field ? { field } : {}), message });
    for (const [column, field] of mappingEntries) {
      const cell = cells[Number(column)];
      const error = cell?.error;
      if (error) issue(error, field);
      else if (cell) record.values[field] = normalizedCell(cell, field);
    }
    const current = id ? byId.get(id) : undefined;
    if (id && (!/^[A-Za-z0-9_-]{1,128}$/.test(id) || (idCounts.get(id) ?? 0) > 1)) issue('记录 ID 无效或重复；不会转为新增。', 'id');
    if (id && !current) issue('记录不存在或不在当前获准读取范围；请重新读取所需记录，不会转为新增。', 'id');
    const changes: CatalogImportChange['changes'] = {};
    let revision: number | undefined;
    if (current) {
      for (const [column, field] of mappingEntries) {
        const cell = cells[Number(column)];
        if (field === 'id') continue;
        if (field === 'revision') {
          const raw = String(cell?.value ?? '').trim();
          if (!/^[1-9]\d*$/.test(raw) || Number(raw) > 2147483647) issue('记录版本必须为有效正整数。', field);
          else revision = Number(raw);
          continue;
        }
        if (!cell || cell.error) continue;
        const editable = EDITABLE.has(field);
        // Blanks only clear fields selected explicitly in the preview UI.
        if (isBlank(cell.value) && !(editable && clear.has(field as CatalogEditableField))) continue;
        const after = normalizedCell(cell, field), before = rowValue(current, field);
        if ((after ?? '') === (before ?? '')) continue;
        record.diffs.push({ field, label: COLUMN_LABELS.get(field)!, before, after, editable });
        if (!editable) { issue(`${COLUMN_LABELS.get(field)}为只读字段，请使用原业务入口。`, field); continue; }
        const editableField = field as CatalogEditableField;
        if (field === 'boardCode' && typeof cell.value !== 'string' && cell.value !== null) issue('色板编号请使用 Excel 文本格式；数值格式可能丢失前导零或长编号精度。', field);
        const invalid = editableError(editableField, after, options);
        if (invalid) issue(invalid, field);
        if (field !== 'note') {
          record.requiresReason = true;
          if (current.registerStatus !== 'LISTED') issue('只有已入清单记录可更正标准资料；请使用原业务流程。', field);
        }
        changes[editableField] = after;
      }
      if (template && revision === undefined && !record.errors.some(error => error.field === 'revision')) issue('缺少记录版本，不能更新。', 'revision');
    }
    if (record.errors.length) { record.status = 'error'; record.message = '请修正本行错误后重新预览。'; preview.counts.errors++; }
    else if (current && revision !== undefined && revision !== current.revision) {
      record.status = 'conflict'; record.message = `文件版本 ${revision}，当前版本 ${current.revision}；请核对本次输入与服务端值。`;
      issue(record.message, 'revision'); preview.counts.conflicts++; preview.counts.errors++;
    } else if (!id) {
      record.status = 'pending'; record.message = '无记录 ID：本轮仅支持经原有流程创建，不会自动建档或发起项目。'; preview.counts.pending++;
    } else if (!template) {
      record.status = 'pending'; record.message = '普通 Excel 仅预览和映射；请使用系统导出模板更新。'; preview.counts.pending++;
    } else if (Object.keys(changes).length) {
      record.status = 'update'; record.message = record.requiresReason ? '确认时需填写标准更正原因。' : '待确认更新。'; preview.counts.updated++;
      preview.changes.push({ id: id!, expectedRevision: revision!, changes });
      preview.requiresReason ||= record.requiresReason;
    } else { record.status = 'unchanged'; record.message = '内容未改变，无需提交。'; preview.counts.unchanged++; }
    preview.records.push(record); preview.errors.push(...record.errors);
  }
  preview.counts.errors += preview.errors.filter(issue => issue.row === options.headerRow).length;
  preview.canSubmit = template && preview.changes.length > 0 && preview.errors.length === 0;
  return preview;
}

export async function exportCatalogTemplate(rows: readonly CatalogExchangeRow[]): Promise<Uint8Array> {
  if (rows.length >= CATALOG_XLSX_LIMITS.rows) throw new Error('单个模板最多导出 999 条记录，请缩小筛选范围。');
  if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('导出记录 ID 重复，请重新读取。');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '轻卡定制色';
  const sheet = workbook.addWorksheet(TEMPLATE_SHEET);
  sheet.columns = CATALOG_COLUMNS.map(column => ({ header: column.label, key: column.field, width: column.width, hidden: column.hidden ?? false }));
  sheet.views = [{ state: 'frozen', xSplit: 4, ySplit: 1 }];
  for (const row of rows) {
    const added = sheet.addRow(CATALOG_COLUMNS.map(column => column.field === 'revision' ? row.revision : rowValue(row, column.field)));
    for (const [index, definition] of CATALOG_COLUMNS.entries()) {
      const cell = added.getCell(index + 1);
      if (definition.field !== 'revision') cell.numFmt = '@';
      cell.protection = { locked: !definition.editable };
      cell.alignment = { vertical: 'top', wrapText: definition.field === 'note' };
    }
  }
  sheet.getRow(1).font = { bold: true, name: '等线', color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3F705B' } };
  sheet.getRow(1).height = 26;
  sheet.autoFilter = { from: { row: 1, column: 3 }, to: { row: rows.length + 1, column: CATALOG_COLUMNS.length } };
  const metadata = workbook.addWorksheet(METADATA_SHEET, { state: 'veryHidden' });
  metadata.getCell('A1').value = TEMPLATE_MARKER;
  metadata.getCell('A2').value = '记录 ID 和版本只用于匹配，服务端仍重新校验身份、权限和版本。';
  metadata.getCell('A3').value = '缺列不修改；空白默认忽略。清空须在导入预览明确选择。标准更正原因在确认页面填写。';
  // Protection is only an Excel UI hint. The import preview and business API
  // reject controlled-field changes even if the file is edited outside Excel.
  await sheet.protect('', { selectLockedCells: true, selectUnlockedCells: true, autoFilter: true, sort: true, formatColumns: true, spinCount: 1 });
  const bytes = new Uint8Array(await workbook.xlsx.writeBuffer());
  if (bytes.byteLength > CATALOG_XLSX_LIMITS.fileBytes) throw new Error('导出文件超过 5 MiB，请缩小范围。');
  return bytes;
}
