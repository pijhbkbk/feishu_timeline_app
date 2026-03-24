import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditTargetType,
  NotificationSendChannel,
  NotificationSendStatus,
  NotificationType,
  type Prisma,
} from '@prisma/client';

import { PrismaService } from '../../infra/prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { FeishuMessagesService } from '../feishu-messages/feishu-messages.service';
import { getTaskRouteSegment, normalizePage, normalizePageSize } from '../tasks/tasks.rules';
import { getCurrentNodeName } from '../workflows/workflow-node.constants';
import type { NotificationQueueJob } from '../queue/notification-queue.types';

type WorkflowTaskNotificationRecord = Prisma.WorkflowTaskGetPayload<{
  include: {
    project: {
      select: {
        id: true;
        name: true;
      };
    };
    assigneeUser: {
      select: {
        id: true;
        name: true;
      };
    };
  };
}>;

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLogsService: ActivityLogsService,
    private readonly feishuMessagesService: FeishuMessagesService,
  ) {}

  async getMyNotifications(
    rawQuery: Record<string, string | undefined>,
    actor: AuthenticatedUser,
  ) {
    const page = normalizePage(rawQuery.page, 1);
    const pageSize = normalizePageSize(rawQuery.pageSize, 20);

    const where: Prisma.NotificationWhereInput = {
      userId: actor.id,
      sendChannel: NotificationSendChannel.IN_APP,
    };

    const [total, unreadCount, items] = await Promise.all([
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({
        where: {
          ...where,
          isRead: false,
        },
      }),
      this.prisma.notification.findMany({
        where,
        orderBy: [{ isRead: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      unreadCount,
      items: items.map((item) => this.toNotificationItem(item)),
    };
  }

  async getUnreadCount(actor: AuthenticatedUser) {
    const unreadCount = await this.prisma.notification.count({
      where: {
        userId: actor.id,
        sendChannel: NotificationSendChannel.IN_APP,
        isRead: false,
      },
    });

    return { unreadCount };
  }

  async markRead(notificationId: string, actor: AuthenticatedUser) {
    const notification = await this.prisma.notification.findFirst({
      where: {
        id: notificationId,
        userId: actor.id,
        sendChannel: NotificationSendChannel.IN_APP,
      },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found.');
    }

    if (!notification.isRead) {
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: {
          isRead: true,
          readAt: new Date(),
        },
      });

      await this.activityLogsService.create({
        projectId: notification.projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.NOTIFICATION,
        targetId: notification.id,
        action: 'NOTIFICATION_MARKED_READ',
        summary: `通知 ${notification.title} 已读`,
        metadata: {
          notificationType: notification.notificationType,
        },
      });
    }

    return this.getUnreadCount(actor);
  }

  async markAllRead(actor: AuthenticatedUser) {
    const unreadNotifications = await this.prisma.notification.findMany({
      where: {
        userId: actor.id,
        sendChannel: NotificationSendChannel.IN_APP,
        isRead: false,
      },
      select: {
        id: true,
        projectId: true,
      },
    });

    if (unreadNotifications.length > 0) {
      await this.prisma.notification.updateMany({
        where: {
          id: {
            in: unreadNotifications.map((item) => item.id),
          },
        },
        data: {
          isRead: true,
          readAt: new Date(),
        },
      });

      await this.activityLogsService.create({
        projectId: unreadNotifications[0]?.projectId ?? null,
        actorUserId: actor.id,
        targetType: AuditTargetType.NOTIFICATION,
        targetId: actor.id,
        action: 'NOTIFICATIONS_MARKED_ALL_READ',
        summary: `批量已读 ${unreadNotifications.length} 条通知`,
        metadata: {
          notificationIds: unreadNotifications.map((item) => item.id),
          count: unreadNotifications.length,
        },
      });
    }

    return this.getUnreadCount(actor);
  }

  async processQueuedNotification(job: NotificationQueueJob) {
    switch (job.type) {
      case NotificationType.SYSTEM_INFO:
        return this.processSystemNotification(job);
      case NotificationType.TASK_ASSIGNED:
      case NotificationType.REVIEW_PENDING:
      case NotificationType.TASK_RETURNED:
      case NotificationType.TASK_OVERDUE:
        return this.processTaskNotification(job);
      default:
        return { skipped: true };
    }
  }

  async hasInAppNotificationDedupeKey(dedupeKeys: string[]) {
    if (dedupeKeys.length === 0) {
      return new Set<string>();
    }

    const notifications = await this.prisma.notification.findMany({
      where: {
        sendChannel: NotificationSendChannel.IN_APP,
        dedupeKey: {
          in: dedupeKeys,
        },
      },
      select: {
        dedupeKey: true,
      },
    });

    return new Set(
      notifications
        .map((item) => item.dedupeKey)
        .filter((item): item is string => typeof item === 'string'),
    );
  }

  private async processSystemNotification(job: NotificationQueueJob) {
    if (!job.userId || !job.title || !job.content) {
      return { skipped: true };
    }

    const dedupeKey = this.buildDedupeKey(job.type, job.userId, job.taskId, 'system');

    await this.upsertInAppNotification({
      userId: job.userId,
      projectId: job.projectId,
      taskId: job.taskId,
      type: job.type,
      title: job.title,
      content: job.content,
      linkPath: job.linkPath,
      retryCount: job.retryCount,
      dedupeKey,
      ...(job.metadata === undefined ? {} : { metadata: job.metadata }),
    });

    await this.deliverMockFeishu({
      userId: job.userId,
      projectId: job.projectId,
      taskId: job.taskId,
      type: job.type,
      title: job.title,
      content: job.content,
      linkPath: job.linkPath,
      retryCount: job.retryCount,
      dedupeKey,
      ...(job.metadata === undefined ? {} : { metadata: job.metadata }),
    });

    return { skipped: false };
  }

  private async processTaskNotification(job: NotificationQueueJob) {
    if (!job.taskId) {
      return { skipped: true };
    }

    const task = await this.prisma.workflowTask.findUnique({
      where: { id: job.taskId },
      include: {
        project: {
          select: {
            id: true,
            name: true,
          },
        },
        assigneeUser: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!task || !task.assigneeUserId) {
      return { skipped: true };
    }

    const copy = this.buildTaskNotificationCopy(task, job.type);
    const metadataDedupeKey =
      job.metadata &&
      typeof job.metadata === 'object' &&
      !Array.isArray(job.metadata) &&
      typeof (job.metadata as Record<string, unknown>).dedupeKey === 'string'
        ? ((job.metadata as Record<string, unknown>).dedupeKey as string)
        : null;
    const dedupeKey = metadataDedupeKey ?? this.buildTaskDedupeKey(task, job.type);

    await this.upsertInAppNotification({
      userId: task.assigneeUserId,
      projectId: task.projectId,
      taskId: task.id,
      type: job.type,
      title: copy.title,
      content: copy.content,
      linkPath: copy.linkPath,
      retryCount: job.retryCount,
      dedupeKey,
      metadata: {
        taskNo: task.taskNo,
        nodeCode: task.nodeCode,
      },
    });

    await this.deliverMockFeishu({
      userId: task.assigneeUserId,
      projectId: task.projectId,
      taskId: task.id,
      type: job.type,
      title: copy.title,
      content: copy.content,
      linkPath: copy.linkPath,
      retryCount: job.retryCount,
      dedupeKey,
      metadata: {
        taskNo: task.taskNo,
        nodeCode: task.nodeCode,
      },
    });

    return { skipped: false };
  }

  private async upsertInAppNotification(input: {
    userId: string;
    projectId: string | null;
    taskId: string | null;
    type: NotificationType;
    title: string;
    content: string;
    linkPath: string | null;
    retryCount: number;
    dedupeKey: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    return this.prisma.notification.upsert({
      where: {
        sendChannel_dedupeKey: {
          sendChannel: NotificationSendChannel.IN_APP,
          dedupeKey: input.dedupeKey,
        },
      },
      create: {
        userId: input.userId,
        projectId: input.projectId,
        taskId: input.taskId,
        notificationType: input.type,
        title: input.title,
        content: input.content,
        linkPath: input.linkPath,
        dedupeKey: input.dedupeKey,
        sendChannel: NotificationSendChannel.IN_APP,
        sendStatus: NotificationSendStatus.SENT,
        retryCount: input.retryCount,
        ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
      },
      update: {
        title: input.title,
        content: input.content,
        linkPath: input.linkPath,
        sendStatus: NotificationSendStatus.SENT,
        retryCount: input.retryCount,
        ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
      },
    });
  }

  private async deliverMockFeishu(input: {
    userId: string;
    projectId: string | null;
    taskId: string | null;
    type: NotificationType;
    title: string;
    content: string;
    linkPath: string | null;
    retryCount: number;
    dedupeKey: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    const existing = await this.prisma.notification.findUnique({
      where: {
        sendChannel_dedupeKey: {
          sendChannel: NotificationSendChannel.FEISHU,
          dedupeKey: input.dedupeKey,
        },
      },
    });

    if (existing?.sendStatus === NotificationSendStatus.SENT) {
      return existing;
    }

    const notification = existing
      ? await this.prisma.notification.update({
          where: { id: existing.id },
          data: {
            title: input.title,
            content: input.content,
            linkPath: input.linkPath,
            retryCount: input.retryCount,
            sendStatus: NotificationSendStatus.PENDING,
            ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
          },
        })
      : await this.prisma.notification.create({
          data: {
            userId: input.userId,
            projectId: input.projectId,
            taskId: input.taskId,
            notificationType: input.type,
            title: input.title,
            content: input.content,
            linkPath: input.linkPath,
            dedupeKey: input.dedupeKey,
            sendChannel: NotificationSendChannel.FEISHU,
            sendStatus: NotificationSendStatus.PENDING,
            retryCount: input.retryCount,
            ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
          },
        });

    try {
      await this.feishuMessagesService.sendNotification({
        userId: input.userId,
        title: input.title,
        content: input.content,
        dedupeKey: input.dedupeKey,
      });

      return this.prisma.notification.update({
        where: { id: notification.id },
        data: {
          sendStatus: NotificationSendStatus.SENT,
          retryCount: input.retryCount,
        },
      });
    } catch (error) {
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: {
          sendStatus: NotificationSendStatus.FAILED,
          retryCount: input.retryCount + 1,
        },
      });

      throw error;
    }
  }

  private buildTaskNotificationCopy(
    task: WorkflowTaskNotificationRecord,
    type: NotificationType,
  ) {
    const nodeName = task.nodeName || getCurrentNodeName(task.nodeCode) || task.nodeCode;
    const linkPath = `/projects/${task.projectId}/${getTaskRouteSegment(task.nodeCode)}`;

    switch (type) {
      case NotificationType.REVIEW_PENDING:
        return {
          title: `${task.project.name} 待评审`,
          content: `你有一条待处理评审：${nodeName}。`,
          linkPath,
        };
      case NotificationType.TASK_RETURNED:
        return {
          title: `${task.project.name} 节点已退回`,
          content: `${nodeName} 已退回给你，请重新处理。`,
          linkPath,
        };
      case NotificationType.TASK_OVERDUE:
        return {
          title: `${task.project.name} 任务已超期`,
          content: `${nodeName} 已超过计划时间，请尽快处理。`,
          linkPath,
        };
      case NotificationType.TASK_ASSIGNED:
      default:
        return {
          title: `${task.project.name} 新任务已分配`,
          content: `你被分配到节点 ${nodeName}，请及时处理。`,
          linkPath,
        };
    }
  }

  private buildTaskDedupeKey(
    task: Pick<WorkflowTaskNotificationRecord, 'id' | 'taskRound' | 'assigneeUserId'>,
    type: NotificationType,
  ) {
    if (type === NotificationType.TASK_OVERDUE) {
      return this.buildDedupeKey(
        type,
        task.assigneeUserId ?? 'unknown',
        task.id,
        new Date().toISOString().slice(0, 10),
      );
    }

    return this.buildDedupeKey(type, task.assigneeUserId ?? 'unknown', task.id, String(task.taskRound));
  }

  private buildDedupeKey(
    type: NotificationType,
    userId: string,
    taskId: string | null,
    suffix: string,
  ) {
    return [type, userId, taskId ?? 'no-task', suffix].join(':');
  }

  private toNotificationItem(
    notification: Prisma.NotificationGetPayload<Record<string, never>>,
  ) {
    return {
      id: notification.id,
      projectId: notification.projectId,
      taskId: notification.taskId,
      notificationType: notification.notificationType,
      title: notification.title,
      content: notification.content,
      linkPath: notification.linkPath,
      isRead: notification.isRead,
      readAt: notification.readAt?.toISOString() ?? null,
      sendStatus: notification.sendStatus,
      createdAt: notification.createdAt.toISOString(),
    };
  }
}
