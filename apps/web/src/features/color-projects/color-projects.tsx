'use client';

import { ProjectColorPicker, type ProjectColorChoice } from '../color-register/project-color-picker';
import { displayColorName } from '../m1/color-name';
import { M1FilePicker } from '../m1/file-picker';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import React, { Suspense, useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../../components/auth-provider';
import { API_BASE_URL, ApiRequestError, apiRequest } from '../../lib/auth-client';
import { fetchProjectAttachmentDetail, getAttachmentScanStatusLabel, type ProjectAttachmentSummary } from '../../lib/attachments-client';
import type { R26TaskResponse, R26ProgressResponse, R26WorkspaceResponse } from '../v2/real-types';
import { canCreateColorProject } from '../../lib/project-capabilities';
import { getProjectStatusLabel, type ProjectDetail, type ProjectListResponse } from '../../lib/projects-client';
import { useProjectUnsavedChanges } from '../m1/use-unsaved';
import { M1Icon } from '../m1/icon';
import { materialUploadTarget } from '../m1/record-facts';

type QueryValues = Pick<URLSearchParams, 'get'>;

export function projectListHref(query: QueryValues) {
  const params = new URLSearchParams();
  const keyword = (query.get('listKeyword') ?? '').slice(0, 100);
  const stage = query.get('listStage') ?? '';
  const page = Number(query.get('listPage'));
  if (keyword) params.set('keyword', keyword);
  if (/^[A-Z_]{1,64}$/.test(stage)) params.set('stage', stage);
  if (Number.isSafeInteger(page) && page > 1 && page <= 100000) params.set('page', String(page));
  return `/projects${params.size ? `?${params}` : ''}`;
}

export function projectListContext(query: QueryValues) {
  const params = new URLSearchParams();
  const keyword = (query.get('keyword') ?? '').slice(0, 100);
  const stage = query.get('stage') ?? '';
  const page = Number(query.get('page'));
  if (keyword) params.set('listKeyword', keyword);
  if (/^[A-Z_]{1,64}$/.test(stage)) params.set('listStage', stage);
  if (Number.isSafeInteger(page) && page > 1 && page <= 100000) params.set('listPage', String(page));
  params.set('from', 'list');
  return params;
}

export { useProjectUnsavedChanges } from '../m1/use-unsaved';

export function ColorProjects() {
  return <Suspense fallback={<p role="status">正在加载颜色项目…</p>}><ColorProjectList /></Suspense>;
}

function ColorProjectList() {
  const { user } = useAuth();
  const router = useRouter();
  const query = useSearchParams();
  const keyword = (query.get('keyword') ?? '').slice(0, 100);
  const currentNodeCode = /^[A-Z_]{1,64}$/.test(query.get('stage') ?? '') ? query.get('stage')! : '';
  const requestedPage = Number(query.get('page'));
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 && requestedPage <= 100000 ? requestedPage : 1;
  const [search, setSearch] = useState(keyword);
  const [data, setData] = useState<ProjectListResponse | null>(null);
  const [nodes, setNodes] = useState<ProjectListResponse['nodeOptions']>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const listKey = `m1-project-list:${keyword}:${currentNodeCode}:${page}`;
  useEffect(() => setSearch(keyword), [keyword]);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let current = true;
    setLoading(true); setError(''); setData(null);
    const params = new URLSearchParams({ page: String(page), pageSize: '20', ...(keyword ? { keyword } : {}), ...(currentNodeCode ? { currentNodeCode } : {}) });
    void apiRequest<ProjectListResponse>(`/projects?${params}`, { signal: controller.signal })
      .then(result => { if (current) { setData(result); setNodes(result.nodeOptions); } })
      .catch(e => { if (current) setError(e instanceof Error ? e.message : '项目加载失败。'); })
      .finally(() => { if (current) setLoading(false); clearTimeout(timeout); });
    return () => { current = false; controller.abort(); clearTimeout(timeout); };
  }, [keyword, currentNodeCode, page, refresh, user]);
  useEffect(() => {
    if (loading || !data) return;
    const scroll = Number(window.sessionStorage.getItem(listKey) ?? '0');
    if (Number.isFinite(scroll) && scroll > 0) window.requestAnimationFrame(() => window.scrollTo(0, scroll));
  }, [loading, data, listKey]);
  function filters(nextKeyword: string, nextStage: string, nextPage = 1) {
    const params = new URLSearchParams();
    if (nextKeyword.trim()) params.set('keyword', nextKeyword.trim());
    if (nextStage) params.set('stage', nextStage);
    if (nextPage > 1) params.set('page', String(nextPage));
    router.push(`/projects${params.size ? `?${params}` : ''}`, { scroll: false });
  }
  function rememberScroll() { window.sessionStorage.setItem(listKey, String(window.scrollY)); }
  const context = projectListContext(query);
  return <section className="m1-project-page m1-project-list" data-source="database">
    <nav className="m1-breadcrumb m1-project-breadcrumb" aria-label="面包屑"><Link href="/dashboard" aria-label="返回工作台"><M1Icon name="back" /></Link><span>颜色项目</span></nav>
    <header className="m1-heading m1-project-heading"><h1>颜色项目</h1>{canCreateColorProject(user) ? <Link className="m1-button m1-primary" onClick={rememberScroll} href={`/projects/new?${context}`}><M1Icon name="project" />新建项目</Link> : null}</header>
    <section className="m1-card m1-project-card">
      <form className="m1-project-filters" onSubmit={event => { event.preventDefault(); filters(search, currentNodeCode); }}>
        <div className="m1-project-search"><label htmlFor="m1-project-search" className="m1-project-sr-only">颜色、编号或车型</label><input id="m1-project-search" type="search" value={search} maxLength={100} placeholder="颜色 / 编号 / 车型" onChange={event => setSearch(event.target.value)} /><button className="m1-icon-button" type="submit" aria-label="搜索颜色项目"><M1Icon name="next" /></button></div>
        <label className="m1-project-filter"><span className="m1-project-sr-only">当前阶段</span><select value={currentNodeCode} onChange={event => filters(search, event.target.value)}><option value="">全部阶段</option>{nodes.map(node => <option key={node.code} value={node.code}>{node.name}</option>)}</select></label>
        {keyword || currentNodeCode ? <button className="m1-icon-button" type="button" aria-label="重置搜索和筛选" onClick={() => { setSearch(''); filters('', ''); }}><M1Icon name="refresh" /></button> : null}
      </form>
      {loading ? <p className="m1-project-state" role="status">正在加载颜色项目…</p> : error ? <div className="m1-project-state" role="alert"><p>{error}</p><button className="m1-button" onClick={() => setRefresh(value => value + 1)}>重新加载</button></div> : !data?.items.length ? <div className="m1-project-state"><h2>{keyword || currentNodeCode ? '没有符合条件的项目' : '还没有颜色项目'}</h2></div> : <>
        <div className="m1-project-table-wrap"><table className="m1-project-table"><thead><tr><th>颜色项目</th><th>车型</th><th>当前事项</th><th>最近更新</th><th>状态</th><th><span className="m1-project-sr-only">查看项目</span></th></tr></thead><tbody>{data.items.map(item => {
          const href = `/projects/${encodeURIComponent(item.id)}?${context}`;
          return <tr key={item.id}><td><Link className="m1-project-title-link" onClick={rememberScroll} href={href}>{displayColorName(item.name,item.colorName)} · {item.colorCode || item.code}</Link></td><td data-label="车型">{item.vehicleModel || '—'}</td><td data-label="当前事项">{item.status === 'COMPLETED' ? '已完成' : item.currentNodeName || '待建项'}</td><td data-label="最近更新"><time dateTime={item.latestTaskUpdatedAt}>{formatProjectUpdate(item.latestTaskUpdatedAt)}</time></td><td data-label="状态"><span className={`m1-badge m1-project-status ${item.status === 'ON_HOLD' || item.isOverdue ? 'm1-project-status-warning' : ''}`}>{getProjectStatusLabel(item.status)}</span></td><td className="m1-project-row-action"><Link className="m1-icon-button" aria-label={`打开${displayColorName(item.name,item.colorName)}`} onClick={rememberScroll} href={href}><M1Icon name="next" /></Link></td></tr>;
        })}</tbody></table></div>
        {data.totalPages > 1 ? <footer className="m1-project-pagination"><span>共 {data.total} 个 · {data.page} / {data.totalPages}</span><button className="m1-button" disabled={data.page <= 1} onClick={() => filters(keyword, currentNodeCode, page - 1)}>上一页</button><button className="m1-button" disabled={data.page >= data.totalPages} onClick={() => filters(keyword, currentNodeCode, page + 1)}>下一页</button></footer> : null}
      </>}
    </section>
  </section>;
}

