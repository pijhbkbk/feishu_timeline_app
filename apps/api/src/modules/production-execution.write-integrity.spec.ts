import { ConflictException } from '@nestjs/common';
import {
  ProductionPlanStatus,
  ProductionPlanType,
  TrialProductionIssueSeverity,
  TrialProductionResult,
  TrialProductionStatus,
  WorkflowNodeCode,
  WorkflowTaskStatus,
} from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { MassProductionsService } from './mass-productions/mass-productions.service';
import { PilotProductionsService } from './pilot-productions/pilot-productions.service';

const actor = {
  id: 'process-user-1',
  roleCodes: ['process_engineer'],
  permissionCodes: ['project.read', 'workflow.transition'],
  isSystemAdmin: false,
} as never;

const activeTask = (id: string, nodeCode: WorkflowNodeCode) => ({
  id,
  nodeCode,
  status: WorkflowTaskStatus.IN_PROGRESS,
  isActive: true,
});

const massInput = {
  productionDate: '2026-08-11T00:00:00.000Z',
  plannedQuantity: 10,
  actualQuantity: 10,
  workshop: '总装车间',
  lineName: '一线',
  ownerId: 'owner-1',
  batchNo: 'BATCH-001',
  exceptionNote: null,
};

const massRecord = {
  id: 'mass-1',
  projectId: 'project-1',
  planNo: 'MP-001',
  planType: ProductionPlanType.MASS_PRODUCTION,
  status: ProductionPlanStatus.DRAFT,
  quantity: 10,
  actualQuantity: 10,
  planDate: new Date('2026-08-11T00:00:00.000Z'),
  workshop: '总装车间',
  lineName: '一线',
  ownerId: 'owner-1',
  owner: null,
  createdBy: null,
  confirmedBy: null,
  batchNo: 'BATCH-001',
  remark: null,
  actualStartAt: null,
  actualEndAt: null,
  createdAt: new Date('2026-08-11T00:00:00.000Z'),
  updatedAt: new Date('2026-08-11T00:00:00.000Z'),
};

const firstPlanInput = {
  planDate: '2026-08-12T00:00:00.000Z',
  plannedQuantity: 1,
  workshop: '试制车间',
  lineName: '试制线',
  ownerId: 'owner-1',
  batchNo: 'FIRST-001',
  note: null,
};

const firstPlanRecord = {
  ...massRecord,
  id: 'first-plan-1',
  planNo: 'FPP-001',
  planType: ProductionPlanType.FIRST_UNIT,
  actualQuantity: null,
};

const trialInput = {
  productionPlanId: null,
  vehicleNo: 'TRIAL-001',
  workshop: '试制车间',
  trialDate: '2026-08-12T00:00:00.000Z',
  paintBatchNo: 'PAINT-001',
  result: TrialProductionResult.PASS,
  issueSummary: '无阻塞问题',
  note: null,
};

function createMassHarness() {
  const tx = {
    $queryRaw: vi.fn(),
    productionPlan: {
      create: vi.fn().mockResolvedValue(massRecord),
      update: vi.fn().mockResolvedValue(massRecord),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      findUniqueOrThrow: vi.fn().mockResolvedValue(massRecord),
    },
  };
  const prisma = {
    $transaction: vi.fn(
      async (callback: (executor: typeof tx) => Promise<unknown>) => callback(tx),
    ),
  };
  const activityLogs = { createWithExecutor: vi.fn() };
  const workflows = { transitionTaskWithExecutor: vi.fn() };
  const service = new MassProductionsService(
    prisma as never,
    activityLogs as never,
    workflows as never,
    { assertProjectAccessWithDefaultClient: vi.fn().mockResolvedValue(undefined) } as never,
  );
  vi.spyOn(service as unknown as { buildWorkspace: (...args: unknown[]) => Promise<unknown> }, 'buildWorkspace').mockResolvedValue({} as never);
  vi.spyOn(service as unknown as { getUserOrThrow: (...args: unknown[]) => Promise<unknown> }, 'getUserOrThrow').mockResolvedValue(undefined as never);

  return { service, tx, activityLogs, workflows };
}

