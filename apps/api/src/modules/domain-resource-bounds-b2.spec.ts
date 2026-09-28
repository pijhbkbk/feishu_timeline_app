import {
  ProductionPlanType,
  TrialProductionIssueSeverity,
  TrialProductionResult,
  TrialProductionStatus,
} from '@prisma/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { installTeamAuthorizationFixture } from '../test-support/team-authorization.fixture';

import { MassProductionsService } from './mass-productions/mass-productions.service';
import { PilotProductionsService } from './pilot-productions/pilot-productions.service';

const actor = {
  authSource: 'local', authVersion: 1,
  id: 'admin-1',
  roleCodes: ['admin'],
  permissionCodes: ['project.read', 'workflow.transition'],
  isSystemAdmin: false,
} as never;

const massInput = {
  productionDate: '2026-08-11T00:00:00.000Z',
  plannedQuantity: 100,
  actualQuantity: 0,
  workshop: '总装车间',
  lineName: '一线',
  ownerId: 'owner-1',
  batchNo: 'BATCH-001',
  exceptionNote: '无异常',
};

const firstPlanInput = {
  planDate: '2026-08-12T00:00:00.000Z',
  plannedQuantity: 1,
  workshop: '试制车间',
  lineName: '试制线',
  ownerId: 'owner-1',
  batchNo: 'FIRST-001',
  note: '首台计划',
};

const trialInput = {
  productionPlanId: 'first-plan-1',
  vehicleNo: 'TRIAL-001',
  workshop: '试制车间',
  trialDate: '2026-08-12T00:00:00.000Z',
  paintBatchNo: 'PAINT-001',
  result: TrialProductionResult.PASS,
  issueSummary: '无阻塞问题',
  note: '正常',
};

const trialIssueInput = {
  issueType: 'SPRAY_FINISH',
  description: '局部边角存在轻微喷涂一致性波动。',
  severity: TrialProductionIssueSeverity.MEDIUM,
  responsibleDept: '工艺开发部',
};

function createParseDependencies() {
  const transaction = vi.fn().mockRejectedValue(new Error('write transaction reached'));
  const projectAccess = {
    assertProjectAccessWithDefaultClient: vi.fn().mockResolvedValue({ id: 'project-1' }),
  };
  return { transaction, projectAccess };
}

function createMassService(transaction: ReturnType<typeof vi.fn>) {
  const original = transaction as (...args: any[]) => any;
  transaction = vi.fn((operation: (tx: any) => unknown, options: unknown) => original((tx: any) => {
    installTeamAuthorizationFixture(tx, [actor]);
    return operation(tx);
  }, options));
  return new MassProductionsService(
    { $transaction: transaction } as never,
    {} as never,
    {} as never,
    {
      assertProjectAccessWithDefaultClient: vi.fn().mockResolvedValue({ id: 'project-1' }),
    } as never,
  );
}

function createPilotService(transaction: ReturnType<typeof vi.fn>) {
  const original = transaction as (...args: any[]) => any;
  transaction = vi.fn((operation: (tx: any) => unknown, options: unknown) => original((tx: any) => {
    installTeamAuthorizationFixture(tx, [actor]);
    return operation(tx);
  }, options));
  return new PilotProductionsService(
    { $transaction: transaction } as never,
    {} as never,
    {} as never,
    {
      assertProjectAccessWithDefaultClient: vi.fn().mockResolvedValue({ id: 'project-1' }),
    } as never,
  );
}

async function expectMassRejected(input: Record<string, unknown>) {
  const dependencies = createParseDependencies();
  const service = createMassService(dependencies.transaction);
  await expect(service.createRecord('project-1', input, actor)).rejects.toMatchObject({
    response: { code: 'MASS_PRODUCTION_INPUT_OUT_OF_BOUNDS' },
  });
  expect(dependencies.transaction).not.toHaveBeenCalled();
}

async function expectFirstPlanRejected(input: Record<string, unknown>) {
  const dependencies = createParseDependencies();
  const service = createPilotService(dependencies.transaction);
  await expect(
    service.createFirstProductionPlan('project-1', input, actor),
  ).rejects.toMatchObject({
    response: { code: 'FIRST_PRODUCTION_PLAN_INPUT_OUT_OF_BOUNDS' },
  });
  expect(dependencies.transaction).not.toHaveBeenCalled();
}

