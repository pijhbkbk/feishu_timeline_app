'use client';
import React, { useRef, useState } from 'react';
import { API_BASE_URL } from '../../lib/auth-client';
import { defaultImageLayout, type SheetImage } from './image-client';
import type { SheetImagesState } from './use-images';
import './images.css';
import { SheetThumbnail } from './thumbnail';
import { sheetThumbnails } from './thumbnail-client';
export function SheetImagePanel({ state, recordId, recordName, disabled = false }: { state: SheetImagesState; recordId: string; recordName: string; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null), replacement = useRef<string | undefined>(undefined);
  const [error, setError] = useState(''), [original, setOriginal] = useState<SheetImage | null>(null);
  const owned = state.images.filter(image => image.recordId === recordId);
  const jobs = state.jobs.filter(job => job.recordId === recordId);
  async function add(files: File[]) {
    setError(''); const replacing = owned.find(image => image.id === replacement.current); replacement.current = undefined;
    try { await state.add(files, recordId, replacing ? { fieldKey: replacing.fieldKey, mode: replacing.mode, offsetX: replacing.offsetX, offsetY: replacing.offsetY, width: replacing.width, height: replacing.height } : defaultImageLayout(), replacing?.id); } catch (cause) { setError(cause instanceof Error ? cause.message : '添加图片失败'); }
  }
  return <section className="sheet-photo-panel" aria-label="记录照片" onPaste={event => {
    const files = Array.from(event.clipboardData.files).filter(file => file.type.startsWith('image/'));
    if (files.length && !disabled) { event.preventDefault(); event.stopPropagation(); void add(files); }
  }} tabIndex={0}>
    <h4>记录照片 <span>{owned.length}</span></h4>
    <p>归属：{recordName}。选中此记录后，可上传图片或粘贴截图。</p>
    <input ref={input} className="cr-sr-only" type="file" accept="image/png,image/jpeg" multiple disabled={disabled} aria-label="选择记录图片" onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ''; if (files.length) void add(files); }} />
    <button className="m1-button" disabled={disabled} onClick={() => { replacement.current = undefined; if (input.current) { input.current.multiple = true; input.current.click(); } }}>添加照片</button>
    {state.images.length ? <button className="m1-button" onClick={() => sheetThumbnails.retryFailed(state.images.map(image => image.id))}>重试缩略图</button> : null}
    {(error || state.error) ? <p role="alert" className="m1-error">{error || state.error}<button onClick={() => void state.reload()}>重新读取图片</button></p> : null}
    {jobs.length ? <div role="status">{jobs.map(job => <p key={job.key}>{job.kind === 'upload' ? job.file.name : job.kind === 'layout' ? '保存图片位置' : '删除图片'}：{job.status === 'failed' ? job.error : job.status === 'waiting' ? '等待处理' : job.kind === 'upload' && job.progress >= 100 ? '已传输，正在安全检查和保存' : job.kind === 'upload' ? `${job.progress}%` : '正在保存'}</p>)}{jobs.some(job => job.status === 'failed') ? <button className="m1-button" onClick={state.retry}>重试未完成图片</button> : null}{jobs.filter(job => job.status === 'failed' && job.rejectedStatus === 409 && job.kind !== 'upload').map(job => <button key={job.key} className="m1-button" onClick={() => { if (job.kind !== 'upload') state.discardConflict(job.imageId); }}>放弃此图片待处理修改并读取服务器版本</button>)}</div> : null}
    <div className="sheet-photo-grid">{owned.map(image => <figure key={image.id} data-image-id={image.id}>
      <button className="sheet-photo-open" aria-label={`查看原图 ${image.id}`} onClick={() => setOriginal(image)}><SheetThumbnail id={image.id} alt={`${recordName}的记录照片`} /></button>
      <figcaption><button onClick={() => setOriginal(image)}>原图</button><button disabled={disabled || jobs.some(job => job.kind !== 'upload' && job.imageId === image.id)} onClick={() => state.change(image, { fieldKey: image.fieldKey, mode: image.mode === 'CELL' ? 'FLOATING' : 'CELL', offsetX: image.offsetX, offsetY: image.offsetY, width: image.mode === 'CELL' ? 240 : 112, height: image.mode === 'CELL' ? 160 : 72 })}>{image.mode === 'CELL' ? '浮动显示' : '单元格显示'}</button><button disabled={disabled} onClick={() => { replacement.current = image.id; if (input.current) { input.current.multiple = false; input.current.click(); } }}>替换</button><button disabled={disabled || jobs.some(job => job.kind !== 'upload' && job.imageId === image.id)} onClick={() => state.remove(image)}>删除</button></figcaption>
    </figure>)}</div>
    {!owned.length && !jobs.length ? <p className="sheet-photo-empty">这条记录尚无照片。</p> : null}
    {original ? <div className="sheet-photo-lightbox" role="dialog" aria-modal="true" aria-label="图片原件" onKeyDown={event => { if (event.key === 'Escape') setOriginal(null); }}><button autoFocus className="m1-button" onClick={() => setOriginal(null)}>关闭原图</button><img src={`${API_BASE_URL}${original.contentUrl}`} alt={`${recordName}的图片原件`} /></div> : null}
  </section>;
}
