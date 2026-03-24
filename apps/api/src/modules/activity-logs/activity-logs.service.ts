import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AuditTargetType,
  NotificationSendChannel,
  type Prisma,
  type WorkflowNodeCode,
} from '@prisma/client';

import { PrismaService } from '../../infra/prisma/prisma.service';
import { getCurrentNodeName } from '../workflows/workflow-node.constants';

type AuditLogExecutor = Prisma.TransactionClient | PrismaService;

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
  constructor(private readonly prisma: PrismaService) {}

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

  async getProjectLogTimeline(projectId: string) {
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
      throw new NotFoundException('Project not found.');
    }

    const [auditLogs, workflowTransitions, notifications] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where: {
          projectId,
        },
        include: {
          actorUser: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
      this.prisma.workflowTransition.findMany({
        where: {
          projectId,
        },
        include: {
          operatorUser: true,
          fromTask: true,
          toTask: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
      this.prisma.notification.findMany({
        where: {
          projectId,
          sendChannel: NotificationSendChannel.IN_APP,
        },
        include: {
          user: true,
        },
        orderBy: {
          createdAt: 'desc',
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
    ].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));

    return {
      project: {
        id: project.id,
        code: project.code,
        name: project.name,
        currentNodeCode: project.currentNodeCode,
        currentNodeName: getCurrentNodeName(project.currentNodeCode),
        targetDate: project.plannedEndDate?.toISOString() ?? null,
      },
      summary: {
        auditCount: auditLogs.length,
        workflowCount: workflowTransitions.length,
        notificationCount: notifications.length,
        totalCount: items.length,
      },
      items,
    };
  }
}
