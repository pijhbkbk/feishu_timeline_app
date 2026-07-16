import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AuditTargetType,
  NotificationSendChannel,
  NotificationType,
  Prisma,
  WorkflowAction,
  type WorkflowNodeCode,
} from '@prisma/client';

import { PrismaService } from '../../infra/prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ProjectAccessService } from '../auth/project-access.service';
import { normalizePage, normalizePageSize } from '../tasks/tasks.rules';
import { getCurrentNodeName } from '../workflows/workflow-node.constants';

type AuditLogExecutor = Prisma.TransactionClient | PrismaService;

type ProjectTimelinePageReference = {
  sourceType: 'AUDIT' | 'WORKFLOW' | 'NOTIFICATION';
  id: string;
  createdAt: Date;
};

type CreateAuditLogInput = {
  projectId?: string | null;
  actorUserId?: string | null;
  targetType: AuditTargetType;
  targetId: string;
  action: string;
  nodeCode?: WorkflowNodeCode | null;
  summary?: string | null;
  beforeData?: Prisma.InputJsonValue;
  afterData?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
};

@Injectable()
export class ActivityLogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectAccessService: ProjectAccessService,
  ) {}

  create(input: CreateAuditLogInput) {
    return this.createWithExecutor(this.prisma, input);
  }

  createWithExecutor(executor: AuditLogExecutor, input: CreateAuditLogInput) {
    return executor.auditLog.create({
      data: {
        projectId: input.projectId ?? null,
        actorUserId: input.actorUserId ?? null,
        targetType: input.targetType,
        targetId: input.targetId,
        action: input.action,
        nodeCode: input.nodeCode ?? null,
        summary: input.summary ?? null,
        ...(input.beforeData === undefined ? {} : { beforeData: input.beforeData }),
        ...(input.afterData === undefined ? {} : { afterData: input.afterData }),
        ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
      },
    });
  }

  async getProjectLogTimeline(
    projectId: string,
    actor: AuthenticatedUser,
    rawQuery: Record<string, string | undefined> = {},
  ) {
    await this.projectAccessService.assertProjectAccessWithDefaultClient(
      projectId,
      actor,
      'audit.read',
    );
    const page = normalizePage(rawQuery.page, 1);
    const pageSize = normalizePageSize(rawQuery.pageSize, 20);
    const from = this.parseOptionalDateFilter(rawQuery.from, 'from');
    const to = this.parseOptionalDateFilter(rawQuery.to, 'to');
    const actorUserId = rawQuery.actorUserId?.trim() || null;
    const action = rawQuery.action?.trim() || null;

    if (from && to && from > to) {
      throw new BadRequestException('from 不能晚于 to。');
    }

    const offset = (page - 1) * pageSize;
    const sourceWindowSize = offset + pageSize;
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        code: true,
        name: true,
        currentNodeCode: true,
        plannedEndDate: true,
      },
    });

    if (!project) {
      throw new NotFoundException('项目不存在或已被删除。');
    }

    const createdAt = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
    };
    const hasCreatedAtFilter = Boolean(from || to);
    const auditWhere: Prisma.AuditLogWhereInput = {
      projectId,
      ...(actorUserId ? { actorUserId } : {}),
      ...(action ? { action } : {}),
      ...(hasCreatedAtFilter ? { createdAt } : {}),
    };
    const workflowAction = action && this.isWorkflowAction(action) ? action : null;
    const workflowWhere: Prisma.WorkflowTransitionWhereInput = {
      projectId,
      ...(actorUserId ? { operatorUserId: actorUserId } : {}),
      ...(action ? (workflowAction ? { action: workflowAction } : { id: '__no_match__' }) : {}),
      ...(hasCreatedAtFilter ? { createdAt } : {}),
    };
    const notificationType = action && this.isNotificationType(action) ? action : null;
    const notificationWhere: Prisma.NotificationWhereInput = {
      projectId,
      sendChannel: NotificationSendChannel.IN_APP,
      ...(actorUserId ? { userId: actorUserId } : {}),
      ...(action
        ? notificationType
          ? { notificationType }
          : { id: '__no_match__' }
        : {}),
      ...(hasCreatedAtFilter ? { createdAt } : {}),
    };
    const auditSqlFilters = [Prisma.sql`"projectId" = ${projectId}`];
    const workflowSqlFilters = [Prisma.sql`"projectId" = ${projectId}`];
    const notificationSqlFilters = [
      Prisma.sql`"projectId" = ${projectId}`,
      Prisma.sql`"sendChannel" = ${NotificationSendChannel.IN_APP}::"NotificationSendChannel"`,
    ];

    if (from) {
      auditSqlFilters.push(Prisma.sql`"createdAt" >= ${from}`);
      workflowSqlFilters.push(Prisma.sql`"createdAt" >= ${from}`);
      notificationSqlFilters.push(Prisma.sql`"createdAt" >= ${from}`);
    }
    if (to) {
      auditSqlFilters.push(Prisma.sql`"createdAt" <= ${to}`);
      workflowSqlFilters.push(Prisma.sql`"createdAt" <= ${to}`);
      notificationSqlFilters.push(Prisma.sql`"createdAt" <= ${to}`);
    }
    if (actorUserId) {
      auditSqlFilters.push(Prisma.sql`"actorUserId" = ${actorUserId}`);
      workflowSqlFilters.push(Prisma.sql`"operatorUserId" = ${actorUserId}`);
      notificationSqlFilters.push(Prisma.sql`"userId" = ${actorUserId}`);
    }
    if (action) {
      auditSqlFilters.push(Prisma.sql`"action" = ${action}`);
      workflowSqlFilters.push(Prisma.sql`"action"::text = ${action}`);
      notificationSqlFilters.push(Prisma.sql`"notificationType"::text = ${action}`);
    }

    const [auditCount, workflowCount, notificationCount, pageReferences] =
      await this.prisma.$transaction([
        this.prisma.auditLog.count({ where: auditWhere }),
        this.prisma.workflowTransition.count({ where: workflowWhere }),
        this.prisma.notification.count({
          where: notificationWhere,
        }),
        this.prisma.$queryRaw<ProjectTimelinePageReference[]>(Prisma.sql`
          SELECT "sourceType", "id", "createdAt"
          FROM (
            (
              SELECT 'AUDIT'::text AS "sourceType", "id", "createdAt"
              FROM "audit_logs"
              WHERE ${Prisma.join(auditSqlFilters, ' AND ')}
              ORDER BY "createdAt" DESC, "id" DESC
              LIMIT ${sourceWindowSize}
            )
            UNION ALL
            (
              SELECT 'WORKFLOW'::text AS "sourceType", "id", "createdAt"
              FROM "workflow_transitions"
              WHERE ${Prisma.join(workflowSqlFilters, ' AND ')}
              ORDER BY "createdAt" DESC, "id" DESC
              LIMIT ${sourceWindowSize}
            )
            UNION ALL
            (
              SELECT 'NOTIFICATION'::text AS "sourceType", "id", "createdAt"
              FROM "notifications"
              WHERE ${Prisma.join(notificationSqlFilters, ' AND ')}
              ORDER BY "createdAt" DESC, "id" DESC
              LIMIT ${sourceWindowSize}
            )
          ) AS "projectTimeline"
          ORDER BY "createdAt" DESC, "sourceType" ASC, "id" DESC
          OFFSET ${offset}
          LIMIT ${pageSize}
        `),
      ]);

    const auditIds = pageReferences
      .filter((item) => item.sourceType === 'AUDIT')
      .map((item) => item.id);
    const workflowIds = pageReferences
      .filter((item) => item.sourceType === 'WORKFLOW')
      .map((item) => item.id);
    const notificationIds = pageReferences
      .filter((item) => item.sourceType === 'NOTIFICATION')
      .map((item) => item.id);

    const [auditLogs, workflowTransitions, notifications] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: { id: { in: auditIds } },
        select: {
          id: true,
          action: true,
          summary: true,
          actorUserId: true,
          actorUser: { select: { name: true } },
          nodeCode: true,
          createdAt: true,
        },
      }),
      this.prisma.workflowTransition.findMany({
        where: { id: { in: workflowIds } },
        select: {
          id: true,
          action: true,
          comment: true,
          operatorUserId: true,
          operatorUser: { select: { name: true } },
          fromNodeCode: true,
          toNodeCode: true,
          fromTask: { select: { nodeName: true } },
          toTask: { select: { nodeName: true } },
          createdAt: true,
        },
      }),
      this.prisma.notification.findMany({
        where: { id: { in: notificationIds } },
        select: {
          id: true,
          userId: true,
          user: { select: { name: true } },
          title: true,
          content: true,
          notificationType: true,
          isRead: true,
          sendStatus: true,
          linkPath: true,
          createdAt: true,
        },
      }),
    ]);

    const items = [
      ...auditLogs.map((log) => ({
        id: `audit:${log.id}`,
        sourceType: 'AUDIT' as const,
        action: log.action,
        title: log.summary ?? log.action,
        description: log.summary ?? `审计动作 ${log.action}`,
        actorName: log.actorUser?.name ?? null,
        actorUserId: log.actorUserId,
        nodeCode: log.nodeCode,
        nodeName: getCurrentNodeName(log.nodeCode),
        linkPath: `/projects/${projectId}/logs`,
        isRead: null,
        sendStatus: null,
        createdAt: log.createdAt.toISOString(),
      })),
      ...workflowTransitions.map((transition) => {
        const fromNodeName =
          transition.fromTask?.nodeName ?? getCurrentNodeName(transition.fromNodeCode);
        const toNodeName =
          transition.toTask?.nodeName ?? getCurrentNodeName(transition.toNodeCode);

        return {
          id: `workflow:${transition.id}`,
          sourceType: 'WORKFLOW' as const,
          action: transition.action,
          title:
            fromNodeName && toNodeName
              ? `${fromNodeName} -> ${toNodeName}`
              : toNodeName ?? fromNodeName ?? '流程流转',
          description:
            transition.comment ??
            `${transition.action} ${toNodeName ?? fromNodeName ?? 'workflow task'}`,
          actorName: transition.operatorUser?.name ?? null,
          actorUserId: transition.operatorUserId,
          nodeCode: transition.toNodeCode ?? transition.fromNodeCode,
          nodeName: toNodeName ?? fromNodeName ?? null,
          linkPath: `/projects/${projectId}/workflow`,
          isRead: null,
          sendStatus: null,
          createdAt: transition.createdAt.toISOString(),
        };
      }),
      ...notifications.map((notification) => ({
        id: `notification:${notification.id}`,
        sourceType: 'NOTIFICATION' as const,
        action: notification.notificationType,
        title: notification.title,
        description: notification.content,
        actorName: notification.user?.name ?? null,
        actorUserId: notification.userId,
        nodeCode: null,
        nodeName: null,
        linkPath: notification.linkPath,
        isRead: notification.isRead,
        sendStatus: notification.sendStatus,
        createdAt: notification.createdAt.toISOString(),
      })),
    ];
    const itemById = new Map(items.map((item) => [item.id, item]));
    const orderedItems = pageReferences.flatMap((reference) => {
      const item = itemById.get(`${reference.sourceType.toLowerCase()}:${reference.id}`);
      return item ? [item] : [];
    });
    const totalCount = auditCount + workflowCount + notificationCount;

    return {
      pagination: {
        page,
        pageSize,
        total: totalCount,
        totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
      },
      project: {
        id: project.id,
        code: project.code,
        name: project.name,
        currentNodeCode: project.currentNodeCode,
        currentNodeName: getCurrentNodeName(project.currentNodeCode),
        targetDate: project.plannedEndDate?.toISOString() ?? null,
      },
      summary: {
        auditCount,
        workflowCount,
        notificationCount,
        totalCount,
      },
      items: orderedItems,
    };
  }

  async getProjectLogDetail(
    projectId: string,
    logId: string,
    actor: AuthenticatedUser,
  ) {
    await this.projectAccessService.assertProjectAccessWithDefaultClient(
      projectId,
      actor,
      'audit.read',
    );

    const separatorIndex = logId.indexOf(':');
    const sourceType = separatorIndex > 0 ? logId.slice(0, separatorIndex) : '';
    const sourceId = separatorIndex > 0 ? logId.slice(separatorIndex + 1) : '';

    if (!sourceId) {
      throw new NotFoundException('日志不存在或不属于当前项目。');
    }

    if (sourceType === 'audit') {
      const log = await this.prisma.auditLog.findFirst({
        where: { id: sourceId, projectId },
        select: {
          id: true,
          targetType: true,
          targetId: true,
          action: true,
          summary: true,
          actorUserId: true,
          actorUser: { select: { name: true } },
          nodeCode: true,
          beforeData: true,
          afterData: true,
          metadata: true,
          createdAt: true,
        },
      });

      if (!log) {
        throw new NotFoundException('日志不存在或不属于当前项目。');
      }

      return {
        ...log,
        id: `audit:${log.id}`,
        sourceType: 'AUDIT' as const,
        actorName: log.actorUser?.name ?? null,
        actorUser: undefined,
        createdAt: log.createdAt.toISOString(),
      };
    }

    if (sourceType === 'workflow') {
      const transition = await this.prisma.workflowTransition.findFirst({
        where: { id: sourceId, projectId },
        select: {
          id: true,
          workflowInstanceId: true,
          fromTaskId: true,
          toTaskId: true,
          fromNodeCode: true,
          toNodeCode: true,
          action: true,
          comment: true,
          operatorUserId: true,
          operatorUser: { select: { name: true } },
          createdAt: true,
        },
      });

      if (!transition) {
        throw new NotFoundException('日志不存在或不属于当前项目。');
      }

      return {
        ...transition,
        id: `workflow:${transition.id}`,
        sourceType: 'WORKFLOW' as const,
        actorName: transition.operatorUser?.name ?? null,
        operatorUser: undefined,
        createdAt: transition.createdAt.toISOString(),
      };
    }

    if (sourceType === 'notification') {
      const notification = await this.prisma.notification.findFirst({
        where: {
          id: sourceId,
          projectId,
          sendChannel: NotificationSendChannel.IN_APP,
        },
        select: {
          id: true,
          userId: true,
          user: { select: { name: true } },
          taskId: true,
          notificationType: true,
          title: true,
          content: true,
          linkPath: true,
          isRead: true,
          readAt: true,
          sendStatus: true,
          retryCount: true,
          metadata: true,
          createdAt: true,
        },
      });

      if (!notification) {
        throw new NotFoundException('日志不存在或不属于当前项目。');
      }

      return {
        ...notification,
        id: `notification:${notification.id}`,
        sourceType: 'NOTIFICATION' as const,
        actorName: notification.user.name,
        user: undefined,
        createdAt: notification.createdAt.toISOString(),
      };
    }

    throw new NotFoundException('日志不存在或不属于当前项目。');
  }

  private parseOptionalDateFilter(value: string | undefined, label: string) {
    if (!value?.trim()) {
      return null;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${label} 日期格式不正确。`);
    }

    return parsed;
  }

  private isWorkflowAction(value: string): value is WorkflowAction {
    return Object.values(WorkflowAction).includes(value as WorkflowAction);
  }

  private isNotificationType(value: string): value is NotificationType {
    return Object.values(NotificationType).includes(value as NotificationType);
  }
}
