import { DateSystem, excelSerialToDateTimeParts, getDateSystemMaxSerial, type ICellData, type IWorkbookData } from '@univerjs/core';
import type { ExchangeInput } from '../business-sheet/record-exchange';

/** Preparation only. Domain adapters and authenticated commands remain authoritative. */
export const BUSINESS_MAPPING_LIMITS = { rows: 2000, columns: 100, snapshotBytes: 7 * 1024 * 1024, text: 32767 } as const;
export type BusinessMappingTarget =
  | { kind: 'color' | 'person' }
  | { kind: 'production'; baseId: string | null; colorId: string | null }
  | { kind: 'inspection'; activityId: string; layer: 'occurrence' | 'measurement' | 'reading' | 'defect';
      objectId: string | null; colorId: string | null; occurrenceId: string | null; measurementId: string | null; standardVersionId: string | null };
export interface BusinessMappingField { key: string; label: string }
/** All coordinates are zero-based and inclusive, matching Univer. The range is DATA only. */
export interface BusinessMappingDefinition {
  target: BusinessMappingTarget; sheetId: string; headerRow: number;
  range: { startRow: number; endRow: number; startColumn: number; endColumn: number };
  fields: readonly { column: number; field: string }[];
  /** Empty cells otherwise keep the existing record value. This does not grant field permission. */
  clearFields: readonly string[];
}
export interface BusinessMappingSource {
  workbookId: string; formalRevision: number;
  /** Opaque server version hash. It need not equal JSON.stringify(snapshot)'s hash (JSONB order). */
  sourceSnapshotHash: string;
  snapshot: IWorkbookData;
}
export interface BusinessMappingBinding {
  workbookId: string; formalRevision: number; sourceSnapshotHash: string;
  fullJSONHash: string; mappingHash: string;
}
export type BusinessCellKind = 'blank' | 'string' | 'number' | 'boolean' | 'rich-text';
export interface BusinessMappingRow {
  input: ExchangeInput;
  /** An intention, not permission or a domain-validated create/update operation. */
  intent: 'new-record' | 'existing-record' | 'error';
  /** Preserve raw types: e.g. color boardCode must not accept a numeric cell as text. */
  cellKinds: Readonly<Record<string, BusinessCellKind>>;
}
export interface BusinessMappingPreview {
  kind: 'free-workbook-business-preview-v1'; binding: Readonly<BusinessMappingBinding>;
  definition: Readonly<BusinessMappingDefinition>; rows: readonly BusinessMappingRow[];
  headers: readonly { column: number; field: string; text: string | null; error: string | null }[];
  counts: { newRecords: number; existingRecords: number; errors: number; skippedBlankRows: number };
  /** Mapping never transfers drawing/background ownership or claims to apply business rules. */
  requiresDomainValidation: true; includesImages: false;
}
const UUID = /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const HASH = /^[a-f\d]{64}$/;
const FIELD = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const IDENTITIES = new Set(['__id', '__revision']);
const UNSAFE = new Set(['__proto__', 'constructor', 'prototype']);
const ERROR_VALUE = /^#(?:NULL!|DIV\/0!|VALUE!|REF!|NAME\?|NUM!|N\/A|SPILL!|CALC!|GETTING_DATA)$/;
// A deserialized preview must be prepared again. Keep its full source bytes private and immutable;
// the synchronous guard below has no asynchronous hash window between checking and constructing a request.
const captures = new WeakMap<BusinessMappingPreview, { sourceJSON: string; mappingJSON: string }>();
/** Return only the original immutable strings, never reconstruct a lost capture. */
export function readBusinessMappingCapture(preview: BusinessMappingPreview): Readonly<{ sourceJSON: string; mappingJSON: string }> {
  const capture = captures.get(preview);
  if (!capture) throw new Error('此预览没有保留来源原文，无法导出；请重新读取内容并预览。');
  return Object.freeze({ ...capture });
}
function fail(message: string): never { throw new Error(message); }
function integer(value: unknown, minimum: number, maximum: number): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum && value <= maximum; }
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function identifier(value: unknown): value is string { return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value); }
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}
function json(value: unknown, maxBytes: number): string {
  let text: string | undefined;
  try { text = JSON.stringify(value, (_key, child: unknown) => {
    if (typeof child === 'number' && !Number.isFinite(child) || typeof child === 'bigint' || typeof child === 'function' || typeof child === 'symbol') fail('映射来源须为有效 JSON 快照。');
    return child;
  }); } catch { return fail('映射来源须为有效 JSON 快照。'); }
  if (!text || new TextEncoder().encode(text).length > maxBytes) fail('映射来源超过大小上限。');
  return text;
}
async function hash(text: string): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), byte => byte.toString(16).padStart(2, '0')).join('');
}
function sourceJSON(source: BusinessMappingSource): string {
  if (!UUID.test(source.workbookId) || !integer(source.formalRevision, 1, 2147483647) || !HASH.test(source.sourceSnapshotHash) || source.snapshot.id !== source.workbookId) fail('工作簿身份、正式版本或来源摘要无效。');
  const snapshot = source.snapshot;
  if (snapshot.appVersion !== '1.0.4' || typeof snapshot.name !== 'string' || !snapshot.name.trim() || snapshot.name.length > 200 || !Array.isArray(snapshot.sheetOrder) || !snapshot.sheetOrder.length || snapshot.sheetOrder.length > 32 || new Set(snapshot.sheetOrder).size !== snapshot.sheetOrder.length || !object(snapshot.sheets)) fail('工作簿快照结构无效。');
  for (const id of snapshot.sheetOrder) {
    const sheet = snapshot.sheets[id];
    if (!sheet || sheet.id !== id || typeof sheet.name !== 'string' || !sheet.name.trim() || sheet.name.length > 200 || !integer(sheet.rowCount, 1, 10000) || !integer(sheet.columnCount, 1, 256)) fail('工作表身份或行列范围无效。');
  }
  return json(snapshot, BUSINESS_MAPPING_LIMITS.snapshotBytes);
}
function validateTarget(target: BusinessMappingTarget) {
  if (!object(target)) fail('请选择明确业务目标。');
  const keys = target.kind === 'color' || target.kind === 'person' ? ['kind'] : target.kind === 'production' ? ['kind', 'baseId', 'colorId'] : target.kind === 'inspection' ? ['kind', 'activityId', 'layer', 'objectId', 'colorId', 'occurrenceId', 'measurementId', 'standardVersionId'] : fail('业务目标无效。');
  if (Object.keys(target).length !== keys.length || Object.keys(target).some(key => !keys.includes(key))) fail('业务目标关联范围不完整。');
  for (const [key, value] of Object.entries(target)) if (key.endsWith('Id') && value !== null && !identifier(value)) fail('关联范围必须使用明确稳定 ID。');
  if (target.kind === 'inspection' && (!identifier(target.activityId) || !['occurrence', 'measurement', 'reading', 'defect'].includes(target.layer))) fail('请选择明确检验活动与事实层级。');
}
function mappingJSON(source: BusinessMappingSource, definition: BusinessMappingDefinition, columns: readonly BusinessMappingField[]): string {
  validateTarget(definition.target);
  const sheet = source.snapshot.sheets[definition.sheetId];
  if (!source.snapshot.sheetOrder.includes(definition.sheetId) || !sheet) fail('请选择工作簿中的明确工作表。');
  const rowCount = sheet.rowCount ?? 0, columnCount = sheet.columnCount ?? 0;
  const { range } = definition;
  if (!integer(definition.headerRow, 0, rowCount - 1) || !range || !integer(range.startRow, definition.headerRow + 1, rowCount - 1) || !integer(range.endRow, range.startRow, rowCount - 1) || !integer(range.startColumn, 0, columnCount - 1) || !integer(range.endColumn, range.startColumn, columnCount - 1)) fail('请选择表头下方的有效数据区域。');
  if (range.endRow - range.startRow + 1 > BUSINESS_MAPPING_LIMITS.rows || range.endColumn - range.startColumn + 1 > BUSINESS_MAPPING_LIMITS.columns) fail('单次映射最多 2000 行、100 列；请明确缩小区域。');
  if (!Array.isArray(columns) || !columns.length || columns.length > 100 || columns.some(column => !FIELD.test(column.key) || UNSAFE.has(column.key) || typeof column.label !== 'string' || !column.label || column.label.length > 200) || new Set(columns.map(column => column.key)).size !== columns.length) fail('业务字段字典无效；请使用当前适配器的字段。');
  const allowed = new Set([...columns.map(column => column.key), ...IDENTITIES]);
  if (!Array.isArray(definition.fields) || !definition.fields.length || definition.fields.length > 100 || definition.fields.some(entry => !integer(entry.column, range.startColumn, range.endColumn) || !allowed.has(entry.field))) fail('列映射超出选区或包含未知业务字段。');
  if (new Set(definition.fields.map(entry => entry.column)).size !== definition.fields.length || new Set(definition.fields.map(entry => entry.field)).size !== definition.fields.length) fail('同一列或同一业务字段不能重复映射。');
  if (!Array.isArray(definition.clearFields) || definition.clearFields.length > 100 || new Set(definition.clearFields).size !== definition.clearFields.length || definition.clearFields.some(field => IDENTITIES.has(field) || !definition.fields.some(entry => entry.field === field))) fail('只可明确清空已映射的业务字段；身份不能清空。');
  // Preserve exact choices, including their order, for a conservative apply guard.
  return json({ definition, columns }, 64 * 1024);
}
function readCell(cell: ICellData | null | undefined): { value: string | null; kind: BusinessCellKind } {
  if (cell === null || cell === undefined) return { value: null, kind: 'blank' };
  if (typeof cell !== 'object' || Array.isArray(cell)) fail('单元格结构无效。');
  if (cell.f || cell.si || cell.ref || cell.xf || cell.ft || cell.fd) fail('公式须先转换为明确业务值；不使用缓存计算值。');
  if (cell.custom && (!object(cell.custom) || Object.keys(cell.custom).length)) fail('带自定义关联的单元格须先核对为明确业务值。');
  let value: unknown = cell.v, kind: BusinessCellKind = 'blank';
  if (cell.p) {
    const body = cell.p.body;
    if (!body || typeof body.dataStream !== 'string' || !body.dataStream.endsWith('\r\n') || Object.entries(body).some(([key, part]) => !['dataStream', 'textRuns', 'paragraphs', 'sectionBreaks'].includes(key) && part !== null && part !== undefined && (!Array.isArray(part) || part.length))) fail('富文本含不支持的链接或嵌入内容。');
    value = body.dataStream.slice(0, -2); kind = 'rich-text';
  }
  if (value === null || value === undefined) return { value: null, kind: 'blank' };
  if (!['string', 'number', 'boolean'].includes(typeof value)) fail('公式、错误值和链接须转换为明确业务值。');
  const text = String(value);
  if (text.length > BUSINESS_MAPPING_LIMITS.text || text.includes('\0')) fail('业务值超过长度上限或含空字符。');
  if (/^\s*=/.test(text) || ERROR_VALUE.test(text)) fail('公式或错误值须转换为明确业务值。');
  // Keep the raw type. Only the explicit production-month path below interprets month formatting.
  return { value: text, kind: kind === 'rich-text' ? kind : typeof value as 'string' | 'number' | 'boolean' };
}
function productionMonth(source: IWorkbookData, cell: ICellData | null | undefined, value: ReturnType<typeof readCell>): ReturnType<typeof readCell> {
  if (value.kind !== 'number' || !cell) return value;
  const style = typeof cell.s === 'string' ? source.styles[cell.s] : cell.s;
  // These are explicit month-only formats, including Univer's own typed YYYY-MM format.
  // Do not infer a month from an unformatted number, a day/time format or an ID field.
  if (!style || !/^yyyy-mm?$/.test(style.n?.pattern ?? '')) return value;
  const dateSystem = source.dateSystem ?? DateSystem.Date1900;
  if (dateSystem !== DateSystem.Date1900 && dateSystem !== DateSystem.Date1904) fail('月份单元格的日期系统无效。');
  const serial = cell.v;
  if (typeof serial !== 'number' || !Number.isSafeInteger(serial)) fail('月份单元格须为完整日期，不可包含隐藏时间。');
  if (serial < (dateSystem === DateSystem.Date1904 ? 0 : 1) || serial > getDateSystemMaxSerial(dateSystem) || (dateSystem === DateSystem.Date1900 && serial === 60)) fail('月份单元格的日期序列无效。');
  const parts = excelSerialToDateTimeParts(serial, { dateSystem });
  if (!parts || parts.day < 1 || (dateSystem === DateSystem.Date1900 && serial === 60)) fail('月份单元格的日期序列无效。');
  return { value: `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}`, kind: value.kind };
}
function mergeCoverage(source: IWorkbookData, definition: BusinessMappingDefinition): Map<number, Int32Array> {
  const sheet = source.sheets[definition.sheetId]!, merges = sheet.mergeData ?? [];
  const rowCount = sheet.rowCount ?? 0, columnCount = sheet.columnCount ?? 0;
  if (!Array.isArray(merges) || merges.length > 20000) fail('合并区域数量超过映射读取上限。');
  // Difference arrays avoid scanning every merge for each of up to 200,000 mapped cells.
  // At most 100 * 10,001 integers, regardless of sparse cell positions or overlapping ranges.
  const coverage = new Map(definition.fields.map(entry => [entry.column, new Int32Array(rowCount + 1)]));
  for (const range of merges) {
    if (!integer(range.startRow, 0, rowCount - 1) || !integer(range.endRow, range.startRow, rowCount - 1) || !integer(range.startColumn, 0, columnCount - 1) || !integer(range.endColumn, range.startColumn, columnCount - 1)) fail('合并区域坐标无效。');
    if (range.startRow === range.endRow && range.startColumn === range.endColumn) continue;
    for (const [column, rows] of coverage) if (column >= range.startColumn && column <= range.endColumn) { rows[range.startRow]!++; rows[range.endRow + 1]!--; }
  }
  for (const rows of coverage.values()) for (let i = 1; i < rows.length; i++) rows[i]! += rows[i - 1]!;
  return coverage;
}
function rowCells(source: IWorkbookData, definition: BusinessMappingDefinition, row: number, coverage: Map<number, Int32Array>) {
  const sheet = source.sheets[definition.sheetId]!;
  return definition.fields.map(entry => {
    const merged = coverage.get(entry.column)![row]! > 0;
    try {
      if (merged) fail('选中数据格属于合并区域；请明确拆分业务值后重新预览。');
      const cell = sheet.cellData?.[row]?.[entry.column], raw = readCell(cell);
      const value = definition.target.kind === 'production' && entry.field === 'month' && row !== definition.headerRow ? productionMonth(source, cell, raw) : raw;
      return { ...entry, ...value, error: null };
    } catch (cause) { return { ...entry, value: null, kind: 'blank' as const, error: cause instanceof Error ? cause.message : '单元格无效。' }; }
  });
}

