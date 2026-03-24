import { WorkflowNodeCode, WorkflowTaskStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  getTaskRouteSegment,
  isWorkflowTaskOverdue,
  matchesTaskMode,
} from './tasks.rules';

describe('tasks.rules', () => {
  it('recognizes overdue tasks and pending mode correctly', () => {
    const now = new Date('2026-03-19T12:00:00.000Z');
    const overdueTask = {
      dueAt: new Date('2026-03-18T12:00:00.000Z'),
      status: WorkflowTaskStatus.IN_PROGRESS,
      isActive: true,
    };

    expect(isWorkflowTaskOverdue(overdueTask, now)).toBe(true);
    expect(matchesTaskMode('pending', overdueTask, now)).toBe(false);
    expect(matchesTaskMode('overdue', overdueTask, now)).toBe(true);
  });

  it('maps workflow nodes to project routes', () => {
    expect(getTaskRouteSegment(WorkflowNodeCode.PAINT_PROCUREMENT)).toBe('paint-procurement');
    expect(getTaskRouteSegment(WorkflowNodeCode.COLOR_CONSISTENCY_REVIEW)).toBe('reviews');
    expect(getTaskRouteSegment(WorkflowNodeCode.MASS_PRODUCTION)).toBe('mass-production');
  });
});

