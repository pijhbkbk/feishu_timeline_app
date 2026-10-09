'use client';

import Link from 'next/link';
import { SourceWorkbook } from './source-workbook';
import { StandardCorrection } from './standard-correction';
import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../components/auth-provider';
import { ApiRequestError } from '../../lib/auth-client';
import { M1Icon } from '../m1/icon';
import { useProjectUnsavedChanges } from '../m1/use-unsaved';
import { fetchRegister, fetchRegisterDetail, saveRegisterNotes, type RegisterDetail, type RegisterFilters, type RegisterJson, type RegisterList, type RegisterNoteChange, type RegisterRow, type RegisterSource, type RegisterStandardVersion } from './client';
import { parseRegisterNotePaste, productionStatusLabel, registerRowsToTsv, registerStatusLabel } from './clipboard';

const EMPTY_FILTERS: RegisterFilters = { search: '', baseId: '', status: '' };
type Drafts = Record<string, RegisterNoteChange>;

export function ColorRegisterWorkspace() {
  const { user } = useAuth();
  const [filters, setFilters] = useState<RegisterFilters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<RegisterFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<RegisterList | null>(null);
  const [facets, setFacets] = useState<RegisterList['facets']>({ bases: [], statuses: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [drafts, setDrafts] = useState<Drafts>({});
  const [saving, setSaving] = useState(false);
  const [copyFallback, setCopyFallback] = useState('');
  const [pasteOpen, setPasteOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('colorId');
    if (id && /^[A-Za-z0-9_-]{1,128}$/.test(id)) setDetailId(id);
  }, []);
  const [conflicted, setConflicted] = useState(false);
  const pending = useRef(false);
  const request = useRef<{ fingerprint: string; key: string } | null>(null);
  const savedExpected = useRef<RegisterNoteChange[] | null>(null);
  const dirtyCount = Object.keys(drafts).length;
  const allowLeave = useProjectUnsavedChanges(dirtyCount > 0 || pasteOpen);
  const canEdit = Boolean(user?.isSystemAdmin || user?.teamAccessApproved);
  const conflicts = (data?.items ?? []).filter(row => drafts[row.id] && drafts[row.id]!.expectedRevision !== row.revision);
  const missingDrafts = data ? Object.values(drafts).filter(draft => !data.items.some(row => row.id === draft.id)) : [];

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let active = true;
    setLoading(true); setError('');
    void fetchRegister({ ...applied, page, pageSize: 25 }, controller.signal)
      .then(result => {
        if (!active) return;
        setData(result); setFacets(result.facets);
        if (savedExpected.current) {
          const expected = savedExpected.current;
          const confirmed = expected.every(change => result.items.some(row => row.id === change.id && row.note === change.note));
          savedExpected.current = null;
          if (confirmed) setNotice(`已保存 ${expected.length} 条备注，并已重新读取确认。`);
          else { setNotice(''); setError('保存请求已成功，但最新读回结果与提交内容不同，请核对当前记录。'); }
        }
      })
      .catch(cause => { if (active) setError(errorMessage(cause)); })
      .finally(() => { clearTimeout(timeout); if (active) setLoading(false); });
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [applied, page, refresh]);

  function discardForNavigation() {
    if (dirtyCount && !window.confirm('有未保存的备注，确定放弃这些修改？')) return false;
    setDrafts({}); request.current = null; savedExpected.current = null; setConflicted(false); setNotice(''); setCopyFallback('');
    return true;
  }
  function applyFilters(event: React.FormEvent) {
    event.preventDefault(); if (saving || !discardForNavigation()) return;
    setData(null); setPage(1); setApplied({ ...filters, search: filters.search.trim() });
  }
  function resetFilters() {
    if (saving || !discardForNavigation()) return;
    setData(null); setFilters(EMPTY_FILTERS); setApplied(EMPTY_FILTERS); setPage(1); setRefresh(value => value + 1);
  }
  function changePage(nextPage: number) {
    if (saving || !discardForNavigation()) return;
    setData(null); setPage(nextPage);
  }
  function changeNote(row: RegisterRow, text: string) {
    setNotice('');
    setDrafts(current => {
      const next = { ...current };
      if (text === (row.note ?? '')) delete next[row.id];
      else next[row.id] = { id: row.id, expectedRevision: current[row.id]?.expectedRevision ?? row.revision, note: text || null };
      return next;
    });
  }
  async function saveNotes() {
    if (pending.current || !dirtyCount || conflicts.length || missingDrafts.length) return;
    pending.current = true; setSaving(true); setError(''); setNotice('');
    const changes = Object.values(drafts).sort((left, right) => left.id.localeCompare(right.id));
    const fingerprint = JSON.stringify(changes);
    if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, key: crypto.randomUUID() };
    try {
      await saveRegisterNotes(changes, request.current.key);
      setDrafts({}); request.current = null; setConflicted(false); allowLeave();
      savedExpected.current = changes;
      setNotice(`已保存 ${changes.length} 条备注，正在读取保存结果。`);
      setRefresh(value => value + 1);
    } catch (cause) {
      setError(errorMessage(cause));
      if (cause instanceof ApiRequestError && cause.status === 409) setConflicted(true);
    } finally { pending.current = false; setSaving(false); }
  }
  async function copyCurrentPage() {
    if (!data) return;
    const text = registerRowsToTsv(data.items);
    setError(''); setCopyFallback('');
    try {
      await navigator.clipboard.writeText(text);
      setNotice('已复制当前页已保存的数据，可粘贴到表格；修改备注后连同表头粘贴回来。');
    } catch { setCopyFallback(text); }
  }
  function adoptLatest(row: RegisterRow) {
    setDrafts(current => { const next = { ...current }; delete next[row.id]; return next; });
  }
  function keepDraft(row: RegisterRow) {
    setDrafts(current => current[row.id] ? { ...current, [row.id]: { ...current[row.id]!, expectedRevision: row.revision } } : current);
  }

  return <section className="cr-workspace" data-testid="color-register-page" data-source="database">
    <nav className="m1-breadcrumb" aria-label="面包屑"><Link href="/dashboard" aria-label="返回工作台"><M1Icon name="back" /></Link><span>颜色清单</span></nav>
    <header className="m1-heading cr-heading">
      <div><h1>颜色清单</h1><p>按生产基地查看颜色、色板与历史标准。</p></div>
      <div className="m1-button-group"><button className="m1-button" type="button" disabled={loading || saving} onClick={() => { if (discardForNavigation()) setRefresh(value => value + 1); }}><M1Icon name="refresh" />刷新</button><Link href="/projects/new" className="m1-button m1-primary">新建颜色项目</Link></div>
    </header>

    <section className="m1-card cr-list-card" aria-label="颜色清单查询">
      <form className="cr-filters" onSubmit={applyFilters}>
        <label className="cr-search"><span>颜色或色板</span><input type="search" value={filters.search} maxLength={100} placeholder="颜色名称 / 正式编号 / 色板编号" onChange={event => setFilters(current => ({ ...current, search: event.target.value }))} /></label>
        <label><span>生产基地</span><select value={filters.baseId} onChange={event => setFilters(current => ({ ...current, baseId: event.target.value }))}><option value="">全部基地</option>{facets.bases.map(base => <option key={base.id} value={base.id}>{base.name}</option>)}</select></label>
        <label><span>清单状态</span><select value={filters.status} onChange={event => setFilters(current => ({ ...current, status: event.target.value }))}><option value="">全部状态</option>{facets.statuses.map(status => <option key={status} value={status}>{registerStatusLabel(status)}</option>)}</select></label>
        <div className="m1-button-group"><button type="submit" className="m1-button m1-primary" disabled={saving}>查询</button><button type="button" className="m1-button" disabled={saving} onClick={resetFilters}>重置</button></div>
      </form>
      <div className="cr-toolbar"><p>{data ? <><strong>{data.total}</strong> 条颜色与基地记录</> : '颜色与基地记录'}</p><div className="m1-button-group"><button type="button" className="m1-button" disabled={!data?.items.length || loading || saving} onClick={() => void copyCurrentPage()}>复制当前页</button>{canEdit ? <button type="button" className="m1-button" disabled={!data?.items.length || loading || saving} onClick={() => setPasteOpen(true)}>粘贴备注</button> : null}</div></div>
      {data?.importSummary ? <details className="cr-import-summary"><summary>来源核对 · {data.importSummary.fileName}</summary><p>{data.importSummary.sheetCount} 个工作表 · {data.importSummary.rowCount} 条来源行 · {data.importSummary.colorCount} 条颜色记录 · {data.importSummary.pendingRowCount} 条来源行待核对</p><p>文件指纹：<code>{data.importSummary.sha256}</code></p></details> : null}

      {notice ? <p className="m1-notice" role="status">{notice}</p> : null}
      {error ? <div className="m1-error" role="alert"><p>{error}</p>{conflicted ? <button type="button" className="m1-button" disabled={loading || saving} onClick={() => setRefresh(value => value + 1)}>读取最新备注并比较</button> : <button type="button" className="m1-button" disabled={loading || saving} onClick={() => setRefresh(value => value + 1)}>重新读取</button>}</div> : null}
      {copyFallback ? <div className="cr-copy-fallback"><label htmlFor="cr-copy-text">浏览器未允许自动复制。选中下方内容后复制。</label><textarea id="cr-copy-text" readOnly value={copyFallback} onFocus={event => event.target.select()} rows={5} /><button type="button" className="m1-button" onClick={() => setCopyFallback('')}>收起</button></div> : null}
      {dirtyCount ? <div className="cr-save-bar"><span>{dirtyCount} 条备注尚未保存{conflicts.length ? `，其中 ${conflicts.length} 条需先处理冲突` : ''}{missingDrafts.length ? `；${missingDrafts.length} 条记录已不在当前结果中，请放弃修改后重新查询` : ''}</span><div className="m1-button-group"><button type="button" className="m1-button" disabled={saving} onClick={discardForNavigation}>放弃修改</button><button type="button" className="m1-button m1-primary" disabled={saving || loading || conflicts.length > 0 || missingDrafts.length > 0} onClick={() => void saveNotes()}>{saving ? '正在保存…' : '保存备注'}</button></div></div> : null}
      {loading ? <p className="cr-loading" role="status">正在读取清单…</p> : null}
      {!loading && data?.items.length === 0 ? <div className="m1-state"><h2>没有符合条件的颜色记录</h2><button type="button" className="m1-button" onClick={resetFilters}>清除筛选</button></div> : null}
      {data?.items.length ? <>
        <div className="cr-table-scroll" role="region" aria-label="颜色清单，可横向滚动查看全部列" tabIndex={0} aria-busy={loading}>
          <table className="cr-table"><caption className="cr-sr-only">每行保留独立颜色与生产基地身份。空值显示为横线；备注修改后需点击保存。</caption><thead><tr><th scope="col">颜色名称</th><th scope="col">生产基地</th><th scope="col">备注</th><th scope="col">色板编号</th><th scope="col">制作单位</th><th scope="col">漆种</th><th scope="col">正式编号</th><th scope="col">入清单月份</th><th scope="col">清单状态</th><th scope="col">量产状态</th><th scope="col">标准与来源</th></tr></thead>
            <tbody>{data.items.map(row => {
              const draft = drafts[row.id]; const conflict = draft && draft.expectedRevision !== row.revision;
              return <tr key={row.id} data-record-id={row.id} className={draft ? 'cr-row-dirty' : undefined}>
                <th scope="row"><button type="button" className="cr-name" onClick={() => setDetailId(row.id)}>{row.name ?? '名称待核对'}</button>{row.sourceSummary ? <span className="cr-source-hint">{row.sourceSummary}</span> : null}</th>
                <td>{row.base?.name ?? <span className="cr-pending">待核对</span>}</td>
                <td className="cr-note-cell">{canEdit ? <><label className="cr-sr-only" htmlFor={`cr-note-${row.id}`}>{row.name ?? '待核对颜色'} · {row.base?.name ?? '基地待核对'}的备注</label><textarea id={`cr-note-${row.id}`} rows={2} maxLength={2000} value={draft ? draft.note ?? '' : row.note ?? ''} disabled={saving || loading} onChange={event => changeNote(row, event.target.value)} aria-describedby={conflict ? `cr-conflict-${row.id}` : undefined} />{conflict ? <div id={`cr-conflict-${row.id}`} className="cr-conflict"><p>服务器备注：{row.note === null ? '空值' : row.note}</p><button type="button" onClick={() => adoptLatest(row)}>使用服务器备注</button><button type="button" onClick={() => keepDraft(row)}>保留我的修改</button></div> : draft ? <span className="cr-note-state">未保存</span> : null}</> : <span className="cr-note-value">{empty(row.note)}</span>}</td>
                <td>{empty(row.boardCode)}</td><td>{empty(row.manufacturer)}</td><td>{empty(row.paintType)}</td><td>{empty(row.formalCode)}</td><td>{empty(row.registerMonth)}</td><td><span className={`m1-badge ${row.registerStatus === 'PENDING_REVIEW' ? 'warning' : ''}`}>{registerStatusLabel(row.registerStatus)}</span></td><td>{productionStatusLabel(row.productionApprovalStatus)}</td><td><button type="button" className="m1-button" onClick={() => setDetailId(row.id)}>查看详情</button></td>
              </tr>;
            })}</tbody>
          </table>
        </div>
        <footer className="cr-pagination"><span>第 {data.page} / {Math.max(1, data.totalPages)} 页 · 每页 {data.pageSize} 条</span><div className="m1-button-group"><button type="button" className="m1-button" disabled={data.page <= 1 || loading || saving} onClick={() => changePage(page - 1)}>上一页</button><button type="button" className="m1-button" disabled={data.page >= data.totalPages || loading || saving} onClick={() => changePage(page + 1)}>下一页</button></div></footer>
      </> : null}
    </section>
    <SourceWorkbook />
    {pasteOpen && data ? <NotePasteDialog rows={data.items} drafts={drafts} onClose={() => setPasteOpen(false)} onApply={changes => { setDrafts(current => ({ ...current, ...Object.fromEntries(changes.map(change => [change.id, change])) })); setPasteOpen(false); setNotice(`已放入 ${changes.length} 条备注草稿，请核对后点击“保存备注”。`); }} /> : null}
    {detailId ? <RegisterDetails id={detailId} onClose={() => setDetailId(null)} /> : null}
  </section>;
}

