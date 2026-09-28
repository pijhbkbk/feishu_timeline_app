'use client';
import Link from 'next/link';
import React, { useEffect, useState } from 'react';
import { useAuth } from '../../components/auth-provider';
import { apiRequest } from '../../lib/auth-client';

type Notice = { id: string; title: string; content: string; reminderKind: string | null; isRead: boolean; createdAt: string; linkPath: string | null };
type DigestItem = { id: string; title: string; projectCode: string; projectName: string; dueAt: string | null; linkPath: string };
export function NotificationLink() {
  const { user } = useAuth();
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let active = true; setCount(null);
    async function load() { if (!user) return; try { const result = await apiRequest<{ unreadCount: number }>('/notifications/unread-count', { signal: AbortSignal.timeout(15000) }); if (active) setCount(result.unreadCount); } catch { if (active) setCount(null); } }
    void load(); const timer = setInterval(() => void load(), 60000);
    return () => { active = false; clearInterval(timer); };
  }, [user]);
  return user ? <Link className="work-link" href="/notifications" aria-label={count ? `提醒，${count} 条未读` : '提醒'}>提醒{count ? ` (${count > 99 ? '99+' : count})` : ''}</Link> : null;
}
export function Notifications() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: Notice[]; totalPages: number; unreadCount: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true; setLoading(true); setError(''); setData(null);
    void apiRequest<{ items: Notice[]; totalPages: number; unreadCount: number }>(`/notifications/my?page=${page}&pageSize=20`, { signal: AbortSignal.timeout(15000) })
      .then(result => { if (active) setData(result); }).catch(e => { if (active) setError(e instanceof Error ? e.message : '提醒加载失败。'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, refresh, user]);
  async function read(id?: string) {
    if (busy) return; setBusy(id || 'all'); setError('');
    try { await apiRequest(`/notifications/${id ? `${encodeURIComponent(id)}/mark-read` : 'mark-all-read'}`, { method: 'POST', signal: AbortSignal.timeout(15000) }); setPage(1); setRefresh(value => value + 1); }
    catch (e) { setError(e instanceof Error ? e.message : '更新失败，请重试。'); }
    finally { setBusy(''); }
  }
  return <section className="team-workspace"><header className="work-heading"><div><h1>我的提醒</h1><p>查看任务激活、今日到期和每日逾期汇总。</p></div><Link href="/dashboard">返回我的工作</Link></header>
    {error ? <div role="alert"><p>{error}</p><button className="button" onClick={() => setRefresh(value => value + 1)}>重新加载</button></div> : null}
    {loading ? <p role="status" className="work-state">正在加载提醒…</p> : data ? <><div className="work-overview"><span>{data.unreadCount} 条未读</span><button className="button" disabled={Boolean(busy) || !data.unreadCount} onClick={() => void read()}>全部标为已读</button></div>
      {!data.items.length ? <p className="work-state">当前没有提醒。工作变化后，新提醒会显示在这里。</p> : data.items.map(item => <article className="page-card work-notification" key={item.id}><div className="work-heading"><div><h2>{item.isRead ? '' : '• '}{item.title}</h2><span className="work-secondary">{new Date(item.createdAt).toLocaleString('zh-CN')}</span></div>{!item.isRead ? <button className="work-link" disabled={Boolean(busy)} onClick={() => void read(item.id)}>标为已读</button> : <span className="work-secondary">已读</span>}</div><p>{item.content}</p>
        {item.reminderKind === 'OVERDUE_DAY' ? <Digest notificationId={item.id} /> : item.linkPath ? <Link href={item.linkPath}>打开工作 →</Link> : null}</article>)}
      <footer className="work-pagination"><span>第 {page} / {data.totalPages} 页</span><button className="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</button><button className="button" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}>下一页</button></footer>
    </> : null}
  </section>;
}
function Digest({ notificationId }: { notificationId: string }) {
  const [opened, setOpened] = useState(false);
  const [cursor, setCursor] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [data, setData] = useState<{ items: DigestItem[]; nextCursor: string | null } | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!opened) return;
    let active = true; setData(null); setError('');
    void apiRequest<{ items: DigestItem[]; nextCursor: string | null }>(`/notifications/${encodeURIComponent(notificationId)}/items?after=${encodeURIComponent(cursor)}`, { signal: AbortSignal.timeout(15000) })
      .then(result => { if (active) setData(result); }).catch(e => { if (active) setError(e instanceof Error ? e.message : '汇总加载失败。'); });
    return () => { active = false; };
  }, [notificationId, opened, cursor, retry]);
  return <details onToggle={event => setOpened(event.currentTarget.open)}><summary>查看逾期工作</summary>{error ? <p role="alert">{error} <button className="work-link" onClick={() => setRetry(value => value + 1)}>重试</button></p> : !data ? <p role="status">正在加载…</p> : <>
    {data.items.length ? <ul>{data.items.map(item => <li key={item.id}><Link href={item.linkPath}>{item.title}</Link> · {item.projectCode} · {item.projectName}<span className="work-secondary">期限 {item.dueAt ? new Date(item.dueAt).toLocaleDateString('zh-CN') : '未设定'}</span></li>)}</ul> : <p>汇总中的工作已处理或分配发生变化。</p>}
    {history.length || data.nextCursor ? <div className="work-pagination"><button className="button" disabled={!history.length} onClick={() => { setCursor(history.at(-1)!); setHistory(history.slice(0, -1)); }}>上一页工作</button><button className="button" disabled={!data.nextCursor} onClick={() => { setHistory([...history, cursor]); setCursor(data.nextCursor!); }}>下一页工作</button></div> : null}
  </>}</details>;
}
