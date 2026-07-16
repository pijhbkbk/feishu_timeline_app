import {
  NotificationSendChannel,
  NotificationSendStatus,
  NotificationType,
  WorkflowAction,
  WorkflowNodeCode,
} from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import type { AuthenticatedUser } from '../auth/auth.types';
import { ActivityLogsService } from './activity-logs.service';

const actor: AuthenticatedUser = {
  id: 'user-1',
  username: 'manager',
  name: '项目经理',
  email: null,
  departmentId: 'dept-pmo',
  departmentName: '项目管理部',
  isSystemAdmin: false,
  authSource: 'mock',
  roleCodes: ['project_manager'],
  permissionCodes: ['project.read'],
};

function createService() {
  const prisma = {
    project: {
      findUnique: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
    },
    workflowTransition: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    notification: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
  };

  const projectAccessService = {
    assertProjectAccessWithDefaultClient: vi.fn().mockResolvedValue({ id: 'project-1' }),
  };
  const service = new ActivityLogsService(prisma as never, projectAccessService as never);

  return {
    service,
    prisma,
    projectAccessService,
  };
}

describe('ActivityLogsService', () => {
  it('aggregates project audit, workflow and notification timeline', async () => {
    const { service, prisma } = createService();
    prisma.project.findUnique.mockResolvedValue({
      id: 'project-1',
      code: 'PRJ-001',
      name: '演示项目',
      currentNodeCode: WorkflowNodeCode.CAB_REVIEW,
      plannedEndDate: new Date('2026-04-15T00:00:00.000Z'),
    });
    prisma.auditLog.count.mockResolvedValue(1);
    prisma.workflowTransition.count.mockResolvedValue(1);
    prisma.notification.count.mockResolvedValue(1);
    prisma.$queryRaw.mockResolvedValue([
      {
        sourceType: 'NOTIFICATION',
        id: 'notification-1',
        createdAt: new Date('2026-03-19T09:00:00.000Z'),
      },
      {
        sourceType: 'WORKFLOW',
        id: 'transition-1',
        createdAt: new Date('2026-03-19T08:00:00.000Z'),
      },
      {
        sourceType: 'AUDIT',
        id: 'audit-1',
        createdAt: new Date('2026-03-18T08:00:00.000Z'),
      },
    ]);
    prisma.auditLog.findMany.mockResolvedValue([
      {
        id: 'audit-1',
        action: 'PROJECT_CREATED',
        summary: '创建项目',
        actorUserId: 'user-1',
        actorUser: { name: '项目经理' },
        nodeCode: WorkflowNodeCode.PROJECT_INITIATION,
        createdAt: new Date('2026-03-18T08:00:00.000Z'),
      },
    ]);
    prisma.workflowTransition.findMany.mockResolvedValue([
      {
        id: 'transition-1',
        action: WorkflowAction.COMPLETE,
        comment: '样车试制完成后进入驾驶室评审。',
        operatorUserId: 'user-2',
        operatorUser: { name: '工艺工程师' },
        fromNodeCode: WorkflowNodeCode.TRIAL_PRODUCTION,
        toNodeCode: WorkflowNodeCode.CAB_REVIEW,
        fromTask: { nodeName: '样车试制' },
        toTask: { nodeName: '样车驾驶室评审' },
        createdAt: new Date('2026-03-19T08:00:00.000Z'),
      },
    ]);
    prisma.notification.findMany.mockResolvedValue([
      {
        id: 'notification-1',
        userId: 'user-3',
        user: { name: '评审人' },
        title: '待处理驾驶室评审',
        content: '请处理项目A驾驶室评审。',
        notificationType: NotificationType.REVIEW_PENDING,
        isRead: false,
        sendChannel: NotificationSendChannel.IN_APP,
        sendStatus: NotificationSendStatus.SENT,
        linkPath: '/projects/project-1/reviews',
        createdAt: new Date('2026-03-19T09:00:00.000Z'),
      },
    ]);

    const result = await service.getProjectLogTimeline('project-1', actor, {
      page: '1',
      pageSize: '20',
    });

    expect(result.summary.totalCount).toBe(3);
    expect(result.summary.workflowCount).toBe(1);
    expect(result.pagination).toEqual({
      page: 1,
      pageSize: 20,
      total: 3,
      totalPages: 1,
    });
    expect(result.items[0]).toMatchObject({
      sourceType: 'NOTIFICATION',
      title: '待处理驾驶室评审',
    });
    expect(result.items[1]).toMatchObject({
      sourceType: 'WORKFLOW',
      nodeCode: WorkflowNodeCode.CAB_REVIEW,
    });
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['audit-1'] } },
      }),
    );
    const timelineQuery = prisma.$queryRaw.mock.calls[0]?.[0] as { strings: string[] };
    expect(timelineQuery.strings.join('')).toContain('OFFSET');
    expect(timelineQuery.strings.join('')).toContain('LIMIT');
  });
});
