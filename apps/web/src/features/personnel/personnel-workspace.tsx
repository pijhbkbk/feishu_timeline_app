'use client';

import React, { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useAuth } from '../../components/auth-provider';
import { apiRequest } from '../../lib/auth-client';

type Role = { code: string; name: string; status?: string; nodes?: string };
type Person = { id: string; username: string; name: string; status: string; isSystemAdmin: boolean;
  hasCredential: boolean; version: string; pendingTaskCount: number; roles: Role[] };
type Directory = { roles: Role[]; items: Person[]; nextCursor: string | null };
type Recovery = { token: string; expiresAt: string };
type Mode = 'roles' | 'status' | 'recovery';

export function PersonnelWorkspace() {
  const { user, refreshSession } = useAuth();
  const [data, setData] = useState<Directory | null>(null);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [cursor, setCursor] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<Person | null>(null);
  const [mode, setMode] = useState<Mode>('roles');
  const [roles, setRoles] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [recovery, setRecovery] = useState<Recovery | null>(null);
  const [requestId, setRequestId] = useState('');
  const sequence = useRef(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const load = useCallback(async () => {
    if (!user?.isSystemAdmin) { setLoading(false); return; }
    const current = ++sequence.current;
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ q: appliedSearch, filter, ...(cursor ? { after: cursor } : {}) });
      const result = await apiRequest<Directory>(`/people?${params}`);
      if (sequence.current === current) setData(result);
    } catch (e) {
      if (sequence.current === current) { setError(e instanceof Error ? e.message : '人员加载失败。'); setData(null); }
    } finally { if (sequence.current === current) setLoading(false); }
  }, [user?.isSystemAdmin, appliedSearch, filter, cursor]);
  useEffect(() => { void load(); return () => { sequence.current++; }; }, [load]);
  useEffect(() => { if (selected) dialog.current?.showModal(); else dialog.current?.close(); }, [selected]);
  function open(person: Person, action: Mode) {
    setSelected(person); setMode(action);
    setRoles(person.roles.filter(role => data?.roles.some(option => option.code === role.code)).map(role => role.code));
    setReason(''); setRecovery(null); setError(''); setRequestId(crypto.randomUUID());
  }
  function close() { if (!busy) { setSelected(null); setRecovery(null); } }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!selected || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      if (mode === 'recovery') {
        setRecovery(await apiRequest<Recovery>(`/auth/accounts/${encodeURIComponent(selected.id)}/recovery`, { method: 'POST' }));
      } else {
        await apiRequest(`/people/${encodeURIComponent(selected.id)}`, { method: 'PATCH', body: {
          requestId, expectedVersion: selected.version, reason: reason.trim() || (mode === 'roles' ? '管理员分配业务角色' : '管理员调整账号状态'),
          ...(mode === 'roles' ? { roleCodes: roles } : { status: selected.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }),
        } });
        setNotice(`${selected.name}的${mode === 'roles' ? '角色已保存' : '账号状态已更新'}。`);
        const selfChanged = selected.id === user?.id;
        setSelected(null); await load();
        if (selfChanged) await refreshSession();
      }
    } catch (e) { setError(e instanceof Error ? e.message : '保存失败，请重试。'); }
    finally { setBusy(false); }
  }
  if (!user?.isSystemAdmin) return <section className="people-workspace"><h1>人员</h1><p>仅系统管理员可管理人员。</p></section>;
  return <section className="people-workspace">
    <header className="people-heading"><div><h1>人员</h1><p>人员只配置一次，每个颜色项目共用团队角色。</p></div><button type="button" className="button" onClick={() => { void navigator.clipboard.writeText(`${window.location.origin}/login?mode=register`).then(() => setNotice('注册链接已复制，可发送给需要注册的人员。'), () => setError('复制失败，请手动分享本站登录页。')); }}>复制注册链接</button></header>
    <div className="people-toolbar">
      <div className="people-filters" aria-label="人员筛选">{[['all', '全部'], ['unassigned', '待分配'], ['active', '启用'], ['inactive', '停用'], ['historical', '历史人员']].map(([value, label]) => <button type="button" key={value} aria-pressed={filter === value} onClick={() => { setFilter(value!); setCursor(''); setHistory([]); }}>{label}</button>)}</div>
      <form onSubmit={e => { e.preventDefault(); setAppliedSearch(search.trim()); setCursor(''); setHistory([]); }} className="people-search"><label className="people-visually-hidden" htmlFor="people-search">搜索姓名或工号</label><input id="people-search" placeholder="搜索姓名或工号" maxLength={80} value={search} onChange={e => setSearch(e.target.value)} /><button className="button" disabled={loading}>搜索</button></form>
    </div>
    {!selected && error ? <p role="alert">{error} <button className="button" onClick={() => void load()}>重新加载</button></p> : null}
    {notice ? <p role="status" className="people-notice">{notice}</p> : null}
    {loading ? <p role="status" className="people-state">正在加载人员…</p> : data?.items.length === 0 ? <div className="people-state"><h2>{filter === 'unassigned' ? '没有等待分配角色的人员' : '没有匹配的人员'}</h2><p>调整筛选或搜索条件后再试。</p></div> : data ? <>
      <div className="people-table-wrap"><table className="people-table"><thead><tr><th>人员 / 工号</th><th>角色</th><th>状态</th><th>待办</th><th>操作</th></tr></thead><tbody>{data.items.map(person => <tr key={person.id}>
        <td><strong>{person.name}</strong><span className="people-secondary">{person.username}</span>{!person.hasCredential ? <small>历史人员 · 未启用密码登录</small> : null}</td>
        <td><div className="people-role-tags">{person.isSystemAdmin ? <span>系统管理员</span> : null}{person.roles.filter(role => role.code !== 'admin').map(role => <span key={role.code}>{role.name}{role.status !== 'ACTIVE' ? '（已停用）' : ''}</span>)}{!person.isSystemAdmin && person.roles.length === 0 ? <span className="people-awaiting">待分配</span> : null}</div></td>
        <td><span className={person.status === 'ACTIVE' ? 'people-active' : 'people-muted'}>{person.status === 'ACTIVE' ? '启用' : person.status === 'LOCKED' ? '锁定' : '停用'}</span></td><td><Link href={`/dashboard?assignee=${encodeURIComponent(person.id)}`} aria-label={`查看${person.name}的工作`}>{person.pendingTaskCount} · 查看</Link></td>
        <td><div className="people-actions"><button type="button" className="people-link" onClick={() => open(person, 'roles')}>{person.roles.some(role => data.roles.some(option => option.code === role.code)) ? '编辑角色' : '分配角色'}</button><details><summary>更多</summary><div className="people-more"><button type="button" onClick={() => open(person, 'status')}>{person.status === 'ACTIVE' ? '停用账号' : '启用账号'}</button>{person.hasCredential && person.status === 'ACTIVE' ? <button type="button" onClick={() => open(person, 'recovery')}>恢复账号密码</button> : null}</div></details></div></td>
      </tr>)}</tbody></table></div>
      <footer className="people-pagination"><span>本页 {data.items.length} 人</span><button className="button" disabled={!history.length || loading} onClick={() => { setCursor(history[history.length - 1]!); setHistory(history.slice(0, -1)); }}>上一页</button><button className="button" disabled={!data.nextCursor || loading} onClick={() => { setHistory([...history, cursor]); setCursor(data.nextCursor!); }}>下一页</button></footer>
    </> : null}
    <dialog ref={dialog} className="people-dialog" onCancel={e => { e.preventDefault(); close(); }}>{selected ? <form onSubmit={e => void save(e)}>
      <header><h2>{mode === 'roles' ? '分配角色' : mode === 'status' ? selected.status === 'ACTIVE' ? '停用账号' : '启用账号' : '恢复账号密码'}</h2><button type="button" aria-label="关闭" disabled={busy} onClick={close}>×</button></header><p><strong>{selected.name}</strong> · {selected.username}</p>
      {error ? <p role="alert">{error}</p> : null}
      {mode === 'roles' ? <><p className="people-secondary">角色适用于本团队所有颜色项目，可同时承担多项工作。</p><div className="people-role-options">{data?.roles.map(role => <label key={role.code}><input type="checkbox" checked={roles.includes(role.code)} disabled={busy} onChange={e => { setRoles(e.target.checked ? [...roles, role.code] : roles.filter(code => code !== role.code)); setRequestId(crypto.randomUUID()); }} /><span><strong>{role.name}</strong><small>节点 {role.nodes}</small></span></label>)}</div><p className="people-secondary">系统管理员身份和历史只读角色保持原状。</p></> : mode === 'status' ? <p>{selected.status === 'ACTIVE' ? '停用后，该人员不能继续登录或处理任务，历史记录保留。' : '启用后，该人员可以重新登录，并按已有角色处理工作。'}</p> : recovery ? <div role="status"><p>恢复码仅显示一次，30 分钟内有效。原密码与会话已失效，请经核实后安全交付本人。</p><label>一次性恢复码<input readOnly value={recovery.token} autoComplete="off" /></label><p>有效期至 {new Date(recovery.expiresAt).toLocaleString('zh-CN')}</p></div> : <p>请先核实请求者身份。签发恢复码会立即使原密码和全部会话失效。</p>}
      {mode !== 'recovery' ? <label className="people-reason">操作说明（选填）<input maxLength={300} value={reason} disabled={busy} onChange={e => { setReason(e.target.value); setRequestId(crypto.randomUUID()); }} /></label> : null}
      <footer><button type="button" className="button" disabled={busy} onClick={close}>{recovery ? '已安全交付，关闭' : '取消'}</button>{!recovery ? <button className="button button-primary" disabled={busy}>{busy ? '正在保存…' : mode === 'roles' ? '保存角色' : mode === 'status' ? '确认' : '确认签发恢复码'}</button> : null}</footer>
    </form> : null}</dialog>
  </section>;
}
