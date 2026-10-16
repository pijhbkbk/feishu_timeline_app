'use client';
import React, { useEffect, useState } from 'react';
import { apiRequest } from '../../lib/auth-client';
type Cell = { coordinate: string; value: { type: string; value: unknown }; formula: { text: string } | null; cachedValue: { value: unknown } | null; blankKind: string | null; merge: unknown; numberFormat: string };
type SourceResult = { batches: Array<{ id: string; fileName: string; metadata: { sheetNames: string[] } }>; items: Array<{ id: string; sheetName: string; rowNumber: number; status: string; kind: string; rawCells: Cell[] }>; total: number; page: number; totalPages: number };
export function SourceWorkbook() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<SourceResult | null>(null);
  const [sheet, setSheet] = useState(''); const [batch, setBatch] = useState('');
  const [pendingOnly, setPendingOnly] = useState(false); const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController(); let active = true; const timer = setTimeout(() => controller.abort(), 15000);
    setLoading(true); setError('');
    const params = new URLSearchParams({ page: String(page), pageSize: '10', ...(sheet ? { sheetName: sheet } : {}), ...(batch ? { batchId: batch } : {}), ...(pendingOnly ? { status: 'PENDING_REVIEW' } : {}) });
    void apiRequest<SourceResult>(`/color-register/sources?${params}`, { signal: controller.signal }).then(value => { if (active) setData(value); }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : '来源读取失败。'); }).finally(() => { clearTimeout(timer); if (active) setLoading(false); });
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [open, sheet, batch, pendingOnly, page, refresh]);
  const selected = data?.batches.find(value => value.id === batch) ?? data?.batches[0];
  return <section className="m1-card cr-detail-section"><button className="m1-button" type="button" onClick={() => setOpen(!open)}>{open ? '收起来源核对' : '查看全部工作表与待核对记录'}</button>
    {open ? <><h2>来源核对</h2><p>包含表头、脚注、空行及尚未关联的记录。公式保留原式与原缓存值，未重新计算。</p>
      <div className="cr-filters"><label>来源文件<select value={batch || selected?.id || ''} onChange={event => { setBatch(event.target.value); setSheet(''); setPage(1); }}>{data?.batches.map(value => <option value={value.id} key={value.id}>{value.fileName}</option>)}</select></label><label>工作表<select value={sheet} onChange={event => { setSheet(event.target.value); setPage(1); }}><option value="">全部工作表</option>{selected?.metadata.sheetNames.map(name => <option key={name}>{name}</option>)}</select></label><label><input type="checkbox" checked={pendingOnly} onChange={event => { setPendingOnly(event.target.checked); setPage(1); }} />仅看待核对</label></div>
      {loading ? <p role="status">正在读取来源…</p> : error ? <p role="alert">{error}<button type="button" className="m1-button" onClick={() => setRefresh(value => value + 1)}>重试</button></p> : data ? <>
        <p>共 {data.total} 行 · 第 {data.page} / {data.totalPages} 页</p>
        {data.items.length ? data.items.map(source => <details className="cr-source" key={source.id}><summary>{source.sheetName} · 第 {source.rowNumber} 行 · {source.status === 'MAPPED' ? '已关联' : source.status === 'PRESERVED' ? '原样保留' : '待核对'}</summary><div className="cr-table-scroll"><table className="cr-measurements"><thead><tr><th>单元格</th><th>原值</th><th>原格式</th><th>公式与缓存</th><th>空值 / 合并信息</th></tr></thead><tbody>{source.rawCells.map(cell => <tr key={cell.coordinate}><th>{cell.coordinate}</th><td>{display(cell.value?.value)}</td><td>{cell.numberFormat}</td><td>{cell.formula ? <>{`=${cell.formula.text}`}<br />原缓存：{display(cell.cachedValue?.value)}</> : '—'}</td><td>{cell.blankKind ?? '—'}{cell.merge ? <details><summary>合并来源</summary><pre className="cr-json">{JSON.stringify(cell.merge, null, 2)}</pre></details> : null}</td></tr>)}</tbody></table></div></details>) : <p>没有符合条件的来源行。</p>}
        <div className="cr-pagination"><button type="button" className="m1-button" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页来源</button><button type="button" className="m1-button" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}>下一页来源</button></div>
      </> : null}</> : null}
  </section>;
}
function display(value: unknown) { return value === null || value === undefined ? '空值' : value === '' ? '空字符串' : typeof value === 'object' ? JSON.stringify(value) : String(value); }
