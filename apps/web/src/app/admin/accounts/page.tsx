'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { useAuth } from '../../../components/auth-provider';
import { apiRequest } from '../../../lib/auth-client';

type Account = { id: string; username: string; name: string; status: string; requestedJob: string | null;
  isSystemAdmin: boolean; hasCredential: boolean; canLogin: boolean; roles: string[] };
type Recovery = { token: string; expiresAt: string; username: string };

export default function AccountsPage() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Account | null>(null);
  const [recovery, setRecovery] = useState<Recovery | null>(null);
  const load = useCallback(async (q = '') => {
    if (!user?.isSystemAdmin) return;
    setLoading(true); setError('');
    try { setAccounts(await apiRequest<Account[]>(`/auth/accounts?q=${encodeURIComponent(q)}`)); }
    catch (e) { setError(e instanceof Error ? e.message : '账号列表加载失败。'); }
    finally { setLoading(false); }
  }, [user?.isSystemAdmin]);
  useEffect(() => { void load(); }, [load]);
  async function issueRecovery(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true); setError(''); setRecovery(null);
    try {
      const result = await apiRequest<Omit<Recovery, 'username'>>(`/auth/accounts/${encodeURIComponent(selected.id)}/recovery`, { method: 'POST' });
      setRecovery({ ...result, username: selected.username }); setSelected(null); await load(query);
    } catch (e) { setError(e instanceof Error ? e.message : '签发恢复码失败。'); }
    finally { setBusy(false); }
  }
  if (!user?.isSystemAdmin) return <section className="page-card"><h1>账号管理</h1><p>仅系统管理员可访问。</p></section>;
  return <section className="page-card native-account-card">
    <p className="eyebrow">后台管理</p><h1>账号管理</h1>
    <p>查看新注册账号与岗位意向，前往组织管理分配正式角色、部门及项目范围。岗位意向不会自动授予权限。</p>
    <p><Link href="/admin/organization">组织与权限管理</Link> · <Link href="/account">我的账号</Link></p>
    <form className="native-auth-form" onSubmit={event => { event.preventDefault(); void load(query); }}>
      <label>搜索姓名或用户名<input value={query} onChange={event => setQuery(event.target.value)} maxLength={80} /></label>
      <button className="button button-primary" disabled={loading}>搜索账号</button>
    </form>
    {error ? <p role="alert">{error}</p> : null}
    {recovery ? <aside className="page-card" role="status">
      <h2>{recovery.username} 的一次性恢复码</h2>
      <p>请通过已确认的安全渠道交给账号本人。恢复码仅本次显示，30 分钟内有效；原密码和会话已经失效。</p>
      <label>恢复码<input aria-label="恢复码" readOnly value={recovery.token} autoComplete="off" /></label>
      <p>有效期至 {new Date(recovery.expiresAt).toLocaleString('zh-CN')}</p>
      <button type="button" className="button" onClick={() => setRecovery(null)}>我已安全交付，关闭显示</button>
    </aside> : null}
    {selected ? <form className="page-card native-auth-form" onSubmit={event => void issueRecovery(event)}>
      <h2>确认恢复 {selected.name}（{selected.username}）</h2>
      <p>签发后，该账号的原密码及全部登录会话立即失效。请先确认请求者就是账号本人。</p>
      <button className="button button-primary" disabled={busy}>确认签发一次性恢复码</button>
      <button type="button" className="button" disabled={busy} onClick={() => setSelected(null)}>取消</button>
    </form> : null}
    {loading ? <p role="status">正在加载账号…</p> : accounts.length === 0 ? <p>没有匹配的账号。</p> : <div className="native-account-list">
      {accounts.map(account => <article className="page-card" key={account.id}>
        <h2>{account.name} <small>（{account.username}）</small></h2>
        <p>{account.status === 'ACTIVE' ? '已启用' : '已停用'} · {account.canLogin ? '可使用密码登录' : account.hasCredential ? '等待恢复密码' : '历史账号，待主机绑定'}</p>
        <p>岗位意向：{account.requestedJob === 'purchaser' ? '采购专员' : account.requestedJob === 'process_engineer' ? '工艺工程师' : '未提交'}；正式角色：{account.roles.join('、') || '尚未分配'}</p>
        <p>{account.isSystemAdmin ? '系统管理员' : '普通账号'}</p>
        {account.hasCredential && account.status === 'ACTIVE' ? <button className="button" type="button" disabled={busy} onClick={() => { setSelected(account); setRecovery(null); }}>恢复账号密码</button> : null}
      </article>)}
      {accounts.length === 50 ? <p>当前最多显示 50 个账号，请输入更具体的搜索条件。</p> : null}
    </div>}
  </section>;
}
