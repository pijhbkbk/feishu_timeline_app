'use client';
import React, { useEffect, useRef, useState } from 'react';
import type { RegisterRow } from './client';
import type { SheetPatch } from './sheet-model';
import type { CatalogColumnMapping, CatalogEditableField, CatalogField, CatalogImportPreview, CatalogImportWorkbook } from './sheet-exchange';

const fields: Array<[CatalogField, string]> = [['id','记录ID'],['revision','记录版本'],['name','颜色名称'],['baseName','生产基地'],['note','备注'],['boardCode','色板编号'],['manufacturer','制作单位'],['paintType','漆种'],['formalCode','正式编号'],['registerMonth','入清单月份'],['registerStatus','清单状态'],['sourceSummary','来源信息']];
const clearable: Array<[CatalogEditableField, string]> = [['note','备注'],['boardCode','色板编号'],['manufacturer','制作单位'],['paintType','漆种'],['registerMonth','入清单月份']];
export function SheetImport({ rows, dirty, onClose, onApply }: { rows: RegisterRow[]; dirty: boolean; onClose: () => void; onApply: (items: SheetPatch[]) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [workbook, setWorkbook] = useState<CatalogImportWorkbook | null>(null); const [sheetId, setSheetId] = useState('');
  const [headerRow, setHeaderRow] = useState(1); const [mapping, setMapping] = useState<CatalogColumnMapping>({});
  const [clearBlankFields, setClearBlankFields] = useState<CatalogEditableField[]>([]);
  const [preview, setPreview] = useState<CatalogImportPreview | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { dialog.current?.showModal(); }, []);
  async function read(file?: File) {
    if (!file) return; setBusy(true); setError(''); setPreview(null); setWorkbook(null);
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('Excel 文件不能超过 5 MiB。');
      const exchange = await import('./sheet-exchange');
      const result = await exchange.readCatalogWorkbook(new Uint8Array(await file.arrayBuffer()), file.name);
      setWorkbook(result); const sheet = result.sheets[0]!; setSheetId(sheet.id); setHeaderRow(1); setClearBlankFields([]); setMapping(exchange.suggestCatalogMapping(sheet, 1));
    } catch (cause) { setError(cause instanceof Error ? cause.message : '文件读取失败。'); } finally { setBusy(false); }
  }
  async function configure(id: string, row: number) { setSheetId(id); setHeaderRow(row); setPreview(null); if (workbook) { const exchange = await import('./sheet-exchange'); const sheet = workbook.sheets.find(item => item.id === id); if (sheet) setMapping(exchange.suggestCatalogMapping(sheet, row)); } }
  async function inspect() {
    if (!workbook) return; setBusy(true); setError('');
    try { const exchange = await import('./sheet-exchange'); setPreview(exchange.previewCatalogImport(workbook, { sheetId, headerRow, mapping, clearBlankFields }, rows)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '无法预览。'); } finally { setBusy(false); }
  }
  const sheet = workbook?.sheets.find(item => item.id === sheetId); const headers = sheet?.rows[headerRow - 1] ?? [];
  return <dialog ref={dialog} className="m1-modal cr-dialog cs-import-dialog" aria-labelledby="cs-import-title" onCancel={onClose} onClose={onClose}>
    <header><h2 id="cs-import-title">导入 Excel · 预览变更</h2><button className="m1-button" onClick={onClose}>关闭</button></header>
    <p>系统导出模板按记录 ID 与版本导回更新。普通 Excel 支持读取与字段映射预览；无 ID 的行留待处理，新增颜色请使用“新建颜色项目”。</p>
    <label className="m1-button">选择 Excel 文件<input aria-label="选择 Excel 文件" type="file" accept=".xlsx" onChange={event => void read(event.target.files?.[0])} disabled={busy} /></label>
    {busy ? <p role="status">正在读取…</p> : null}{error ? <p className="m1-error" role="alert">{error}</p> : null}
    {workbook && sheet ? <><div className="cs-import-config"><label>工作表<select aria-label="导入工作表" value={sheetId} onChange={e => void configure(e.target.value, 1)}>{workbook.sheets.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>表头所在行<input type="number" min={1} max={sheet.rows.length} value={headerRow} onChange={e => void configure(sheetId, Number(e.target.value) || 1)} /></label><span>{workbook.template ? '已识别系统模板' : '普通 Excel · 仅预览'}</span></div>
      {sheet.mergedRanges.length ? <p className="m1-notice">包含合并单元格，请选择实际表头行并核对映射。</p> : null}
      <details open={!workbook.template}><summary>字段映射</summary><div className="cs-import-mapping">{headers.map((cell, column) => <label key={column}>{String(cell.value ?? `第 ${column + 1} 列`)}<select aria-label={`第 ${column + 1} 列映射`} value={mapping[column] ?? ''} onChange={e => { setMapping(current => { const next = { ...current }; if (e.target.value) next[column] = e.target.value as CatalogField; else delete next[column]; return next; }); setPreview(null); }}><option value="">忽略 / 待映射</option>{fields.map(([field, label]) => <option key={field} value={field}>{label}</option>)}</select></label>)}</div></details>
      <p>缺少列不修改；空白单元格默认忽略。只有勾选的字段，空白才表示清空：</p><div className="cs-clear-fields">{clearable.map(([field, label]) => <label key={field}><input type="checkbox" checked={clearBlankFields.includes(field)} onChange={event => { setClearBlankFields(current => event.target.checked ? [...current, field] : current.filter(value => value !== field)); setPreview(null); }} />{label}</label>)}</div>
      <button className="m1-button" disabled={busy} onClick={() => void inspect()}>预览变更</button>
      {preview ? <><div className="cs-import-counts" role="status"><span>新增 {preview.counts.added}</span><span>更新 {preview.counts.updated}</span><span>不变 {preview.counts.unchanged}</span><span>错误 {preview.counts.errors}</span><span>冲突 {preview.counts.conflicts}</span><span>待处理 {preview.counts.pending}</span></div>
        {preview.errors.length ? <div className="m1-error" role="alert">{preview.errors.slice(0, 8).map((issue, index) => <p key={index}>第 {issue.row} 行：{issue.message}</p>)}</div> : null}
        <div className="cs-import-scroll"><table className="cs-import-table"><thead><tr><th>原表行</th><th>结果</th><th>实际变化</th></tr></thead><tbody>{preview.records.slice(0, 200).map(record => <tr key={record.row}><td>{record.row}</td><td>{({ update:'更新',unchanged:'不变',error:'错误',conflict:'冲突',pending:'待处理' })[record.status]}<small>{record.message}</small></td><td>{record.diffs.length ? record.diffs.map(diff => <p key={diff.field}>{diff.label}：{diff.before ?? '空'} → {diff.after ?? '空'}</p>) : '—'}{record.errors.map((issue, index) => <p key={index}>{issue.message}</p>)}</td></tr>)}</tbody></table></div>
        {preview.records.length > 200 ? <p>预览显示前 200 行；全部 {preview.records.length} 行均已校验。</p> : null}
        {preview.requiresReason ? <p>标准字段修改在正式保存前须填写更正原因，并追加历史版本。</p> : null}
        {dirty ? <p className="m1-notice">请先保存或放弃工作区现有编辑，再应用导入，避免覆盖待保存内容。</p> : null}
        <footer className="cr-dialog-actions"><span>{preview.mode === 'ordinary-preview' ? '普通 Excel 本轮只提供映射预览，不写入业务。' : '确认后先放入待保存内容，点击“保存修改”才写入。'}</span><button className="m1-button m1-primary" disabled={!preview.canSubmit || dirty || !preview.changes.length} onClick={() => onApply(preview.changes)}>应用到待保存内容</button></footer>
      </> : null}
    </> : null}
  </dialog>;
}
