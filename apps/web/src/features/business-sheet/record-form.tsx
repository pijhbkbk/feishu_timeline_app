'use client';
import React, { useEffect, useRef, useState } from 'react';
import { ApiRequestError } from '../../lib/auth-client';
export interface RecordFormField { key: string; label: string; type?: 'text' | 'number' | 'month' | 'date' | 'textarea'; required?: boolean; maxLength?: number; options?: Array<{ value: string; label: string }>; initial?: string }
export function RecordForm({ title, fields, submit, onClose }: { title: string; fields: RecordFormField[]; submit: (values: Record<string, string>, operationId: string) => Promise<void>; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map(field => [field.key, field.initial ?? '']))), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const request = useRef<{ values: Record<string, string>; operationId: string } | null>(null);
  const [uncertain, setUncertain] = useState(false);
  useEffect(() => { dialog.current?.showModal(); }, []);
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError('');
    request.current ??= { values: { ...values }, operationId: crypto.randomUUID() };
    try { await submit(request.current.values, request.current.operationId); request.current = null; setUncertain(false); onClose(); }
    catch (cause) {
      const rejected = !uncertain && cause instanceof ApiRequestError && [400, 401, 403, 404, 409, 422].includes(cause.status);
      if (rejected) request.current = null;
      setUncertain(!rejected); setError(`${cause instanceof Error ? cause.message : '保存失败。'}${rejected ? '' : ' 保存结果尚未确认，请重试原请求。'}`);
    } finally { setBusy(false); }
  }
  return <dialog ref={dialog} className="m1-modal cr-dialog" aria-label={title} onCancel={event => { if (busy || uncertain) event.preventDefault(); else onClose(); }}>
    <form onSubmit={event => void save(event)}><header><h2>{title}</h2><button type="button" className="m1-button" disabled={busy || uncertain} onClick={onClose}>关闭</button></header>
    <div className="sheet-form-fields">{fields.map(field => <label key={field.key}>{field.label}{field.required ? ' *' : ''}{field.options ? <select required={field.required} aria-label={field.label} value={values[field.key]} disabled={busy || uncertain} onChange={e => setValues(old => ({ ...old, [field.key]: e.target.value }))}><option value="">请选择</option>{field.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : field.type === 'textarea' ? <textarea aria-label={field.label} maxLength={field.maxLength ?? 2000} value={values[field.key]} disabled={busy || uncertain} onChange={e => setValues(old => ({ ...old, [field.key]: e.target.value }))} /> : <input required={field.required} aria-label={field.label} type={field.type ?? 'text'} maxLength={field.maxLength ?? 200} value={values[field.key]} disabled={busy || uncertain} onChange={e => setValues(old => ({ ...old, [field.key]: e.target.value }))} />}</label>)}</div>
    {error ? <p role="alert" className="m1-error">{error}</p> : null}<footer className="cr-dialog-actions"><button className="m1-button m1-primary" disabled={busy}>{busy ? '保存中…' : uncertain ? '核实并重试保存' : '保存记录'}</button></footer></form>
  </dialog>;
}
