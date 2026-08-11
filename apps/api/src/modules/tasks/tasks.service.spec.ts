import {
  AttachmentScanStatus,
  ProjectPriority,
  ProjectStatus,
  WorkflowNodeCode,
  WorkflowTaskStatus,
} from '@prisma/client';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
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

function createTaskDetailRecord() {
  return {
    id: 'task-1',
    projectId: 'project-1',
    nodeCode: WorkflowNodeCode.PAINT_DEVELOPMENT,
    nodeName: '涂料开发',
    status: WorkflowTaskStatus.IN_PROGRESS,
    isActive: true,
    dueAt: new Date('2026-08-20T08:00:00.000Z'),
    assigneeUserId: 'user-1',
    assigneeUser: { name: '工艺工程师' },
    project: {
      id: 'project-1',
      name: '项目A',
      priority: ProjectPriority.HIGH,
      status: ProjectStatus.IN_PROGRESS,
      currentNodeCode: WorkflowNodeCode.PAINT_DEVELOPMENT,
    },
    createdAt: new Date('2026-08-11T08:00:00.000Z'),
    updatedAt: new Date('2026-08-11T08:30:00.000Z'),
    progressUpdates: [],
  };
}

describe('TasksService', () => {
  it('rejects an out-of-scope project manager before loading task details', async () => {
    const prisma = {
      workflowTask: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'task-1',
          projectId: 'project-1',
          assigneeUserId: 'user-1',
        }),
      },
    };
    const projectAccessService = {
      assertProjectAccessWithDefaultClient: vi
        .fn()
        .mockRejectedValue(new ForbiddenException('当前用户无权访问该项目。')),
    };
    const service = new TasksService(
      prisma as never,
      projectAccessService as never,
      {} as never,
    );
    const outOfScopeManager: AuthenticatedUser = {
      ...createActor(),
      id: 'manager-outside',
      roleCodes: ['project_manager'],
      permissionCodes: ['project.read'],
    };

    await expect(service.getTaskDetail('task-1', outOfScopeManager)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(projectAccessService.assertProjectAccessWithDefaultClient).toHaveBeenCalledWith(
      'project-1',
      outOfScopeManager,
      'project.read',
    );
    expect(prisma.workflowTask.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.workflowTask.findUnique).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      select: {
        id: true,
        projectId: true,
        assigneeUserId: true,
      },
    });
  });

  it('keeps missing task semantics and does not consult project scope', async () => {
    const prisma = {
      workflowTask: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };
    const projectAccessService = {
      assertProjectAccessWithDefaultClient: vi.fn(),
    };
    const service = new TasksService(
      prisma as never,
      projectAccessService as never,
      {} as never,
    );

    await expect(service.getTaskDetail('missing-task', createActor())).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(projectAccessService.assertProjectAccessWithDefaultClient).not.toHaveBeenCalled();
    expect(prisma.workflowTask.findUnique).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      label: 'in-scope project manager',
      actor: {
        ...createActor(),
        id: 'manager-1',
        roleCodes: ['project_manager'],
        permissionCodes: ['project.read'],
      } satisfies AuthenticatedUser,
    },
    {
      label: 'current assignee',
      actor: {
        ...createActor(),
        permissionCodes: ['project.read'],
      } satisfies AuthenticatedUser,
    },
  ])('returns task details for an authorized $label after scope validation', async ({ actor }) => {
    const detail = createTaskDetailRecord();
    const prisma = {
      workflowTask: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({
            id: detail.id,
            projectId: detail.projectId,
            assigneeUserId: detail.assigneeUserId,
          })
          .mockResolvedValueOnce(detail),
      },
    };
    const projectAccessService = {
      assertProjectAccessWithDefaultClient: vi.fn().mockResolvedValue(undefined),
    };
    const service = new TasksService(
      prisma as never,
      projectAccessService as never,
      {} as never,
    );

    await expect(service.getTaskDetail(detail.id, actor)).resolves.toMatchObject({
      taskId: detail.id,
      projectId: detail.projectId,
      projectName: detail.project.name,
      assigneeName: detail.assigneeUser.name,
    });

    expect(projectAccessService.assertProjectAccessWithDefaultClient).toHaveBeenCalledWith(
      detail.projectId,
      actor,
      'project.read',
    );
    expect(prisma.workflowTask.findUnique).toHaveBeenCalledTimes(2);
  });

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
            updatedAt: new Date('2026-03-17T12:30:00.000Z'),
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
    expect(prisma.attachment.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          scanStatus: AttachmentScanStatus.CLEAN,
        }),
      }),
    );
  });

  it('creates an immutable progress record and matching audit log', async () => {
    const taskVersion = '2026-07-13T02:00:00.000Z';
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
      taskVersion,
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
          updatedAt: new Date(taskVersion),
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
      $queryRaw: vi.fn().mockResolvedValue([
        {
          id: 'task-1',
          projectId: 'project-1',
          nodeCode: WorkflowNodeCode.PAINT_DEVELOPMENT,
          nodeName: '涂料开发',
          status: WorkflowTaskStatus.IN_PROGRESS,
          isActive: true,
          assigneeUserId: 'user-1',
          updatedAt: new Date(taskVersion),
        },
      ]),
    };
    const projectAccessService = {
      assertProjectAccessWithDefaultClient: vi.fn().mockResolvedValue(undefined),
      assertProjectAccess: vi.fn().mockResolvedValue(undefined),
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
        taskVersion,
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

  it('rejects a progress write when the locked task became terminal after preflight', async () => {
    const taskVersion = '2026-08-11T01:00:00.000Z';
    const create = vi.fn();
    const audit = vi.fn();
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
          updatedAt: new Date(taskVersion),
        }),
      },
      taskProgressUpdate: {
        findUnique: vi.fn().mockResolvedValue(null),
        create,
      },
      attachment: { count: vi.fn() },
      $transaction: vi.fn(),
      $queryRaw: vi.fn().mockResolvedValue([
        {
          id: 'task-1',
          projectId: 'project-1',
          nodeCode: WorkflowNodeCode.PAINT_DEVELOPMENT,
          nodeName: '涂料开发',
          status: WorkflowTaskStatus.COMPLETED,
          isActive: false,
          assigneeUserId: 'user-1',
          updatedAt: new Date('2026-08-11T01:01:00.000Z'),
        },
      ]),
    };
    prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma),
    );
    const projectAccessService = {
      assertProjectAccessWithDefaultClient: vi.fn().mockResolvedValue(undefined),
      assertProjectAccess: vi.fn().mockResolvedValue(undefined),
    };
    const service = new TasksService(
      prisma as never,
      projectAccessService as never,
      { createWithExecutor: audit } as never,
    );

    await expect(
      service.createTaskProgress(
        'task-1',
        {
          completedContent: '扫描期间任务已完成',
          completionPercent: 80,
          isBlocked: true,
          blockerType: 'SCHEDULE',
          blockerDescription: '不应写入终态任务',
          idempotencyKey: 'progress-terminal-001',
          taskVersion,
        },
        createActor(),
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it('rejects a progress write when the locked task assignment changed after preflight', async () => {
    const taskVersion = '2026-08-11T02:00:00.000Z';
    const create = vi.fn();
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
          updatedAt: new Date(taskVersion),
        }),
      },
      taskProgressUpdate: {
        findUnique: vi.fn().mockResolvedValue(null),
        create,
      },
      attachment: { count: vi.fn() },
      $transaction: vi.fn(),
      $queryRaw: vi.fn().mockResolvedValue([
        {
          id: 'task-1',
          projectId: 'project-1',
          nodeCode: WorkflowNodeCode.PAINT_DEVELOPMENT,
          nodeName: '涂料开发',
          status: WorkflowTaskStatus.IN_PROGRESS,
          isActive: true,
          assigneeUserId: 'user-2',
          updatedAt: new Date('2026-08-11T02:01:00.000Z'),
        },
      ]),
    };
    prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma),
    );
    const service = new TasksService(
      prisma as never,
      {
        assertProjectAccessWithDefaultClient: vi.fn().mockResolvedValue(undefined),
        assertProjectAccess: vi.fn().mockResolvedValue(undefined),
      } as never,
      { createWithExecutor: vi.fn() } as never,
    );

    await expect(
      service.createTaskProgress(
        'task-1',
        {
          completedContent: '旧负责人不应继续写入',
          completionPercent: 30,
          isBlocked: false,
          idempotencyKey: 'progress-reassigned-001',
          taskVersion,
        },
        createActor(),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(create).not.toHaveBeenCalled();
  });

  it('rejects reuse of an idempotency key with a different progress payload', async () => {
    const taskVersion = '2026-08-11T03:00:00.000Z';
    const existing = {
      id: 'progress-1',
      workflowTaskId: 'task-1',
      projectId: 'project-1',
      submittedById: 'user-1',
      submittedBy: { id: 'user-1', name: '工艺工程师' },
      completionPercent: 20,
      completedContent: '原始内容',
      nextPlan: null,
      materialAttachmentIds: null,
      idempotencyKey: 'progress-reuse-001',
      taskVersion,
      createdAt: new Date('2026-08-11T03:01:00.000Z'),
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
          updatedAt: new Date(taskVersion),
        }),
      },
      taskProgressUpdate: {
        findUnique: vi.fn().mockResolvedValue(existing),
      },
      attachment: { count: vi.fn() },
      $transaction: vi.fn(),
    };
    const service = new TasksService(
      prisma as never,
      { assertProjectAccessWithDefaultClient: vi.fn().mockResolvedValue(undefined) } as never,
      {} as never,
    );

    await expect(
      service.createTaskProgress(
        'task-1',
        {
          completedContent: '被篡改的新内容',
          completionPercent: 99,
          isBlocked: false,
          idempotencyKey: 'progress-reuse-001',
          taskVersion,
        },
        createActor(),
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
