import { describe, expect, it, vi } from 'vitest';
import { Prisma, WorkflowAction, WorkflowNodeCode } from '@prisma/client';
import { workflowNodes } from '../catalog/base-catalog';
import { WorkflowsService } from './workflows.service';
import { WorkflowDeadlineService } from './workflow-deadline.service';
import { PERFORMANCE_ARRIVAL_RULE } from './performance-arrival-anchor';

const anchor = {
  rule: PERFORMANCE_ARRIVAL_RULE, procurementTaskId: 'purchase-round-2', procurementId: 'purchase-2',
  creationAuditId: 'create-audit-2', arrivalAuditId: 'arrive-audit-2',
  arrivalDate: '2026-08-31T00:00:00.000Z', dueAt: '2027-02-28T15:59:59.999Z',
};

function fixture() {
  const tx = {
    workflowNodeDefinition: { findUnique: vi.fn().mockResolvedValue({
      nodeCode: 'PERFORMANCE_TEST', durationType: 'MONTH_OFFSET', durationValue: 4, stepCode: '09',
    }) },
    workflowTask: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'performance-2', ...data })) },
    workflowTransition: { create: vi.fn() },
    user: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const service = new WorkflowsService({} as never, {} as never, {} as never,
    new WorkflowDeadlineService(), {} as never, {} as never,
    { now: () => new Date('2026-10-20T00:00:00Z') } as never);
  const spawn = service as unknown as { createNextTasks: (...args: unknown[]) => Promise<unknown> };
  const source = { id: 'purchase-round-2', projectId: 'project-1', workflowInstanceId: 'workflow-1',
    nodeCode: WorkflowNodeCode.PAINT_PROCUREMENT, payload: { performanceArrivalAnchor: anchor } as Prisma.JsonObject };
  return { tx, spawn, source };
}

describe('Performance feedback schedule from confirmed arrival', () => {
  it('marks source-bound feedback overdue at Shanghai midnight and leaves legacy UTC-day behavior intact', () => {
    const deadlines = new WorkflowDeadlineService();
    const dueAt = new Date(anchor.dueAt);
    const task = { nodeCode: WorkflowNodeCode.PERFORMANCE_TEST, payload: { performanceArrivalAnchor: anchor } };
    expect(deadlines.getOverdueDays(dueAt, dueAt, task)).toBe(0);
    expect(deadlines.getOverdueDays(dueAt, new Date('2027-02-28T16:00:00.000Z'), task)).toBe(1);
    expect(deadlines.getOverdueDays(dueAt, new Date('2027-03-01T16:00:00.000Z'), task)).toBe(2);
    expect(deadlines.getOverdueDays(dueAt, new Date('2027-02-28T16:00:00.000Z'), { ...task, payload: {} })).toBe(0);
    expect(deadlines.getOverdueDays(dueAt, new Date('2027-02-28T16:00:00.000Z'), { ...task, nodeCode: WorkflowNodeCode.PAINT_PROCUREMENT })).toBe(0);
    const { spawn } = fixture();
    expect((spawn as unknown as { resolveTaskSlaStatus: (...args: unknown[]) => string }).resolveTaskSlaStatus({ ...task, isActive: true, status: 'READY', dueAt, effectiveDueAt: dueAt }, new Date('2027-02-28T16:00:00.000Z'))).toBe('已逾期');
  });

  it('uses six calendar months in fresh catalog defaults and remains nonblocking', () => {
    expect(workflowNodes.find(node => node.nodeCode === WorkflowNodeCode.PERFORMANCE_TEST))
      .toMatchObject({ durationType: 'MONTH_OFFSET', durationValue: 6, isBlocking: false });
  });

  it('uses the frozen arrival deadline even if activation is later and installed catalog still says four months', async () => {
    const { tx, spawn, source } = fixture();
    await spawn.createNextTasks(tx, source, { id: 'actor-1' }, WorkflowAction.COMPLETE, {},
      [{ nodeCode: WorkflowNodeCode.PERFORMANCE_TEST, isPrimary: false, reason: '合成并行反馈' }]);
    expect(tx.workflowTask.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      isPrimary: false, dueAt: new Date(anchor.dueAt), effectiveDueAt: new Date(anchor.dueAt),
      payload: expect.objectContaining({ performanceArrivalAnchor: anchor }),
    }) }));
  });

  it.each([{}, { performanceArrivalAnchor: { ...anchor, procurementTaskId: 'old-round' } }])('does not substitute activation time for missing or foreign-round evidence', async payload => {
    const { tx, spawn, source } = fixture();
    await expect(spawn.createNextTasks(tx, { ...source, payload }, { id: 'actor-1' }, WorkflowAction.COMPLETE, {},
      [{ nodeCode: WorkflowNodeCode.PERFORMANCE_TEST, isPrimary: false, reason: '合成并行反馈' }])).rejects.toThrow('到货起算依据');
    expect(tx.workflowTask.create).not.toHaveBeenCalled();
  });
});