/** columns comes from the existing business adapter, not a guessed header-to-field dictionary.
 * This function neither evaluates formulas nor invokes an adapter/network request. All rows,
 * including errors, must remain visible in the subsequent domain preview. */
export async function prepareBusinessMapping(source: BusinessMappingSource, definition: BusinessMappingDefinition, columns: readonly BusinessMappingField[]): Promise<BusinessMappingPreview> {
  const capturedSource = sourceJSON(source), capturedMapping = mappingJSON(source, definition, columns);
  const snapshot = JSON.parse(capturedSource) as IWorkbookData;
  const { definition: mapping } = JSON.parse(capturedMapping) as { definition: BusinessMappingDefinition };
  const identity = { workbookId: source.workbookId, formalRevision: source.formalRevision, sourceSnapshotHash: source.sourceSnapshotHash };
  const [fullJSONHash, mappingHash] = await Promise.all([hash(capturedSource), hash(capturedMapping)]);
  const sheet = snapshot.sheets[mapping.sheetId]!;
  const coverage = mergeCoverage(snapshot, mapping);
  const rows: BusinessMappingRow[] = [];
  let skippedBlankRows = 0;
  for (let row = mapping.range.startRow; row <= mapping.range.endRow; row++) {
    const cells = rowCells(snapshot, mapping, row, coverage), errors = cells.flatMap(cell => cell.error ? [`${cell.field}：${cell.error}`] : []);
    if (!errors.length && cells.every(cell => cell.value === null || cell.value === '')) { skippedBlankRows++; continue; }
    const values = Object.fromEntries(cells.map(cell => [cell.field, cell.value])), cellKinds = Object.fromEntries(cells.map(cell => [cell.field, cell.kind]));
    const id = values.__id || null, rawRevision = values.__revision, revision = rawRevision ? Number(rawRevision) : null;
    if (id && (!identifier(id) || cellKinds.__id !== 'string' && cellKinds.__id !== 'rich-text')) errors.push('记录 ID 必须是明确文本身份；行号或数值不是业务 ID。');
    if (id && (revision === null || !integer(revision, 1, 2147483647))) errors.push('已有记录必须提供有效记录版本。');
    if (!id && revision !== null) errors.push('无记录 ID 的新增输入不能携带旧记录版本。');
    delete values.__id; delete values.__revision;
    const input: ExchangeInput = { row: row + 1, clientId: `map_${mappingHash.slice(0, 20)}_${fullJSONHash.slice(0, 20)}_${row + 1}`, id, revision, values, errors,
      source: { fileName: `自由工作簿：${snapshot.name}`, sheetName: sheet.name!, rowNumbers: [row + 1], fileHash: fullJSONHash } };
    rows.push({ input, intent: errors.length ? 'error' : id ? 'existing-record' : 'new-record', cellKinds });
  }
  const idCounts = new Map<string, number>();
  for (const { input } of rows) if (input.id) idCounts.set(input.id, (idCounts.get(input.id) ?? 0) + 1);
  for (const row of rows) if (row.input.id && idCounts.get(row.input.id)! > 1) { row.input.errors.push('选区内重复记录 ID；所有重复行均须核对。'); row.intent = 'error'; }
  const preview: BusinessMappingPreview = freeze({ kind: 'free-workbook-business-preview-v1', binding: { ...identity, fullJSONHash, mappingHash }, definition: mapping, rows,
    headers: rowCells(snapshot, mapping, mapping.headerRow, coverage).map(cell => ({ column: cell.column, field: cell.field, text: cell.value, error: cell.error })),
    counts: { newRecords: rows.filter(row => row.intent === 'new-record').length, existingRecords: rows.filter(row => row.intent === 'existing-record').length, errors: rows.filter(row => row.intent === 'error').length, skippedBlankRows },
    requiresDomainValidation: true, includesImages: false });
  captures.set(preview, { sourceJSON: capturedSource, mappingJSON: capturedMapping });
  return preview;
}

/** Call synchronously immediately before building each immutable domain request. Pass a freshly
 * captured runtime snapshot and current choices; do not pass the old preview's source. Changed
 * formal versions, any sheet/format/value/order, or mapping/defaults demand a new preview.
 * This is not server authorization/CAS and does not settle an already-sent unknown request. */
export function assertBusinessMappingCurrent(preview: BusinessMappingPreview, current: BusinessMappingSource, definition: BusinessMappingDefinition, columns: readonly BusinessMappingField[]): void {
  const capture = captures.get(preview);
  if (!capture || preview.binding.workbookId !== current.workbookId || preview.binding.formalRevision !== current.formalRevision || preview.binding.sourceSnapshotHash !== current.sourceSnapshotHash || capture.sourceJSON !== sourceJSON(current) || capture.mappingJSON !== mappingJSON(current, definition, columns)) fail('来源工作簿、正式版本或映射已变化，请重新预览；旧结果未应用。');
}
