'use client';

import { displayColorName } from '../m1/color-name';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../../components/auth-provider';
import { AttachmentsWorkspace } from '../../components/attachments-workspace';
import { apiRequest } from '../../lib/auth-client';
import { canCreateColorProject } from '../../lib/project-capabilities';
import { formatDateTime, updateProject, type ProjectDetail } from '../../lib/projects-client';
import { M1FlowMap } from '../m1/flow-map';
import { M1Icon } from '../m1/icon';
import type { R26WorkspaceResponse } from '../v2/real-types';
import { formatV2ActivitySummary } from '../v2/real-ui';
import { useR26ReadOnlyData } from '../v2/use-r26-readonly-data';
import { projectListHref, useProjectUnsavedChanges } from './color-projects';

type ProjectTab = 'flow' | 'materials' | 'tracking' | 'records';
const TABS: Array<{ key: ProjectTab; label: string }> = [{ key: 'flow', label: '流程' }, { key: 'materials', label: '资料' }, { key: 'tracking', label: '周评与产量' }, { key: 'records', label: '记录' }];

export function ColorProjectOverview({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  return <ProjectOverview key={`${projectId}:${user?.id}`} projectId={projectId} />;
}

function ProjectOverview({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const query = useSearchParams();
  const workspaceQuery = useR26ReadOnlyData<R26WorkspaceResponse>(`/v2/projects/${encodeURIComponent(projectId)}/workspace`);
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [projectError, setProjectError] = useState('');
  const [version, setVersion] = useState(0);
  const workspace = workspaceQuery.data;
  const tab: ProjectTab = TABS.some(item => item.key === query.get('tab')) ? query.get('tab') as ProjectTab : 'flow';
  const selectedNode = query.get('node') ?? query.get('nodeCode') ?? query.get('taskId') ?? undefined;
  const editing = query.get('edit') === '1';
  const projectPath = `/projects/${encodeURIComponent(projectId)}`;
  const returnHref = query.get('from') === 'dashboard' ? `/dashboard?project=${encodeURIComponent(projectId)}` : projectListHref(query);
  useEffect(() => {
    const controller = new AbortController();
    setProjectError('');
    void apiRequest<ProjectDetail>(`/projects/${encodeURIComponent(projectId)}`, { signal: controller.signal })
      .then(setProject)
      .catch(error => { if (!controller.signal.aborted) setProjectError(error instanceof Error ? error.message : '项目基本信息读取失败。'); });
    return () => controller.abort();
  }, [projectId, version]);
  function changeQuery(patch: Record<string, string | null>) {
    const params = new URLSearchParams(query.toString());
    for (const [key, value] of Object.entries(patch)) { if (value === null) params.delete(key); else params.set(key, value); }
    router.push(`${projectPath}${params.size ? `?${params}` : ''}`, { scroll: false });
  }
  if (workspaceQuery.loading) return <section className="m1-project-page"><p role="status" className="m1-project-state">正在加载项目…</p></section>;
  if (workspaceQuery.error || !workspace) return <section className="m1-project-page"><div className="m1-card m1-project-card m1-project-state" role="alert"><p>{workspaceQuery.error || '项目未能读取。'}</p><button className="m1-button" onClick={workspaceQuery.refresh}>重新加载</button><Link className="m1-button" href={returnHref}>返回</Link></div></section>;
  const name = displayColorName(workspace.project.name,workspace.flowMap.colorName);
  const performance = workspace.flowMap.nodes.find(node => node.nodeCode === 'PERFORMANCE_TEST');
  const trackingNodes = workspace.flowMap.nodes.filter(node => node.nodeCode === 'VISUAL_COLOR_DIFFERENCE_REVIEW' || node.nodeCode === 'MASS_PRODUCTION' || node.nodeCode === 'PROJECT_CLOSED');
  return <section className="m1-project-page m1-project-overview" data-source="database" data-testid="m1-project-overview">
    <nav className="m1-breadcrumb m1-project-breadcrumb" aria-label="面包屑"><Link href={returnHref} aria-label="返回来源页面"><M1Icon name="back" /></Link><Link href={returnHref}>颜色项目</Link><span aria-hidden="true">/</span><span>{workspace.project.code}</span></nav>
    <header className="m1-heading m1-project-heading"><h1>{name}</h1>{canCreateColorProject(user) ? <button className="m1-button" onClick={() => changeQuery({ edit: '1' })}><M1Icon name="file" />编辑项目</button> : null}</header>
    <nav className="m1-project-tabs" aria-label="项目内容">{TABS.map(item => <button type="button" key={item.key} aria-current={item.key === tab ? 'page' : undefined} onClick={() => changeQuery({ tab: item.key })}>{item.label}</button>)}</nav>
    {tab === 'flow' ? <div className="m1-project-overview-grid">
      <div className="m1-card m1-project-map"><M1FlowMap workspace={workspace} source="project" {...(selectedNode ? { selectedNode } : {})} /></div>
      <aside className="m1-card m1-project-card m1-project-facts"><h2>项目记录</h2><dl><div><dt>当前阶段</dt><dd>{workspace.flowMap.currentStepName}</dd></div><div><dt>车型</dt><dd>{project?.vehicleModel || '—'}</dd></div><div><dt>项目编号</dt><dd>{workspace.project.code}</dd></div><div><dt>性能试验</dt><dd>{performance?.statusLabel || '未开始'}</dd></div></dl>{projectError ? <p className="m1-error m1-project-error" role="alert">{projectError}<button className="m1-button" onClick={() => setVersion(value => value + 1)}>重试</button></p> : null}<button className="m1-button m1-project-material-link" onClick={() => changeQuery({ tab: 'materials' })}><M1Icon name="project" />项目资料</button></aside>
    </div> : null}
    {tab === 'materials' ? <div className="m1-project-materials"><AttachmentsWorkspace projectId={projectId} mode="materials" /></div> : null}
    {tab === 'tracking' ? <section className="m1-card m1-project-card m1-project-tracking"><h2>周评与产量</h2>{trackingNodes.length ? <ul>{trackingNodes.map(node => <li key={node.nodeCode}><strong>{node.stepName}</strong><span className="m1-badge m1-project-status">{node.statusLabel}</span>{node.taskId ? <Link className="m1-button" href={`${projectPath}/tasks/${encodeURIComponent(node.taskId)}?from=project&tab=tracking&node=${encodeURIComponent(node.nodeCode)}`}>查看记录</Link> : null}</li>)}</ul> : <p>尚无跟踪记录</p>}<Link className="m1-button" href={`${projectPath}/color-evaluation`}>月度评审</Link><Link className="m1-button" href={`${projectPath}/mass-production`}>生产记录</Link></section> : null}
    {tab === 'records' ? <section className="m1-card m1-project-card m1-project-records" data-testid="r26-project-records"><h2>项目记录</h2>{workspace.projectRecords.length ? <ol>{workspace.projectRecords.map(record => <li key={record.id} data-record-action={record.action}><time dateTime={record.createdAt}>{formatDateTime(record.createdAt)}</time><div><strong>{formatV2ActivitySummary(record.summary, '项目记录已更新')}</strong>{record.reason ? <p>{record.reason}</p> : null}</div><span>{record.actorName}</span></li>)}</ol> : <p>尚无项目记录</p>}</section> : null}
    {editing ? project ? <ProjectBasicsDialog project={project} onClose={() => changeQuery({ edit: null })} onSaved={updated => { setProject(updated); workspaceQuery.refresh(); changeQuery({ edit: null }); }} /> : <div className="m1-card m1-project-card" role={projectError ? 'alert' : 'status'}>{projectError || '正在加载项目资料…'}<button className="m1-button" onClick={() => changeQuery({ edit: null })}>取消</button></div> : null}
  </section>;
}

function ProjectBasicsDialog({ project, onClose, onSaved }: { project: ProjectDetail; onClose: () => void; onSaved: (project: ProjectDetail) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const initial = { name: project.name, vehicleModel: project.vehicleModel ?? '', description: project.description ?? '', plannedStartDate: project.plannedStartDate?.slice(0, 10) ?? '' };
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const allowLeave = useProjectUnsavedChanges(dirty);
  useEffect(() => { dialog.current?.showModal(); }, []);
  function close() { if (!dirty || window.confirm('有未保存的修改，确定离开？')) { allowLeave(); onClose(); } }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try {
      const updated = await updateProject(project.id, { expectedVersion: project.updatedAt, name: form.name.trim(), vehicleModel: form.vehicleModel.trim() || null, description: form.description.trim() || null, plannedStartDate: form.plannedStartDate || null });
      allowLeave(); onSaved(updated);
    } catch (error) { setError(error instanceof Error ? error.message : '保存失败，请重试。'); }
    finally { pending.current = false; setBusy(false); }
  }
  return <dialog ref={dialog} className="m1-project-dialog" aria-labelledby="m1-project-edit-title" onCancel={event => { event.preventDefault(); if (!busy) close(); }}><header className="m1-heading m1-project-heading"><h2 id="m1-project-edit-title">编辑项目</h2><button className="m1-icon-button" disabled={busy} aria-label="关闭编辑项目" onClick={close}><M1Icon name="close" /></button></header><form className="m1-project-form" onSubmit={event => void save(event)}>
    <label className="m1-project-field m1-project-field-full"><span>颜色名称</span><input required maxLength={128} disabled={busy} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label>
    <label className="m1-project-field"><span>适用车型</span><input maxLength={64} disabled={busy} value={form.vehicleModel} onChange={event => setForm({ ...form, vehicleModel: event.target.value })} /></label>
    <label className="m1-project-field"><span>计划开始日期</span><input type="date" disabled={busy} value={form.plannedStartDate} onChange={event => setForm({ ...form, plannedStartDate: event.target.value })} /></label>
    <label className="m1-project-field m1-project-field-full"><span>需求说明</span><textarea maxLength={2000} rows={4} disabled={busy} value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /></label>
    {error ? <p className="m1-error m1-project-error m1-project-field-full" role="alert">{error}</p> : null}
    <footer className="m1-project-form-actions m1-project-field-full"><button className="m1-button" type="button" disabled={busy} onClick={close}>取消</button><button className="m1-button m1-primary" disabled={busy}><M1Icon name="check" />{busy ? '正在保存…' : '保存'}</button></footer>
  </form></dialog>;
}