function formatProjectUpdate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
}

export function NewColorProject() {
  return <Suspense fallback={<p role="status">正在加载新建项目…</p>}><NewColorProjectForm /></Suspense>;
}

function NewColorProjectForm() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const query = useSearchParams();
  const returnHref = query.get('from') === 'dashboard' ? '/dashboard' : projectListHref(query);
  const [form, setForm] = useState({ name: '', vehicleModel: '', description: '', plannedStartDate: '', approvedReportDate: '', approvalReference: '', demandSource: '' });
  const [colorChoice, setColorChoice] = useState<ProjectColorChoice>({ colorMode: 'NEW', colorName: '', productionBaseId: '', existingColorId: '' });
  const [file, setFile] = useState<File | null>(null);
  const [draft, setDraft] = useState<ProjectDetail | null>(null);
  const [attachment, setAttachment] = useState<ProjectAttachmentSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('');
  const [error, setError] = useState('');
  const createRequest = useRef<{ body: string; key: string } | null>(null);
  const uploadRequest = useRef<{ fingerprint: string; key: string; version: string; path: string; replacesAttachmentId: string | null } | null>(null);
  const reportRequest = useRef<{ fingerprint: string; key: string; body: Record<string, unknown> } | null>(null);
  const pending = useRef(false);
  const allowLeave = useProjectUnsavedChanges(Object.values(form).some(Boolean) || Boolean(file) || Boolean(colorChoice.productionBaseId || colorChoice.existingColorId));
  async function submit(event: FormEvent) {
    event.preventDefault(); if (pending.current) return;
    if (!form.name.trim()) { setError('请填写颜色名称。'); return; }
    if (!colorChoice.productionBaseId || (colorChoice.colorMode === 'EXISTING' && !colorChoice.existingColorId)) { setError('请先选择生产基地，并核对已有颜色记录。'); return; }
    if (!form.approvedReportDate || !form.approvalReference.trim() || !form.demandSource.trim()) { setError('请填写批准日期、批准依据和需求来源。'); return; }
    if (!file && !attachment) { setError('请选择已获批的新颜色开发报告。'); return; }
    pending.current = true; setBusy(true); setError('');
    try {
      let project = draft;
      if (!project) {
        setPhase('正在创建项目…');
        const body = { ...colorChoice, colorName: form.name.trim(), name: form.name.trim(), priority: 'MEDIUM', vehicleModel: form.vehicleModel.trim() || null, description: form.description.trim() || null, plannedStartDate: form.plannedStartDate || null };
        const serialized = JSON.stringify(body);
        if (createRequest.current?.body !== serialized) createRequest.current = { body: serialized, key: crypto.randomUUID() };
        project = await apiRequest<ProjectDetail>('/projects', { method: 'POST', headers: { 'Idempotency-Key': createRequest.current.key }, body, signal: AbortSignal.timeout(30000) });
        setDraft(project);
      }
      const workspace = await apiRequest<R26WorkspaceResponse>(`/v2/projects/${encodeURIComponent(project.id)}/workspace`);
      const initialTask = workspace.flowMap.nodes.find(node => node.nodeCode === 'PROJECT_INITIATION' && node.taskId);
      if (!initialTask?.taskId) throw new Error('项目建项节点未能读取，请重试。');
      const taskId = initialTask.taskId;
      let reportAttachment = attachment ? await fetchProjectAttachmentDetail(project.id, attachment.id) : null;
      if (!reportAttachment) {
        if (!file) throw new Error('请选择已获批的新颜色开发报告。');
        setPhase('正在上传开发报告…');
        const fingerprint = `${taskId}:${file.name}:${file.size}:${file.lastModified}`;
        if (uploadRequest.current?.fingerprint !== fingerprint) {
          const task = await apiRequest<R26ProgressResponse>(`/v2/tasks/${encodeURIComponent(taskId)}/progress-context`, { signal: AbortSignal.timeout(15000) });
          const target = materialUploadTarget(taskId, 'approved-development-report', task.materials.current);
          uploadRequest.current = { fingerprint, key: crypto.randomUUID(), version: task.taskVersion, ...target };
        }
        const upload = new FormData();
        upload.append('file', file);
        upload.append('materialType', 'approved-development-report');
        upload.append('taskVersion', uploadRequest.current.version);
        upload.append('idempotencyKey', uploadRequest.current.key);
        if (uploadRequest.current.replacesAttachmentId) upload.append('replacesAttachmentId', uploadRequest.current.replacesAttachmentId);
        const response = await apiRequest<{ attachment: ProjectAttachmentSummary }>(uploadRequest.current.path, { method: 'POST', body: upload, headers: { 'Idempotency-Key': uploadRequest.current.key }, signal: AbortSignal.timeout(90000) });
        reportAttachment = await fetchProjectAttachmentDetail(project.id, response.attachment.id);
        setAttachment(reportAttachment);
      }
      setPhase('安全扫描中…');
      for (let attempt = 0; reportAttachment.scanStatus === 'PENDING_SCAN' && attempt < 40; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        reportAttachment = await fetchProjectAttachmentDetail(project.id, reportAttachment.id);
        setAttachment(reportAttachment);
      }
      if (reportAttachment.scanStatus !== 'CLEAN') {
        if (reportAttachment.scanStatus === 'PENDING_SCAN') throw new Error('扫描仍在进行，项目草稿和材料已保留，请稍后重试。');
        if (reportAttachment.scanStatus === 'REJECTED') throw new Error('开发报告未通过安全扫描，请更换文件。');
        throw new Error('开发报告扫描异常，请稍后重试。');
      }
      setPhase('正在登记已批准报告…');
      const reportFields = { taskId, reportAttachmentId: reportAttachment.id, approvedReportDate: form.approvedReportDate, approvalReference: form.approvalReference.trim(), demandSource: form.demandSource.trim() };
      const fingerprint = JSON.stringify(reportFields);
      if (reportRequest.current?.fingerprint !== fingerprint) {
        const task = await apiRequest<R26TaskResponse>(`/v2/tasks/${encodeURIComponent(taskId)}`);
        const key = crypto.randomUUID();
        reportRequest.current = { fingerprint, key, body: { ...reportFields, taskVersion: task.task.taskVersion, idempotencyKey: key } };
      }
      await apiRequest(`/projects/${encodeURIComponent(project.id)}/approved-report`, { method: 'POST', headers: { 'Idempotency-Key': reportRequest.current.key }, body: reportRequest.current.body, signal: AbortSignal.timeout(30000) });
      allowLeave();
      router.push(`/projects/${encodeURIComponent(project.id)}?${query}`);
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 409) {
        uploadRequest.current = null;
        reportRequest.current = null;
      }
      setError(e instanceof Error ? e.message : '创建失败，请重试。');
    }
    finally { pending.current = false; setBusy(false); setPhase(''); }
  }
  if (isLoading) return <p role="status">正在加载账号…</p>;
  if (!canCreateColorProject(user)) return <section className="m1-project-page"><h1>新建颜色项目</h1><p role="alert">当前账号未获准建立颜色项目。</p><Link href={returnHref}>返回颜色项目</Link></section>;
  return <section className="m1-project-page m1-project-create">
    <nav className="m1-breadcrumb m1-project-breadcrumb" aria-label="面包屑"><Link href={returnHref} aria-label="返回来源页面"><M1Icon name="back" /></Link><span>颜色项目</span><span aria-hidden="true">/</span><span>新建项目</span></nav>
    <header className="m1-heading m1-project-heading"><h1>新建颜色项目</h1>{draft ? <span className="m1-badge m1-project-status m1-project-status-warning">项目草稿 · {draft.code}</span> : null}</header>
    <form className="m1-card m1-project-card m1-project-form" onSubmit={event => void submit(event)}>
      <ProjectColorPicker value={colorChoice} disabled={busy || Boolean(draft)} onChange={next => { setColorChoice(next); setForm(current => ({ ...current, name: next.colorName })); }} />
      <label className="m1-project-field m1-project-field-full"><span>颜色名称</span><input required autoComplete="off" maxLength={200} disabled={busy || Boolean(draft) || colorChoice.colorMode === 'EXISTING'} value={form.name} onChange={event => { setForm({ ...form, name: event.target.value }); setColorChoice({ ...colorChoice, colorName: event.target.value }); }} /></label>
      <label className="m1-project-field"><span>适用车型</span><input maxLength={64} disabled={busy || Boolean(draft)} value={form.vehicleModel} onChange={event => setForm({ ...form, vehicleModel: event.target.value })} /></label>
      <label className="m1-project-field"><span>计划开始日期</span><input type="date" disabled={busy || Boolean(draft)} value={form.plannedStartDate} onChange={event => setForm({ ...form, plannedStartDate: event.target.value })} /></label>
      <label className="m1-project-field m1-project-field-full"><span>需求说明</span><textarea rows={3} maxLength={2000} disabled={busy || Boolean(draft)} value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /></label>
      <label className="m1-project-field"><span>开发报告批准日期</span><input required type="date" disabled={busy} value={form.approvedReportDate} onChange={event => setForm({ ...form, approvedReportDate: event.target.value })} /></label>
      <label className="m1-project-field"><span>批准依据</span><input required maxLength={200} disabled={busy} value={form.approvalReference} onChange={event => setForm({ ...form, approvalReference: event.target.value })} /></label>
      <label className="m1-project-field m1-project-field-full"><span>需求来源</span><input required maxLength={500} disabled={busy} value={form.demandSource} onChange={event => setForm({ ...form, demandSource: event.target.value })} /></label>
      <div className="m1-project-field m1-project-field-full"><span>已获批的新颜色开发报告</span><M1FilePicker label="已获批的新颜色开发报告" file={file} disabled={busy} onChange={next => { setFile(next); setAttachment(null); uploadRequest.current = null; reportRequest.current = null; }} /></div>
      {attachment ? <div className="m1-project-report-file m1-project-field-full"><M1Icon name="project" /><span>{attachment.fileName}</span><span className="m1-badge m1-project-status">{getAttachmentScanStatusLabel(attachment.scanStatus)}</span>{attachment.canDownload && attachment.downloadUrl ? <a className="m1-button" href={`${API_BASE_URL}${attachment.downloadUrl}`} target="_blank" rel="noreferrer">下载</a> : null}</div> : null}
      {phase ? <p className="m1-project-field-full" role="status">{phase}</p> : null}
      {error ? <p className="m1-error m1-project-error m1-project-field-full" role="alert">{error}</p> : null}
      <footer className="m1-project-form-actions m1-project-field-full"><Link className="m1-button" href={returnHref}>取消</Link><button className="m1-button m1-primary" disabled={busy}><M1Icon name="check" />{busy ? '正在保存…' : draft ? '继续保存' : '创建项目'}</button></footer>
    </form>
  </section>;
}
