'use client';
import React, { useRef, useState } from 'react';
import { ApiRequestError } from '../lib/auth-client';
import { completeExteriorRectification, type ExteriorRectificationInput, type ExteriorRectificationSummary, type ConsistencyReviewWorkspaceResponse } from '../lib/consistency-reviews-client';

/** Records the current team's supplier follow-up. No supplier account or extra approval is created. */
export function ExteriorRectificationPanel({ projectId, correction, disabled, onSaved, onError }: {
  projectId: string; correction: ExteriorRectificationSummary; disabled: boolean;
  onSaved: (workspace: ConsistencyReviewWorkspaceResponse) => void; onError: (message: string) => void;
}) {
  const [supplierName, setSupplierName] = useState(''), [completedOn, setCompletedOn] = useState(''), [summary, setSummary] = useState('');
  const [saving, setSaving] = useState(false), [uncertain, setUncertain] = useState(false);
  const pending = useRef<Readonly<ExteriorRectificationInput> | null>(null);
  async function save() {
    if (saving || disabled) return;
    const request = pending.current ?? Object.freeze({ taskId: correction.taskId, expectedTaskVersion: correction.taskVersion, operationId: crypto.randomUUID(), supplierName, completedOn, summary });
    pending.current = request; setSaving(true); onError('');
    try {
      const result = await completeExteriorRectification(projectId, request);
      pending.current = null; setUncertain(false); onSaved(result.workspace);
    } catch (cause) {
      // A definitive 4xx did not create a new completion. Unknown outcomes retry the exact body/key.
      const definitive = cause instanceof ApiRequestError && cause.status >= 400 && cause.status < 500 && ![408, 429].includes(cause.status);
      if (definitive) pending.current = null;
      setUncertain(!definitive);
      onError(cause instanceof Error ? cause.message : '整改保存失败，请核对后重试。');
    } finally { setSaving(false); }
  }
  return <section className="page-card">
    <h2 className="section-title">外饰件厂家整改{correction.status === 'COMPLETED' ? '已登记，待整车复审' : '待完成'}</h2>
    <p>{correction.requirement || '按上轮整车评审不通过意见完成整改。'}</p>
    <p className="muted">保留已有效的驾驶室评审、标准、颜色与收费记录。整改完成记录不代表整车评审通过。</p>
    {correction.status === 'COMPLETED' ? <dl className="metadata-grid">
      <div><dt>外饰件厂家</dt><dd>{correction.supplierName}</dd></div><div><dt>整改完成日期</dt><dd>{correction.completedOn}</dd></div><div><dt>整改说明</dt><dd>{correction.summary}</dd></div>
    </dl> : <form onSubmit={event => { event.preventDefault(); void save(); }}>
      <fieldset disabled={disabled || saving || uncertain}>
        <label>外饰件厂家<input required maxLength={200} value={supplierName} onChange={event => setSupplierName(event.target.value)} /></label>
        <label>整改完成日期<input type="date" required value={completedOn} onChange={event => setCompletedOn(event.target.value)} /></label>
        <label>整改说明<textarea required maxLength={4000} value={summary} onChange={event => setSummary(event.target.value)} /></label>
      </fieldset>
      {uncertain ? <p role="status">尚未确认保存结果；重试将发送原请求。也可刷新核对已保存的整改记录。</p> : null}
      <div className="inline-actions"><button type="submit" className="button button-primary" disabled={disabled || saving}>{saving ? '正在保存…' : uncertain ? '重试原整改请求' : '登记整改完成，进入整车复审'}</button>
        <button type="button" className="button button-secondary" disabled={disabled || saving || uncertain} onClick={() => { setSupplierName(''); setCompletedOn(''); setSummary(''); onError(''); }}>取消本次填写</button></div>
    </form>}
  </section>;
}
