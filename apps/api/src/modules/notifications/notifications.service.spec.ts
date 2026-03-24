import {
  AuditTargetType,
  NotificationSendChannel,
  NotificationSendStatus,
  NotificationType,
} from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import type { AuthenticatedUser } from '../auth/auth.types';
import { NotificationsService } from './notifications.service';

const actor: AuthenticatedUser = {
  id: 'user-1',
  username: 'reviewer',
  name: '评审人',
  email: null,
  departmentId: null,
  departmentName: null,
  isSystemAdmin: false,
  authSource: 'mock',
  roleCodes: ['reviewer'],
};

function createService() {
  const prisma = {
    notification: {
      count: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      upsert: vi.fn(),
      create: vi.fn(),
    },
    workflowTask: {
      findUnique: vi.fn(),
    },
  };

  const activityLogsService = {
    create: vi.fn().mockResolvedValue(undefined),
  };

  const feishuMessagesService = {
    sendNotification: vi.fn().mockResolvedValue({
      success: true,
      messageId: 'mock-1',
    }),
  };

  const service = new NotificationsService(
    prisma as never,
    activityLogsService as never,
    feishuMessagesService as never,
  );

  return {
    service,
    prisma,
    activityLogsService,
    feishuMessagesService,
  };
}

describe('NotificationsService', () => {
  it('returns notifications scoped to current user', async () => {
    const { service, prisma } = createService();
    prisma.notification.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    prisma.notification.findMany.mockResolvedValue([
      {
        id: 'notification-1',
        projectId: 'project-1',
        taskId: 'task-1',
        notificationType: NotificationType.TASK_ASSIGNED,
        title: '新任务',
        content: '请处理',
        linkPath: '/projects/project-1/workflow',
        isRead: false,
        readAt: null,
        sendStatus: NotificationSendStatus.SENT,
        createdAt: new Date('2026-03-19T12:00:00.000Z'),
      },
    ]);

    const result = await service.getMyNotifications({}, actor);

    expect(result.items).toHaveLength(1);
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'user-1',
          sendChannel: NotificationSendChannel.IN_APP,
        },
      }),
    );
  });

  it('marks notification as read and writes audit log', async () => {
    const { service, prisma, activityLogsService } = createService();
    prisma.notification.findFirst.mockResolvedValue({
      id: 'notification-1',
      projectId: 'project-1',
      notificationType: NotificationType.TASK_ASSIGNED,
      title: '新任务',
      isRead: false,
    });
    prisma.notification.update.mockResolvedValue(undefined);
    prisma.notification.count.mockResolvedValue(0);

    await service.markRead('notification-1', actor);

    expect(prisma.notification.update).toHaveBeenCalled();
    expect(activityLogsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        targetType: AuditTargetType.NOTIFICATION,
        action: 'NOTIFICATION_MARKED_READ',
      }),
    );
  });

  it('creates notifications successfully for queued task jobs', async () => {
    const { service, prisma, feishuMessagesService } = createService();
    prisma.workflowTask.findUnique.mockResolvedValue({
      id: 'task-1',
      taskNo: 'TASK-001',
      taskRound: 1,
      nodeCode: 'CAB_REVIEW',
      nodeName: '样车驾驶室评审',
      projectId: 'project-1',
      assigneeUserId: 'user-2',
      project: {
        id: 'project-1',
        name: '项目A',
      },
      assigneeUser: {
        id: 'user-2',
        name: '张工',
      },
    });
    prisma.notification.upsert.mockResolvedValue(undefined);
    prisma.notification.findUnique.mockResolvedValue(null);
    prisma.notification.create.mockResolvedValue({
      id: 'notification-feishu-1',
    });
    prisma.notification.update.mockResolvedValue(undefined);

    await service.processQueuedNotification({
      id: 'job-1',
      type: NotificationType.REVIEW_PENDING,
      taskId: 'task-1',
      projectId: null,
      userId: null,
      title: null,
      content: null,
      linkPath: null,
      triggeredByUserId: null,
      retryCount: 0,
      availableAt: new Date().toISOString(),
    });

    expect(prisma.notification.upsert).toHaveBeenCalled();
    expect(feishuMessagesService.sendNotification).toHaveBeenCalled();
  });
});

