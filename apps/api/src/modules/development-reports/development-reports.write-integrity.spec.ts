import {
  DevelopmentReportStatus,
  WorkflowNodeCode,
  WorkflowTaskStatus,
} from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { DevelopmentReportsService } from './development-reports.service';

const actor = {
  id: 'project-manager-1',
  roleCodes: ['project_manager'],
  permissionCodes: ['project.read', 'workflow.transition'],
  isSystemAdmin: false,
} as never;

const reportInput = {
  reportTitle: '新颜色开发报告',
  demandSource: '市场需求',
  targetMarket: '国内',
  targetVehicleModel: '轻卡',
  targetColorName: '星云蓝',
  benchmarkColorRef: null,
  developmentReason: '扩充产品色系',
  expectedLaunchDate: '2026-12-01T00:00:00.000Z',
  estimatedAnnualVolume: 1200,
  technicalRequirements: '满足技术规范',
  qualityRequirements: '满足质量规范',
  costTarget: '预算内',
  riskSummary: null,
  remark: null,
  submitComment: '提交评审',
};

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function createHarness() {
  const delayedSaveRead = deferred();
  const releaseDelayedSave = deferred();
  let delayedReadPaused = false;
  let transactionSequence = 0;
  const lockSqlByTransaction = new Map<number, string[]>();
  let task = {
    id: 'development-report-task-1',
    projectId: 'project-1',
    workflowInstanceId: 'workflow-1',
    taskNo: 'TASK-001',
    nodeCode: WorkflowNodeCode.DEVELOPMENT_REPORT,
    nodeName: '新颜色开发报告',
    taskRound: 1,
    status: WorkflowTaskStatus.IN_PROGRESS as WorkflowTaskStatus,
    isPrimary: true,
    isActive: true,
    assigneeUserId: null,
    assigneeDepartmentId: null,
    assigneeUser: null,
    assigneeDepartment: null,
    workflowInstance: { id: 'workflow-1' },
    dueAt: null,
    startedAt: new Date('2026-08-11T00:00:00.000Z'),
    returnedAt: null,
    createdAt: new Date('2026-08-11T00:00:00.000Z'),
    updatedAt: new Date('2026-08-11T00:00:00.000Z'),
  };
  let report = {
    id: 'report-1',
    projectId: 'project-1',
    workflowInstanceId: 'workflow-1',
    workflowTaskId: task.id,
    status: DevelopmentReportStatus.DRAFT,
    reportTitle: '原始草稿',
    demandSource: '原始需求',
    targetMarket: null,
    targetVehicleModel: null,
    targetColorName: '原始颜色',
    benchmarkColorRef: null,
    developmentReason: '原始原因',
    expectedLaunchDate: null,
    estimatedAnnualVolume: null,
    technicalRequirements: null,
    qualityRequirements: null,
    costTarget: null,
    riskSummary: null,
    remark: null,
    createdById: 'project-manager-1',
    updatedById: 'project-manager-1',
    submittedById: null,
    submittedAt: null as Date | null,
    createdBy: null,
    updatedBy: null,
    submittedBy: null,
    workflowTask: { ...task },
    createdAt: new Date('2026-08-11T00:00:00.000Z'),
    updatedAt: new Date('2026-08-11T00:00:00.000Z'),
  };
  const audits: string[] = [];

  const cloneTask = () => ({ ...task, workflowInstance: { ...task.workflowInstance } });
  const cloneReport = () => ({
    ...report,
    workflowTask: cloneTask(),
    createdBy: null,
    updatedBy: null,
    submittedBy: null,
  });

  const prisma = {
    $transaction: vi.fn(
      async (executor: (client: Record<string, any>) => Promise<unknown>) => {
        const transactionNumber = ++transactionSequence;
        const lockSql: string[] = [];
        lockSqlByTransaction.set(transactionNumber, lockSql);
        const tx = {
          $queryRaw: vi.fn(async (query: { strings?: readonly string[] }) => {
            const sql = query.strings?.join('') ?? '';
            lockSql.push(sql);
            if (sql.includes('development_reports')) {
              return report ? [{ id: report.id }] : [];
            }
            if (sql.includes('workflow_tasks')) {
              return task ? [{ id: task.id }] : [];
            }
            return [];
          }),
          project: {
            findUnique: vi.fn().mockResolvedValue({
              id: 'project-1',
              code: 'PRJ-001',
              name: '项目 A',
              currentNodeCode: WorkflowNodeCode.DEVELOPMENT_REPORT,
              plannedEndDate: null,
            }),
          },
          workflowTask: {
            findFirst: vi.fn(async (args: { where: { id?: string; isActive?: boolean } }) => {
              const snapshot = cloneTask();
              if (
                transactionNumber === 1 &&
                !delayedReadPaused &&
                args.where.isActive === true &&
                !args.where.id
              ) {
                delayedReadPaused = true;
                delayedSaveRead.resolve();
                await releaseDelayedSave.promise;
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
          developmentReport: {
            findUnique: vi.fn(async () => cloneReport()),
            findFirst: vi.fn(async () => cloneReport()),
            create: vi.fn(),
            update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
              report = {
                ...report,
                ...data,
                updatedAt: new Date(),
              } as typeof report;
              return cloneReport();
            }),
            updateMany: vi.fn(
              async ({ where, data }: {
                where: {
                  id?: string;
                  status?: DevelopmentReportStatus;
                  updatedAt?: Date;
                  submittedAt?: Date | null;
                };
                data: Record<string, unknown>;
              }) => {
                if (
                  (where.id && where.id !== report.id) ||
                  (where.status && where.status !== report.status) ||
                  (where.updatedAt && where.updatedAt.getTime() !== report.updatedAt.getTime()) ||
                  (where.submittedAt !== undefined &&
                    where.submittedAt?.getTime() !== report.submittedAt?.getTime())
                ) {
                  return { count: 0 };
                }
                report = {
                  ...report,
                  ...data,
                  updatedAt: new Date(),
                } as typeof report;
                return { count: 1 };
              },
            ),
          },
        };
        return executor(tx);
      },
    ),
  };
  const workflows = {
    transitionTaskWithExecutor: vi.fn(async () => {
      task = {
        ...task,
        status: WorkflowTaskStatus.COMPLETED,
        isActive: false,
        updatedAt: new Date(),
      };
    }),
  };
  const activityLogs = {
    createWithExecutor: vi.fn(async (_tx: unknown, input: { action: string }) => {
      audits.push(input.action);
    }),
  };
  const service = new DevelopmentReportsService(
    prisma as never,
    workflows as never,
    activityLogs as never,
    {
      assertProjectAccessWithDefaultClient: vi.fn().mockResolvedValue({ id: 'project-1' }),
    } as never,
  );
  vi.spyOn(service as never, 'buildWorkspaceResponse' as never).mockResolvedValue({} as never);

  return {
    service,
    delayedSaveRead,
    releaseDelayedSave,
    getReport: () => cloneReport(),
    getAudits: () => [...audits],
    getLockSql: (transactionNumber: number) =>
      lockSqlByTransaction.get(transactionNumber) ?? [],
  };
}

describe('DevelopmentReportsService finalized-write integrity', () => {
  it('rejects a delayed draft save after submit commits without reverting submitted state', async () => {
    const harness = createHarness();
    const delayedSave = harness.service
      .saveReport('project-1', { ...reportInput, reportTitle: '延迟草稿' }, actor)
      .then(
        () => ({ status: 'resolved' as const }),
        (error: unknown) => ({ status: 'rejected' as const, error }),
      );
    await harness.delayedSaveRead.promise;

    await harness.service.submitReport('project-1', reportInput, actor);
    harness.releaseDelayedSave.resolve();
    const delayedResult = await delayedSave;

    expect(delayedResult.status).toBe('rejected');
    if (delayedResult.status === 'rejected') {
      expect(delayedResult.error).toMatchObject({
        status: 409,
        response: { code: 'DEVELOPMENT_REPORT_STATE_CHANGED' },
      });
    }
    expect(harness.getReport()).toMatchObject({
      status: DevelopmentReportStatus.SUBMITTED,
      reportTitle: '新颜色开发报告',
      submittedAt: expect.any(Date),
    });
    expect(harness.getAudits()).toEqual(['DEVELOPMENT_REPORT_SUBMITTED']);
    expect(harness.getLockSql(1)[0]).toContain('development_reports');
    expect(harness.getLockSql(1)[1]).toContain('workflow_tasks');
  });
});