const trialRecord = {
  id: 'trial-1',
  projectId: 'project-1',
  productionPlanId: null,
  productionPlan: null,
  trialNo: 'TRIAL-001',
  status: TrialProductionStatus.IN_PROGRESS,
  location: '试制车间',
  plannedAt: new Date('2026-08-11T00:00:00.000Z'),
  paintBatchNo: 'PAINT-001',
  result: TrialProductionResult.PASS,
  summary: '无阻塞问题',
  note: null,
  startedAt: new Date('2026-08-11T00:00:00.000Z'),
  completedAt: null,
  issues: [],
  _count: { issues: 0 },
  createdAt: new Date('2026-08-11T00:00:00.000Z'),
  updatedAt: new Date('2026-08-11T00:00:00.000Z'),
};

function createPilotHarness() {
  const tx = {
    $queryRaw: vi.fn(),
    productionPlan: {
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      findUniqueOrThrow: vi.fn(),
    },
    trialProduction: {
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      findUniqueOrThrow: vi.fn(),
    },
    trialProductionIssue: {
      create: vi.fn().mockResolvedValue({
        id: 'issue-1',
        issueType: '色差',
        severity: TrialProductionIssueSeverity.MEDIUM,
        responsibleDept: '涂装',
      }),
    },
  };
  const prisma = {
    $transaction: vi.fn(
      async (callback: (executor: typeof tx) => Promise<unknown>) => callback(tx),
    ),
  };
  const activityLogs = { createWithExecutor: vi.fn() };
  const workflows = { transitionTaskWithExecutor: vi.fn() };
  const service = new PilotProductionsService(
    prisma as never,
    activityLogs as never,
    workflows as never,
    { assertProjectAccessWithDefaultClient: vi.fn().mockResolvedValue(undefined) } as never,
  );
  vi.spyOn(service as unknown as { buildFirstProductionPlanWorkspace: (...args: unknown[]) => Promise<unknown> }, 'buildFirstProductionPlanWorkspace').mockResolvedValue(
    {} as never,
  );
  vi.spyOn(service as unknown as { buildTrialProductionWorkspace: (...args: unknown[]) => Promise<unknown> }, 'buildTrialProductionWorkspace').mockResolvedValue(
    {} as never,
  );

  return { service, tx, activityLogs, workflows };
}

