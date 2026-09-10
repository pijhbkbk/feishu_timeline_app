import {
  AttachmentScanStatus,
  PerformanceTestResult,
  PerformanceTestStatus,
  PerformanceTestType,
  WorkflowAction,
  WorkflowNodeCode,
  WorkflowTaskStatus,
} from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { PerformanceTestsService } from './performance-tests.service';

const actor = {
  id: 'quality-engineer-1',
  roleCodes: ['quality_engineer'],
  permissionCodes: ['project.read', 'workflow.transition'],
  isSystemAdmin: false,
} as never;
const actorId = 'quality-engineer-1';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function writeInput(testCode: string, conclusion: string) {
  return {
    testCode,
    sampleId: null,
    relatedObjectName: '涂料批次 A',
    testItem: PerformanceTestType.GLOSS,
    standardValue: '80±5',
    actualValue: '82',
    result: PerformanceTestResult.PASS,
    conclusion,
    testedById: actorId,
    testedAt: '2026-08-11T02:00:00.000Z',
  };
}

function createHarness(mode: 'update' | 'create' | 'happy') {
  const delayedWriteReady = deferred();
  const releaseDelayedWrite = deferred();
  let delayedReadPaused = false;
  let transactionSequence = 0;
  const lockSqlByTransaction = new Map<number, string[]>();
  let task = {
    id: 'performance-task-1',
    projectId: 'project-1',
    workflowInstanceId: 'workflow-1',
    taskNo: 'TASK-PERF-1',
    nodeCode: WorkflowNodeCode.PERFORMANCE_TEST,
    nodeName: '涂料性能试验',
    taskRound: 1,
    status: WorkflowTaskStatus.IN_PROGRESS as WorkflowTaskStatus,
    isPrimary: true,
    isActive: true,
    assigneeUserId: null,
    assigneeDepartmentId: null,
    assigneeUser: null,
    assigneeDepartment: null,
    dueAt: null,
    startedAt: new Date('2026-08-11T00:00:00.000Z'),
    completedAt: null as Date | null,
    returnedAt: null,
    payload: null,
    createdAt: new Date('2026-08-11T00:00:00.000Z'),
    updatedAt: new Date('2026-08-11T00:00:00.000Z'),
  };
  const baseStatus = mode === 'create'
    ? PerformanceTestStatus.SUBMITTED
    : PerformanceTestStatus.DRAFT;
  const records: Array<Record<string, any>> = [
    {
      id: 'performance-test-1',
      projectId: 'project-1',
      sampleId: null,
      paintProcurementId: null,
      testedById: actorId,
      reportAttachmentId: 'attachment-1',
      testCode: 'PT-001',
      relatedObjectName: '涂料批次 A',
      testItem: PerformanceTestType.GLOSS,
      status: baseStatus,
      standardValue: '80±5',
      actualValue: '82',
      result: PerformanceTestResult.PASS,
      conclusion: '原始合格结论',
      metadata: null,
      testedAt: new Date('2026-08-11T02:00:00.000Z'),
      submittedAt:
        baseStatus === PerformanceTestStatus.SUBMITTED
          ? new Date('2026-08-11T03:00:00.000Z')
          : null,
      sample: null,
      testedBy: { id: actorId, name: '质量工程师' },
      reportAttachment: {
        id: 'attachment-1',
        scanStatus: AttachmentScanStatus.CLEAN,
        isDeleted: false,
      },
      createdAt: new Date('2026-08-11T00:00:00.000Z'),
      updatedAt: new Date('2026-08-11T00:00:00.000Z'),
    },
  ];
  const audits: string[] = [];

  const cloneTask = () => ({ ...task });
  const cloneRecord = (record: Record<string, any>) => ({
    ...record,
    testedBy: record.testedBy ? { ...record.testedBy } : null,
    reportAttachment: record.reportAttachment
      ? { ...record.reportAttachment }
      : null,
  });
  const matchingRecord = (id: string) => records.find((record) => record.id === id);

  const prisma = {
    $transaction: vi.fn(
      async (executor: (client: Record<string, any>) => Promise<unknown>) => {
        const transactionNumber = ++transactionSequence;
        const lockSql: string[] = [];
        lockSqlByTransaction.set(transactionNumber, lockSql);
        const pauseDelayedUpdate = async () => {
          if (transactionNumber === 1 && mode === 'update' && !delayedReadPaused) {
            delayedReadPaused = true;
            delayedWriteReady.resolve();
            await releaseDelayedWrite.promise;
          }
        };
        const tx = {
          $queryRaw: vi.fn(async (query: { strings?: readonly string[] }) => {
            const sql = query.strings?.join('') ?? '';
            lockSql.push(sql);
            if (sql.includes('performance_tests')) {
              await pauseDelayedUpdate();
              return records.length > 0 ? [{ id: records[0]!.id }] : [];
            }
            if (sql.includes('workflow_tasks')) {
              return [{ id: task.id }];
            }
            if (sql.includes('attachments')) {
              return [{ id: 'attachment-1' }];
            }
            return [];
          }),
          project: {
            findUnique: vi.fn().mockResolvedValue({
              id: 'project-1',
              code: 'PRJ-001',
              name: '项目 A',
              priority: 'MEDIUM',
              currentNodeCode: WorkflowNodeCode.PERFORMANCE_TEST,
              plannedEndDate: null,
            }),
          },
          workflowTask: {
            findFirst: vi.fn(async (args: {
              where: {
                id?: string;
                nodeCode?: WorkflowNodeCode;
                isActive?: boolean;
                status?: unknown;
              };
            }) => {
              if (args.where.nodeCode === WorkflowNodeCode.PAINT_PROCUREMENT) {
                return { id: 'procurement-task-1' };
              }
              const snapshot = cloneTask();
              if (
                transactionNumber === 1 &&
                mode === 'create' &&
                !delayedReadPaused &&
                args.where.nodeCode === WorkflowNodeCode.PERFORMANCE_TEST &&
                args.where.isActive === true &&
                !args.where.id
              ) {
                delayedReadPaused = true;
                delayedWriteReady.resolve();
                await releaseDelayedWrite.promise;
                return snapshot;
              }
              if (
                (args.where.id && args.where.id !== task.id) ||
                (args.where.isActive !== undefined && args.where.isActive !== task.isActive)
              ) {
                return null;
              }
              return cloneTask();
            }),
          },
          performanceTest: {
            findMany: vi.fn(async () => records.map(cloneRecord)),
            findFirst: vi.fn(async (args: {
              where: { id?: string; testCode?: string; NOT?: { id?: string } };
            }) => {
              if (args.where.id) {
                const snapshot = matchingRecord(args.where.id);
                if (!snapshot) {
                  return null;
                }
                const cloned = cloneRecord(snapshot);
                await pauseDelayedUpdate();
                return cloned;
              }
              const duplicated = records.find(
                (record) =>
                  record.testCode === args.where.testCode &&
                  record.id !== args.where.NOT?.id,
              );
              return duplicated ? { id: duplicated.id } : null;
            }),
            create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
              const now = new Date();
              const created = {
                ...cloneRecord(records[0]!),
                ...data,
                id: `performance-test-${records.length + 1}`,
                reportAttachmentId: null,
                reportAttachment: null,
                status: PerformanceTestStatus.DRAFT,
                submittedAt: null,
                createdAt: now,
                updatedAt: now,
              };
              records.push(created);
              return cloneRecord(created);
            }),
            update: vi.fn(async ({ where, data }: {
              where: { id: string };
              data: Record<string, unknown>;
            }) => {
              const index = records.findIndex((record) => record.id === where.id);
              records[index] = {
                ...records[index]!,
                ...data,
                updatedAt: new Date(),
              };
              return cloneRecord(records[index]!);
            }),
            updateMany: vi.fn(async ({ where, data }: {
              where: {
                id?: string;
                projectId?: string;
                status?: PerformanceTestStatus;
                updatedAt?: Date;
                reportAttachmentId?: string | null;
              };
              data: Record<string, unknown>;
            }) => {
              const index = records.findIndex((record) => record.id === where.id);
              if (index < 0) {
                return { count: 0 };
              }
              const record = records[index]!;
              if (
                (where.status && record.status !== where.status) ||
                (where.updatedAt && where.updatedAt.getTime() !== record.updatedAt.getTime()) ||
                (where.reportAttachmentId !== undefined &&
                  where.reportAttachmentId !== record.reportAttachmentId)
              ) {
                return { count: 0 };
              }
              records[index] = {
                ...record,
                ...data,
                updatedAt: new Date(),
              };
              return { count: 1 };
            }),
          },
          sample: {
            findFirst: vi.fn().mockResolvedValue(null),
          },
          user: {
            findFirst: vi.fn().mockResolvedValue({ id: actorId }),
          },
        };
        return executor(tx);
      },
    ),
  };
  const workflows = {
    transitionTaskWithExecutor: vi.fn(
      async (
        _tx: unknown,
        _taskId: string,
        action: WorkflowAction,
      ) => {
        if (action === WorkflowAction.COMPLETE) {
          task = {
            ...task,
            status: WorkflowTaskStatus.COMPLETED,
            isActive: false,
            completedAt: new Date(),
            updatedAt: new Date(),
          };
        }
      },
    ),
  };
  const activityLogs = {
    createWithExecutor: vi.fn(async (_tx: unknown, input: { action: string }) => {
      audits.push(input.action);
    }),
  };
  const service = new PerformanceTestsService(
    prisma as never,
    activityLogs as never,
    { toAttachmentSummary: vi.fn() } as never,
    workflows as never,
    {
      assertProjectAccessWithDefaultClient: vi.fn().mockResolvedValue({ id: 'project-1' }),
    } as never,
  );
  vi.spyOn(service as unknown as { buildWorkspace: (...args: unknown[]) => Promise<unknown> }, 'buildWorkspace').mockResolvedValue({} as never);

  return {
    service,
    delayedWriteReady,
    releaseDelayedWrite,
    getRecords: () => records.map(cloneRecord),
    getTask: () => cloneTask(),
    getAudits: () => [...audits],
    getLockSql: (transactionNumber: number) =>
      lockSqlByTransaction.get(transactionNumber) ?? [],
  };
}

