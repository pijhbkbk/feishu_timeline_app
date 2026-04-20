import {
  RecurringPlanStatus,
  SystemParameterValueType,
  WorkflowNodeCode,
} from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { WorkflowRecurringService } from './workflow-recurring.service';

function createDb() {
  return {
    recurringPlan: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({
        id: 'plan-1',
        projectId: 'project-1',
        sourceWorkflowTaskId: 'task-17',
        sourceNodeCode: WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW,
        planCode: 'RPLAN-TEST-001',
        totalCount: 12,
        generatedCount: 12,
        startDate: new Date('2026-03-15T00:00:00.000Z'),
        endDate: new Date('2027-02-15T00:00:00.000Z'),
        status: RecurringPlanStatus.ACTIVE,
      }),
    },
    recurringTask: {
      createMany: vi.fn().mockResolvedValue({ count: 12 }),
      count: vi.fn().mockResolvedValue(12),
    },
    systemParameter: {
      findUnique: vi.fn().mockResolvedValue({
        valueType: SystemParameterValueType.NUMBER,
        valueNumber: 12,
      }),
    },
  };
}

describe('WorkflowRecurringService', () => {
  it('creates 12 monthly review tasks from the configured total count', async () => {
    const service = new WorkflowRecurringService();
    const db = createDb();

    const result = await service.ensureMonthlyReviewPlan(db as never, {
      projectId: 'project-1',
      sourceWorkflowTaskId: 'task-17',
      startAt: new Date('2026-02-15T08:00:00.000Z'),
      reviewerId: 'reviewer-1',
    });

    expect(db.recurringPlan.create).toHaveBeenCalled();
    expect(db.recurringTask.createMany).toHaveBeenCalled();
    const createManyPayload = db.recurringTask.createMany.mock.calls[0]?.[0];
    expect(createManyPayload?.data).toHaveLength(12);
    expect(createManyPayload?.data[0]).toEqual(
      expect.objectContaining({
        periodIndex: 1,
        periodLabel: '2026-03',
        projectId: 'project-1',
        reviewerId: 'reviewer-1',
      }),
    );
    expect(createManyPayload?.data[11]).toEqual(
      expect.objectContaining({
        periodIndex: 12,
        periodLabel: '2027-02',
      }),
    );
    expect(result.generatedTaskCount).toBe(12);
  });

  it('reuses an existing monthly review plan without creating duplicates', async () => {
    const service = new WorkflowRecurringService();
    const db = createDb();
    db.recurringPlan.findFirst.mockResolvedValue({
      id: 'plan-existing',
      planCode: 'RPLAN-EXISTING',
    });

    const result = await service.ensureMonthlyReviewPlan(db as never, {
      projectId: 'project-1',
      sourceWorkflowTaskId: 'task-17',
      startAt: new Date('2026-02-15T08:00:00.000Z'),
    });

    expect(db.recurringPlan.create).not.toHaveBeenCalled();
    expect(db.recurringTask.createMany).not.toHaveBeenCalled();
    expect(result).toEqual({
      plan: {
        id: 'plan-existing',
        planCode: 'RPLAN-EXISTING',
      },
      generatedTaskCount: 12,
      plannedDates: [],
    });
  });
});
