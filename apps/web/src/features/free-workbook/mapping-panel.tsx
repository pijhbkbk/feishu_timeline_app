'use client';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { listActivities, type Activity } from '../inspections/client';
import { layerLabels } from '../inspections/model';
import { readCatalog } from '../color-register/sheet-client';
import { prepareBusinessMapping, type BusinessMappingDefinition, type BusinessMappingSource, type BusinessMappingTarget } from './business-mapping';
import { BusinessApplySession, BusinessApplyFailure, scopedBusinessApplyTransport, retryBusinessApplyCheckpoint, assertPreparedBusinessSource, prepareMappedBusiness, type BusinessApplyPreview, type BusinessApplyReceipt } from './business-apply';
import { loadMappingContext, mappingColumns, type MappingContext } from './mapping-context';
import { readBusinessApplyJournal, writeBusinessApplyJournal, clearBusinessApplyJournal, cancelPreparedBusinessApplyJournal, type BusinessApplyCheckpoint, type BusinessApplyPersistence } from './business-apply-journal';
import { exportMappingEvidence } from './mapping-evidence';
import './mapping-panel.css';

export type MappingSource = BusinessMappingSource;
export interface BusinessMappingPanelProps {
  actorId: string;
  /** Must commit the cell editor/IME before capturing the current full snapshot. */
  getSource: () => Promise<MappingSource>;
  onClose: () => void;
  onApplied: (receipts: readonly BusinessApplyReceipt[]) => void | Promise<void>;
}
const labels = { color: '颜色清单', person: '人员档案', inspection: '检验事实', production: '月度产量' };
const message = (cause: unknown) => cause instanceof Error ? cause.message : '读取或应用失败，请重试。';
function initialTarget(kind: BusinessMappingTarget['kind']): BusinessMappingTarget {
  return kind === 'production' ? { kind, baseId: null, colorId: null } : kind === 'inspection' ? { kind, activityId: '', layer: 'occurrence', objectId: null, colorId: null, occurrenceId: null, measurementId: null, standardVersionId: null } : { kind };
}
function initialDefinition(source: MappingSource, sheetId: string, target: BusinessMappingTarget): BusinessMappingDefinition {
  const sheet = source.snapshot.sheets[sheetId]!;
  let lastRow = 1, lastColumn = 0;
  for (const [row, cells] of Object.entries(sheet.cellData ?? {})) { if (Number.isSafeInteger(Number(row))) lastRow = Math.max(lastRow, Number(row)); for (const column of Object.keys(cells ?? {})) if (Number.isSafeInteger(Number(column))) lastColumn = Math.max(lastColumn, Number(column)); }
  return { target, sheetId, headerRow: 0, range: { startRow: 1, endRow: Math.max(1, Math.min((sheet.rowCount ?? 2) - 1, 2000, lastRow)), startColumn: 0, endColumn: Math.min((sheet.columnCount ?? 1) - 1, 99, lastColumn) }, fields: [], clearFields: [] };
}
function columnLabel(value: number) { let result = ''; for (let n = value + 1; n > 0; n = Math.floor((n - 1) / 26)) result = String.fromCharCode(65 + (n - 1) % 26) + result; return result; }
const statusLabel = { create: '新增', update: '修改', unchanged: '未变化', error: '错误' };
export function MappingPlanTable({ preview, page, setPage }: { preview: BusinessApplyPreview; page: number; setPage: (page: number) => void }) {
  const total = Math.max(1, Math.ceil(preview.plans.length / 100));
  const columns = new Map(mappingColumns(preview.mapping.definition.target).map(column => [column.key, column.label]));
  return <><p>{Object.entries(statusLabel).map(([status, label]) => `${label} ${preview.plans.filter(plan => plan.status === status).length}`).join(' · ')} · 空白来源行跳过 {preview.mapping.counts.skippedBlankRows}</p>
    <div className="wb-map-table"><table><thead><tr><th>来源行（不是 ID）</th><th>动作</th><th>稳定 ID / 版本</th><th>映射字段与值</th><th>实际变更或错误</th></tr></thead><tbody>{preview.plans.slice((page - 1) * 100, page * 100).map(plan => {
      const values = Object.entries(plan.input.values).filter(([key, value]) => value !== null && value !== '' || preview.mapping.definition.clearFields.includes(key));
      return <tr key={plan.input.clientId}><td>{plan.input.row}</td><td>{statusLabel[plan.status]}</td><td>{plan.input.id ? `${plan.input.id} / v${plan.input.revision}` : '由正式新增命令生成'}</td><td><details open={values.length <= 3}><summary>核对 {values.length} 项映射值</summary><dl>{values.map(([key, value]) => <React.Fragment key={key}><dt>{columns.get(key) ?? key}</dt><dd>{value === null || value === '' ? '明确清空' : value}</dd></React.Fragment>)}</dl></details></td><td>{plan.message || '无变更'}</td></tr>;
    })}</tbody></table></div>
    {!preview.plans.length ? <p>所选区域没有可应用的业务值。</p> : null}<nav aria-label="映射预览分页"><button type="button" className="m1-button" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</button><span>第 {page} / {total} 页 · 共 {preview.plans.length} 行</span><button type="button" className="m1-button" disabled={page >= total} onClick={() => setPage(page + 1)}>下一页</button></nav></>;
}

