import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { TaskWideCard } from './tasks-workspace';
import {
  getTaskModeTitle,
  getTaskStatusLabel,
} from '../lib/tasks-client';

describe('TasksWorkspace', () => {
  it('renders wide task cards with real task actions', () => {
    const html = renderToStaticMarkup(
      <TaskWideCard
        completed={false}
        item={{
            taskId: 'task-1',
            projectId: 'project-1',
            projectName: '项目A',
            projectHref: '/projects/project-1/paint-procurement',
            nodeCode: 'PAINT_PROCUREMENT',
            nodeName: '涂料采购',
            taskStatus: 'IN_PROGRESS',
            dueAt: '2026-03-19T12:00:00.000Z',
            assigneeName: '王工',
            isOverdue: true,
            priority: 'HIGH',
            currentProjectStatus: 'IN_PROGRESS',
            currentProjectNodeCode: 'PAINT_PROCUREMENT',
            materialCount: 1,
            completionPercent: 45,
            latestUpdate: {
              content: '已完成供应商询价',
              nextPlan: '确认到货时间',
              createdAt: '2026-03-18T12:00:00.000Z',
            },
            blocker: null,
          }}
      />,
    );

    expect(html).toContain('项目A');
    expect(html).toContain('涂料采购');
    expect(html).toContain('/progress?taskId=task-1');
    expect(html).toContain('逾期');
  });

  it('exposes mode title and task status labels', () => {
    expect(getTaskModeTitle('overdue')).toBe('我的逾期任务');
    expect(getTaskStatusLabel('IN_PROGRESS')).toBe('进行中');
  });
});
