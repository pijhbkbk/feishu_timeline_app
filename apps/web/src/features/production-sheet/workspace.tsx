'use client';
import Link from 'next/link';
import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../components/auth-provider';
import { apiRequest, isApprovedTeamUser } from '../../lib/auth-client';
import { BusinessSheetCanvas } from '../business-sheet/canvas';
import { RecordSheetWorkspace } from '../business-sheet/record-sheet-workspace';
import { RecordForm } from '../business-sheet/record-form';
import { useProjectUnsavedChanges } from '../m1/use-unsaved';
const RecordImportDialog = lazy(() => import('../business-sheet/record-import').then(module => ({ default: module.RecordImportDialog })));
import { SheetImagePanel } from '../business-sheet/image-panel';
import { useSheetImages } from '../business-sheet/use-images';
import type { BusinessSheetRuntime } from '../business-sheet/runtime';
import type { RecordSheetPatch, RecordSheetRow, RecordWorkspaceContext } from '../business-sheet/record-sheet-types';
import { readCatalog } from '../color-register/sheet-client';
import { fetchRegisterDetail, type RegisterDetail, type RegisterRow } from '../color-register/client';
import { applyProductionImports, createProductionFact, emptyProductionFilters, finalizeProductionImports, prepareProductionImport, PRODUCTION_COLUMNS, PRODUCTION_IMPORT_COLUMNS, productionQuery, productionRow, readProductionFacts, readProductionSources, readProductionStatistics, saveProductionFacts, validateProduction, type ProductionFact, type ProductionFilters, type ProductionSources, type ProductionStatistics } from './production-adapter';
import '../color-register/sheet-workspace.css';
import './production-sheet.css';

const explain = (error: unknown) => error instanceof Error ? error.message : '读取失败，请重试。';
function factName(fact: ProductionFact) { return `${fact.month} · ${fact.baseName} · ${fact.colorName ?? fact.colorCode}`; }
function contextBlocked(context: RecordWorkspaceContext<ProductionFact> | null) { return Boolean(context && (context.loading || context.dirtyCount || ['saving', 'uncertain', 'conflict'].includes(context.status))); }

