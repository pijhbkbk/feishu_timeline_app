import { WorkflowDurationType, WorkflowNodeCode } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import type { WorkflowRuntimeNodeDefinition } from './workflow-deadline.service';
import { WorkflowDeadlineService } from './workflow-deadline.service';

function createDefinition(
  overrides: Partial<WorkflowRuntimeNodeDefinition> = {},
): WorkflowRuntimeNodeDefinition {
  return {
    nodeCode: WorkflowNodeCode.PAINT_PROCUREMENT,
    nodeName: '涂料采购',
    stepCode: '06',
    durationType: WorkflowDurationType.WORKDAY,
    durationValue: 2,
    allowManualDueAt: false,
    defaultChargeAmount: null,
    ...overrides,
  };
}

describe('WorkflowDeadlineService', () => {
  it('calculates workday due dates with calendar overrides', async () => {
    const service = new WorkflowDeadlineService();
    const db = {
      workCalendar: {
        findMany: vi.fn().mockResolvedValue([
          {
            calendarDate: new Date('2026-04-18T00:00:00.000Z'),
            isWorkday: true,
          },
          {
            calendarDate: new Date('2026-04-20T00:00:00.000Z'),
            isWorkday: false,
          },
        ]),
      },
    };

    const dueAt = await service.calculateDueAt(
      db as never,
      createDefinition(),
      new Date('2026-04-17T08:00:00.000Z'),
    );

    expect(db.workCalendar.findMany).toHaveBeenCalled();
    expect(dueAt?.toISOString()).toBe('2026-04-21T23:59:59.999Z');
  });

  it('uses manual review pass duration as workdays', async () => {
    const service = new WorkflowDeadlineService();
    const db = {
      workCalendar: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    const dueAt = await service.calculateDueAt(
      db as never,
      createDefinition({
        durationType: WorkflowDurationType.MANUAL_REVIEW_PASS,
        durationValue: 1,
      }),
      new Date('2026-04-17T08:00:00.000Z'),
    );

    expect(dueAt?.toISOString()).toBe('2026-04-20T23:59:59.999Z');
  });
});