describe('production execution finalized-write integrity', () => {
  it('rejects a mass-production create after the exact workflow task became terminal', async () => {
    const { service, tx, activityLogs } = createMassHarness();
    tx.$queryRaw.mockResolvedValue([]);
    vi.spyOn(service as unknown as { getMassProductionContext: (...args: unknown[]) => Promise<unknown> }, 'getMassProductionContext').mockResolvedValue({
      project: { id: 'project-1' },
      activeTask: activeTask('mass-task-1', WorkflowNodeCode.MASS_PRODUCTION),
      schedulePlanCompleted: true,
      items: [],
    } as never);
    vi.spyOn(service as unknown as { startTaskIfNeeded: (...args: unknown[]) => Promise<unknown> }, 'startTaskIfNeeded').mockResolvedValue(
      undefined as never,
    );

    await expect(service.createRecord('project-1', massInput, actor)).rejects.toBeInstanceOf(
      ConflictException,
    );

    expect(tx.productionPlan.create).not.toHaveBeenCalled();
    expect(activityLogs.createWithExecutor).not.toHaveBeenCalled();
  });

  it('rejects a stale mass-production update instead of overwriting a terminal record', async () => {
    const { service, tx, activityLogs } = createMassHarness();
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: massRecord.id }])
      .mockResolvedValueOnce([{ id: 'mass-task-1' }]);
    vi.spyOn(service as unknown as { getMassProductionContext: (...args: unknown[]) => Promise<unknown> }, 'getMassProductionContext').mockResolvedValue({
      project: { id: 'project-1' },
      activeTask: activeTask('mass-task-1', WorkflowNodeCode.MASS_PRODUCTION),
      schedulePlanCompleted: true,
      items: [massRecord],
    } as never);
    vi.spyOn(service as unknown as { getRecordOrThrow: (...args: unknown[]) => Promise<unknown> }, 'getRecordOrThrow').mockResolvedValue(
      massRecord as never,
    );

    await expect(
      service.updateRecord('project-1', massRecord.id, massInput, actor),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(tx.productionPlan.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: massRecord.id,
          status: massRecord.status,
          updatedAt: massRecord.updatedAt,
        }),
      }),
    );
    expect(activityLogs.createWithExecutor).not.toHaveBeenCalled();
  });

  it('rejects the losing side of conflicting mass-production status actions', async () => {
    const { service, tx, activityLogs } = createMassHarness();
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: massRecord.id }])
      .mockResolvedValueOnce([{ id: 'mass-task-1' }]);
    vi.spyOn(service as unknown as { getMassProductionContext: (...args: unknown[]) => Promise<unknown> }, 'getMassProductionContext').mockResolvedValue({
      project: { id: 'project-1' },
      activeTask: activeTask('mass-task-1', WorkflowNodeCode.MASS_PRODUCTION),
      schedulePlanCompleted: true,
      items: [massRecord],
    } as never);
    vi.spyOn(service as unknown as { getRecordOrThrow: (...args: unknown[]) => Promise<unknown> }, 'getRecordOrThrow').mockResolvedValue(
      massRecord as never,
    );
    vi.spyOn(service as unknown as { startTaskIfNeeded: (...args: unknown[]) => Promise<unknown> }, 'startTaskIfNeeded').mockResolvedValue(
      undefined as never,
    );

    await expect(
      service.startRecord('project-1', massRecord.id, actor),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(tx.productionPlan.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: ProductionPlanStatus.DRAFT,
          updatedAt: massRecord.updatedAt,
        }),
      }),
    );
    expect(activityLogs.createWithExecutor).not.toHaveBeenCalled();
  });

  it('rejects trial issue creation when the workflow task completed before the write', async () => {
    const { service, tx, activityLogs } = createPilotHarness();
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: trialRecord.id }])
      .mockResolvedValueOnce([]);
    vi.spyOn(service as unknown as { getTrialProductionContext: (...args: unknown[]) => Promise<unknown> }, 'getTrialProductionContext').mockResolvedValue({
      project: { id: 'project-1' },
      activeTask: activeTask('trial-task-1', WorkflowNodeCode.TRIAL_PRODUCTION),
      firstPlanTaskCompleted: true,
      items: [trialRecord],
    } as never);
    vi.spyOn(service as unknown as { getTrialProductionForMutationOrThrow: (...args: unknown[]) => Promise<unknown> }, 'getTrialProductionForMutationOrThrow').mockResolvedValue(trialRecord as never);

    await expect(
      service.addTrialProductionIssue(
        'project-1',
        trialRecord.id,
        {
          issueType: '色差',
          description: '终态后不得新增问题',
          severity: TrialProductionIssueSeverity.MEDIUM,
          responsibleDept: '涂装',
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(tx.trialProductionIssue.create).not.toHaveBeenCalled();
    expect(activityLogs.createWithExecutor).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: 'complete',
      status: ProductionPlanStatus.IN_PROGRESS,
      invoke: (service: MassProductionsService) =>
        service.completeRecord('project-1', massRecord.id, actor),
    },
    {
      label: 'cancel',
      status: ProductionPlanStatus.DRAFT,
      invoke: (service: MassProductionsService) =>
        service.cancelRecord('project-1', massRecord.id, actor),
    },
  ])('uses a stale-state CAS for mass-production $label', async ({ status, invoke }) => {
    const { service, tx, activityLogs } = createMassHarness();
    const record = { ...massRecord, status };
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: record.id }])
      .mockResolvedValueOnce([{ id: 'mass-task-1' }]);
    vi.spyOn(service as unknown as { getMassProductionContext: (...args: unknown[]) => Promise<unknown> }, 'getMassProductionContext').mockResolvedValue({
      project: { id: 'project-1' },
      activeTask: activeTask('mass-task-1', WorkflowNodeCode.MASS_PRODUCTION),
      schedulePlanCompleted: true,
      items: [record],
    } as never);
    vi.spyOn(service as unknown as { getRecordOrThrow: (...args: unknown[]) => Promise<unknown> }, 'getRecordOrThrow').mockResolvedValue(
      record as never,
    );

    await expect(invoke(service)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.productionPlan.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: record.id,
          status,
          updatedAt: record.updatedAt,
        }),
      }),
    );
    expect(activityLogs.createWithExecutor).not.toHaveBeenCalled();
  });

  it('locks the exact mass-production task before completing the node', async () => {
    const { service, tx, workflows, activityLogs } = createMassHarness();
    tx.$queryRaw.mockResolvedValue([]);

    await expect(service.completeTask('project-1', actor)).rejects.toBeInstanceOf(
      ConflictException,
    );

    expect(workflows.transitionTaskWithExecutor).not.toHaveBeenCalled();
    expect(activityLogs.createWithExecutor).not.toHaveBeenCalled();
  });

  it('locks the exact first-plan task before creating a plan', async () => {
    const { service, tx, activityLogs } = createPilotHarness();
    tx.$queryRaw.mockResolvedValue([]);

    await expect(
      service.createFirstProductionPlan('project-1', firstPlanInput, actor),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(tx.productionPlan.create).not.toHaveBeenCalled();
    expect(activityLogs.createWithExecutor).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: 'update',
      invoke: (service: PilotProductionsService) =>
        service.updateFirstProductionPlan(
          'project-1',
          firstPlanRecord.id,
          firstPlanInput,
          actor,
        ),
    },
    {
      label: 'confirm',
      invoke: (service: PilotProductionsService) =>
        service.confirmFirstProductionPlan('project-1', firstPlanRecord.id, actor),
    },
  ])('uses a stale-state CAS for first-plan $label', async ({ invoke }) => {
    const { service, tx, activityLogs } = createPilotHarness();
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: firstPlanRecord.id }])
      .mockResolvedValueOnce([{ id: 'first-plan-task-1' }]);
    vi.spyOn(service as unknown as { getFirstProductionPlanContext: (...args: unknown[]) => Promise<unknown> }, 'getFirstProductionPlanContext').mockResolvedValue({
      project: { id: 'project-1' },
      activeTask: activeTask(
        'first-plan-task-1',
        WorkflowNodeCode.FIRST_UNIT_PRODUCTION_PLAN,
      ),
      procurementCompleted: true,
      items: [firstPlanRecord],
    } as never);
    vi.spyOn(service as unknown as { getFirstProductionPlanOrThrow: (...args: unknown[]) => Promise<unknown> }, 'getFirstProductionPlanOrThrow').mockResolvedValue(
      firstPlanRecord as never,
    );
    vi.spyOn(service as unknown as { getUserOrThrow: (...args: unknown[]) => Promise<unknown> }, 'getUserOrThrow').mockResolvedValue(
      undefined as never,
    );

    await expect(invoke(service)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.productionPlan.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: firstPlanRecord.id,
          status: firstPlanRecord.status,
          updatedAt: firstPlanRecord.updatedAt,
        }),
      }),
    );
    expect(activityLogs.createWithExecutor).not.toHaveBeenCalled();
  });

  it('locks the exact first-plan task before completing the node', async () => {
    const { service, tx, workflows, activityLogs } = createPilotHarness();
    tx.$queryRaw.mockResolvedValue([]);

    await expect(
      service.completeFirstProductionPlanTask('project-1', actor),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(tx.productionPlan.updateMany).not.toHaveBeenCalled();
    expect(workflows.transitionTaskWithExecutor).not.toHaveBeenCalled();
    expect(activityLogs.createWithExecutor).not.toHaveBeenCalled();
  });

  it('CAS-protects each first-plan row finalized by task completion', async () => {
    const { service, tx, workflows, activityLogs } = createPilotHarness();
    const confirmedPlan = {
      ...firstPlanRecord,
      status: ProductionPlanStatus.PLANNED,
    };
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: confirmedPlan.id }])
      .mockResolvedValueOnce([{ id: 'first-plan-task-1' }]);
    vi.spyOn(service as unknown as { getFirstProductionPlanContext: (...args: unknown[]) => Promise<unknown> }, 'getFirstProductionPlanContext').mockResolvedValue({
      project: { id: 'project-1' },
      activeTask: activeTask(
        'first-plan-task-1',
        WorkflowNodeCode.FIRST_UNIT_PRODUCTION_PLAN,
      ),
      procurementCompleted: true,
      items: [confirmedPlan],
    } as never);

    await expect(
      service.completeFirstProductionPlanTask('project-1', actor),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(tx.productionPlan.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: confirmedPlan.id,
          status: confirmedPlan.status,
          updatedAt: confirmedPlan.updatedAt,
        }),
      }),
    );
    expect(workflows.transitionTaskWithExecutor).not.toHaveBeenCalled();
    expect(activityLogs.createWithExecutor).not.toHaveBeenCalled();
  });

  it('locks the exact trial task before creating a trial record', async () => {
    const { service, tx, activityLogs } = createPilotHarness();
    tx.$queryRaw.mockResolvedValue([]);

    await expect(
      service.createTrialProduction('project-1', trialInput, actor),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(tx.trialProduction.create).not.toHaveBeenCalled();
    expect(activityLogs.createWithExecutor).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: 'update',
      invoke: (service: PilotProductionsService) =>
        service.updateTrialProduction('project-1', trialRecord.id, trialInput, actor),
    },
    {
      label: 'complete',
      invoke: (service: PilotProductionsService) =>
        service.completeTrialProductionRecord('project-1', trialRecord.id, actor),
    },
  ])('uses a stale-state CAS for trial $label', async ({ invoke }) => {
    const { service, tx, activityLogs } = createPilotHarness();
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: trialRecord.id }])
      .mockResolvedValueOnce([{ id: 'trial-task-1' }]);
    vi.spyOn(service as unknown as { getTrialProductionContext: (...args: unknown[]) => Promise<unknown> }, 'getTrialProductionContext').mockResolvedValue({
      project: { id: 'project-1' },
      activeTask: activeTask('trial-task-1', WorkflowNodeCode.TRIAL_PRODUCTION),
      firstPlanTaskCompleted: true,
      items: [trialRecord],
    } as never);
    vi.spyOn(service as unknown as { getTrialProductionForMutationOrThrow: (...args: unknown[]) => Promise<unknown> }, 'getTrialProductionForMutationOrThrow').mockResolvedValue(trialRecord as never);
    vi.spyOn(service as unknown as { assertValidTrialProductionPlan: (...args: unknown[]) => Promise<unknown> }, 'assertValidTrialProductionPlan').mockResolvedValue(
      undefined as never,
    );

    await expect(invoke(service)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.trialProduction.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: trialRecord.id,
          status: trialRecord.status,
          updatedAt: trialRecord.updatedAt,
        }),
      }),
    );
    expect(activityLogs.createWithExecutor).not.toHaveBeenCalled();
  });

  it('locks the exact trial task before completing the node', async () => {
    const { service, tx, workflows, activityLogs } = createPilotHarness();
    tx.$queryRaw.mockResolvedValue([]);

    await expect(
      service.completeTrialProductionTask('project-1', actor),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(workflows.transitionTaskWithExecutor).not.toHaveBeenCalled();
    expect(activityLogs.createWithExecutor).not.toHaveBeenCalled();
  });
});