function NotePasteDialog({ rows, drafts, onClose, onApply }: { rows: RegisterRow[]; drafts: Drafts; onClose: () => void; onApply: (changes: RegisterNoteChange[]) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<RegisterNoteChange[]>([]);
  useEffect(() => { dialog.current?.showModal(); }, []);
  function parse() {
    try {
      if (rows.some(row => drafts[row.id] && drafts[row.id]!.expectedRevision !== row.revision)) throw new Error('请先处理已有备注冲突，再粘贴新的修改。');
      setPreview(parseRegisterNotePaste(text, rows.map(row => drafts[row.id] ? { ...row, note: drafts[row.id]!.note } : row))); setError('');
    }
    catch (cause) { setPreview([]); setError(errorMessage(cause)); }
  }
  return <dialog className="m1-modal cr-dialog" ref={dialog} aria-labelledby="cr-paste-title" onCancel={onClose} onClose={onClose}>
    <header><h2 id="cr-paste-title">粘贴备注</h2><button type="button" className="m1-button" onClick={onClose}>取消</button></header>
    <p>将表头、清单记录ID、记录版本和备注一起粘贴。只修改当前页备注，颜色、基地和标准关联保持原值。</p>
    <label className="cr-paste-label" htmlFor="cr-paste-text">表格内容</label><textarea id="cr-paste-text" className="cr-paste-text" value={text} maxLength={262144} onChange={event => { setText(event.target.value); setPreview([]); setError(''); }} rows={7} autoFocus />
    {error ? <p className="m1-error" role="alert">{error}</p> : null}
    <button type="button" className="m1-button" onClick={parse} disabled={!text}>预览变更</button>
    {preview.length ? <><div className="cr-table-scroll"><table className="cr-preview-table"><caption>{preview.length} 条备注变更</caption><thead><tr><th>颜色 / 基地</th><th>当前备注</th><th>粘贴后的备注</th></tr></thead><tbody>{preview.map(change => {
      const row = rows.find(candidate => candidate.id === change.id)!;
      return <tr key={change.id}><th>{row.name ?? '名称待核对'} / {row.base?.name ?? '基地待核对'}</th><td>{empty(drafts[row.id] ? drafts[row.id]!.note : row.note)}</td><td>{empty(change.note)}</td></tr>;
    })}</tbody></table></div><footer className="cr-dialog-actions"><span>放入草稿后，点击清单中的“保存备注”才会写入。</span><button type="button" className="m1-button m1-primary" onClick={() => onApply(preview)}>放入备注草稿</button></footer></> : null}
  </dialog>;
}

function RegisterDetails({ id, onClose }: { id: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<RegisterDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [versionsPage, setVersionsPage] = useState(1);
  const [correcting, setCorrecting] = useState(false);
  function close() { if (!correcting || window.confirm("放弃未保存的标准更正并关闭？")) onClose(); }
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 15000); let active = true;
    setLoading(true); setError('');
    void fetchRegisterDetail(id, versionsPage, controller.signal).then(result => { if (active) setData(result); }).catch(cause => { if (active) setError(errorMessage(cause)); }).finally(() => { clearTimeout(timeout); if (active) setLoading(false); });
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [id, refresh, versionsPage]);
  return <dialog className="m1-modal cr-dialog" ref={dialog} aria-labelledby="cr-detail-title" onCancel={event => { event.preventDefault(); close(); }} onClose={onClose}>
    <header><h2 id="cr-detail-title">{data?.name ?? '颜色记录'} · 标准与来源</h2><button type="button" className="m1-button" onClick={close}>关闭</button></header>
    {loading ? <p role="status">正在读取标准和来源…</p> : error ? <div className="m1-error" role="alert"><p>{error}</p><button type="button" className="m1-button" onClick={() => setRefresh(value => value + 1)}>重新读取</button></div> : data ? <>
      <dl className="cr-detail-summary"><div><dt>生产基地</dt><dd>{data.base?.name ?? '待核对'}</dd></div><div><dt>颜色名称</dt><dd>{empty(data.name)}</dd></div><div><dt>统一色相标准</dt><dd>{data.hueStandard?.name ?? '尚未明确关联'}</dd></div><div><dt>正式编号</dt><dd>{empty(data.formalCode)}</dd></div><div><dt>入清单月份</dt><dd>{empty(data.registerMonth)}</dd></div><div><dt>清单状态</dt><dd>{registerStatusLabel(data.registerStatus)}</dd></div><div><dt>量产状态</dt><dd>{productionStatusLabel(data.productionApprovalStatus)}</dd></div><div className="cr-full-width"><dt>备注</dt><dd>{empty(data.note)}</dd></div></dl>
      {data.pendingReasons.length ? <section className="cr-pending-panel"><h3>待核对事项</h3><ul>{data.pendingReasons.map((reason, index) => <li key={`${index}:${reason}`}>{reason}</li>)}</ul></section> : null}
      <section className="cr-detail-section"><h3>色板标准与历史版本</h3>{data.versions.length ? data.versions.map(version => <StandardVersion key={version.id} version={version} current={data.currentStandardVersionId === version.id} />) : <p>尚未建立色板标准。候选颜色不作为正式生产标准。</p>}{data.versionsTotalPages > 1 ? <nav className="cr-pagination" aria-label="标准版本分页"><span>版本第 {data.versionsPage} / {data.versionsTotalPages} 页 · 共 {data.versionsTotal} 个版本</span><div className="m1-button-group"><button type="button" className="m1-button" disabled={data.versionsPage <= 1 || loading || correcting} onClick={() => setVersionsPage(value => value - 1)}>上一页版本</button><button type="button" className="m1-button" disabled={data.versionsPage >= data.versionsTotalPages || loading || correcting} onClick={() => setVersionsPage(value => value + 1)}>下一页版本</button></div></nav> : null}</section>
      <StandardCorrection key={`${data.id}:${data.revision}`} detail={data} onEditingChange={setCorrecting} onSaved={() => { setVersionsPage(1); setRefresh(value => value + 1); }} />
      <section className="cr-detail-section"><h3>系统批量生产</h3><p>按本颜色、基地及生产日期月份汇总已完成记录。与原表口径分开呈现，不相加。</p>{data.systemProduction.items.length ? <div className="cr-table-scroll"><table className="cr-measurements"><thead><tr><th>月份</th><th>统计口径</th><th>实际数量</th><th>记录数</th></tr></thead><tbody>{data.systemProduction.items.map(fact => <tr key={fact.month}><td>{fact.month}</td><td>{fact.metricScope}</td><td>{fact.unknownQuantityCount ? `待核对（${fact.unknownQuantityCount} 条缺数量）` : empty(fact.quantity)}</td><td>{fact.recordCount}</td></tr>)}</tbody></table></div> : <p>尚无已关联的完成批量生产记录。</p>}{data.systemProduction.undatedRecordCount ? <p>{data.systemProduction.undatedRecordCount} 条记录缺少生产日期，未推算月份。</p> : null}{data.systemProduction.hasMore ? <p>显示最近 120 个月份，其他记录仍在对应项目中保留。</p> : null}</section>
      <section className="cr-detail-section"><h3>产量记录</h3><p>按颜色、基地、月份与原口径保留；空值表示未记录，汇总行不重复计入。</p>{data.production.length ? <div className="cr-table-scroll"><table className="cr-measurements"><thead><tr><th>月份</th><th>原统计口径</th><th>原数量</th><th>来源单元格</th></tr></thead><tbody>{data.production.map(fact => <tr key={fact.id}><td>{fact.month}</td><td>{fact.metricScope}</td><td>{empty(fact.quantity)}</td><td>{empty(fact.sourceCell)}</td></tr>)}</tbody></table></div> : <p>没有已明确关联的产量；未关联原行可在来源核对中查看。</p>}{data.production.length === data.productionLimit ? <p>显示最近 {data.productionLimit} 条，其他原始月份仍保留在来源工作表。</p> : null}</section>
      <section className="cr-detail-section"><h3>来源记录</h3>{data.sources.length ? data.sources.map((source, index) => <SourceRecord key={`${source.sheetName}:${source.rowNumbers.join(',')}:${index}`} source={source} provenance={data.provenance.filter(row => row.fileName === source.fileName && row.sheetName === source.sheetName && source.rowNumbers.includes(row.rowNumber))} />) : <p>由系统项目建立，未导入历史工作表。</p>}</section>
      {data.projects.length ? <section className="cr-detail-section"><h3>关联项目</h3><ul className="cr-project-links">{data.projects.map(project => <li key={project.id}><Link href={`/projects/${encodeURIComponent(project.id)}`}>{project.name}</Link></li>)}</ul></section> : null}
    </> : null}
  </dialog>;
}