export function ProductionSheetWorkspace() {
  const { user } = useAuth(), canEdit = isApprovedTeamUser(user);
  const runtimeRef = useRef<BusinessSheetRuntime | null>(null), contextRef = useRef<RecordWorkspaceContext<ProductionFact> | null>(null);
  const mounted = useRef(true), statsAbort = useRef<AbortController | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; statsAbort.current?.abort(); }; }, []);
  const filtersRef = useRef<ProductionFilters>(emptyProductionFilters), statsSequence = useRef(0);
  const [filters, setFilters] = useState(emptyProductionFilters), [draftFilters, setDraftFilters] = useState(emptyProductionFilters);
  filtersRef.current = filters;
  const [facts, setFacts] = useState<RecordSheetRow<ProductionFact>[]>([]), [total, setTotal] = useState(0), [hasMore, setHasMore] = useState(false), [sourceCount, setSourceCount] = useState(0);
  const [statistics, setStatistics] = useState<ProductionStatistics | null>(null), [statsError, setStatsError] = useState('');
  const [colors, setColors] = useState<RegisterRow[]>([]), [bases, setBases] = useState<Array<{ id: string; name: string }>>([]), [catalogHasMore, setCatalogHasMore] = useState(false), [catalogError, setCatalogError] = useState('');
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [selected, setSelected] = useState<RecordSheetRow<ProductionFact> | null>(null);
  const [createOpen, setCreateOpen] = useState(false), [importOpen, setImportOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null), fileOwner = useRef<string | null>(null);
  const recordIds = useMemo(() => facts.map(row => row.id), [facts]);
  const imageState = useSheetImages('SHEET_PRODUCTION', recordIds);
  const imageStateRef = useRef(imageState); imageStateRef.current = imageState;
  const [catalogEpoch, setCatalogEpoch] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setCatalogError('');
    void readCatalog(controller.signal).then(result => { if (!controller.signal.aborted) { setColors(result.items); setBases(result.facets.bases); setCatalogHasMore(result.total > result.items.length); } }).catch(cause => { if (!controller.signal.aborted) setCatalogError(explain(cause)); });
    return () => controller.abort();
  }, [catalogEpoch]);
  const refreshStatistics = useCallback(async () => {
    const sequence = ++statsSequence.current; statsAbort.current?.abort(); const controller = new AbortController(); statsAbort.current = controller;
    try { const value = await readProductionStatistics(filtersRef.current, controller.signal); if (mounted.current && !controller.signal.aborted && sequence === statsSequence.current) { setStatistics(value); setStatsError(''); } }
    catch (cause) { if (mounted.current && !controller.signal.aborted && sequence === statsSequence.current) setStatsError(`数量已由业务服务处理，但统计暂未更新：${explain(cause)}`); }
  }, []);
  const load = useCallback(async (signal: AbortSignal) => {
    const sequence = ++statsSequence.current;
    const [result, stats] = await Promise.all([readProductionFacts(filters, signal), readProductionStatistics(filters, signal)]);
    if (signal.aborted) return [];
    if (sequence === statsSequence.current) { setStatistics(stats); setStatsError(''); }
    setTotal(result.total); setHasMore(result.hasMore); setSourceCount(result.reconciliationFactCount);
    return result.items.map(fact => productionRow(fact, canEdit));
  }, [filters, canEdit]);
  const save = useCallback(async (patches: RecordSheetPatch[], operationId: string) => {
    const rows = await saveProductionFacts(patches, operationId, canEdit);
    // A statistics read failure never turns a confirmed business save into a retry.
    if (!mounted.current) return rows;
    setFacts(previous => { const updated = new Map(rows.map(row => [row.id, row])); return previous.map(row => updated.get(row.id) ?? row); });
    void refreshStatistics(); return rows;
  }, [canEdit, refreshStatistics]);
  const rowsLoaded = useCallback((rows: readonly RecordSheetRow<ProductionFact>[]) => setFacts([...rows]), []);
  async function applyFilters() {
    try { await runtimeRef.current?.finishEditing(); } catch (cause) { setError(explain(cause)); return; }
    if (contextBlocked(contextRef.current) || imageState.pending) { setError('请先等待保存完成或处理待保存内容，再切换数据范围。'); return; }
    try { productionQuery(draftFilters); setFilters({ ...draftFilters }); setError(''); setNotice(''); }
    catch (cause) { setError(explain(cause)); }
  }
  async function openAction(kind: 'create' | 'import') {
    await runtimeRef.current?.finishEditing();
    if (!canEdit) { setError('当前账号不能维护产量。'); return; }
    if (contextBlocked(contextRef.current) || imageState.pending) { setError('请先处理当前待保存文字或照片，再新增或导入。'); return; }
    setError(''); if (kind === 'create') setCreateOpen(true); else setImportOpen(true);
  }
  const addImages = async (files: File[], recordId: string) => { try { if (!canEdit) throw new Error('当前账号不能添加产量照片。'); await imageStateRef.current.add(files, recordId); } catch (cause) { setError(explain(cause)); } };
  const factMap = useMemo(() => new Map(facts.flatMap(row => row.meta ? [[row.id, row.meta] as const] : [])), [facts]);
  const baseNames = useMemo(() => new Map(bases.map(base => [base.id, base.name])), [bases]);
  const filterColors = useMemo(() => colors.filter(color => !draftFilters.baseId || color.base?.id === draftFilters.baseId), [colors, draftFilters.baseId]);
  const imageActions = {
    add: (files: File[], recordId: string) => { void addImages(files, recordId); },
    change: imageState.change, remove: imageState.remove,
    requestFiles: () => { if (!canEdit || !selected) { setError('请先选择可维护的月度记录。'); return; } fileOwner.current = selected.id; fileInput.current?.click(); },
  };
  return <div className="production-sheet-page">
    <nav className="m1-breadcrumb"><Link href="/dashboard">工作台</Link><span>月度产量</span><Link href="/analytics">项目统计</Link></nav>
    <p className="production-scope-note">每条记录维护一个颜色、基地、月份的全车型实际总量。将 10 更正为 8 会更新原记录；空白表示未知，0 表示已确认零产量。来源对账和项目已完成批次分别查看。</p>
    <div className="production-query"><label>生产基地<select aria-label="产量基地" value={draftFilters.baseId} onChange={event => setDraftFilters(value => ({ ...value, baseId: event.target.value, colorId: '' }))}><option value="">全部基地</option>{bases.map(base => <option key={base.id} value={base.id}>{base.name}</option>)}</select></label><label>颜色<select aria-label="产量颜色" value={draftFilters.colorId} onChange={event => setDraftFilters(value => ({ ...value, colorId: event.target.value }))}><option value="">全部颜色</option>{filterColors.map(color => <option key={color.id} value={color.id}>{color.name ?? '未命名'} · {color.base?.name ?? '基地待核对'} · {color.formalCode ?? color.boardCode ?? color.id.slice(0, 8)}</option>)}</select></label><label>开始月份<input aria-label="开始月份" type="month" value={draftFilters.fromMonth} onChange={event => setDraftFilters(value => ({ ...value, fromMonth: event.target.value }))} /></label><label>结束月份<input aria-label="结束月份" type="month" value={draftFilters.toMonth} onChange={event => setDraftFilters(value => ({ ...value, toMonth: event.target.value }))} /></label><button className="m1-button" onClick={() => void applyFilters()}>应用范围</button></div>
    {catalogError ? <p role="alert" className="m1-error">颜色选项读取失败：{catalogError}<button onClick={() => setCatalogEpoch(value => value + 1)}>重读颜色选项</button></p> : null}
    {catalogHasMore ? <p>颜色选择当前提供已载入的 2000 条；未列出的颜色请先在颜色清单核对其稳定 ID。不会按同名自动关联。</p> : null}
    {error ? <p role="alert" className="m1-error">{error}</p> : null}{notice ? <p role="status" className="m1-notice">{notice}</p> : null}
    <section className="production-statistics" aria-label="月度实际产量统计"><h2>月度实际总量 · 当前范围全部匹配记录</h2>{statistics ? <><div className="production-stat-cards"><div><span>记录数</span><strong>{statistics.factCount}</strong></div><div><span>已录入记录</span><strong>{statistics.factCount - statistics.unknownCount}</strong></div><div><span>未知数量记录</span><strong>{statistics.unknownCount}</strong></div><div><span>已知实际数量</span><strong>{statistics.knownQuantity} 台</strong></div><div><span>完整总量</span><strong>{statistics.quantity === null ? '待补全' : `${statistics.quantity} 台`}</strong></div></div><p>统计由服务器对全部匹配月度事实汇总；表格内文字搜索和排序只影响当前已载入记录。未知数量不按 0 填充。</p><details><summary>按基地查看</summary><div className="cr-table-scroll"><table className="cr-measurements"><thead><tr><th>基地</th><th>记录数</th><th>未知数量记录</th><th>已知台数</th><th>完整总量</th></tr></thead><tbody>{statistics.byBase.map(base => <tr key={base.baseId}><td>{baseNames.get(base.baseId) ?? '基地资料待读取'}</td><td>{base.factCount}</td><td>{base.unknownCount}</td><td>{base.knownQuantity}</td><td>{base.quantity ?? '待补全'}</td></tr>)}</tbody></table></div>{statistics.byBaseHasMore ? <p>基地统计超过 200 项，请使用基地筛选进一步查看。</p> : null}</details></> : <p role="status">正在读取服务器统计…</p>}{statsError ? <p role="alert" className="m1-error">{statsError}<button onClick={() => void refreshStatistics()}>重读统计</button></p> : null}</section>
    {hasMore ? <p className="m1-notice">表格载入前 {facts.length} 条，共 {total} 条。缩小基地、月份或颜色范围后可维护其他记录；上方统计覆盖全部匹配记录。</p> : null}
    <input ref={fileInput} className="cr-sr-only" type="file" accept="image/png,image/jpeg" multiple aria-label="选择产量记录照片" onChange={event => { const files = Array.from(event.target.files ?? []), owner = fileOwner.current; event.target.value = ''; if (files.length && owner) void addImages(files, owner); }} />
    <RecordSheetWorkspace title="月度产量清单" columns={PRODUCTION_COLUMNS} Canvas={BusinessSheetCanvas} load={load} save={save} validate={validateProduction} runtimeRef={runtimeRef} onRowsLoaded={rowsLoaded} onSelection={setSelected}
      canvasProps={{ images: imageState.images, imageActions }}
      onCreate={canEdit ? () => openAction('create') : undefined} onImport={canEdit ? () => openAction('import') : undefined}
      onExport={async rows => { const { exportRecordWorkbook, downloadWorkbook } = await import('../business-sheet/record-exchange'); const bytes = await exportRecordWorkbook('月度产量', 'production', PRODUCTION_COLUMNS, rows, imageState.images); downloadWorkbook(bytes, '月度产量-含图片.xlsx'); setNotice('已导出当前表格范围的服务器记录与已保存图片；待保存编辑未导出。'); }}
      slots={{ header: context => { contextRef.current = context; return <ProductionGuard context={context} extraPending={imageState.pending || createOpen || importOpen} />; }, detail: context => context.selected?.meta ? <ProductionDetail row={context.selected} imageState={imageState} canEdit={canEdit} /> : <p>选择记录查看详情与照片。</p> }} />
    <ProductionReconciliation filters={filters} total={sourceCount} />
    <section className="production-legacy"><h2>项目统计与已完成量产批次</h2><p>项目数量、流程完成批次和本页的月度实际台数是不同指标。选中一条月度记录后，右侧可查看该颜色的旧项目已完成批次及实际台数。</p><Link className="m1-button" href="/analytics">查看既有项目统计</Link></section>
    {createOpen ? <CreateMonthlyProduction colors={colors} bases={bases} initial={filters} onClose={() => setCreateOpen(false)} onSaved={async fact => { setNotice(`服务器已确认 ${factName(fact)} 的月度总量。`); const next = { baseId: fact.baseId, colorId: fact.colorId, fromMonth: fact.month, toMonth: fact.month }; setDraftFilters(next); if (JSON.stringify(filters) === JSON.stringify(next)) await contextRef.current?.refresh(); else setFilters(next); }} /> : null}
    {importOpen ? <Suspense fallback={<p role="status">正在加载 Excel 导入…</p>}><RecordImportDialog title="月度产量" module="production" columns={PRODUCTION_IMPORT_COLUMNS} rows={facts} images={imageState.images} imageTarget="SHEET_PRODUCTION"
      prepare={(input, clears) => prepareProductionImport(input, clears, { facts: factMap, colors, chosenBaseId: filters.baseId, chosenColorId: filters.colorId })} apply={applyProductionImports} finalizePlans={finalizeProductionImports}
      onSaved={async () => { await contextRef.current?.refresh(); await imageState.reload(); await refreshStatistics(); }} onClose={() => setImportOpen(false)} /></Suspense> : null}
  </div>;
}

