import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MonthlyReviewMonthCard } from './monthly-reviews-board';
import { RecurringStatusBadge } from './monthly-review-workspace';
import type { DashboardMonthlyReviewTask } from '../lib/dashboard-client';

const task: DashboardMonthlyReviewTask = {
  id: 'legacy-task', periodIndex: 1, periodLabel: '2025年1月', plannedDate: '2025-01-01T00:00:00.000Z',
  dueAt: '2025-01-31T23:59:59.999Z', completedAt: null, status: 'OVERDUE', result: 'PENDING',
  hasRecordedSampling: false,
};
describe('legacy monthly review applicability', () => {
  it('retains the original status and detail link without presenting an unsampled period as current overdue work', () => {
    const html = renderToStaticMarkup(<MonthlyReviewMonthCard projectId="p" task={task} />);
    expect(html).toContain('未登记实际抽检；历史状态：');
    expect(html).toContain('/projects/p/reviews?recurringTaskId=legacy-task');
    expect(html).not.toContain('monthly-review-card-overdue');
    expect(html).not.toContain('本月任务');
    expect(renderToStaticMarkup(<RecurringStatusBadge status="OVERDUE" hasRecordedSampling={false} />)).toContain('status-pill-neutral');
  });
  it('keeps explicit actual sampling overdue and completed historical results visible', () => {
    expect(renderToStaticMarkup(<MonthlyReviewMonthCard projectId="p" task={{ ...task, hasRecordedSampling: true }} />)).toContain('monthly-review-card-overdue');
    const html = renderToStaticMarkup(<RecurringStatusBadge status="COMPLETED" hasRecordedSampling={false} />);
    expect(html).toContain('status-pill-success');
    expect(html).not.toContain('未登记实际抽检');
  });
});