function StandardVersion({ version, current }: { version: RegisterStandardVersion; current: boolean }) {
  return <details className="cr-version" open={current}><summary><strong>版本 {version.versionNo}</strong><span>{current ? '当前标准' : '历史标准'}</span><span>{version.boardCode ?? '色板编号未记录'}</span></summary>
    <dl className="cr-detail-summary"><div><dt>制作单位</dt><dd>{empty(version.manufacturer)}</dd></div><div><dt>漆种</dt><dd>{empty(version.paintType)}</dd></div><div><dt>测量日期</dt><dd>{empty(version.measurementDate)}</dd></div><div><dt>原制板 / 发出日期</dt><dd>{empty(version.issueDate)}</dd></div><div><dt>原有效期限</dt><dd>{empty(version.expiryDate)}</dd></div><div><dt>系统记录时间</dt><dd>{dateLabel(version.createdAt)}</dd></div></dl>
    <div className="cr-table-scroll"><table className="cr-measurements"><caption>多角度测量值</caption><thead><tr><th>角度</th><th>L</th><th>a</th><th>b</th></tr></thead><tbody>{version.measurements.length ? version.measurements.map((measurement, index) => <tr key={`${index}:${measurement.angle}`}><th>{measurement.angle ?? '原表未标明'}</th><td>{empty(measurement.l)}</td><td>{empty(measurement.a)}</td><td>{empty(measurement.b)}</td></tr>) : <tr><td colSpan={4}>原记录未提供测量值。</td></tr>}</tbody></table></div>
    <div className="cr-standard-facts"><section><h4>测量条件</h4><JsonValue value={version.conditions} /></section><section><h4>原控制限</h4><JsonValue value={version.originalControlLimits} /></section></div>
    {version.changeSummary ? <p>更正说明：{version.changeSummary}</p> : null}
    {version.source ? <p className="cr-version-source">来源：{version.source.fileName} / {version.source.sheetName} / 第 {version.source.rowNumbers.join('、')} 行</p> : null}
  </details>;
}

function SourceRecord({ source, provenance }: { source: RegisterSource; provenance: RegisterDetail['provenance'] }) {
  return <details className="cr-source"><summary>{source.fileName} · {source.sheetName} · 第 {source.rowNumbers.join('、')} 行</summary>{provenance.map(row => <section className="cr-source-row" key={row.rowNumber}><h4>原表第 {row.rowNumber} 行</h4><JsonValue value={row.rawCells} /></section>)}</details>;
}
function JsonValue({ value }: { value: RegisterJson }) {
  if (value === null) return <span className="cr-empty">空值</span>;
  return <pre className="cr-json">{typeof value === 'string' ? value || '空字符串' : JSON.stringify(value, null, 2)}</pre>;
}
function empty(value: string | number | null) { return value === null ? <span className="cr-empty" aria-label="未记录">—</span> : value === '' ? <span className="cr-empty">空字符串</span> : String(value); }
function dateLabel(value: string) { const parsed = new Date(value); return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleString('zh-CN', { hour12: false }); }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : '读取失败，请重试。'; }
