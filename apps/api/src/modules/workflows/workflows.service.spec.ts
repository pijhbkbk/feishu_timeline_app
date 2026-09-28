import { ConflictException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  RecurringTaskStatus,
  WorkflowAction,
  WorkflowInstanceStatus,
  WorkflowNodeCode,
  WorkflowTaskStatus,
} from '@prisma/client';

import type { AuthenticatedUser } from '../auth/auth.types';
import { installTeamAuthorizationFixture } from '../../test-support/team-authorization.fixture';
import { WorkflowsService } from './workflows.service';

const actor: AuthenticatedUser = {
  id: 'user-1',
  username: 'mock_user',
  name: '演示用户',
  email: 'demo@example.com',
  departmentId: 'dept-1',
  departmentName: '项目管理部',
  isSystemAdmin: false,
  authSource: 'local',
  authVersion: 1,
  roleCodes: ['reviewer'],
};

function createService() {
  const prisma = {
    $transaction: vi.fn(),
    workflowTask: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    workflowInstance: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
  };
  const activityLogsService = {
    createWithExecutor: vi.fn().mockResolvedValue(undefined),
  };
  const notificationQueueService = {
    enqueueTaskNotification: vi.fn().mockResolvedValue(undefined),
  };
  const workflowDeadlineService = {
    buildTaskSchedule: vi.fn(),
    refreshWorkflowInstanceTaskDeadlines: vi.fn().mockResolvedValue({
      scanned: 0,
      updated: 0,
    }),
  };
  const workflowRecurringService = {
    ensureMonthlyReviewPlan: vi.fn(),
  };
  const projectAccessService = {
    assertProjectAccessWithDefaultClient: vi.fn().mockResolvedValue(undefined),
    assertProjectAccess: vi.fn().mockResolvedValue(undefined),
  };

  const service = new WorkflowsService(
    prisma as never,
    activityLogsService as never,
    notificationQueueService as never,
    workflowDeadlineService as never,
    workflowRecurringService as never,
    projectAccessService as never,
  );

  return {
    service,
    prisma,
    activityLogsService,
    notificationQueueService,
    workflowDeadlineService,
    workflowRecurringService,
    projectAccessService,
  };
}

