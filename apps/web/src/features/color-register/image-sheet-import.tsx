'use client';
import React, { useState } from 'react';
import { RecordImportDialog, type ImportPlan } from '../business-sheet/record-import';
import type { SheetImage } from '../business-sheet/image-client';
import type { ExchangeInput } from '../business-sheet/record-exchange';
import type { RegisterRow } from './client';
import { SHEET_COLUMNS, type SheetPatch } from './sheet-model';
import { saveCatalog } from './sheet-client';
import { colorExchangeRow, prepareColorImport } from './color-record-import';
export { colorExchangeRow } from './color-record-import';
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
    return prepareColorImport(input, clears, { rows, paintTypes, manufacturers, reason });
  }
  return <RecordImportDialog title="颜色清单" module="color-catalog" columns={SHEET_COLUMNS} rows={rows.map(colorExchangeRow)} imageTarget="SHEET_COLOR" images={images} prepare={prepare}
    renderOptions={disabled => <label>标准更正原因<input aria-label="标准更正原因" maxLength={1000} disabled={disabled} value={reason} onChange={event => setReason(event.target.value)} /></label>}
    apply={async (plans, operationId) => { const result = await saveCatalog(plans.map(plan => plan.data as SheetPatch), operationId, reason); return result.items.map(row => ({ id: row.id, clientId: plans.find(plan => plan.input.id === row.id)!.input.clientId })); }}
    onSaved={onSaved} onClose={onClose} />;
}
