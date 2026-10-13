'use client';
import Link from 'next/link';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../components/auth-provider';
import { ApiRequestError } from '../../lib/auth-client';
import { M1Icon } from '../m1/icon';
import { useProjectUnsavedChanges } from '../m1/use-unsaved';
import { fetchRegisterDetail, type RegisterDetail, type RegisterRow } from './client';
import { CatalogSheetModel, EDITABLE_FIELDS, SHEET_COLUMNS, editable, type SheetChange, type SheetPatch } from './sheet-model';
import { readCatalog, saveCatalog, type SheetFacets } from './sheet-client';
import { registerStatusLabel } from './clipboard';
import { RegisterDetails } from './register-details';
import { SourceWorkbook } from './source-workbook';
import { ColorImageSheetImport, colorExchangeRow } from './image-sheet-import';
import { SheetImagePanel } from '../business-sheet/image-panel';
import { useSheetImages } from '../business-sheet/use-images';
import { BusinessSheetCanvas } from '../business-sheet/canvas';
import type { BusinessSheetRuntime } from '../business-sheet/runtime';
import './sheet-workspace.css';

const initialFilters = { search: '', base: '', paint: '', status: '' };
function message(cause: unknown) { return cause instanceof Error ? cause.message : '操作失败，请重试。'; }
function displayValue(row: RegisterRow, field: string) { if (field === 'baseName') return row.base?.name ?? ''; if (field === 'registerStatus') return registerStatusLabel(row.registerStatus); return String(row[field as keyof RegisterRow] ?? ''); }

