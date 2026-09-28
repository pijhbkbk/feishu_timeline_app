import { installTeamAuthorizationFixture } from '../../test-support/team-authorization.fixture';
import {
  AttachmentScanStatus,
  AttachmentTargetType,
  Prisma,
  RecurringTaskStatus,
  ReviewResult,
  ReviewType,
  UserStatus,
  WorkflowNodeCode,
  WorkflowTaskStatus,
} from '@prisma/client';
import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { ReviewsService } from './reviews.service';

const actorId = 'reviewer-1';
const actor = {
  id: actorId,
  authVersion: 1,
  authSource: 'local',
  roleCodes: ['reviewer', 'quality_engineer'],
  permissionCodes: ['project.read', 'review.execute'],
  isSystemAdmin: false,
} as never;

const validInput = {
  reviewDate: '2026-08-11T00:00:00.000Z',
  reviewerId: 'reviewer-1',
  reviewConclusion: ReviewResult.APPROVED,
  comment: '评审通过',
  conditionNote: null,
  rejectReason: null,
};

const project = {
  id: 'project-1',
  code: 'PRJ-001',
  name: '资源边界测试项目',
  priority: 'NORMAL',
  currentNodeCode: null,
  plannedEndDate: null,
};


function monthlyPlanRow(taskCount = 12) { return { id: 'plan-exact', status: 'ACTIVE', frequency: 'MONTHLY', totalCount: 12, taskCount, validCount: Math.min(taskCount, 12) }; }

function visualLockTx(queryRaw: unknown) {
  return { $queryRaw: queryRaw, workflowTask: { findUnique: vi.fn().mockResolvedValue({
    id: 'task-current', projectId: project.id, nodeCode: WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW,
    isActive: true, status: 'IN_PROGRESS', assigneeUserId: actorId,
  }) } };
}
function reviewRecord(
  id: string,
  reviewType: ReviewType = ReviewType.CAB_REVIEW,
  overrides: Record<string, unknown> = {},
) {
  const timestamp = new Date('2026-08-11T00:00:00.000Z');
  return {
    id,
    projectId: project.id,
    workflowTaskId: `task-${reviewType}`,
    trialProductionId: null,
    reviewerId: actorId,
    attachmentId: null,
    reviewType,
    reviewRound: 1,
    reviewPeriod: 'TASK',
    result: ReviewResult.APPROVED,
    comment: '评审通过',
    conditionNote: null,
    rejectReason: null,
    returnToNodeCode: null,
    reviewedAt: timestamp,
    submittedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    reviewer: { id: actorId, name: '评审人' },
    attachment: null,
    trialProduction: null,
    workflowTask: null,
    ...overrides,
  };
}

function createService(prisma: unknown = {}) {
  const listTargetAttachments = vi.fn().mockResolvedValue([]);
  const toAttachmentSummary = vi.fn((attachment: { id: string }) => ({
    id: attachment.id,
  }));
  const activityCreate = vi.fn().mockResolvedValue(undefined);
  const service = new ReviewsService(
    prisma as never,
    { createWithExecutor: activityCreate } as never,
    { listTargetAttachments, toAttachmentSummary } as never,
    {} as never,
    {
      assertProjectAccessWithDefaultClient: vi.fn().mockResolvedValue(project),
    } as never,
  );

  return {
    service,
    activityCreate,
    listTargetAttachments,
    toAttachmentSummary,
  };
}

function parseInput(service: ReviewsService, input: Record<string, unknown>) {
  return Reflect.get(service, 'parseReviewWriteInput').call(service, input);
}

function workspaceDb(input?: {
  reviews?: unknown[];
  recurringTasks?: unknown[];
  recurringPlans?: unknown[];
  attachmentRows?: unknown[];
}) {
  const reviewFindMany = vi.fn().mockResolvedValue(input?.reviews ?? []);
  const recurringFindMany = vi
    .fn()
    .mockResolvedValue(input?.recurringTasks ?? []);
  const capacityQuery = vi.fn().mockResolvedValue(
    (input?.reviews ?? []).map((review, index) => ({
      id:
        typeof review === 'object' &&
        review !== null &&
        'id' in review &&
        typeof review.id === 'string'
          ? review.id
          : `review-${index}`,
    })),
  );
  const sourceQuery = vi.fn().mockResolvedValue([]);
  const attachmentHistoryQuery = vi
    .fn()
    .mockResolvedValue(input?.attachmentRows ?? []);
  const queryRaw = vi.fn(async (query: { strings?: readonly string[] }) => {
    const sql = query.strings?.join('') ?? '';
    if (sql.includes('monthly_plan_integrity')) return [monthlyPlanRow()];
    if (sql.includes('CHAR_LENGTH')) {
      return sourceQuery(query);
    }
    if (sql.includes('FROM "review_records"')) {
      return capacityQuery(query);
    }
    return attachmentHistoryQuery(query);
  });
  const recurringPlanFindMany = vi
    .fn()
    .mockResolvedValue(input?.recurringPlans ?? []);

  return {
    attachmentHistoryQuery,
    capacityQuery,
    db: {
      project: { findUnique: vi.fn().mockResolvedValue(project) },
      workflowTask: { findFirst: vi.fn().mockResolvedValue(null) },
      trialProduction: { findFirst: vi.fn().mockResolvedValue(null) },
      reviewRecord: { findMany: reviewFindMany },
      recurringTask: { findMany: recurringFindMany },
      recurringPlan: { findMany: recurringPlanFindMany },
      $queryRaw: queryRaw,
    },
    queryRaw,
    recurringFindMany,
    recurringPlanFindMany,
    reviewFindMany,
    sourceQuery,
  };
}

function nonCreateWriteHarness(input: {
  capacity: number;
  review?: Record<string, unknown>;
  realWorkspace?: boolean;
}) {
  const currentReview = {
    ...reviewRecord('review-1'),
    workflowTaskId: 'task-CAB_REVIEW',
    workflowTask: {
      id: 'task-CAB_REVIEW',
      status: WorkflowTaskStatus.IN_PROGRESS,
    },
    ...input.review,
  };
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const create = vi.fn().mockResolvedValue(reviewRecord('created'));
  const queryRaw = vi.fn(async (query: { strings?: readonly string[] }) => {
    const sql = query.strings?.join('') ?? '';
    if (sql.includes('monthly_plan_integrity')) return [monthlyPlanRow()];
    if (sql.includes('FOR UPDATE')) {
      return [{ id: sql.includes('workflow_tasks') ? 'task-CAB_REVIEW' : 'review-1' }];
    }
    if (sql.includes('CHAR_LENGTH')) {
      return [];
    }
    if (sql.includes('review_records')) {
      const admittedCapacity =
        create.mock.calls.length > 0 ? input.capacity + 1 : input.capacity;
      return Array.from({ length: admittedCapacity }, (_, index) => ({
        id: `legacy-review-${index}`,
      }));
    }
    return [];
  });
  const tx = {
    $queryRaw: queryRaw,
    project: { findUnique: vi.fn().mockResolvedValue(project) },
    workflowTask: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'task-CAB_REVIEW',
        projectId: project.id,
        status: WorkflowTaskStatus.IN_PROGRESS,
        isActive: true,
      }),
    },
    trialProduction: {
      findFirst: vi.fn().mockResolvedValue({ id: 'trial-1' }),
    },
    user: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ id: actorId, status: UserStatus.ACTIVE }),
    },
    reviewRecord: {
      findFirst: vi.fn(async (args: { where?: { id?: unknown } }) =>
        typeof args.where?.id === 'string' ? currentReview : null),
      updateMany,
      create,
    },
  };
  const workspaceRows = Array.from({ length: 100 }, (_, index) =>
    reviewRecord(`workspace-review-${index}`),
  );
  const workspaceTx = {
    $queryRaw: queryRaw,
    project: { findUnique: vi.fn().mockResolvedValue(project) },
    workflowTask: { findFirst: vi.fn().mockResolvedValue(null) },
    trialProduction: { findFirst: vi.fn().mockResolvedValue(null) },
    reviewRecord: { findMany: vi.fn().mockResolvedValue(workspaceRows) },
    recurringPlan: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const transaction = vi.fn(
    async (
      executor: (client: typeof tx | typeof workspaceTx) => Promise<unknown>,
      options?: { isolationLevel?: string },
    ) => executor(options?.isolationLevel === 'RepeatableRead' ? workspaceTx : tx),
  );
  installTeamAuthorizationFixture(tx, [actor], id => id === 'task-CAB_REVIEW' ? { id, projectId: project.id, nodeCode: 'CAB_REVIEW', assigneeUserId: actorId, isActive: true, status: 'IN_PROGRESS' } : null);
  const prisma = {
    project: { findUnique: vi.fn().mockResolvedValue(project) },
    workflowTask: { findFirst: vi.fn().mockResolvedValue(null) },
    trialProduction: { findFirst: vi.fn().mockResolvedValue(null) },
    reviewRecord: {
      findMany: vi.fn().mockResolvedValue(workspaceRows),
    },
    $queryRaw: queryRaw,
    $transaction: transaction,
  };
  const activityCreate = vi.fn().mockResolvedValue(undefined);
  const transition = vi.fn().mockResolvedValue(undefined);
  const attachments = {
    createStoredAttachment: vi.fn(async (attachmentInput: {
      finalizeDomainAttachment: (
        client: typeof tx,
        context: { attachmentId: string },
      ) => Promise<void>;
    }) => {
      await attachmentInput.finalizeDomainAttachment(tx, {
        attachmentId: 'attachment-new',
      });
      return { id: 'attachment-new', fileName: 'review.pdf' };
    }),
    toAttachmentSummary: vi.fn(),
  };
  const service = new ReviewsService(
    prisma as never,
    { createWithExecutor: activityCreate } as never,
    attachments as never,
    { transitionTaskWithExecutor: transition } as never,
    {
      assertProjectAccessWithDefaultClient: vi.fn().mockResolvedValue(project),
    } as never,
  );
  const internals = service as never as Record<string, any>;
  vi.spyOn(internals, 'getCabinReviewContext').mockResolvedValue({
    project,
    trialProductionCompleted: true,
    activeTask: {
      id: 'task-CAB_REVIEW',
      status: WorkflowTaskStatus.IN_PROGRESS,
    },
  });
  vi.spyOn(internals, 'getCabinReviewOrThrow').mockResolvedValue(currentReview);
  vi.spyOn(internals, 'getLatestWorkflowTaskByNode').mockResolvedValue(null);
  if (!input.realWorkspace) {
    vi.spyOn(internals, 'buildCabinReviewWorkspace').mockResolvedValue({ ok: true });
  }

  return {
    service,
    activityCreate,
    attachments,
    create,
    queryRaw,
    transition,
    updateMany,
  };
}

