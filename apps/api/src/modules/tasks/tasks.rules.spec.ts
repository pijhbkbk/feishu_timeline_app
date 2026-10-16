import { WorkflowNodeCode, WorkflowTaskStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  getTaskRouteSegment,
  isWorkflowTaskOverdue,
  matchesTaskMode,
  normalizePage,
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

  it.each(['101', '10000000', '9007199254740992'])(
    'rejects an unsafe pagination page before it can become a deep database offset: %s',
    (rawPage) => {
      expect(() => normalizePage(rawPage, 1)).toThrowError(
        expect.objectContaining({
          response: expect.objectContaining({
            code: 'PAGINATION_PAGE_OUT_OF_RANGE',
          }),
        }),
      );
    },
  );

  it('keeps the supported page boundary and the legacy nonnumeric fallback', () => {
    expect(normalizePage('100', 1)).toBe(100);
    expect(normalizePage('invalid', 1)).toBe(1);
  });
});