export function ColorRegisterWorkspace() {
  const { user } = useAuth();
  const canEdit = Boolean(user?.isSystemAdmin || user?.teamAccessApproved);
  const model = useRef<CatalogSheetModel | null>(null);
  const runtime = useRef<BusinessSheetRuntime | null>(null);
  const loadSequence = useRef(0);
  const [epoch, setEpoch] = useState(0); const [tick, setTick] = useState(0);
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const savingRef = useRef(false);
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [facets, setFacets] = useState<SheetFacets>({ bases: [], statuses: [] }); const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState(initialFilters); const [sort, setSort] = useState('name:asc');
  const [selected, setSelected] = useState<string | null>(null); const [activeField, setActiveField] = useState('note');
  const [panel, setPanel] = useState(true); const [detail, setDetail] = useState<RegisterDetail | null>(null); const [detailError, setDetailError] = useState('');
  const [fullDetail, setFullDetail] = useState(false); const [importOpen, setImportOpen] = useState(false);
  const [reason, setReason] = useState(''); const [engineReady, setEngineReady] = useState(false);
  const retry = useRef<{ fingerprint: string; operationId: string } | null>(null);
  const unconfirmed = useRef<{ items: SheetPatch[]; operationId: string; reason: string } | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const patches = model.current?.patches() ?? [];
  const imageRecordIds = useMemo(() => [...model.current?.rows.keys() ?? []], [epoch]);
  const imageState = useSheetImages('SHEET_COLOR', imageRecordIds);
  const dirty = patches.length > 0 || uncertain;
  useProjectUnsavedChanges(dirty || saving || importOpen || imageState.pending);
  const paintTypes = facets.paintTypes ?? [...new Set([...model.current?.rows.values() ?? []].map(row => row.paintType).filter((x): x is string => Boolean(x)))];
  const manufacturers = facets.manufacturers ?? [...new Set([...model.current?.rows.values() ?? []].map(row => row.manufacturer).filter((x): x is string => Boolean(x)))];
  const errors = model.current?.errors(paintTypes, manufacturers) ?? [];
  const conflicts = model.current?.conflicts() ?? [];
  const standardEdits = patches.some(patch => Object.keys(patch.changes).some(field => field !== 'note'));
  const bump = () => setTick(value => value + 1);

  const load = useCallback(async (signal: AbortSignal) => {
    const sequence = ++loadSequence.current;
    setLoading(true); setError('');
    try {
      const data = await readCatalog(signal); if (sequence !== loadSequence.current) return;
      model.current = new CatalogSheetModel(data.items); setFacets(data.facets); setTotal(data.total);
      const requested = new URLSearchParams(window.location.search).get('colorId');
      setSelected(current => data.items.some(row => row.id === (current ?? requested)) ? current ?? requested : null);
      retry.current = null; setEpoch(value => value + 1); setNotice('已读取服务器记录');
    } catch (cause) { if (sequence === loadSequence.current) setError(message(cause)); }
    finally { if (sequence === loadSequence.current) setLoading(false); }
  }, []);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  async function addImages(files: File[], recordId: string) { try { await imageState.add(files, recordId); } catch (cause) { setError(message(cause)); } }
  async function changeView(change: () => void) { await runtime.current?.finishEditing(); change(); }
  const reload = async () => { await runtime.current?.finishEditing(); if (unconfirmed.current) { setError('上次保存结果尚未确认，请先核实结果，再重新读取。'); return; } if (savingRef.current || ((model.current?.patches().length ?? 0) > 0 && !window.confirm('重新读取将放弃未保存内容，是否继续？'))) return; void load(AbortSignal.timeout(30000)); };
  async function openImport() { await runtime.current?.finishEditing(); if (model.current?.patches().length || unconfirmed.current || savingRef.current || imageState.pending) { setError('请先确认当前文字和图片保存结果，再导入。'); return; } setImportOpen(true); }
  async function openDetails() { await runtime.current?.finishEditing(); if (model.current?.patches().length || unconfirmed.current || savingRef.current) { setError('请先保存或处理待保存内容，再打开业务详情。'); return; } setFullDetail(true); }
  const visible = useMemo(() => {
    const rows = [...model.current?.rows.values() ?? []];
    const query = filters.search.trim().toLocaleLowerCase();
    const [key, direction] = sort.split(':');
    return rows.filter(row => (!query || [row.name, row.formalCode, row.boardCode].some(value => value?.toLocaleLowerCase().includes(query))) && (!filters.base || row.base?.id === filters.base) && (!filters.paint || row.paintType === filters.paint) && (!filters.status || row.registerStatus === filters.status))
      .sort((a, b) => (displayValue(a, key!).localeCompare(displayValue(b, key!), 'zh-CN') || a.id.localeCompare(b.id)) * (direction === 'desc' ? -1 : 1));
    // Save acknowledgements do not reorder a sheet while someone is editing it.
  }, [epoch, filters, sort]);
  useEffect(() => { setSelected(current => visible.some(row => row.id === current) ? current : visible[0]?.id ?? null); }, [visible]);
  const handlers = useRef<{ changes: (changes: SheetChange[]) => void; undo: () => void; redo: () => void }>({ changes: () => {}, undo: () => {}, redo: () => {} });
  function applyChanges(changes: SheetChange[]) {
    if (!canEdit || loading || !model.current) return;
    try { model.current.apply(changes); setNotice(''); setError(''); bump(); }
    catch (cause) { setError(message(cause)); runtime.current?.updateValues(changes.map(change => ({ ...change, value: displayValue(model.current!.display(change.id), change.field) }))); }
  }
  async function history(action: 'undo' | 'redo') { await runtime.current?.finishEditing(); if (!model.current || loading || savingRef.current) return; try { const changes = model.current[action](); runtime.current?.updateValues(changes); setNotice(changes.length ? '变更已放入待保存内容，保存后才写入业务记录。' : ''); bump(); } catch (cause) { setError(message(cause)); } }
  handlers.current = { changes: applyChanges, undo: () => history('undo'), redo: () => history('redo') };
  const canvasRows = useMemo(() => visible.map(row => ({ id: row.id,
    values: SHEET_COLUMNS.map(column => displayValue(model.current!.display(row.id), column.key)),
    editable: SHEET_COLUMNS.map(column => canEdit && editable(row, column.key)),
  })), [visible, canEdit]);
  useEffect(() => {
    if (!selected || !panel) return;
    const controller = new AbortController(); setDetail(null); setDetailError('');
    const timer = window.setTimeout(() => { void fetchRegisterDetail(selected, 1, controller.signal).then(value => { if (!controller.signal.aborted) setDetail(value); }).catch(cause => { if (!controller.signal.aborted) setDetailError(message(cause)); }); }, 100);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [selected, panel, epoch, notice]);
  useEffect(() => { const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setPanel(false); }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close); }, []);

  async function save() {
    if (!model.current || savingRef.current) return;
    await runtime.current?.finishEditing();
    if (savingRef.current || loading) return;
    const current = model.current;
    if (unconfirmed.current) {
      savingRef.current = true; setSaving(true); setError('');
      const request = unconfirmed.current;
      try {
        const result = await saveCatalog(request.items, request.operationId, request.reason);
        current.confirm(result.items, request.items); unconfirmed.current = null; setUncertain(false); retry.current = null;
        runtime.current?.updateValues(result.items.flatMap(row => EDITABLE_FIELDS.map(field => ({ id: row.id, field, value: current.display(row.id)[field] }))));
        setNotice(`已核实上次保存结果；${current.patches().length} 条新编辑仍待保存。`); bump();
      } catch (cause) {
        // Authentication and route failures during a replay cannot establish whether the original command committed.
        if (cause instanceof ApiRequestError && [400, 409, 422].includes(cause.status)) {
          unconfirmed.current = null; setUncertain(false); retry.current = null;
          if (cause.status === 409) {
            try { const latest = await readCatalog(AbortSignal.timeout(30000)); current.latest(latest.items); runtime.current?.updateValues([...current.rows.keys()].flatMap(id => SHEET_COLUMNS.map(column => ({ id, field: column.key, value: displayValue(current.display(id), column.key) })))); } catch { /* Keep the original draft for explicit reload. */ }
          }
          setError(`上次请求已明确拒绝：${message(cause)}。输入已保留，请核对后重新保存。`); bump();
        } else setError(`尚未确认上次保存：${message(cause)}。原请求及新增编辑继续保留，请重试核实。`);
      }
      finally { savingRef.current = false; setSaving(false); }
      return;
    }
    const input = current.patches();
    if (!input.length || current.errors(paintTypes, manufacturers).length || current.conflicts().length) { bump(); return; }
    if (input.some(patch => Object.keys(patch.changes).some(field => field !== 'note')) && !reason.trim()) { setError('请填写标准更正原因，再保存色板相关字段。'); return; }
    savingRef.current = true; setSaving(true); setError(''); setNotice(''); let done = 0;
    try {
      for (let offset = 0; offset < input.length; offset += 50) {
        const batch = input.slice(offset, offset + 50); const fingerprint = JSON.stringify({ batch, reason });
        if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, operationId: crypto.randomUUID() };
        unconfirmed.current = { items: batch, operationId: retry.current.operationId, reason }; setUncertain(true);
        const result = await saveCatalog(batch, retry.current.operationId, reason);
        current.confirm(result.items, batch); unconfirmed.current = null; setUncertain(false); retry.current = null; done += batch.length;
        const normalization: SheetChange[] = result.items.flatMap(row => EDITABLE_FIELDS.map(field => ({ id: row.id, field, value: current.display(row.id)[field] })));
        runtime.current?.updateValues(normalization); bump();
      }
      setNotice(`已保存 ${done} 条记录${current.patches().length ? '；请求期间的新编辑仍待保存' : '，服务器已确认'}。`);
    } catch (cause) {
      if (cause instanceof ApiRequestError && [400, 401, 403, 404, 409, 422].includes(cause.status)) { unconfirmed.current = null; setUncertain(false); }
      setError(`${message(cause)} 已成功 ${done} 条；本批及后续 ${input.length - done} 条未确认，内容已保留。`);
      if (cause instanceof ApiRequestError && cause.status === 409) {
        retry.current = null;
        try { const latest = await readCatalog(AbortSignal.timeout(30000)); current.latest(latest.items); runtime.current?.updateValues([...current.rows.keys()].flatMap(id => SHEET_COLUMNS.map(column => ({ id, field: column.key, value: displayValue(current.display(id), column.key) })))); } catch { /* Drafts remain available even when conflict reload fails. */ }
      }
      bump();
    } finally { savingRef.current = false; setSaving(false); }
  }
  const saveAction = useRef(save); saveAction.current = save;
  useEffect(() => {
    if (loading || saving || error || uncertain || !patches.length || errors.length || conflicts.length || (standardEdits && !reason.trim())) return;
    const timer = window.setTimeout(() => { void saveAction.current(); }, 350);
    return () => window.clearTimeout(timer);
  }, [tick, loading, saving, error, uncertain, patches.length, errors.length, conflicts.length, standardEdits, reason]);
  async function exportFile() {
    setError('');
    try {
      const { exportRecordWorkbook } = await import('../business-sheet/record-exchange');
      const bytes = await exportRecordWorkbook('颜色清单', 'color-catalog', SHEET_COLUMNS, visible.map(row => colorExchangeRow(model.current!.rows.get(row.id)!)), imageState.images);
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const link = document.createElement('a'); link.href = url; link.download = '颜色清单-系统模板.xlsx'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(`已导出当前筛选的 ${visible.length} 条已保存记录；待保存编辑未导出。`);
    } catch (cause) { setError(message(cause)); }
  }
  function resolve(id: string, keep: boolean) { model.current!.resolve(id, keep); const row = model.current!.display(id); runtime.current?.updateValues(EDITABLE_FIELDS.map(field => ({ id, field, value: row[field] }))); retry.current = null; bump(); }
  const selectedRow = selected && model.current?.rows.has(selected) ? model.current.display(selected) : null;
  const activeEditable = Boolean(canEdit && !loading && selectedRow && editable(selectedRow, activeField));
  const activeValue = selectedRow ? displayValue(selectedRow, activeField) : '';
  const activeOptions = activeField === 'manufacturer' ? manufacturers : activeField === 'paintType' ? paintTypes : null;
  function editActive(value: string) { if (!selected) return; const changes = [{ id: selected, field: activeField, value: value || null }]; applyChanges(changes); runtime.current?.updateValues(changes); }
  void tick;
  return <section className="cr-workspace cs-workspace" data-testid="color-register-page" data-source="database">
    <nav className="m1-breadcrumb" aria-label="面包屑"><Link href="/dashboard" aria-label="返回工作台"><M1Icon name="back" /></Link><span>颜色清单</span></nav>
    <header className="cs-heading"><div><h1>颜色清单</h1><p>按生产基地维护颜色、色板与历史标准。</p></div><div className="cs-actions"><span role="status" className={`cs-save-state ${dirty || error ? 'pending' : ''}`}>{saving ? '保存中…' : conflicts.length ? '版本冲突' : error || errors.length ? '需处理' : dirty ? `${patches.length} 条待保存` : loading ? '读取中…' : '已同步'}</span><button className="m1-button" onClick={() => void openImport()} disabled={loading || saving}><M1Icon name="upload" />导入 Excel</button><button className="m1-button" disabled={loading || !visible.length} onClick={() => void exportFile()}>导出 Excel</button><Link href="/projects/new" className="m1-button m1-primary">新建颜色项目</Link></div></header>
    <div className="cs-filters"><label className="cs-search"><span className="cr-sr-only">搜索颜色、编号或色板</span><input type="search" maxLength={100} placeholder="搜索颜色、编号或色板" value={filters.search} onChange={e => { const value = e.target.value; void changeView(() => setFilters(x => ({ ...x, search: value }))); }} /></label><select aria-label="生产基地筛选" value={filters.base} onChange={e => { const value = e.target.value; void changeView(() => setFilters(x => ({ ...x, base: value }))); }}><option value="">全部基地</option>{facets.bases.map(base => <option key={base.id} value={base.id}>{base.name}</option>)}</select><select aria-label="漆种筛选" value={filters.paint} onChange={e => { const value = e.target.value; void changeView(() => setFilters(x => ({ ...x, paint: value }))); }}><option value="">全部漆种</option>{paintTypes.map(value => <option key={value}>{value}</option>)}</select><select aria-label="清单状态筛选" value={filters.status} onChange={e => { const value = e.target.value; void changeView(() => setFilters(x => ({ ...x, status: value }))); }}><option value="">全部状态</option>{facets.statuses.map(value => <option key={value} value={value}>{registerStatusLabel(value)}</option>)}</select><button className="m1-button" onClick={() => void changeView(() => setFilters(initialFilters))}>重置</button></div>
    {error ? <div className="m1-error" role="alert">{error}<button className="m1-button" onClick={reload} disabled={saving}>重新读取</button></div> : null}
    {errors.length ? <div className="m1-error" role="alert">{errors.slice(0, 8).map(item => <p key={`${item.id}:${item.field}`}>{item.message}<button onClick={() => runtime.current?.selectCell(item.id, item.field)}>定位</button></p>)}{errors.length > 8 ? <p>另有 {errors.length - 8} 项错误。</p> : null}</div> : null}
    {conflicts.length ? <div className="cs-conflicts" role="alert"><h2>记录已被其他成员修改</h2><p>核对服务器当前值与本次输入，再选择重新编辑；不会自动覆盖。</p>{conflicts.map(patch => <div key={patch.id}><strong>{model.current!.rows.get(patch.id)!.name}</strong>{Object.entries(patch.changes).map(([field, value]) => <p key={field}>{SHEET_COLUMNS.find(column => column.key === field)?.label}：服务器「{displayValue(model.current!.rows.get(patch.id)!, field) || '空'}」 → 本次「{value ?? '空'}」</p>)}<button className="m1-button" onClick={() => resolve(patch.id, false)}>采用服务器值</button><button className="m1-button" onClick={() => resolve(patch.id, true)}>保留输入并重新编辑</button></div>)}</div> : null}
    {dirty ? <div className="cs-save-bar"><span>{uncertain ? '上次保存结果待核实 · ' : ''}{patches.length} 条记录待保存{standardEdits ? ' · 标准修改将追加历史版本' : ''}</span>{standardEdits ? <input aria-label="标准更正原因" placeholder="填写标准更正原因" maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} /> : null}<button className="m1-button m1-primary" disabled={saving || (!uncertain && (!!errors.length || !!conflicts.length))} onClick={() => void save()}>{saving ? '保存中…' : uncertain ? '核实上次保存结果' : '保存修改'}</button></div> : null}
    {total > (model.current?.rows.size ?? 0) ? <p className="m1-notice">当前载入前 {model.current?.rows.size} 条，共 {total} 条。筛选和导出仅覆盖已载入记录。</p> : null}
    <div className={`cs-content ${panel && selectedRow ? 'with-detail' : ''}`}>
      <div className="cs-sheet">
        <div className="cs-tools"><button className="m1-button" title="撤销；保存过的修改将作为反向变更再次保存" disabled={loading || saving || !model.current?.undoStack.length} onClick={() => history('undo')}>撤销</button><button className="m1-button" disabled={loading || saving || !model.current?.redoStack.length} onClick={() => history('redo')}>重做</button><select aria-label="整行排序" value={sort} onChange={e => { const value = e.target.value; void changeView(() => setSort(value)); }}><option value="name:asc">颜色名称 · 升序</option><option value="name:desc">颜色名称 · 降序</option><option value="baseName:asc">生产基地 · 升序</option><option value="boardCode:asc">色板编号 · 升序</option></select><span className="cs-tool-spacer" /><button className="m1-button" disabled={loading || saving} onClick={reload}><M1Icon name="refresh" />刷新</button><button className="m1-button" onClick={() => setPanel(value => !value)}>{panel ? '收起详情' : '记录详情'}</button></div>
        {selectedRow ? <div className="cs-cell-editor"><label htmlFor="cs-active-cell">{SHEET_COLUMNS.find(column => column.key === activeField)?.label ?? '单元格'}{activeEditable ? '' : ' · 只读'}</label>{activeOptions && activeEditable ? <select id="cs-active-cell" aria-label="当前单元格" value={activeValue} onChange={e => editActive(e.target.value)}><option value="">清空</option>{[...new Set([activeValue, ...activeOptions])].filter(Boolean).map(value => <option key={value}>{value}</option>)}</select> : <input id="cs-active-cell" aria-label="当前单元格" value={activeValue} readOnly={!activeEditable} maxLength={activeField === 'note' ? 4000 : activeField === 'registerMonth' ? 7 : activeField === 'boardCode' ? 128 : 200} onChange={e => editActive(e.target.value)} />}</div> : null}
        <div className="cs-engine-wrap"><BusinessSheetCanvas runtimeRef={runtime} rows={canvasRows} columns={SHEET_COLUMNS} label="颜色清单在线表格" images={imageState.images} imageActions={{ add: (files, id) => { void addImages(files, id); }, change: imageState.change, remove: imageState.remove, requestFiles: () => { setPanel(true); window.setTimeout(() => document.querySelector<HTMLInputElement>('[aria-label="选择记录图片"]')?.click(), 0); } }} selection={{ id: selected, field: activeField }} onReady={setEngineReady}
          onChanges={changes => handlers.current.changes(changes)} onSelection={(id, _row, col) => { setSelected(id); setActiveField(SHEET_COLUMNS[col]?.key ?? 'note'); }} onError={setError} onUndo={() => handlers.current.undo()} onRedo={() => handlers.current.redo()} />
          {!engineReady || loading ? <div className="cs-engine-loading" role="status">{loading ? '正在读取颜色记录…' : '正在加载在线表格…'}</div> : !visible.length ? <div className="cs-empty-overlay cs-state"><h2>没有符合条件的颜色记录</h2><button className="m1-button" onClick={() => void changeView(() => setFilters(initialFilters))}>清除筛选</button></div> : null}</div>
        <footer className="cs-statusbar"><strong>颜色清单</strong><span>{visible.length} 条记录{selectedRow ? ` · ${selectedRow.name ?? '当前记录'}` : ''}</span><span>{notice || (dirty ? '编辑尚未保存' : '服务器数据')}</span></footer>
      </div>
      {panel && selectedRow ? <aside className="cs-detail" aria-label="记录详情"><header><h2>记录详情</h2><button aria-label="关闭记录详情" onClick={() => setPanel(false)}><M1Icon name="close" /></button></header><h3>{selectedRow.name}<span className="m1-badge">{selectedRow.base?.name ?? '基地待核对'}</span></h3><h4>基本信息</h4><dl>{SHEET_COLUMNS.filter(column => column.key !== 'photos').slice(0, 9).map(column => <div key={column.key}><dt>{column.label}</dt><dd>{displayValue(selectedRow, column.key) || '—'}</dd></div>)}</dl>{detailError ? <p className="m1-error">{detailError}</p> : null}<SheetImagePanel state={imageState} recordId={selectedRow.id} recordName={selectedRow.name ?? "当前记录"} disabled={!canEdit} /><h4>来源记录</h4>{detail ? detail.sources.length ? detail.sources.slice(0, 3).map((source, index) => <div className="cs-source" key={index}><M1Icon name="file" /><div><strong>{source.fileName}</strong><p>工作表：{source.sheetName}</p><p>来源行：{source.rowNumbers.join('、')}</p></div></div>) : <p>由系统项目建立</p> : <p>正在读取来源…</p>}<h4>关联项目</h4>{detail?.projects.length ? detail.projects.map(project => <Link className="cs-project-link" key={project.id} href={`/projects/${encodeURIComponent(project.id)}`}>{project.name}<M1Icon name="next" /></Link>) : <p>暂无已确认关联</p>}<button className="m1-button cs-detail-more" onClick={() => void openDetails()} disabled={dirty || saving}><M1Icon name="file" />查看业务详情与历史</button><p className="cs-detail-note">名称、基地、正式编号和状态由原业务流程维护。标准更正不会授予量产许可。</p></aside> : null}
    </div>
    <details className="cs-source-browser"><summary>历史来源工作簿与核对</summary><SourceWorkbook /></details>
    {fullDetail && selected ? <RegisterDetails id={selected} onClose={() => { setFullDetail(false); if (!dirty) reload(); }} /> : null}
    {importOpen && model.current ? <ColorImageSheetImport rows={[...model.current.rows.values()]} images={imageState.images} paintTypes={paintTypes} manufacturers={manufacturers} onClose={() => setImportOpen(false)} onSaved={async () => { await load(AbortSignal.timeout(30000)); await imageState.reload(); }} /> : null}
  </section>;
}
