'use client';

import Link from 'next/link';
import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../components/auth-provider';
import { apiRequest } from '../../lib/auth-client';
import { RecordForm, type RecordFormField } from '../business-sheet/record-form';
import { M1Icon } from '../m1/icon';
import { useProjectUnsavedChanges } from '../m1/use-unsaved';
import type { DepartmentOption, PersonRecord } from '../person-sheet/person-adapter';
import './people-directory.css';

export type PeopleFilter = 'current' | 'active' | 'archived';
export function directoryQuery(query: string, filter: PeopleFilter, after: string) {
  const params = new URLSearchParams({ take: '30', q: query, archived: String(filter === 'archived') });
  if (filter === 'active') params.set('active', 'true');
  if (after) params.set('after', after);
  return `/persons?${params}`;
}
export function canChangePersonAccount(person: PersonRecord, administrator: boolean, actorId: string | undefined) {
  return !person.archivedAt && (!person.account || administrator && !(person.account.id === actorId && person.account.isSystemAdmin));
}
type Directory = { items: PersonRecord[]; nextCursor: string | null; facets: { departments: DepartmentOption[]; departmentsHasMore: boolean } };
type EditMode = 'new' | 'edit' | 'status' | 'archive' | 'admission' | 'department';
type Action = { mode: EditMode; person: PersonRecord | null };

