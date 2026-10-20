import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ExteriorRectificationPanel } from './exterior-rectification-panel';
import type { ExteriorRectificationSummary } from '../lib/consistency-reviews-client';
const pending: ExteriorRectificationSummary = { status: 'PENDING', taskId: 'task-14', sourceTaskId: 'old-14', taskVersion: '2026-10-20T00:00:00.000Z', requirement: '上轮外饰件色差不通过' };
describe('exterior rectification panel (static rendering only)', () => {
  it('shows supplier/date/summary, explicit completion and local cancel without another approval role', () => {
    const html = renderToStaticMarkup(<ExteriorRectificationPanel projectId="p1" correction={pending} disabled={false} onSaved={() => undefined} onError={() => undefined} />);
    for (const text of ['外饰件厂家', '整改完成日期', '整改说明', '登记整改完成，进入整车复审', '取消本次填写', '整改完成记录不代表整车评审通过', '上轮外饰件色差不通过']) expect(html).toContain(text);
    expect(html).not.toContain('审批人'); expect(html).toContain('maxLength="4000"');
  });
  it('shows completed immutable facts and no new completion form', () => {
    const html = renderToStaticMarkup(<ExteriorRectificationPanel projectId="p1" correction={{ ...pending, status: 'COMPLETED', supplierName: '合成厂家', completedOn: '2026-10-20', summary: '已完成调色' }} disabled={false} onSaved={() => undefined} onError={() => undefined} />);
    expect(html).toContain('已登记，待整车复审'); expect(html).toContain('合成厂家'); expect(html).toContain('已完成调色'); expect(html).not.toContain('<form');
  });
});
