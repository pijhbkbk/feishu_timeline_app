import { ReviewType, WorkflowNodeCode } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { installTeamAuthorizationFixture } from '../../test-support/team-authorization.fixture';

import { ReviewsService } from './reviews.service';

const actor = {
  id: 'reviewer-1', teamAccessApproved: true, authSource: 'local', authVersion: 1,
  roleCodes: ['reviewer'],
  permissionCodes: ['project.read', 'review.execute', 'attachment.manage'],
  isSystemAdmin: false,
} as never;

const file = {
  originalname: 'review.pdf',
  mimetype: 'application/pdf',
  size: 16,
  buffer: Buffer.from('%PDF-1.7\n'),
};

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

function createReviewRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'review-1',
    projectId: 'project-1',
    workflowTaskId: 'task-1',
    reviewerId: 'reviewer-1',
    attachmentId: 'attachment-old',
    reviewType: ReviewType.CAB_REVIEW,
    submittedAt: null,
    reviewedAt: new Date('2026-08-01T00:00:00Z'),
    ...overrides,
  };
}

function createHarness(options: {
  reviewType?: ReviewType;
  nodeCode?: WorkflowNodeCode;
  deferred?: boolean;
} = {}) {
  const reviewType = options.reviewType ?? ReviewType.CAB_REVIEW;
  const nodeCode = options.nodeCode ?? WorkflowNodeCode.CAB_REVIEW;
  const taskActor = nodeCode === WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW
    ? { id: 'reviewer-1', authSource: 'local', teamAccessApproved: true, roleCodes: ['quality_engineer'], authVersion: 1, isSystemAdmin: false, permissionCodes: ['project.read', 'review.execute', 'attachment.manage'] } as never : actor;
  const period = { id: 'period-1', reviewerId: 'reviewer-1', plannedDate: new Date('2026-08-01T00:00:00Z'), status: 'PENDING' };
  const scanStarted = createDeferred<void>();
  const releaseScan = createDeferred<void>();
  let currentReview = createReviewRecord({ reviewType });
  const tx = {
    $queryRaw: vi.fn().mockImplementation(async (query) => query.strings?.join('').includes('monthly_plan_integrity')
      ? [{ id: 'locked', status: 'ACTIVE', frequency: 'MONTHLY', totalCount: 12, taskCount: 12, validCount: 12 }] : [{ id: 'locked' }]),
    reviewRecord: {
      findFirst: vi.fn(async () => currentReview),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn(),
    },
    workflowTask: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'task-1',
        projectId: 'project-1',
        nodeCode,
        isActive: true,
      }),
    },
    recurringTask: { findFirst: vi.fn().mockResolvedValue(period), findUniqueOrThrow: vi.fn().mockResolvedValue(period) },
    attachment: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'attachment-old',
        projectId: 'project-1',
        entityType: 'REVIEW_RECORD',
        entityId: 'review-1',
        isDeleted: false,
        scanStatus: 'CLEAN',
      }),
    },
  };
  installTeamAuthorizationFixture(tx, [taskActor], () => ({ id: 'task-1', projectId: 'project-1', nodeCode, assigneeUserId: 'reviewer-1', status: 'IN_PROGRESS', isActive: true }));
  const prisma = {
    $transaction: vi.fn(async (executor: (client: typeof tx) => Promise<unknown>) =>
      executor(tx),
    ),
  };
  const activityLogs = {
    createWithExecutor: vi.fn().mockResolvedValue({ id: 'audit-1' }),
  };
  const attachments = {
    createStoredAttachment: vi.fn(async (input: any) => {
      if (options.deferred) {
        scanStarted.resolve();
        await releaseScan.promise;
      }
      await input.finalizeDomainAttachment(tx, {
        attachmentId: 'attachment-new',
        replacement: {
          id: 'attachment-old',
          projectId: 'project-1',
          entityType: 'REVIEW_RECORD',
          entityId: 'review-1',
          scanStatus: 'CLEAN',
          isDeleted: false,
        },
      });
      return { id: 'attachment-new', fileName: 'review.pdf' };
    }),
  };
  const service = new ReviewsService(
    prisma as never,
    activityLogs as never,
    attachments as never,
    {} as never,
    {
      assertProjectAccessWithDefaultClient: vi.fn().mockResolvedValue({
        id: 'project-1',
      }),
    } as never,
  );
  const internals = service as any;

  return {
    actor: taskActor,
    service,
    internals,
    prisma,
    tx,
    attachments,
    activityLogs,
    scanStarted,
    releaseScan,
    setCurrentReview(next: Record<string, unknown>) {
      currentReview = createReviewRecord({ reviewType, ...next });
    },
  };
}