async function expectTrialRejected(input: Record<string, unknown>) {
  const dependencies = createParseDependencies();
  const service = createPilotService(dependencies.transaction);
  await expect(service.createTrialProduction('project-1', input, actor)).rejects.toMatchObject({
    response: { code: 'TRIAL_PRODUCTION_INPUT_OUT_OF_BOUNDS' },
  });
  expect(dependencies.transaction).not.toHaveBeenCalled();
}

async function expectTrialIssueRejected(input: Record<string, unknown>) {
  const dependencies = createParseDependencies();
  const service = createPilotService(dependencies.transaction);
  await expect(
    service.addTrialProductionIssue('project-1', 'trial-1', input, actor),
  ).rejects.toMatchObject({
    response: { code: 'TRIAL_PRODUCTION_ISSUE_INPUT_OUT_OF_BOUNDS' },
  });
  expect(dependencies.transaction).not.toHaveBeenCalled();
}

describe('bounded production execution inputs and reads', () => {
  it('adds conditional execution-plan and trial-table database bounds without truncation', () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        'prisma/migrations/20260811230000_bound_production_execution_records/migration.sql',
      ),
      'utf8',
    );

    expect(migration).toContain(
      '"planType" NOT IN (\'FIRST_UNIT\'::"ProductionPlanType", \'MASS_PRODUCTION\'::"ProductionPlanType")',
    );
    expect(migration).toContain('"actualQuantity" BETWEEN 0 AND 2147483647');
    expect(migration).toContain('ALTER COLUMN "trialNo" TYPE VARCHAR(64)');
    expect(migration).toContain('ALTER COLUMN "description" TYPE VARCHAR(4000)');
    expect(migration).toContain('"quantity" BETWEEN 0 AND 2147483647');
    expect(migration).not.toMatch(/\bUSING\b/iu);
  });

  it.each([
    ['workshop', 'W'.repeat(201)],
    ['lineName', 'L'.repeat(201)],
    ['ownerId', 'o'.repeat(65)],
    ['ownerId', 'owner / 1'],
    ['batchNo', 'B'.repeat(65)],
    ['batchNo', 'BATCH / 001'],
    ['exceptionNote', 'N'.repeat(4_001)],
    ['plannedQuantity', 2_147_483_648],
    ['plannedQuantity', 1.5],
    ['actualQuantity', 2_147_483_648],
    ['actualQuantity', -1],
    ['actualQuantity', 1.5],
  ])('rejects an unsafe mass-production %s before a transaction', async (field, value) => {
    await expectMassRejected({ ...massInput, [field]: value });
  });

  it.each([
    ['workshop', 'W'.repeat(201)],
    ['lineName', 'L'.repeat(201)],
    ['ownerId', 'o'.repeat(65)],
    ['ownerId', 'owner / 1'],
    ['batchNo', 'B'.repeat(65)],
    ['batchNo', 'FIRST / 001'],
    ['note', 'N'.repeat(4_001)],
    ['plannedQuantity', 2_147_483_648],
    ['plannedQuantity', 1.5],
  ])('rejects an unsafe first-unit plan %s before a transaction', async (field, value) => {
    await expectFirstPlanRejected({ ...firstPlanInput, [field]: value });
  });

  it.each([
    ['productionPlanId', 'p'.repeat(65)],
    ['productionPlanId', 'plan / 1'],
    ['vehicleNo', 'V'.repeat(65)],
    ['vehicleNo', 'TRIAL / 001'],
    ['workshop', 'W'.repeat(201)],
    ['paintBatchNo', 'P'.repeat(65)],
    ['paintBatchNo', 'PAINT / 001'],
    ['issueSummary', 'S'.repeat(4_001)],
    ['note', 'N'.repeat(4_001)],
  ])('rejects an unsafe trial-production %s before a transaction', async (field, value) => {
    await expectTrialRejected({ ...trialInput, [field]: value });
  });

  it('rejects a normalized trial payload larger than 16 KiB', async () => {
    await expectTrialRejected({
      ...trialInput,
      issueSummary: '界'.repeat(4_000),
      note: '界'.repeat(4_000),
    });
  });

  it.each([
    ['issueType', 'T'.repeat(501)],
    ['description', 'D'.repeat(4_001)],
    ['responsibleDept', 'R'.repeat(501)],
  ])('rejects an unsafe trial issue %s before a transaction', async (field, value) => {
    await expectTrialIssueRejected({ ...trialIssueInput, [field]: value });
  });

  it('accepts exact scalar boundaries until each write transaction', async () => {
    const cases = [
      {
        service: createMassService(createParseDependencies().transaction),
        invoke(service: MassProductionsService) {
          return service.createRecord(
            'project-1',
            {
              ...massInput,
              workshop: 'W'.repeat(200),
              lineName: 'L'.repeat(200),
              ownerId: 'o'.repeat(64),
              batchNo: 'B'.repeat(64),
              exceptionNote: 'N'.repeat(4_000),
              plannedQuantity: 2_147_483_647,
              actualQuantity: 2_147_483_647,
            },
            actor,
          );
        },
      },
      {
        service: createPilotService(createParseDependencies().transaction),
        invoke(service: PilotProductionsService) {
          return service.createFirstProductionPlan(
            'project-1',
            {
              ...firstPlanInput,
              workshop: 'W'.repeat(200),
              lineName: 'L'.repeat(200),
              ownerId: 'o'.repeat(64),
              batchNo: 'B'.repeat(64),
              note: 'N'.repeat(4_000),
              plannedQuantity: 2_147_483_647,
            },
            actor,
          );
        },
      },
      {
        service: createPilotService(createParseDependencies().transaction),
        invoke(service: PilotProductionsService) {
          return service.createTrialProduction(
            'project-1',
            {
              ...trialInput,
              productionPlanId: 'p'.repeat(64),
              vehicleNo: 'V'.repeat(64),
              workshop: 'W'.repeat(200),
              paintBatchNo: 'P'.repeat(64),
              issueSummary: 'S'.repeat(4_000),
              note: 'N'.repeat(4_000),
            },
            actor,
          );
        },
      },
      {
        service: createPilotService(createParseDependencies().transaction),
        invoke(service: PilotProductionsService) {
          return service.addTrialProductionIssue(
            'project-1',
            'trial-1',
            {
              ...trialIssueInput,
              issueType: 'T'.repeat(500),
              description: 'D'.repeat(4_000),
              responsibleDept: 'R'.repeat(500),
            },
            actor,
          );
        },
      },
    ] as const;

    for (const item of cases) {
      await expect(item.invoke(item.service as never)).rejects.toThrow(
        'write transaction reached',
      );
    }
  });

  it.each([
    {
      label: 'mass-production record',
      expectedCode: 'MASS_PRODUCTION_RECORD_LIMIT_EXCEEDED',
      createHarness() {
        const tx = {
          productionPlan: { create: vi.fn() },
          user: { findUnique: vi.fn() },
        };
        const transaction = vi.fn(async (executor: (client: typeof tx) => unknown) =>
          executor(tx),
        );
        const service = createMassService(transaction);
        Reflect.set(
          service,
          'lockActiveTaskAndGetContext',
          vi.fn().mockResolvedValue({ items: Array.from({ length: 100 }) }),
        );
        return {
          invoke: () => service.createRecord('project-1', massInput, actor),
          write: tx.productionPlan.create,
        };
      },
    },
    {
      label: 'first-unit plan',
      expectedCode: 'FIRST_PRODUCTION_PLAN_RECORD_LIMIT_EXCEEDED',
      createHarness() {
        const tx = {
          productionPlan: { create: vi.fn() },
          user: { findUnique: vi.fn() },
        };
        const transaction = vi.fn(async (executor: (client: typeof tx) => unknown) =>
          executor(tx),
        );
        const service = createPilotService(transaction);
        Reflect.set(
          service,
          'lockFirstProductionPlanTaskAndGetContext',
          vi.fn().mockResolvedValue({ items: Array.from({ length: 100 }) }),
        );
        return {
          invoke: () =>
            service.createFirstProductionPlan('project-1', firstPlanInput, actor),
          write: tx.productionPlan.create,
        };
      },
    },
    {
      label: 'trial-production record',
      expectedCode: 'TRIAL_PRODUCTION_RECORD_LIMIT_EXCEEDED',
      createHarness() {
        const tx = {
          trialProduction: { create: vi.fn() },
          productionPlan: { findFirst: vi.fn() },
        };
        const transaction = vi.fn(async (executor: (client: typeof tx) => unknown) =>
          executor(tx),
        );
        const service = createPilotService(transaction);
        Reflect.set(
          service,
          'lockTrialProductionTaskAndGetContext',
          vi.fn().mockResolvedValue({ items: Array.from({ length: 100 }) }),
        );
        return {
          invoke: () => service.createTrialProduction('project-1', trialInput, actor),
          write: tx.trialProduction.create,
        };
      },
    },
  ])('rejects the 101st $label after task lock and before persistence', async (testCase) => {
    const harness = testCase.createHarness();
    await expect(harness.invoke()).rejects.toMatchObject({
      response: { code: testCase.expectedCode },
    });
    expect(harness.write).not.toHaveBeenCalled();
  });

  it('rejects the 101st issue after row and task locks and before persistence', async () => {
    const trial = {
      id: 'trial-1',
      status: TrialProductionStatus.IN_PROGRESS,
      _count: { issues: 100 },
    };
    const tx = { trialProductionIssue: { create: vi.fn() } };
    const transaction = vi.fn(async (executor: (client: typeof tx) => unknown) =>
      executor(tx),
    );
    const service = createPilotService(transaction);
    Reflect.set(service, 'lockTrialProductionRow', vi.fn().mockResolvedValue(undefined));
    Reflect.set(
      service,
      'getTrialProductionForMutationOrThrow',
      vi.fn().mockResolvedValue(trial),
    );
    Reflect.set(
      service,
      'lockTrialProductionTaskAndGetContext',
      vi.fn().mockResolvedValue({ items: [] }),
    );

    await expect(
      service.addTrialProductionIssue('project-1', 'trial-1', trialIssueInput, actor),
    ).rejects.toMatchObject({
      response: { code: 'TRIAL_PRODUCTION_ISSUE_LIMIT_EXCEEDED' },
    });
    expect(tx.trialProductionIssue.create).not.toHaveBeenCalled();
  });

  it('bounds mass, first-plan, and trial context reads to a 101-row sentinel', async () => {
    const massFindMany = vi.fn().mockResolvedValue(Array.from({ length: 101 }));
    const mass = createMassService(vi.fn());
    const massDb = {
      project: { findUnique: vi.fn().mockResolvedValue({ id: 'project-1' }) },
      workflowTask: { findFirst: vi.fn().mockResolvedValue(null) },
      productionPlan: { findMany: massFindMany },
    };
    await expect(
      Reflect.get(mass, 'getMassProductionContext').call(mass, massDb, 'project-1'),
    ).rejects.toMatchObject({
      response: { code: 'MASS_PRODUCTION_RECORD_LIMIT_EXCEEDED' },
    });
    expect(massFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 101 }));

    for (const kind of ['first', 'trial'] as const) {
      const findMany = vi.fn().mockResolvedValue(Array.from({ length: 101 }));
      const pilot = createPilotService(vi.fn());
      const pilotDb = {
        project: { findUnique: vi.fn().mockResolvedValue({ id: 'project-1' }) },
        workflowTask: { findFirst: vi.fn().mockResolvedValue(null) },
        productionPlan: { findMany: kind === 'first' ? findMany : vi.fn() },
        trialProduction: { findMany: kind === 'trial' ? findMany : vi.fn() },
      };
      const method =
        kind === 'first' ? 'getFirstProductionPlanContext' : 'getTrialProductionContext';
      const expectedCode =
        kind === 'first'
          ? 'FIRST_PRODUCTION_PLAN_RECORD_LIMIT_EXCEEDED'
          : 'TRIAL_PRODUCTION_RECORD_LIMIT_EXCEEDED';

      await expect(
        Reflect.get(pilot, method).call(pilot, pilotDb, 'project-1'),
      ).rejects.toMatchObject({ response: { code: expectedCode } });
      expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 101 }));
    }
  });

  it('bounds and fail-closes nested issue reads for trial detail', async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: 'trial-1',
      issues: Array.from({ length: 101 }),
      _count: { issues: 101 },
    });
    const service = createPilotService(vi.fn());

    await expect(
      Reflect.get(service, 'getTrialProductionOrThrow').call(
        service,
        { trialProduction: { findFirst } },
        'project-1',
        'trial-1',
      ),
    ).rejects.toMatchObject({
      response: { code: 'TRIAL_PRODUCTION_ISSUE_LIMIT_EXCEEDED' },
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          issues: expect.objectContaining({ take: 101 }),
        }),
      }),
    );
  });

  it('returns only issue counts from the trial workspace query', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: 'trial-1',
        productionPlanId: null,
        productionPlan: null,
        trialNo: 'TRIAL-001',
        location: '试制车间',
        plannedAt: new Date('2026-08-12T00:00:00.000Z'),
        paintBatchNo: 'PAINT-001',
        summary: '无阻塞问题',
        result: TrialProductionResult.PASS,
        status: TrialProductionStatus.PASSED,
        note: null,
        startedAt: new Date('2026-08-12T00:00:00.000Z'),
        completedAt: new Date('2026-08-12T01:00:00.000Z'),
        createdAt: new Date('2026-08-12T00:00:00.000Z'),
        updatedAt: new Date('2026-08-12T01:00:00.000Z'),
        _count: { issues: 7 },
      },
    ]);
    const service = createPilotService(vi.fn());
    const db = {
      project: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'project-1',
          code: 'PRJ-001',
          name: '示例项目',
          currentNodeCode: null,
          plannedEndDate: null,
          priority: 'NORMAL',
        }),
      },
      workflowTask: { findFirst: vi.fn().mockResolvedValue(null) },
      productionPlan: { findMany: vi.fn().mockResolvedValue([]) },
      trialProduction: { findMany },
    };

    const workspace = await Reflect.get(service, 'buildTrialProductionWorkspace').call(
      service,
      db,
      'project-1',
    );

    expect(workspace.items[0]).toMatchObject({ id: 'trial-1', issueCount: 7 });
    expect(workspace.items[0]).not.toHaveProperty('issues');
    const query = findMany.mock.calls[0]?.[0];
    expect(query).toMatchObject({
      take: 101,
      select: {
        _count: { select: { issues: true } },
      },
    });
    expect(query).not.toHaveProperty('include.issues');
  });

  it('keeps issue bodies out of trial create return reads', async () => {
    const createdTrial = {
      id: 'trial-1',
      productionPlanId: null,
      productionPlan: null,
      trialNo: 'TRIAL-001',
      status: TrialProductionStatus.PLANNED,
      location: '试制车间',
      plannedAt: new Date('2026-08-12T00:00:00.000Z'),
      paintBatchNo: 'PAINT-001',
      result: TrialProductionResult.PASS,
      summary: '无阻塞问题',
      note: null,
      startedAt: null,
      completedAt: null,
      createdAt: new Date('2026-08-12T00:00:00.000Z'),
      updatedAt: new Date('2026-08-12T00:00:00.000Z'),
      _count: { issues: 0 },
    };
    const tx = {
      trialProduction: { create: vi.fn().mockResolvedValue(createdTrial) },
    };
    installTeamAuthorizationFixture(tx, [actor]);
    const transaction = vi.fn(async (executor: (client: typeof tx) => unknown) =>
      executor(tx),
    );
    const activityLogs = { createWithExecutor: vi.fn() };
    const service = new PilotProductionsService(
      { $transaction: transaction } as never,
      activityLogs as never,
      {} as never,
      {
        assertProjectAccessWithDefaultClient: vi
          .fn()
          .mockResolvedValue({ id: 'project-1' }),
      } as never,
    );
    Reflect.set(
      service,
      'lockTrialProductionTaskAndGetContext',
      vi.fn().mockResolvedValue({ items: [], activeTask: { id: 'trial-task-bounds' } }),
    );
    Reflect.set(service, 'assertValidTrialProductionPlan', vi.fn());
    Reflect.set(service, 'assertUniqueVehicleNo', vi.fn());
    Reflect.set(service, 'buildTrialProductionWorkspace', vi.fn().mockResolvedValue({}));

    await service.createTrialProduction('project-1', trialInput, actor);

    const query = tx.trialProduction.create.mock.calls[0]?.[0];
    expect(query).toMatchObject({
      include: { _count: { select: { issues: true } } },
    });
    expect(query).not.toHaveProperty('include.issues');
    expect(activityLogs.createWithExecutor).toHaveBeenCalledTimes(1);
  });

  it('keeps schedule plans outside the new execution-only production-plan check', () => {
    expect(ProductionPlanType.SCHEDULE).toBe('SCHEDULE');
  });
});
