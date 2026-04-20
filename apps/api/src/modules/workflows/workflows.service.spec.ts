import { describe, expect, it, vi } from 'vitest';
import {
  WorkflowAction,
  WorkflowInstanceStatus,
  WorkflowNodeCode,
  WorkflowTaskStatus,
} from '@prisma/client';

import type { AuthenticatedUser } from '../auth/auth.types';
import { WorkflowsService } from './workflows.service';

const actor: AuthenticatedUser = {
  id: 'user-1',
  username: 'mock_user',
  name: '演示用户',
  email: 'demo@example.com',
  departmentId: 'dept-1',
  departmentName: '项目管理部',
  isSystemAdmin: false,
  authSource: 'mock',
  roleCodes: ['project_manager'],
};

function createService() {
  const prisma = {
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
  it('initializes workflow instances with template version and SLA schedule', async () => {
    const { service, workflowDeadlineService, notificationQueueService } = createService();
    const tx = {
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
    expect(notificationQueueService.enqueueTaskNotification).toHaveBeenCalledWith(
      'task-1',
      expect.anything(),
      actor.id,
    );
  });

  it('creates a new round task on reject with rework metadata', async () => {
    const { service, workflowDeadlineService } = createService();
    const tx = {
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
        reviewerId: 'process-1',
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
