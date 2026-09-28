import { DevelopmentFeeType, WorkflowNodeCode } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { installTeamAuthorizationFixture } from '../test-support/team-authorization.fixture';

import { FeesService } from './fees/fees.service';
import { PaintProcurementsService } from './paint-procurements/paint-procurements.service';
import { ProductionPlansService } from './production-plans/production-plans.service';

const actor = {
  authSource: 'local', authVersion: 1,
  id: 'admin-1',
  roleCodes: ['admin'],
  permissionCodes: ['project.read', 'workflow.transition'],
  isSystemAdmin: false,
} as never;

const feeInput = {
  feeType: DevelopmentFeeType.TESTING,
  amount: '10000.00',
  currency: 'CNY',
  payer: '财务部',
  note: '收费说明',
  recordedAt: '2026-08-11T00:00:00.000Z',
};

const procurementInput = {
  supplierId: 'supplier-1',
  procurementCode: 'PROC-001',
  materialName: '星云蓝色漆',
  batchNo: 'BATCH-001',
  quantity: '100.000',
  unit: 'kg',
  arrivalDate: '2026-08-20T00:00:00.000Z',
  note: '采购说明',
};

const planInput = {
  workshop: '一号车间',
  lineName: '轻卡一线',
  ownerId: 'owner-1',
  batchNo: 'PLAN-BATCH-001',
  note: '排产说明',
  plannedQuantity: 100,
  planDate: '2026-08-25T00:00:00.000Z',
};

function createDependencies() {
  const transaction = vi.fn().mockRejectedValue(new Error('write transaction reached'));
  const projectAccess = {
    assertProjectAccessWithDefaultClient: vi.fn().mockResolvedValue({ id: 'project-1' }),
  };

  return { transaction, projectAccess };
}

function createCapacityDependencies() {
  const tx = {
    developmentFee: { create: vi.fn() },
    paintProcurement: { create: vi.fn() },
    productionPlan: { create: vi.fn() },
  };
  installTeamAuthorizationFixture(tx, [actor]);
  const transaction = vi.fn(
    async (executor: (client: typeof tx) => Promise<unknown>) => executor(tx),
  );
  const activityLogs = { createWithExecutor: vi.fn() };
  const projectAccess = {
    assertProjectAccessWithDefaultClient: vi.fn().mockResolvedValue({ id: 'project-1' }),
  };

  return { tx, transaction, activityLogs, projectAccess };
}

async function expectFeeRejected(input: Record<string, unknown>) {
  const dependencies = createDependencies();
  const service = new FeesService(
    { $transaction: dependencies.transaction } as never,
    {} as never,
    {} as never,
    dependencies.projectAccess as never,
  );

  await expect(service.createFee('project-1', input, actor)).rejects.toMatchObject({
    response: { code: 'FEE_INPUT_OUT_OF_BOUNDS' },
  });
  expect(dependencies.transaction).not.toHaveBeenCalled();
}

async function expectProcurementRejected(input: Record<string, unknown>) {
  const dependencies = createDependencies();
  const service = new PaintProcurementsService(
    { $transaction: dependencies.transaction } as never,
    {} as never,
    {} as never,
    dependencies.projectAccess as never,
  );

  await expect(service.createProcurement('project-1', input, actor)).rejects.toMatchObject({
    response: { code: 'PAINT_PROCUREMENT_INPUT_OUT_OF_BOUNDS' },
  });
  expect(dependencies.transaction).not.toHaveBeenCalled();
}

async function expectPlanRejected(input: Record<string, unknown>) {
  const dependencies = createDependencies();
  const service = new ProductionPlansService(
    { $transaction: dependencies.transaction } as never,
    {} as never,
    {} as never,
    dependencies.projectAccess as never,
  );

  await expect(service.createSchedulePlan('project-1', input, actor)).rejects.toMatchObject({
    response: { code: 'PRODUCTION_PLAN_INPUT_OUT_OF_BOUNDS' },
  });
  expect(dependencies.transaction).not.toHaveBeenCalled();
}

