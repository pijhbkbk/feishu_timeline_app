'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { apiRequest, isApprovedTeamUser } from '../../lib/auth-client';
import { useAuth } from '../../components/auth-provider';

export type AnnualReview = {
  colorId: string; colorName: string; baseId: string | null; revision: number; registerMonth: string | null;
  window: { fromMonth: string; toMonth: string; reviewMonth: string; monthCount: number; months: string[] } | null;
  months: Array<{ month: string; factId: string | null; revision: number | null; quantity: string | null }>;
  quantity: string | null; decision: 'RETAIN' | 'EXIT_REVIEW_REQUIRED' | null; threshold: number;
  scopeLabel: string; canRecord: boolean; issue: string | null; snapshotHash: string;
  history: Array<{ id: string; createdAt: string; actorName: string | null; snapshot: { window?: AnnualReview['window']; quantity?: string | null; decision?: AnnualReview['decision']; note?: string } }>;
  historyHasMore: boolean; projects: Array<{ id: string; name: string }>; projectsHasMore: boolean;
};

export function AnnualReviewPanel({ colorId, onSaved, onDirtyChange, onBusyChange, onReturnToRecord, returnDisabled, saveDisabled, onUseExitBasis }: { colorId: string; onSaved?: () => void; onDirtyChange?: (dirty: boolean) => void; onBusyChange?: (busy: boolean) => void; onReturnToRecord?: () => void; returnDisabled?: boolean; saveDisabled?: boolean; onUseExitBasis?: (basis: { statisticYear: string; annualOutput: string; finalDecision: 'RETAIN' | '' }) => void }) {
  const { user } = useAuth();
  const [data, setData] = useState<AnnualReview | null>(null), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [note, setNote] = useState('');
  const controller = useRef<AbortController | null>(null), alive = useRef(true);
  const command = useRef<{ signature: string; operationId: string } | null>(null);
  const load = useCallback(async () => {
    controller.current?.abort(); const next = new AbortController(); controller.current = next;
    const timer = setTimeout(() => next.abort(), 15000);
    setLoading(true); setError('');
    try { const result = await apiRequest<AnnualReview>(`/color-register/${encodeURIComponent(colorId)}/annual-review`, { signal: next.signal }); if (alive.current && controller.current === next) setData(result); }
    catch (cause) { if (alive.current && controller.current === next) setError(cause instanceof Error ? cause.message : '年度复核读取失败，请重试。'); }
    finally { clearTimeout(timer); if (alive.current && controller.current === next) setLoading(false); }
  }, [colorId]);
  useEffect(() => { alive.current = true; void load(); return () => { alive.current = false; controller.current?.abort(); }; }, [load]);
  useEffect(() => { onDirtyChange?.(Boolean(note.trim())); }, [note, onDirtyChange]);
  async function save() {
    if (!data || saving || saveDisabled || !data.canRecord) return;
    const input = { expectedRevision: data.revision, expectedSnapshot: data.snapshotHash, note: note.trim() };
    const signature = JSON.stringify(input);
    if (command.current?.signature !== signature) command.current = { signature, operationId: crypto.randomUUID() };
    setSaving(true); onBusyChange?.(true); setError(''); setNotice('');
    try {
      await apiRequest(`/color-register/${encodeURIComponent(colorId)}/annual-review`, { method: 'POST', body: { ...input, operationId: command.current.operationId }, signal: AbortSignal.timeout(30000) });
      if (!alive.current) return;
      setNote(''); command.current = null; setNotice('复核已保存；历史记录保留，未自动执行颜色退出。');
      await load(); onSaved?.();
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : '复核保存未确认；可重试同一操作。'); }
    finally { if (alive.current) { setSaving(false); onBusyChange?.(false); } }
  }
  return <section className="cr-detail-section" aria-labelledby={`annual-review-${colorId}`}>
    <h2 id={`annual-review-${colorId}`}>{data?.colorName ? `${data.colorName} · ` : ''}首次年度复核</h2>
    <p>从入清单月份到次年同月，首尾都计入，共 13 个自然月；次月复核。累计 20 台及以上继续保留，低于 20 台须按原流程完成退出评审。</p>
    {loading ? <p role="status">正在读取年度统计…</p> : null}
    {error ? <div role="alert" className="m1-error"><p>{error}</p><button type="button" className="m1-button" disabled={saving || loading} onClick={() => void load()}>重新读取年度统计</button></div> : null}
    {notice ? <p role="status">{notice}</p> : null}
    {data ? <>
      <AnnualReviewSummary data={data} />
      <p><Link href="/production">维护月度实际产量</Link> · <AnnualRecordLink colorId={colorId} {...(onReturnToRecord ? { onReturn: onReturnToRecord } : {})} disabled={saving || Boolean(returnDisabled)} /></p>
      {data.decision === 'EXIT_REVIEW_REQUIRED' ? <p>该统计只形成复核记录，不修改颜色状态。{data.projects.length ? data.projects.map(project => <React.Fragment key={project.id}> <Link href={`/projects/${encodeURIComponent(project.id)}/color-exit`}>查看 {project.name} 的退出评审</Link></React.Fragment>) : '未关联可用项目，请先核对原开发记录；此处不能直接退出。'}</p> : null}
      {isApprovedTeamUser(user) ? <form onSubmit={event => { event.preventDefault(); void save(); }}>
        <label className="field"><span>复核说明</span><textarea required maxLength={1000} rows={3} disabled={saving} value={note} onChange={event => setNote(event.target.value)} /></label>
        <button className="m1-button m1-button-primary" type="submit" disabled={saving || saveDisabled || loading || Boolean(error) || !data.canRecord || !note.trim()}>{saving ? '正在保存复核…' : '保存复核记录'}</button>
      </form> : null}
      {onUseExitBasis && data.canRecord && data.history[0]?.snapshot.window && data.history[0].snapshot.quantity !== null && data.history[0].snapshot.quantity !== undefined ? <button type="button" className="m1-button" disabled={saving || loading} onClick={() => { const saved = data.history[0]!.snapshot; onUseExitBasis({ statisticYear: saved.window!.reviewMonth.slice(0, 4), annualOutput: saved.quantity!, finalDecision: saved.decision === 'RETAIN' ? 'RETAIN' : '' }); }}>将已保存复核依据填入下方表单</button> : null}
      <h3>复核历史</h3>
      {data.history.length ? <ul>{data.history.map(item => <li key={item.id}>{item.createdAt.slice(0, 10)} · {item.actorName ?? '历史操作人'} · {item.snapshot.window?.fromMonth ?? '—'} 至 {item.snapshot.window?.toMonth ?? '—'} · {item.snapshot.quantity ?? '待核对'} 台 · {reviewDecisionLabel(item.snapshot.decision ?? null)}<p>{item.snapshot.note}</p></li>)}</ul> : <p>尚未保存首次年度复核记录。</p>}
      {data.historyHasMore ? <p>显示最近 20 条；更早复核事实仍保存在审计历史。</p> : null}
    </> : null}
  </section>;
}

