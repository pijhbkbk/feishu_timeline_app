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

function interactionFixture(payload: Prisma.JsonValue, nodeCode: WorkflowNodeCode = WorkflowNodeCode.PERFORMANCE_TEST) {
  const task = {
    id: 'performance-2', projectId: 'project-1', workflowInstanceId: 'workflow-1', nodeCode,
    nodeName: '性能试验', payload, status: 'COMPLETED', isActive: false, taskRound: 2,
    createdAt: new Date('2026-10-20T08:09:18.807Z'), updatedAt: new Date('2026-10-24T06:48:26.935Z'),
    completedAt: new Date('2026-10-24T06:48:26.935Z'), dueAt: new Date(anchor.dueAt), effectiveDueAt: new Date(anchor.dueAt),
    project: { id: 'project-1', code: 'SYN-1', name: '合成性能试验', colors: [], members: [] },
  };
  const definition = { nodeCode, durationType: 'MONTH_OFFSET', durationValue: 4, stepCode: '09', isBlocking: false };
  const db = {
    workflowTask: { findUnique: vi.fn().mockResolvedValue(task), findMany: vi.fn().mockResolvedValue([task]) },
    workflowNodeDefinition: { findUnique: vi.fn().mockResolvedValue(definition) },
    reviewRecord: { findMany: vi.fn().mockResolvedValue([]) },
    systemParameter: { findMany: vi.fn().mockResolvedValue([]) },
    workflowTransition: { findMany: vi.fn().mockResolvedValue([]) },
    auditLog: { findMany: vi.fn().mockResolvedValue([]) },
    attachment: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const access = { assertProjectAccessWithDefaultClient: vi.fn() };
  const service = new WorkflowsService(db as never, {} as never, {} as never,
    new WorkflowDeadlineService(), {} as never, access as never,
    { now: () => new Date('2026-10-24T06:50:00Z') } as never);
  return { service, task, definition, access };
}

describe('Performance feedback schedule from confirmed arrival', () => {
  it('reports the frozen six-month arrival rule for a completed task despite the installed four-month catalog', async () => {
    const { service, task, definition, access } = interactionFixture({ performanceArrivalAnchor: anchor });
    const actor = { id: 'approved-member' };
    const before = JSON.stringify({ task, definition });
    const result = await service.getTaskInteractionDetail(task.id, actor as never);
    expect(access.assertProjectAccessWithDefaultClient).toHaveBeenCalledWith('project-1', actor, 'project.read');
    expect(result.schedule).toMatchObject({
      durationType: 'MONTH_OFFSET', durationValue: 6,
      ruleText: '本轮首次有效到货起算 6 个日历月；月末取目标月最后一天，后续到货不重置',
      dueAt: anchor.dueAt, effectiveDueAt: anchor.dueAt, completedAt: task.completedAt.toISOString(),
    });
    expect(JSON.stringify({ task, definition })).toBe(before);
  });

  it.each([
    [{}, WorkflowNodeCode.PERFORMANCE_TEST],
    [{ performanceArrivalAnchor: anchor }, WorkflowNodeCode.PAINT_PROCUREMENT],
  ] as const)('preserves the installed legacy rule without an applicable performance anchor', async (payload, nodeCode) => {
    const { service, task } = interactionFixture(payload, nodeCode);
    const result = await service.getTaskInteractionDetail(task.id, { id: 'approved-member' } as never);
    expect(result.schedule).toMatchObject({ durationType: 'MONTH_OFFSET', durationValue: 4, ruleText: '按月偏移，4 个月' });
  });

  it('rejects an inconsistent anchor instead of displaying a fabricated six-month rule', async () => {
    const { service, task } = interactionFixture({ performanceArrivalAnchor: { ...anchor, dueAt: '2027-03-01T15:59:59.999Z' } });
    await expect(service.getTaskInteractionDetail(task.id, { id: 'approved-member' } as never)).rejects.toThrow('起算依据');
  });

  it('refreshes only a fixed anchor projection and does not fetch unrelated task payloads', async () => {
    const dueAt = new Date(anchor.dueAt);
    const db = {
      workflowTask: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'performance-2', nodeCode: 'PERFORMANCE_TEST', dueAt, effectiveDueAt: dueAt, manualDueAt: null, overdueDays: 0 },
          { id: 'ordinary-1', nodeCode: 'PAINT_PROCUREMENT', dueAt, effectiveDueAt: dueAt, manualDueAt: null, overdueDays: 0 },
        ]), update: vi.fn(),
      },
      $queryRaw: vi.fn().mockResolvedValue([{ anchorType: 'object', anchor }]),
    };
    await new WorkflowDeadlineService().refreshWorkflowInstanceTaskDeadlines(db as never, 'instance', new Date('2027-02-28T16:00:00.000Z'));
    expect(db.workflowTask.findMany.mock.calls[0]?.[0].select).not.toHaveProperty('payload');
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    const sql = db.$queryRaw.mock.calls[0]?.[0] as Prisma.Sql;
    expect(sql.values).toContain('performance-2');
    expect(sql.values).not.toContain('ordinary-1');
    expect(sql.strings.join('')).toContain('jsonb_build_object');
    expect(sql.strings.join('')).toContain('LEFT(');
    expect(sql.strings.join('')).not.toMatch(/SELECT\s+(?:\*|"?payload"?\s*[,\n])/);
    expect(db.workflowTask.update).toHaveBeenCalledExactlyOnceWith({ where: { id: 'performance-2' }, data: { effectiveDueAt: dueAt, overdueDays: 1 } });
  });

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
