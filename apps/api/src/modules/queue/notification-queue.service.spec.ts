import { Logger } from '@nestjs/common';
import { NotificationType, RecurringTaskStatus, WorkflowTaskStatus } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NotificationQueueService } from './notification-queue.service';

function createService(options?: {
  redisFails?: boolean;
  redisError?: Error;
  processorFailsOnce?: boolean;
  config?: Record<string, boolean | number>;
}) {
  let shouldFail = options?.processorFailsOnce ?? false;
  const redisDedupeKeys = new Set<string>();
  const redisQueue: string[] = [];

  const prisma = {
    workflowTask: {
      findMany: vi.fn(),
    },
    recurringTask: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  };

  const redisClient = {
    eval: vi.fn().mockImplementation(async (
      script: string,
      keyCount: number,
      ...args: string[]
    ) => {
      if (keyCount === 2) {
        const [markerKey, , , capOrSerialized, maybeSerialized] = args;
        if (!markerKey) return 0;
        if (redisDedupeKeys.has(markerKey)) return 0;

        const hasConfiguredCap = maybeSerialized !== undefined;
        const capacity = hasConfiguredCap
          ? Number(capOrSerialized)
          : Number.POSITIVE_INFINITY;
        const serialized = hasConfiguredCap ? maybeSerialized : capOrSerialized;
        if (redisQueue.length >= capacity) return -1;
        if (serialized === undefined) return -1;

        redisQueue.unshift(serialized);
        redisDedupeKeys.add(markerKey);
        return 1;
      }

      if (keyCount === 1) {
        const [, capRaw, serialized] = args;
        if (redisQueue.length >= Number(capRaw)) return 0;
        if (serialized === undefined) return 0;

        if (script.includes("'RPUSH'")) {
          redisQueue.push(serialized);
        } else {
          redisQueue.unshift(serialized);
        }
        return 1;
      }

      return 0;
    }),
    lpush: vi.fn().mockImplementation(async (_key: string, value: string) => {
      redisQueue.unshift(value);
      return redisQueue.length;
    }),
    rpop: vi.fn().mockImplementation(async () => redisQueue.pop() ?? null),
    rpush: vi.fn().mockImplementation(async (_key: string, value: string) => {
      redisQueue.push(value);
      return redisQueue.length;
    }),
  };

  const redisService = {
    execute: options?.redisFails
      ? vi.fn().mockRejectedValue(options.redisError ?? new Error('redis down'))
      : vi.fn(async (handler: (client: typeof redisClient) => Promise<unknown>) =>
          handler(redisClient),
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
      if (Object.prototype.hasOwnProperty.call(options?.config ?? {}, key)) {
        return options?.config?.[key];
      }

      if (key === 'notificationQueueEnabled') {
        return false;
      }

      if (key === 'notificationMaxRetries') {
        return 3;
      }

      if (key === 'notificationRetryDelayMs') {
        return 0;
      }

      return undefined;
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
    redisClient,
    redisQueue,
    redisDedupeKeys,
    notificationsService,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('NotificationQueueService', () => {
  const systemNotification = (content = '请查看系统消息。') => ({
    type: NotificationType.SYSTEM_INFO,
    taskId: null,
    projectId: 'project-1',
    userId: 'user-1',
    title: '系统提醒',
    content,
    linkPath: '/dashboard',
    triggeredByUserId: 'user-1',
  });

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

  it('atomically bounds concurrent Redis enqueue operations at max plus N', async () => {
    const { service, redisClient, redisQueue } = createService({
      config: {
        notificationRedisQueueMaxJobs: 2,
      },
    });

    const results = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        service.enqueue(systemNotification(`redis-enqueue-${index}`)),
      ),
    );

    expect(results.filter((result) => result.queued)).toHaveLength(2);
    expect(results.filter((result) => !result.queued)).toHaveLength(18);
    expect(results.slice(2)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          queued: false,
          channel: 'redis',
          reason: 'redis_queue_full',
          jobId: null,
        }),
      ]),
    );
    expect(redisQueue).toHaveLength(2);
    expect(redisClient.eval).toHaveBeenCalledTimes(20);
    expect(redisClient.lpush).not.toHaveBeenCalled();
    const enqueueScript = String(redisClient.eval.mock.calls[0]?.[0]);
    expect(enqueueScript).toContain("redis.call('LLEN', KEYS[1])");
    expect(enqueueScript).toContain("redis.call('LPUSH', KEYS[1], ARGV[2])");
  });

  it('bounds Redis requeue operations at max plus N without memory fallback', async () => {
    const { service, redisClient, redisQueue } = createService({
      config: {
        notificationRedisQueueMaxJobs: 2,
      },
    });
    const requeue = service as unknown as {
      requeue(job: {
        id: string;
        type: NotificationType;
        taskId: null;
        projectId: string;
        userId: string;
        title: string;
        content: string;
        linkPath: string;
        triggeredByUserId: string;
        retryCount: number;
        availableAt: string;
      }): Promise<{
        queued: boolean;
        channel: string;
        jobId: string | null;
        reason?: string;
      }>;
    };

    const results = [];
    for (let index = 0; index < 5; index += 1) {
      results.push(
        await requeue.requeue({
          id: `retry-${index}`,
          ...systemNotification(`retry-${index}`),
          retryCount: 1,
          availableAt: new Date(0).toISOString(),
        }),
      );
    }

    expect(results.map((result) => result?.queued)).toEqual([
      true,
      true,
      false,
      false,
      false,
    ]);
    expect(results.slice(2)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          channel: 'redis',
          reason: 'redis_queue_full',
          jobId: null,
        }),
      ]),
    );
    expect(redisQueue).toHaveLength(2);
    const requeueScript = String(redisClient.eval.mock.calls[0]?.[0]);
    expect(requeueScript).toContain("redis.call('LLEN', KEYS[1])");
    expect(requeueScript).toContain("redis.call('RPUSH', KEYS[1], ARGV[2])");
  });

  it('bounds Redis enqueue-once operations at max plus N', async () => {
    const { service, redisDedupeKeys, redisQueue } = createService({
      config: {
        notificationRedisQueueMaxJobs: 2,
      },
    });
    const enqueueOnce = service as unknown as {
      enqueueOnce(
        input: ReturnType<typeof systemNotification>,
        dedupeKey: string,
      ): Promise<{
        queued: boolean;
        duplicate: boolean;
        channel: string;
        jobId: string | null;
        reason?: string;
      }>;
    };

    const results = [];
    for (let index = 0; index < 5; index += 1) {
      results.push(
        await enqueueOnce.enqueueOnce(
          systemNotification(`redis-once-${index}`),
          `redis-once-${index}`,
        ),
      );
    }

    expect(results.map((result) => result.queued)).toEqual([
      true,
      true,
      false,
      false,
      false,
    ]);
    expect(results.slice(2)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          duplicate: false,
          channel: 'redis',
          reason: 'redis_queue_full',
          jobId: null,
        }),
      ]),
    );
    expect(redisQueue).toHaveLength(2);
    expect(redisDedupeKeys.size).toBe(2);
  });

  it('does not create a Redis marker when full and admits the same key after space frees', async () => {
    const { service, redisClient, redisDedupeKeys, redisQueue } = createService({
      config: {
        notificationRedisQueueMaxJobs: 1,
      },
    });
    const enqueueOnce = service as unknown as {
      enqueueOnce(
        input: ReturnType<typeof systemNotification>,
        dedupeKey: string,
      ): Promise<{
        queued: boolean;
        duplicate: boolean;
        reason?: string;
      }>;
    };

    await service.enqueue(systemNotification('capacity holder'));
    const full = await enqueueOnce.enqueueOnce(
      systemNotification('retry after capacity'),
      'redis-marker-after-capacity',
    );

    expect(full).toMatchObject({
      queued: false,
      duplicate: false,
      reason: 'redis_queue_full',
    });
    expect(redisQueue).toHaveLength(1);
    expect(redisDedupeKeys.size).toBe(0);

    await service.processPendingJobs();
    await expect(
      enqueueOnce.enqueueOnce(
        systemNotification('retry after capacity'),
        'redis-marker-after-capacity',
      ),
    ).resolves.toMatchObject({ queued: true, duplicate: false });
    expect(redisQueue).toHaveLength(1);
    expect(redisDedupeKeys.size).toBe(1);
    const enqueueOnceScript = String(redisClient.eval.mock.calls[1]?.[0]);
    expect(enqueueOnceScript.indexOf("redis.call('LLEN', KEYS[2])")).toBeLessThan(
      enqueueOnceScript.indexOf("redis.call('LPUSH', KEYS[2], ARGV[3])"),
    );
    expect(enqueueOnceScript.indexOf("redis.call('LPUSH', KEYS[2], ARGV[3])")).toBeLessThan(
      enqueueOnceScript.indexOf("redis.call('SET', KEYS[1]"),
    );
  });

  it('keeps the Redis-fallback queue bounded at its configured capacity', async () => {
    const { service, notificationsService } = createService({
      redisFails: true,
      config: {
        notificationMemoryQueueMaxJobs: 2,
      },
    });

    const results = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        service.enqueue(systemNotification(`bounded-${index}`)),
      ),
    );

    expect(results.map((result) => result.queued)).toEqual([
      true,
      true,
      false,
      false,
      false,
    ]);
    expect(results.slice(2)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          queued: false,
          channel: 'memory',
          reason: 'memory_queue_full',
          jobId: null,
        }),
      ]),
    );

    await service.processPendingJobs();
    expect(notificationsService.processQueuedNotification).toHaveBeenCalledTimes(2);
  });

  it('does not let requeue bypass the Redis-fallback queue capacity', async () => {
    const { service, notificationsService } = createService({
      redisFails: true,
      config: {
        notificationMemoryQueueMaxJobs: 1,
      },
    });

    await service.enqueue(systemNotification('already queued'));
    const requeue = service as unknown as {
      requeue(job: {
        id: string;
        type: NotificationType;
        taskId: null;
        projectId: string;
        userId: string;
        title: string;
        content: string;
        linkPath: string;
        triggeredByUserId: string;
        retryCount: number;
        availableAt: string;
      }): Promise<{
        queued: boolean;
        reason?: string;
      }>;
    };

    await expect(
      requeue.requeue({
        id: 'retry-job',
        ...systemNotification('retry'),
        retryCount: 1,
        availableAt: new Date(0).toISOString(),
      }),
    ).resolves.toMatchObject({
      queued: false,
      reason: 'memory_queue_full',
    });

    await service.processPendingJobs();
    expect(notificationsService.processQueuedNotification).toHaveBeenCalledTimes(1);
  });

  it('reclaims expired memory markers and never creates a marker for a rejected job', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-19T08:00:00.000Z'));

    try {
      const { service } = createService({
        redisFails: true,
        config: {
          notificationMemoryQueueMaxJobs: 1,
          notificationMemoryDedupeMaxKeys: 1,
        },
      });
      const enqueueOnce = service as unknown as {
        enqueueOnce(
          input: ReturnType<typeof systemNotification>,
          dedupeKey: string,
        ): Promise<{
          queued: boolean;
          duplicate: boolean;
          reason?: string;
        }>;
      };

      await service.enqueue(systemNotification('capacity holder'));
      await expect(
        enqueueOnce.enqueueOnce(systemNotification('rejected once'), 'key-not-stored'),
      ).resolves.toMatchObject({
        queued: false,
        duplicate: false,
        reason: 'memory_queue_full',
      });

      await service.processPendingJobs();
      await expect(
        enqueueOnce.enqueueOnce(systemNotification('accepted later'), 'key-not-stored'),
      ).resolves.toMatchObject({ queued: true, duplicate: false });
      await service.processPendingJobs();

      vi.advanceTimersByTime(2 * 24 * 60 * 60 * 1000 + 1);

      await expect(
        enqueueOnce.enqueueOnce(systemNotification('after expiry'), 'new-key'),
      ).resolves.toMatchObject({ queued: true, duplicate: false });
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the memory dedupe map bounded without admitting unmarked jobs', async () => {
    const { service, notificationsService } = createService({
      redisFails: true,
      config: {
        notificationMemoryQueueMaxJobs: 10,
        notificationMemoryDedupeMaxKeys: 2,
      },
    });
    const enqueueOnce = service as unknown as {
      enqueueOnce(
        input: ReturnType<typeof systemNotification>,
        dedupeKey: string,
      ): Promise<{
        queued: boolean;
        duplicate: boolean;
        reason?: string;
      }>;
    };

    const results = [];
    for (let index = 0; index < 5; index += 1) {
      results.push(
        await enqueueOnce.enqueueOnce(
          systemNotification(`dedupe-${index}`),
          `dedupe-${index}`,
        ),
      );
    }

    expect(results.map((result) => result.queued)).toEqual([
      true,
      true,
      false,
      false,
      false,
    ]);
    expect(results.slice(2)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          duplicate: false,
          reason: 'memory_dedupe_full',
        }),
      ]),
    );

    await service.processPendingJobs();
    expect(notificationsService.processQueuedNotification).toHaveBeenCalledTimes(2);
  });

  it('rejects an oversized serialized job before Redis or memory admission', async () => {
    const { service, redisService } = createService({
      redisFails: true,
      config: {
        notificationJobMaxBytes: 1024,
      },
    });

    await expect(
      service.enqueue(systemNotification('x'.repeat(2_000))),
    ).resolves.toMatchObject({
      queued: false,
      channel: 'none',
      reason: 'job_too_large',
      jobId: null,
    });
    expect(redisService.execute).not.toHaveBeenCalled();
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

  it('allows only one in-flight invocation of the overdue scan', async () => {
    let releaseQuery: ((value: never[]) => void) | undefined;
    const pendingQuery = new Promise<never[]>((resolve) => {
      releaseQuery = resolve;
    });
    const { service, prisma } = createService({ redisFails: true });
    prisma.workflowTask.findMany.mockReturnValue(pendingQuery);

    const first = service.processOverdueScan();
    const second = await service.processOverdueScan();

    expect(second).toMatchObject({
      scanned: 0,
      enqueued: 0,
      skipped: true,
      reason: 'scan_in_progress',
    });
    expect(prisma.workflowTask.findMany).toHaveBeenCalledTimes(1);

    releaseQuery?.([]);
    await expect(first).resolves.toMatchObject({ scanned: 0, enqueued: 0 });
  });

  it('independently guards due-reminder and monthly-review scans in flight', async () => {
    let releaseDueQuery: ((value: never[]) => void) | undefined;
    let releaseMonthlyQuery: ((value: never[]) => void) | undefined;
    const dueQuery = new Promise<never[]>((resolve) => {
      releaseDueQuery = resolve;
    });
    const monthlyQuery = new Promise<never[]>((resolve) => {
      releaseMonthlyQuery = resolve;
    });
    const { service, prisma } = createService({ redisFails: true });
    prisma.workflowTask.findMany.mockReturnValue(dueQuery);
    prisma.recurringTask.findMany.mockReturnValue(monthlyQuery);

    const firstDue = service.processDueReminderScan();
    const firstMonthly = service.processMonthlyReviewSchedule();
    const secondDue = await service.processDueReminderScan();
    const secondMonthly = await service.processMonthlyReviewSchedule();

    expect(secondDue).toMatchObject({
      scanned: 0,
      enqueued: 0,
      skipped: true,
      reason: 'scan_in_progress',
    });
    expect(secondMonthly).toMatchObject({
      scanned: 0,
      markedOverdue: 0,
      enqueued: 0,
      skipped: true,
      reason: 'scan_in_progress',
    });
    expect(prisma.workflowTask.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.recurringTask.findMany).toHaveBeenCalledTimes(1);

    releaseDueQuery?.([]);
    releaseMonthlyQuery?.([]);
    await expect(firstDue).resolves.toMatchObject({ scanned: 0, enqueued: 0 });
    await expect(firstMonthly).resolves.toMatchObject({
      scanned: 0,
      markedOverdue: 0,
      enqueued: 0,
    });
  });

  it('uses cursor batches and bounds both database rows and dedupe-key sets per scan', async () => {
    const { service, prisma, notificationsService } = createService({
      redisFails: true,
      config: {
        notificationScanBatchSize: 2,
        notificationScanMaxItems: 3,
      },
    });
    prisma.workflowTask.findMany
      .mockResolvedValueOnce([
        { id: 'task-1', assigneeUserId: 'user-1' },
        { id: 'task-2', assigneeUserId: 'user-2' },
      ])
      .mockResolvedValueOnce([
        { id: 'task-3', assigneeUserId: 'user-3' },
      ]);

    const result = await service.processOverdueScan();

    expect(result).toMatchObject({ scanned: 3, enqueued: 3 });
    expect(prisma.workflowTask.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.workflowTask.findMany.mock.calls[0]?.[0]).toMatchObject({
      take: 2,
      orderBy: { id: 'asc' },
    });
    expect(prisma.workflowTask.findMany.mock.calls[1]?.[0]).toMatchObject({
      take: 1,
      cursor: { id: 'task-2' },
      skip: 1,
      orderBy: { id: 'asc' },
    });
    for (const [keys] of notificationsService.hasInAppNotificationDedupeKey.mock.calls) {
      expect(keys.length).toBeGreaterThan(0);
      expect(keys.length).toBeLessThanOrEqual(2);
    }
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
    prisma.recurringTask.updateMany.mockImplementation(async (query) => ({
      count: query.where.id.in.length,
    }));
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

  it('does not overwrite a monthly review completed after the scan read', async () => {
    const { service, prisma } = createService({ redisFails: true });
    prisma.recurringTask.findMany.mockResolvedValue([
      {
        id: 'recurring-task-raced-to-complete',
        projectId: 'project-1',
        reviewerId: 'user-1',
        periodLabel: '2026-03',
        dueAt: new Date('2026-03-18T23:59:59.999Z'),
        status: RecurringTaskStatus.PENDING,
      },
    ]);
    prisma.recurringTask.updateMany.mockResolvedValue({ count: 0 });

    const now = new Date('2026-03-19T08:00:00.000Z');
    const result = await service.processMonthlyReviewSchedule(now);

    expect(prisma.recurringTask.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['recurring-task-raced-to-complete'] },
        dueAt: { lt: now },
        status: {
          in: [
            RecurringTaskStatus.PENDING,
            RecurringTaskStatus.IN_PROGRESS,
          ],
        },
      },
      data: {
        status: RecurringTaskStatus.OVERDUE,
      },
    });
    expect(result.markedOverdue).toBe(0);
    expect(result.enqueued).toBe(0);
  });

  it('bounds monthly-review updates and dedupe lookups to cursor batches', async () => {
    const { service, prisma, notificationsService } = createService({
      redisFails: true,
      config: {
        notificationScanBatchSize: 2,
        notificationScanMaxItems: 3,
      },
    });
    const monthlyTask = (id: string) => ({
      id,
      projectId: 'project-1',
      reviewerId: `reviewer-${id}`,
      periodLabel: '2026-03',
      dueAt: new Date('2026-03-18T23:59:59.999Z'),
      status: RecurringTaskStatus.PENDING,
    });
    prisma.recurringTask.findMany
      .mockResolvedValueOnce([monthlyTask('task-1'), monthlyTask('task-2')])
      .mockResolvedValueOnce([monthlyTask('task-3')]);
    prisma.recurringTask.updateMany.mockImplementation(async (query) => ({
      count: query.where.id.in.length,
    }));

    const result = await service.processMonthlyReviewSchedule(
      new Date('2026-03-19T08:00:00.000Z'),
    );

    expect(result).toMatchObject({ scanned: 3, markedOverdue: 3, enqueued: 3 });
    expect(prisma.recurringTask.findMany).toHaveBeenCalledTimes(2);
    for (const [query] of prisma.recurringTask.updateMany.mock.calls) {
      expect(query.where.id.in.length).toBeLessThanOrEqual(2);
    }
    for (const [keys] of notificationsService.hasInAppNotificationDedupeKey.mock.calls) {
      expect(keys.length).toBeGreaterThan(0);
      expect(keys.length).toBeLessThanOrEqual(2);
    }
  });

  it('catches scheduled Promise rejections without logging job data', async () => {
    vi.useFakeTimers();
    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { service } = createService({
      config: {
        notificationQueueEnabled: true,
        notificationQueuePollMs: 5,
        notificationOverdueScanMs: 7,
      },
    });
    vi.spyOn(service, 'processPendingJobs').mockRejectedValue(new Error('private-job-data'));
    vi.spyOn(service, 'processOverdueScan').mockRejectedValue(new Error('private-job-data'));
    vi.spyOn(service, 'processDueReminderScan').mockRejectedValue(new Error('private-job-data'));
    vi.spyOn(service, 'processMonthlyReviewSchedule').mockRejectedValue(
      new Error('private-job-data'),
    );

    try {
      service.onModuleInit();
      await vi.advanceTimersByTimeAsync(7);
      expect(errorSpy).toHaveBeenCalledTimes(4);
      expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('private-job-data');
    } finally {
      service.onModuleDestroy();
      vi.useRealTimers();
    }
  });
});