function CreateMonthlyProduction({ colors, bases, initial, onClose, onSaved }: { colors: RegisterRow[]; bases: Array<{ id: string; name: string }>; initial: ProductionFilters; onClose(): void; onSaved(fact: ProductionFact): Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null), clientId = useRef(crypto.randomUUID());
  const [baseId, setBaseId] = useState(initial.baseId), [colorId, setColorId] = useState(initial.colorId), [step, setStep] = useState<'identity' | 'values'>('identity');
  const options = useMemo(() => colors.filter(color => color.base?.id === baseId), [colors, baseId]);
  const color = options.find(value => value.id === colorId);
  useEffect(() => { if (step === 'identity') dialog.current?.showModal(); }, [step]);
  if (step === 'values' && color) return <RecordForm title={`新增月度总量 · ${color.base?.name} · ${color.name ?? '未命名颜色'}`} fields={[{ key: 'month', label: '业务月份', type: 'month', required: true, initial: initial.fromMonth && initial.fromMonth === initial.toMonth ? initial.fromMonth : '' }, { key: 'quantity', label: '实际台数（空白未知，0 表示已确认零产量）', type: 'text', maxLength: 10 }]}
    submit={async (values, operationId) => { const fact = await createProductionFact({ clientId: clientId.current, baseId, colorId: color.id, month: values.month ?? '', quantity: values.quantity ?? null }, operationId); await onSaved(fact); }} onClose={onClose} />;
  return <dialog ref={dialog} className="m1-modal cr-dialog" aria-label="选择月度产量归属" onCancel={onClose}><header><h2>选择产量归属</h2><button className="m1-button" onClick={onClose}>关闭</button></header><p>选择真实基地与具体颜色后，再填写月份和全车型总量。同名颜色不会合并。</p><div className="sheet-form-fields"><label>生产基地<select aria-label="新记录基地" value={baseId} onChange={event => { setBaseId(event.target.value); setColorId(''); }}><option value="">请选择基地</option>{bases.map(base => <option key={base.id} value={base.id}>{base.name}</option>)}</select></label><label>颜色<select aria-label="新记录颜色" disabled={!baseId} value={colorId} onChange={event => setColorId(event.target.value)}><option value="">请选择颜色</option>{options.map(option => <option key={option.id} value={option.id}>{option.name ?? '未命名'} · {option.boardCode ?? '无色板编号'} · {option.formalCode ?? option.id.slice(0, 8)}</option>)}</select></label></div>{baseId && !options.length ? <p>该基地没有已读取的颜色。请先在颜色清单核对基地归属。</p> : null}<footer className="cr-dialog-actions"><button className="m1-button m1-primary" disabled={!color} onClick={() => setStep('values')}>填写月份与数量</button></footer></dialog>;
}

