'use client';
import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { StandardCorrection } from './standard-correction';
import { fetchRegisterDetail, type RegisterDetail, type RegisterJson, type RegisterSource, type RegisterStandardVersion } from './client';
import { productionStatusLabel, registerStatusLabel } from './clipboard';
export function RegisterDetails({ id, onClose }: { id: string; onClose: () => void }) {
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
