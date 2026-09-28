'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import React, { Suspense, useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../../components/auth-provider';
import { canCreateColorProject } from '../../lib/project-capabilities';
import { apiRequest, FRONTEND_ROLE_OPTIONS } from '../../lib/auth-client';

type View = 'mine' | 'available' | 'completed' | 'exceptions' | 'overdue';
type Page<T> = { items: T[]; nextCursor: string | null };
type OrdinaryTask = { id: string; nodeName: string; taskRound: number; requiredRoleCode: string | null;
  status: string; assignmentEpoch: number; assigneeUserId: string | null; assigneeUser: { name: string } | null;
  effectiveDueAt: string | null; dueAt: string | null; project: { id: string; code: string; name: string } };
type MonthlyTask = { id: string; projectId: string; projectName: string; projectCode: string; periodIndex: number;
  periodLabel: string; dueAt: string | null; status: string; reviewerId: string | null; assignmentEpoch: number };
type Overview = { activeProjects: number; totalProjects: number; unassignedPeople: number | null };
type Cursors = { ordinary: string | null; monthly: string | null };
export type WorkRow = { id: string; kind: 'ordinary' | 'monthly'; title: string; detail: string; projectId: string;
  projectName: string; projectCode: string; role: string | null; owner: string | null; ownerName?: string;
  dueAt: string | null; status: string; epoch: number; href: string };
const labels: Record<View, string> = { mine: '待我处理', available: '可领取', completed: '已完成', exceptions: '分配异常', overdue: '团队逾期' };
const statuses: Record<string, string> = { READY: '待处理', PENDING: '待处理', IN_PROGRESS: '处理中', RETURNED: '已退回', COMPLETED: '已完成', APPROVED: '已通过', OVERDUE: '逾期' };
const emptyPage = { items: [], nextCursor: null };
const firstPage: Cursors = { ordinary: '', monthly: '' };
const roleName = (role: string | null) => FRONTEND_ROLE_OPTIONS.find(item => item.code === role)?.label ?? '角色异常';
const finished = (row: WorkRow) => ['COMPLETED', 'APPROVED'].includes(row.status);
const dateLabel = (value: string | null) => value ? new Date(value).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '未设期限';

export function TeamWorkContent({ rows, loading, error, overview, view, userId, roleCodes, admin, canCreate, subject,
  busy, onReload, onClaim, onTransfer }: { rows: WorkRow[]; loading: boolean; error: string; overview: Overview | null;
  view: View; userId: string; roleCodes: string[]; admin: boolean; canCreate: boolean; subject: boolean;
  busy: string; onReload: () => void; onClaim: (row: WorkRow) => void; onTransfer: (row: WorkRow) => void }) {
  if (loading) return <p className="work-state" role="status">正在加载工作…</p>;
  if (error) return <div className="work-state" role="alert"><p>{error}</p><button className="button" onClick={onReload}>重新加载</button></div>;
  return <>
    {overview && !subject ? <div className="work-overview"><Link href="/projects">颜色项目 <strong>{overview.totalProjects}</strong><span>进行中 {overview.activeProjects}</span></Link>
      {admin && overview.unassignedPeople !== null ? <Link href="/admin/people">待分配人员 <strong>{overview.unassignedPeople}</strong></Link> : null}
      {canCreate ? <Link className="button button-primary" href="/projects/new">新建项目</Link> : null}</div> : null}
    {rows.length === 0 ? <div className="work-state"><h2>{view === 'completed' ? '还没有已完成的工作' : view === 'available' ? '当前没有可领取的工作' : view === 'exceptions' ? '当前没有分配异常' : view === 'overdue' ? '当前没有逾期工作' : '当前没有待处理工作'}</h2>
      <p>{view === 'available' ? '新的角色任务进入共享队列后，可在这里领取。' : view === 'exceptions' ? '新增任务缺少合适的办理人时，会显示在这里。' : '可前往颜色项目查看团队进展。'}</p><Link href="/projects">打开颜色项目</Link></div>
      : <div className="work-table-wrap"><table className="work-table"><thead><tr><th>工作 / 颜色项目</th><th>角色 / 办理人</th><th>期限</th><th>状态</th><th>操作</th></tr></thead><tbody>{rows.map(row => {
        const owned = row.owner === userId && Boolean(row.role && roleCodes.includes(row.role));
        const claimable = !row.owner && !finished(row) && Boolean(row.role && roleCodes.includes(row.role));
        const late = !finished(row) && row.dueAt && new Date(row.dueAt).getTime() < Date.now();
        return <tr key={`${row.kind}:${row.id}`}><td><Link href={row.href} className="work-title">{row.title}</Link><span className="work-secondary">{row.projectCode} · {row.projectName} · {row.detail}</span></td>
          <td>{roleName(row.role)}<span className="work-secondary">{row.owner ? row.owner === userId ? '我' : row.ownerName ?? '已指定办理人' : '待领取'}</span></td>
          <td className={late ? 'work-late' : ''}>{dateLabel(row.dueAt)}</td><td><span className={`work-status ${finished(row) ? 'work-done' : ''}`}>{statuses[row.status] ?? row.status}</span></td>
          <td><div className="work-actions">{claimable ? <button className="button button-primary" disabled={Boolean(busy)} onClick={() => onClaim(row)}>{busy === row.id ? '正在领取…' : '领取'}</button> : <Link className={owned && !finished(row) ? 'button button-primary' : 'work-link'} href={row.href}>{owned && !finished(row) ? '处理' : '查看'}</Link>}
            {admin && !finished(row) && row.role ? <button className="work-link" disabled={Boolean(busy)} onClick={() => onTransfer(row)}>转派</button> : null}</div></td></tr>;
      })}</tbody></table></div>}
  </>;
}

