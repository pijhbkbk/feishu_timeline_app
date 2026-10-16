import { installTeamAuthorizationFixture } from '../test-support/team-authorization.fixture';
import {
  DevelopmentFeeStatus,
  DevelopmentFeeType,
  Prisma,
  ProcurementStatus,
  ProductionPlanStatus,
  ProductionPlanType,
  SupplierStatus,
  UserStatus,
  WorkflowAction,
  WorkflowNodeCode,
  WorkflowTaskStatus,
} from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { FeesService } from './fees/fees.service';
import { PaintProcurementsService } from './paint-procurements/paint-procurements.service';
import { ProductionPlansService } from './production-plans/production-plans.service';

type DomainService = FeesService | PaintProcurementsService | ProductionPlansService;
type DomainRecord = Record<string, unknown> & {
  id: string;
  projectId: string;
  updatedAt: Date;
};

type HarnessTask = {
  id: string;
  projectId: string;
  workflowInstanceId: string;
  nodeCode: WorkflowNodeCode;
  nodeName: string;
  taskNo: string;
  taskRound: number;
  status: WorkflowTaskStatus;
  isActive: boolean;
  isPrimary: boolean;
  assigneeUserId: string | null;
  assigneeDepartmentId: string | null;
  assigneeUser: null;
  assigneeDepartment: null;
  dueAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  returnedAt: Date | null;
  payload: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

type DomainCase = {
  label: string;
  tableName: string;
  modelName: 'paintProcurement' | 'developmentFee' | 'productionPlan';
  statusField: 'status' | 'payStatus';
  nodeCode: WorkflowNodeCode;
  createdStatus: string;
  completionReadyStatus: string;
  transitionStartStatus: string;
  transitionWinnerStatus: string;
  createAuditAction: string;
  updateAuditAction: string;
  transitionAuditAction: string;
  cancelAuditAction: string;
  actor: {
    authVersion: number;
    authSource: 'local';
    teamAccessApproved: boolean;
    id: string;
    roleCodes: string[];
    permissionCodes: string[];
    isSystemAdmin: boolean;
  };
  makeRecord: (status: string, overrides?: Record<string, unknown>) => DomainRecord;
  createService: (
    prisma: Record<string, unknown>,
    activityLogs: Record<string, unknown>,
    workflows: Record<string, unknown>,
    projectAccess: Record<string, unknown>,
  ) => DomainService;
  stubWorkspace: (service: DomainService) => void;
  create: (service: DomainService, actor: DomainCase['actor']) => Promise<unknown>;
  update: (service: DomainService, actor: DomainCase['actor']) => Promise<unknown>;
  transition: (service: DomainService, actor: DomainCase['actor']) => Promise<unknown>;
  cancel: (service: DomainService, actor: DomainCase['actor']) => Promise<unknown>;
  complete: (service: DomainService, actor: DomainCase['actor']) => Promise<unknown>;
};

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

function createRowLock() {
  let holder: symbol | null = null;
  const waiters: Array<{ owner: symbol; resolve: () => void }> = [];

  return {
    async acquire(owner: symbol) {
      if (holder === owner) return;
      if (holder === null) {
        holder = owner;
        return;
      }
      await new Promise<void>((resolve) => {
        waiters.push({ owner, resolve });
      });
    },
    release(owner: symbol) {
      if (holder !== owner) return;
      const next = waiters.shift();
      if (!next) {
        holder = null;
        return;
      }
      holder = next.owner;
      next.resolve();
    },
  };
}

function createDomainHarness(
  domain: DomainCase,
  initialStatus: string,
  pause: 'complete' | 'transition',
) {
  const taskLock = createRowLock();
  const domainLock = createRowLock();
  const primaryPaused = createDeferred<void>();
  const releasePrimary = createDeferred<void>();
  const secondOperationObserved = createDeferred<void>();
  const transactionOwners = new WeakMap<object, symbol>();
  const auditActions: string[] = [];
  let transactionSequence = 0;
  let mutationSequence = 0;
  const records = [domain.makeRecord(initialStatus)];
  let activeTask: HarnessTask = {
    id: 'task-1',
    projectId: 'project-1',
    workflowInstanceId: 'workflow-1',
    nodeCode: domain.nodeCode,
    nodeName: domain.label,
    taskNo: 'TASK-001',
    taskRound: 1,
    status: WorkflowTaskStatus.IN_PROGRESS,
    isActive: true,
    isPrimary: true,
    assigneeUserId: domain.actor.id,
    assigneeDepartmentId: null,
    assigneeUser: null,
    assigneeDepartment: null,
    dueAt: null,
    startedAt: null,
    completedAt: null,
    returnedAt: null,
    payload: {},
    createdAt: new Date('2026-08-11T06:00:00.000Z'),
    updatedAt: new Date('2026-08-11T06:00:00.000Z'),
  };

  function currentRecord() {
    return records[0] ?? null;
  }

  function matchesRecordWhere(record: DomainRecord, where: Record<string, unknown>) {
    if (where.id && record.id !== where.id) return false;
    if (where.projectId && record.projectId !== where.projectId) return false;
    if (
      where.procurementCode !== undefined &&
      record.procurementCode !== where.procurementCode
    ) {
      return false;
    }
    if (
      where[domain.statusField] !== undefined &&
      record[domain.statusField] !== where[domain.statusField]
    ) {
      return false;
    }
    if (
      where.updatedAt instanceof Date &&
      record.updatedAt.getTime() !== where.updatedAt.getTime()
    ) {
      return false;
    }
    if (
      where.planType !== undefined &&
      record.planType !== where.planType
    ) {
      return false;
    }
    return true;
  }

  const prisma = {
    $transaction: vi.fn(
      async (executor: (tx: Record<string, unknown>) => Promise<unknown>) => {
        const transactionNumber = ++transactionSequence;
        const owner = Symbol(`tx-${transactionNumber}`);
        const model = {
          findMany: vi.fn(async () => records.map((record) => ({ ...record }))),
          findFirst: vi.fn(async (args: { where: Record<string, unknown> }) => {
            const record = records.find((candidate) =>
              matchesRecordWhere(candidate, args.where),
            );
            return record ? { ...record } : null;
          }),
          findUniqueOrThrow: vi.fn(
            async (args: { where: Record<string, unknown> }) => {
              const record = records.find((candidate) =>
                matchesRecordWhere(candidate, args.where),
              );
              if (!record) throw new Error('DOMAIN_RECORD_NOT_FOUND');
              return { ...record };
            },
          ),
          create: vi.fn(async (args: { data: Record<string, unknown> }) => {
            const created = domain.makeRecord(domain.createdStatus, {
              ...args.data,
              id: 'record-created-during-race',
              updatedAt: new Date('2026-08-11T06:01:00.000Z'),
            });
            records.push(created);
            if (transactionNumber === 2) secondOperationObserved.resolve();
            return { ...created };
          }),
          update: vi.fn(
            async (args: {
              where: Record<string, unknown>;
              data: Record<string, unknown>;
            }) => {
              const isStatusMutation =
                args.data[domain.statusField] !== undefined;
              if (
                transactionNumber === 1 &&
                pause === 'transition' &&
                isStatusMutation
              ) {
                primaryPaused.resolve();
                await releasePrimary.promise;
              }
              await domainLock.acquire(owner);
              const index = records.findIndex((record) =>
                matchesRecordWhere(record, args.where),
              );
              if (index < 0) throw new Error('DOMAIN_RECORD_NOT_FOUND');
              const record = records[index]!;
              records[index] = {
                ...record,
                ...args.data,
                updatedAt: new Date(
                  Date.parse('2026-08-11T06:02:00.000Z') + ++mutationSequence,
                ),
              };
              if (transactionNumber === 2) secondOperationObserved.resolve();
              return { ...records[index] };
            },
          ),
          updateMany: vi.fn(
            async (args: {
              where: Record<string, unknown>;
              data: Record<string, unknown>;
            }) => {
              const isStatusMutation =
                args.data[domain.statusField] !== undefined;
              if (
                transactionNumber === 1 &&
                pause === 'transition' &&
                isStatusMutation
              ) {
                primaryPaused.resolve();
                await releasePrimary.promise;
              }
              await domainLock.acquire(owner);
              const index = records.findIndex((record) =>
                matchesRecordWhere(record, args.where),
              );
              if (index < 0) return { count: 0 };
              const record = records[index]!;
              records[index] = {
                ...record,
                ...args.data,
                updatedAt: new Date(
                  Date.parse('2026-08-11T06:02:00.000Z') + ++mutationSequence,
                ),
              };
              if (transactionNumber === 2) secondOperationObserved.resolve();
              return { count: 1 };
            },
          ),
        };
        const tx = {
          $queryRaw: vi.fn(async (query: { strings?: readonly string[] }) => {
            const sql = query.strings?.join('') ?? '';
            if (sql.includes(`FROM "${domain.tableName}"`)) {
              if (transactionNumber === 2) secondOperationObserved.resolve();
              await domainLock.acquire(owner);
              return currentRecord() ? [{ id: currentRecord()!.id }] : [];
            }
            if (sql.includes('FROM "workflow_tasks"') || sql.includes('FROM workflow_tasks')) {
              if (transactionNumber === 2) secondOperationObserved.resolve();
              await taskLock.acquire(owner);
              return activeTask.isActive ? [{ id: activeTask.id }] : [];
            }
            return [];
          }),
          project: {
            findUnique: vi.fn().mockImplementation(async () => ({
              id: 'project-1',
              code: 'PRJ-001',
              name: '项目 A',
              priority: 'NORMAL',
              currentNodeCode: activeTask.isActive ? domain.nodeCode : null,
              plannedEndDate: null,
            })),
          },
          workflowTask: {
            findFirst: vi.fn(
              async (args: { where: Record<string, unknown> }) => {
                if (args.where.id) {
                  if (args.where.id !== activeTask.id) return null;
                  if (
                    args.where.isActive !== undefined &&
                    args.where.isActive !== activeTask.isActive
                  ) {
                    return null;
                  }
                  return { ...activeTask };
                }
                if (
                  args.where.nodeCode === domain.nodeCode &&
                  args.where.isActive === true
                ) {
                  return activeTask.isActive ? { ...activeTask } : null;
                }
                if (args.where.status) {
                  return { id: 'completed-predecessor' };
                }
                return null;
              },
            ),
            findMany: vi.fn().mockResolvedValue([]),
          },
          supplier: {
            findUnique: vi.fn().mockResolvedValue({
              id: 'supplier-1',
              supplierCode: 'SUP-001',
              supplierName: '供应商 A',
              status: SupplierStatus.ACTIVE,
              contactName: null,
              contactPhone: null,
              address: null,
              createdAt: new Date('2026-08-11T06:00:00.000Z'),
              updatedAt: new Date('2026-08-11T06:00:00.000Z'),
            }),
          },
          user: {
            findUnique: vi.fn().mockResolvedValue({
              id: 'owner-1',
              status: UserStatus.ACTIVE,
            }),
          },
          systemParameter: {
            findUnique: vi.fn().mockResolvedValue({
              valueType: 'NUMBER',
              valueNumber: new Prisma.Decimal(10000),
            }),
          },
          [domain.modelName]: model,
        };
        installTeamAuthorizationFixture(tx, [domain.actor], id => id === activeTask.id ? { ...activeTask } : null);
        transactionOwners.set(tx, owner);
        try {
          return await executor(tx);
        } finally {
          taskLock.release(owner);
          domainLock.release(owner);
        }
      },
    ),
  };
  const activityLogs = {
    createWithExecutor: vi.fn(
      async (_tx: unknown, input: { action: string }) => {
        auditActions.push(input.action);
        return { id: `audit-${auditActions.length}` };
      },
    ),
  };
  const workflows = {
    transitionTaskWithExecutor: vi.fn(
      async (
        tx: Record<string, unknown>,
        _taskId: string,
        action: WorkflowAction,
      ) => {
        const owner = transactionOwners.get(tx);
        if (!owner) throw new Error('TRANSACTION_OWNER_NOT_FOUND');
        if (action === WorkflowAction.COMPLETE && pause === 'complete') {
          primaryPaused.resolve();
          await releasePrimary.promise;
        }
        await taskLock.acquire(owner);
        if (!activeTask.isActive) throw new Error('TASK_ALREADY_TERMINAL');
        if (action === WorkflowAction.START) {
          activeTask = {
            ...activeTask,
            status: WorkflowTaskStatus.IN_PROGRESS,
            updatedAt: new Date('2026-08-11T06:03:00.000Z'),
          };
          return;
        }
        activeTask = {
          ...activeTask,
          status: WorkflowTaskStatus.COMPLETED,
          isActive: false,
          completedAt: new Date('2026-08-11T06:03:00.000Z'),
          updatedAt: new Date('2026-08-11T06:03:00.000Z'),
        };
      },
    ),
  };
  const projectAccess = {
    assertProjectAccessWithDefaultClient: vi
      .fn()
      .mockResolvedValue({ id: 'project-1' }),
  };
  const service = domain.createService(
    prisma as never,
    activityLogs as never,
    workflows as never,
    projectAccess as never,
  );
  domain.stubWorkspace(service);

  return {
    service,
    primaryPaused,
    releasePrimary,
    secondOperationObserved,
    getState() {
      return {
        task: { ...activeTask },
        records: records.map((record) => ({ ...record })),
        auditActions: [...auditActions],
      };
    },
  };
}

const baseDate = new Date('2026-08-11T06:00:00.000Z');

const domainCases: DomainCase[] = [
  {
    label: 'paint procurement',
    tableName: 'paint_procurements',
    modelName: 'paintProcurement',
    statusField: 'status',
    nodeCode: WorkflowNodeCode.PAINT_PROCUREMENT,
    createdStatus: ProcurementStatus.DRAFT,
    completionReadyStatus: ProcurementStatus.ARRIVED,
    transitionStartStatus: ProcurementStatus.ORDERED,
    transitionWinnerStatus: ProcurementStatus.ARRIVED,
    createAuditAction: 'PAINT_PROCUREMENT_CREATED',
    updateAuditAction: 'PAINT_PROCUREMENT_UPDATED',
    transitionAuditAction: 'PAINT_PROCUREMENT_ARRIVED',
    cancelAuditAction: 'PAINT_PROCUREMENT_CANCELLED',
    actor: {
      authVersion: 1,
      teamAccessApproved: true, authSource: 'local',
      id: 'purchaser-1',
      roleCodes: ['purchaser'],
      permissionCodes: ['project.read', 'workflow.transition'],
      isSystemAdmin: false,
    },
    makeRecord: (status, overrides = {}) => ({
      id: 'record-1',
      projectId: 'project-1',
      supplierId: 'supplier-1',
      supplier: { id: 'supplier-1', supplierName: '供应商 A' },
      procurementCode: 'PO-001',
      materialName: '涂料 A',
      batchNo: 'BATCH-001',
      status,
      quantity: new Prisma.Decimal(10),
      unit: 'kg',
      requestedById: 'purchaser-1',
      orderedAt: status === ProcurementStatus.ORDERED ? baseDate : null,
      arrivalDate: baseDate,
      cancelledAt: null,
      note: null,
      createdAt: baseDate,
      updatedAt: baseDate,
      ...overrides,
    }),
    createService: (prisma, activityLogs, workflows, projectAccess) =>
      new PaintProcurementsService(
        prisma as never,
        activityLogs as never,
        workflows as never,
        projectAccess as never,
      ),
    stubWorkspace: (service) => {
      vi.spyOn(service as unknown as { buildWorkspace: (...args: unknown[]) => Promise<unknown> }, 'buildWorkspace').mockResolvedValue({} as never);
    },
    create: (service, actor) =>
      (service as PaintProcurementsService).createProcurement(
        'project-1',
        {
          supplierId: 'supplier-1',
          procurementCode: 'PO-RACE',
          materialName: '并发涂料',
          batchNo: 'RACE-001',
          quantity: 10,
          unit: 'kg',
          arrivalDate: '2026-08-12T00:00:00.000Z',
        },
        actor as never,
      ),
    update: (service, actor) =>
      (service as PaintProcurementsService).updateProcurement(
        'project-1',
        'record-1',
        { note: '并发更新不应写入' },
        actor as never,
      ),
    transition: (service, actor) =>
      (service as PaintProcurementsService).markArrived(
        'project-1',
        'record-1',
        actor as never,
      ),
    cancel: (service, actor) =>
      (service as PaintProcurementsService).cancelProcurement(
        'project-1',
        'record-1',
        actor as never,
      ),
    complete: (service, actor) =>
      (service as PaintProcurementsService).completeTask(
        'project-1',
        actor as never,
      ),
  },
  {
    label: 'development fee',
    tableName: 'development_fees',
    modelName: 'developmentFee',
    statusField: 'payStatus',
    nodeCode: WorkflowNodeCode.DEVELOPMENT_ACCEPTANCE,
    createdStatus: DevelopmentFeeStatus.PENDING,
    completionReadyStatus: DevelopmentFeeStatus.PAID,
    transitionStartStatus: DevelopmentFeeStatus.RECORDED,
    transitionWinnerStatus: DevelopmentFeeStatus.PAID,
    createAuditAction: 'DEVELOPMENT_FEE_CREATED',
    updateAuditAction: 'DEVELOPMENT_FEE_UPDATED',
    transitionAuditAction: 'DEVELOPMENT_FEE_PAID',
    cancelAuditAction: 'DEVELOPMENT_FEE_CANCELLED',
    actor: {
      authVersion: 1,
      teamAccessApproved: true, authSource: 'local',
      id: 'finance-1',
      roleCodes: ['finance'],
      permissionCodes: ['project.read', 'workflow.transition'],
      isSystemAdmin: false,
    },
    makeRecord: (status, overrides = {}) => ({
      id: 'record-1',
      projectId: 'project-1',
      supplierId: null,
      createdById: 'finance-1',
      recordedById: 'finance-1',
      createdBy: { id: 'finance-1', name: '财务' },
      recordedBy: { id: 'finance-1', name: '财务' },
      feeType: DevelopmentFeeType.PAINT_DEVELOPMENT,
      amount: new Prisma.Decimal(10000),
      currency: 'CNY',
      payer: '甲方',
      payStatus: status,
      occurredAt: baseDate,
      recordedAt: baseDate,
      completedAt: status === DevelopmentFeeStatus.PAID ? baseDate : null,
      cancelledAt: null,
      remark: null,
      note: null,
      createdAt: baseDate,
      updatedAt: baseDate,
      ...overrides,
    }),
    createService: (prisma, activityLogs, workflows, projectAccess) =>
      new FeesService(
        prisma as never,
        activityLogs as never,
        workflows as never,
        projectAccess as never,
      ),
    stubWorkspace: (service) => {
      vi.spyOn(service as unknown as { buildWorkspace: (...args: unknown[]) => Promise<unknown> }, 'buildWorkspace').mockResolvedValue({} as never);
    },
    create: (service, actor) =>
      (service as FeesService).createFee(
        'project-1',
        {
          feeType: DevelopmentFeeType.PAINT_DEVELOPMENT,
          amount: 10000,
          currency: 'CNY',
          payer: '甲方',
          recordedAt: '2026-08-11T06:00:00.000Z',
        },
        actor as never,
      ),
    update: (service, actor) =>
      (service as FeesService).updateFee(
        'project-1',
        'record-1',
        {
          feeType: DevelopmentFeeType.PAINT_DEVELOPMENT,
          amount: 10000,
          currency: 'CNY',
          payer: '并发更新不应写入',
          recordedAt: '2026-08-11T06:00:00.000Z',
        },
        actor as never,
      ),
    transition: (service, actor) =>
      (service as FeesService).markPaid(
        'project-1',
        'record-1',
        actor as never,
      ),
    cancel: (service, actor) =>
      (service as FeesService).cancelFee(
        'project-1',
        'record-1',
        actor as never,
      ),
    complete: (service, actor) =>
      (service as FeesService).completeTask('project-1', actor as never),
  },
  {
    label: 'schedule production plan',
    tableName: 'production_plans',
    modelName: 'productionPlan',
    statusField: 'status',
    nodeCode: WorkflowNodeCode.MASS_PRODUCTION_PLAN,
    createdStatus: ProductionPlanStatus.DRAFT,
    completionReadyStatus: ProductionPlanStatus.CONFIRMED,
    transitionStartStatus: ProductionPlanStatus.DRAFT,
    transitionWinnerStatus: ProductionPlanStatus.CANCELLED,
    createAuditAction: 'SCHEDULE_PLAN_CREATED',
    updateAuditAction: 'SCHEDULE_PLAN_UPDATED',
    transitionAuditAction: 'SCHEDULE_PLAN_CANCELLED',
    cancelAuditAction: 'SCHEDULE_PLAN_CANCELLED',
    actor: {
      authVersion: 1,
      teamAccessApproved: true, authSource: 'local',
      id: 'process-1',
      roleCodes: ['production_operator'],
      permissionCodes: ['project.read', 'workflow.transition'],
      isSystemAdmin: false,
    },
    makeRecord: (status, overrides = {}) => ({
      id: 'record-1',
      projectId: 'project-1',
      createdById: 'process-1',
      ownerId: 'owner-1',
      confirmedById:
        status === ProductionPlanStatus.CONFIRMED ? 'process-1' : null,
      createdBy: { id: 'process-1', name: '工艺' },
      owner: { id: 'owner-1', name: '责任人' },
      confirmedBy:
        status === ProductionPlanStatus.CONFIRMED
          ? { id: 'process-1', name: '工艺' }
          : null,
      planNo: 'SP-001',
      planType: ProductionPlanType.SCHEDULE,
      status,
      quantity: 10,
      actualQuantity: null,
      planDate: baseDate,
      lineName: '一线',
      workshop: '一车间',
      batchNo: 'BATCH-001',
      confirmedAt:
        status === ProductionPlanStatus.CONFIRMED ? baseDate : null,
      plannedStartAt: null,
      plannedEndAt: null,
      actualStartAt: null,
      actualEndAt: null,
      remark: null,
      createdAt: baseDate,
      updatedAt: baseDate,
      ...overrides,
    }),
    createService: (prisma, activityLogs, workflows, projectAccess) =>
      new ProductionPlansService(
        prisma as never,
        activityLogs as never,
        workflows as never,
        projectAccess as never,
      ),
    stubWorkspace: (service) => {
      vi.spyOn(service as unknown as { buildScheduleWorkspace: (...args: unknown[]) => Promise<unknown> }, 'buildScheduleWorkspace').mockResolvedValue({} as never);
    },
    create: (service, actor) =>
      (service as ProductionPlansService).createSchedulePlan(
        'project-1',
        {
          planDate: '2026-08-12T00:00:00.000Z',
          plannedQuantity: 10,
          workshop: '一车间',
          lineName: '一线',
          ownerId: 'owner-1',
          batchNo: 'RACE-001',
        },
        actor as never,
      ),
    update: (service, actor) =>
      (service as ProductionPlansService).updateSchedulePlan(
        'project-1',
        'record-1',
        {
          planDate: '2026-08-13T00:00:00.000Z',
          plannedQuantity: 20,
          workshop: '并发更新不应写入',
          lineName: '二线',
          ownerId: 'owner-1',
          batchNo: 'RACE-UPDATE',
        },
        actor as never,
      ),
    transition: (service, actor) =>
      (service as ProductionPlansService).cancelSchedulePlan(
        'project-1',
        'record-1',
        actor as never,
      ),
    cancel: (service, actor) =>
      (service as ProductionPlansService).confirmSchedulePlan(
        'project-1',
        'record-1',
        actor as never,
      ),
    complete: (service, actor) =>
      (service as ProductionPlansService).completeScheduleTask(
        'project-1',
        actor as never,
      ),
  },
];

describe.each(domainCases)('$label concurrency integrity', (domain) => {
  it('preserves locked create and update happy paths', async () => {
    const createHarness = createDomainHarness(
      domain,
      domain.transitionStartStatus,
      'transition',
    );
    await expect(
      domain.create(createHarness.service, domain.actor),
    ).resolves.toBeDefined();
    expect(createHarness.getState().records).toHaveLength(2);
    expect(createHarness.getState().auditActions).toContain(
      domain.createAuditAction,
    );

    const updateHarness = createDomainHarness(
      domain,
      domain.transitionStartStatus,
      'transition',
    );
    await expect(
      domain.update(updateHarness.service, domain.actor),
    ).resolves.toBeDefined();
    expect(updateHarness.getState().auditActions).toContain(
      domain.updateAuditAction,
    );
  });

  it('allows only completion or a racing create to commit', async () => {
    const harness = createDomainHarness(
      domain,
      domain.completionReadyStatus,
      'complete',
    );
    const completion = domain.complete(harness.service, domain.actor);
    await Promise.race([harness.primaryPaused.promise, completion.then(() => { throw new Error('Completion finished before test barrier'); })]);
    const create = domain.create(harness.service, domain.actor);
    await harness.secondOperationObserved.promise;
    harness.releasePrimary.resolve();

    const outcomes = await Promise.allSettled([completion, create]);
    expect(
      outcomes.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const state = harness.getState();
    expect(state.task.isActive).toBe(false);
    expect(state.records).toHaveLength(1);
    expect(state.auditActions).not.toContain(domain.createAuditAction);
  });

  it('prevents a stale update from committing after a terminal transition', async () => {
    const harness = createDomainHarness(
      domain,
      domain.transitionStartStatus,
      'transition',
    );
    const transition = domain.transition(harness.service, domain.actor);
    await harness.primaryPaused.promise;
    const update = domain.update(harness.service, domain.actor);
    await harness.secondOperationObserved.promise;
    harness.releasePrimary.resolve();

    const outcomes = await Promise.allSettled([transition, update]);
    expect(
      outcomes.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const state = harness.getState();
    expect(state.records[0]?.[domain.statusField]).toBe(
      domain.transitionWinnerStatus,
    );
    expect(state.auditActions).toContain(domain.transitionAuditAction);
    expect(state.auditActions).not.toContain(domain.updateAuditAction);
  });

  it('allows only one competing status action and writes no loser audit', async () => {
    const harness = createDomainHarness(
      domain,
      domain.transitionStartStatus,
      'transition',
    );
    const primary = domain.transition(harness.service, domain.actor);
    await harness.primaryPaused.promise;
    const competing = domain.cancel(harness.service, domain.actor);
    await harness.secondOperationObserved.promise;
    harness.releasePrimary.resolve();

    const outcomes = await Promise.allSettled([primary, competing]);
    expect(
      outcomes.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const domainAudits = harness
      .getState()
      .auditActions.filter((action) =>
        [domain.transitionAuditAction, domain.cancelAuditAction].includes(action),
      );
    expect(domainAudits).toHaveLength(1);
  });
});
