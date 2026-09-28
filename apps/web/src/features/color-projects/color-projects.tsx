'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React, { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../../components/auth-provider';
import { apiRequest, FRONTEND_ROLE_OPTIONS } from '../../lib/auth-client';
import { canCreateColorProject } from '../../lib/project-capabilities';
import { formatDate, type ProjectDetail, type ProjectListResponse } from '../../lib/projects-client';

export function ColorProjects() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ keyword: '', currentNodeCode: '', page: 1 });
  const [data, setData] = useState<ProjectListResponse | null>(null);
  const [nodes, setNodes] = useState<ProjectListResponse['nodeOptions']>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let current = true;
    setLoading(true); setError(''); setData(null);
    const query = new URLSearchParams({ page: String(filters.page), pageSize: '20', ...(filters.keyword ? { keyword: filters.keyword } : {}), ...(filters.currentNodeCode ? { currentNodeCode: filters.currentNodeCode } : {}) });
    void apiRequest<ProjectListResponse>(`/projects?${query}`, { signal: controller.signal })
      .then(result => { if (current) { setData(result); setNodes(result.nodeOptions); } })
      .catch(e => { if (current) setError(e instanceof Error ? e.message : '项目加载失败。'); })
      .finally(() => { if (current) setLoading(false); clearTimeout(timeout); });
    return () => { current = false; controller.abort(); clearTimeout(timeout); };
  }, [filters, refresh, user]);
  return <section className="team-workspace color-projects"><header className="work-heading"><div><h1>颜色项目</h1><p>查看团队的颜色开发进展、当前办理人与期限。</p></div>{canCreateColorProject(user) ? <Link className="button button-primary" href="/projects/new">新建项目</Link> : null}</header>
    <form className="color-project-filters" onSubmit={event => { event.preventDefault(); setFilters({ ...filters, keyword: search.trim(), page: 1 }); }}>
      <label>搜索颜色或项目<input value={search} maxLength={100} placeholder="颜色、项目名称或编号" onChange={event => setSearch(event.target.value)} /></label>
      <label>当前阶段<select value={filters.currentNodeCode} onChange={event => setFilters({ ...filters, currentNodeCode: event.target.value, page: 1 })}><option value="">全部阶段</option>{nodes.map(node => <option key={node.code} value={node.code}>{node.name}</option>)}</select></label>
      <button className="button" type="submit">搜索</button><button className="work-link" type="button" onClick={() => { setSearch(''); setFilters({ keyword: '', currentNodeCode: '', page: 1 }); }}>重置</button>
    </form>
    {loading ? <p className="work-state" role="status">正在加载颜色项目…</p> : error ? <div className="work-state" role="alert"><p>{error}</p><button className="button" onClick={() => setRefresh(value => value + 1)}>重新加载</button></div> : !data?.items.length ? <div className="work-state"><h2>{filters.keyword || filters.currentNodeCode ? '没有符合条件的项目' : '还没有颜色项目'}</h2><p>{filters.keyword || filters.currentNodeCode ? '请调整搜索或阶段筛选。' : canCreateColorProject(user) ? '新建项目后，系统将按固定流程生成工作。' : '项目协调创建项目后，可在这里查看进展。'}</p></div> : <>
      <div className="work-table-wrap"><table className="work-table"><thead><tr><th>颜色 / 项目</th><th>车型</th><th>当前阶段</th><th>角色 / 办理人</th><th>最近更新</th><th>最早期限</th></tr></thead><tbody>{data.items.map(item => <tr key={item.id}>
        <td><Link className="work-title" href={`/projects/${encodeURIComponent(item.id)}`}>{item.colorName ?? item.name}</Link><span className="work-secondary">{item.colorCode ? `${item.colorCode} · ` : ''}{item.code}{item.colorName && item.colorName !== item.name ? ` · ${item.name}` : ''}</span></td>
        <td data-label="车型">{item.vehicleModel || '—'}</td><td data-label="当前阶段">{item.status === 'COMPLETED' ? '已完成' : item.currentNodeName || '待立项'}<span className="work-secondary">{item.progressText}</span></td>
        <td data-label="角色 / 办理人">{FRONTEND_ROLE_OPTIONS.find(role => role.code === item.currentRoleCode)?.label || '—'}<span className="work-secondary">{item.currentTaskId ? item.currentTaskOwnerName || '待领取' : '—'}</span></td>
        <td data-label="最近更新">{formatDate(item.latestTaskUpdatedAt)}</td><td data-label="最早期限" className={item.earliestDueAt && Date.parse(item.earliestDueAt) < Date.now() ? 'work-late' : ''}>{formatDate(item.earliestDueAt ?? null)}</td>
      </tr>)}</tbody></table></div>
      <footer className="work-pagination"><span>共 {data.total} 个 · 第 {data.page} / {data.totalPages} 页</span><button className="button" disabled={data.page <= 1} onClick={() => setFilters({ ...filters, page: filters.page - 1 })}>上一页</button><button className="button" disabled={data.page >= data.totalPages} onClick={() => setFilters({ ...filters, page: filters.page + 1 })}>下一页</button></footer>
    </>}
  </section>;
}

