import type { RegisterNoteChange, RegisterRow } from './client';

const HEADERS = ['清单记录ID', '记录版本', '颜色名称', '正式编号', '生产基地', '制作单位', '漆种', '色板编号', '入清单月份', '清单状态', '量产状态', '备注（安全文本）'];
const MAX_BYTES = 256 * 1024;
const MAX_ROWS = 100;
const MAX_NOTE = 2000;

export function registerStatusLabel(value: string) {
  return ({ CANDIDATE: '候选颜色', LISTED: '已入清单', PENDING_REVIEW: '待核对' } as Record<string, string>)[value] ?? value;
}
export function productionStatusLabel(value: string) {
  return ({ APPROVED: '已获准量产', NOT_APPROVED: '未获准量产', PENDING: '未获准量产', UNKNOWN: '待核对' } as Record<string, string>)[value] ?? value;
}

function protectSpreadsheetText(value: string) {
  return /^[\s]*[=+\-@]/u.test(value) ? `'${value}` : value.startsWith("'") ? `'${value}` : value;
}
function restoreSpreadsheetText(value: string) {
  return value.startsWith("'") ? value.slice(1) : value;
}
function tsvCell(value: string | number | null) {
  const text = value === null ? '' : String(value);
  const safe = protectSpreadsheetText(text);
  return /[\t\r\n"]/u.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** The note header marks a reversible text escape for spreadsheet formulas. */
export function registerRowsToTsv(rows: RegisterRow[]) {
  return [HEADERS, ...rows.map(row => [row.id, row.revision, row.name, row.formalCode, row.base?.name ?? null,
    row.manufacturer, row.paintType, row.boardCode, row.registerMonth, registerStatusLabel(row.registerStatus),
    productionStatusLabel(row.productionApprovalStatus), row.note])].map(cells => cells.map(tsvCell).join('\t')).join('\r\n');
}

export function parseTsv(text: string): string[][] {
  if (new TextEncoder().encode(text).byteLength > MAX_BYTES) throw new Error('粘贴内容超过 256 KB，请分批操作。');
  const rows: string[][] = [];
  let row: string[] = []; let cell = ''; let quoted = false; let closed = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') { cell += '"'; index += 1; }
        else { quoted = false; closed = true; }
      } else cell += char;
      continue;
    }
    if (char === '"' && !cell && !closed) { quoted = true; continue; }
    if (char === '\t') { row.push(cell); cell = ''; closed = false; continue; }
    if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell); rows.push(row); row = []; cell = ''; closed = false;
      if (rows.length > MAX_ROWS + 1) throw new Error('每次最多粘贴 100 行，请分批操作。');
      continue;
    }
    if (closed) throw new Error('粘贴内容的引号格式不完整，请从表格重新复制。');
    cell += char;
  }
  if (quoted) throw new Error('粘贴内容有未闭合的引号，请从表格重新复制。');
  if (cell || row.length || closed) { row.push(cell); rows.push(row); }
  return rows;
}

export function parseRegisterNotePaste(text: string, rows: RegisterRow[]): RegisterNoteChange[] {
  const parsed = parseTsv(text);
  const headers = parsed[0];
  if (!headers || parsed.length < 2) throw new Error('请粘贴包含表头、清单记录ID、记录版本和备注的表格。');
  const idIndex = headers.indexOf('清单记录ID');
  const revisionIndex = headers.indexOf('记录版本');
  const safeIndex = headers.indexOf('备注（安全文本）');
  const plainIndex = headers.indexOf('备注');
  const noteIndex = safeIndex >= 0 ? safeIndex : plainIndex;
  if (idIndex < 0 || revisionIndex < 0 || noteIndex < 0) throw new Error('缺少表头：清单记录ID、记录版本、备注。可先复制当前页作为模板。');
  if ([idIndex, revisionIndex, noteIndex].some(index => headers.filter(value => value === headers[index]).length !== 1) || (safeIndex >= 0 && plainIndex >= 0)) throw new Error('表头重复，无法确定要保存的备注列。');
  const known = new Map(rows.map(row => [row.id, row]));
  const seen = new Set<string>();
  const changes: RegisterNoteChange[] = [];
  for (const [offset, cells] of parsed.slice(1).entries()) {
    if (cells.every(value => value === '')) continue;
    const line = offset + 2;
    if (cells.length !== headers.length) throw new Error(`第 ${line} 行列数与表头不同，请检查后重试。`);
    const id = cells[idIndex] ?? '';
    const current = known.get(id);
    if (!current) throw new Error(`第 ${line} 行不是当前页的清单记录。请先筛选到该记录，不按颜色名称自动匹配。`);
    if (seen.has(id)) throw new Error(`第 ${line} 行重复引用同一条清单记录，请保留一行。`);
    seen.add(id);
    const revisionText = cells[revisionIndex] ?? '';
    const expectedRevision = Number(revisionText);
    if (!/^\d+$/u.test(revisionText) || !Number.isSafeInteger(expectedRevision) || expectedRevision !== current.revision) throw new Error(`第 ${line} 行记录版本已变化，请重新复制当前页后编辑。`);
    const raw = cells[noteIndex] ?? '';
    const note = safeIndex >= 0 ? restoreSpreadsheetText(raw) : raw;
    if (note.length > MAX_NOTE) throw new Error(`第 ${line} 行备注超过 ${MAX_NOTE} 字，请缩短后重试。`);
    if (note !== (current.note ?? '')) changes.push({ id, expectedRevision, note: note || null });
  }
  if (seen.size > MAX_ROWS) throw new Error('每次最多粘贴 100 行，请分批操作。');
  if (!changes.length) throw new Error('粘贴内容没有备注变更。');
  return changes;
}
