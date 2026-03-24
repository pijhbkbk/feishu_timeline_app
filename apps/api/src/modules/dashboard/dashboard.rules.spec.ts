import { ProjectPriority, ProjectStatus, WorkflowTaskStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  computeProjectRiskLevel,
  getOverdueDays,
  isTaskOverdue,
} from './dashboard.rules';

describe('dashboard.rules', () => {
  it('identifies overdue tasks correctly', () => {
    const now = new Date('2026-03-19T12:00:00.000Z');

    expect(
      isTaskOverdue(
        {
          dueAt: new Date('2026-03-18T12:00:00.000Z'),
          status: WorkflowTaskStatus.IN_PROGRESS,
          isActive: true,
        },
        now,
      ),
    ).toBe(true);
    expect(
      isTaskOverdue(
        {
          dueAt: new Date('2026-03-20T12:00:00.000Z'),
          status: WorkflowTaskStatus.IN_PROGRESS,
          isActive: true,
        },
        now,
      ),
    ).toBe(false);
  });

  it('computes risk level from overdue and project dates', () => {
    const now = new Date('2026-03-19T12:00:00.000Z');

    expect(
      computeProjectRiskLevel(
        {
          status: ProjectStatus.IN_PROGRESS,
          priority: ProjectPriority.MEDIUM,
          plannedEndDate: new Date('2026-03-18T00:00:00.000Z'),
          maxOverdueDays: 0,
        },
        now,
      ),
    ).toBe(ProjectPriority.CRITICAL);

    expect(
      computeProjectRiskLevel(
        {
          status: ProjectStatus.IN_PROGRESS,
          priority: ProjectPriority.LOW,
          plannedEndDate: new Date('2026-04-01T00:00:00.000Z'),
          maxOverdueDays: 2,
        },
        now,
      ),
    ).toBe(ProjectPriority.HIGH);
  });

  it('computes overdue days as positive integers', () => {
    expect(
      getOverdueDays(
        new Date('2026-03-18T12:00:00.000Z'),
        new Date('2026-03-19T12:00:00.000Z'),
      ),
    ).toBe(1);
    expect(
      getOverdueDays(
        new Date('2026-03-15T12:00:00.000Z'),
        new Date('2026-03-19T12:00:00.000Z'),
      ),
    ).toBe(4);
  });
});

