import { installTeamAuthorizationFixture } from '../../test-support/team-authorization.fixture';
import {
  ReviewResult,
  ReviewType,
  UserStatus,
  WorkflowAction,
  WorkflowNodeCode,
  WorkflowTaskStatus,
} from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { ReviewsService } from './reviews.service';

const actor = {
  id: 'reviewer-1',
  teamAccessApproved: true, authSource: 'local', authVersion: 1,
  roleCodes: ['reviewer', 'quality_engineer'],
  permissionCodes: ['project.read', 'review.execute'],
  isSystemAdmin: false,
} as never;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function reviewInput(reviewerId: string, comment: string) {
  return {
    reviewDate: '2026-08-11T02:00:00.000Z',
    reviewerId,
    reviewConclusion: ReviewResult.APPROVED,
    comment,
    conditionNote: null,
    rejectReason: null,
  };
}

type ReviewFamily = 'cab' | 'consistency' | 'visual';

const REVIEW_FAMILY_CONFIG = {
  cab: {
    nodeCode: WorkflowNodeCode.CAB_REVIEW,
    reviewType: ReviewType.CAB_REVIEW,
    updateAudit: 'CABIN_REVIEW_UPDATED',
    submitAudit: 'CABIN_REVIEW_SUBMITTED',
  },
  consistency: {
    nodeCode: WorkflowNodeCode.COLOR_CONSISTENCY_REVIEW,
    reviewType: ReviewType.COLOR_CONSISTENCY_REVIEW,
    updateAudit: 'CONSISTENCY_REVIEW_UPDATED',
    submitAudit: 'CONSISTENCY_REVIEW_SUBMITTED',
  },
  visual: {
    nodeCode: WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW,
    reviewType: ReviewType.VISUAL_COLOR_DIFFERENCE_REVIEW,
    updateAudit: 'VISUAL_DELTA_REVIEW_UPDATED',
    submitAudit: 'VISUAL_DELTA_REVIEW_SUBMITTED',
  },
} as const;

