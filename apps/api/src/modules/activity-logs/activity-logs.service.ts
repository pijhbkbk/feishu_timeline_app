import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AuditTargetType,
  NotificationSendChannel,
  Prisma,
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
      'project.read',
    );
    const page = normalizePage(rawQuery.page, 1);
    const pageSize = normalizePageSize(rawQuery.pageSize, 20);
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

    const [auditCount, workflowCount, notificationCount, pageReferences] =
      await this.prisma.$transaction([
        this.prisma.auditLog.count({ where: { projectId } }),
        this.prisma.workflowTransition.count({ where: { projectId } }),
        this.prisma.notification.count({
          where: {
            projectId,
            sendChannel: NotificationSendChannel.IN_APP,
          },
        }),
        this.prisma.$queryRaw<ProjectTimelinePageReference[]>(Prisma.sql`
          SELECT "sourceType", "id", "createdAt"
          FROM (
            (
              SELECT 'AUDIT'::text AS "sourceType", "id", "createdAt"
              FROM "audit_logs"
              WHERE "projectId" = ${projectId}
              ORDER BY "createdAt" DESC, "id" DESC
              LIMIT ${sourceWindowSize}
            )
            UNION ALL
            (
              SELECT 'WORKFLOW'::text AS "sourceType", "id", "createdAt"
              FROM "workflow_transitions"
              WHERE "projectId" = ${projectId}
              ORDER BY "createdAt" DESC, "id" DESC
              LIMIT ${sourceWindowSize}
            )
            UNION ALL
            (
              SELECT 'NOTIFICATION'::text AS "sourceType", "id", "createdAt"
              FROM "notifications"
              WHERE "projectId" = ${projectId}
                AND "sendChannel" = ${NotificationSendChannel.IN_APP}::"NotificationSendChannel"
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
}
