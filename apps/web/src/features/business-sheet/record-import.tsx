'use client';
import { ApiRequestError } from '../../lib/auth-client';
import React, { useEffect, useRef, useState } from 'react';
import type { RecordSheetColumn, RecordSheetRow } from './record-sheet-types';
import type { EmbeddedImage } from './xlsx-images';
import { defaultImageLayout, imageBytes, uploadSheetImage, type SheetImage, type SheetImageTarget } from './image-client';
import type { ExchangeInput, ExchangeWorkbook } from './record-exchange';
export interface ImportPlan { input: ExchangeInput; status: 'create' | 'update' | 'unchanged' | 'error'; message: string; data?: unknown }
export interface RecordImportProps {
  renderOptions?: (disabled: boolean) => React.ReactNode;
  title: string; module: string; columns: readonly RecordSheetColumn[]; rows: readonly RecordSheetRow[];
  allowImages?: boolean; finalizePlans?: (plans: ImportPlan[]) => ImportPlan[];
  imageTarget: SheetImageTarget; images: readonly SheetImage[];
  prepare(input: ExchangeInput, clearFields: readonly string[]): ImportPlan;
  apply(plans: ImportPlan[], operationId: string): Promise<Array<{ clientId: string; id: string }>>;
  onSaved(): Promise<void>; onClose(): void;
}
export function RecordImportDialog(props: RecordImportProps) {
  const dialog = useRef<HTMLDialogElement>(null), receipts = useRef(new Map<number, { operationId: string; ids?: Array<{ clientId: string; id: string }> }>());
  const imageReceipts = useRef(new Map<string, { operationId: string; saved: boolean }>());
  const [file, setFile] = useState<ExchangeWorkbook | null>(null), [sheetId, setSheetId] = useState(0), [headerRow, setHeaderRow] = useState(1), [mapping, setMapping] = useState<Record<number, string>>({});
  const [plans, setPlans] = useState<ImportPlan[]>([]), [pictures, setPictures] = useState<EmbeddedImage[]>([]), [issues, setIssues] = useState<string[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string>>({}), [clears, setClears] = useState<string[]>([]), [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [progress, setProgress] = useState(''), [started, setStarted] = useState(false), [done, setDone] = useState(false), [uncertain, setUncertain] = useState(false);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const sheet = file?.workbook.getWorksheet(sheetId);
  const fields = [{ key: '__id', label: '记录ID', width: 40 }, { key: '__revision', label: '记录版本', width: 15 }, ...props.columns];
  function resetPreview() { setPlans([]); setPictures([]); setIssues([]); setAssignments({}); setAcknowledged(false); receipts.current.clear(); imageReceipts.current.clear(); }
  async function open(selected?: File) {
    if (!selected) return; setBusy(true); setError(''); resetPreview(); setFile(null);
    try {
      const { readExchangeFile, suggestMapping } = await import('./record-exchange');
      const result = await readExchangeFile(selected);
      const marker = result.workbook.getWorksheet('_业务模板');
      if (marker && marker.getCell(1, 2).text !== props.module) throw new Error('该模板属于另一业务模块，请在对应页面导入。');
      const first = result.workbook.worksheets.find(value => value.state === 'visible'); if (!first) throw new Error('没有可读取的工作表。');
      setFile(result); setSheetId(first.id); setHeaderRow(1); setMapping(suggestMapping(first, 1, props.columns)); setClears([]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '读取失败'); } finally { setBusy(false); }
  }
  async function preview() {
    if (!file) return; setBusy(true); setError('');
    try {
      const { exchangeRows, exchangeImages } = await import('./record-exchange');
      const inputs = exchangeRows(file, sheetId, headerRow, mapping);
      let planned = inputs.map(input => input.errors.length ? { input, status: 'error' as const, message: input.errors.join('；') } : props.prepare(input, clears));
      planned = props.finalizePlans?.(planned) ?? planned;
      const result = exchangeImages(file, planned.filter(plan => plan.status !== 'error').map(plan => plan.input), sheetId);
      if (props.allowImages === false && (result.inventory.rawPictureCount || result.issues.length)) throw new Error('此层不接收图片，请在检验台次层明确归属后导入照片。');
      setPlans(planned); setPictures(result.images.filter(image => image.sheetId === String(sheetId))); setIssues(result.issues.map(issue => issue.message));
      const assigned: Record<string, string> = {};
      result.images.forEach(image => { if (image.target) assigned[image.imageKey] = image.target.kind === 'existing' ? `id:${image.target.recordId}` : `draft:${image.target.clientRowId}`; });
      setAssignments(assigned); setAcknowledged(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '预览失败'); } finally { setBusy(false); }
  }
  async function save() {
    if (!file || busy) return; setBusy(true); setStarted(true); setUncertain(true); setError('');
    const ids = new Map(plans.filter(plan => plan.input.id).map(plan => [plan.input.clientId, plan.input.id!]));
    const writes = plans.filter(plan => plan.status === 'create' || plan.status === 'update'); let confirmed = 0, imageSaved = 0, imageUnchanged = 0;
    try {
      for (let index = 0; index < writes.length; index += 50) {
        let receipt = receipts.current.get(index); if (!receipt) { receipt = { operationId: crypto.randomUUID() }; receipts.current.set(index, receipt); }
        receipt.ids ??= await props.apply(writes.slice(index, index + 50), receipt.operationId);
        receipt.ids.forEach(value => ids.set(value.clientId, value.id)); confirmed += receipt.ids.length;
        setProgress(`文字已确认 ${confirmed}/${writes.length} 条；图片尚待保存。`);
      }
      const { hashBytes } = await import('./record-exchange');
      const meta = file.workbook.getWorksheet('_业务图片');
      const currentHashes = new Map<string, string>();
      for (const picture of pictures) {
        const assignment = assignments[picture.imageKey]; if (!assignment || picture.status === 'error') continue;
        const recordId = assignment.startsWith('id:') ? assignment.slice(3) : ids.get(assignment.slice(6));
        if (!recordId) throw new Error(`图片归属的新记录尚未保存：${picture.imageKey}`);
        const digest = await hashBytes(picture.bytes);
        let unchanged = false;
        if (meta) for (let index = 2; index <= meta.rowCount; index++) {
          if (meta.getCell(index, 2).text !== recordId || meta.getCell(index, 3).text !== digest) continue;
          const existing = props.images.find(image => image.id === meta.getCell(index, 1).text && image.recordId === recordId); if (!existing) continue;
          let current = currentHashes.get(existing.id); if (!current) { current = await hashBytes((await imageBytes(existing)).bytes); currentHashes.set(existing.id, current); }
          if (current === digest) { unchanged = true; break; }
        }
        if (unchanged) { imageUnchanged++; continue; }
        let receipt = imageReceipts.current.get(picture.imageKey); if (!receipt) { receipt = { operationId: crypto.randomUUID(), saved: false }; imageReceipts.current.set(picture.imageKey, receipt); }
        if (!receipt.saved) {
          const blob = new File([new Uint8Array(picture.bytes)], `导入-${picture.sourceMediaId.split('/').pop() ?? '照片'}`, { type: picture.mime });
          await uploadSheetImage(blob, props.imageTarget, recordId, defaultImageLayout(), receipt.operationId, percent => setProgress(`文字已确认 ${confirmed} 条；正在上传图片 ${imageSaved + 1}/${pictures.length}：${percent}%`));
          receipt.saved = true;
        }
        imageSaved++;
      }
      await props.onSaved(); setDone(true); setUncertain(false); setProgress(`服务器已确认：文字写入 ${confirmed} 条，文字不变 ${plans.filter(plan => plan.status === 'unchanged').length} 条；图片新增 ${imageSaved} 张，不变 ${imageUnchanged} 张。${issues.length ? '已明确排除的特殊对象不计为成功。' : ''}`);
    } catch (cause) { const rejected = !uncertain && cause instanceof ApiRequestError && [400, 401, 403, 404, 409, 413, 415, 422, 429].includes(cause.status); setUncertain(!rejected); if (rejected) await props.onSaved().catch(() => {}); setError(`${cause instanceof Error ? cause.message : '导入失败'} 已保存文字 ${confirmed} 条、图片 ${imageSaved} 张；再次执行会核实原请求，保留本次来源与图片归属。`); }
    finally { setBusy(false); }
  }
  const unresolved = pictures.filter(image => image.status !== 'error' && !assignments[image.imageKey]).length;
  const failed = plans.filter(plan => plan.status === 'error').length + pictures.filter(image => image.status === 'error').length;
  return <dialog ref={dialog} className="m1-modal cr-dialog cs-import-dialog" aria-label={`${props.title}导入`} onCancel={event => { if (busy || uncertain && !done) event.preventDefault(); else props.onClose(); }}>
    <header><h2>{props.title} · 导入 Excel</h2><button className="m1-button" disabled={busy || uncertain && !done} onClick={props.onClose}>关闭</button></header>
    <p>核对工作表、字段与图片归属后保存。空白默认忽略，记录 ID 和版本用于更新；普通台账按本模块允许的字段新增，关联信息须明确。</p>
    {props.renderOptions?.(busy || started)}
    <input aria-label="选择 Excel 文件" type="file" accept=".xlsx" disabled={busy || started} onChange={event => void open(event.target.files?.[0])} />
    {error ? <p className="m1-error" role="alert">{error}</p> : null}{progress ? <p role="status">{progress}</p> : null}
    {file && sheet ? <><div className="cs-import-config"><label>工作表<select value={sheetId} disabled={busy || started} onChange={event => { const id = Number(event.target.value); setSheetId(id); setHeaderRow(1); void import('./record-exchange').then(({ suggestMapping }) => setMapping(suggestMapping(file.workbook.getWorksheet(id)!, 1, props.columns))); resetPreview(); }}>{file.workbook.worksheets.filter(sheet => sheet.state === 'visible').map(sheet => <option key={sheet.id} value={sheet.id}>{sheet.name}</option>)}</select></label><label>表头所在行<input type="number" min={1} max={sheet.rowCount} value={headerRow} disabled={busy || started} onChange={event => { const row = Number(event.target.value) || 1; setHeaderRow(row); void import('./record-exchange').then(({ suggestMapping }) => setMapping(suggestMapping(sheet, row, props.columns))); resetPreview(); }} /></label></div>
      <details><summary>字段映射与空白处理</summary><div className="cs-import-mapping">{Array.from({ length: sheet.columnCount }, (_, index) => index + 1).map(col => <label key={col}>{sheet.getCell(headerRow, col).text || `第 ${col} 列`}<select value={mapping[col] ?? ''} disabled={busy || started} onChange={event => { setMapping(old => { const next = { ...old }; if (event.target.value) next[col] = event.target.value; else delete next[col]; return next; }); resetPreview(); }}><option value="">忽略该列</option>{fields.map(field => <option key={field.key} value={field.key}>{field.label}</option>)}</select></label>)}</div><p>勾选字段后，空白表示明确清空：</p>{props.columns.filter(column => column.key !== 'photos').map(column => <label key={column.key}><input type="checkbox" disabled={busy || started} checked={clears.includes(column.key)} onChange={event => { setClears(old => event.target.checked ? [...old, column.key] : old.filter(value => value !== column.key)); resetPreview(); }} />{column.label}</label>)}</details>
      <button className="m1-button" disabled={busy || started} onClick={() => void preview()}>预览变更与图片</button>
      {plans.length || pictures.length ? <><p role="status">新增 {plans.filter(plan => plan.status === 'create').length} · 更新 {plans.filter(plan => plan.status === 'update').length} · 不变 {plans.filter(plan => plan.status === 'unchanged').length} · 错误 {failed} · 图片 {pictures.length} · 待指定归属 {unresolved}</p>
        <div className="cs-import-scroll"><table className="cs-import-table"><thead><tr><th>来源行</th><th>结果</th><th>内容与问题</th></tr></thead><tbody>{plans.slice(0, 200).map(plan => <tr key={plan.input.clientId}><td>{plan.input.row}</td><td>{{ create: '新增', update: '更新', unchanged: '不变', error: '错误' }[plan.status]}</td><td>{plan.message || Object.values(plan.input.values).filter(Boolean).slice(0, 4).join(' · ')}</td></tr>)}</tbody></table></div>
        {pictures.map((picture, index) => <div className="sheet-image-mapping" key={picture.imageKey}><ImportPicture image={picture} /><span>图片 {index + 1} · {picture.sheetName} · {picture.occupiedRows ? `第 ${picture.occupiedRows.first}–${picture.occupiedRows.last} 行` : '锚点待核对'}</span><p>{picture.issues.map(issue => issue.message).join('；')}</p><select aria-label={`图片 ${index + 1} 归属`} disabled={busy || started || picture.status === 'error'} value={assignments[picture.imageKey] ?? ''} onChange={event => setAssignments(old => ({ ...old, [picture.imageKey]: event.target.value }))}><option value="">请明确选择记录</option>{plans.filter(plan => plan.status !== 'error').map(plan => <option key={plan.input.clientId} value={plan.input.id ? `id:${plan.input.id}` : `draft:${plan.input.clientId}`}>来源第 {plan.input.row} 行 · {Object.values(plan.input.values).filter(Boolean).slice(0, 3).join(' / ')}</option>)}{props.rows.filter(row => !plans.some(plan => plan.input.id === row.id)).map(row => <option key={row.id} value={`id:${row.id}`}>{Object.values(row.values).filter(Boolean).slice(0, 3).join(' / ')}</option>)}</select></div>)}
        {issues.length ? <div role="alert">{issues.map((issue, index) => <p key={index}>{issue}</p>)}<label><input type="checkbox" checked={acknowledged} disabled={busy || started} onChange={event => setAcknowledged(event.target.checked)} />已核对上述特殊对象与限制，仅保存明确支持并已绑定的图片</label></div> : null}
        <footer className="cr-dialog-actions"><button className="m1-button m1-primary" disabled={busy || done || !!failed || !!unresolved || !!issues.length && !acknowledged} onClick={() => void save()}>{busy ? '正在保存…' : done ? '已保存，可关闭重开核对' : started ? '核实并继续导入' : '确认写入文字与图片'}</button></footer>
      </> : <p>选择工作表后点击预览。</p>}
    </> : null}
  </dialog>;
}

function ImportPicture({ image }: { image: EmbeddedImage }) {
  const [url, setUrl] = useState('');
  useEffect(() => { const value = URL.createObjectURL(new Blob([new Uint8Array(image.bytes)], { type: image.mime })); setUrl(value); return () => URL.revokeObjectURL(value); }, [image]);
  return url ? <img src={url} alt="待导入原图预览" width={120} height={80} style={{ objectFit: 'contain' }} /> : null;
}