describe('PerformanceTestsService finalized-write integrity', () => {
  it('rejects a delayed update after submit commits and preserves the submitted result', async () => {
    const harness = createHarness('update');
    const delayedUpdate = harness.service
      .updateTest('project-1', 'performance-test-1', writeInput('PT-001', '延迟覆盖'), actor)
      .then(
        () => ({ status: 'resolved' as const }),
        (error: unknown) => ({ status: 'rejected' as const, error }),
      );
    await harness.delayedWriteReady.promise;

    await harness.service.submitTest('project-1', 'performance-test-1', actor);
    harness.releaseDelayedWrite.resolve();
    const delayedResult = await delayedUpdate;

    expect(delayedResult.status).toBe('rejected');
    if (delayedResult.status === 'rejected') {
      expect(delayedResult.error).toMatchObject({
        status: 409,
        response: { code: 'PERFORMANCE_TEST_STATE_CHANGED' },
      });
    }
    expect(harness.getRecords()[0]).toMatchObject({
      status: PerformanceTestStatus.SUBMITTED,
      conclusion: '原始合格结论',
      submittedAt: expect.any(Date),
    });
    expect(harness.getAudits()).toEqual(['PERFORMANCE_TEST_SUBMITTED']);
    expect(harness.getLockSql(1)[0]).toContain('performance_tests');
  });

  it('locks a performance record before the exact active task on a valid update', async () => {
    const harness = createHarness('happy');

    await harness.service.updateTest(
      'project-1',
      'performance-test-1',
      writeInput('PT-001', '锁序验证'),
      actor,
    );

    expect(harness.getLockSql(1)[0]).toContain('performance_tests');
    expect(harness.getLockSql(1)[1]).toContain('workflow_tasks');
  });

  it('rejects a delayed create after task completion without leaving a draft or audit', async () => {
    const harness = createHarness('create');
    const delayedCreate = harness.service
      .createTest('project-1', writeInput('PT-002', '不应创建'), actor)
      .then(
        () => ({ status: 'resolved' as const }),
        (error: unknown) => ({ status: 'rejected' as const, error }),
      );
    await harness.delayedWriteReady.promise;

    await harness.service.completeTask('project-1', actor);
    harness.releaseDelayedWrite.resolve();
    const delayedResult = await delayedCreate;

    expect(delayedResult.status).toBe('rejected');
    if (delayedResult.status === 'rejected') {
      expect(delayedResult.error).toMatchObject({
        status: 409,
        response: { code: 'PERFORMANCE_TEST_STATE_CHANGED' },
      });
    }
    expect(harness.getRecords()).toHaveLength(1);
    expect(harness.getTask()).toMatchObject({
      status: WorkflowTaskStatus.COMPLETED,
      isActive: false,
    });
    expect(harness.getAudits()).toEqual(['PERFORMANCE_TEST_TASK_COMPLETED']);
  });
});