export function AnnualRecordLink({ colorId, onReturn, disabled }: { colorId: string; onReturn?: () => void; disabled?: boolean }) {
  if (onReturn) return <button type="button" className="m1-button" disabled={disabled} onClick={onReturn}>返回该颜色清单记录</button>;
  return <Link href={`/admin/color-database?view=records&colorId=${encodeURIComponent(colorId)}`}>返回该颜色清单记录</Link>;
}

export function reviewDecisionLabel(value: AnnualReview['decision']) { return value === 'RETAIN' ? '继续保留' : value === 'EXIT_REVIEW_REQUIRED' ? '低于20台，待退出评审' : '待核对'; }

export function AnnualReviewSummary({ data }: { data: AnnualReview }) {
  return <>
    <dl className="cr-detail-summary"><div><dt>入清单月份</dt><dd>{data.registerMonth ?? '未记录'}</dd></div><div><dt>复核月份</dt><dd>{data.window?.reviewMonth ?? '待明确入清单月份'}</dd></div><div><dt>统计范围</dt><dd>{data.window ? `${data.window.fromMonth} 至 ${data.window.toMonth}（首尾计入，13个月）` : '待核对'}</dd></div><div><dt>累计产量</dt><dd>{data.quantity === null ? '待核对' : `${data.quantity} 台`}</dd></div><div><dt>复核建议</dt><dd>{reviewDecisionLabel(data.decision)}</dd></div></dl>
    <p>{data.scopeLabel}。原表对账和项目批次数量不叠加；没有记录的月份不按 0 台计算。</p>
    {data.issue ? <p role="status">{data.issue}</p> : null}
    {data.months.length ? <div className="cr-table-scroll"><table className="cr-measurements"><caption>13 个月份逐月核对</caption><thead><tr><th>月份</th><th>月度实际总量</th></tr></thead><tbody>{data.months.map(item => <tr key={item.month}><th>{item.month}</th><td>{!item.factId ? '缺少记录' : item.quantity === null ? '数量未记录' : `${item.quantity} 台`}</td></tr>)}</tbody></table></div> : null}
  </>;
}