describe('WorkflowsService', () => {
  const sampleColorConfirmationTask = {
    id: 'task-step-4',
    workflowInstanceId: 'wf-1',
    projectId: 'project-1',
    nodeCode: WorkflowNodeCode.SAMPLE_COLOR_CONFIRMATION,
    nodeName: '样板颜色确认',
    status: WorkflowTaskStatus.IN_PROGRESS,
    isActive: true,
    updatedAt: new Date('2026-08-11T05:30:00.000Z'),
    assigneeUserId: actor.id,
    workflowInstance: {
      id: 'wf-1',
      status: WorkflowInstanceStatus.RUNNING,
      currentNodeCode: WorkflowNodeCode.SAMPLE_COLOR_CONFIRMATION,
    },
    project: {
      id: 'project-1',
      ownerUserId: actor.id,
    },
    assigneeUser: null,
    assigneeDepartment: null,
  };

  function stubTransitionSideEffects(service: WorkflowsService) {
    vi.spyOn(service as any, 'getTaskOrThrow').mockResolvedValue(
      sampleColorConfirmationTask,
    );
    vi.spyOn(service as any, 'createNextTasks').mockResolvedValue([]);
    vi.spyOn(service as any, 'maybeCreateRecurringPlan').mockResolvedValue(null);
    vi.spyOn(service as any, 'applyWorkflowCompletionIfNeeded').mockResolvedValue(
      undefined,
    );
    vi.spyOn(service as any, 'syncWorkflowState').mockResolvedValue({
      currentNodeCode: WorkflowNodeCode.SAMPLE_COLOR_CONFIRMATION,
    });
    vi.spyOn(service as any, 'getProjectWorkflowByInstance').mockResolvedValue({
      workflowInstance: { id: 'wf-1' },
    });
  }

  it('rejects a form save when a terminal transition wins the task CAS', async () => {
    const { service, prisma, activityLogsService } = createService();
    const staleTask = {
      ...sampleColorConfirmationTask,
      payload: { formData: { color: 'before' } },
      updatedAt: new Date('2026-08-11T04:00:00.000Z'),
    };
    const tx = {
      workflowTask: {
        update: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      auditLog: {
        count: vi.fn().mockResolvedValue(0),
      },
    };
    Object.assign(tx, { $queryRaw: vi.fn().mockResolvedValue([{ locked: true }]) });
    installTeamAuthorizationFixture(tx, [{ ...actor, authVersion: 1 }], () => staleTask);
    prisma.$transaction.mockImplementation(
      async (callback: (executor: typeof tx) => Promise<unknown>) => callback(tx),
    );
    vi.spyOn(service as any, 'getTaskOrThrow').mockResolvedValue(staleTask);
    const buildResponse = vi
      .spyOn(service as any, 'buildTaskDetailResponse')
      .mockResolvedValue({ task: { id: staleTask.id } });

    await expect(
      service.saveTaskForm(staleTask.id, actor, {
        payload: { color: 'stale-after-terminal' },
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(tx.workflowTask.updateMany).toHaveBeenCalledWith({
      where: {
        id: staleTask.id,
        status: staleTask.status,
        isActive: true,
        updatedAt: staleTask.updatedAt,
      },
      data: {
        payload: expect.objectContaining({
          formData: { color: 'stale-after-terminal' },
        }),
      },
    });
    expect(tx.workflowTask.update).not.toHaveBeenCalled();
    expect(activityLogsService.createWithExecutor).not.toHaveBeenCalled();
    expect(buildResponse).not.toHaveBeenCalled();
  });

  it('writes and audits a task form only after claiming the unchanged active version', async () => {
    const { service, prisma, activityLogsService } = createService();
    const currentTask = {
      ...sampleColorConfirmationTask,
      payload: { formData: { color: 'before' } },
      updatedAt: new Date('2026-08-11T05:00:00.000Z'),
    };
    const tx = {
      workflowTask: {
        update: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: {
        count: vi.fn().mockResolvedValue(0),
      },
    };
    Object.assign(tx, { $queryRaw: vi.fn().mockResolvedValue([{ locked: true }]) });
    installTeamAuthorizationFixture(tx, [{ ...actor, authVersion: 1 }], () => currentTask);
    prisma.$transaction.mockImplementation(
      async (callback: (executor: typeof tx) => Promise<unknown>) => callback(tx),
    );
    vi.spyOn(service as any, 'getTaskOrThrow').mockResolvedValue(currentTask);
    vi.spyOn(service as any, 'buildTaskDetailResponse').mockResolvedValue({
      task: { id: currentTask.id },
    });

    await expect(
      service.saveTaskForm(currentTask.id, actor, {
        payload: { color: 'claimed-before-terminal' },
      }),
    ).resolves.toMatchObject({ task: { id: currentTask.id } });

    expect(tx.workflowTask.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.workflowTask.update).not.toHaveBeenCalled();
    expect(activityLogsService.createWithExecutor).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: 'WORKFLOW_FORM_SAVED',
        targetId: currentTask.id,
      }),
    );
  });

  it('rejects START when an assignment change wins after authorization', async () => {
    const { service, activityLogsService } = createService();
    const staleTask = {
      ...sampleColorConfirmationTask,
      status: WorkflowTaskStatus.READY,
    };
    const tx = createTransitionExecutor();
    tx.workflowTask.updateMany.mockImplementation(async ({ where }) => ({
      count: where.updatedAt === staleTask.updatedAt ? 0 : 1,
    }));
    vi.spyOn(service as any, 'getTaskOrThrow').mockResolvedValue(staleTask);
    vi.spyOn(service as any, 'syncWorkflowState').mockResolvedValue(undefined);
    const response = vi
      .spyOn(service as any, 'getProjectWorkflowByInstance')
      .mockResolvedValue({ workflowInstance: { id: 'wf-1' } });

    await expect(
      service.transitionTaskWithExecutor(
        tx as never,
        staleTask.id,
        WorkflowAction.START,
        actor,
        {},
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(tx.workflowTransition.create).not.toHaveBeenCalled();
    expect(activityLogsService.createWithExecutor).not.toHaveBeenCalled();
    expect(response).not.toHaveBeenCalled();
  });

  it('rejects a terminal transition when an assignment change wins after authorization', async () => {
    const { service, activityLogsService } = createService();
    const staleTask = { ...sampleColorConfirmationTask };
    const tx = createTransitionExecutor();
    tx.workflowTask.updateMany.mockImplementation(async ({ where }) => ({
      count: where.updatedAt === staleTask.updatedAt ? 0 : 1,
    }));
    stubTransitionSideEffects(service);
    vi.spyOn(service as any, 'getTaskOrThrow').mockResolvedValue(staleTask);
    const createNextTasks = vi.mocked((service as any).createNextTasks);

    await expect(
      service.transitionTaskWithExecutor(
        tx as never,
        staleTask.id,
        WorkflowAction.RETURN,
        actor,
        {},
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(tx.workflowTransition.create).not.toHaveBeenCalled();
    expect(activityLogsService.createWithExecutor).not.toHaveBeenCalled();
    expect(createNextTasks).not.toHaveBeenCalled();
  });

  function createTransitionExecutor() {
    return {
      $queryRaw: vi.fn().mockResolvedValue([{ locked: true }]),
      $executeRaw: vi.fn().mockResolvedValue(0),
      workflowTask: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockImplementation(({ where }) =>
          Promise.resolve({
            ...sampleColorConfirmationTask,
            id: where.id,
            status: WorkflowTaskStatus.RETURNED,
            isActive: false,
          }),
        ),
      },
      workflowTransition: {
        create: vi.fn().mockResolvedValue({ id: 'transition-1' }),
      },
    };
  }

  it.each([
    ['approve', WorkflowAction.APPROVE],
    ['reject', WorkflowAction.REJECT],
    ['return', WorkflowAction.RETURN],
  ])(
    'blocks generic CAB %s before opening a transaction when no ReviewRecord exists',
    async (_label, action) => {
      const { service, prisma } = createService();
      prisma.$transaction.mockImplementation(async (callback) => callback({}));
      const executor = vi
        .spyOn(service, 'transitionTaskWithExecutor')
        .mockResolvedValue({ workflowInstance: { id: 'wf-1' } } as never);

      await expect(
        service.transitionTask(
          'task-cab-without-review-record',
          action,
          actor,
          {},
        ),
      ).rejects.toThrow('终态流转必须通过对应业务接口完成');

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(executor).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['complete', WorkflowAction.COMPLETE],
    ['submit', WorkflowAction.SUBMIT],
  ])(
    'blocks generic ordinary-task %s before form and blocker checks can be bypassed',
    async (_label, action) => {
      const { service, prisma } = createService();
      prisma.$transaction.mockImplementation(async (callback) => callback({}));
      const executor = vi
        .spyOn(service, 'transitionTaskWithExecutor')
        .mockResolvedValue({ workflowInstance: { id: 'wf-1' } } as never);

      await expect(
        service.transitionTask(
          'task-ordinary-missing-form-open-blocker',
          action,
          actor,
          {},
        ),
      ).rejects.toThrow('终态流转必须通过对应业务接口完成');

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(executor).not.toHaveBeenCalled();
    },
  );

  it('keeps generic START as the only public transition delegated to the executor', async () => {
    const { service, prisma } = createService();
    const tx = { workflowTask: {} };
    installTeamAuthorizationFixture(tx, [{ ...actor, authVersion: 1 }], () => sampleColorConfirmationTask);
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));
    const executor = vi
      .spyOn(service, 'transitionTaskWithExecutor')
      .mockResolvedValue({ workflowInstance: { id: 'wf-1' } } as never);

    await expect(
      service.transitionTask('task-ordinary-1', WorkflowAction.START, actor, {
        comment: '开始处理',
      }),
    ).resolves.toEqual({ workflowInstance: { id: 'wf-1' } });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(executor).toHaveBeenCalledWith(
      tx,
      'task-ordinary-1',
      WorkflowAction.START,
      actor,
      { comment: '开始处理' },
    );
  });

  it.each([
    [WorkflowTaskStatus.READY, [WorkflowAction.START]],
    [WorkflowTaskStatus.IN_PROGRESS, []],
  ])(
    'exposes only generic START capability for an active %s workflow task',
    (status, expectedActions) => {
      const { service } = createService();

      const summary = (service as any).toWorkflowTaskSummary({
        id: 'task-generic-surface',
        taskNo: 'TASK-GENERIC-1',
        nodeCode: WorkflowNodeCode.PAINT_DEVELOPMENT,
        nodeName: '涂料开发',
        taskRound: 1,
        status,
        isPrimary: true,
        isActive: true,
        assigneeUserId: actor.id,
        assigneeUser: null,
        assigneeDepartmentId: null,
        assigneeDepartment: null,
        dueAt: null,
        startedAt: null,
        completedAt: null,
        returnedAt: null,
        payload: null,
        createdAt: new Date('2026-08-11T00:00:00.000Z'),
        updatedAt: new Date('2026-08-11T00:00:00.000Z'),
      });

      expect(summary.availableActions).toEqual(expectedActions);
    },
  );

  it.each([
    ['terminal node', WorkflowNodeCode.PROJECT_CLOSED],
    ['future primary node', WorkflowNodeCode.PAINT_PROCUREMENT],
    ['parallel node', WorkflowNodeCode.COLOR_NUMBERING],
  ])(
    'rejects a client-selected RETURN target to a %s before any task write',
    async (_label, targetNodeCode) => {
      const { service } = createService();
      const tx = createTransitionExecutor();
      stubTransitionSideEffects(service);
      const createNextTasks = vi.mocked((service as any).createNextTasks);

      await expect(
        service.transitionTaskWithExecutor(
          tx as never,
          sampleColorConfirmationTask.id,
          WorkflowAction.RETURN,
          actor,
          { targetNodeCode },
        ),
      ).rejects.toThrow('不允许退回到客户端指定的目标节点');

      expect(tx.workflowTask.updateMany).not.toHaveBeenCalled();
      expect(createNextTasks).not.toHaveBeenCalled();
    },
  );

  it('uses only the server-defined default target for a legal step 4 RETURN', async () => {
    const { service } = createService();
    const tx = createTransitionExecutor();
    stubTransitionSideEffects(service);
    const createNextTasks = vi.mocked((service as any).createNextTasks);

    await service.transitionTaskWithExecutor(
      tx as never,
      sampleColorConfirmationTask.id,
      WorkflowAction.RETURN,
      actor,
      {},
    );

    expect(createNextTasks).toHaveBeenCalledWith(
      tx,
      sampleColorConfirmationTask,
      actor,
      WorkflowAction.RETURN,
      {},
      [
        {
          nodeCode: WorkflowNodeCode.PAINT_DEVELOPMENT,
          isPrimary: true,
          reason: '样板颜色确认 退回到 涂料开发。',
        },
      ],
      undefined,
    );
  });

  it.each([
    ['past', '2020-01-01T00:00:00.000Z'],
    ['future', '2099-01-01T00:00:00.000Z'],
  ])(
    'ignores a client-supplied %s reviewPassAt and records server time',
    async (_label, reviewPassAt) => {
      vi.useFakeTimers();
      const serverNow = new Date('2026-08-11T03:00:00.000Z');
      vi.setSystemTime(serverNow);

      try {
        const { service, activityLogsService } = createService();
        const tx = createTransitionExecutor();
        stubTransitionSideEffects(service);

        await service.transitionTaskWithExecutor(
          tx as never,
          sampleColorConfirmationTask.id,
          WorkflowAction.APPROVE,
          actor,
          {
            metadata: {
              reviewPassAt,
              evidenceId: 'client-note-1',
            },
          },
        );

        expect(tx.workflowTask.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              reviewPassAt: serverNow,
            }),
          }),
        );
        expect(activityLogsService.createWithExecutor).toHaveBeenCalledWith(
          tx,
          expect.objectContaining({
            metadata: {
              evidenceId: 'client-note-1',
            },
          }),
        );
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it.each([
    [WorkflowNodeCode.PAINT_DEVELOPMENT, 'owner-1', 'owner-1', ['process_engineer'], true],
    [WorkflowNodeCode.PAINT_DEVELOPMENT, 'owner-1', 'manager-1', ['project_manager'], false],
    [WorkflowNodeCode.PAINT_DEVELOPMENT, 'owner-1', 'admin-1', ['admin'], false],
    [WorkflowNodeCode.CAB_REVIEW, 'manager-1', 'reviewer-1', ['reviewer'], false],
    [WorkflowNodeCode.CAB_REVIEW, 'reviewer-1', 'reviewer-1', ['reviewer'], true],
    [WorkflowNodeCode.CAB_REVIEW, null, 'reviewer-1', ['reviewer'], false],
    [WorkflowNodeCode.DEVELOPMENT_ACCEPTANCE, 'manager-1', 'finance-1', ['finance'], false],
    [WorkflowNodeCode.DEVELOPMENT_ACCEPTANCE, 'finance-1', 'finance-1', ['finance'], true],
    [WorkflowNodeCode.DEVELOPMENT_ACCEPTANCE, 'manager-1', 'manager-1', ['project_manager'], false],
    [WorkflowNodeCode.PROJECT_CLOSED, 'process-1', 'admin-1', ['admin'], false],
    [WorkflowNodeCode.PROJECT_CLOSED, 'process-1', 'process-1', ['process_engineer'], false],
    [WorkflowNodeCode.PROJECT_CLOSED, 'manager-1', 'manager-1', ['project_manager'], true],
  ] as const)('requires the fixed role and exact claim for %s (owner %s, actor %s)',
    (nodeCode, assigneeUserId, id, roleCodes, allowed) => {
      const { service } = createService();
      const operation = () => (service as any).assertActorCanOperateTask(
        { nodeCode, nodeName: nodeCode, assigneeUserId },
        { ...actor, id, isSystemAdmin: roleCodes.includes('admin' as never), roleCodes: [...roleCodes] },
      );
      if (allowed) expect(operation).not.toThrow();
      else expect(operation).toThrow(ForbiddenException);
    },
  );

  it('does not let designated-review bypass a CAB task claim', () => {
    const { service } = createService();
    expect(() => (service as any).assertActorCanOperateTask(
      { nodeCode: WorkflowNodeCode.CAB_REVIEW, nodeName: '驾驶室评审', assigneeUserId: 'another-reviewer' },
      actor, 'designated-review',
    )).toThrow(ForbiddenException);
  });

  it('blocks generic completion of pilot nodes without domain records', async () => {
    const { service } = createService();
    const tx = {
      productionPlan: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      trialProduction: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };

    await expect(
      (service as any).assertPilotProductionRecordsSubmitted(tx, {
        projectId: 'project-1',
        nodeCode: WorkflowNodeCode.FIRST_UNIT_PRODUCTION_PLAN,
        nodeName: '首台生产计划',
      }),
    ).rejects.toThrow('至少需要一条已确认的首台生产计划');

    await expect(
      (service as any).assertPilotProductionRecordsSubmitted(tx, {
        projectId: 'project-1',
        nodeCode: WorkflowNodeCode.TRIAL_PRODUCTION,
        nodeName: '样车试制',
      }),
    ).rejects.toThrow('至少需要一条已完成的有效试制记录');
  });

  it('blocks generic completion of the monthly review node before all periods finish', async () => {
    const { service } = createService();
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'plan-1', status: 'ACTIVE', frequency: 'MONTHLY', totalCount: 12, taskCount: 12, validCount: 12 }]),
      recurringPlan: {
        findMany: vi.fn().mockResolvedValue([{
          id: 'plan-1',
          totalCount: 12,
        }]),
      },
      recurringTask: {
        count: vi.fn().mockResolvedValue(1),
      },
    };

    await expect(
      (service as any).assertMonthlyReviewPeriodsCompleted(tx, {
        id: 'task-17',
        projectId: 'project-1',
        nodeCode: WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW,
        nodeName: '整车色差一致性评审',
      }),
    ).rejects.toThrow('尚有 11 个月度评审未完成（1/12）');

    tx.recurringTask.count.mockResolvedValue(12);

    await expect(
      (service as any).assertMonthlyReviewPeriodsCompleted(tx, {
        id: 'task-17',
        projectId: 'project-1',
        nodeCode: WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW,
        nodeName: '整车色差一致性评审',
      }),
    ).resolves.toBeUndefined();
  });

  it('returns a readable monthly review progress summary', () => {
    const { service } = createService();
    const summary = (service as any).buildTaskMonthlyReviewSummary(
      {
        id: 'plan-1',
        planCode: 'MONTHLY-1',
        totalCount: 12,
        tasks: [
          {
            id: 'month-1',
            status: RecurringTaskStatus.COMPLETED,
            plannedDate: new Date('2026-08-24T00:00:00.000Z'),
          },
          {
            id: 'month-2',
            status: RecurringTaskStatus.PENDING,
            plannedDate: new Date('2026-09-24T00:00:00.000Z'),
          },
        ],
      },
      [],
      new Date('2026-08-25T00:00:00.000Z'),
    );

    expect(summary.progressText).toBe('已完成 1 / 12');
    expect(summary.completedPeriods).toBe(1);
    expect(summary.totalPeriods).toBe(12);
  });

  it('uses the original Unicode attachment name in task details', () => {
    const { service } = createService();

    expect(
      (service as any).resolveAttachmentDisplayName({
        fileName: '_________.pdf',
        originalFileName: '定制颜色开发流程图.pdf',
      }),
    ).toBe('定制颜色开发流程图.pdf');
  });

  it('initializes workflow instances with template version and SLA schedule', async () => {
    const { service, workflowDeadlineService, notificationQueueService } = createService();
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ locked: true }]),
      $executeRaw: vi.fn().mockResolvedValue(0),
      projectNodeAssignment: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      user: {
        count: vi.fn().mockResolvedValue(1),
        findMany: vi.fn().mockImplementation(({ where }) => Promise.resolve(
          where.AND?.[1]?.id?.gt ? [] : [{ id: 'owner-1', departmentId: null }],
        )),
      },
      notification: { createMany: vi.fn().mockResolvedValue({ count: 1 }), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      workflowInstance: {
        create: vi.fn().mockResolvedValue({
          id: 'wf-1',
          projectId: 'project-1',
          instanceNo: 'WF-001',
          versionNo: 1,
          status: WorkflowInstanceStatus.RUNNING,
          currentNodeCode: WorkflowNodeCode.PROJECT_INITIATION,
          startedAt: new Date('2026-04-19T08:00:00.000Z'),
          completedAt: null,
          cancelledAt: null,
        }),
      },
      workflowTask: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'task-1', projectId: 'project-1',
          nodeCode: WorkflowNodeCode.PROJECT_INITIATION, nodeName: '项目立项', assigneeUserId: 'owner-1', assignmentEpoch: 0 }),
        create: vi.fn().mockResolvedValue({
          id: 'task-1',
        }),
      },
      workflowTransition: {
        create: vi.fn().mockResolvedValue({
          id: 'transition-1',
        }),
      },
    };
    workflowDeadlineService.buildTaskSchedule.mockResolvedValue({
      stepCode: '01',
      dueAt: new Date('2026-04-23T23:59:59.999Z'),
      effectiveDueAt: new Date('2026-04-23T23:59:59.999Z'),
      defaultChargeAmount: null,
    });

    await service.initializeProjectWorkflow(tx as never, {
      projectId: 'project-1',
      ownerUserId: 'owner-1',
      initiatedById: actor.id,
    });

    expect(tx.workflowInstance.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          templateCode: 'LIGHT_TRUCK_CUSTOM_COLOR_DEV',
          templateVersion: '1.0',
        }),
      }),
    );
    expect(tx.workflowTask.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          stepCode: '01',
          dueAt: new Date('2026-04-23T23:59:59.999Z'),
          effectiveDueAt: new Date('2026-04-23T23:59:59.999Z'),
        }),
      }),
    );
    expect(tx.notification.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({ userId: 'owner-1', projectId: 'project-1', taskId: 'task-1',
        sendChannel: 'IN_APP', sendStatus: 'SENT', reminderKind: 'ACTIVATE', assignmentEpoch: 0,
        stageTaskId: 'task-1', dedupeKey: 'ACTIVATE:ordinary:task-1:owner-1' })],
      skipDuplicates: true,
    }));
    expect(notificationQueueService.enqueueTaskNotification).not.toHaveBeenCalled();
  });

  it('creates a new round task on reject with rework metadata', async () => {
    const { service, workflowDeadlineService } = createService();
    const tx = {
      user: { findMany: vi.fn().mockResolvedValue([{ id: 'process-1', departmentId: null }]) },
      projectNodeAssignment: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      workflowTask: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ taskRound: 1 }),
        create: vi.fn().mockResolvedValue({
          id: 'task-11-round-2',
          nodeCode: WorkflowNodeCode.TRIAL_PRODUCTION,
          nodeName: '样车试制',
          isPrimary: true,
          taskRound: 2,
        }),
      },
      workflowTransition: {
        create: vi.fn().mockResolvedValue(undefined),
      },
    };
    workflowDeadlineService.buildTaskSchedule.mockResolvedValue({
      stepCode: '11',
      dueAt: new Date('2026-04-22T23:59:59.999Z'),
      effectiveDueAt: new Date('2026-04-22T23:59:59.999Z'),
      defaultChargeAmount: null,
    });

    await (service as any).createNextTasks(
      tx,
      {
        id: 'task-12-round-1',
        workflowInstanceId: 'wf-1',
        projectId: 'project-1',
        nodeCode: WorkflowNodeCode.CAB_REVIEW,
        nodeName: '样车驾驶室评审',
        assigneeUserId: 'reviewer-1',
        project: {
          ownerUserId: 'owner-1',
        },
      },
      actor,
      WorkflowAction.REJECT,
      {
        comment: '需要整改后重新试制',
      },
      [
        {
          nodeCode: WorkflowNodeCode.TRIAL_PRODUCTION,
          isPrimary: true,
          reason: '驾驶室评审不通过，退回样车试制。',
        },
      ],
    );

    expect(tx.workflowTask.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          taskRound: 2,
          stepCode: '11',
          returnedFromTaskId: 'task-12-round-1',
          reworkReason: '需要整改后重新试制',
          idempotencyKey: 'task-12-round-1:REJECT:TRIAL_PRODUCTION:2',
        }),
      }),
    );
  });

  it('creates a monthly recurring plan after mass production completes', async () => {
    const { service, workflowRecurringService } = createService();

    await (service as any).maybeCreateRecurringPlan(
      {},
      {
        projectId: 'project-1',
        nodeCode: WorkflowNodeCode.MASS_PRODUCTION,
        assigneeUserId: 'process-1',
        project: {
          ownerUserId: 'owner-1',
        },
      },
      {
        nodeCode: WorkflowNodeCode.MASS_PRODUCTION,
        status: WorkflowTaskStatus.COMPLETED,
        completedAt: new Date('2026-04-19T08:00:00.000Z'),
      },
      [
        {
          id: 'task-17',
          nodeCode: WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW,
          nodeName: '整车色差一致性评审',
          isPrimary: true,
          taskRound: 1,
        },
      ],
    );

    expect(workflowRecurringService.ensureMonthlyReviewPlan).toHaveBeenCalledWith(
      {},
      {
        projectId: 'project-1',
        sourceWorkflowTaskId: 'task-17',
        startAt: new Date('2026-04-19T08:00:00.000Z'),
      },
    );
  });

  it('syncs workflow state from active primary tasks so parallel tasks do not block the mainline', async () => {
    const { service, workflowDeadlineService } = createService();
    const tx = {
      workflowTask: {
        findFirst: vi.fn().mockResolvedValue({
          nodeCode: WorkflowNodeCode.FIRST_UNIT_PRODUCTION_PLAN,
        }),
      },
      workflowInstance: {
        update: vi.fn().mockResolvedValue(undefined),
      },
      project: {
        findUnique: vi.fn().mockResolvedValue({
          actualStartDate: null,
        }),
        update: vi.fn().mockResolvedValue(undefined),
      },
    };
    workflowDeadlineService.refreshWorkflowInstanceTaskDeadlines.mockResolvedValue({
      scanned: 3,
      updated: 0,
    });

    const result = await (service as any).syncWorkflowState(
      tx as never,
      'wf-1',
      'project-1',
    );

    expect(tx.workflowTask.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workflowInstanceId: 'wf-1',
          isActive: true,
          isPrimary: true,
        }),
      }),
    );
    expect(tx.workflowInstance.update).toHaveBeenCalledWith({
      where: { id: 'wf-1' },
      data: {
        currentNodeCode: WorkflowNodeCode.FIRST_UNIT_PRODUCTION_PLAN,
      },
    });
    expect(tx.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'project-1' },
        data: expect.objectContaining({
          status: 'IN_PROGRESS',
          currentNodeCode: WorkflowNodeCode.FIRST_UNIT_PRODUCTION_PLAN,
        }),
      }),
    );
    expect(result).toEqual({
      currentNodeCode: WorkflowNodeCode.FIRST_UNIT_PRODUCTION_PLAN,
    });
  });
});