function Workspace() {
  const { user } = useAuth();
  const search = useSearchParams();
  const assignee = search.get('assignee') || '';
  const projectId = search.get('projectId') || '';
  const subject = Boolean(assignee && assignee !== user?.id);
  const [view, setView] = useState<View>('mine');
  const [cursors, setCursors] = useState<Cursors>(firstPage);
  const [history, setHistory] = useState<Cursors[]>([]);
  const [next, setNext] = useState<Cursors>({ ordinary: null, monthly: null });
  const [rows, setRows] = useState<WorkRow[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [transfer, setTransfer] = useState<WorkRow | null>(null);
  const sequence = useRef(0);
  const claimIds = useRef(new Map<string, string>());
  const roleKey = user?.roleCodes.join(',') ?? '';
  const permissionKey = user?.permissionCodes?.join(',') ?? '';
  const context = `${user?.id}:${roleKey}:${permissionKey}:${assignee}:${projectId}`;
  const currentContext = useRef(context);
  currentContext.current = context;
  const load = useCallback(async () => {
    const current = ++sequence.current;
    setLoading(true); setError(''); setRows([]); setOverview(null);
    if (!user) return;
    const params = new URLSearchParams({ view, ...(assignee ? { assignee } : {}), ...(projectId ? { projectId } : {}) });
    function path(kind: 'ordinary' | 'monthly', cursor: string) {
      const query = new URLSearchParams(params); if (cursor) query.set('after', cursor);
      return `/team-tasks${kind === 'monthly' ? '/monthly' : ''}?${query}`;
    }
    try {
      const signal = AbortSignal.timeout(15000);
      const [ordinary, monthly, summary] = await Promise.all([
        cursors.ordinary === null ? Promise.resolve(emptyPage as Page<OrdinaryTask>) : apiRequest<Page<OrdinaryTask>>(path('ordinary', cursors.ordinary), { signal }),
        cursors.monthly === null ? Promise.resolve(emptyPage as Page<MonthlyTask>) : apiRequest<Page<MonthlyTask>>(path('monthly', cursors.monthly), { signal }),
        apiRequest<Overview>('/team-tasks/overview', { signal }),
      ]);
      if (current !== sequence.current) return;
      setRows([
        ...ordinary.items.map((item): WorkRow => ({ id: item.id, kind: 'ordinary', title: item.nodeName, detail: `第 ${item.taskRound} 轮`,
          projectId: item.project.id, projectName: item.project.name, projectCode: item.project.code, role: item.requiredRoleCode,
          owner: item.assigneeUserId, ...(item.assigneeUser ? { ownerName: item.assigneeUser.name } : {}), dueAt: item.effectiveDueAt ?? item.dueAt, status: item.status,
          epoch: item.assignmentEpoch, href: `/projects/${encodeURIComponent(item.project.id)}?taskId=${encodeURIComponent(item.id)}` })),
        ...monthly.items.map((item): WorkRow => ({ id: item.id, kind: 'monthly', title: `第 ${item.periodIndex} 月目视色差评审`, detail: item.periodLabel,
          projectId: item.projectId, projectName: item.projectName, projectCode: item.projectCode, role: 'quality_engineer', owner: item.reviewerId,
          dueAt: item.dueAt, status: item.status, epoch: item.assignmentEpoch,
          href: `/projects/${encodeURIComponent(item.projectId)}/color-evaluation?recurringTaskId=${encodeURIComponent(item.id)}` })),
      ]);
      setOverview(summary); setNext({ ordinary: ordinary.nextCursor, monthly: monthly.nextCursor });
    } catch (e) { if (current === sequence.current) setError(e instanceof Error ? e.message : '工作加载失败，请重试。'); }
    finally { if (current === sequence.current) setLoading(false); }
  }, [user, view, assignee, projectId, cursors, refresh]);
  useEffect(() => { void load(); return () => { sequence.current++; }; }, [load]);
  useEffect(() => { setView('mine'); setCursors(firstPage); setHistory([]); setTransfer(null); setNotice(''); claimIds.current.clear(); }, [user?.id, roleKey, permissionKey, assignee, projectId]);
  async function claim(row: WorkRow) {
    if (busy) return;
    const key = `${user?.id}:${row.kind}:${row.id}:${row.epoch}`;
    let requestId = claimIds.current.get(key);
    if (!requestId) { requestId = crypto.randomUUID(); claimIds.current.set(key, requestId); }
    setBusy(row.id); setError(''); setNotice('');
    try {
      await apiRequest(`/team-tasks/${row.kind === 'monthly' ? 'monthly/' : ''}${encodeURIComponent(row.id)}/claim`, { method: 'POST', body: { requestId, assignmentEpoch: row.epoch }, signal: AbortSignal.timeout(15000) });
      if (currentContext.current !== context) return;
      setNotice('领取成功，可切换到“待我处理”办理。'); setRefresh(value => value + 1);
    } catch (e) { if (currentContext.current === context) setError(e instanceof Error ? e.message : '领取失败，请刷新后重试。'); }
    finally { setBusy(''); }
  }
  const views: View[] = subject ? user?.isSystemAdmin ? ['mine', 'completed', 'overdue'] : ['mine', 'completed'] : user?.isSystemAdmin ? ['mine', 'available', 'completed', 'exceptions', 'overdue'] : ['mine', 'available', 'completed'];
  return <section className="team-workspace"><header className="work-heading"><div><h1>{subject ? '人员工作' : '我的工作'}</h1><p>{subject ? '查看该人员的待办与办理记录。' : '从角色队列领取工作，办理进展会同步到颜色项目。'}</p></div>{subject ? <Link href="/admin/people">返回人员</Link> : <Link href="/projects">查看颜色项目 →</Link>}</header>
    <nav className="work-tabs" aria-label="工作筛选">{views.map(item => <button type="button" key={item} aria-pressed={view === item} onClick={() => { setView(item); setCursors(firstPage); setHistory([]); setNotice(''); }}>{subject && item === 'mine' ? '待处理' : item === 'overdue' && subject ? '逾期' : labels[item]}</button>)}<button className="work-refresh" disabled={loading || Boolean(busy)} onClick={() => void load()}>刷新</button></nav>
    {notice ? <p className="work-notice" role="status">{notice}</p> : null}
    <TeamWorkContent rows={rows} loading={loading} error={error} overview={overview} view={view} userId={user?.id ?? ''} roleCodes={user?.roleCodes ?? []}
      admin={Boolean(user?.isSystemAdmin)} canCreate={canCreateColorProject(user)} subject={subject}
      busy={busy} onReload={() => void load()} onClaim={row => void claim(row)} onTransfer={setTransfer} />
    {!loading && !error && (rows.length || history.length) ? <footer className="work-pagination"><span>本页 {rows.length} 项</span><button className="button" disabled={!history.length || Boolean(busy)} onClick={() => { setCursors(history[history.length - 1]!); setHistory(history.slice(0, -1)); }}>上一页</button><button className="button" disabled={(!next.ordinary && !next.monthly) || Boolean(busy)} onClick={() => { setHistory([...history, cursors]); setCursors(next); }}>下一页</button></footer> : null}
    {transfer ? <TransferDialog key={`${transfer.kind}:${transfer.id}`} row={transfer} onClose={() => setTransfer(null)} onSaved={() => { setTransfer(null); setNotice('转派已保存。'); setRefresh(value => value + 1); }} /> : null}
  </section>;
}

function TransferDialog({ row, onClose, onSaved }: { row: WorkRow; onClose: () => void; onSaved: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const sequence = useRef(0);
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [cursor, setCursor] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [people, setPeople] = useState<Page<{ id: string; name: string; username: string }> | null>(null);
  const [selected, setSelected] = useState('');
  const [reason, setReason] = useState('');
  const [requestId, setRequestId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { dialog.current?.showModal(); setRequestId(crypto.randomUUID()); }, []);
  useEffect(() => {
    const current = ++sequence.current; setLoading(true); setPeople(null); setSelected(''); setError('');
    const params = new URLSearchParams({ roleCode: row.role!, q: search, ...(cursor ? { after: cursor } : {}) });
    void apiRequest<Page<{ id: string; name: string; username: string }>>(`/people?${params}`, { signal: AbortSignal.timeout(15000) })
      .then(result => { if (sequence.current === current) setPeople(result); })
      .catch(e => { if (sequence.current === current) setError(e instanceof Error ? e.message : '人员加载失败。'); })
      .finally(() => { if (sequence.current === current) setLoading(false); });
    return () => { sequence.current++; };
  }, [row.role, search, cursor, retry]);
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy || !selected || !reason.trim()) return;
    setBusy(true); setError('');
    try {
      await apiRequest(`/team-tasks/${row.kind === 'monthly' ? 'monthly/' : ''}${encodeURIComponent(row.id)}/transfer`, {
        method: 'POST', body: { requestId, assignmentEpoch: row.epoch, assigneeUserId: selected, reason: reason.trim() }, signal: AbortSignal.timeout(15000),
      });
      onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : '转派失败，请刷新任务后重试。'); }
    finally { setBusy(false); }
  }
  return <dialog ref={dialog} className="work-dialog" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}><header><h2>转派工作</h2><button type="button" aria-label="关闭" disabled={busy} onClick={onClose}>×</button></header><p>{row.title} · {row.projectName}</p><p className="work-secondary">选择已启用且具有“{roleName(row.role)}”角色的人员。</p>
    <form className="work-search" onSubmit={event => { event.preventDefault(); setSearch(query.trim()); setCursor(''); setHistory([]); setRetry(value => value + 1); }}><label htmlFor="work-person-query">搜索姓名或工号</label><div><input id="work-person-query" maxLength={80} disabled={busy} value={query} onChange={event => setQuery(event.target.value)} /><button className="button" disabled={loading || busy}>搜索</button></div></form>
    {error ? <p role="alert">{error}</p> : null}
    <form onSubmit={event => void save(event)}>{loading ? <p role="status">正在加载可接收人员…</p> : people?.items.length ? <fieldset disabled={busy} className="work-candidates"><legend>接收人</legend>{people.items.map(person => <label key={person.id}><input type="radio" name="recipient" checked={selected === person.id} onChange={() => { setSelected(person.id); setRequestId(crypto.randomUUID()); }} />{person.name}<span className="work-secondary">{person.username}</span></label>)}</fieldset> : people ? <p>没有匹配人员。可调整搜索，或先在人员表中分配角色。</p> : null}
      {people && (history.length || people.nextCursor) ? <div className="work-pagination"><button type="button" className="button" disabled={!history.length || busy} onClick={() => { setCursor(history[history.length - 1]!); setHistory(history.slice(0, -1)); }}>上一页人员</button><button type="button" className="button" disabled={!people.nextCursor || busy} onClick={() => { setHistory([...history, cursor]); setCursor(people.nextCursor!); }}>下一页人员</button></div> : null}
      <label className="work-reason">转派原因<textarea required maxLength={300} disabled={busy} value={reason} onChange={event => { setReason(event.target.value); setRequestId(crypto.randomUUID()); }} /></label><footer><button type="button" className="button" disabled={busy} onClick={onClose}>取消</button><button className="button button-primary" disabled={busy || loading || !selected || !reason.trim()}>{busy ? '正在保存…' : '确认转派'}</button></footer>
    </form></dialog>;
}

export function TeamWorkspace() {
  return <Suspense fallback={<p className="work-state" role="status">正在加载工作…</p>}><Workspace /></Suspense>;
}