export function PeopleDirectory({ onSheet }: { onSheet: () => void }) {
  const { user } = useAuth();
  const [data, setData] = useState<Directory | null>(null), [search, setSearch] = useState(''), [query, setQuery] = useState('');
  const [filter, setFilter] = useState<PeopleFilter>('current'), [cursor, setCursor] = useState(''), [history, setHistory] = useState<string[]>([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState(''), [epoch, setEpoch] = useState(0);
  const [action, setAction] = useState<Action | null>(null), [detail, setDetail] = useState<PersonRecord | null>(null);
  useProjectUnsavedChanges(Boolean(action));
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(''); setData(null);
    void apiRequest<Directory>(directoryQuery(query, filter, cursor), { signal: controller.signal }).then(value => { if (!controller.signal.aborted) setData(value); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '人员读取失败。'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [query, filter, cursor, epoch, user?.id]);
  function choose(next: PeopleFilter) { setFilter(next); setCursor(''); setHistory([]); }
  function saved(message: string) { setNotice(message); setDetail(null); setEpoch(value => value + 1); }
  const departments = data?.facets.departments ?? [];
  return <section className="m1-workspace people-directory">
    <nav className="m1-breadcrumb"><Link href="/dashboard" aria-label="返回工作台"><M1Icon name="back" /></Link><span>人员库</span></nav>
    <header className="m1-heading"><h1>工艺部人员</h1><div className="m1-button-group"><button className="m1-button" onClick={onSheet}>表格编辑</button><button className="m1-button m1-primary" onClick={() => setAction({ mode: 'new', person: null })}>＋ 新增人员</button></div></header>
    {notice ? <p className="m1-notice" role="status">{notice}</p> : null}
    <section className="m1-card people-directory-card">
      <div className="people-directory-toolbar"><form onSubmit={event => { event.preventDefault(); setQuery(search.trim()); setCursor(''); setHistory([]); }}><input aria-label="搜索姓名或工号" placeholder="姓名 / 工号" maxLength={100} value={search} onChange={event => setSearch(event.target.value)} /><button className="m1-button" type="submit">搜索</button></form>
        <nav aria-label="人员名单筛选">{([['current', '常用'], ['active', '启用'], ['archived', '已归档']] as const).map(([key, label]) => <button className={filter === key ? 'is-active' : ''} aria-pressed={filter === key} key={key} onClick={() => choose(key)}>{label}</button>)}</nav><button className="m1-icon-button" aria-label="刷新人员" onClick={() => setEpoch(value => value + 1)}><M1Icon name="refresh" /></button></div>
      {loading ? <p role="status" className="m1-state">正在读取人员…</p> : error ? <div role="alert" className="m1-error">{error}<button className="m1-button" onClick={() => setEpoch(value => value + 1)}>重新读取</button></div> : !data?.items.length ? <p className="m1-state">{query ? '没有匹配的人员' : filter === 'archived' ? '暂无归档人员' : '暂无人员'}</p> : <>
        <div className="people-directory-table"><table><thead><tr><th>姓名</th><th>工号</th><th>账号状态</th><th>名单状态</th><th>操作</th></tr></thead><tbody>{data.items.map(person => <tr key={person.id} data-person-id={person.id}>
          <td><button className="people-name" onClick={() => setDetail(person)}>{person.name}</button></td><td>{person.account?.username ?? '—'}</td>
          <td><span className={`m1-badge ${person.isActive ? '' : 'people-inactive'}`}>{person.account ? person.isActive ? '启用' : '已停用' : '无登录账号'}</span></td>
          <td>{person.archivedAt ? '已归档' : person.isActive ? '常用' : '已停用'}</td><td><div className="people-row-actions"><button className="m1-button" onClick={() => setDetail(person)}>详情</button>
            {!person.archivedAt ? <><button className="m1-button" onClick={() => setAction({ mode: 'edit', person })}>编辑</button>{canChangePersonAccount(person, Boolean(user?.isSystemAdmin), user?.id) ? <button className="m1-button" onClick={() => setAction({ mode: 'status', person })}>{person.isActive ? '停用' : '启用'}</button> : null}{!person.isActive ? <button className="m1-button" onClick={() => setAction({ mode: 'archive', person })}>归档</button> : null}</> : <button className="m1-button" onClick={() => setAction({ mode: 'archive', person })}>恢复到常用</button>}
          </div></td></tr>)}</tbody></table></div>
        <footer className="people-directory-pagination"><span>本页 {data.items.length} 人</span><button className="m1-button" disabled={!history.length} onClick={() => { setCursor(history.at(-1) ?? ''); setHistory(value => value.slice(0, -1)); }}>上一页</button><button className="m1-button" disabled={!data.nextCursor} onClick={() => { setHistory(value => [...value, cursor]); setCursor(data.nextCursor!); }}>下一页</button></footer>
      </>}
    </section>
    {detail ? <PersonDetail person={detail} onClose={() => setDetail(null)} onEdit={() => { setAction({ mode: 'edit', person: detail }); setDetail(null); }} onDepartment={user?.isSystemAdmin && detail.account && !detail.archivedAt ? () => { setAction({ mode: 'department', person: detail }); setDetail(null); } : undefined} onAdmission={user?.isSystemAdmin && detail.account && !detail.account.isSystemAdmin && !detail.archivedAt ? () => { setAction({ mode: 'admission', person: detail }); setDetail(null); } : undefined} /> : null}
    {action ? <PersonAction key={`${action.mode}:${action.person?.id ?? 'new'}`} action={action} departments={departments} onClose={() => setAction(null)} onSaved={saved} /> : null}
  </section>;
}

function PersonDetail({ person, onClose, onEdit, onAdmission, onDepartment }: { person: PersonRecord; onClose: () => void; onEdit: () => void; onAdmission: (() => void) | undefined; onDepartment: (() => void) | undefined }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="m1-modal people-directory-dialog" aria-label="人员详情" onCancel={onClose}><header><h2>{person.name}</h2><button className="m1-button" onClick={onClose}>关闭</button></header><dl className="people-directory-details">{[['工号', person.account?.username], ['部门', person.department?.name], ['岗位', person.position], ['电话', person.mobile], ['邮箱', person.email], ['备注', person.note], ['名单状态', person.archivedAt ? '已归档' : person.isActive ? '常用' : '已停用'], ['系统准入', person.account ? person.account.teamAccessApproved || person.account.isSystemAdmin ? '已准入' : '未准入' : '无登录账号']].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>)}</dl><footer className="m1-button-group">{!person.archivedAt ? <button className="m1-button m1-primary" onClick={onEdit}>编辑资料</button> : null}{onDepartment ? <button className="m1-button" onClick={onDepartment}>调整部门</button> : null}{onAdmission ? <button className="m1-button" onClick={onAdmission}>调整系统准入</button> : null}</footer></dialog>;
}

function PersonAction({ action: { mode, person }, departments, onClose, onSaved }: { action: Action; departments: DepartmentOption[]; onClose: () => void; onSaved: (message: string) => void }) {
  const title = mode === 'new' ? '新增人员' : mode === 'edit' ? '编辑人员' : mode === 'archive' ? person?.archivedAt ? '恢复人员名单' : '归档人员' : mode === 'admission' ? '调整系统准入' : mode === 'department' ? '调整部门' : person?.isActive ? '停用人员' : '启用人员';
  const fields: RecordFormField[] = mode === 'new' || mode === 'edit' ? [
    { key: 'name', label: '姓名', required: true, maxLength: 100, initial: person?.name ?? '' },
    ...(!person?.account ? [{ key: 'departmentId', label: '部门', initial: person?.departmentId ?? '', options: departments.map(value => ({ value: value.id, label: value.name })) }] : []),
    { key: 'position', label: '岗位说明', maxLength: 100, initial: person?.position ?? '' }, { key: 'mobile', label: '电话', maxLength: 32, initial: person?.mobile ?? '' },
    { key: 'email', label: '邮箱', maxLength: 160, initial: person?.email ?? '' }, { key: 'note', label: '备注', type: 'textarea', maxLength: 2000, initial: person?.note ?? '' },
  ] : [...(mode === 'department' ? [{ key: 'departmentId', label: '部门', initial: person?.departmentId ?? '', options: departments.map(value => ({ value: value.id, label: value.name })) }] : []), ...(mode === 'admission' ? [{ key: 'approved', label: '系统准入', required: true, initial: String(person?.account?.teamAccessApproved ?? false), options: [{ value: 'true', label: '准入' }, { value: 'false', label: '撤销准入' }] }] : []), { key: 'reason', label: '操作原因', required: true, maxLength: 300 }];
  return <div className="people-action"><RecordForm title={`${title}${person ? ` · ${person.name}` : ''}`} fields={fields} onClose={onClose} submit={async (values, operationId) => {
    if (mode === 'new') {
      await apiRequest('/persons', { method: 'POST', body: { operationId, items: [{ clientId: 'new_person', fields: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value || null])) }] } });
      onSaved('人员已新增；未创建登录账号。'); return;
    }
    if (!person) throw new Error('人员记录未能读取。');
    if (mode === 'edit') await apiRequest('/persons/sheet', { method: 'PATCH', body: { operationId, items: [{ id: person.id, expectedRevision: person.revision, changes: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value || null])) }] } });
    else if (mode === 'archive') await apiRequest(`/persons/${encodeURIComponent(person.id)}/archive`, { method: 'PATCH', body: { operationId, expectedRevision: person.revision, archived: !person.archivedAt, reason: values.reason } });
    else if (mode === 'department') await apiRequest(`/persons/${encodeURIComponent(person.id)}/department`, { method: 'PATCH', body: { operationId, expectedRevision: person.revision, departmentId: values.departmentId || null, reason: values.reason } });
    else if (person.account) await apiRequest(`/people/${encodeURIComponent(person.account.id)}`, { method: 'PATCH', body: { requestId: operationId, expectedVersion: person.account.version, reason: values.reason, ...(mode === 'admission' ? { teamAccessApproved: values.approved === 'true' } : { status: person.isActive ? 'INACTIVE' : 'ACTIVE' }) } });
    else await apiRequest('/persons/sheet', { method: 'PATCH', body: { operationId, reason: values.reason, items: [{ id: person.id, expectedRevision: person.revision, changes: { isActive: !person.isActive } }] } });
    onSaved(mode === 'archive' ? person.archivedAt ? '已恢复到常用名单；账号及人员停用状态保持不变。' : '人员已归档，历史记录保留。' : `${title}已保存。`);
  }} /></div>;
}
