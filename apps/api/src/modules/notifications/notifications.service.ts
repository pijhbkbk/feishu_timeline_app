import { visibleNotificationSql, visibleDigestItemSql } from './task-reminder.rules';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditTargetType,
  NotificationSendChannel,
  NotificationSendStatus,
  NotificationType,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../../infra/prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { FeishuMessagesService } from '../feishu-messages/feishu-messages.service';
import { getTaskRouteSegment, normalizePage, normalizePageSize } from '../tasks/tasks.rules';
import { getCurrentNodeName } from '../workflows/workflow-node.constants';
import type { NotificationQueueJob } from '../queue/notification-queue.types';
import {
  normalizeNotificationLinkPathForWrite,
  sanitizeNotificationLinkPathForRead,
} from './notification-link-path.rules';

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

type PersistedNotificationInput = {
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
};

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

    const visibility = visibleNotificationSql();
    const scope = Prisma.sql`n."userId" = ${actor.id} AND n."sendChannel" = 'IN_APP' AND ${visibility}`;
    const [counts, items] = await Promise.all([
      this.prisma.$queryRaw<Array<{ total: number; unreadCount: number }>>(Prisma.sql`SELECT count(*)::int AS total, count(*) FILTER (WHERE NOT n."isRead")::int AS "unreadCount" FROM notifications n WHERE ${scope}`),
      this.prisma.$queryRaw<Array<Prisma.NotificationGetPayload<Record<string, never>>>>(Prisma.sql`SELECT n.* FROM notifications n WHERE ${scope} ORDER BY n."isRead" ASC, n."createdAt" DESC, n.id DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`),
    ]);
    const total = counts[0]?.total ?? 0;
    return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)), unreadCount: counts[0]?.unreadCount ?? 0,
      items: items.map(item => this.toNotificationItem(item)) };
  }

  async getUnreadCount(actor: AuthenticatedUser) {
    const rows = await this.prisma.$queryRaw<Array<{ unreadCount: number }>>(Prisma.sql`SELECT count(*)::int AS "unreadCount" FROM notifications n
      WHERE n."userId" = ${actor.id} AND n."sendChannel" = 'IN_APP' AND NOT n."isRead" AND ${visibleNotificationSql()}`);
    return { unreadCount: rows[0]?.unreadCount ?? 0 };
  }

  async getDigestItems(notificationId: string, after: string | undefined, actor: AuthenticatedUser) {
    if (notificationId.length > 128 || (after?.length ?? 0) > 128) throw new BadRequestException('通知分页参数过长。');
    const notification = await this.prisma.notification.findFirst({ where: { id: notificationId, userId: actor.id, reminderKind: 'OVERDUE_DAY', sendChannel: 'IN_APP' }, select: { id: true } });
    if (!notification) throw new NotFoundException('通知不存在。');
    const items = await this.prisma.$queryRaw<Array<{ id: string; projectId: string; projectCode: string; projectName: string; taskId: string; monthly: boolean; title: string; dueAt: Date | null }>>(Prisma.sql`
      SELECT d.id, d."projectId", p.code AS "projectCode", p.name AS "projectName", COALESCE(d."workflowTaskId",d."recurringTaskId") AS "taskId",
        (d."recurringTaskId" IS NOT NULL) AS monthly, COALESCE(t."nodeName", '第 ' || m."periodIndex" || ' 月目视色差评审') AS title,
        COALESCE(t."effectiveDueAt",t."dueAt",m."dueAt") AS "dueAt"
      FROM notification_digest_items d JOIN notifications n ON n.id = d."notificationId" JOIN projects p ON p.id = d."projectId"
      LEFT JOIN workflow_tasks t ON t.id = d."workflowTaskId" LEFT JOIN recurring_tasks m ON m.id = d."recurringTaskId"
      WHERE n.id = ${notification.id} AND n."userId" = ${actor.id} AND d.id > ${after ?? ''} AND ${visibleDigestItemSql()}
      ORDER BY d.id ASC LIMIT 21`);
    return { items: items.slice(0, 20).map(item => ({ ...item, dueAt: item.dueAt?.toISOString() ?? null,
      linkPath: item.monthly ? `/projects/${item.projectId}/color-evaluation?recurringTaskId=${item.taskId}` : `/projects/${item.projectId}/tasks/${item.taskId}` })), nextCursor: items.length > 20 ? items[19]!.id : null };
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
      throw new NotFoundException('通知不存在或已被删除。');
    }

    if (!notification.isRead) {
      const claimed = await this.prisma.notification.updateMany({
        where: {
          id: notification.id,
          userId: actor.id,
          sendChannel: NotificationSendChannel.IN_APP,
          isRead: false,
        },
        data: {
          isRead: true,
          readAt: new Date(),
        },
      });

      if (claimed.count === 1) {
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
    }

    return this.getUnreadCount(actor);
  }

  async markAllRead(actor: AuthenticatedUser) {
    const claimed = await this.prisma.notification.updateMany({
      where: {
        userId: actor.id,
        sendChannel: NotificationSendChannel.IN_APP,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    if (claimed.count > 0) {
      await this.activityLogsService.create({
        projectId: null,
        actorUserId: actor.id,
        targetType: AuditTargetType.NOTIFICATION,
        targetId: actor.id,
        action: 'NOTIFICATIONS_MARKED_ALL_READ',
        summary: `批量已读 ${claimed.count} 条通知`,
        metadata: {
          count: claimed.count,
        },
      });
    }

    return this.getUnreadCount(actor);
  }

  async processQueuedNotification(job: NotificationQueueJob) {
    // Old queued work messages are retired; current role/stage-qualified scanners rebuild them.
    if (job.taskId || (job.metadata && typeof job.metadata === 'object' && !Array.isArray(job.metadata) && 'recurringTaskId' in job.metadata)) return { skipped: true };
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

    const metadataDedupeKey =
      job.metadata &&
      typeof job.metadata === 'object' &&
      !Array.isArray(job.metadata) &&
      typeof (job.metadata as Record<string, unknown>).dedupeKey === 'string'
        ? ((job.metadata as Record<string, unknown>).dedupeKey as string)
        : null;
    const dedupeKey =
      metadataDedupeKey ??
      this.buildDedupeKey(job.type, job.userId, job.taskId, 'system');

    await this.persistAndDeliverNotification({
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

    await this.persistAndDeliverNotification({
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

  private async persistAndDeliverNotification(input: PersistedNotificationInput) {
    const linkPath = normalizeNotificationLinkPathForWrite(input.linkPath);
    const admittedInput = { ...input, linkPath };

    await this.upsertInAppNotification(admittedInput);
    // Native accounts receive durable in-app notifications only. Historical channel records remain intact.
  }

  private async upsertInAppNotification(input: PersistedNotificationInput) {
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

  private async deliverMockFeishu(input: PersistedNotificationInput) {
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
      reminderKind: notification.reminderKind,
      title: notification.title,
      content: notification.content,
      linkPath: sanitizeNotificationLinkPathForRead(notification.linkPath),
      isRead: notification.isRead,
      readAt: notification.readAt?.toISOString() ?? null,
      sendStatus: notification.sendStatus,
      createdAt: notification.createdAt.toISOString(),
    };
  }
}