export function NewColorProject() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ name: '', vehicleModel: '', description: '', plannedStartDate: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<{ body: string; key: string } | null>(null);
  const pending = useRef(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (pending.current) return;
    const body = { name: form.name.trim(), priority: 'MEDIUM', vehicleModel: form.vehicleModel.trim() || null, description: form.description.trim() || null, plannedStartDate: form.plannedStartDate || null };
    if (!body.name) { setError('请填写项目名称。'); return; }
    const serialized = JSON.stringify(body);
    if (request.current?.body !== serialized) request.current = { body: serialized, key: crypto.randomUUID() };
    pending.current = true; setBusy(true); setError('');
    try {
      const created = await apiRequest<ProjectDetail>('/projects', { method: 'POST', headers: { 'Idempotency-Key': request.current.key }, body, signal: AbortSignal.timeout(30000) });
      router.push(`/projects/${encodeURIComponent(created.id)}`);
    } catch (e) { setError(e instanceof Error ? e.message : '创建失败，请重试。'); }
    finally { pending.current = false; setBusy(false); }
  }
  if (isLoading) return <p role="status">正在加载权限…</p>;
  if (!canCreateColorProject(user)) return <section className="team-workspace"><h1>新建颜色项目</h1><p role="alert">需要项目协调或管理员的项目创建权限。</p><Link href="/projects">返回颜色项目</Link></section>;
  return <section className="team-workspace color-project-create"><header className="work-heading"><div><h1>新建颜色项目</h1><p>填写基本信息，后续工作按人员角色自动分配或进入共享队列。</p></div><Link href="/projects">返回颜色项目</Link></header>
    <form className="page-card form-grid" onSubmit={event => void submit(event)}>
      <label className="field field-full"><span>项目 / 定制色名称 *</span><input required maxLength={128} disabled={busy} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label>
      <label className="field"><span>适用车型</span><input maxLength={64} disabled={busy} value={form.vehicleModel} onChange={event => setForm({ ...form, vehicleModel: event.target.value })} /></label>
      <label className="field"><span>计划开始日期</span><input type="date" disabled={busy} value={form.plannedStartDate} onChange={event => setForm({ ...form, plannedStartDate: event.target.value })} /></label>
      <label className="field field-full"><span>需求说明</span><textarea rows={4} maxLength={2000} disabled={busy} value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /></label>
      {error ? <p className="error-text field-full" role="alert">{error}</p> : null}
      <div className="field field-actions"><button className="button button-primary" disabled={busy}>{busy ? '正在创建…' : '创建项目'}</button></div>
    </form>
  </section>;
}
