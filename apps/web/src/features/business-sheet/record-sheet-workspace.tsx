'use client';
import { useProjectUnsavedChanges } from '../m1/use-unsaved';
import '../color-register/sheet-workspace.css';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RecordSheetModel } from './record-sheet-model';
import { RecordSheetSaveQueue, type RecordSaveSnapshot } from './record-sheet-save-queue';
import type { RecordCanvasRow, RecordSheetChange, RecordSheetRuntime, RecordSheetWorkspaceProps, RecordWorkspaceContext } from './record-sheet-types';
const explain = (error: unknown) => error instanceof Error ? error.message : '操作失败，输入已保留。';
const statusText = { idle: '已同步', pending: '待保存', saving: '保存中…', saved: '已保存', invalid: '输入需处理', failed: '保存失败', uncertain: '保存结果待核实', conflict: '版本冲突' } as const;

/** Shared behavior only. Domain adapters own labels, dictionaries, APIs and
 * explicit workflow/create/import/image actions. Keep load and Canvas identities
 * stable with useCallback / module-level components. */
export function RecordSheetWorkspace<TMeta = unknown, TImages = unknown>(props: RecordSheetWorkspaceProps<TMeta, TImages>) {
  const current = useRef(props); current.current = props;
  const internalRuntime = useRef<RecordSheetRuntime | null>(null), runtimeRef = props.runtimeRef ?? internalRuntime;
  const model = useRef<RecordSheetModel<TMeta> | null>(null), saver = useRef<RecordSheetSaveQueue<TMeta> | null>(null);
  const mounted = useRef(false), loadAbort = useRef<AbortController | null>(null);
  const selectedRef = useRef<string | null>(null), composing = useRef(false);
  const [selectedId, setSelectedId] = useState<string | null>(null), [activeField, setActiveField] = useState(props.columns[0]?.key ?? '');
  const [viewEpoch, setViewEpoch] = useState(0), [tick, setTick] = useState(0), [loading, setLoading] = useState(true), [engineReady, setEngineReady] = useState(false);
  const externalActive = useRef(false);
  const [externalPending, setExternalPending] = useState('');
  const [error, setError] = useState(''), [query, setQuery] = useState(''), [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ field: string; descending: boolean } | null>(null);
  const [saveState, setSaveState] = useState<RecordSaveSnapshot>({ status: 'idle', message: '', confirmed: 0, pending: 0 });
  useProjectUnsavedChanges(Boolean(model.current?.dirtyCount || saver.current?.busy || saver.current?.uncertain));
  const bump = useCallback(() => { if (mounted.current) setTick(value => value + 1); }, []);
  const columns = useMemo(() => props.columns.map(column => ({ ...column })), [props.columns]);

  const loadLatest = useCallback(async () => {
    loadAbort.current?.abort(); const controller = new AbortController(); loadAbort.current = controller;
    if (mounted.current) setLoading(true);
    try {
      const rows = await current.current.load(controller.signal);
      if (controller.signal.aborted || !mounted.current) return;
      if (model.current) model.current.latest(rows);
      else model.current = new RecordSheetModel(rows, (row, field, value) => current.current.validate?.(row, field, value));
      current.current.onRowsLoaded?.(rows);
      setViewEpoch(value => value + 1); setError(''); bump();
    } finally { if (!controller.signal.aborted && mounted.current) setLoading(false); }
  }, [bump]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; loadAbort.current?.abort(); saver.current?.dispose(); saver.current = null; };
  }, []);
  useEffect(() => {
    let stopped = false;
    // A changed load identity denotes an explicit adapter scope change. Adapters
    // must check context dirty/status before changing that identity or unmounting.
    void (async () => {
      if (saver.current?.uncertain) throw new Error('请先核实上次保存结果，再切换数据范围。');
      await saver.current?.suspend();
      await loadLatest();
      if (stopped || !mounted.current || !model.current) return;
      if (!saver.current) saver.current = new RecordSheetSaveQueue(model.current, {
        delayMs: current.current.autosaveMs ?? 300,
        save: (items, operationId) => current.current.save(items, operationId),
        onState: state => { if (mounted.current) { setSaveState(state); bump(); } },
        onConfirmed: (updates, rows) => { runtimeRef.current?.updateValues(updates); current.current.onRowsLoaded?.(rows); bump(); },
        onConflict: loadLatest,
      });
      saver.current.resume();
    })().catch(cause => { if (!stopped && mounted.current) setError(explain(cause)); });
    return () => { stopped = true; loadAbort.current?.abort(); };
  }, [props.load, loadLatest, runtimeRef, bump]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (model.current?.dirtyCount || saver.current?.busy || saver.current?.uncertain) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload); return () => window.removeEventListener('beforeunload', beforeUnload);
  }, []);

  // Normal edits and selection only bump the small status/detail UI. They do not
  // rebuild this row projection or recreate the Canvas's Univer instance.
  const visibleIds = useMemo(() => {
    const rows = [...model.current?.rows.values() ?? []], term = search.trim().toLocaleLowerCase();
    const visible = term ? rows.filter(row => (current.current.searchText?.(row) ?? Object.values(row.values).join(' ')).toLocaleLowerCase().includes(term)) : rows;
    if (sort) visible.sort((a, b) => (String(a.values[sort.field] ?? '').localeCompare(String(b.values[sort.field] ?? ''), 'zh-CN', { numeric: true }) || a.id.localeCompare(b.id)) * (sort.descending ? -1 : 1));
    return visible.map(row => row.id);
  }, [viewEpoch, search, sort]);
  const visibleSet = useMemo(() => new Set(visibleIds), [visibleIds]);
  const canvasRows = useMemo<RecordCanvasRow[]>(() => visibleIds.map(id => { const row = model.current!.display(id)!; return { id, values: columns.map(column => row.values[column.key] ?? null), editable: columns.map(column => row.editable.includes(column.key)) }; }), [visibleIds, columns]);
  useEffect(() => {
    if (selectedRef.current && visibleSet.has(selectedRef.current)) return;
    const id = visibleIds[0] ?? null; selectedRef.current = id; setSelectedId(id);
    if (id) runtimeRef.current?.selectCell(id, activeField);
  }, [visibleIds, visibleSet, activeField, runtimeRef]);
  const selected = selectedId ? model.current?.display(selectedId) ?? null : null;
  useEffect(() => { current.current.onSelection?.(selected); }, [selected]);

  const edit = (changes: RecordSheetChange[]) => {
    if (!model.current || loading) return;
    try {
      const applied = model.current.apply(current.current.normalizeChanges?.(changes, model.current.rows) ?? changes); runtimeRef.current?.updateValues(applied); setError(''); bump();
      if (!composing.current) saver.current?.changed();
    } catch (cause) {
      // Native canvas may already show the rejected value. Restore only these
      // cells to the actual local draft; no whole-workbook snapshot is restored.
      runtimeRef.current?.updateValues(changes.map(change => ({ ...change, value: model.current?.value(change.id, change.field) ?? null })));
      setError(explain(cause));
    }
  };
  const history = async (direction: 'undo' | 'redo') => {
    try { await runtimeRef.current?.finishEditing(); const changes = model.current?.[direction]() ?? []; runtimeRef.current?.updateValues(changes); saver.current?.changed(); bump(); }
    catch (cause) { setError(explain(cause)); }
  };
  const retry = async () => { try { await runtimeRef.current?.finishEditing(); await saver.current?.retry(); } catch (cause) { setError(explain(cause)); } };
  const refresh = async () => {
    try {
      await runtimeRef.current?.finishEditing(); await saver.current?.suspend();
      if (saver.current?.uncertain) throw new Error('请先核实上次保存结果；刷新不会放弃未确认请求。');
      await loadLatest(); saver.current?.resume();
    } catch (cause) { setError(explain(cause)); }
  };
  const changeView = async (update: () => void) => { try { await runtimeRef.current?.finishEditing(); update(); } catch (cause) { setError(explain(cause)); } };
  const externalAction = async (action: () => unknown, pendingLabel: string) => {
    if (externalActive.current) return;
    externalActive.current = true; setExternalPending(pendingLabel);
    try {
      await runtimeRef.current?.finishEditing();
      await saver.current?.flush();
      if (model.current?.dirtyCount || saver.current?.busy || saver.current?.uncertain) throw new Error('请先处理或保存当前修改，再执行此操作。');
      await action();
    } catch (cause) { setError(explain(cause)); }
    finally { externalActive.current = false; if (mounted.current) setExternalPending(''); }
  };
  const context: RecordWorkspaceContext<TMeta> = { selected, runtimeRef, status: saveState.status, dirtyCount: model.current?.dirtyCount ?? 0, loading, refresh, retry, edit };
  const errors = model.current?.errors() ?? [], conflicts = model.current?.conflicts() ?? [];
  const Canvas = props.Canvas;
  void tick;
  return <section className="cs-workspace record-sheet-workspace" aria-label={props.title}>
    <header className="cs-heading"><h1>{props.title}</h1><div className="cs-actions"><span role="status">{statusText[saveState.status]}{context.dirtyCount ? ` · ${context.dirtyCount} 条` : ''}</span>
      {props.onImport ? <button className="m1-button" disabled={loading || !!externalPending} onClick={() => void externalAction(() => props.onImport?.(context), '正在准备导入…')}>导入 Excel</button> : null}
      {props.onExport ? <button className="m1-button" disabled={loading || !!externalPending || !visibleIds.length} onClick={() => void externalAction(() => props.onExport?.(visibleIds.map(id => model.current!.rows.get(id)!), context), '正在导出文字与图片，请稍候…')}>导出 Excel</button> : null}
      {props.onCreate ? <button className="m1-button m1-primary" disabled={loading || !!externalPending} onClick={() => void externalAction(() => props.onCreate?.(context), '正在准备新增记录…')}>新增记录</button> : null}
    </div></header>
    {externalPending ? <p role="status">{externalPending}</p> : null}
    {props.slots?.header?.(context)}
    <div className="cs-filters"><label>搜索<input type="search" value={query} maxLength={100} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={event => { composing.current = false; const value = event.currentTarget.value; void changeView(() => setSearch(value)); }} onChange={event => { const value = event.target.value; setQuery(value); if (!composing.current) void changeView(() => setSearch(value)); }} /></label>
      <label>整行排序<select aria-label="排序字段" value={sort?.field ?? ''} onChange={event => { const value = event.target.value; void changeView(() => setSort(value ? { field: value, descending: false } : null)); }}><option value="">默认顺序</option>{columns.map(column => <option key={column.key} value={column.key}>{column.label}</option>)}</select></label>
      {sort ? <button className="m1-button" onClick={() => void changeView(() => setSort(value => value ? { ...value, descending: !value.descending } : null))}>{sort.descending ? '降序' : '升序'}</button> : null}
      <button className="m1-button" disabled={loading || saver.current?.busy} onClick={() => void refresh()}>刷新</button><span>{visibleIds.length} 条 · 当前已载入范围</span>
    </div>
    {error ? <p role="alert" className="m1-error">{error}</p> : null}
    {saveState.message ? <div role="alert" className="m1-error">{saveState.message}{['failed', 'uncertain'].includes(saveState.status) ? <button className="m1-button" onClick={() => void retry()}>{saveState.status === 'uncertain' ? '核实上次保存' : '重试保存'}</button> : null}</div> : null}
    {errors.length ? <div className="m1-error" role="alert">{errors.slice(0, 10).map(issue => <p key={`${issue.id}:${issue.field}`}>{issue.message}<button onClick={() => runtimeRef.current?.selectCell(issue.id, issue.field)}>定位</button></p>)}{errors.length > 10 ? <p>另有 {errors.length - 10} 项需处理。</p> : null}</div> : null}
    {conflicts.length ? <div className="cs-conflicts"><h2>核对记录版本</h2>{conflicts.map(conflict => <div key={conflict.id}><strong>{model.current?.display(conflict.id)?.values.name ?? '当前记录'}</strong>{conflict.fields.map(field => <p key={field.field}>{columns.find(column => column.key === field.field)?.label ?? field.field}：服务器「{field.server ?? '空'}」；本次输入「{field.desired ?? '空'}」</p>)}<button className="m1-button" onClick={() => { model.current?.resolve(conflict.id, false); setViewEpoch(value => value + 1); saver.current?.resume(); bump(); }}>采用服务器值</button>{!conflict.missing ? <button className="m1-button" onClick={() => { model.current?.resolve(conflict.id, true); saver.current?.resume(); bump(); }}>保留输入并重新保存</button> : <p>记录已不可读取，可复制输入后放弃草稿。</p>}</div>)}</div> : null}
    <div className="cs-tools"><button className="m1-button" disabled={!model.current?.undoStack.length || loading} onClick={() => history('undo')}>撤销</button><button className="m1-button" disabled={!model.current?.redoStack.length || loading} onClick={() => history('redo')}>重做</button>{props.slots?.toolbar?.(context)}</div>
    {selected ? <div className="cs-cell-editor"><label htmlFor="record-sheet-active">{columns.find(column => column.key === activeField)?.label ?? '当前单元格'}{selected.editable.includes(activeField) ? '' : ' · 只读'}</label><input id="record-sheet-active" aria-label="当前单元格" value={selected.values[activeField] ?? ''} readOnly={!selected.editable.includes(activeField) || loading} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; saver.current?.changed(); }} onChange={event => edit([{ id: selected.id, field: activeField, value: event.target.value === '' ? null : event.target.value }])} /></div> : null}
    <div className={`cs-content${props.slots?.detail ? ' with-detail' : ''}`}><div className="cs-sheet"><div className="cs-engine-wrap"><Canvas {...props.canvasProps} runtimeRef={runtimeRef} rows={canvasRows} columns={columns} label={`${props.title}在线表格`} onReady={value => { setEngineReady(value); current.current.onReady?.(value); }} selection={{ id: selectedId, field: activeField }} onChanges={edit} {...(props.normalizeChanges?{onBeforeChanges:(changes:readonly RecordSheetChange[])=>{if(model.current)current.current.normalizeChanges?.(changes,model.current.rows);}}:{})} onSelection={(id, _row, col) => { selectedRef.current = id; setSelectedId(id); setActiveField(columns[col]?.key ?? ''); }} onError={setError} onUndo={() => history('undo')} onRedo={() => history('redo')} />
      {loading || !engineReady ? <div className="cs-engine-loading" role="status">{loading ? '正在读取记录…' : '正在加载在线表格…'}</div> : !visibleIds.length ? <div className="cs-empty-overlay cs-state">{props.slots?.empty?.(context) ?? <p>没有符合条件的记录。</p>}</div> : null}
    </div></div>{props.slots?.detail ? <aside className="cs-detail">{props.slots.detail(context)}</aside> : null}</div>
    {props.images !== undefined ? props.renderImages?.(props.images, context) : null}
  </section>;
}
