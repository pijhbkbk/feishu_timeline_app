import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { TaskTable } from './tasks-workspace';
import {
  getTaskModeTitle,
  getTaskStatusLabel,
} from '../lib/tasks-client';

describe('TasksWorkspace', () => {
  it('renders task table rows and project links', () => {
    const html = renderToStaticMarkup(
      <TaskTable
        items={[
          {
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
          },
        ]}
      />,
    );

    expect(html).toContain('项目A');
    expect(html).toContain('涂料采购');
    expect(html).toContain('/projects/project-1/paint-procurement');
    expect(html).toContain('超期');
  });

  it('exposes mode title and task status labels', () => {
    expect(getTaskModeTitle('overdue')).toBe('我的超期任务');
    expect(getTaskStatusLabel('IN_PROGRESS')).toBe('进行中');
  });
});

