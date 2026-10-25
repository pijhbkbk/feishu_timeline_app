import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AnnualRecordLink, AnnualReviewSummary, type AnnualReview } from './annual-review';

const months = Array.from({ length: 13 }, (_, index) => {
  const date = new Date(Date.UTC(2026, 8 + index, 1));
  return { month: date.toISOString().slice(0, 7), factId: `fact-${index}`, revision: 1, quantity: index ? '0' : '20' };
});
const view: AnnualReview = { colorId: 'color-a', colorName: '合成蓝', baseId: 'base-a', revision: 1, registerMonth: '2026-09',
  window: { fromMonth: '2026-09', toMonth: '2027-09', reviewMonth: '2027-10', monthCount: 13, months: months.map(item => item.month) }, months,
  quantity: '20', decision: 'RETAIN', threshold: 20, scopeLabel: '月度实际总量（全车型，不分产线和班次）', canRecord: false, issue: '尚未到复核月份 2027-10。', snapshotHash: 'a'.repeat(64), history: [], historyHasMore: false, projects: [], projectsHasMore: false };
describe('annual review visible contract', () => {
  it('uses a guarded modal action and keeps the standalone record link', () => {
    expect(renderToStaticMarkup(<AnnualRecordLink colorId="color/a" />)).toContain('colorId=color%2Fa');
    const modal = renderToStaticMarkup(<AnnualRecordLink colorId="color/a" onReturn={() => undefined} disabled />);
    expect(modal).toContain('<button'); expect(modal).toContain('disabled'); expect(modal).not.toContain('href=');
  });
  it('shows both endpoints, 13 months, next-month review and exact-20 retention', () => {
    const html = renderToStaticMarkup(<AnnualReviewSummary data={view} />);
    for (const text of ['2026-09 至 2027-09', '首尾计入，13个月', '2027-10', '20 台', '继续保留']) expect(html).toContain(text);
    expect(html.match(/<tr>/g)).toHaveLength(14);
  });
  it('distinguishes a missing month and an explicit zero', () => {
    const html = renderToStaticMarkup(<AnnualReviewSummary data={{ ...view, quantity: null, decision: null, months: [{ ...months[0]!, factId: null, quantity: null }, months[1]!] }} />);
    expect(html).toContain('缺少记录'); expect(html).toContain('0 台'); expect(html).toContain('待核对');
    expect(html).not.toContain('<dd>0 台</dd>'); expect(html).not.toContain('继续保留');
  });
  it('names a below-20 decision as requiring review rather than having exited', () => {
    const html = renderToStaticMarkup(<AnnualReviewSummary data={{ ...view, quantity: '19', decision: 'EXIT_REVIEW_REQUIRED' }} />);
    expect(html).toContain('低于20台，待退出评审'); expect(html).not.toContain('已退出');
  });
});