type ReviewFamily = 'cabin' | 'consistency' | 'visual';

const REVIEW_FAMILY = {
  cabin: {
    reviewType: ReviewType.CAB_REVIEW,
    nodeCode: WorkflowNodeCode.CAB_REVIEW,
    contextMethod: 'getCabinReviewContext',
    recordMethod: 'getCabinReviewOrThrow',
    workspaceMethod: 'buildCabinReviewWorkspace',
    uploadMethod: 'uploadCabinReviewAttachment',
    contextFact: { trialProductionCompleted: true },
  },
  consistency: {
    reviewType: ReviewType.COLOR_CONSISTENCY_REVIEW,
    nodeCode: WorkflowNodeCode.COLOR_CONSISTENCY_REVIEW,
    contextMethod: 'getConsistencyReviewContext',
    recordMethod: 'getConsistencyReviewOrThrow',
    workspaceMethod: 'buildConsistencyReviewWorkspace',
    uploadMethod: 'uploadConsistencyReviewAttachment',
    contextFact: { cabinReviewCompleted: true },
  },
  visual: {
    reviewType: ReviewType.VISUAL_COLOR_DIFFERENCE_REVIEW,
    nodeCode: WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW,
    contextMethod: 'getVisualDeltaReviewContext',
    recordMethod: 'getVisualDeltaReviewOrThrow',
    workspaceMethod: 'buildVisualDeltaReviewWorkspace',
    uploadMethod: 'uploadVisualDeltaReviewAttachment',
    contextFact: { massProductionCompleted: true },
  },
} as const;

const REVIEW_WORKSPACES = [
  {
    label: 'cabin',
    method: 'buildCabinReviewWorkspace',
    reviewType: ReviewType.CAB_REVIEW,
  },
  {
    label: 'consistency',
    method: 'buildConsistencyReviewWorkspace',
    reviewType: ReviewType.COLOR_CONSISTENCY_REVIEW,
  },
  {
    label: 'visual-delta',
    method: 'buildVisualDeltaReviewWorkspace',
    reviewType: ReviewType.VISUAL_COLOR_DIFFERENCE_REVIEW,
  },
] as const;

const PERSISTED_SOURCE_FIELDS = [
  ['comment', 'legacy-comment-do-not-echo'],
  ['conditionNote', 'legacy-condition-do-not-echo'],
  ['rejectReason', 'legacy-rejection-do-not-echo'],
  ['reviewerName', 'legacy-reviewer-do-not-echo'],
] as const;

type PersistedSourceField = (typeof PERSISTED_SOURCE_FIELDS)[number][0];

type RawSqlQuery = {
  strings?: readonly string[];
  values?: readonly unknown[];
};

function sqlText(query: RawSqlQuery) {
  return query.strings?.join('') ?? '';
}

function workspaceSourceAdmissionHarness(input: {
  reviewType: ReviewType;
  violation?: PersistedSourceField;
  orphan?: boolean;
  rawValue?: string;
}) {
  const order: string[] = [];
  const boundaryReview = reviewRecord('review-boundary', input.reviewType, {
    comment: 'c'.repeat(4_000),
    conditionNote: 'n'.repeat(1_900),
    rejectReason: 'r'.repeat(2_000),
    reviewer: { id: actorId, name: '评'.repeat(200) },
  });
  const reviewFindMany = vi.fn(async () => {
    order.push('review-materialization');
    return [boundaryReview];
  });
  const recurringPlanFindMany = vi.fn(async () => {
    order.push('visual-plan-materialization');
    return [];
  });
  const capacityQuery = vi.fn(async (query: RawSqlQuery) => {
    void query.strings;
    order.push('capacity-sentinel');
    return [{ id: boundaryReview.id }];
  });
  const sourceQuery = vi.fn(async (query: RawSqlQuery) => {
    void query.strings;
    order.push('source-sentinel');
    if (input.orphan) {
      return [
        {
          reviewId: boundaryReview.id,
          field: 'reviewer',
          reasonCode: 'REVIEW_ORPHAN_REVIEWER',
        },
      ];
    }
    return input.violation
      ? [
          {
            reviewId: boundaryReview.id,
            field: input.violation,
            reasonCode: 'REVIEW_PERSISTED_SOURCE_OUT_OF_BOUNDS',
            rawValue: input.rawValue,
          },
        ]
      : [];
  });
  const attachmentHistoryQuery = vi.fn(async (query: RawSqlQuery) => {
    void query.strings;
    order.push('attachment-history');
    return [];
  });
  const queryRaw = vi.fn(async (query: RawSqlQuery) => {
    const sql = sqlText(query);
    if (sql.includes('monthly_plan_integrity')) return [monthlyPlanRow()];
    if (sql.includes('CHAR_LENGTH')) {
      return sourceQuery(query);
    }
    if (sql.includes('FROM "review_records"')) {
      return capacityQuery(query);
    }
    return attachmentHistoryQuery(query);
  });
  const db = {
    project: { findUnique: vi.fn().mockResolvedValue(project) },
    workflowTask: { findFirst: vi.fn().mockResolvedValue(null) },
    trialProduction: { findFirst: vi.fn().mockResolvedValue(null) },
    reviewRecord: { findMany: reviewFindMany },
    recurringPlan: { findMany: recurringPlanFindMany },
    $queryRaw: queryRaw,
  };
  const serviceHarness = createService(db);

  return {
    ...serviceHarness,
    attachmentHistoryQuery,
    boundaryReview,
    capacityQuery,
    db,
    order,
    queryRaw,
    recurringPlanFindMany,
    reviewFindMany,
    sourceQuery,
  };
}

const reviewAttachmentFile = {
  originalname: 'review.pdf',
  mimetype: 'application/pdf',
  size: 8,
  buffer: Buffer.from('%PDF-1'),
};

type UploadAdmissionOptions = {
  preflightCapacity?: number;
  finalizeCapacity?: number;
  preflightSourceViolation?: PersistedSourceField;
  finalizeSourceViolation?: PersistedSourceField;
  preflightOrphan?: boolean;
  finalizeSourceError?: unknown;
  visualPlans?: Array<{ id: string }>;
  finalizeVisualPlans?: Array<{ id: string }>;
  visualPeriodCount?: number;
  finalizeVisualPeriodCount?: number;
  invokeFinalize?: boolean;
  finalizeReviewOverrides?: Record<string, unknown>;
};

function uploadAdmissionHarness(
  family: ReviewFamily,
  options: UploadAdmissionOptions = {},
) {
  const config = REVIEW_FAMILY[family];
  const taskId = `task-${family}`;
  const order: string[] = [];
  let pipelineStarted = false;
  const currentReview = reviewRecord('review-upload', config.reviewType, {
    workflowTaskId: taskId,
    workflowTask: {
      id: taskId,
      status: WorkflowTaskStatus.IN_PROGRESS,
    },
  });
  const finalizedReview = {
    ...currentReview,
    ...options.finalizeReviewOverrides,
  };
  const reviewUpdate = vi.fn().mockResolvedValue({ count: 1 });
  const finalizeAttempt = vi.fn();
  const queryRaw = vi.fn(async (query: RawSqlQuery) => {
    const sql = sqlText(query);
    if (sql.includes('monthly_plan_integrity')) return [monthlyPlanRow(pipelineStarted ? options.finalizeVisualPeriodCount ?? options.visualPeriodCount ?? 12 : options.visualPeriodCount ?? 12)];
    if (sql.includes('FOR UPDATE')) {
      const phase = pipelineStarted ? 'finalize' : 'preflight';
      const target = sql.includes('workflow_tasks')
        ? 'task'
        : sql.includes('attachments')
          ? 'attachment'
          : 'review';
      order.push(`${phase}-${target}-lock`);
      return [
        {
          id:
            target === 'task'
              ? taskId
              : target === 'attachment'
                ? currentReview.attachmentId
                : currentReview.id,
        },
      ];
    }
    if (sql.includes('CHAR_LENGTH')) {
      order.push(pipelineStarted ? 'finalize-source' : 'preflight-source');
      if (pipelineStarted && options.finalizeSourceError) {
        throw options.finalizeSourceError;
      }
      if (!pipelineStarted && options.preflightOrphan) {
        return [
          {
            reviewId: currentReview.id,
            field: 'reviewer',
            reasonCode: 'REVIEW_ORPHAN_REVIEWER',
          },
        ];
      }
      const violation = pipelineStarted
        ? options.finalizeSourceViolation
        : options.preflightSourceViolation;
      return violation
        ? [
            {
              reviewId: currentReview.id,
              field: violation,
              reasonCode: 'REVIEW_PERSISTED_SOURCE_OUT_OF_BOUNDS',
              rawValue: `${violation}-raw-value-must-not-echo`,
            },
          ]
        : [];
    }
    if (sql.includes('recurring_plans') && sql.includes('workflow_tasks')) {
      order.push(pipelineStarted ? 'finalize-visual-plan' : 'preflight-visual-plan');
      return pipelineStarted
        ? options.finalizeVisualPlans ?? options.visualPlans ?? [{ id: 'plan-exact' }]
        : options.visualPlans ?? [{ id: 'plan-exact' }];
    }
    if (sql.includes('recurring_tasks')) {
      order.push(
        pipelineStarted ? 'finalize-visual-periods' : 'preflight-visual-periods',
      );
      const count = pipelineStarted
        ? options.finalizeVisualPeriodCount ?? options.visualPeriodCount ?? 12
        : options.visualPeriodCount ?? 12;
      return Array.from({ length: count }, (_, index) => ({ id: `period-${index}` }));
    }
    if (sql.includes('FROM "review_records"')) {
      order.push(pipelineStarted ? 'finalize-capacity' : 'preflight-capacity');
      const count = pipelineStarted
        ? options.finalizeCapacity ?? options.preflightCapacity ?? 100
        : options.preflightCapacity ?? 100;
      return Array.from({ length: count }, (_, index) => ({ id: `review-${index}` }));
    }
    return [];
  });
  const recordLookup = vi.fn(async () =>
    pipelineStarted ? finalizedReview : currentReview,
  );
  const tx = {
    $queryRaw: queryRaw,
    reviewRecord: {
      findFirst: recordLookup,
      updateMany: reviewUpdate,
    },
    workflowTask: {
      findFirst: vi.fn().mockResolvedValue({ id: taskId }),
    },
    attachment: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
  };
  const activityCreate = vi.fn().mockResolvedValue(undefined);
  const createStoredAttachment = vi.fn(
    async (attachmentInput: {
      finalizeDomainAttachment: (
        client: typeof tx,
        context: { attachmentId: string },
      ) => Promise<void>;
    }) => {
      order.push('createStoredAttachment');
      pipelineStarted = true;
      if (options.invokeFinalize) {
        finalizeAttempt();
        try {
          await attachmentInput.finalizeDomainAttachment(tx, {
            attachmentId: 'attachment-new',
          });
        } catch (error: unknown) {
          const response =
            error instanceof ConflictException ? error.getResponse() : null;
          if (
            typeof response === 'object' &&
            response !== null &&
            'code' in response &&
            response.code === 'ATTACHMENT_TARGET_STATE_CHANGED'
          ) {
            throw error;
          }
          throw new ServiceUnavailableException({
            code: 'ATTACHMENT_FINALIZE_RETRYABLE_FAILURE',
            message: '附件终态写入失败。',
          });
        }
      }
      return { id: 'attachment-new', fileName: reviewAttachmentFile.originalname };
    },
  );
  installTeamAuthorizationFixture(tx, [actor], id => id === taskId ? { id, projectId: project.id, nodeCode: config.nodeCode, assigneeUserId: actorId, isActive: true, status: 'IN_PROGRESS' } : null);
  Object.assign(tx, { recurringTask: {
    findFirst: vi.fn().mockResolvedValue({ id: 'period-current' }),
    findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'period-current', projectId: project.id, recurringPlanId: 'plan-exact',
      periodIndex: 1, reviewerId: actorId, plannedDate: new Date('2026-08-01T00:00:00Z'), status: 'PENDING' }),
  } });
  const prisma = {
    $queryRaw: queryRaw,
    reviewRecord: { findFirst: recordLookup },
    $transaction: vi.fn(
      async (executor: (client: typeof tx) => Promise<unknown>) => executor(tx),
    ),
  };
  const service = new ReviewsService(
    prisma as never,
    { createWithExecutor: activityCreate } as never,
    { createStoredAttachment, toAttachmentSummary: vi.fn() } as never,
    {} as never,
    {
      assertProjectAccessWithDefaultClient: vi.fn().mockResolvedValue(project),
    } as never,
  );
  const internals = service as never as Record<string, any>;
  vi.spyOn(internals, config.contextMethod).mockResolvedValue({
    project,
    ...config.contextFact,
    activeTask: {
      id: taskId,
      status: WorkflowTaskStatus.IN_PROGRESS,
    },
  });
  vi.spyOn(internals, config.workspaceMethod).mockResolvedValue({ ok: true });

  return {
    activityCreate,
    config,
    createStoredAttachment,
    finalizeAttempt,
    order,
    queryRaw,
    recordLookup,
    reviewUpdate,
    service,
  };
}

