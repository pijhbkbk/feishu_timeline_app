import { ProjectPriority, ProjectStatus, WorkflowNodeCode, WorkflowTaskStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import type { AuthenticatedUser } from '../auth/auth.types';
import { TasksService } from './tasks.service';

function createActor(): AuthenticatedUser {
  return {
    id: 'user-1',
    username: 'engineer',
    name: '工艺工程师',
    email: null,
    departmentId: null,
    departmentName: null,
    isSystemAdmin: false,
    authSource: 'mock',
    roleCodes: ['process_engineer'],
  };
}

describe('TasksService', () => {
  it('limits progress submission to assignee or project manager, with critical-node overrides', () => {
    const service = new TasksService({} as never, {} as never, {} as never);
    const projectManager = { ...createActor(), id: 'manager-1', roleCodes: ['project_manager'] as const };
    const administrator = {
      ...createActor(),
      id: 'admin-1',
      isSystemAdmin: true,
      roleCodes: ['admin'] as const,
    };
    const finance = { ...createActor(), id: 'finance-1', roleCodes: ['finance'] as const };

    expect(
      (service as any).canSubmitTaskProgress(createActor(), {
        nodeCode: WorkflowNodeCode.PAINT_DEVELOPMENT,
        assigneeUserId: 'user-1',
      }),
    ).toBe(true);
    expect(
      (service as any).canSubmitTaskProgress(projectManager, {
        nodeCode: WorkflowNodeCode.PAINT_DEVELOPMENT,
        assigneeUserId: 'other-user',
      }),
    ).toBe(true);
    expect(
      (service as any).canSubmitTaskProgress(administrator, {
        nodeCode: WorkflowNodeCode.PAINT_DEVELOPMENT,
        assigneeUserId: 'other-user',
      }),
    ).toBe(false);
    expect(
      (service as any).canSubmitTaskProgress(finance, {
        nodeCode: WorkflowNodeCode.DEVELOPMENT_ACCEPTANCE,
        assigneeUserId: 'other-user',
      }),
    ).toBe(true);
    expect(
      (service as any).canSubmitTaskProgress(administrator, {
        nodeCode: WorkflowNodeCode.PROJECT_CLOSED,
        assigneeUserId: 'other-user',
      }),
    ).toBe(true);
  });

  it('returns overdue tasks for current user only', async () => {
    const prisma = {
      workflowTask: {
        count: vi.fn().mockResolvedValue(1),
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'task-1',
            projectId: 'project-1',
            nodeCode: WorkflowNodeCode.PAINT_PROCUREMENT,
            nodeName: '涂料采购',
            status: WorkflowTaskStatus.IN_PROGRESS,
            isActive: true,
            dueAt: new Date('2026-03-18T12:00:00.000Z'),
            assigneeUserId: 'user-1',
            assigneeUser: { name: '工艺工程师' },
            project: {
              id: 'project-1',
              name: '项目A',
              priority: ProjectPriority.HIGH,
              status: ProjectStatus.IN_PROGRESS,
              currentNodeCode: WorkflowNodeCode.PAINT_PROCUREMENT,
            },
            createdAt: new Date('2026-03-17T12:00:00.000Z'),
            progressUpdates: [],
          },
        ]),
      },
      attachment: {
        groupBy: vi.fn().mockResolvedValue([]),
      },
    };
    const service = new TasksService(prisma as never, {} as never, {} as never);

    const result = await service.getOverdueTasks({}, createActor());

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      projectName: '项目A',
      isOverdue: true,
      projectHref: '/projects/project-1/paint-procurement',
    });
    expect(prisma.workflowTask.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          assigneeUserId: 'user-1',
        }),
      }),
    );
  });

  it('creates an immutable progress record and matching audit log', async () => {
    const createdAt = new Date('2026-07-13T03:00:00.000Z');
    const progress = {
      id: 'progress-1',
      workflowTaskId: 'task-1',
      projectId: 'project-1',
      submittedById: 'user-1',
      submittedBy: { id: 'user-1', name: '工艺工程师' },
      completionPercent: 60,
      completedContent: '已完成首轮参数确认',
      nextPlan: '同步供应商修订',
      materialAttachmentIds: null,
      idempotencyKey: 'progress-key-001',
      createdAt,
      blocker: null,
    };
    const prisma = {
      workflowTask: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'task-1',
          projectId: 'project-1',
          nodeCode: WorkflowNodeCode.PAINT_DEVELOPMENT,
          nodeName: '涂料开发',
          status: WorkflowTaskStatus.IN_PROGRESS,
          isActive: true,
          assigneeUserId: 'user-1',
        }),
      },
      taskProgressUpdate: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(progress),
      },
      attachment: {
        count: vi.fn(),
      },
      $transaction: vi.fn(async (callback) => callback(prisma)),
    };
    const projectAccessService = {
      assertProjectAccessWithDefaultClient: vi.fn().mockResolvedValue(undefined),
    };
    const activityLogsService = {
      createWithExecutor: vi.fn().mockResolvedValue({ id: 'audit-1' }),
    };
    const service = new TasksService(
      prisma as never,
      projectAccessService as never,
      activityLogsService as never,
    );

    const result = await service.createTaskProgress(
      'task-1',
      {
        completedContent: '已完成首轮参数确认',
        nextPlan: '同步供应商修订',
        completionPercent: 60,
        isBlocked: false,
        idempotencyKey: 'progress-key-001',
      },
      createActor(),
    );

    expect(result).toMatchObject({
      id: 'progress-1',
      completionPercent: 60,
      blocker: null,
    });
    expect(activityLogsService.createWithExecutor).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        action: 'TASK_PROGRESS_SUBMITTED',
        targetId: 'task-1',
      }),
    );
  });
});