function ProductionDetail({ row, imageState, canEdit }: { row: RecordSheetRow<ProductionFact>; imageState: ReturnType<typeof useSheetImages>; canEdit: boolean }) {
  const fact = row.meta!;
  const [saved, setSaved] = useState<ProductionFact | null>(null), [error, setError] = useState('');
  useEffect(() => { const controller = new AbortController(); setSaved(null); setError(''); void apiRequest<ProductionFact>(`/production-facts/${encodeURIComponent(row.id)}`, { signal: controller.signal }).then(value => { if (!controller.signal.aborted) setSaved(value); }).catch(cause => { if (!controller.signal.aborted) setError(explain(cause)); }); return () => controller.abort(); }, [row.id, row.revision]);
  return <><h2>产量记录详情</h2><h3>{fact.colorName ?? fact.colorCode}</h3><dl><div><dt>生产基地</dt><dd>{fact.baseName}</dd></div><div><dt>业务月份</dt><dd>{fact.month}</dd></div><div><dt>服务器实际总量</dt><dd>{saved ? saved.quantity === null ? '未知' : `${saved.quantity} 台` : error ? '读取失败' : '正在读取…'}</dd></div><div><dt>当前输入</dt><dd>{row.values.quantity === null ? '未知' : `${row.values.quantity} 台`}</dd></div><div><dt>统计口径</dt><dd>{fact.metricScopeLabel}</dd></div></dl>{error ? <p className="m1-error" role="alert">{error}</p> : null}
    <SheetImagePanel state={imageState} recordId={row.id} recordName={factName(fact)} disabled={!canEdit || !fact.editable} />
    <p><Link href={`/colors?colorId=${encodeURIComponent(fact.colorId)}`}>查看该颜色的业务详情</Link></p><LegacyColorProduction colorId={fact.colorId} />
  </>;
}
function LegacyColorProduction({ colorId }: { colorId: string }) {
  const [data, setData] = useState<RegisterDetail['systemProduction'] | null>(null), [error, setError] = useState('');
  useEffect(() => { const controller = new AbortController(); setData(null); setError(''); const timer = window.setTimeout(() => { void fetchRegisterDetail(colorId, 1, controller.signal).then(value => { if (!controller.signal.aborted) setData(value.systemProduction); }).catch(cause => { if (!controller.signal.aborted) setError(explain(cause)); }); }, 100); return () => { clearTimeout(timer); controller.abort(); }; }, [colorId]);
  return <section><h4>该颜色的旧项目已完成量产批次</h4><p>按生产日期月份统计已完成批次；与月度总量分开查看。</p>{error ? <p role="alert">{error}</p> : !data ? <p>正在读取项目批次…</p> : <>{data.items.length ? <div className="cr-table-scroll"><table className="cr-measurements"><thead><tr><th>月份</th><th>完成批次</th><th>实际台数</th></tr></thead><tbody>{data.items.map(item => <tr key={item.month}><td>{item.month}</td><td>{item.recordCount}</td><td>{item.unknownQuantityCount ? `待补全（${item.unknownQuantityCount} 批未知）` : item.quantity ?? '未知'}</td></tr>)}</tbody></table></div> : <p>没有该颜色的已完成量产批次。</p>}{data.undatedRecordCount ? <p>{data.undatedRecordCount} 个批次缺少生产日期，未推算月份。</p> : null}{data.hasMore ? <p>当前展示最近 120 个月份，其余批次保留在项目中。</p> : null}</>}</section>;
}
function ProductionReconciliation({ filters, total }: { filters: ProductionFilters; total: number }) {
  const [open, setOpen] = useState(false), [page, setPage] = useState(1), [data, setData] = useState<ProductionSources | null>(null), [error, setError] = useState('');
  useEffect(() => setPage(1), [filters]);
  useEffect(() => { if (!open) return; const controller = new AbortController(); setData(null); setError(''); void readProductionSources(filters, page, controller.signal).then(value => { if (!controller.signal.aborted) setData(value); }).catch(cause => { if (!controller.signal.aborted) setError(explain(cause)); }); return () => controller.abort(); }, [open, filters, page]);
  return <details className="production-reconciliation" onToggle={event => setOpen(event.currentTarget.open)}><summary>原始来源对账 · {total} 条 · 只读</summary><p>原始资料保留各自统计口径，不加入本页月度总量，也不与项目完成批次相加。</p>{error ? <p role="alert">{error}</p> : !data ? <p role="status">正在读取来源…</p> : <><div className="cr-table-scroll"><table className="cr-measurements"><thead><tr><th>月份</th><th>基地</th><th>颜色</th><th>原口径</th><th>原数量</th><th>来源</th></tr></thead><tbody>{data.items.map(item => <tr key={item.id}><td>{item.month}</td><td>{item.baseName}</td><td>{item.colorName ?? item.colorCode}</td><td>{item.metricScopeLabel}</td><td>{item.quantity ?? '未知'}</td><td>{item.source ? `${item.source.batch.fileName} / ${item.source.sheetName} / 第 ${item.source.rowNumber} 行` : '既有来源事实'}{item.sourceCell ? ` / ${item.sourceCell}` : ''}</td></tr>)}</tbody></table></div>{!data.items.length ? <p>当前范围没有来源对账记录。</p> : null}<div className="cs-tools"><button disabled={page <= 1} onClick={() => setPage(value => value - 1)}>上一页</button><span>{page} / {Math.max(1, Math.ceil(data.total / data.pageSize))}</span><button disabled={page * data.pageSize >= data.total} onClick={() => setPage(value => value + 1)}>下一页</button></div></>}</details>;
}

function ProductionGuard({ context, extraPending }: { context: RecordWorkspaceContext<ProductionFact>; extraPending: boolean }) {
  useProjectUnsavedChanges(Boolean(context.dirtyCount || ['saving', 'uncertain'].includes(context.status) || extraPending));
  return <p>实际总量支持直接编辑和批量粘贴，300 毫秒后自动保存。颜色、基地、月份与口径为只读；照片状态单独显示。</p>;
}
