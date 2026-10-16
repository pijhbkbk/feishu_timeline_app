import ExcelJS from 'exceljs';
import { strFromU8, zipSync } from 'fflate';
import { inspectCatalogArchive } from '../color-register/sheet-exchange';
import { readRawEmbeddedImages, type RawImageImportResult } from './xlsx-raw-images';
import { writeEmbeddedImages, type ImageTarget } from './xlsx-images';
import { imageBytes, type SheetImage } from './image-client';
import type { RecordSheetColumn, RecordSheetRow } from './record-sheet-types';
export interface ImportSource { fileName: string; sheetName: string; rowNumbers: number[]; fileHash: string }
export interface ExchangeWorkbook { workbook: ExcelJS.Workbook; archive: Record<string, Uint8Array>; fileName: string; fileHash: string }
export interface ExchangeInput { row: number; clientId: string; id: string | null; revision: number | null; values: Record<string, string | null>; source: ImportSource; errors: string[] }
export const hashBytes = async (bytes: Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes)))).map(value => value.toString(16).padStart(2, '0')).join('');
export async function readExchangeFile(file: File): Promise<ExchangeWorkbook> {
  if (file.size > 5 * 1024 * 1024) throw new Error('Excel 文件超过 5 MiB，请分批导入。');
  const bytes = new Uint8Array(await file.arrayBuffer()), archive = inspectCatalogArchive(bytes);
  for (const [path, content] of Object.entries(archive)) {
    if (!/^xl\/worksheets\/[^/]+\.xml$/.test(path)) continue;
    const xml = strFromU8(content);
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('不支持带实体声明的工作表。');
    for (const match of xml.matchAll(/<(?:[\w.-]+:)?(?:c|dimension|mergeCell)\b[^>]*\b(?:r|ref)\s*=\s*["']([^"']+)["']/g)) {
      for (const address of match[1]!.split(':')) {
        const coordinate = /^([A-Z]+)([1-9]\d*)$/.exec(address);
        const col = coordinate && [...coordinate[1]!].reduce((n, letter) => n * 26 + letter.charCodeAt(0) - 64, 0);
        if (!coordinate || !col || col > 100 || Number(coordinate[2]) > 2001) throw new Error('工作表单元格坐标超出 2000 条记录和 100 列上限。');
      }
    }
    for (const match of xml.matchAll(/<(?:[\w.-]+:)?row\b[^>]*\br\s*=\s*["'](\d+)["']/g)) if (Number(match[1]) > 2001 || Number(match[1]) < 1) throw new Error('工作表行坐标超出上限。');
  }
  const verified = zipSync(archive, { level: 0 });
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(new Uint8Array(verified) as never);
  if (workbook.worksheets.length > 32 || workbook.worksheets.some(sheet => sheet.rowCount > 2001 || sheet.columnCount > 100)) throw new Error('每个工作表最多 2000 条记录和 100 列。');
  return { workbook, archive, fileName: file.name, fileHash: await hashBytes(bytes) };
}
export function importCell(cell: ExcelJS.Cell): string | null {
  const value = cell.value;
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') { const text = String(value); if (/^\s*=/.test(text)) throw new Error('不接受公式。'); return text; }
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if ('richText' in value) return value.richText.map(part => part.text).join('');
  throw new Error('公式、错误值和链接须转换为明确业务值。');
}
export function suggestMapping(sheet: ExcelJS.Worksheet, headerRow: number, columns: readonly RecordSheetColumn[]) {
  const mapping: Record<number, string> = {};
  sheet.getRow(headerRow).eachCell((cell, col) => {
    const name = cell.text.trim(); const field = columns.find(column => column.label === name || column.key === name)?.key ?? ({ '记录ID': '__id', '记录版本': '__revision' } as Record<string, string>)[name];
    if (field) mapping[col] = field;
  }); return mapping;
}
export function exchangeRows(file: ExchangeWorkbook, sheetId: number, headerRow: number, mapping: Record<number, string>): ExchangeInput[] {
  const sheet = file.workbook.getWorksheet(sheetId); if (!sheet) throw new Error('请选择有效工作表。');
  if (new Set(Object.values(mapping)).size !== Object.values(mapping).length) throw new Error('同一字段不能映射两列。');
  const rows: ExchangeInput[] = [];
  for (let index = headerRow + 1; index <= sheet.rowCount; index++) {
    const values: Record<string, string | null> = {}, errors: string[] = [];
    for (const [col, key] of Object.entries(mapping)) { try { values[key] = importCell(sheet.getCell(index, Number(col))); } catch (cause) { errors.push(`${key}：${cause instanceof Error ? cause.message : '内容无效'}`); } }
    if (!Object.values(values).some(value => value !== null && value !== '') && !errors.length) continue;
    const id = values.__id || null, revision = values.__revision ? Number(values.__revision) : null;
    delete values.__id; delete values.__revision;
    if (id && (!revision || !Number.isSafeInteger(revision))) errors.push('记录版本无效。');
    rows.push({ row: index, clientId: `row_${sheetId}_${index}`, id, revision, values, errors,
      source: { fileName: file.fileName, sheetName: sheet.name, rowNumbers: [index], fileHash: file.fileHash } });
  }
  const ids = new Set<string>(); for (const row of rows) if (row.id) { if (ids.has(row.id)) row.errors.push('文件内出现重复记录 ID。'); ids.add(row.id); }
  return rows;
}
export function exchangeImages(file: ExchangeWorkbook, rows: readonly ExchangeInput[], sheetId: number): RawImageImportResult {
  const targets = new Map<number, ImageTarget>(rows.filter(row => !row.errors.length).map(row => [row.row, row.id ? { kind: 'existing', recordId: row.id } : { kind: 'draft', clientRowId: row.clientId }]));
  return readRawEmbeddedImages(file.archive, file.workbook, { archiveInspected: true, rowTargets: id => String(sheetId) === id ? targets : new Map() });
}
export async function exportRecordWorkbook(title: string, module: string, columns: readonly RecordSheetColumn[], rows: readonly RecordSheetRow[], images: readonly SheetImage[]): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook(); workbook.creator = '轻卡定制色';
  const sheet = workbook.addWorksheet(title.slice(0, 31), { views: [{ state: 'frozen', xSplit: 2, ySplit: 1 }] });
  sheet.columns = [{ key: '__id', header: '记录ID', width: 38, hidden: true }, { key: '__revision', header: '记录版本', width: 12, hidden: true }, ...columns.map(column => ({ key: column.key, header: column.label, width: Math.max(12, Math.round(column.width / 7)) }))];
  for (const row of rows) { const excelRow = sheet.addRow({ __id: row.id, __revision: row.revision, ...row.values }); excelRow.eachCell(cell => { cell.numFmt = '@'; }); excelRow.height = 60; }
  const headers = sheet.getRow(1); headers.font = { bold: true, color: { argb: 'FF254D39' } }; headers.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7F0E8' } };
  const metadata = workbook.addWorksheet('_业务模板', { state: 'veryHidden' }); metadata.addRow(['LIGHT_TRUCK_BUSINESS_SHEET_V1', module]);
  metadata.addRow(['记录ID与版本用于合法更新；空白默认不清空；账号权限与流程结果不由导入授予。']);
  const imageMeta = workbook.addWorksheet('_业务图片', { state: 'veryHidden' }); imageMeta.addRow(['imageId', 'recordId', 'sha256']);
  const positions = new Map(rows.map((row, index) => [row.id, index + 1]));
  for (const image of images) {
    const row = positions.get(image.recordId); if (row === undefined || image.isDeleted) continue;
    const column = columns.findIndex(column => column.key === image.fieldKey) + 2; if (column < 2) throw new Error('图片归属字段不在导出列中。');
    const { bytes, mime } = await imageBytes(image); if (mime !== 'image/png' && mime !== 'image/jpeg') throw new Error('图片原件类型不受支持。');
    const sameRowIndex = images.filter(other => other.recordId === image.recordId && other.id < image.id).length;
    // CELL exports remain within their record row. Floating geometry may span rows;
    // the hidden image ownership sheet records stable identity independently.
    const cell = image.mode === 'CELL';
    let anchorRow = row, anchorColumn = column;
    let rowOffset = cell ? 4 : image.offsetY, columnOffset = cell ? 4 + sameRowIndex * 76 : image.offsetX;
    const rowPixels = (index: number) => (sheet.getRow(index + 1).height ?? 15) * 4 / 3;
    const columnPixels = (index: number) => (sheet.getColumn(index + 1).width ?? 8.43) * 7 + 5;
    while (rowOffset < 0 && anchorRow > 0) rowOffset += rowPixels(--anchorRow);
    while (columnOffset < 0 && anchorColumn > 0) columnOffset += columnPixels(--anchorColumn);
    while (rowOffset >= rowPixels(anchorRow)) rowOffset -= rowPixels(anchorRow++);
    while (columnOffset >= columnPixels(anchorColumn)) columnOffset -= columnPixels(anchorColumn++);
    if (rowOffset < 0 || columnOffset < 0) throw new Error('浮动图片位于工作表边界之外，请先调整位置再导出。');
    writeEmbeddedImages(workbook, [{ assetKey: image.attachmentId, bytes, mime, sheetId: sheet.id, anchor: { kind: 'oneCell', from: { row: anchorRow, column: anchorColumn, rowOffset, columnOffset }, width: cell ? 72 : image.width, height: cell ? 52 : image.height } }]);
    imageMeta.addRow([image.id, image.recordId, await hashBytes(bytes)]);
  }
  const bytes = new Uint8Array(await workbook.xlsx.writeBuffer()); inspectCatalogArchive(bytes); return bytes;
}
export function downloadWorkbook(bytes: Uint8Array, name: string) {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
