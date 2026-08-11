import { Logger } from '@nestjs/common';
import { NotificationType, RecurringTaskStatus, WorkflowTaskStatus } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NotificationQueueService } from './notification-queue.service';

function createService(options?: {
  redisFails?: boolean;
  redisError?: Error;
  processorFailsOnce?: boolean;
}) {
  let shouldFail = options?.processorFailsOnce ?? false;
  const redisDedupeKeys = new Set<string>();

  const prisma = {
    workflowTask: {
      findMany: vi.fn(),
    },
    recurringTask: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  };

  const redisService = {
    execute: options?.redisFails
      ? vi.fn().mockRejectedValue(options.redisError ?? new Error('redis down'))
      : vi.fn(async (handler: (client: {
          eval: typeof vi.fn;
          lpush: typeof vi.fn;
          rpop: typeof vi.fn;
          rpush: typeof vi.fn;
        }) => Promise<unknown>) =>
          handler({
            eval: vi.fn().mockImplementation(async (
              _script: string,
              _keyCount: number,
              markerKey: string,
            ) => {
              if (redisDedupeKeys.has(markerKey)) return 0;
              redisDedupeKeys.add(markerKey);
              return 1;
            }),
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

afterEach(() => {
  vi.restoreAllMocks();
});

describe('NotificationQueueService', () => {
  it.each([
    'https://attacker.example/path',
    '//attacker.example/path',
    'javascript:alert(1)',
    '/\\\\attacker.example/path',
    '/projects/project-1/\nworkflow',
    '/projects/project-1/\u0000workflow',
    '/projects/project-1/\u007fworkflow',
  ])('rejects an unsafe notification link path: %s', async (linkPath) => {
    const { service, redisService } = createService();

    await expect(
      service.enqueue({
        type: NotificationType.SYSTEM_INFO,
        taskId: null,
        projectId: 'project-1',
        userId: 'user-1',
        title: '系统提醒',
        content: '请查看系统消息。',
        linkPath,
        triggeredByUserId: 'user-1',
      }),
    ).rejects.toThrow('通知链接必须是站内绝对路径');
    expect(redisService.execute).not.toHaveBeenCalled();
  });

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

  it('does not copy Redis error contents into production-style queue logs', async () => {
    const sensitiveError = 'cookie=private-cookie-marker-271828 taskId=private-task';
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { service } = createService({
      redisFails: true,
      redisError: new Error(sensitiveError),
    });

    await service.enqueue({
      type: NotificationType.SYSTEM_INFO,
      taskId: 'private-task',
      projectId: 'project-1',
      userId: 'user-1',
      title: '敏感项目标题',
      content: '请查看系统消息。',
      linkPath: '/dashboard',
      triggeredByUserId: 'user-1',
    });

    const serializedLogs = JSON.stringify(warnSpy.mock.calls);
    expect(serializedLogs).not.toContain(sensitiveError);
    expect(serializedLogs).not.toContain('private-cookie-marker-271828');
    expect(serializedLogs).not.toContain('private-task');
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

  it('scans due-today tasks and enqueues due reminders', async () => {
    const { service, prisma, notificationsService } = createService({ redisFails: true });
    prisma.workflowTask.findMany.mockResolvedValue([
      {
        id: 'task-due-today',
        projectId: 'project-1',
        assigneeUserId: 'user-1',
        nodeCode: 'PAINT_PROCUREMENT',
        nodeName: '涂料采购',
        dueAt: new Date('2026-03-19T12:00:00.000Z'),
        status: WorkflowTaskStatus.READY,
      },
    ]);
    notificationsService.hasInAppNotificationDedupeKey.mockResolvedValue(new Set<string>());

    const result = await service.processDueReminderScan(
      new Date('2026-03-19T08:00:00.000Z'),
    );

    expect(result.scanned).toBe(1);
    expect(result.enqueued).toBe(1);
  });

  it('atomically deduplicates repeated due-reminder scans before jobs are consumed', async () => {
    const { service, prisma, notificationsService } = createService();
    prisma.workflowTask.findMany.mockResolvedValue([
      {
        id: 'task-due-today',
        projectId: 'project-1',
        assigneeUserId: 'user-1',
        nodeCode: 'PAINT_PROCUREMENT',
        nodeName: '涂料采购',
        dueAt: new Date('2026-03-19T12:00:00.000Z'),
        status: WorkflowTaskStatus.READY,
      },
    ]);
    notificationsService.hasInAppNotificationDedupeKey.mockResolvedValue(new Set<string>());
    const now = new Date('2026-03-19T08:00:00.000Z');

    const first = await service.processDueReminderScan(now);
    const second = await service.processDueReminderScan(now);

    expect(first).toEqual({ scanned: 1, enqueued: 1 });
    expect(second).toEqual({ scanned: 1, enqueued: 0 });
  });

  it('scans monthly recurring reviews and marks overdue instances', async () => {
    const { service, prisma, notificationsService } = createService({ redisFails: true });
    prisma.recurringTask.findMany.mockResolvedValue([
      {
        id: 'recurring-task-1',
        projectId: 'project-1',
        reviewerId: 'user-1',
        periodLabel: '2026-03',
        dueAt: new Date('2026-03-18T23:59:59.999Z'),
        status: RecurringTaskStatus.PENDING,
      },
    ]);
    prisma.recurringTask.updateMany.mockResolvedValue({ count: 1 });
    notificationsService.hasInAppNotificationDedupeKey.mockResolvedValue(new Set<string>());

    const result = await service.processMonthlyReviewSchedule(
      new Date('2026-03-19T08:00:00.000Z'),
    );

    expect(result).toEqual({
      scanned: 1,
      markedOverdue: 1,
      enqueued: 1,
    });
    expect(prisma.recurringTask.updateMany).toHaveBeenCalled();
  });
});
