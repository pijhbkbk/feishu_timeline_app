'use client';

import Link from 'next/link';
import React, { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../../components/auth-provider';
import { API_BASE_URL, apiRequest } from '../../lib/auth-client';
import { getR26BusinessRecordAction } from '../v2/business-record-actions';
import type { R26MaterialVersion, R26ProgressMaterials, R26ProgressResponse, R26ProgressStatus } from '../v2/real-types';

const progressLabels: Record<R26ProgressStatus, string> = { NOT_STARTED: '尚未开始', IN_PROGRESS: '正在办理', BLOCKED: '遇到阻塞', WORK_COMPLETE_PENDING_TASK_COMPLETION: '工作已就绪，待完成检查' };
export function TaskWorkspace({ projectId, taskId }: { projectId: string; taskId: string }) {
  const { user } = useAuth();
  return <TaskWorkForm key={`${user?.id}:${user?.roleCodes.join(',')}:${projectId}:${taskId}`} projectId={projectId} taskId={taskId} />;
}
function TaskWorkForm({ projectId, taskId }: { projectId: string; taskId: string }) {
  const { user } = useAuth();
  const [data, setData] = useState<R26ProgressResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [form, setForm] = useState({ progressStatus: 'IN_PROGRESS' as R26ProgressStatus, completedWork: '', nextPlan: '', blockerDescription: '', expectedResolvedAt: '' });
  const [materialType, setMaterialType] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [replacement, setReplacement] = useState('');
  const [refresh, setRefresh] = useState(0);
  const requestIds = useRef(new Map<string, string>());
  const fileIds = useRef(new WeakMap<File, string>());
  const pending = useRef(false);
  const context = `${user?.id}:${user?.roleCodes.join(',')}:${projectId}:${taskId}`;
  const latest = useRef(context); latest.current = context;
  useEffect(() => {
    let current = true; setLoading(true); setError(''); setData(null);
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 15000);
    void apiRequest<R26ProgressResponse>(`/v2/tasks/${encodeURIComponent(taskId)}/progress-context`, { signal: controller.signal }).then(result => {
      if (!current) return;
      if (result.task.projectId !== projectId || result.task.taskId !== taskId) throw new Error('所选任务不属于当前项目。');
      setData(result);
      setMaterialType(value => value === '其他工序材料' || result.materials.requirements.some(item => item.id === value) ? value : result.materials.requirements[0]?.id || '其他工序材料');
    }).catch(e => { if (current) setError(e instanceof Error ? e.message : '任务读取失败。'); }).finally(() => { clearTimeout(timer); if (current) setLoading(false); });
    return () => { current = false; clearTimeout(timer); controller.abort(); };
  }, [context, refresh, projectId, taskId]);
  function keyFor(value: string) { let key = requestIds.current.get(value); if (!key) { key = crypto.randomUUID(); requestIds.current.set(value, key); } return key; }
  async function write(kind: string, path: string, payload: Record<string, unknown> | FormData, fingerprint: string) {
    if (pending.current || !data) return;
    const command = `${context}:${kind}:${data.taskVersion}:${fingerprint}`;
    const idempotencyKey = keyFor(command);
    const body = payload instanceof FormData ? payload : { ...payload, taskVersion: data.taskVersion, idempotencyKey };
    if (body instanceof FormData) { body.set('taskVersion', data.taskVersion); body.set('idempotencyKey', idempotencyKey); }
    pending.current = true; setBusy(kind); setError(''); setNotice('');
    try {
      await apiRequest(path, { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body, signal: AbortSignal.timeout(kind === 'upload' ? 90000 : 30000) });
      requestIds.current.delete(command);
      if (latest.current !== context) return;
      setNotice(kind === 'upload' ? '材料已保存。' : '工作进展已保存。');
      if (kind === 'upload') { setFile(null); setReplacement(''); }
      setRefresh(value => value + 1);
    } catch (e) { if (latest.current === context) setError(e instanceof Error ? e.message : '保存失败，请重试。'); }
    finally { pending.current = false; setBusy(''); }
  }
  function save(event: FormEvent) {
    event.preventDefault(); if (!form.completedWork.trim()) { setError('请填写已完成工作。'); return; }
    const payload = { progressStatus: form.progressStatus, completedWork: form.completedWork.trim(), nextPlan: form.nextPlan.trim() || null,
      ...(form.progressStatus === 'BLOCKED' ? { blockerType: 'OTHER', blockerDescription: form.blockerDescription.trim(), expectedResolvedAt: form.expectedResolvedAt ? new Date(form.expectedResolvedAt).toISOString() : null, impactLevel: 'MAY_DELAY' } : {}) };
    void write('progress', `/v2/tasks/${encodeURIComponent(taskId)}/progress-updates`, payload, JSON.stringify(payload));
  }
  function upload(event: FormEvent) {
    event.preventDefault(); if (!file || !materialType) return;
    const payload = new FormData(); payload.set('file', file); payload.set('materialType', materialType);
    if (replacement) payload.set('replacesAttachmentId', replacement);
    let fileId = fileIds.current.get(file); if (!fileId) { fileId = crypto.randomUUID(); fileIds.current.set(file, fileId); }
    void write('upload', `/v2/tasks/${encodeURIComponent(taskId)}/materials${replacement ? `/${encodeURIComponent(replacement)}/versions` : ''}`, payload, `${materialType}:${replacement}:${fileId}`);
  }
  if (loading) return <section className="team-workspace"><p role="status">正在加载工作单…</p></section>;
  if (!data) return <section className="team-workspace"><p role="alert">{error || '工作单未能加载。'}</p><button className="button" onClick={() => setRefresh(value => value + 1)}>重新加载</button></section>;
  const business = getR26BusinessRecordAction(data.task.nodeCode, projectId);
  const canUpload = data.availableActions.some(item => item.action === 'UPLOAD_MATERIAL');
  return <section className="team-workspace task-workspace"><header className="work-heading"><div><h1>{data.task.stepName}</h1><p>{data.task.project.name} · 第 {data.task.roundNo} 轮 · {data.task.owner?.name || '待领取'}</p></div><Link href={`/projects/${encodeURIComponent(projectId)}?taskId=${encodeURIComponent(taskId)}`}>返回项目进度</Link></header>
    {error ? <p role="alert" className="error-text">{error}</p> : null}{notice ? <p role="status" className="work-notice">{notice}</p> : null}
    <div className="work-overview">{business ? <Link className="button button-primary" href={business.href}>{business.label}</Link> : null}<Link className="button" href={`/projects/${encodeURIComponent(projectId)}?taskId=${encodeURIComponent(taskId)}`}>检查工序完成条件</Link><button className="work-link" disabled={Boolean(busy)} onClick={() => setRefresh(value => value + 1)}>刷新</button></div>
    {business ? <p>{business.guidance}</p> : null}
    {data.progressSubmissionEnabled ? <form className="page-card form-grid" onSubmit={save}><h2 className="field-full">填写工作进展</h2>
      <label className="field"><span>本次状态</span><select disabled={Boolean(busy)} value={form.progressStatus} onChange={event => setForm({ ...form, progressStatus: event.target.value as R26ProgressStatus })}>{Object.entries(progressLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
      <label className="field field-full"><span>已完成工作 *</span><textarea required maxLength={4000} rows={3} disabled={Boolean(busy)} value={form.completedWork} onChange={event => setForm({ ...form, completedWork: event.target.value })} /></label>
      <label className="field field-full"><span>下一步计划</span><textarea maxLength={2000} rows={2} disabled={Boolean(busy)} value={form.nextPlan} onChange={event => setForm({ ...form, nextPlan: event.target.value })} /></label>
      {form.progressStatus === 'BLOCKED' ? <><label className="field"><span>阻塞原因 *</span><textarea required maxLength={2000} disabled={Boolean(busy)} value={form.blockerDescription} onChange={event => setForm({ ...form, blockerDescription: event.target.value })} /></label><label className="field"><span>预计解决时间 *</span><input required type="datetime-local" disabled={Boolean(busy)} value={form.expectedResolvedAt} onChange={event => setForm({ ...form, expectedResolvedAt: event.target.value })} /></label></> : null}
      <div className="field field-actions"><button className="button button-primary" disabled={Boolean(busy)}>{busy === 'progress' ? '正在保存…' : '保存进展'}</button><span>保存后可继续补充材料，再进行工序完成检查。</span></div>
    </form> : <p className="work-state">当前为查看模式。办理工作需具备相应角色并领取任务。</p>}
    <section className="page-card"><h2>工序材料</h2><ul>{data.materials.requirements.map(item => <li key={item.id}>{item.name} · {item.status === 'SUBMITTED' ? '已提交' : item.required ? '待补充' : '选填'}{item.currentAttachment ? <> · <a href={`${API_BASE_URL}${item.currentAttachment.downloadUrl}`}>{item.currentAttachment.fileName}</a></> : null}</li>)}</ul>
      {canUpload ? <form className="form-grid" onSubmit={upload}><label className="field"><span>材料类型</span><select disabled={Boolean(busy)} value={materialType} onChange={event => { setMaterialType(event.target.value); setReplacement(''); }}>{data.materials.requirements.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}<option value="其他工序材料">其他工序材料</option></select></label>
        <label className="field"><span>上传方式</span><select disabled={Boolean(busy)} value={replacement} onChange={event => setReplacement(event.target.value)}><option value="">新增材料</option>{data.materials.current.filter(item => item.materialType === materialType).map(item => <option value={item.id} key={item.id}>新版本：{item.fileName}</option>)}</select></label>
        <label className="field field-full"><span>选择文件</span><input type="file" required disabled={Boolean(busy)} onChange={event => setFile(event.target.files?.[0] ?? null)} /></label><button className="button" disabled={Boolean(busy) || !file}>{busy === 'upload' ? '正在上传并检查…' : '上传材料'}</button></form> : null}
      <MaterialHistory key={refresh} taskId={taskId} materials={data.materials} />
    </section>
    <section className="page-card"><h2>办理记录</h2>{data.progressHistory.length ? <ol>{data.progressHistory.map(item => <li key={item.id}><strong>{progressLabels[item.progressStatus]}</strong> · {item.submittedBy?.name || '系统'} · {new Date(item.createdAt).toLocaleString('zh-CN')}<p>{item.completedWork}</p>{item.nextPlan ? <p>下一步：{item.nextPlan}</p> : null}</li>)}</ol> : <p>还没有工作进展记录。</p>}</section>
  </section>;
}

function MaterialHistory({ taskId, materials }: { taskId: string; materials: R26ProgressMaterials }) {
  const [items, setItems] = useState(materials.versions);
  const [after, setAfter] = useState(materials.versionsNextCursor ?? null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const current = useRef(true);
  useEffect(() => { current.current = true; return () => { current.current = false; }; }, []);
  async function more() {
    if (busy || !after) return;
    setBusy(true); setError('');
    try {
      const result = await apiRequest<{ items: R26MaterialVersion[]; nextCursor: string | null }>(`/v2/tasks/${encodeURIComponent(taskId)}/material-versions?after=${encodeURIComponent(after)}`, { signal: AbortSignal.timeout(15000) });
      if (current.current) { setItems(previous => [...new Map([...previous, ...result.items].map(item => [item.id, item])).values()]); setAfter(result.nextCursor); }
    } catch (e) { if (current.current) setError(e instanceof Error ? e.message : '材料历史读取失败。'); }
    finally { if (current.current) setBusy(false); }
  }
  return <details><summary>材料与版本记录（{items.length}{after ? '+' : ''}）</summary>
    {items.length ? <ul>{items.map(item => <li key={item.id}><a href={`${API_BASE_URL}${item.downloadUrl}`}>{item.fileName}</a> · V{item.versionNo} · {item.uploadedByName}{item.isCurrent ? ' · 当前版本' : ' · 历史版本'}</li>)}</ul> : <p>尚未上传工序材料。</p>}
    {error ? <p role="alert">{error}</p> : null}{after ? <button type="button" className="button" disabled={busy} onClick={() => void more()}>{busy ? '正在加载…' : '加载更多版本'}</button> : null}
  </details>;
}
