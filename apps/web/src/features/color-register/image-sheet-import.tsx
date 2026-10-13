'use client';
import React, { useState } from 'react';
import { RecordImportDialog, type ImportPlan } from '../business-sheet/record-import';
import type { SheetImage } from '../business-sheet/image-client';
import type { ExchangeInput } from '../business-sheet/record-exchange';
import type { RegisterRow } from './client';
import { CatalogSheetModel, SHEET_COLUMNS, isSheetField, editable, type SheetPatch } from './sheet-model';
import { saveCatalog } from './sheet-client';
import { registerStatusLabel } from './clipboard';
export function colorExchangeRow(row: RegisterRow) {
  return { id: row.id, revision: row.revision, editable: SHEET_COLUMNS.filter(column => editable(row, column.key)).map(column => column.key),
    values: Object.fromEntries(SHEET_COLUMNS.map(column => [column.key, column.key === 'baseName' ? row.base?.name ?? null : column.key === 'registerStatus' ? registerStatusLabel(row.registerStatus) : column.key === 'photos' ? null : String(row[column.key as keyof RegisterRow] ?? '') || null])) };
}
export function ColorImageSheetImport({ rows, images, paintTypes, manufacturers, onSaved, onClose }: { rows: RegisterRow[]; images: SheetImage[]; paintTypes: string[]; manufacturers: string[]; onSaved: () => Promise<void>; onClose: () => void }) {
  const [reason, setReason] = useState('');
  function prepare(input: ExchangeInput, clears: readonly string[]): ImportPlan {
    let row = input.id ? rows.find(row => row.id === input.id) : undefined;
    if (!input.id) {
      const matches = rows.filter(row => row.name === input.values.name && row.base?.name === input.values.baseName);
      if (matches.length !== 1) return { input, status: 'error', message: '颜色与基地未唯一对应现有记录。请导出带记录 ID 的模板；新增颜色使用新建颜色项目。' };
      row = matches[0]!; input = { ...input, id: row.id, revision: row.revision };
    }
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
    const issues = model.errors(paintTypes, manufacturers); if (issues.length) return { input, status: 'error', message: issues.map(issue => issue.message).join('；') };
    if (Object.keys(changes).some(field => field !== 'note') && !reason.trim()) return { input, status: 'error', message: '标准字段变更须填写更正原因后重新预览。' };
    return { input, status: Object.keys(changes).length ? 'update' : 'unchanged', message: Object.entries(changes).map(([field, value]) => `${SHEET_COLUMNS.find(column => column.key === field)?.label}：${current.values[field] ?? '空'} → ${value ?? '空'}`).join('；'), data: { id: row.id, expectedRevision: row.revision, changes } satisfies SheetPatch };
  }
  return <RecordImportDialog title="颜色清单" module="color-catalog" columns={SHEET_COLUMNS} rows={rows.map(colorExchangeRow)} imageTarget="SHEET_COLOR" images={images} prepare={prepare}
    renderOptions={disabled => <label>标准更正原因<input aria-label="标准更正原因" maxLength={1000} disabled={disabled} value={reason} onChange={event => setReason(event.target.value)} /></label>}
    apply={async (plans, operationId) => { const result = await saveCatalog(plans.map(plan => plan.data as SheetPatch), operationId, reason); return result.items.map(row => ({ id: row.id, clientId: plans.find(plan => plan.input.id === row.id)!.input.clientId })); }}
    onSaved={onSaved} onClose={onClose} />;
}