describe('bounded purchasing and planning inputs', () => {
  it('migrates scalar bounds without truncating legacy values', () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        'prisma/migrations/20260811220000_bound_purchasing_planning_records/migration.sql',
      ),
      'utf8',
    );

    expect(migration).toContain('ALTER COLUMN "currency" TYPE VARCHAR(3)');
    expect(migration).toContain('ALTER COLUMN "procurementNo" TYPE VARCHAR(64)');
    expect(migration).toContain('"planNo" ~ \'^[A-Za-z0-9._-]{1,64}$\'');
    expect(migration).toContain('char_length("lineName") BETWEEN 1 AND 200');
    expect(migration).toContain('char_length("remark") <= 4000');
    expect(migration).toContain('"planType" <> \'SCHEDULE\'::"ProductionPlanType"');
    expect(migration).not.toMatch(/\bUSING\b/iu);
  });

  it('accepts exact scalar boundaries until the fee write transaction', async () => {
    const dependencies = createDependencies();
    const service = new FeesService(
      { $transaction: dependencies.transaction } as never,
      {} as never,
      {} as never,
      dependencies.projectAccess as never,
    );

    await expect(
      service.createFee(
        'project-1',
        {
          ...feeInput,
          amount: `${'9'.repeat(16)}.99`,
          payer: 'P'.repeat(200),
          note: 'N'.repeat(4_000),
        },
        actor,
      ),
    ).rejects.toThrow('write transaction reached');
    expect(dependencies.transaction).toHaveBeenCalledTimes(1);
  });

  it('accepts exact scalar boundaries until the procurement write transaction', async () => {
    const dependencies = createDependencies();
    const service = new PaintProcurementsService(
      { $transaction: dependencies.transaction } as never,
      {} as never,
      {} as never,
      dependencies.projectAccess as never,
    );

    await expect(
      service.createProcurement(
        'project-1',
        {
          ...procurementInput,
          supplierId: 's'.repeat(64),
          procurementCode: 'P'.repeat(64),
          materialName: 'M'.repeat(200),
          batchNo: 'B'.repeat(64),
          quantity: `${'9'.repeat(15)}.999`,
          unit: 'U'.repeat(32),
          note: 'N'.repeat(4_000),
        },
        actor,
      ),
    ).rejects.toThrow('write transaction reached');
    expect(dependencies.transaction).toHaveBeenCalledTimes(1);
  });

  it('accepts exact scalar boundaries until the production-plan write transaction', async () => {
    const dependencies = createDependencies();
    const service = new ProductionPlansService(
      { $transaction: dependencies.transaction } as never,
      {} as never,
      {} as never,
      dependencies.projectAccess as never,
    );

    await expect(
      service.createSchedulePlan(
        'project-1',
        {
          ...planInput,
          workshop: 'W'.repeat(200),
          lineName: 'L'.repeat(200),
          ownerId: 'o'.repeat(64),
          batchNo: 'B'.repeat(64),
          note: 'N'.repeat(4_000),
          plannedQuantity: 2_147_483_647,
        },
        actor,
      ),
    ).rejects.toThrow('write transaction reached');
    expect(dependencies.transaction).toHaveBeenCalledTimes(1);
  });

  it('loads only one latest workflow task for each fixed procurement downstream node', async () => {
    const workflowTask = {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn(),
    };
    const prisma = {
      project: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'project-1',
          code: 'PRJ-001',
          name: '项目 A',
          currentNodeCode: WorkflowNodeCode.PAINT_PROCUREMENT,
          plannedEndDate: null,
          priority: 'NORMAL',
        }),
      },
      paintProcurement: { findMany: vi.fn().mockResolvedValue([]) },
      supplier: { findMany: vi.fn().mockResolvedValue([]) },
      workflowTask,
    };
    const projectAccess = {
      assertProjectAccessWithDefaultClient: vi.fn().mockResolvedValue({ id: 'project-1' }),
    };
    const service = new PaintProcurementsService(
      prisma as never,
      {} as never,
      {} as never,
      projectAccess as never,
    );

    await service.getWorkspace('project-1', actor);

    expect(workflowTask.findMany).not.toHaveBeenCalled();
    expect(workflowTask.findFirst).toHaveBeenCalledTimes(4);
    for (const nodeCode of [
      WorkflowNodeCode.FIRST_UNIT_PRODUCTION_PLAN,
      WorkflowNodeCode.PERFORMANCE_TEST,
      WorkflowNodeCode.STANDARD_BOARD_PRODUCTION,
    ]) {
      expect(workflowTask.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { projectId: 'project-1', nodeCode } }),
      );
    }
  });

  it.each([
    ['currency', 'USDX'],
    ['currency', 'C1Y'],
    ['payer', 'P'.repeat(201)],
    ['note', 'N'.repeat(4_001)],
    ['amount', '9'.repeat(17)],
    ['amount', '1.234'],
  ])('rejects an unsafe fee %s before opening a transaction', async (field, value) => {
    await expectFeeRejected({ ...feeInput, [field]: value });
  });

  it.each([
    ['supplierId', 's'.repeat(65)],
    ['procurementCode', 'P'.repeat(65)],
    ['procurementCode', 'PROC / 001'],
    ['materialName', 'M'.repeat(201)],
    ['batchNo', 'B'.repeat(65)],
    ['unit', 'U'.repeat(33)],
    ['note', 'N'.repeat(4_001)],
    ['quantity', '9'.repeat(16)],
    ['quantity', '1.2345'],
  ])('rejects an unsafe procurement %s before opening a transaction', async (field, value) => {
    await expectProcurementRejected({ ...procurementInput, [field]: value });
  });

  it.each([
    ['workshop', 'W'.repeat(201)],
    ['lineName', 'L'.repeat(201)],
    ['ownerId', 'o'.repeat(65)],
    ['batchNo', 'B'.repeat(65)],
    ['note', 'N'.repeat(4_001)],
    ['plannedQuantity', 2_147_483_648],
    ['plannedQuantity', 1.5],
  ])('rejects an unsafe production plan %s before opening a transaction', async (field, value) => {
    await expectPlanRejected({ ...planInput, [field]: value });
  });

  it.each([
    {
      label: 'fee',
      input: feeInput,
      expectedCode: 'DEVELOPMENT_FEE_RECORD_LIMIT_EXCEEDED',
      createService: (dependencies: ReturnType<typeof createCapacityDependencies>) => {
        const service = new FeesService(
          { $transaction: dependencies.transaction } as never,
          dependencies.activityLogs as never,
          {} as never,
          dependencies.projectAccess as never,
        );
        Reflect.set(
          service,
          'lockActiveFeeTaskAndGetContext',
          vi.fn().mockResolvedValue({ records: Array.from({ length: 100 }) }),
        );
        return service;
      },
      invoke: (service: FeesService) => service.createFee('project-1', feeInput, actor),
      writeModel: 'developmentFee' as const,
    },
    {
      label: 'paint procurement',
      input: procurementInput,
      expectedCode: 'PAINT_PROCUREMENT_RECORD_LIMIT_EXCEEDED',
      createService: (dependencies: ReturnType<typeof createCapacityDependencies>) => {
        const service = new PaintProcurementsService(
          { $transaction: dependencies.transaction } as never,
          dependencies.activityLogs as never,
          {} as never,
          dependencies.projectAccess as never,
        );
        Reflect.set(
          service,
          'lockActiveProcurementTaskAndGetContext',
          vi.fn().mockResolvedValue({ records: Array.from({ length: 100 }) }),
        );
        return service;
      },
      invoke: (service: PaintProcurementsService) =>
        service.createProcurement('project-1', procurementInput, actor),
      writeModel: 'paintProcurement' as const,
    },
    {
      label: 'production plan',
      input: planInput,
      expectedCode: 'PRODUCTION_PLAN_RECORD_LIMIT_EXCEEDED',
      createService: (dependencies: ReturnType<typeof createCapacityDependencies>) => {
        const service = new ProductionPlansService(
          { $transaction: dependencies.transaction } as never,
          dependencies.activityLogs as never,
          {} as never,
          dependencies.projectAccess as never,
        );
        Reflect.set(
          service,
          'lockActiveScheduleTaskAndGetContext',
          vi.fn().mockResolvedValue({
            activeTask: { id: 'task-1', status: 'IN_PROGRESS' },
            items: Array.from({ length: 100 }),
          }),
        );
        return service;
      },
      invoke: (service: ProductionPlansService) =>
        service.createSchedulePlan('project-1', planInput, actor),
      writeModel: 'productionPlan' as const,
    },
  ])(
    'rejects the 101st $label record before domain or audit persistence',
    async ({ expectedCode, createService, invoke, writeModel }) => {
      const dependencies = createCapacityDependencies();
      const service = createService(dependencies) as never;

      await expect(invoke(service)).rejects.toMatchObject({
        response: { code: expectedCode },
      });
      expect(dependencies.tx[writeModel].create).not.toHaveBeenCalled();
      expect(dependencies.activityLogs.createWithExecutor).not.toHaveBeenCalled();
    },
  );
});