function callReviewUpload(harness: ReturnType<typeof uploadAdmissionHarness>) {
  return Reflect.apply(
    Reflect.get(harness.service, harness.config.uploadMethod),
    harness.service,
    [project.id, 'review-upload', reviewAttachmentFile, actor],
  ) as Promise<unknown>;
}

async function rejectionOf(promise: Promise<unknown>) {
  try {
    await promise;
    return null;
  } catch (error: unknown) {
    return error;
  }
}

function legacyPublicWriteHarness(
  family: ReviewFamily,
  overrides: Record<string, unknown>,
) {
  const config = REVIEW_FAMILY[family];
  const taskId = `task-${family}`;
  const currentReview = reviewRecord('review-legacy', config.reviewType, {
    workflowTaskId: taskId,
    workflowTask: {
      id: taskId,
      status: WorkflowTaskStatus.IN_PROGRESS,
    },
    ...overrides,
  });
  const reviewUpdate = vi.fn().mockResolvedValue({ count: 1 });
  const reviewCreate = vi.fn().mockResolvedValue(currentReview);
  const recurringUpdate = vi.fn().mockResolvedValue({ count: 1 });
  const transition = vi.fn().mockResolvedValue(undefined);
  const activityCreate = vi.fn().mockResolvedValue(undefined);
  const queryRaw = vi.fn(async (query: { strings?: readonly string[] }) => {
    const sql = query.strings?.join('') ?? '';
    if (sql.includes('monthly_plan_integrity')) return [monthlyPlanRow()];
    if (sql.includes('FOR UPDATE')) {
      return [{ id: sql.includes('workflow_tasks') ? taskId : 'review-legacy' }];
    }
    if (sql.includes('review_records')) {
      return Array.from({ length: 100 }, (_, index) => ({ id: `review-${index}` }));
    }
    if (sql.includes('recurring_plans') && sql.includes('workflow_tasks')) {
      return [{ id: 'plan-exact' }];
    }
    if (sql.includes('recurring_tasks')) {
      return [];
    }
    return [];
  });
  const tx = {
    $queryRaw: queryRaw,
    project: { findUnique: vi.fn().mockResolvedValue(project) },
    workflowTask: { findFirst: vi.fn().mockResolvedValue(null) },
    trialProduction: { findFirst: vi.fn().mockResolvedValue({ id: 'trial-1' }) },
    user: {
      findUnique: vi.fn().mockResolvedValue({
        id: actorId,
        name: '评审人',
        status: UserStatus.ACTIVE,
      }),
    },
    reviewRecord: {
      findFirst: vi.fn(async (args: { where?: { id?: unknown } }) =>
        typeof args.where?.id === 'string' ? currentReview : null),
      create: reviewCreate,
      updateMany: reviewUpdate,
    },
    recurringTask: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'period-current',
        recurringPlanId: 'plan-exact',
        periodIndex: 1,
        status: RecurringTaskStatus.PENDING,
      }),
      updateMany: recurringUpdate,
      count: vi.fn().mockResolvedValue(1),
    },
    recurringPlan: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ totalCount: 12 }),
    },
  };
  installTeamAuthorizationFixture(tx, [actor], id => id === taskId ? { id, projectId: project.id, nodeCode: config.nodeCode, assigneeUserId: actorId, isActive: true, status: 'IN_PROGRESS' } : null);
  Object.assign(tx.recurringTask, { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'period-current', projectId: project.id,
    recurringPlanId: 'plan-exact', periodIndex: 1, reviewerId: actorId, plannedDate: new Date('2026-08-01T00:00:00Z'), status: 'PENDING' }) });
  const prisma = {
    $transaction: vi.fn(
      async (executor: (client: typeof tx) => Promise<unknown>) => executor(tx),
    ),
  };
  const service = new ReviewsService(
    prisma as never,
    { createWithExecutor: activityCreate } as never,
    { toAttachmentSummary: vi.fn() } as never,
    { transitionTaskWithExecutor: transition } as never,
    {
      assertProjectAccessWithDefaultClient: vi.fn().mockResolvedValue(project),
    } as never,
  );
  const internals = service as never as Record<string, any>;
  vi.spyOn(internals, config.contextMethod).mockResolvedValue({
    project,
    ...config.contextFact,
    activeTask: {
      id: taskId,
      status: WorkflowTaskStatus.IN_PROGRESS,
    },
  });
  vi.spyOn(internals, config.recordMethod).mockResolvedValue(currentReview);
  vi.spyOn(internals, config.workspaceMethod).mockResolvedValue({ ok: true });
  vi.spyOn(internals, 'getLatestWorkflowTaskByNode').mockResolvedValue(null);

  return {
    service,
    activityCreate,
    queryRaw,
    recurringUpdate,
    reviewCreate,
    reviewUpdate,
    transition,
    tx,
  };
}

