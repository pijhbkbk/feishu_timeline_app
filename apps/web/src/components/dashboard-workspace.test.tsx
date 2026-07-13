import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { R22Kpi, R22TaskCard } from './r22-ui';

describe('R22 dashboard components', () => {
  it('renders a readable KPI card', () => {
    const html = renderToStaticMarkup(
      <R22Kpi label="待处理" value={8} hint="分配给我的活跃任务" tone="brand" />,
    );

    expect(html).toContain('待处理');
    expect(html).toContain('8');
    expect(html).toContain('分配给我的活跃任务');
  });

  it('renders the current task with progress and primary action', () => {
    const html = renderToStaticMarkup(
      <R22TaskCard
        primary
        task={{
          taskId: 'task-1',
          projectId: 'project-1',
          projectCode: 'LC-001',
          projectName: '项目A',
          projectPriority: 'HIGH',
          nodeCode: 'PAINT_DEVELOPMENT',
          nodeName: '涂料开发',
          status: 'IN_PROGRESS',
          dueAt: '2026-07-15T12:00:00.000Z',
          isOverdue: false,
          overdueDays: 0,
          completionPercent: 60,
          materials: { submitted: 1, required: 2, missing: 1 },
          progressHref: '/progress?taskId=task-1',
          projectHref: '/projects/project-1',
        }}
      />,
    );

    expect(html).toContain('涂料开发');
    expect(html).toContain('60%');
    expect(html).toContain('缺 1 项');
    expect(html).toContain('/progress?taskId=task-1');
  });
});
