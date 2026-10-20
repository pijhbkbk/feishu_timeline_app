import type { ExchangeInput } from '../business-sheet/record-exchange';
import type { ImportPlan } from '../business-sheet/record-import';
import type { RegisterRow } from './client';
import { CatalogSheetModel, SHEET_COLUMNS, isSheetField, editable, type SheetPatch } from './sheet-model';
import { registerStatusLabel } from './clipboard';
export function colorExchangeRow(row: RegisterRow) {
  return { id: row.id, revision: row.revision, editable: SHEET_COLUMNS.filter(column => editable(row, column.key)).map(column => column.key),
    values: Object.fromEntries(SHEET_COLUMNS.map(column => [column.key, column.key === 'baseName' ? row.base?.name ?? null : column.key === 'registerStatus' ? registerStatusLabel(row.registerStatus) : column.key === 'photos' ? null : String(row[column.key as keyof RegisterRow] ?? '') || null])) };
}
/** Direct explicit-ID preparation. This does not identify an ordinary workbook as a system template. */
export function prepareColorImport(input: ExchangeInput, clears: readonly string[], context: { rows: readonly RegisterRow[]; paintTypes: string[]; manufacturers: string[]; reason: string }): ImportPlan {
  if (input.errors.length) return { input, status: 'error', message: input.errors.join('；') };
  if (!input.id) return { input, status: 'error', message: '无稳定记录 ID：新增颜色须使用正式新建颜色项目入口；不会按名称或行号合并。' };
  const row = context.rows.find(row => row.id === input.id);
  if (!row) return { input, status: 'error', message: '记录不在当前可访问清单中。' };
    if (input.revision !== row.revision) return { input, status: 'error', message: '版本已变化，请重新导出并核对。' };
    const current = colorExchangeRow(row); const changes: SheetPatch['changes'] = {};
    for (const [field, value] of Object.entries(input.values)) {
      if (field === 'photos' || (value === null || value === '') && !clears.includes(field)) continue;
      if ((current.values[field] ?? null) === value) continue;
      if (!isSheetField(field) || !editable(row, field)) return { input, status: 'error', message: `${SHEET_COLUMNS.find(column => column.key === field)?.label ?? field}为只读业务字段。` };
      changes[field] = value || null;
    }
    const model = new CatalogSheetModel([row]); model.apply(Object.entries(changes).map(([field, value]) => ({ id: row!.id, field, value: value ?? null })));
    const issues = model.errors(context.paintTypes, context.manufacturers); if (issues.length) return { input, status: 'error', message: issues.map(issue => issue.message).join('；') };
    if (Object.keys(changes).some(field => field !== 'note') && !context.reason.trim()) return { input, status: 'error', message: '标准字段变更须填写更正原因后重新预览。' };
    return { input, status: Object.keys(changes).length ? 'update' : 'unchanged', message: Object.entries(changes).map(([field, value]) => `${SHEET_COLUMNS.find(column => column.key === field)?.label}：${current.values[field] ?? '空'} → ${value ?? '空'}`).join('；'), data: { id: row.id, expectedRevision: row.revision, changes } satisfies SheetPatch };
}