function createHarness(
  mode: 'update' | 'create',
  family: ReviewFamily = 'cab',
) {
  const familyConfig = REVIEW_FAMILY_CONFIG[family];
  const delayedWriteReady = deferred();
  const releaseDelayedWrite = deferred();
  let delayedReadPaused = false;
  let transactionSequence = 0;
  const lockSqlByTransaction = new Map<number, string[]>();
  let task = {
    id: 'cab-review-task-1',
    projectId: 'project-1',
    workflowInstanceId: 'workflow-1',
    taskNo: 'TASK-CAB-1',
    nodeCode: familyConfig.nodeCode,
    nodeName: '驾驶室评审',
    taskRound: 1,
    status: WorkflowTaskStatus.IN_PROGRESS as WorkflowTaskStatus,
    isPrimary: true,
    isActive: true,
    assigneeUserId: 'reviewer-1',
    assigneeDepartmentId: null,
    assigneeUser: null,
    assigneeDepartment: null,
    dueAt: null,
    startedAt: new Date('2026-08-11T00:00:00.000Z'),
    completedAt: null as Date | null,
    returnedAt: null,
    createdAt: new Date('2026-08-11T00:00:00.000Z'),
    updatedAt: new Date('2026-08-11T00:00:00.000Z'),
  };
  const initialSubmittedAt = mode === 'create'
    ? new Date('2026-08-11T03:00:00.000Z')
    : null;
  const records: Array<Record<string, any>> = [
    {
      id: 'review-1',
      projectId: 'project-1',
      workflowTaskId: task.id,
      trialProductionId: 'trial-1',
      reviewerId: 'reviewer-1',
      attachmentId: null,
      reviewType: familyConfig.reviewType,
      reviewRound: 1,
      reviewPeriod: 'TASK',
      result: ReviewResult.APPROVED,
      comment: '原始正式意见',
      conditionNote: null,
      rejectReason: null,
      returnToNodeCode: null,
      reviewedAt: new Date('2026-08-11T02:00:00.000Z'),
      submittedAt: initialSubmittedAt as Date | null,
      reviewer: { id: 'reviewer-1', name: '评审人一' },
      attachment: null,
      trialProduction: {
        id: 'trial-1',
        trialNo: 'TRIAL-001',
        result: 'PASS',
        completedAt: new Date('2026-08-10T00:00:00.000Z'),
      },
      workflowTask: { ...task },
      createdAt: new Date('2026-08-11T00:00:00.000Z'),
      updatedAt: new Date('2026-08-11T00:00:00.000Z'),
    },
  ];
  const audits: string[] = [];

  const cloneTask = () => ({ ...task });
  const cloneRecord = (record: Record<string, any>) => ({
    ...record,
    reviewer: record.reviewer ? { ...record.reviewer } : null,
    trialProduction: record.trialProduction
      ? { ...record.trialProduction }
      : null,
    workflowTask: cloneTask(),
  });

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
            if (sql.includes('monthly_plan_integrity')) return [{ id: task.id, status: 'ACTIVE', frequency: 'MONTHLY', totalCount: 12, taskCount: 12, validCount: 12 }];
            lockSql.push(sql);
            if (sql.includes('review_records')) {
              await pauseDelayedUpdate();
              return records.length > 0 ? [{ id: records[0]!.id }] : [];
            }
            if (sql.includes('workflow_tasks')) {
              return [{ id: task.id }];
            }
            if (sql.includes('attachments')) {
              return [];
            }
            return [];
          }),
          project: {
            findUnique: vi.fn().mockResolvedValue({
              id: 'project-1',
              code: 'PRJ-001',
              name: '项目 A',
              priority: 'MEDIUM',
              currentNodeCode: familyConfig.nodeCode,
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
              if (
                args.where.nodeCode !== familyConfig.nodeCode &&
                args.where.status !== undefined
              ) {
                return { id: 'trial-task-1' };
              }
              if (args.where.nodeCode !== familyConfig.nodeCode) {
                return null;
              }
              const snapshot = cloneTask();
              if (
                transactionNumber === 1 &&
                mode === 'create' &&
                !delayedReadPaused &&
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
          reviewRecord: {
            findFirst: vi.fn(async (args: {
              where: {
                id?: string | { not?: string };
                workflowTaskId?: string;
                reviewerId?: string;
                reviewType?: ReviewType;
              };
            }) => {
              if (typeof args.where.id === 'string') {
                const record = records.find(
                  (candidate) => candidate.id === args.where.id,
                );
                if (!record) {
                  return null;
                }
                const snapshot = cloneRecord(record);
                await pauseDelayedUpdate();
                return snapshot;
              }
              const excludedId =
                typeof args.where.id === 'object' ? args.where.id.not : undefined;
              const duplicated = records.find(
                (record) =>
                  (!args.where.workflowTaskId ||
                    record.workflowTaskId === args.where.workflowTaskId) &&
                  (!args.where.reviewerId ||
                    record.reviewerId === args.where.reviewerId) &&
                  record.id !== excludedId,
              );
              return duplicated ? { id: duplicated.id } : null;
            }),
            create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
              const now = new Date();
              const created = {
                ...cloneRecord(records[0]!),
                ...data,
                id: `review-${records.length + 1}`,
                reviewer: {
                  id: String(data.reviewerId),
                  name: '评审人二',
                },
                attachment: null,
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
                reviewer:
                  data.reviewerId && data.reviewerId !== records[index]!.reviewerId
                    ? { id: String(data.reviewerId), name: '新评审人' }
                    : records[index]!.reviewer,
                updatedAt: new Date(),
              };
              return cloneRecord(records[index]!);
            }),
            updateMany: vi.fn(async ({ where, data }: {
              where: {
                id?: string;
                projectId?: string;
                reviewType?: ReviewType;
                workflowTaskId?: string;
                reviewerId?: string | null;
                submittedAt?: Date | null;
                updatedAt?: Date;
                attachmentId?: string | null;
              };
              data: Record<string, unknown>;
            }) => {
              const index = records.findIndex((record) => record.id === where.id);
              if (index < 0) {
                return { count: 0 };
              }
              const record = records[index]!;
              if (
                (where.reviewType && where.reviewType !== record.reviewType) ||
                (where.workflowTaskId && where.workflowTaskId !== record.workflowTaskId) ||
                (where.reviewerId !== undefined && where.reviewerId !== record.reviewerId) ||
                (where.submittedAt !== undefined &&
                  where.submittedAt?.getTime() !== record.submittedAt?.getTime()) ||
                (where.updatedAt && where.updatedAt.getTime() !== record.updatedAt.getTime()) ||
                (where.attachmentId !== undefined && where.attachmentId !== record.attachmentId)
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
          user: {
            findUnique: vi.fn().mockResolvedValue({
              id: 'reviewer-1',
              status: UserStatus.ACTIVE,
            }),
          },
          trialProduction: {
            findFirst: vi.fn().mockResolvedValue({
              id: 'trial-1',
              status: 'PASSED',
            }),
          },
          recurringTask: {
            findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'recurring-task-1', projectId: 'project-1',
              reviewerId: 'reviewer-1', plannedDate: new Date('2026-08-11T00:00:00Z'), status: 'PENDING' }),
            findFirst: vi.fn().mockResolvedValue({
              id: 'recurring-task-1',
              status: 'PENDING',
            }),
          },
        };
        installTeamAuthorizationFixture(tx, [actor], () => task);
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
        if (action === WorkflowAction.APPROVE || action === WorkflowAction.REJECT) {
          task = {
            ...task,
            status:
              action === WorkflowAction.APPROVE
                ? WorkflowTaskStatus.APPROVED
                : WorkflowTaskStatus.REJECTED,
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
  const service = new ReviewsService(
    prisma as never,
    activityLogs as never,
    { toAttachmentSummary: vi.fn() } as never,
    workflows as never,
    {
      assertProjectAccessWithDefaultClient: vi.fn().mockResolvedValue({ id: 'project-1' }),
    } as never,
  );
  vi.spyOn(service as unknown as { buildCabinReviewWorkspace: (...args: unknown[]) => Promise<unknown> }, 'buildCabinReviewWorkspace').mockResolvedValue({} as never);
  vi.spyOn(service as unknown as { buildConsistencyReviewWorkspace: (...args: unknown[]) => Promise<unknown> }, 'buildConsistencyReviewWorkspace').mockResolvedValue({} as never);
  vi.spyOn(service as unknown as { buildVisualDeltaReviewWorkspace: (...args: unknown[]) => Promise<unknown> }, 'buildVisualDeltaReviewWorkspace').mockResolvedValue({} as never);

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

describe('ReviewsService finalized-write integrity', () => {
  it('rejects a request to sign as another reviewer before a write', async () => {
    const harness = createHarness('create');
    await expect(harness.service.createCabinReview('project-1', reviewInput('reviewer-2', '他人签名'), actor))
      .rejects.toMatchObject({ status: 403 });
    expect(harness.getRecords()).toHaveLength(1);
    expect(harness.getAudits()).toEqual([]);
  });
  it('rejects a delayed review update after submit commits', async () => {
    const harness = createHarness('update');
    const delayedUpdate = harness.service
      .updateCabinReview(
        'project-1',
        'review-1',
        reviewInput('reviewer-1', '延迟覆盖'),
        actor,
      )
      .then(
        () => ({ status: 'resolved' as const }),
        (error: unknown) => ({ status: 'rejected' as const, error }),
      );
    await harness.delayedWriteReady.promise;

    await harness.service.submitCabinReview('project-1', 'review-1', actor);
    harness.releaseDelayedWrite.resolve();
    const delayedResult = await delayedUpdate;

    expect(delayedResult.status).toBe('rejected');
    if (delayedResult.status === 'rejected') {
      expect(delayedResult.error).toMatchObject({
        status: 409,
        response: { code: 'REVIEW_STATE_CHANGED' },
      });
    }
    expect(harness.getRecords()[0]).toMatchObject({
      comment: '原始正式意见',
      submittedAt: expect.any(Date),
    });
    expect(harness.getAudits()).toEqual(['CABIN_REVIEW_SUBMITTED']);
    expect(harness.getLockSql(1)[0]).toContain('review_records');
    expect(harness.getLockSql(1)[1]).toContain('workflow_tasks');
  });

  it.each(['consistency', 'visual'] as const)(
    'rejects a delayed %s review update after submit commits',
    async (family) => {
      const harness = createHarness('update', family);
      const delayedUpdate = (
        family === 'consistency'
          ? harness.service.updateConsistencyReview(
              'project-1',
              'review-1',
              reviewInput('reviewer-1', '延迟覆盖'),
              actor,
            )
          : harness.service.updateVisualDeltaReview(
              'project-1',
              'review-1',
              reviewInput('reviewer-1', '延迟覆盖'),
              actor,
            )
      ).then(
        () => ({ status: 'resolved' as const }),
        (error: unknown) => ({ status: 'rejected' as const, error }),
      );
      await harness.delayedWriteReady.promise;

      if (family === 'consistency') {
        await harness.service.submitConsistencyReview(
          'project-1',
          'review-1',
          actor,
        );
      } else {
        await harness.service.submitVisualDeltaReview(
          'project-1',
          'review-1',
          actor,
        );
      }
      harness.releaseDelayedWrite.resolve();
      const delayedResult = await delayedUpdate;

      expect(delayedResult.status).toBe('rejected');
      if (delayedResult.status === 'rejected') {
        expect(delayedResult.error).toMatchObject({
          status: 409,
          response: { code: 'REVIEW_STATE_CHANGED' },
        });
      }
      expect(harness.getRecords()[0]).toMatchObject({
        comment: '原始正式意见',
        submittedAt: expect.any(Date),
      });
      expect(harness.getAudits()).toEqual([
        REVIEW_FAMILY_CONFIG[family].submitAudit,
      ]);
      expect(harness.getLockSql(1)[0]).toContain('review_records');
      expect(harness.getLockSql(1)[1]).toContain('workflow_tasks');
    },
  );

  it('rejects a delayed review update after submit and approval commit', async () => {
    const harness = createHarness('update');
    const delayedUpdate = harness.service
      .updateCabinReview(
        'project-1',
        'review-1',
        reviewInput('reviewer-1', '终态后不应覆盖'),
        actor,
      )
      .then(
        () => ({ status: 'resolved' as const }),
        (error: unknown) => ({ status: 'rejected' as const, error }),
      );
    await harness.delayedWriteReady.promise;

    await harness.service.submitCabinReview('project-1', 'review-1', actor);
    await harness.service.approveCabinReview('project-1', 'review-1', actor);
    harness.releaseDelayedWrite.resolve();
    const delayedResult = await delayedUpdate;

    expect(delayedResult.status).toBe('rejected');
    if (delayedResult.status === 'rejected') {
      expect(delayedResult.error).toMatchObject({
        status: 409,
        response: { code: 'REVIEW_STATE_CHANGED' },
      });
    }
    expect(harness.getRecords()[0]).toMatchObject({
      comment: '原始正式意见',
      submittedAt: expect.any(Date),
    });
    expect(harness.getTask()).toMatchObject({
      status: WorkflowTaskStatus.APPROVED,
      isActive: false,
    });
    expect(harness.getAudits()).toEqual([
      'CABIN_REVIEW_SUBMITTED',
      'CABIN_REVIEW_APPROVED',
    ]);
  });

  it('rejects a delayed same-signer create after task approval', async () => {
    const harness = createHarness('create');
    const delayedCreate = harness.service
      .createCabinReview(
        'project-1',
        reviewInput('reviewer-1', '不应创建的新记录'),
        actor,
      )
      .then(
        () => ({ status: 'resolved' as const }),
        (error: unknown) => ({ status: 'rejected' as const, error }),
      );
    await harness.delayedWriteReady.promise;

    await harness.service.approveCabinReview('project-1', 'review-1', actor);
    harness.releaseDelayedWrite.resolve();
    const delayedResult = await delayedCreate;

    expect(delayedResult.status).toBe('rejected');
    if (delayedResult.status === 'rejected') {
      expect(delayedResult.error).toMatchObject({
        status: 409,
        response: { code: 'REVIEW_STATE_CHANGED' },
      });
    }
    expect(harness.getRecords()).toHaveLength(1);
    expect(harness.getTask()).toMatchObject({
      status: WorkflowTaskStatus.APPROVED,
      isActive: false,
    });
    expect(harness.getAudits()).toEqual(['CABIN_REVIEW_APPROVED']);
  });
});
