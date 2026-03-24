import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  WorkflowTaskStatus,
  type Prisma,
} from '@prisma/client';

import { PrismaService } from '../../infra/prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { getCurrentNodeName } from '../workflows/workflow-node.constants';
import {
  getTaskRouteSegment,
  isWorkflowTaskOverdue,
  matchesTaskMode,
  normalizePage,
  normalizePageSize,
  type TaskListMode,
} from './tasks.rules';

type WorkflowTaskListRecord = Prisma.WorkflowTaskGetPayload<{
  include: {
    assigneeUser: {
      select: {
        name: true;
      };
    };
    project: {
      select: {
        id: true;
        name: true;
        priority: true;
        status: true;
        currentNodeCode: true;
      };
    };
  };
}>;

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyTasks(rawQuery: Record<string, string | undefined>, actor: AuthenticatedUser) {
    return this.listTasks('my', rawQuery, actor);
  }

  async getPendingTasks(rawQuery: Record<string, string | undefined>, actor: AuthenticatedUser) {
    return this.listTasks('pending', rawQuery, actor);
  }

  async getOverdueTasks(rawQuery: Record<string, string | undefined>, actor: AuthenticatedUser) {
    return this.listTasks('overdue', rawQuery, actor);
  }

  async getTaskDetail(taskId: string, actor: AuthenticatedUser) {
    const task = await this.prisma.workflowTask.findUnique({
      where: { id: taskId },
      include: {
        assigneeUser: {
          select: {
            name: true,
          },
        },
        project: {
          select: {
            id: true,
            name: true,
            priority: true,
            status: true,
            currentNodeCode: true,
          },
        },
      },
    });

    if (!task || (!this.isAdmin(actor) && task.assigneeUserId !== actor.id)) {
      throw new NotFoundException('Task not found.');
    }

    return this.toTaskItem(task);
  }

  private async listTasks(
    mode: TaskListMode,
    rawQuery: Record<string, string | undefined>,
    actor: AuthenticatedUser,
  ) {
    const page = normalizePage(rawQuery.page, 1);
    const pageSize = normalizePageSize(rawQuery.pageSize, 20);
    const now = new Date();

    const baseWhere: Prisma.WorkflowTaskWhereInput = {
      isActive: true,
      status: {
        in: [
          WorkflowTaskStatus.PENDING,
          WorkflowTaskStatus.READY,
          WorkflowTaskStatus.IN_PROGRESS,
          WorkflowTaskStatus.RETURNED,
        ],
      },
      assigneeUserId: actor.id,
    };

    const eagerDueAtWhere: Prisma.WorkflowTaskWhereInput =
      mode === 'overdue'
        ? {
            dueAt: {
              lt: now,
            },
          }
        : mode === 'pending'
          ? {
              OR: [
                {
                  dueAt: null,
                },
                {
                  dueAt: {
                    gte: now,
                  },
                },
              ],
            }
          : {};

    const [total, tasks] = await Promise.all([
      this.prisma.workflowTask.count({
        where: {
          ...baseWhere,
          ...eagerDueAtWhere,
        },
      }),
      this.prisma.workflowTask.findMany({
        where: {
          ...baseWhere,
          ...eagerDueAtWhere,
        },
        include: {
          assigneeUser: {
            select: {
              name: true,
            },
          },
          project: {
            select: {
              id: true,
              name: true,
              priority: true,
              status: true,
              currentNodeCode: true,
            },
          },
        },
        orderBy: [
          { dueAt: 'asc' },
          { createdAt: 'desc' },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const filtered = tasks.filter((task) =>
      matchesTaskMode(
        mode,
        {
          dueAt: task.dueAt,
          status: task.status,
          isActive: task.isActive,
        },
        now,
      ),
    );

    return {
      mode,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      items: filtered.map((task) => this.toTaskItem(task, now)),
    };
  }

  private toTaskItem(task: WorkflowTaskListRecord, now = new Date()) {
    const isOverdue = isWorkflowTaskOverdue(
      {
        dueAt: task.dueAt,
        status: task.status,
        isActive: task.isActive,
      },
      now,
    );

    return {
      taskId: task.id,
      projectId: task.projectId,
      projectName: task.project.name,
      projectHref: `/projects/${task.projectId}/${getTaskRouteSegment(task.nodeCode)}`,
      nodeCode: task.nodeCode,
      nodeName: task.nodeName || getCurrentNodeName(task.nodeCode) || task.nodeCode,
      taskStatus: task.status,
      dueAt: task.dueAt?.toISOString() ?? null,
      assigneeName: task.assigneeUser?.name ?? '未分配',
      isOverdue,
      priority: task.project.priority,
      currentProjectStatus: task.project.status,
      currentProjectNodeCode: task.project.currentNodeCode,
    };
  }

  private isAdmin(actor: AuthenticatedUser) {
    return actor.isSystemAdmin || actor.roleCodes.includes('admin');
  }
}