describe('ReviewsService attachment scan-finalize integrity', () => {
  it('rejects a cabin-review upload when the review is submitted while scanning', async () => {
    const harness = createHarness({ deferred: true });
    vi.spyOn(harness.internals, 'getCabinReviewContext').mockResolvedValue({
      trialProductionCompleted: true,
      activeTask: { id: 'task-1' },
      project: { id: 'project-1' },
    });
    vi.spyOn(harness.internals, 'getCabinReviewOrThrow').mockResolvedValue(
      createReviewRecord(),
    );

    const upload = harness.service.uploadCabinReviewAttachment(
      'project-1',
      'review-1',
      file,
      actor,
    );
    await harness.scanStarted.promise;
    harness.setCurrentReview({ submittedAt: new Date('2026-08-11T05:00:00.000Z') });
    harness.releaseScan.resolve();

    await expect(upload).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'ATTACHMENT_TARGET_STATE_CHANGED',
      }),
    });
    expect(harness.tx.reviewRecord.updateMany).not.toHaveBeenCalled();
    expect(harness.tx.reviewRecord.update).not.toHaveBeenCalled();
    expect(harness.activityLogs.createWithExecutor).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: 'cabin',
      method: 'uploadCabinReviewAttachment',
      contextMethod: 'getCabinReviewContext',
      recordMethod: 'getCabinReviewOrThrow',
      workspaceMethod: 'buildCabinReviewWorkspace',
      contextFact: { trialProductionCompleted: true },
      reviewType: ReviewType.CAB_REVIEW,
      nodeCode: WorkflowNodeCode.CAB_REVIEW,
    },
    {
      label: 'consistency',
      method: 'uploadConsistencyReviewAttachment',
      contextMethod: 'getConsistencyReviewContext',
      recordMethod: 'getConsistencyReviewOrThrow',
      workspaceMethod: 'buildConsistencyReviewWorkspace',
      contextFact: { cabinReviewCompleted: true },
      reviewType: ReviewType.COLOR_CONSISTENCY_REVIEW,
      nodeCode: WorkflowNodeCode.COLOR_CONSISTENCY_REVIEW,
    },
    {
      label: 'visual-delta',
      method: 'uploadVisualDeltaReviewAttachment',
      contextMethod: 'getVisualDeltaReviewContext',
      recordMethod: 'getVisualDeltaReviewOrThrow',
      workspaceMethod: 'buildVisualDeltaReviewWorkspace',
      contextFact: { massProductionCompleted: true },
      reviewType: ReviewType.VISUAL_COLOR_DIFFERENCE_REVIEW,
      nodeCode: WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW,
    },
  ])(
    'finalizes the $label direct attachment reference inside the guarded transaction',
    async ({
      method,
      contextMethod,
      recordMethod,
      workspaceMethod,
      contextFact,
      reviewType,
      nodeCode,
    }) => {
      const harness = createHarness({ reviewType, nodeCode });
      vi.spyOn(harness.internals, contextMethod).mockResolvedValue({
        ...contextFact,
        activeTask: { id: 'task-1' },
        project: { id: 'project-1' },
      });
      vi.spyOn(harness.internals, recordMethod).mockResolvedValue(
        createReviewRecord({ reviewType }),
      );
      vi.spyOn(harness.internals, workspaceMethod).mockResolvedValue({ ok: true });

      await expect(
        harness.internals[method]('project-1', 'review-1', file, harness.actor),
      ).resolves.toEqual({ ok: true });

      expect(harness.attachments.createStoredAttachment).toHaveBeenCalledWith(
        expect.objectContaining({
          replacesAttachmentId: 'attachment-old',
          finalizeDomainAttachment: expect.any(Function),
        }),
      );
      expect(harness.tx.reviewRecord.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          id: 'review-1',
          projectId: 'project-1',
          reviewType,
          workflowTaskId: 'task-1',
          submittedAt: null,
          attachmentId: 'attachment-old',
        }),
        data: { attachmentId: 'attachment-new' },
      });
      expect(harness.tx.reviewRecord.update).not.toHaveBeenCalled();
      const lockSql = harness.tx.$queryRaw.mock.calls.map(
        ([query]) => (query as { strings?: string[] }).strings?.join('') ?? '',
      );
      expect(lockSql[0]).toContain('review_records');
      expect(lockSql[0]).toContain('FOR UPDATE');
      expect(lockSql[1]).toContain('workflow_tasks');
      expect(lockSql[1]).toContain('FOR UPDATE');
      expect(lockSql[2]).toContain('attachments');
      expect(lockSql[2]).toContain('FOR UPDATE');
    },
  );
});
