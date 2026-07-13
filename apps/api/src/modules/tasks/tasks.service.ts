import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AttachmentTargetType,
  AuditTargetType,
  Prisma,
  TaskBlockerStatus,
  WorkflowNodeCode,
  WorkflowTaskStatus,
} from '@prisma/client';

import { PrismaService } from '../../infra/prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ProjectAccessService } from '../auth/project-access.service';
import { getCurrentNodeName } from '../workflows/workflow-node.constants';
import type { CreateTaskProgressDto } from './dto/create-task-progress.dto';
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
    progressUpdates: {
      include: {
        blocker: {
          include: {
            helperUser: { select: { id: true; name: true } };
          };
        };
      };
    };
  };
}>;

const REVIEW_TASK_NODE_CODES = [
  WorkflowNodeCode.SAMPLE_COLOR_CONFIRMATION,
  WorkflowNodeCode.CAB_REVIEW,
  WorkflowNodeCode.COLOR_CONSISTENCY_REVIEW,
] as const;

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectAccessService: ProjectAccessService,
    private readonly activityLogsService: ActivityLogsService,
  ) {}

  async getMyTasks(rawQuery: Record<string, string | undefined>, actor: AuthenticatedUser) {
    return this.listTasks('my', rawQuery, actor);
  }

  async getPendingTasks(rawQuery: Record<string, string | undefined>, actor: AuthenticatedUser) {
    return this.listTasks('pending', rawQuery, actor);
  }

  async getOverdueTasks(rawQuery: Record<string, string | undefined>, actor: AuthenticatedUser) {
    return this.listTasks('overdue', rawQuery, actor);
  }

  async getReviewTasks(rawQuery: Record<string, string | undefined>, actor: AuthenticatedUser) {
    return this.listTasks('review', rawQuery, actor);
  }

  async getDueSoonTasks(rawQuery: Record<string, string | undefined>, actor: AuthenticatedUser) {
    return this.listTasks('due-soon', rawQuery, actor);
  }

  async getCompletedTasks(rawQuery: Record<string, string | undefined>, actor: AuthenticatedUser) {
    return this.listTasks('completed', rawQuery, actor);
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
        progressUpdates: {
          include: {
            blocker: { include: { helperUser: { select: { id: true, name: true } } } },
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!task || (!this.isAdmin(actor) && task.assigneeUserId !== actor.id)) {
      throw new NotFoundException('工序任务不存在或已被删除。');
    }

    return this.toTaskItem(task);
  }

  async getTaskProgress(taskId: string, actor: AuthenticatedUser) {
    const task = await this.getProgressTaskOrThrow(taskId, actor, 'project.read');
    const items = await this.prisma.taskProgressUpdate.findMany({
      where: { workflowTaskId: task.id },
      include: {
        submittedBy: { select: { id: true, name: true } },
        blocker: {
          include: {
            helperUser: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      taskId: task.id,
      projectId: task.projectId,
      items: items.map((item) => this.toProgressItem(item)),
    };
  }

  async createTaskProgress(
    taskId: string,
    input: CreateTaskProgressDto,
    actor: AuthenticatedUser,
  ) {
    const task = await this.getProgressTaskOrThrow(taskId, actor, 'workflow.transition');
    this.assertTaskCanReceiveProgress(task);
    this.assertProgressInput(input);
    await this.assertProgressReferences(task.projectId, task.id, input);

    const existing = await this.prisma.taskProgressUpdate.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: {
        submittedBy: { select: { id: true, name: true } },
        blocker: { include: { helperUser: { select: { id: true, name: true } } } },
      },
    });

    if (existing) {
      if (existing.workflowTaskId !== task.id || existing.submittedById !== actor.id) {
        throw new ConflictException('幂等键已被其他进展提交使用。');
      }

      return this.toProgressItem(existing);
    }

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const progress = await tx.taskProgressUpdate.create({
          data: {
            workflowTaskId: task.id,
            projectId: task.projectId,
            submittedById: actor.id,
            completionPercent: input.completionPercent,
            completedContent: input.completedContent.trim(),
            nextPlan: input.nextPlan?.trim() || null,
            materialAttachmentIds:
              input.materialAttachmentIds && input.materialAttachmentIds.length > 0
                ? input.materialAttachmentIds
                : Prisma.JsonNull,
            idempotencyKey: input.idempotencyKey,
            ...(input.isBlocked
              ? {
                  blocker: {
                    create: {
                      workflowTaskId: task.id,
                      projectId: task.projectId,
                      blockerType: input.blockerType!,
                      description: input.blockerDescription!.trim(),
                      helperUserId: input.helperUserId?.trim() || null,
                      expectedResolvedAt: input.expectedResolvedAt
                        ? new Date(input.expectedResolvedAt)
                        : null,
                      status: TaskBlockerStatus.OPEN,
                    },
                  },
                }
              : {}),
          },
          include: {
            submittedBy: { select: { id: true, name: true } },
            blocker: { include: { helperUser: { select: { id: true, name: true } } } },
          },
        });

        await this.activityLogsService.createWithExecutor(tx, {
          projectId: task.projectId,
          actorUserId: actor.id,
          targetType: AuditTargetType.WORKFLOW_TASK,
          targetId: task.id,
          action: 'TASK_PROGRESS_SUBMITTED',
          nodeCode: task.nodeCode,
          summary: `${task.nodeName} 已提交 ${input.completionPercent}% 工作进展。`,
          afterData: {
            progressUpdateId: progress.id,
            completionPercent: progress.completionPercent,
            isBlocked: Boolean(progress.blocker),
            materialAttachmentIds: input.materialAttachmentIds ?? [],
          },
        });

        return progress;
      });

      return this.toProgressItem(created);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const duplicate = await this.prisma.taskProgressUpdate.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
          include: {
            submittedBy: { select: { id: true, name: true } },
            blocker: { include: { helperUser: { select: { id: true, name: true } } } },
          },
        });

        if (
          duplicate &&
          duplicate.workflowTaskId === task.id &&
          duplicate.submittedById === actor.id
        ) {
          return this.toProgressItem(duplicate);
        }
      }

      throw error;
    }
  }

  private async listTasks(
    mode: TaskListMode,
    rawQuery: Record<string, string | undefined>,
    actor: AuthenticatedUser,
  ) {
    const page = normalizePage(rawQuery.page, 1);
    const pageSize = normalizePageSize(rawQuery.pageSize, 20);
    const now = new Date();
    const dueSoonEnd = new Date(now);
    dueSoonEnd.setDate(dueSoonEnd.getDate() + 7);

    const baseWhere: Prisma.WorkflowTaskWhereInput = {
      assigneeUserId: actor.id,
      ...(mode === 'completed'
        ? { isActive: false, status: WorkflowTaskStatus.COMPLETED }
        : {
            isActive: true,
            status: {
              in: [
                WorkflowTaskStatus.PENDING,
                WorkflowTaskStatus.READY,
                WorkflowTaskStatus.IN_PROGRESS,
                WorkflowTaskStatus.RETURNED,
              ],
            },
          }),
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
          : mode === 'review'
            ? { nodeCode: { in: [...REVIEW_TASK_NODE_CODES] } }
            : mode === 'due-soon'
              ? { dueAt: { gte: now, lte: dueSoonEnd } }
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
          progressUpdates: {
            include: {
              blocker: { include: { helperUser: { select: { id: true, name: true } } } },
            },
            orderBy: { createdAt: 'desc' },
            take: 1,
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
      mode === 'review' || mode === 'due-soon'
        ? true
        : matchesTaskMode(
            mode,
            {
              dueAt: task.dueAt,
              status: task.status,
              isActive: task.isActive,
            },
            now,
          ),
    );

    const attachmentCounts = filtered.length > 0
      ? await this.prisma.attachment.groupBy({
          by: ['entityId'],
          where: {
            entityType: AttachmentTargetType.WORKFLOW_TASK,
            entityId: { in: filtered.map((task) => task.id) },
            isDeleted: false,
          },
          _count: { _all: true },
        })
      : [];
    const attachmentCountByTask = new Map(
      attachmentCounts.map((item) => [item.entityId, item._count._all]),
    );

    return {
      mode,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      items: filtered.map((task) => this.toTaskItem(task, now, attachmentCountByTask.get(task.id) ?? 0)),
    };
  }

  private toTaskItem(task: WorkflowTaskListRecord, now = new Date(), materialCount = 0) {
    const isOverdue = isWorkflowTaskOverdue(
      {
        dueAt: task.dueAt,
        status: task.status,
        isActive: task.isActive,
      },
      now,
    );

    const latestProgress = task.progressUpdates[0] ?? null;

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
      materialCount,
      completionPercent: latestProgress?.completionPercent ?? 0,
      latestUpdate: latestProgress
        ? {
            content: latestProgress.completedContent,
            nextPlan: latestProgress.nextPlan,
            createdAt: latestProgress.createdAt.toISOString(),
          }
        : null,
      blocker: latestProgress?.blocker
        ? {
            type: latestProgress.blocker.blockerType,
            description: latestProgress.blocker.description,
            helperName: latestProgress.blocker.helperUser?.name ?? null,
            expectedResolvedAt: latestProgress.blocker.expectedResolvedAt?.toISOString() ?? null,
            status: latestProgress.blocker.status,
          }
        : null,
    };
  }

  private isAdmin(actor: AuthenticatedUser) {
    return actor.isSystemAdmin || actor.roleCodes.includes('admin');
  }

  private async getProgressTaskOrThrow(
    taskId: string,
    actor: AuthenticatedUser,
    permission: 'project.read' | 'workflow.transition',
  ) {
    const task = await this.prisma.workflowTask.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        projectId: true,
        nodeCode: true,
        nodeName: true,
        status: true,
        isActive: true,
        assigneeUserId: true,
      },
    });

    if (!task) {
      throw new NotFoundException('工序任务不存在或已被删除。');
    }

    await this.projectAccessService.assertProjectAccessWithDefaultClient(
      task.projectId,
      actor,
      permission,
    );

    if (!this.isAdmin(actor) && task.assigneeUserId !== actor.id) {
      throw new ForbiddenException('只能查看或提交分配给自己的任务进展。');
    }

    return task;
  }

  private assertTaskCanReceiveProgress(task: {
    status: WorkflowTaskStatus;
    isActive: boolean;
  }) {
    const allowedStatuses = new Set<WorkflowTaskStatus>([
      WorkflowTaskStatus.PENDING,
      WorkflowTaskStatus.READY,
      WorkflowTaskStatus.IN_PROGRESS,
      WorkflowTaskStatus.RETURNED,
    ]);

    if (!task.isActive || !allowedStatuses.has(task.status)) {
      throw new BadRequestException('当前任务状态不允许提交工作进展。');
    }
  }

  private assertProgressInput(input: CreateTaskProgressDto) {
    if (!input.completedContent.trim()) {
      throw new BadRequestException('请填写本次完成内容。');
    }

    if (input.isBlocked && (!input.blockerType || !input.blockerDescription?.trim())) {
      throw new BadRequestException('存在阻塞时必须填写阻塞类型和说明。');
    }
  }

  private async assertProgressReferences(
    projectId: string,
    taskId: string,
    input: CreateTaskProgressDto,
  ) {
    if (input.helperUserId) {
      const helper = await this.prisma.user.findUnique({
        where: { id: input.helperUserId },
        select: { id: true },
      });

      if (!helper) {
        throw new BadRequestException('请求协助的用户不存在。');
      }
    }

    const attachmentIds = [...new Set(input.materialAttachmentIds ?? [])];
    if (attachmentIds.length === 0) {
      return;
    }

    const attachmentCount = await this.prisma.attachment.count({
      where: {
        id: { in: attachmentIds },
        projectId,
        entityType: AttachmentTargetType.WORKFLOW_TASK,
        entityId: taskId,
        isDeleted: false,
      },
    });

    if (attachmentCount !== attachmentIds.length) {
      throw new BadRequestException('进展材料必须已安全上传并绑定到当前任务。');
    }
  }

  private toProgressItem(item: {
    id: string;
    workflowTaskId: string;
    projectId: string;
    submittedById: string | null;
    submittedBy: { id: string; name: string } | null;
    completionPercent: number;
    completedContent: string;
    nextPlan: string | null;
    materialAttachmentIds: Prisma.JsonValue;
    idempotencyKey: string;
    createdAt: Date;
    blocker: {
      id: string;
      blockerType: string;
      description: string;
      helperUserId: string | null;
      helperUser: { id: string; name: string } | null;
      expectedResolvedAt: Date | null;
      status: TaskBlockerStatus;
      resolvedAt: Date | null;
    } | null;
  }) {
    return {
      id: item.id,
      taskId: item.workflowTaskId,
      projectId: item.projectId,
      submittedById: item.submittedById,
      submittedByName: item.submittedBy?.name ?? '系统用户',
      completionPercent: item.completionPercent,
      completedContent: item.completedContent,
      nextPlan: item.nextPlan,
      materialAttachmentIds: Array.isArray(item.materialAttachmentIds)
        ? item.materialAttachmentIds.filter((value): value is string => typeof value === 'string')
        : [],
      blocker: item.blocker
        ? {
            id: item.blocker.id,
            type: item.blocker.blockerType,
            description: item.blocker.description,
            helperUserId: item.blocker.helperUserId,
            helperUserName: item.blocker.helperUser?.name ?? null,
            expectedResolvedAt: item.blocker.expectedResolvedAt?.toISOString() ?? null,
            status: item.blocker.status,
            resolvedAt: item.blocker.resolvedAt?.toISOString() ?? null,
          }
        : null,
      idempotencyKey: item.idempotencyKey,
      createdAt: item.createdAt.toISOString(),
    };
  }
}