function ActorBusinessMappingPanel({ actorId, getSource, onClose, onApplied }: BusinessMappingPanelProps) {
  const sourceGetter = useRef(getSource); sourceGetter.current = getSource;
  const [source, setSource] = useState<MappingSource | null>(null), [definition, setDefinition] = useState<BusinessMappingDefinition | null>(null);
  const [context, setContext] = useState<MappingContext | null>(null), [catalog, setCatalog] = useState<Awaited<ReturnType<typeof readCatalog>> | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]), [activityPage, setActivityPage] = useState(1), [activityTotal, setActivityTotal] = useState(0);
  const [reason, setReason] = useState(''), [error, setError] = useState(''), [loading, setLoading] = useState(true), [scopeLoading, setScopeLoading] = useState(false), [scopeError, setScopeError] = useState('');
  const [preview, setPreviewState] = useState<BusinessApplyPreview | null>(null), [page, setPage] = useState(1), [busy, setBusy] = useState(false), [version, setVersion] = useState(0), [sourceRetry, setSourceRetry] = useState(0), [scopeRetry, setScopeRetry] = useState(0);
  const session = useRef<BusinessApplySession | null>(null), mounted = useRef(true), working = useRef(false);
  const scopeGeneration = useRef(0), owner = useRef({ actorId, workbookId: source?.workbookId });
  owner.current = { actorId, workbookId: source?.workbookId };
  const capturedPreview = useRef<{ preview: BusinessApplyPreview; actorId: string; workbookId: string; generation: number } | null>(null);
  const setPreview = (value: BusinessApplyPreview | null) => {
    capturedPreview.current = value ? { preview: value, actorId, workbookId: value.mapping.binding.workbookId, generation: scopeGeneration.current } : null;
    setPreviewState(value);
  };
  const scopedTransport = () => {
    const generation = scopeGeneration.current, workbookId = source?.workbookId;
    return scopedBusinessApplyTransport(() => mounted.current && generation === scopeGeneration.current && owner.current.actorId === actorId && !!workbookId && owner.current.workbookId === workbookId);
  };
  const [restored, setRestored] = useState<BusinessApplyCheckpoint | null>(null); const journalRevision = useRef<number | null>(null);
  const [loadedActor, setLoadedActor] = useState<string | null>(null);
  const persistence = (): BusinessApplyPersistence => ({ actorId, persist: async checkpoint => { journalRevision.current = await writeBusinessApplyJournal(checkpoint, journalRevision.current); } });
  const target = definition?.target;
  const locked = busy || !!session.current?.pending || restored?.phase === 'prepared' || restored?.phase === 'awaiting-receipt';
  const applied = session.current?.receipts ?? restored?.receipts ?? [];
  const started = applied.length > 0 || locked || restored !== null;
  useLayoutEffect(() => { scopeGeneration.current++; mounted.current = true; return () => { mounted.current = false; scopeGeneration.current++; }; }, [actorId, sourceRetry]);
  useEffect(() => { let cancelled = false; setLoading(true); setError(''); setLoadedActor(null); setSource(null); setDefinition(null); setRestored(null); session.current = null; journalRevision.current = null;
    void sourceGetter.current().then(async value => { const saved = await readBusinessApplyJournal(actorId, value.workbookId); if (!cancelled) { journalRevision.current = saved?.revision ?? null; setRestored(saved?.checkpoint ?? null); setSource(value); setLoadedActor(actorId); setDefinition(initialDefinition(value, value.snapshot.sheetOrder[0]!, { kind: 'person' })); } }).catch(cause => { if (!cancelled) setError(message(cause)); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sourceRetry, actorId]);
  useEffect(() => { if (!target || restored) return; const controller = new AbortController(); const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]); setScopeLoading(true); setScopeError(''); setContext(null);
    void (async () => {
      if (target.kind === 'production') {
        const choices = await readCatalog(signal); if (choices.totalPages > 40 || choices.items.length !== choices.total) throw new Error('颜色范围超过本次读取上限，请在产量业务页维护。');
        if (!controller.signal.aborted) setCatalog(choices);
        if (!target.baseId || !target.colorId) return;
      }
      if (target.kind === 'inspection') {
        const result = await listActivities('', activityPage, undefined, signal);
        if (!controller.signal.aborted) { setActivities(result.items); setActivityTotal(result.total); }
        if (!target.activityId) return;
      }
      const value = await loadMappingContext(target, signal); if (!controller.signal.aborted) setContext(value);
    })().catch(cause => { if (!controller.signal.aborted) setScopeError(message(cause)); }).finally(() => { if (!controller.signal.aborted) setScopeLoading(false); });
    return () => controller.abort();
  }, [target, activityPage, scopeRetry, restored]);
  useEffect(() => { if (!locked) return; const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; }; window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard); }, [locked]);
  const change = (value: BusinessMappingDefinition) => { if (started) return; setDefinition(value); setPreview(null); session.current = null; setError(''); };
  const updateTarget = (value: BusinessMappingTarget) => { if (definition) change({ ...definition, target: value }); };
  const refreshPreview = async () => {
    if (!definition || working.current || started) return; working.current = true; setBusy(true); setError(''); setPreview(null); session.current = null;
    const generation = scopeGeneration.current;
    try {
      const currentContext = await loadMappingContext(definition.target, AbortSignal.timeout(30000));
      const current = await sourceGetter.current();
      const mapping = await prepareBusinessMapping(current, definition, mappingColumns(definition.target));
      const result = prepareMappedBusiness(mapping, currentContext, reason);
      if (mounted.current && generation === scopeGeneration.current && owner.current.actorId === actorId) { setSource(current); setContext(currentContext); setPreview(result); setPage(1); }
    } catch (cause) { if (mounted.current) setError(message(cause)); } finally { working.current = false; if (mounted.current) setBusy(false); }
  };
  const downloadEvidence = async () => {
    const captured = capturedPreview.current;
    if (!captured || captured.preview !== preview || working.current) return;
    const isCurrent = () => mounted.current && capturedPreview.current === captured && scopeGeneration.current === captured.generation && owner.current.actorId === captured.actorId && owner.current.workbookId === captured.workbookId;
    working.current = true; setBusy(true); setError('');
    try {
      const bytes = await exportMappingEvidence(captured.preview, captured, isCurrent);
      if (!isCurrent()) return;
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }));
      try {
        const link = document.createElement('a'); link.href = url;
        link.download = `mapping-${captured.workbookId}-v${captured.preview.mapping.binding.formalRevision}.zip`;
        link.click();
      } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
    } catch (cause) { if (isCurrent()) setError(message(cause)); }
    finally { working.current = false; if (mounted.current) setBusy(false); }
  };
  const apply = async () => {
    if (!preview || working.current) return; working.current = true; setBusy(true); setError('');
    const transport = scopedTransport();
    try {
      const current = session.current ?? new BusinessApplySession(preview, persistence()); session.current = current;
      if (current.pending) await current.retryPending(transport, () => sourceGetter.current());
      else {
        const liveContext = await loadMappingContext(preview.mapping.definition.target, AbortSignal.timeout(30000));
        const liveSource = await sourceGetter.current();
        await current.applyNext(liveSource, liveContext, transport, () => sourceGetter.current());
      }
      if (mounted.current) { setVersion(n => n + 1); if (!current.remaining) await onApplied(current.receipts); }
    } catch (cause) { if (mounted.current) setError(message(cause)); } finally { working.current = false; if (mounted.current) { setBusy(false); setVersion(n => n + 1); } }
  };
  const resetPreview = async () => {
    if (locked || working.current || !source) return; working.current = true; setBusy(true);
    try { if (journalRevision.current !== null) await clearBusinessApplyJournal(actorId, source.workbookId, journalRevision.current); journalRevision.current = null; session.current = null; setRestored(null); setPreview(null); setError(''); setVersion(n => n + 1); }
    catch (cause) { setError(message(cause)); } finally { working.current = false; setBusy(false); }
  };
  const recover = async () => {
    if (!restored || working.current) return; working.current = true; setBusy(true); setError('');
    const transport = scopedTransport();
    try { const saved = await retryBusinessApplyCheckpoint(restored, persistence(), transport, restored.phase === 'prepared' ? () => assertPreparedBusinessSource(restored, () => sourceGetter.current()) : undefined); if (mounted.current) { setRestored(saved); await onApplied(saved.receipts); } }
    catch (cause) { if (mounted.current) { if (cause instanceof BusinessApplyFailure) setRestored(cause.checkpoint); setError(message(cause)); } }
    finally { working.current = false; if (mounted.current) setBusy(false); }
  };
  const cancelUnsent = async () => {
    if (!source || busy || session.current?.uncertain || restored?.phase === 'awaiting-receipt') return;
    working.current = true; setBusy(true);
    try { if (journalRevision.current !== null) await cancelPreparedBusinessApplyJournal(actorId, source.workbookId, journalRevision.current); journalRevision.current = null; session.current = null; setRestored(null); setPreview(null); setError('未发送请求已取消；已确认的业务事实保持不变。'); }
    catch (cause) { setError(message(cause)); } finally { working.current = false; setBusy(false); }
  };
  const inspection = context?.kind === 'inspection' ? context : null;
  return <div className="wb-map-backdrop"><section className="wb-map-panel" role="dialog" aria-modal="true" aria-label="工作簿映射到业务" data-version={version}>
    <header><div><h2>工作簿映射到业务</h2><p>先选择明确范围与字段，再核对新增、修改及错误。工作簿保存与业务应用分别进行。</p></div><button type="button" className="m1-button" disabled={locked} onClick={onClose}>返回工作簿</button></header>
    <p>行号仅标记来源。已有记录须映射 ID 与版本；没有 ID 只走对应正式新增命令。图片保留在原工作簿，须在业务图片入口另行绑定。</p>
    {loading ? <p role="status">正在读取工作簿来源…</p> : null}{error ? <p role="alert">{error}</p> : null}
    {!source && !loading ? <button type="button" className="m1-button" onClick={() => setSourceRetry(n => n + 1)}>重新读取来源</button> : null}
    {loadedActor === actorId && restored ? <section aria-label="恢复业务请求"><h3>此账号在本工作簿有已保存的业务请求</h3>
      <p>状态：{restored.phase === 'prepared' ? '已保存但尚未确认发送' : restored.phase === 'awaiting-receipt' ? '原请求结果未知' : restored.phase === 'confirmed' ? '原批次已确认' : '原请求明确被拒绝'}。目标：{labels[restored.target.kind]} · 原正式版本 {restored.binding.formalRevision}。不会按当前表格重算或自动提交。</p>
      {restored.request ? <><p>待核实操作 ID：{restored.request.operationId} · {restored.request.plans.length} 条原输入。恢复只核实这一批，后续内容必须重新映射。</p><details><summary>核对原请求业务值</summary><ul>{restored.request.plans.map(plan => <li key={plan.input.clientId}>来源第 {plan.input.row} 行 · {plan.input.id ?? '正式新增'}：{Object.entries(plan.input.values).map(([key, value]) => `${key}=${value ?? '空'}`).join('；')}</li>)}</ul></details></> : null}
      {restored.receipts.length ? <details open><summary>已持久保存 {restored.receipts.length} 条回执</summary><ul>{restored.receipts.map(row => <li key={row.clientId}>来源第 {row.sourceRow} 行 → {row.id} · v{row.revision}</li>)}</ul></details> : null}
      {restored.request ? <button type="button" className="m1-button m1-primary" disabled={busy} onClick={() => void recover()}>明确恢复并核实原请求</button> : <button type="button" className="m1-button" disabled={busy} onClick={() => void resetPreview()}>已核对回执，结束旧应用并重新映射</button>}
    </section> : null}
    {loadedActor === actorId && (restored?.phase === 'prepared' || session.current?.pending && !session.current.uncertain) ? <button type="button" className="m1-button" disabled={busy} onClick={() => void cancelUnsent()}>取消尚未发送的请求</button> : null}
    {loadedActor === actorId && !restored && source && definition && target ? <>
      <p>来源：{source.snapshot.name} · 正式版本 {source.formalRevision} · 本次读取内容包含当前编辑值，应用不会替代工作簿保存。</p>
      <fieldset disabled={busy || started}><legend>1. 目标业务与关联范围</legend>
        <label>目标业务<select value={target.kind} onChange={event => { setActivityPage(1); const next = initialTarget(event.target.value as BusinessMappingTarget['kind']); change({ ...definition, target: next, fields: [], clearFields: [] }); }}>
          {Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        {target.kind === 'color' ? <><p>这里只按稳定 ID 更正已有颜色记录；无 ID 的颜色须先创建正式项目。</p><a href="/projects/new" target="_blank" rel="noreferrer">打开新建颜色项目</a><label>标准字段更正原因<textarea maxLength={1000} value={reason} onChange={event => { setReason(event.target.value); setPreview(null); }} /></label></> : null}
        {target.kind === 'person' ? <p>新增独立人员档案，不创建账号或授予资格；账号、资格和历史来源只读。</p> : null}
        {target.kind === 'production' ? <><label>生产基地<select value={target.baseId ?? ''} onChange={event => updateTarget({ ...target, baseId: event.target.value || null, colorId: null })}><option value="">请选择基地</option>{catalog?.facets.bases.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
          <label>颜色<select value={target.colorId ?? ''} onChange={event => updateTarget({ ...target, colorId: event.target.value || null })}><option value="">请选择准确颜色</option>{catalog?.items.filter(row => row.base?.id === target.baseId).map(row => <option key={row.id} value={row.id}>{row.name ?? '未命名'} · {row.formalCode ?? '编号未填'} · {row.id}</option>)}</select></label><p>只维护此颜色的产量事实；新增行须明确 MODEL_DETAIL（车型明细）或 MONTH_TOTAL（月度总量），车型明细须填写车型原文。数量空白为未知，0 为确认零产量。明细与总量并存时，请到产量统计页明确选择唯一计数口径；本次映射不会自动选择。</p></> : null}
        {target.kind === 'inspection' ? <><label>检验活动<select value={target.activityId} onChange={event => updateTarget({ ...initialTarget('inspection') as Extract<BusinessMappingTarget, { kind: 'inspection' }>, activityId: event.target.value })}><option value="">请选择真实活动</option>{target.activityId && !activities.some(row => row.id === target.activityId) ? <option value={target.activityId}>已选活动 {target.activityId}</option> : null}{activities.map(row => <option key={row.id} value={row.id}>{row.activityDate.slice(0, 10)} · {row.productionBase.name} · {row.batchLabel ?? '未填批次'} · {row.id}</option>)}</select></label>
          <nav aria-label="活动选项分页"><button type="button" className="m1-button" disabled={activityPage === 1 || scopeLoading} onClick={() => setActivityPage(n => n - 1)}>上一页活动</button><span>第 {activityPage} 页</span><button type="button" className="m1-button" disabled={activityPage * 25 >= activityTotal || scopeLoading} onClick={() => setActivityPage(n => n + 1)}>下一页活动</button></nav>
          <label>事实层级<select value={target.layer} onChange={event => change({ ...definition, fields: [], clearFields: [], target: { ...target, layer: event.target.value as typeof target.layer, objectId: null, colorId: null, occurrenceId: null, measurementId: null, standardVersionId: null } })}>{Object.entries(layerLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          {inspection ? <><p>当前活动基地：{inspection.snapshot.activity.productionBase.name} · 项目：{inspection.snapshot.activity.projectId ?? '未绑定项目'} · 版本 {inspection.snapshot.activity.revision}。人员在活动页绑定；本面板不推进评审。</p>
            {target.layer === 'occurrence' ? <><label>默认车辆或样件<select value={target.objectId ?? ''} onChange={event => updateTarget({ ...target, objectId: event.target.value || null })}><option value="">逐行提供对象 ID</option>{inspection.bindings.objects.map(row => <option key={row.id} value={row.id}>{row.objectCode} · {row.id}</option>)}</select></label><label>默认颜色<select value={target.colorId ?? ''} onChange={event => updateTarget({ ...target, colorId: event.target.value || null })}><option value="">逐行提供颜色 ID</option>{inspection.bindings.colors.map(row => <option key={row.id} value={row.id}>{row.name} · {row.id}</option>)}</select></label></> : <>
              <label>默认检验台次<select value={target.occurrenceId ?? ''} onChange={event => updateTarget({ ...target, occurrenceId: event.target.value || null, measurementId: null, standardVersionId: null })}><option value="">逐行提供台次 ID</option>{inspection.snapshot.occurrences.map(row => <option key={row.id} value={row.id}>{row.object.objectCode} · {row.color.name} · {row.id}</option>)}</select></label>
              {target.layer === 'measurement' ? <label>标准版本<select value={target.standardVersionId ?? ''} onChange={event => updateTarget({ ...target, standardVersionId: event.target.value || null })}><option value="">未提供标准时保留待核对</option>{inspection.bindings.standards.map(row => <option key={row.id} value={row.id}>{row.boardCode ?? '色板未填'} · v{row.versionNo} · {row.id}</option>)}</select></label> : <label>默认测量组<select value={target.measurementId ?? ''} onChange={event => updateTarget({ ...target, measurementId: event.target.value || null })}><option value="">{target.layer === 'defect' ? '缺陷只属于台次，或逐行提供测量组 ID' : '逐行提供测量组 ID'}</option>{inspection.snapshot.measurements.filter(row => !target.occurrenceId || row.occurrenceId === target.occurrenceId).map(row => <option key={row.id} value={row.id}>{row.pointLabel} / {row.groupLabel} · {row.id}</option>)}</select></label>}
            </>}
          </> : null}</> : null}
      </fieldset>
      {scopeLoading ? <p role="status">正在读取真实业务范围…</p> : scopeError ? <p role="alert">{scopeError}<button type="button" className="m1-button" disabled={started} onClick={() => setScopeRetry(n => n + 1)}>重读范围</button></p> : null}
      <fieldset disabled={busy || started}><legend>2. 工作表、表头、数据区域与字段</legend>
        <label>来源工作表<select value={definition.sheetId} onChange={event => change(initialDefinition(source, event.target.value, target))}>{source.snapshot.sheetOrder.map(id => <option key={id} value={id}>{source.snapshot.sheets[id]?.name}</option>)}</select></label>
        <div className="wb-map-grid"><label>表头行（从 1 开始）<input type="number" min={1} max={10000} value={definition.headerRow + 1} onChange={event => change({ ...definition, headerRow: Number(event.target.value) - 1 })} /></label>
          {(['startRow', 'endRow', 'startColumn', 'endColumn'] as const).map(key => <label key={key}>{{ startRow: '数据起始行', endRow: '数据结束行', startColumn: '数据起始列（A=1）', endColumn: '数据结束列（A=1）' }[key]}<input type="number" min={1} max={key.includes('Column') ? 256 : 10000} value={definition.range[key] + 1} onChange={event => change({ ...definition, range: { ...definition.range, [key]: Number(event.target.value) - 1 } })} /></label>)}</div>
        <p>最多 2000 行、100 列。空白默认不更正；勾选“空白明确清空”才传递清空意图。公式须先转为明确值。</p>
        <div className="wb-map-fields">{Array.from({ length: Math.max(0, Math.min(100, definition.range.endColumn - definition.range.startColumn + 1)) }, (_, offset) => definition.range.startColumn + offset).map(column => {
          const field = definition.fields.find(item => item.column === column)?.field ?? '';
          const cell = source.snapshot.sheets[definition.sheetId]?.cellData?.[definition.headerRow]?.[column]; const header = cell?.f ? '公式表头须先处理' : String(cell?.v ?? '').slice(0, 100);
          return <div key={column}><label>{columnLabel(column)} 列 · {header || '空表头'}<select value={field} onChange={event => { const next = event.target.value; change({ ...definition, fields: [...definition.fields.filter(item => item.column !== column), ...(next ? [{ column, field: next }] : [])], clearFields: definition.clearFields.filter(key => key !== field) }); }}><option value="">不映射</option><option value="__id">稳定记录 ID（不是行号）</option><option value="__revision">记录版本</option>{mappingColumns(target).filter(item => item.key !== 'photos').map(item => <option key={item.key} value={item.key}>{item.label} · {item.key}</option>)}</select></label>
            {field && !field.startsWith('__') ? <label><input type="checkbox" checked={definition.clearFields.includes(field)} onChange={event => change({ ...definition, clearFields: event.target.checked ? [...definition.clearFields, field] : definition.clearFields.filter(key => key !== field) })} />空白明确清空</label> : null}</div>;
        })}</div>
      </fieldset>
      <div className="wb-map-actions"><button type="button" className="m1-button" disabled={busy || started || scopeLoading || !context || !definition.fields.length} onClick={() => void refreshPreview()}>读取当前内容并预览</button>{preview && !locked ? <button type="button" className="m1-button" onClick={() => void resetPreview()}>结束本次预览并重新映射</button> : null}</div>
      {preview ? <section aria-label="业务映射预览"><h3>3. 核对并应用业务记录</h3><MappingPlanTable preview={preview} page={page} setPage={setPage} />
        <button type="button" className="m1-button" disabled={busy} onClick={() => void downloadEvidence()}>下载本次映射依据</button>
        <p>包含本次捕获的工作簿原文、映射选择与全部预览行，供离线核对；下载不会保存工作簿或提交业务记录。</p>
        <p>每批最多 50 条，每批前重新读取业务版本和当前工作簿。变更来源、排序或映射后必须重新预览。已确认批次不会回滚或重复应用。</p>
        {applied.length ? <details open><summary>已确认 {applied.length} 条业务记录</summary><ul>{applied.map(row => <li key={row.clientId}>来源第 {row.sourceRow} 行 → {row.id} · v{row.revision}</li>)}</ul></details> : null}
        <button type="button" className="m1-button m1-primary" disabled={busy || preview.plans.some(plan => plan.status === 'error') || !preview.plans.some(plan => plan.status === 'create' || plan.status === 'update') || !!session.current?.failed || !!session.current && !session.current.remaining} onClick={() => void apply()}>{busy ? '正在核对并提交…' : session.current?.pending ? '核实并重试原请求' : applied.length ? session.current?.remaining ? `应用下一批（剩余 ${session.current.remaining} 条）` : '本次业务记录已全部确认' : '明确应用第一批业务记录'}</button>
        <p>业务应用不会自动改写工作簿、回填 ID 或保存工作簿。请保留上方回执，后续更正需使用实际业务 ID 和新版本。</p>
      </section> : null}
    </> : null}
  </section></div>;
}

/** A different account always gets a new component state; previous actor records are not shown. */
export function BusinessMappingPanel(props: BusinessMappingPanelProps) { return <ActorBusinessMappingPanel key={props.actorId} {...props} />; }
