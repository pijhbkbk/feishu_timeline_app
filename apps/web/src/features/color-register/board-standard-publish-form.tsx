'use client';

import Link from 'next/link';
import { ExistingProjectColorLink } from './existing-project-color-link';
import React, { useRef, useState, type FormEvent } from 'react';
import { ApiRequestError, apiRequest } from '../../lib/auth-client';
import { fetchStandardBoardWorkspace, type StandardBoardWorkspaceResponse } from '../../lib/standard-boards-client';
import { useProjectUnsavedChanges } from '../m1/use-unsaved';
import { ColorStandardFields, emptyColorStandardDraft, technicalDataFromDraft } from './color-standard-fields';

type PublishResult = { boardId: string; colorId: string; colorVersionId: string; standardVersionNo: number; registerRevision: number; taskVersion: string };
const emptyForm = () => ({ boardCode: '', basedOnSampleId: '', producedAt: '', registerMonth: '', remark: '' });

export function BoardStandardPublishForm({ projectId, workspace, canManage, onSaved }: { projectId: string; workspace: StandardBoardWorkspaceResponse; canManage: boolean; onSaved: (next: StandardBoardWorkspaceResponse) => void }) {
  const [form, setForm] = useState(emptyForm);
  const [standard, setStandard] = useState(emptyColorStandardDraft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<PublishResult | null>(null);
  const pending = useRef(false);
  const command = useRef<{ fingerprint: string; body: Record<string, unknown> } | null>(null);
  const dirty = Object.values(form).some(Boolean) || Object.entries(standard).some(([key, value]) => key === 'measurements' ? standard.measurements.some(row => Object.values(row).some(Boolean)) : Boolean(value));
  useProjectUnsavedChanges(dirty);
  const color = workspace.project.primaryColor;
  const task = workspace.activeStandardBoardTask;
  const enabled = canManage && Boolean(task && color?.productionBaseId) && workspace.procurementCompleted;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current || !enabled || !color || !task) return;
    pending.current = true; setBusy(true); setError(''); setSaved(null);
    try {
      const fields = { boardCode: form.boardCode.trim(), basedOnSampleId: form.basedOnSampleId || null, producedAt: form.producedAt || null,
        ...(form.registerMonth ? { registerMonth: form.registerMonth } : {}), remark: form.remark || null, technicalData: technicalDataFromDraft(standard) };
      const fingerprint = JSON.stringify({ projectId, ...fields });
      if (command.current?.fingerprint !== fingerprint) command.current = { fingerprint, body: { ...fields, taskId: task.id, taskVersion: task.updatedAt, expectedColorRevision: color.registerRevision, idempotencyKey: crypto.randomUUID() } };
      const result = await apiRequest<PublishResult>(`/projects/${encodeURIComponent(projectId)}/standard-boards/save-and-publish`, { method: 'POST', body: command.current.body, signal: AbortSignal.timeout(30000) });
      const [next, detail] = await Promise.all([fetchStandardBoardWorkspace(projectId), apiRequest<{ id: string; versions: Array<{ id: string }> }>(`/color-register/${encodeURIComponent(result.colorId)}`, { signal: AbortSignal.timeout(15000) })]);
      if (!next.items.some(board => board.id === result.boardId && board.colorVersionId === result.colorVersionId) || detail.id !== result.colorId || !detail.versions.some(version => version.id === result.colorVersionId)) throw new Error('保存请求已返回，但尚未核对到清单记录。草稿已保留，请重试读取。');
      onSaved(next); setSaved(result); setForm(emptyForm()); setStandard(emptyColorStandardDraft()); command.current = null;
    } catch (cause) {
      if (cause instanceof ApiRequestError && cause.status === 409) command.current = null;
      setError(cause instanceof Error ? cause.message : '保存失败，已填写内容仍保留。');
    } finally { pending.current = false; setBusy(false); }
  }

  return <>{!color ? <ExistingProjectColorLink projectId={projectId} canManage={canManage} onSaved={onSaved} /> : null}<section className="page-card">
    <div className="section-header"><div><h2 className="section-title">制板标定</h2><p>{color ? `关联颜色：${color.name} · ${color.productionBase?.name ?? "基地待核对"}` : '请先核对项目对应的颜色与生产基地。'}</p><p className="muted">入清单不代表获准量产；发放和节点完成仍分别办理。</p></div></div>
    {!enabled ? <p>{!color?.productionBaseId ? '颜色身份或生产基地尚未确认。' : !workspace.procurementCompleted ? '采购完成后可保存制板标准。' : !task ? '当前制板工序未激活。' : '当前账号没有操作权限。'}</p> : null}
    <form onSubmit={event => void submit(event)}>
      <fieldset disabled={!enabled || busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <div className="form-grid">
          <label className="field"><span>色板编号</span><input required maxLength={128} value={form.boardCode} onChange={event => setForm({ ...form, boardCode: event.target.value })} /></label>
          <label className="field"><span>关联样板</span><select value={form.basedOnSampleId} onChange={event => setForm({ ...form, basedOnSampleId: event.target.value })}><option value="">未指定</option>{workspace.sampleOptions.map(sample => <option key={sample.id} value={sample.id}>{sample.sampleNo} · {sample.sampleName} V{sample.versionNo}</option>)}</select></label>
          <label className="field"><span>制作日期</span><input type="date" value={form.producedAt} onChange={event => setForm({ ...form, producedAt: event.target.value })} /></label>
          <label className="field"><span>入清单月份</span><input type="month" value={form.registerMonth} onChange={event => setForm({ ...form, registerMonth: event.target.value })} /></label>
        </div>
        <div style={{ marginBlock: 24 }}><ColorStandardFields value={standard} onChange={setStandard} disabled={!enabled || busy} /></div>
        <label className="field"><span>制板备注</span><textarea maxLength={4000} rows={2} value={form.remark} onChange={event => setForm({ ...form, remark: event.target.value })} /></label>
      </fieldset>
      {error ? <p className="error-text" role="alert">{error} 已填写内容仍保留；如提示记录已变化，请先刷新本页数据后核对。</p> : null}
      {saved ? <p className="success-text" role="status">标准 V{saved.standardVersionNo} 已保存并在颜色清单读回。 <Link href={`/admin/color-database?colorId=${encodeURIComponent(saved.colorId)}`}>查看颜色清单</Link></p> : null}
      <div className="inline-actions" style={{ marginTop: 20 }}><button className="button button-primary" type="submit" disabled={!enabled || busy}>{busy ? '正在保存并核对…' : '保存并加入颜色清单'}</button></div>
    </form>
  </section></>;
}
