'use client';
import React, { useRef, useState } from 'react';
import { apiRequest, ApiRequestError } from '../../lib/auth-client';
import { useProjectUnsavedChanges } from '../m1/use-unsaved';
import { ColorStandardFields, colorStandardDraftFromData, technicalDataFromDraft } from './color-standard-fields';
import { fetchRegisterDetail, type RegisterDetail } from './client';

export function StandardCorrection({ detail, onSaved, onEditingChange }: { detail: RegisterDetail; onSaved: () => void; onEditingChange: (value: boolean) => void }) {
  const current = detail.versions.find(version => version.id === detail.currentStandardVersionId);
  const [editing, setEditing] = useState(false);
  const [standard, setStandard] = useState(() => colorStandardDraftFromData({ ...current, changeSummary: '' }));
  const [boardCode, setBoardCode] = useState(current?.boardCode ?? ''); const [month, setMonth] = useState(detail.registerMonth ?? '');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const command = useRef<{ fingerprint: string; operationId: string } | null>(null);
  const pending = useRef(false);
  useProjectUnsavedChanges(editing);
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    const body = { expectedRevision: detail.revision, boardCode: boardCode || null, registerMonth: month || null, technicalData: technicalDataFromDraft(standard) };
    const fingerprint = JSON.stringify(body);
    if (command.current?.fingerprint !== fingerprint) command.current = { fingerprint, operationId: crypto.randomUUID() };
    try {
      const result = await apiRequest<{ versionId: string }>(`/color-register/${encodeURIComponent(detail.id)}/standards`, { method: 'POST', body: { ...body, operationId: command.current.operationId }, signal: AbortSignal.timeout(30000) });
      const saved = await fetchRegisterDetail(detail.id);
      if (!saved.versions.some(version => version.id === result.versionId)) throw new Error('尚未核对到新标准，请重试读回。');
      setEditing(false); onEditingChange(false); onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '更正未保存。'); if (cause instanceof ApiRequestError && cause.status === 409) command.current = null; }
    finally { pending.current = false; setBusy(false); }
  }
  if (detail.registerStatus === 'CANDIDATE' || !current) return null;
  return <section className="cr-detail-section">
    {!editing ? <button type="button" className="m1-button" onClick={() => { setEditing(true); onEditingChange(true); }}>更正标准并保留历史</button> : <form onSubmit={event => void save(event)}><h3>新增更正版本</h3><p>旧版本及其评审、发放引用保留。此操作不授予量产许可。</p><fieldset disabled={busy} style={{ border: 0, minWidth: 0, padding: 0 }}>
      <div className="form-grid"><label className="field"><span>色板编号</span><input maxLength={128} value={boardCode} onChange={event => setBoardCode(event.target.value)} /></label><label className="field"><span>入清单月份</span><input type="month" value={month} onChange={event => setMonth(event.target.value)} /></label></div>
      <ColorStandardFields value={standard} onChange={setStandard} disabled={busy} requireChangeSummary />
    </fieldset>{error ? <p role="alert" className="m1-error">{error} 草稿已保留。</p> : null}<div className="m1-button-group"><button type="submit" className="m1-button m1-primary" disabled={busy}>{busy ? '正在保存并读回…' : '保存为新标准版本'}</button><button type="button" className="m1-button" disabled={busy} onClick={() => { if (window.confirm('放弃未保存的标准更正？')) { setEditing(false); onEditingChange(false); } }}>取消更正</button></div></form>}
  </section>;
}
