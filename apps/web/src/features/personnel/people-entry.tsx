'use client';
import React, { useEffect, useState } from 'react';
import { useAuth } from '../../components/auth-provider';
import { apiRequest } from '../../lib/auth-client';
import { PersonnelWorkspace } from './personnel-workspace';
type Person = { id: string; name: string; departmentName: string | null };
export function PeopleEntry() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <p role="status">正在加载账号…</p>;
  if (user?.isSystemAdmin) return <PersonnelWorkspace />;
  if (!user?.teamAccessApproved) return <p role="alert">当前账号尚未获准访问人员库。</p>;
  return <PeopleDirectory />;
}
function PeopleDirectory() {
  const [search, setSearch] = useState(''), [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(''), [history, setHistory] = useState<string[]>([]);
  const [data, setData] = useState<Person[] | null>(null), [error, setError] = useState('');
  const [loading, setLoading] = useState(true), [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); let current = true;
    const params = new URLSearchParams({ take: '50' });
    if (query) params.set('q', query);
    if (cursor) params.set('cursor', cursor);
    setLoading(true); setError('');
    void apiRequest<Person[]>(`/users/directory?${params}`, { signal: controller.signal })
      .then(rows => { if (current) setData(rows); })
      .catch(error => { if (current) { setData(null); setError(error instanceof Error ? error.message : '人员读取失败。'); } })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; controller.abort(); };
  }, [query, cursor, retry]);
  return <section className="m1-workspace"><header className="m1-heading"><h1>人员库</h1><span className="m1-badge">人员目录</span></header><div className="m1-card">
    <form className="people-search" onSubmit={event => { event.preventDefault(); setQuery(search.trim()); setCursor(''); setHistory([]); }}><label>搜索姓名<input value={search} maxLength={80} onChange={event => setSearch(event.target.value)} /></label><button className="m1-button" disabled={loading}>搜索</button></form>
    {loading ? <p role="status">正在加载人员…</p> : error ? <div role="alert">{error}<button className="m1-button" onClick={() => setRetry(value => value + 1)}>重新加载</button></div> : !data?.length ? <p>没有匹配的人员</p> : <div className="people-table-wrap"><table className="people-table"><thead><tr><th>姓名</th><th>部门</th></tr></thead><tbody>{data.map(person => <tr key={person.id}><td>{person.name}</td><td>{person.departmentName || '未记录'}</td></tr>)}</tbody></table></div>}
    <footer className="people-pagination"><button className="m1-button" disabled={loading || !history.length} onClick={() => { setCursor(history.at(-1)!); setHistory(history.slice(0, -1)); }}>上一页</button><button className="m1-button" disabled={loading || data?.length !== 50} onClick={() => { setHistory([...history, cursor]); setCursor(data!.at(-1)!.id); }}>下一页</button></footer>
  </div></section>;
}