describe('ReviewsService resource bounds', () => {
  it('accepts exact review-field boundaries, including the workflow-safe condition boundary', () => {
    const { service } = createService();

    expect(() =>
      parseInput(service, {
        ...validInput,
        reviewerId: 'r'.repeat(64),
        reviewConclusion: ReviewResult.CONDITIONAL_APPROVED,
        comment: 'c'.repeat(4_000),
        conditionNote: 'n'.repeat(1_900),
        rejectReason: 'r'.repeat(2_000),
      }),
    ).not.toThrow();
  });

  it.each([
    ['reviewerId', 'r'.repeat(65)],
    ['reviewerId', 'reviewer/unsafe'],
    ['comment', 'c'.repeat(4_001)],
    ['conditionNote', 'n'.repeat(1_901)],
    ['rejectReason', 'r'.repeat(2_001)],
  ])('rejects an out-of-bounds %s value', (field, value) => {
    const { service } = createService();

    expect(() => parseInput(service, { ...validInput, [field]: value })).toThrowError(
      expect.objectContaining({
        response: expect.objectContaining({
          code: 'REVIEW_INPUT_OUT_OF_BOUNDS',
        }),
      }),
    );
  });

  it('rejects a normalized multi-field payload above 16 KiB of UTF-8', () => {
    const { service } = createService();

    expect(() =>
      parseInput(service, {
        ...validInput,
        reviewConclusion: ReviewResult.CONDITIONAL_APPROVED,
        comment: '界'.repeat(4_000),
        conditionNote: '界'.repeat(1_600),
      }),
    ).toThrowError(
      expect.objectContaining({
        response: expect.objectContaining({
          code: 'REVIEW_INPUT_OUT_OF_BOUNDS',
        }),
      }),
    );
  });

  it('measures the normalized input rather than discarded surrounding whitespace', () => {
    const { service } = createService();

    expect(
      parseInput(service, {
        ...validInput,
        comment: `${' '.repeat(20_000)}评审通过${' '.repeat(20_000)}`,
      }),
    ).toMatchObject({ comment: '评审通过' });
  });

  it.each(REVIEW_WORKSPACES)(
    '$label workspace admits exact persisted-source boundaries without truncation',
    async ({ method, reviewType }) => {
      const harness = workspaceSourceAdmissionHarness({ reviewType });

      const workspace = await Reflect.get(harness.service, method).call(
        harness.service,
        harness.db,
        project.id,
      );

      expect(harness.order.slice(0, 2)).toEqual([
        'capacity-sentinel',
        'source-sentinel',
      ]);
      expect(harness.reviewFindMany).toHaveBeenCalledTimes(1);
      expect(harness.attachmentHistoryQuery).toHaveBeenCalledTimes(1);
      expect(workspace.items[0]).toMatchObject({
        comment: 'c'.repeat(4_000),
        conditionNote: 'n'.repeat(1_900),
        rejectReason: 'r'.repeat(2_000),
        reviewerName: '评'.repeat(200),
      });
      const sourceSql = harness.sourceQuery.mock.calls[0]![0];
      expect(sqlText(sourceSql)).toContain('CHAR_LENGTH');
      expect(sqlText(sourceSql)).toContain('OCTET_LENGTH');
      expect(sqlText(sourceSql)).toContain('CASE');
      expect(sqlText(sourceSql)).toContain('LEFT JOIN "users"');
      expect(sqlText(sourceSql)).toContain('review_record."id" IN');
      expect(sourceSql.values).toEqual(
        expect.arrayContaining([
          project.id,
          reviewType,
          harness.boundaryReview.id,
          4_000,
          16_000,
          1_900,
          7_600,
          2_000,
          8_000,
          200,
          800,
          1,
        ]),
      );
    },
  );

  for (const workspace of REVIEW_WORKSPACES) {
    it.each(PERSISTED_SOURCE_FIELDS)(
      `${workspace.label} workspace rejects an over-bound %s before large materialization`,
      async (field, rawValue) => {
        const harness = workspaceSourceAdmissionHarness({
          reviewType: workspace.reviewType,
          violation: field,
          rawValue,
        });

        const error = await rejectionOf(
          Reflect.get(harness.service, workspace.method).call(
            harness.service,
            harness.db,
            project.id,
          ),
        );

        expect(error).toMatchObject({
          response: { code: 'REVIEW_PERSISTED_SOURCE_OUT_OF_BOUNDS' },
        });
        expect(
          JSON.stringify((error as ConflictException).getResponse()),
        ).not.toContain(rawValue);
        expect(harness.order).toEqual([
          'capacity-sentinel',
          'source-sentinel',
        ]);
        expect(harness.reviewFindMany).not.toHaveBeenCalled();
        expect(harness.recurringPlanFindMany).not.toHaveBeenCalled();
        expect(harness.attachmentHistoryQuery).not.toHaveBeenCalled();
        expect(harness.toAttachmentSummary).not.toHaveBeenCalled();
        const sourceSql = harness.sourceQuery.mock.calls[0]![0];
        expect(sqlText(sourceSql)).not.toContain(rawValue);
        expect(sourceSql.values).not.toContain(rawValue);
      },
    );
  }

  it.each(REVIEW_WORKSPACES)(
    '$label workspace rejects orphan reviewer history with a controlled domain 409 before materialization',
    async ({ method, reviewType }) => {
      const harness = workspaceSourceAdmissionHarness({
        reviewType,
        orphan: true,
      });

      const error = await rejectionOf(
        Reflect.get(harness.service, method).call(
          harness.service,
          harness.db,
          project.id,
        ),
      );

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getStatus()).toBe(409);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: 'REVIEW_ORPHAN_REVIEWER',
      });
      expect(harness.order).toEqual([
        'capacity-sentinel',
        'source-sentinel',
      ]);
      expect(harness.reviewFindMany).not.toHaveBeenCalled();
      expect(harness.attachmentHistoryQuery).not.toHaveBeenCalled();
    },
  );

  it.each(['cabin', 'consistency', 'visual'] as const)(
    '%s upload rejects the existing-record cap before starting attachment storage',
    async (family) => {
      const harness = uploadAdmissionHarness(family, {
        preflightCapacity: 101,
      });

      const error = await rejectionOf(callReviewUpload(harness));

      expect(error).toMatchObject({
        response: { code: 'REVIEW_RECORD_LIMIT_EXCEEDED' },
      });
      expect(harness.order).toEqual([
        'preflight-review-lock',
        'preflight-task-lock',
        'preflight-capacity',
      ]);
      expect(harness.createStoredAttachment).not.toHaveBeenCalled();
      expect(harness.recordLookup).toHaveBeenCalledTimes(1);
      expect(harness.reviewUpdate).not.toHaveBeenCalled();
      expect(harness.activityCreate).not.toHaveBeenCalled();
    },
  );

  it.each(['cabin', 'consistency', 'visual'] as const)(
    '%s upload rejects an unsafe persisted source before starting attachment storage',
    async (family) => {
      const rawValue = 'persisted-source-must-not-echo';
      const harness = uploadAdmissionHarness(family, {
        preflightSourceViolation: 'comment',
      });

      const error = await rejectionOf(callReviewUpload(harness));

      expect(error).toMatchObject({
        response: { code: 'REVIEW_PERSISTED_SOURCE_OUT_OF_BOUNDS' },
      });
      expect(
        JSON.stringify((error as ConflictException).getResponse()),
      ).not.toContain(rawValue);
      expect(harness.order).toEqual([
        'preflight-review-lock',
        'preflight-task-lock',
        'preflight-capacity',
        'preflight-source',
      ]);
      expect(harness.createStoredAttachment).not.toHaveBeenCalled();
      expect(harness.recordLookup).toHaveBeenCalledTimes(1);
      expect(harness.reviewUpdate).not.toHaveBeenCalled();
      expect(harness.activityCreate).not.toHaveBeenCalled();
    },
  );

  it.each(['cabin', 'consistency', 'visual'] as const)(
    '%s upload rejects an orphan reviewer before reserve, upload, scan, or promote can start',
    async (family) => {
      const harness = uploadAdmissionHarness(family, {
        preflightOrphan: true,
      });

      const error = await rejectionOf(callReviewUpload(harness));

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getStatus()).toBe(409);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: 'REVIEW_ORPHAN_REVIEWER',
      });
      expect(harness.createStoredAttachment).not.toHaveBeenCalled();
      expect(harness.finalizeAttempt).not.toHaveBeenCalled();
      expect(harness.reviewUpdate).not.toHaveBeenCalled();
      expect(harness.activityCreate).not.toHaveBeenCalled();
    },
  );

  it.each([
    {
      label: 'ambiguous plan identity',
      options: { visualPlans: [{ id: 'plan-a' }, { id: 'plan-b' }] },
      code: 'VISUAL_DELTA_REVIEW_PLAN_IDENTITY_CONFLICT',
    },
    {
      label: 'thirteenth plan period',
      options: { visualPeriodCount: 13 },
      code: 'MONTHLY_REVIEW_PLAN_INVALID',
    },
  ])(
    'visual upload rejects $label before starting attachment storage',
    async ({ options, code }) => {
      const harness = uploadAdmissionHarness('visual', options);

      const error = await rejectionOf(callReviewUpload(harness));

      expect(error).toMatchObject({ response: { code } });
      expect(harness.createStoredAttachment).not.toHaveBeenCalled();
      expect(harness.recordLookup).toHaveBeenCalledTimes(2);
      expect(harness.reviewUpdate).not.toHaveBeenCalled();
      expect(harness.activityCreate).not.toHaveBeenCalled();
      expect(harness.order.slice(0, 4)).toEqual([
        'preflight-review-lock',
        'preflight-task-lock',
        'preflight-capacity',
        'preflight-source',
      ]);
    },
  );

  const finalizeDriftCases: Array<{
    family: ReviewFamily;
    options: UploadAdmissionOptions;
    reasonCode: string;
  }> = [
    {
      family: 'cabin',
      options: {
        preflightCapacity: 100,
        finalizeCapacity: 101,
        invokeFinalize: true,
      },
      reasonCode: 'REVIEW_RECORD_LIMIT_EXCEEDED',
    },
    {
      family: 'consistency',
      options: {
        finalizeSourceViolation: 'comment',
        invokeFinalize: true,
      },
      reasonCode: 'REVIEW_PERSISTED_SOURCE_OUT_OF_BOUNDS',
    },
    {
      family: 'visual',
      options: {
        visualPlans: [{ id: 'plan-exact' }],
        finalizeVisualPlans: [{ id: 'plan-a' }, { id: 'plan-b' }],
        invokeFinalize: true,
      },
      reasonCode: 'VISUAL_DELTA_REVIEW_PLAN_IDENTITY_CONFLICT',
    },
  ];

  for (const driftCase of finalizeDriftCases) {
    it(`${driftCase.family} upload maps finalize resource drift to non-retryable domain 409`, async () => {
      const harness = uploadAdmissionHarness(
        driftCase.family,
        driftCase.options,
      );

      const error = await rejectionOf(callReviewUpload(harness));

      expect(error).toBeInstanceOf(ConflictException);
      expect(error).not.toBeInstanceOf(ServiceUnavailableException);
      expect((error as ConflictException).getStatus()).toBe(409);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: 'ATTACHMENT_TARGET_STATE_CHANGED',
        reasonCode: driftCase.reasonCode,
      });
      expect(harness.createStoredAttachment).toHaveBeenCalledTimes(1);
      expect(harness.finalizeAttempt).toHaveBeenCalledTimes(1);
      expect(harness.reviewUpdate).not.toHaveBeenCalled();
      expect(harness.activityCreate).not.toHaveBeenCalled();
      expect(harness.order.indexOf('preflight-capacity')).toBeGreaterThanOrEqual(0);
      expect(harness.order.indexOf('preflight-capacity')).toBeLessThan(
        harness.order.indexOf('createStoredAttachment'),
      );
    });
  }

  it('keeps finalize state recheck after upload preflight and fails closed on submission drift', async () => {
    const harness = uploadAdmissionHarness('cabin', {
      invokeFinalize: true,
      finalizeReviewOverrides: {
        submittedAt: new Date('2026-08-11T02:00:00.000Z'),
      },
    });

    const error = await rejectionOf(callReviewUpload(harness));

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getStatus()).toBe(409);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'ATTACHMENT_TARGET_STATE_CHANGED',
    });
    expect(harness.createStoredAttachment).toHaveBeenCalledTimes(1);
    expect(harness.finalizeAttempt).toHaveBeenCalledTimes(1);
    expect(harness.reviewUpdate).not.toHaveBeenCalled();
    expect(harness.activityCreate).not.toHaveBeenCalled();
    expect(harness.order.indexOf('preflight-capacity')).toBeLessThan(
      harness.order.indexOf('createStoredAttachment'),
    );
  });

  it.each(['cabin', 'consistency', 'visual'] as const)(
    '%s upload maps reviewer deletion between preflight and finalize to domain 409 without binding or success audit',
    async (family) => {
      const harness = uploadAdmissionHarness(family, {
        invokeFinalize: true,
        finalizeReviewOverrides: {
          reviewerId: null,
          reviewer: null,
        },
      });

      const error = await rejectionOf(callReviewUpload(harness));

      expect(error).toBeInstanceOf(ConflictException);
      expect(error).not.toBeInstanceOf(ServiceUnavailableException);
      expect((error as ConflictException).getStatus()).toBe(409);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: 'ATTACHMENT_TARGET_STATE_CHANGED',
        reasonCode: 'REVIEW_ORPHAN_REVIEWER',
      });
      expect(harness.createStoredAttachment).toHaveBeenCalledTimes(1);
      expect(harness.finalizeAttempt).toHaveBeenCalledTimes(1);
      expect(harness.reviewUpdate).not.toHaveBeenCalled();
      expect(harness.activityCreate).not.toHaveBeenCalled();
    },
  );

  it('does not disguise an unknown finalize infrastructure failure as a domain 409', async () => {
    const infrastructureFailure = new ServiceUnavailableException({
      code: 'POSTGRES_TEMPORARILY_UNAVAILABLE',
      message: 'temporary test failure',
    });
    const harness = uploadAdmissionHarness('cabin', {
      invokeFinalize: true,
      finalizeSourceError: infrastructureFailure,
    });

    const error = await rejectionOf(callReviewUpload(harness));

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect(error).not.toBeInstanceOf(ConflictException);
    expect((error as ServiceUnavailableException).getStatus()).toBe(503);
    expect(harness.reviewUpdate).not.toHaveBeenCalled();
    expect(harness.activityCreate).not.toHaveBeenCalled();
  });

  it.each([
    [
      'createCabinReview',
      'lockCabinReviewWriteState',
      ReviewType.CAB_REVIEW,
    ],
    [
      'createConsistencyReview',
      'lockConsistencyReviewWriteState',
      ReviewType.COLOR_CONSISTENCY_REVIEW,
    ],
    [
      'createVisualDeltaReview',
      'lockVisualDeltaReviewWriteState',
      ReviewType.VISUAL_COLOR_DIFFERENCE_REVIEW,
    ],
  ] as const)(
    'admits %s only after locking the exact task and scopes the shared cap by project and type',
    async (createMethod, lockMethod, reviewType) => {
      const order: string[] = [];
      const capacityQuery = vi.fn(async (query: unknown) => {
        void query;
        order.push('capacity');
        return Array.from({ length: 100 }, (_, index) => ({ id: `r-${index}` }));
      });
      const create = vi.fn().mockResolvedValue(reviewRecord('created', reviewType));
      const tx = {
        $queryRaw: capacityQuery,
        reviewRecord: {
          findFirst: vi.fn().mockResolvedValue(null),
          create,
        },
        user: {
          findUnique: vi
            .fn()
            .mockResolvedValue({ id: actorId, status: UserStatus.ACTIVE }),
        },
        trialProduction: {
          findFirst: vi.fn().mockResolvedValue({ id: 'trial-1' }),
        },
        recurringTask: {
          findFirst: vi.fn().mockResolvedValue({ id: 'period-1' }),
        },
      };
      const rootWorkspace = workspaceDb();
      installTeamAuthorizationFixture(tx, [actor]);
      const prisma = {
        ...rootWorkspace.db,
        $transaction: vi.fn(
          async (executor: (client: typeof tx) => Promise<unknown>) => executor(tx),
        ),
      };
      const { service } = createService(prisma);
      Reflect.set(
        service,
        lockMethod,
        vi.fn().mockImplementation(async () => {
          order.push('lock');
          return { context: { activeTask: { id: 'exact-active-task' } } };
        }),
      );

      await expect(
        Reflect.apply(Reflect.get(service, createMethod), service, [
          project.id,
          validInput,
          actor,
        ]),
      ).rejects.toMatchObject({
        response: { code: 'REVIEW_RECORD_LIMIT_EXCEEDED' },
      });

      expect(order).toEqual(['lock', 'capacity']);
      expect(capacityQuery).toHaveBeenCalledTimes(1);
      const capacitySql = capacityQuery.mock.calls[0]![0] as {
        strings: readonly string[];
        values: readonly unknown[];
      };
      expect(capacitySql.strings.join('')).toContain('FROM "review_records"');
      expect(capacitySql.strings.join('')).toContain('LIMIT');
      expect(capacitySql.values).toEqual(
        expect.arrayContaining([project.id, reviewType, 101]),
      );
      expect(create).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['buildCabinReviewWorkspace', ReviewType.CAB_REVIEW],
    [
      'buildConsistencyReviewWorkspace',
      ReviewType.COLOR_CONSISTENCY_REVIEW,
    ],
    [
      'buildVisualDeltaReviewWorkspace',
      ReviewType.VISUAL_COLOR_DIFFERENCE_REVIEW,
    ],
  ] as const)(
    'uses a 101-row sentinel and fail-closes legacy overflow in %s',
    async (method, reviewType) => {
      const rows = Array.from({ length: 101 }, (_, index) =>
        reviewRecord(`review-${index}`, reviewType),
      );
      const harness = workspaceDb({ reviews: rows });
      const { service } = createService(harness.db);

      await expect(
        Reflect.get(service, method).call(service, harness.db, project.id),
      ).rejects.toMatchObject({
        response: { code: 'REVIEW_RECORD_LIMIT_EXCEEDED' },
      });
      expect(harness.capacityQuery).toHaveBeenCalledTimes(1);
      const capacitySql = harness.capacityQuery.mock.calls[0]![0] as RawSqlQuery;
      expect(capacitySql.values).toEqual(
        expect.arrayContaining([project.id, reviewType, 101]),
      );
      expect(harness.sourceQuery).not.toHaveBeenCalled();
      expect(harness.reviewFindMany).not.toHaveBeenCalled();
      expect(harness.attachmentHistoryQuery).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['getCabinReviewWorkspace', ReviewType.CAB_REVIEW],
    [
      'getConsistencyReviewWorkspace',
      ReviewType.COLOR_CONSISTENCY_REVIEW,
    ],
    [
      'getVisualDeltaReviewWorkspace',
      ReviewType.VISUAL_COLOR_DIFFERENCE_REVIEW,
    ],
  ] as const)(
    'runs %s ID selection, persisted admission, exact materialization, and attachment history on one RepeatableRead client',
    async (method, reviewType) => {
      const selectedIds = Array.from(
        { length: 100 },
        (_, index) => `selected-${String(index).padStart(3, '0')}`,
      );
      const rows = selectedIds.map((id) => reviewRecord(id, reviewType));
      const queryRaw = vi.fn(async (query: RawSqlQuery) => {
        const sql = sqlText(query);
        if (sql.includes('monthly_plan_integrity')) return [monthlyPlanRow()];
        if (sql.includes('CHAR_LENGTH')) {
          return [];
        }
        if (sql.includes('FROM "review_records"')) {
          return selectedIds.map((id) => ({ id }));
        }
        return [];
      });
      const reviewFindMany = vi.fn().mockResolvedValue(rows);
      const tx = {
        project: { findUnique: vi.fn().mockResolvedValue(project) },
        workflowTask: { findFirst: vi.fn().mockResolvedValue(null) },
        trialProduction: { findFirst: vi.fn().mockResolvedValue(null) },
        reviewRecord: { findMany: reviewFindMany },
        recurringPlan: { findMany: vi.fn().mockResolvedValue([]) },
        $queryRaw: queryRaw,
      };
      const transaction = vi.fn(
        async (executor: (client: typeof tx) => Promise<unknown>) =>
          executor(tx),
      );
      const { service } = createService({ $transaction: transaction });

      const workspace = await Reflect.apply(
        Reflect.get(service, method),
        service,
        [project.id, actor],
      );

      expect(workspace.items).toHaveLength(100);
      expect(transaction).toHaveBeenCalledTimes(1);
      expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      });
      const selectionSql = queryRaw.mock.calls[0]![0];
      const admissionSql = queryRaw.mock.calls[1]![0];
      const attachmentSql = queryRaw.mock.calls[2]![0];
      expect(sqlText(selectionSql)).toContain(
        'ORDER BY review_record."id" ASC',
      );
      expect(selectionSql.values).toEqual(
        expect.arrayContaining([project.id, reviewType, 101]),
      );
      expect(sqlText(admissionSql)).toContain('review_record."id" IN');
      expect(admissionSql.values).toEqual(
        expect.arrayContaining(selectedIds),
      );
      expect(reviewFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            projectId: project.id,
            reviewType,
            id: { in: selectedIds },
          }),
        }),
      );
      expect(attachmentSql.values).toEqual(
        expect.arrayContaining(selectedIds),
      );
    },
  );

  it('caps each visual recurring plan with a 13-row sentinel and fail-closes the thirteenth period', async () => {
    const rows = [
      reviewRecord('review-current', ReviewType.VISUAL_COLOR_DIFFERENCE_REVIEW, {
        workflowTaskId: 'task-current',
        reviewPeriod: '2026-08',
      }),
    ];
    const recurringPlans = [
      {
        sourceWorkflowTaskId: 'task-current',
        tasks: Array.from({ length: 13 }, (_, index) => ({
          id: `period-${index}`,
          status: RecurringTaskStatus.COMPLETED,
          plannedDate: new Date(
            `2026-${String(index + 1).padStart(2, '0')}-01T00:00:00.000Z`,
          ),
        })),
      },
    ];
    const harness = workspaceDb({ reviews: rows, recurringPlans });
    const { service } = createService(harness.db);

    await expect(
      Reflect.get(service, 'buildVisualDeltaReviewWorkspace').call(
        service,
        harness.db,
        project.id,
      ),
    ).rejects.toMatchObject({
      response: { code: 'VISUAL_DELTA_REVIEW_PERIOD_LIMIT_EXCEEDED' },
    });
    expect(harness.recurringPlanFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          projectId: project.id, sourceNodeCode: WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW,
        }),
        select: expect.objectContaining({
          tasks: expect.objectContaining({ take: 13 }),
        }),
      }),
    );
    expect(harness.capacityQuery).toHaveBeenCalledTimes(1);
    expect(harness.sourceQuery).toHaveBeenCalledTimes(1);
    expect(harness.attachmentHistoryQuery).not.toHaveBeenCalled();
  });

  it('binds visual recurring-task lookup to the current workflow task', async () => {
    const legacyTask = {
      id: 'legacy-completed',
      recurringPlanId: 'legacy-plan',
      status: RecurringTaskStatus.COMPLETED,
    };
    const currentTask = {
      id: 'current-pending',
      projectId: project.id, recurringPlanId: 'plan-current', reviewerId: actorId, plannedDate: new Date('2026-08-01T00:00:00Z'),
      status: RecurringTaskStatus.PENDING,
    };
    const findFirst = vi.fn(async (args: {
      where: { recurringPlanId?: string };
    }) =>
      args.where.recurringPlanId === 'plan-current'
        ? currentTask
        : legacyTask,
    );
    const { service } = createService({
      recurringTask: { findFirst },
    });

    await expect(
      Reflect.get(service, 'getVisualDeltaRecurringTaskForDate').call(
        service,
        { $queryRaw: vi.fn().mockResolvedValue([{ id: currentTask.id }]), recurringTask: { findFirst, findUniqueOrThrow: vi.fn().mockResolvedValue(currentTask) } },
        project.id,
        'plan-current',
        new Date('2026-08-11T00:00:00.000Z'),
        actor,
      ),
    ).resolves.toEqual(currentTask);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          projectId: project.id,
          recurringPlanId: 'plan-current',
        }),
      }),
    );
  });

  it('keeps project month completion through a task rework without mixing different months', async () => {
    const rows = [
      reviewRecord('review-old', ReviewType.VISUAL_COLOR_DIFFERENCE_REVIEW, {
        workflowTaskId: 'task-old',
        reviewPeriod: '2026-07',
      }),
      reviewRecord('review-current', ReviewType.VISUAL_COLOR_DIFFERENCE_REVIEW, {
        workflowTaskId: 'task-current',
        reviewPeriod: '2026-08',
      }),
    ];
    const recurringPlans = [{ sourceWorkflowTaskId: 'task-old', tasks: [
      { status: RecurringTaskStatus.COMPLETED, plannedDate: new Date('2026-07-01T00:00:00Z') },
      { status: RecurringTaskStatus.PENDING, plannedDate: new Date('2026-08-01T00:00:00Z') },
    ] }];
    const harness = workspaceDb({ reviews: rows, recurringPlans });
    const { service } = createService(harness.db);

    const workspace = await Reflect.get(
      service,
      'buildVisualDeltaReviewWorkspace',
    ).call(service, harness.db, project.id);

    expect(workspace.items).toEqual([
      expect.objectContaining({ id: 'review-old', isPeriodCompleted: true }),
      expect.objectContaining({ id: 'review-current', isPeriodCompleted: false }),
    ]);
    expect(harness.recurringPlanFindMany).toHaveBeenCalledTimes(1);
    expect(harness.recurringFindMany).not.toHaveBeenCalled();
  });

  it('rejects multiple historical project plans even when each has fewer than twelve periods', async () => {
    const rows = [
      reviewRecord('review-old', ReviewType.VISUAL_COLOR_DIFFERENCE_REVIEW, {
        workflowTaskId: 'task-old',
        reviewPeriod: '2026-01',
      }),
      reviewRecord('review-current', ReviewType.VISUAL_COLOR_DIFFERENCE_REVIEW, {
        workflowTaskId: 'task-current',
        reviewPeriod: '2026-08',
      }),
    ];
    const buildTasks = (prefix: string) =>
      Array.from({ length: 7 }, (_, index) => ({
        id: `${prefix}-${index}`,
        status: RecurringTaskStatus.COMPLETED,
        plannedDate: new Date(
          `2026-${String(index + 1).padStart(2, '0')}-01T00:00:00.000Z`,
        ),
      }));
    const harness = workspaceDb({
      reviews: rows,
      recurringPlans: [
        { sourceWorkflowTaskId: 'task-old', tasks: buildTasks('old') },
        { sourceWorkflowTaskId: 'task-current', tasks: buildTasks('current') },
      ],
    });
    const { service } = createService(harness.db);

    await expect(
      Reflect.get(service, 'buildVisualDeltaReviewWorkspace').call(
        service,
        harness.db,
        project.id,
      ),
    ).rejects.toMatchObject({ response: { code: 'VISUAL_DELTA_REVIEW_PLAN_IDENTITY_CONFLICT' } });
    expect(harness.recurringPlanFindMany).toHaveBeenCalledTimes(1);
  });

  it('validates the exact current visual plan inside the workflow-task write lock', async () => {
    const queries: Array<{ strings?: readonly string[]; values?: readonly unknown[] }> = [];
    const queryRaw = vi.fn(async (query: {
      strings?: readonly string[];
      values?: readonly unknown[];
    }) => {
      queries.push(query);
      const sql = query.strings?.join('') ?? '';
      if (sql.includes('monthly_plan_integrity')) return [monthlyPlanRow(13)];
      if (sql.includes('workflow_tasks') && sql.includes('FOR UPDATE')) {
        return [{ id: 'task-current' }];
      }
      if (sql.includes('recurring_plans') && sql.includes('workflow_tasks')) {
        return [{ id: 'plan-exact' }];
      }
      if (sql.includes('recurring_tasks')) {
        return Array.from({ length: 13 }, (_, index) => ({
          id: `period-${index}`,
        }));
      }
      return [];
    });
    const { service } = createService({ $queryRaw: queryRaw });
    const internals = service as never as Record<string, any>;
    vi.spyOn(internals, 'getVisualDeltaReviewContext').mockResolvedValue({
      project,
      massProductionCompleted: true,
      activeTask: { id: 'task-current' },
    });

    await expect(
      internals.lockVisualDeltaReviewWriteState(
        visualLockTx(queryRaw),
        project.id,
        actor,
      ),
    ).rejects.toMatchObject({
      response: { code: 'MONTHLY_REVIEW_PLAN_INVALID' },
    });
    expect(queries).toHaveLength(4);
    expect(queries[0]!.strings?.join('')).toContain('workflow_tasks');
    expect(queries[1]!.strings?.join('')).toContain('workflow_tasks');
    expect(queries[2]!.strings?.join('')).toContain('recurring_plans');
    expect(queries[3]!.strings?.join('')).toContain('recurring_tasks');
    expect(queries[3]!.strings?.join('')).toContain('LIMIT 13');
    expect(queries[3]!.values).toContain(project.id);
  });

  it.each([
    {
      label: 'two same-scope plans even when each plan is individually bounded',
      plans: [{ id: 'plan-a' }, { id: 'plan-b' }],
    },
    {
      label: 'a plan whose damaged project identity leaves no in-scope match',
      plans: [],
    },
  ])('fails closed on $label before a visual write can continue', async ({ plans }) => {
    const afterLockWrite = vi.fn();
    const queryRaw = vi.fn(async (query: { strings?: readonly string[] }) => {
      const sql = query.strings?.join('') ?? '';
      if (sql.includes('monthly_plan_integrity')) return [monthlyPlanRow(13)];
      if (sql.includes('workflow_tasks') && sql.includes('FOR UPDATE')) {
        return [{ id: 'task-current' }];
      }
      if (sql.includes('recurring_plans') && sql.includes('workflow_tasks')) {
        return plans;
      }
      if (sql.includes('recurring_tasks')) {
        return [];
      }
      return [];
    });
    const { service } = createService({ $queryRaw: queryRaw });
    const internals = service as never as Record<string, any>;
    vi.spyOn(internals, 'getVisualDeltaReviewContext').mockResolvedValue({
      project,
      massProductionCompleted: true,
      activeTask: { id: 'task-current' },
    });

    await expect(
      (async () => {
        await internals.lockVisualDeltaReviewWriteState(
          visualLockTx(queryRaw),
          project.id,
          actor,
        );
        await afterLockWrite();
      })(),
    ).rejects.toMatchObject({
      response: { code: 'VISUAL_DELTA_REVIEW_PLAN_IDENTITY_CONFLICT' },
    });
    expect(afterLockWrite).not.toHaveBeenCalled();
  });

  it('carries the one exact recurring-plan id out of the workflow-task lock', async () => {
    const queries: Array<{
      strings?: readonly string[];
      values?: readonly unknown[];
    }> = [];
    const queryRaw = vi.fn(async (query: {
      strings?: readonly string[];
      values?: readonly unknown[];
    }) => {
      queries.push(query);
      const sql = query.strings?.join('') ?? '';
      if (sql.includes('monthly_plan_integrity')) return [monthlyPlanRow()];
      if (sql.includes('workflow_tasks') && sql.includes('FOR UPDATE')) {
        return [{ id: 'task-current' }];
      }
      if (sql.includes('recurring_plans') && sql.includes('workflow_tasks')) {
        return [{ id: 'plan-exact' }];
      }
      if (sql.includes('recurring_tasks')) {
        return Array.from({ length: 12 }, (_, index) => ({ id: `period-${index}` }));
      }
      return [];
    });
    const { service } = createService({ $queryRaw: queryRaw });
    const internals = service as never as Record<string, any>;
    vi.spyOn(internals, 'getVisualDeltaReviewContext').mockResolvedValue({
      project,
      massProductionCompleted: true,
      activeTask: { id: 'task-current' },
    });

    await expect(
      internals.lockVisualDeltaReviewWriteState(
        visualLockTx(queryRaw),
        project.id,
        actor,
      ),
    ).resolves.toMatchObject({ recurringPlanId: 'plan-exact' });
    const planIdentityQuery = queries.find((query) => {
      const sql = query.strings?.join('') ?? '';
      return sql.includes('recurring_plans') && sql.includes('workflow_tasks');
    });
    expect(planIdentityQuery?.values).toEqual(
      expect.arrayContaining([
        project.id,
        'task-current',
        WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW,
        2,
      ]),
    );
    const planCapacityQuery = queries.find((query) =>
      query.strings?.join('').includes('FROM "recurring_tasks"'),
    );
    expect(planCapacityQuery?.values).toEqual(
      expect.arrayContaining([project.id, 'plan-exact', 13]),
    );
  });

  it.each(['createVisualDeltaReview', 'updateVisualDeltaReview'] as const)(
    'passes the locked recurring-plan id from %s into date resolution',
    async (method) => {
      const stop = new Error('DATE_LOOKUP_REACHED');
      const currentReview = reviewRecord(
        'review-1',
        ReviewType.VISUAL_COLOR_DIFFERENCE_REVIEW,
        { workflowTaskId: 'task-current' },
      );
      const tx = {
        $queryRaw: vi.fn().mockResolvedValue([]),
        user: {
          findUnique: vi.fn().mockResolvedValue({
            id: actorId,
            name: '评审人',
            status: UserStatus.ACTIVE,
          }),
        },
      };
      installTeamAuthorizationFixture(tx, [actor]);
      const prisma = {
        $transaction: vi.fn(
          async (executor: (client: typeof tx) => Promise<unknown>) => executor(tx),
        ),
      };
      const { service } = createService(prisma);
      const internals = service as never as Record<string, any>;
      vi.spyOn(internals, 'lockVisualDeltaReviewWriteState').mockResolvedValue({
        context: { activeTask: { id: 'task-current' } },
        reviewRecord: method === 'updateVisualDeltaReview' ? currentReview : null,
        recurringPlanId: 'plan-exact',
      });
      const dateLookup = vi
        .spyOn(internals, 'getVisualDeltaRecurringTaskForDate')
        .mockRejectedValue(stop);

      const args = method === 'createVisualDeltaReview'
        ? [project.id, validInput, actor]
        : [project.id, 'review-1', validInput, actor];
      await expect(
        Reflect.apply(Reflect.get(service, method), service, args),
      ).rejects.toBe(stop);
      expect(dateLookup).toHaveBeenCalledWith(
        tx,
        project.id,
        'plan-exact',
        expect.any(Date),
        actor,
      );
    },
  );

  it('keeps visual approval recurring reads and writes on the locked exact plan', async () => {
    const currentReview = reviewRecord(
      'review-1',
      ReviewType.VISUAL_COLOR_DIFFERENCE_REVIEW,
      {
        workflowTaskId: 'task-current',
        submittedAt: new Date('2026-08-11T01:00:00.000Z'),
      },
    );
    const reviewUpdate = vi.fn().mockResolvedValue({ count: 1 });
    const recurringFindFirst = vi.fn().mockResolvedValue({
      id: 'period-current',
      recurringPlanId: 'plan-exact',
      periodIndex: 1,
      status: RecurringTaskStatus.PENDING,
    });
    const recurringUpdate = vi.fn().mockResolvedValue({ count: 1 });
    const recurringCount = vi.fn().mockResolvedValue(1);
    const planFind = vi.fn().mockResolvedValue({ totalCount: 12 });
    const tx = {
      reviewRecord: {
        updateMany: reviewUpdate,
        findFirst: vi.fn().mockResolvedValue(currentReview),
      },
      recurringTask: {
        findFirst: recurringFindFirst,
        updateMany: recurringUpdate,
        count: recurringCount,
      },
      recurringPlan: { findUniqueOrThrow: planFind },
    };
    installTeamAuthorizationFixture(tx, [actor]);
    Object.assign(tx, { $queryRaw: vi.fn().mockResolvedValue([{ id: 'period-current' }]) });
    Object.assign(tx.recurringTask, { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'period-current', projectId: project.id,
      recurringPlanId: 'plan-exact', periodIndex: 1, reviewerId: actorId, plannedDate: new Date('2026-08-01T00:00:00Z'), status: 'PENDING' }) });
    const prisma = {
      $transaction: vi.fn(
        async (executor: (client: typeof tx) => Promise<unknown>) => executor(tx),
      ),
    };
    const activityCreate = vi.fn().mockResolvedValue(undefined);
    const transition = vi.fn().mockResolvedValue(undefined);
    const service = new ReviewsService(
      prisma as never,
      { createWithExecutor: activityCreate } as never,
      {} as never,
      { transitionTaskWithExecutor: transition } as never,
      {
        assertProjectAccessWithDefaultClient: vi.fn().mockResolvedValue(project),
      } as never,
    );
    const internals = service as never as Record<string, any>;
    vi.spyOn(internals, 'lockVisualDeltaReviewWriteState').mockResolvedValue({
      context: {
        activeTask: {
          id: 'task-current',
          status: WorkflowTaskStatus.IN_PROGRESS,
        },
      },
      reviewRecord: currentReview,
      recurringPlanId: 'plan-exact',
    });
    vi.spyOn(internals, 'buildVisualDeltaReviewWorkspace').mockResolvedValue({ ok: true });

    await expect(
      service.approveVisualDeltaReview(project.id, 'review-1', actor),
    ).resolves.toEqual({ ok: true });
    expect(recurringFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          projectId: project.id,
          recurringPlanId: 'plan-exact',
        }),
      }),
    );
    expect(recurringUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'period-current',
          recurringPlanId: 'plan-exact',
        }),
      }),
    );
    expect(planFind).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'plan-exact' } }),
    );
    expect(recurringCount).toHaveBeenCalledWith({
      where: {
        recurringPlanId: 'plan-exact',
        status: RecurringTaskStatus.COMPLETED,
      },
    });
  });

  it.each([
    ['comment', { comment: 'c'.repeat(4_001) }],
    ['conditionNote', { conditionNote: 'n'.repeat(1_901) }],
    ['rejectReason', { rejectReason: 'r'.repeat(2_001) }],
    [
      'reviewerName',
      { reviewer: { id: actorId, name: '评'.repeat(201) } },
    ],
  ])('rejects an unbounded legacy %s before copying it into audit JSON', (_label, overrides) => {
    const { service } = createService();

    expect(() =>
      Reflect.get(service, 'toCabinReviewAuditSnapshot').call(
        service,
        reviewRecord('legacy-review', ReviewType.CAB_REVIEW, overrides),
      ),
    ).toThrowError(
      expect.objectContaining({
        response: expect.objectContaining({
          code: 'REVIEW_PERSISTED_SOURCE_OUT_OF_BOUNDS',
        }),
      }),
    );
  });

  it.each([
    ['cabin', 'rejectCabinReview'],
    ['consistency', 'rejectConsistencyReview'],
    ['visual', 'rejectVisualDeltaReview'],
  ] as const)(
    'rejects a legacy 2001-char reject reason before the %s public reject path writes',
    async (family, method) => {
      const harness = legacyPublicWriteHarness(family, {
        submittedAt: new Date('2026-08-11T01:00:00.000Z'),
        result: ReviewResult.REJECTED,
        rejectReason: 'r'.repeat(2_001),
      });

      await expect(
        Reflect.apply(Reflect.get(harness.service, method), harness.service, [
          project.id,
          'review-legacy',
          actor,
        ]),
      ).rejects.toMatchObject({
        response: { code: 'REVIEW_PERSISTED_SOURCE_OUT_OF_BOUNDS' },
      });
      expect(harness.reviewCreate).not.toHaveBeenCalled();
      expect(harness.reviewUpdate).not.toHaveBeenCalled();
      expect(harness.recurringUpdate).not.toHaveBeenCalled();
      expect(harness.transition).not.toHaveBeenCalled();
      expect(harness.activityCreate).not.toHaveBeenCalled();
    },
  );

  it('rejects a legacy 1901-char conditional note before public approval writes', async () => {
    const harness = legacyPublicWriteHarness('cabin', {
      submittedAt: new Date('2026-08-11T01:00:00.000Z'),
      result: ReviewResult.CONDITIONAL_APPROVED,
      conditionNote: 'n'.repeat(1_901),
    });

    await expect(
      harness.service.approveCabinReview(project.id, 'review-legacy', actor),
    ).rejects.toMatchObject({
      response: { code: 'REVIEW_PERSISTED_SOURCE_OUT_OF_BOUNDS' },
    });
    expect(harness.reviewUpdate).not.toHaveBeenCalled();
    expect(harness.recurringUpdate).not.toHaveBeenCalled();
    expect(harness.transition).not.toHaveBeenCalled();
    expect(harness.activityCreate).not.toHaveBeenCalled();
  });

  it('rejects a legacy 4001-char comment before visual approval touches review, recurring, workflow, or audit state', async () => {
    const harness = legacyPublicWriteHarness('visual', {
      submittedAt: new Date('2026-08-11T01:00:00.000Z'),
      result: ReviewResult.APPROVED,
      comment: 'c'.repeat(4_001),
    });

    await expect(
      harness.service.approveVisualDeltaReview(
        project.id,
        'review-legacy',
        actor,
      ),
    ).rejects.toMatchObject({
      response: { code: 'REVIEW_PERSISTED_SOURCE_OUT_OF_BOUNDS' },
    });
    expect(harness.reviewUpdate).not.toHaveBeenCalled();
    expect(harness.recurringUpdate).not.toHaveBeenCalled();
    expect(harness.transition).not.toHaveBeenCalled();
    expect(harness.activityCreate).not.toHaveBeenCalled();
  });

  it('rejects a persisted 201-char reviewer name before the public submit path claims the review', async () => {
    const harness = legacyPublicWriteHarness('cabin', {
      submittedAt: null,
      reviewer: { id: actorId, name: '评'.repeat(201) },
    });

    await expect(
      harness.service.submitCabinReview(project.id, 'review-legacy', actor),
    ).rejects.toMatchObject({
      response: { code: 'REVIEW_PERSISTED_SOURCE_OUT_OF_BOUNDS' },
    });
    expect(harness.reviewUpdate).not.toHaveBeenCalled();
    expect(harness.recurringUpdate).not.toHaveBeenCalled();
    expect(harness.transition).not.toHaveBeenCalled();
    expect(harness.activityCreate).not.toHaveBeenCalled();
  });

  it.each([
    ['updateCabinReview', { submittedAt: null, result: ReviewResult.APPROVED }],
    ['submitCabinReview', { submittedAt: null, result: ReviewResult.APPROVED }],
    [
      'approveCabinReview',
      {
        submittedAt: new Date('2026-08-11T01:00:00.000Z'),
        result: ReviewResult.APPROVED,
      },
    ],
    [
      'rejectCabinReview',
      {
        submittedAt: new Date('2026-08-11T01:00:00.000Z'),
        result: ReviewResult.REJECTED,
        rejectReason: '不通过',
      },
    ],
  ] as const)(
    'blocks legacy 101-row state before %s can mutate, transition, or audit',
    async (method, review) => {
      const harness = nonCreateWriteHarness({ capacity: 101, review });
      const args = method === 'updateCabinReview'
        ? [project.id, 'review-1', validInput, actor]
        : [project.id, 'review-1', actor];

      await expect(
        Reflect.apply(Reflect.get(harness.service, method), harness.service, args),
      ).rejects.toMatchObject({
        response: { code: 'REVIEW_RECORD_LIMIT_EXCEEDED' },
      });
      expect(harness.updateMany).not.toHaveBeenCalled();
      expect(harness.transition).not.toHaveBeenCalled();
      expect(harness.activityCreate).not.toHaveBeenCalled();
    },
  );

  it.each([
    {
      lockMethod: 'lockCabinReviewWriteState',
      contextMethod: 'getCabinReviewContext',
      recordMethod: 'getCabinReviewOrThrow',
      reviewType: ReviewType.CAB_REVIEW,
      contextFact: { trialProductionCompleted: true },
    },
    {
      lockMethod: 'lockConsistencyReviewWriteState',
      contextMethod: 'getConsistencyReviewContext',
      recordMethod: 'getConsistencyReviewOrThrow',
      reviewType: ReviewType.COLOR_CONSISTENCY_REVIEW,
      contextFact: { cabinReviewCompleted: true },
    },
    {
      lockMethod: 'lockVisualDeltaReviewWriteState',
      contextMethod: 'getVisualDeltaReviewContext',
      recordMethod: 'getVisualDeltaReviewOrThrow',
      reviewType: ReviewType.VISUAL_COLOR_DIFFERENCE_REVIEW,
      contextFact: { massProductionCompleted: true },
    },
  ] as const)(
    'uses the project/type legacy guard for $reviewType non-create locks',
    async ({
      lockMethod,
      contextMethod,
      recordMethod,
      reviewType,
      contextFact,
    }) => {
      const lockedReview = reviewRecord('review-1', reviewType, {
        workflowTaskId: 'task-current',
      });
      const queries: Array<{
        strings?: readonly string[];
        values?: readonly unknown[];
      }> = [];
      const queryRaw = vi.fn(async (query: {
        strings?: readonly string[];
        values?: readonly unknown[];
      }) => {
        queries.push(query);
        const sql = query.strings?.join('') ?? '';
        if (sql.includes('monthly_plan_integrity')) return [monthlyPlanRow()];
        if (sql.includes('FOR UPDATE')) {
          return [{ id: sql.includes('workflow_tasks') ? 'task-current' : 'review-1' }];
        }
        if (sql.includes('review_records')) {
          return Array.from({ length: 101 }, (_, index) => ({ id: `r-${index}` }));
        }
        return [];
      });
      const { service } = createService({ $queryRaw: queryRaw });
      const internals = service as never as Record<string, any>;
      vi.spyOn(internals, contextMethod).mockResolvedValue({
        project,
        ...contextFact,
        activeTask: { id: 'task-current' },
      });
      vi.spyOn(internals, recordMethod).mockResolvedValue(lockedReview);

      await expect(
        internals[lockMethod](
          visualLockTx(queryRaw),
          project.id,
          actor,
          'review-1',
        ),
      ).rejects.toMatchObject({
        response: { code: 'REVIEW_RECORD_LIMIT_EXCEEDED' },
      });
      expect(queries).toHaveLength(3);
      expect(queries[0]!.strings?.join('')).toContain('review_records');
      expect(queries[0]!.strings?.join('')).toContain('FOR UPDATE');
      expect(queries[1]!.strings?.join('')).toContain('workflow_tasks');
      expect(queries[1]!.strings?.join('')).toContain('FOR UPDATE');
      expect(queries[2]!.values).toEqual(
        expect.arrayContaining([project.id, reviewType, 101]),
      );
    },
  );

  it('maps finalize-time 101-row drift to domain 409 before update or success audit', async () => {
    const harness = uploadAdmissionHarness('cabin', {
      preflightCapacity: 100,
      finalizeCapacity: 101,
      invokeFinalize: true,
    });

    await expect(callReviewUpload(harness)).rejects.toMatchObject({
      response: {
        code: 'ATTACHMENT_TARGET_STATE_CHANGED',
        reasonCode: 'REVIEW_RECORD_LIMIT_EXCEEDED',
      },
    });
    expect(harness.createStoredAttachment).toHaveBeenCalledTimes(1);
    expect(harness.reviewUpdate).not.toHaveBeenCalled();
    expect(harness.activityCreate).not.toHaveBeenCalled();
  });

  it('checks the current visual plan after attachment row/task locks and before finalizing the domain link', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const queryRaw = vi.fn(async (query: { strings?: readonly string[] }) => {
      const sql = query.strings?.join('') ?? '';
      if (sql.includes('monthly_plan_integrity')) return [monthlyPlanRow(13)];
      if (sql.includes('FOR UPDATE')) {
        return [{ id: sql.includes('workflow_tasks') ? 'task-current' : 'review-1' }];
      }
      if (sql.includes('CHAR_LENGTH')) {
        return [];
      }
      if (sql.includes('review_records')) {
        return Array.from({ length: 100 }, (_, index) => ({ id: `review-${index}` }));
      }
      if (sql.includes('recurring_plans') && sql.includes('workflow_tasks')) {
        return [{ id: 'plan-exact' }];
      }
      if (sql.includes('recurring_tasks')) {
        return Array.from({ length: 13 }, (_, index) => ({ id: `period-${index}` }));
      }
      return [];
    });
    const tx = {
      $queryRaw: queryRaw,
      reviewRecord: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'review-1',
          workflowTaskId: 'task-current',
          reviewerId: actorId,
          reviewer: { id: actorId },
          attachmentId: null,
          submittedAt: null,
        }),
        updateMany,
      },
      workflowTask: {
        findFirst: vi.fn().mockResolvedValue({ id: 'task-current' }),
      },
    };
    const { service } = createService();
    installTeamAuthorizationFixture(tx, [actor], id => id === 'task-current' ? {
      id, projectId: project.id, nodeCode: WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW,
      assigneeUserId: actorId, isActive: true, status: 'IN_PROGRESS',
    } : null);
    const finalize = Reflect.get(
      service,
      'createReviewAttachmentFinalizeHook',
    ).call(service, {
      projectId: project.id,
      reviewId: 'review-1',
      reviewType: ReviewType.VISUAL_COLOR_DIFFERENCE_REVIEW,
      workflowTaskId: 'task-current',
      reviewerId: actorId,
      expectedAttachmentId: null,
      nodeCode: WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW,
      actor,
    });

    await expect(
      finalize(tx, { attachmentId: 'attachment-new' }),
    ).rejects.toMatchObject({
      response: {
        code: 'ATTACHMENT_TARGET_STATE_CHANGED',
        reasonCode: 'MONTHLY_REVIEW_PLAN_INVALID',
      },
    });
    expect(updateMany).not.toHaveBeenCalled();
    const sql = queryRaw.mock.calls.map(
      ([query]) => query.strings?.join('') ?? '',
    );
    expect(sql[0]).toContain('review_records');
    expect(sql[0]).toContain('FOR UPDATE');
    expect(sql[1]).toContain('workflow_tasks');
    expect(sql[1]).toContain('FOR UPDATE');
    expect(sql[2]).toContain('review_records');
    expect(sql[3]).toContain('CHAR_LENGTH');
    expect(sql[4]).toContain('recurring_plans');
    expect(sql[5]).toContain('recurring_tasks');
  });

  it('rejects ambiguous visual plans during attachment finalize before binding the attachment', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const queryRaw = vi.fn(async (query: { strings?: readonly string[] }) => {
      const sql = query.strings?.join('') ?? '';
      if (sql.includes('monthly_plan_integrity')) return [monthlyPlanRow()];
      if (sql.includes('FOR UPDATE')) {
        return [{ id: sql.includes('workflow_tasks') ? 'task-current' : 'review-1' }];
      }
      if (sql.includes('CHAR_LENGTH')) {
        return [];
      }
      if (sql.includes('review_records')) {
        return Array.from({ length: 100 }, (_, index) => ({ id: `review-${index}` }));
      }
      if (sql.includes('recurring_plans') && sql.includes('workflow_tasks')) {
        return [{ id: 'plan-a' }, { id: 'plan-b' }];
      }
      if (sql.includes('recurring_tasks')) {
        return [];
      }
      return [];
    });
    const tx = {
      $queryRaw: queryRaw,
      reviewRecord: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'review-1',
          workflowTaskId: 'task-current',
          reviewerId: actorId,
          attachmentId: null,
          submittedAt: null,
          comment: '评审通过',
          conditionNote: null,
          rejectReason: null,
          reviewer: { id: actorId, name: '评审人' },
        }),
        updateMany,
      },
      workflowTask: {
        findFirst: vi.fn().mockResolvedValue({ id: 'task-current' }),
      },
    };
    const { service } = createService();
    installTeamAuthorizationFixture(tx, [actor], id => id === 'task-current' ? {
      id, projectId: project.id, nodeCode: WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW,
      assigneeUserId: actorId, isActive: true, status: 'IN_PROGRESS',
    } : null);
    const finalize = Reflect.get(
      service,
      'createReviewAttachmentFinalizeHook',
    ).call(service, {
      projectId: project.id,
      reviewId: 'review-1',
      reviewType: ReviewType.VISUAL_COLOR_DIFFERENCE_REVIEW,
      workflowTaskId: 'task-current',
      reviewerId: actorId,
      expectedAttachmentId: null,
      nodeCode: WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW,
      actor,
    });

    await expect(
      finalize(tx, { attachmentId: 'attachment-new' }),
    ).rejects.toMatchObject({
      response: {
        code: 'ATTACHMENT_TARGET_STATE_CHANGED',
        reasonCode: 'VISUAL_DELTA_REVIEW_PLAN_IDENTITY_CONFLICT',
      },
    });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('allows a non-create write when the project/type workspace contains exactly 100 rows', async () => {
    const harness = nonCreateWriteHarness({ capacity: 100 });

    await expect(
      harness.service.updateCabinReview(
        project.id,
        'review-1',
        validInput,
        actor,
      ),
    ).resolves.toEqual({ ok: true });
    expect(harness.updateMany).toHaveBeenCalledTimes(1);
    expect(harness.activityCreate).toHaveBeenCalledTimes(1);
  });

  it('allows the 100th create from 99 rows and then returns the bounded workspace', async () => {
    const harness = nonCreateWriteHarness({ capacity: 99, realWorkspace: true });

    const workspace = await harness.service.createCabinReview(
      project.id,
      validInput,
      actor,
    );
    expect(workspace.items).toHaveLength(100);
    expect(harness.create).toHaveBeenCalledTimes(1);
    expect(harness.activityCreate).toHaveBeenCalledTimes(1);
  });

  it('loads attachment history once for the review page and exposes only 20 rows plus hasMore per review', async () => {
    const rows = [reviewRecord('review-a'), reviewRecord('review-b')];
    const attachmentRows = [
      ...Array.from({ length: 21 }, (_, index) => ({
        id: `attachment-a-${index}`,
        projectId: project.id,
        entityType: AttachmentTargetType.REVIEW_RECORD,
        entityId: 'review-a',
        scanStatus: AttachmentScanStatus.CLEAN,
      })),
      {
        id: 'attachment-b-0',
        projectId: project.id,
        entityType: AttachmentTargetType.REVIEW_RECORD,
        entityId: 'review-b',
        scanStatus: AttachmentScanStatus.CLEAN,
      },
    ];
    const harness = workspaceDb({ reviews: rows, attachmentRows });
    const { service, listTargetAttachments, toAttachmentSummary } = createService(
      harness.db,
    );

    const workspace = await Reflect.get(service, 'buildCabinReviewWorkspace').call(
      service,
      harness.db,
      project.id,
    );

    expect(harness.capacityQuery).toHaveBeenCalledTimes(1);
    expect(harness.sourceQuery).toHaveBeenCalledTimes(1);
    expect(harness.attachmentHistoryQuery).toHaveBeenCalledTimes(1);
    expect(listTargetAttachments).not.toHaveBeenCalled();
    expect(toAttachmentSummary).toHaveBeenCalledTimes(21);
    expect(workspace.items[0]).toMatchObject({
      id: 'review-a',
      attachmentHistoryHasMore: true,
    });
    expect(workspace.items[0].attachmentHistory).toHaveLength(20);
    expect(workspace.items[1]).toMatchObject({
      id: 'review-b',
      attachmentHistoryHasMore: false,
    });
    expect(workspace.items[1].attachmentHistory).toHaveLength(1);
  });
});
