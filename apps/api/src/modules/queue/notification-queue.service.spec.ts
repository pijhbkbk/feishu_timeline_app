import { NotificationType, WorkflowTaskStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { NotificationQueueService } from './notification-queue.service';

function createService(options?: {
  redisFails?: boolean;
  processorFailsOnce?: boolean;
}) {
  let shouldFail = options?.processorFailsOnce ?? false;

  const prisma = {
    workflowTask: {
      findMany: vi.fn(),
    },
  };

  const redisService = {
    execute: options?.redisFails
      ? vi.fn().mockRejectedValue(new Error('redis down'))
      : vi.fn(async (handler: (client: { lpush: typeof vi.fn; rpop: typeof vi.fn; rpush: typeof vi.fn }) => Promise<unknown>) =>
          handler({
            lpush: vi.fn().mockResolvedValue(1),
            rpop: vi.fn().mockResolvedValue(null),
            rpush: vi.fn().mockResolvedValue(1),
          }),
        ),
  };

  const notificationsService = {
    processQueuedNotification: vi.fn().mockImplementation(async () => {
      if (shouldFail) {
        shouldFail = false;
        throw new Error('temporary failure');
      }

      return { skipped: false };
    }),
    hasInAppNotificationDedupeKey: vi.fn().mockResolvedValue(new Set<string>()),
  };

  const configService = {
    get: vi.fn((key: string) => {
      if (key === 'notificationQueueEnabled') {
        return false;
      }

      if (key === 'notificationMaxRetries') {
        return 3;
      }

      if (key === 'notificationRetryDelayMs') {
        return 0;
      }

      return 1000;
    }),
  };

  const service = new NotificationQueueService(
    prisma as never,
    redisService as never,
    notificationsService as never,
    configService as never,
  );

  return {
    service,
    prisma,
    redisService,
    notificationsService,
  };
}

describe('NotificationQueueService', () => {
  it('falls back to memory queue when redis is unavailable', async () => {
    const { service } = createService({ redisFails: true });

    const result = await service.enqueue({
      type: NotificationType.SYSTEM_INFO,
      taskId: null,
      projectId: 'project-1',
      userId: 'user-1',
      title: '系统提醒',
      content: '请查看系统消息。',
      linkPath: '/dashboard',
      triggeredByUserId: 'user-1',
    });

    expect(result.channel).toBe('memory');
  });

  it('supports basic retry when queue processing fails once', async () => {
    const { service, notificationsService } = createService({
      redisFails: true,
      processorFailsOnce: true,
    });

    await service.enqueue({
      type: NotificationType.SYSTEM_INFO,
      taskId: null,
      projectId: 'project-1',
      userId: 'user-1',
      title: '系统提醒',
      content: '请查看系统消息。',
      linkPath: '/dashboard',
      triggeredByUserId: 'user-1',
    });

    await service.processPendingJobs();
    await service.processPendingJobs();

    expect(notificationsService.processQueuedNotification).toHaveBeenCalledTimes(2);
  });

  it('scans overdue tasks and enqueues reminders', async () => {
    const { service, prisma, notificationsService } = createService({ redisFails: true });
    prisma.workflowTask.findMany.mockResolvedValue([
      {
        id: 'task-1',
        assigneeUserId: 'user-1',
        dueAt: new Date('2026-03-18T12:00:00.000Z'),
        status: WorkflowTaskStatus.IN_PROGRESS,
      },
    ]);
    notificationsService.hasInAppNotificationDedupeKey.mockResolvedValue(new Set<string>());

    const result = await service.processOverdueScan();

    expect(result.scanned).toBe(1);
    expect(result.enqueued).toBe(1);
  });
});

