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
          },
        ]),
      },
    };
    const service = new TasksService(prisma as never);

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
});

