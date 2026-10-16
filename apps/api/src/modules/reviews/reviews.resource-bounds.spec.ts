import {
  AttachmentScanStatus,
  AttachmentTargetType,
  RecurringTaskStatus,
  ReviewResult,
  ReviewType,
  UserStatus,
  WorkflowNodeCode,
  WorkflowTaskStatus,
} from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { ReviewsService } from './reviews.service';

const actorId = 'reviewer-1';
const actor = {
  id: actorId,
  roleCodes: ['project_manager'],
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
  const queryRaw = vi.fn().mockResolvedValue(input?.attachmentRows ?? []);
  const recurringPlanFindMany = vi
    .fn()
    .mockResolvedValue(input?.recurringPlans ?? []);

  return {
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
    if (sql.includes('FOR UPDATE')) {
      return [{ id: sql.includes('workflow_tasks') ? 'task-CAB_REVIEW' : 'review-1' }];
    }
    if (sql.includes('review_records')) {
      return Array.from({ length: input.capacity }, (_, index) => ({
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
  const prisma = {
    project: { findUnique: vi.fn().mockResolvedValue(project) },
    workflowTask: { findFirst: vi.fn().mockResolvedValue(null) },
    trialProduction: { findFirst: vi.fn().mockResolvedValue(null) },
    reviewRecord: {
      findMany: vi.fn().mockResolvedValue(
        Array.from({ length: 100 }, (_, index) =>
          reviewRecord(`workspace-review-${index}`),
        ),
      ),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
    $transaction: vi.fn(
      async (executor: (client: typeof tx) => Promise<unknown>) => executor(tx),
    ),
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
    contextFact: { trialProductionCompleted: true },
  },
  consistency: {
    reviewType: ReviewType.COLOR_CONSISTENCY_REVIEW,
    nodeCode: WorkflowNodeCode.COLOR_CONSISTENCY_REVIEW,
    contextMethod: 'getConsistencyReviewContext',
    recordMethod: 'getConsistencyReviewOrThrow',
    workspaceMethod: 'buildConsistencyReviewWorkspace',
    contextFact: { cabinReviewCompleted: true },
  },
  visual: {
    reviewType: ReviewType.VISUAL_COLOR_DIFFERENCE_REVIEW,
    nodeCode: WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW,
    contextMethod: 'getVisualDeltaReviewContext',
    recordMethod: 'getVisualDeltaReviewOrThrow',
    workspaceMethod: 'buildVisualDeltaReviewWorkspace',
    contextFact: { massProductionCompleted: true },
  },
} as const;

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
      expect(harness.reviewFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { projectId: project.id, reviewType },
          take: 101,
        }),
      );
      expect(harness.queryRaw).not.toHaveBeenCalled();
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
          sourceWorkflowTaskId: { in: ['task-current'] },
        }),
        select: expect.objectContaining({
          tasks: expect.objectContaining({ take: 13 }),
        }),
      }),
    );
    expect(harness.queryRaw).not.toHaveBeenCalled();
  });

  it('binds visual recurring-task lookup to the current workflow task', async () => {
    const legacyTask = {
      id: 'legacy-completed',
      recurringPlanId: 'legacy-plan',
      status: RecurringTaskStatus.COMPLETED,
    };
    const currentTask = {
      id: 'current-pending',
      recurringPlanId: 'current-plan',
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
        { recurringTask: { findFirst } },
        project.id,
        'plan-current',
        new Date('2026-08-11T00:00:00.000Z'),
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

  it('keys visual completion by workflow task and month without cross-plan or old-month pollution', async () => {
    const rows = [
      reviewRecord('review-old', ReviewType.VISUAL_COLOR_DIFFERENCE_REVIEW, {
        workflowTaskId: 'task-old',
        reviewPeriod: '2026-08',
      }),
      reviewRecord('review-current', ReviewType.VISUAL_COLOR_DIFFERENCE_REVIEW, {
        workflowTaskId: 'task-current',
        reviewPeriod: '2026-08',
      }),
    ];
    const recurringPlans = [
      {
        sourceWorkflowTaskId: 'task-old',
        tasks: [
          {
            status: RecurringTaskStatus.COMPLETED,
            plannedDate: new Date('2026-08-01T00:00:00.000Z'),
          },
        ],
      },
      {
        sourceWorkflowTaskId: 'task-current',
        tasks: [
          {
            status: RecurringTaskStatus.COMPLETED,
            plannedDate: new Date('2026-07-01T00:00:00.000Z'),
          },
          {
            status: RecurringTaskStatus.PENDING,
            plannedDate: new Date('2026-08-01T00:00:00.000Z'),
          },
        ],
      },
    ];
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

  it('accepts more than 12 visual periods in aggregate when every bound plan has at most 12', async () => {
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
    ).resolves.toMatchObject({ items: expect.any(Array) });
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
        { $queryRaw: queryRaw },
        project.id,
        actor,
      ),
    ).rejects.toMatchObject({
      response: { code: 'VISUAL_DELTA_REVIEW_PERIOD_LIMIT_EXCEEDED' },
    });
    expect(queries).toHaveLength(3);
    expect(queries[0]!.strings?.join('')).toContain('workflow_tasks');
    expect(queries[1]!.strings?.join('')).toContain('recurring_plans');
    expect(queries[2]!.strings?.join('')).toContain('recurring_tasks');
    expect(queries[2]!.values).toEqual(
      expect.arrayContaining([project.id, 'plan-exact', 13]),
    );
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
          { $queryRaw: queryRaw },
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
        { $queryRaw: queryRaw },
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
      query.strings?.join('').includes('recurring_tasks'),
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
          { $queryRaw: queryRaw },
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

  it('blocks attachment finalization at legacy 101-row state before the domain update or audit', async () => {
    const harness = nonCreateWriteHarness({ capacity: 101 });

    await expect(
      harness.service.uploadCabinReviewAttachment(
        project.id,
        'review-1',
        {
          originalname: 'review.pdf',
          mimetype: 'application/pdf',
          size: 8,
          buffer: Buffer.from('%PDF-1'),
        },
        actor,
      ),
    ).rejects.toMatchObject({
      response: { code: 'REVIEW_RECORD_LIMIT_EXCEEDED' },
    });
    expect(harness.updateMany).not.toHaveBeenCalled();
    expect(harness.transition).not.toHaveBeenCalled();
    expect(harness.activityCreate).not.toHaveBeenCalled();
  });

  it('checks the current visual plan after attachment row/task locks and before finalizing the domain link', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const queryRaw = vi.fn(async (query: { strings?: readonly string[] }) => {
      const sql = query.strings?.join('') ?? '';
      if (sql.includes('FOR UPDATE')) {
        return [{ id: sql.includes('workflow_tasks') ? 'task-current' : 'review-1' }];
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
      response: { code: 'VISUAL_DELTA_REVIEW_PERIOD_LIMIT_EXCEEDED' },
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
    expect(sql[3]).toContain('recurring_plans');
    expect(sql[4]).toContain('recurring_tasks');
  });

  it('rejects ambiguous visual plans during attachment finalize before binding the attachment', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const queryRaw = vi.fn(async (query: { strings?: readonly string[] }) => {
      const sql = query.strings?.join('') ?? '';
      if (sql.includes('FOR UPDATE')) {
        return [{ id: sql.includes('workflow_tasks') ? 'task-current' : 'review-1' }];
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
          reviewer: { name: '评审人' },
        }),
        updateMany,
      },
      workflowTask: {
        findFirst: vi.fn().mockResolvedValue({ id: 'task-current' }),
      },
    };
    const { service } = createService();
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
      response: { code: 'VISUAL_DELTA_REVIEW_PLAN_IDENTITY_CONFLICT' },
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

    expect(harness.queryRaw).toHaveBeenCalledTimes(1);
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
