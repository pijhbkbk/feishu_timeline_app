import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  NotificationType,
  RecurringTaskStatus,
  WorkflowTaskStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';
import { NotificationsService } from '../notifications/notifications.service';
import type {
  NotificationQueueJob,
  NotificationQueueJobInput,
} from './notification-queue.types';

const QUEUE_KEY = 'notifications:jobs';

@Injectable()
export class NotificationQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationQueueService.name);
  private readonly memoryQueue: NotificationQueueJob[] = [];
  private workerTimer: NodeJS.Timeout | null = null;
  private overdueScanTimer: NodeJS.Timeout | null = null;
  private monthlyReviewScanTimer: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    const queueEnabled = this.configService.get<boolean>('notificationQueueEnabled') ?? true;

    if (!queueEnabled) {
      return;
    }

    const pollMs = this.configService.get<number>('notificationQueuePollMs') ?? 5000;
    const scanMs = this.configService.get<number>('notificationOverdueScanMs') ?? 300000;

    this.workerTimer = setInterval(() => {
      void this.processPendingJobs();
    }, pollMs);
    this.workerTimer.unref();

    this.overdueScanTimer = setInterval(() => {
      void this.processOverdueScan();
    }, scanMs);
    this.overdueScanTimer.unref();

    this.monthlyReviewScanTimer = setInterval(() => {
      void this.processMonthlyReviewSchedule();
      void this.processDueReminderScan();
    }, scanMs);
    this.monthlyReviewScanTimer.unref();
  }

  onModuleDestroy() {
    if (this.workerTimer) {
      clearInterval(this.workerTimer);
    }

    if (this.overdueScanTimer) {
      clearInterval(this.overdueScanTimer);
    }

    if (this.monthlyReviewScanTimer) {
      clearInterval(this.monthlyReviewScanTimer);
    }
  }

  async enqueue(input: NotificationQueueJobInput) {
    const job = this.buildJob(input);

    try {
      await this.redisService.execute((client) => client.lpush(QUEUE_KEY, JSON.stringify(job)));
      return {
        queued: true,
        channel: 'redis' as const,
        jobId: job.id,
      };
    } catch (error) {
      this.logger.warn(`Redis queue unavailable, fallback to memory queue: ${String(error)}`);
      this.memoryQueue.unshift(job);

      return {
        queued: true,
        channel: 'memory' as const,
        jobId: job.id,
      };
    }
  }

  async enqueueTaskNotification(
    taskId: string,
    type: NotificationType,
    triggeredByUserId?: string | null,
  ) {
    return this.enqueue({
      type,
      taskId,
      projectId: null,
      userId: null,
      title: null,
      content: null,
      linkPath: null,
      triggeredByUserId: triggeredByUserId ?? null,
    });
  }

  async processPendingJobs() {
    if (this.isProcessing) {
      return { processed: 0 };
    }

    this.isProcessing = true;
    let processed = 0;

    try {
      while (processed < 20) {
        const job = await this.dequeue();

        if (!job) {
          break;
        }

        if (new Date(job.availableAt).getTime() > Date.now()) {
          await this.requeue(job);
          break;
        }

        try {
          await this.notificationsService.processQueuedNotification(job);
        } catch (error) {
          await this.handleJobFailure(job, error);
        }

        processed += 1;
      }
    } finally {
      this.isProcessing = false;
    }

    return { processed };
  }

  async processOverdueScan() {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const overdueTasks = await this.prisma.workflowTask.findMany({
      where: {
        isActive: true,
        assigneeUserId: {
          not: null,
        },
        dueAt: {
          lt: now,
        },
        status: {
          in: [
            WorkflowTaskStatus.PENDING,
            WorkflowTaskStatus.READY,
            WorkflowTaskStatus.IN_PROGRESS,
            WorkflowTaskStatus.RETURNED,
          ],
        },
      },
      select: {
        id: true,
        assigneeUserId: true,
      },
    });

    const dedupeKeys = overdueTasks
      .filter((task) => task.assigneeUserId)
      .map((task) =>
        [
          NotificationType.TASK_OVERDUE,
          task.assigneeUserId,
          task.id,
          now.toISOString().slice(0, 10),
        ].join(':'),
      );

    const existingKeys = await this.notificationsService.hasInAppNotificationDedupeKey(
      dedupeKeys,
    );

    let enqueued = 0;

    for (const task of overdueTasks) {
      if (!task.assigneeUserId) {
        continue;
      }

      const dedupeKey = [
        NotificationType.TASK_OVERDUE,
        task.assigneeUserId,
        task.id,
        now.toISOString().slice(0, 10),
      ].join(':');

      if (existingKeys.has(dedupeKey)) {
        continue;
      }

      await this.enqueue({
        type: NotificationType.TASK_OVERDUE,
        taskId: task.id,
        projectId: null,
        userId: task.assigneeUserId,
        title: null,
        content: null,
        linkPath: null,
        triggeredByUserId: null,
        metadata: {
          dedupeKey,
          scannedAt: startOfDay.toISOString(),
        },
      });

      enqueued += 1;
    }

    return {
      scanned: overdueTasks.length,
      enqueued,
    };
  }

  async processDueReminderScan(now = new Date()) {
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const dueTodayTasks = await this.prisma.workflowTask.findMany({
      where: {
        isActive: true,
        assigneeUserId: {
          not: null,
        },
        dueAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
        status: {
          in: [
            WorkflowTaskStatus.PENDING,
            WorkflowTaskStatus.READY,
            WorkflowTaskStatus.IN_PROGRESS,
            WorkflowTaskStatus.RETURNED,
          ],
        },
      },
      select: {
        id: true,
        projectId: true,
        assigneeUserId: true,
        nodeCode: true,
        nodeName: true,
      },
    });

    const dedupeKeys = dueTodayTasks
      .filter((task) => task.assigneeUserId)
      .map((task) =>
        [NotificationType.SYSTEM_INFO, task.assigneeUserId, task.id, now.toISOString().slice(0, 10), 'due'].join(':'),
      );

    const existingKeys = await this.notificationsService.hasInAppNotificationDedupeKey(
      dedupeKeys,
    );

    let enqueued = 0;

    for (const task of dueTodayTasks) {
      if (!task.assigneeUserId) {
        continue;
      }

      const dedupeKey = [
        NotificationType.SYSTEM_INFO,
        task.assigneeUserId,
        task.id,
        now.toISOString().slice(0, 10),
        'due',
      ].join(':');

      if (existingKeys.has(dedupeKey)) {
        continue;
      }

      await this.enqueue({
        type: NotificationType.SYSTEM_INFO,
        taskId: task.id,
        projectId: task.projectId,
        userId: task.assigneeUserId,
        title: `${task.nodeName} 今日到期`,
        content: `${task.nodeName} 将于今日到期，请及时处理。`,
        linkPath: `/projects/${task.projectId}/workflow`,
        triggeredByUserId: null,
        metadata: {
          dedupeKey,
          notificationCategory: 'due-reminder',
          nodeCode: task.nodeCode,
        },
      });

      enqueued += 1;
    }

    return {
      scanned: dueTodayTasks.length,
      enqueued,
    };
  }

  async processMonthlyReviewSchedule(now = new Date()) {
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const recurringTasks = await this.prisma.recurringTask.findMany({
      where: {
        reviewerId: {
          not: null,
        },
        plannedDate: {
          lte: startOfDay,
        },
        status: {
          in: [
            RecurringTaskStatus.PENDING,
            RecurringTaskStatus.IN_PROGRESS,
            RecurringTaskStatus.OVERDUE,
          ],
        },
      },
      select: {
        id: true,
        projectId: true,
        reviewerId: true,
        periodLabel: true,
        dueAt: true,
        status: true,
      },
    });

    const overdueIds = recurringTasks
      .filter(
        (task) =>
          task.status !== RecurringTaskStatus.OVERDUE &&
          task.dueAt !== null &&
          task.dueAt.getTime() < now.getTime(),
      )
      .map((task) => task.id);

    if (overdueIds.length > 0) {
      await this.prisma.recurringTask.updateMany({
        where: {
          id: {
            in: overdueIds,
          },
        },
        data: {
          status: RecurringTaskStatus.OVERDUE,
        },
      });
    }

    const dedupeKeys = recurringTasks
      .filter((task) => task.reviewerId)
      .map((task) =>
        [
          NotificationType.SYSTEM_INFO,
          task.reviewerId,
          task.id,
          now.toISOString().slice(0, 10),
          'monthly-review',
        ].join(':'),
      );

    const existingKeys = await this.notificationsService.hasInAppNotificationDedupeKey(
      dedupeKeys,
    );

    let enqueued = 0;

    for (const task of recurringTasks) {
      if (!task.reviewerId) {
        continue;
      }

      const dedupeKey = [
        NotificationType.SYSTEM_INFO,
        task.reviewerId,
        task.id,
        now.toISOString().slice(0, 10),
        'monthly-review',
      ].join(':');

      if (existingKeys.has(dedupeKey)) {
        continue;
      }

      const isOverdue = overdueIds.includes(task.id) || task.status === RecurringTaskStatus.OVERDUE;

      await this.enqueue({
        type: NotificationType.SYSTEM_INFO,
        taskId: null,
        projectId: task.projectId,
        userId: task.reviewerId,
        title: isOverdue ? '月度评审已超期' : '月度评审待处理',
        content: isOverdue
          ? `${task.periodLabel} 的整车色差一致性评审已超期，请尽快处理。`
          : `${task.periodLabel} 的整车色差一致性评审已到计划时间，请及时处理。`,
        linkPath: `/projects/${task.projectId}/workflow`,
        triggeredByUserId: null,
        metadata: {
          dedupeKey,
          notificationCategory: 'monthly-review',
          recurringTaskId: task.id,
          periodLabel: task.periodLabel,
        },
      });

      enqueued += 1;
    }

    return {
      scanned: recurringTasks.length,
      markedOverdue: overdueIds.length,
      enqueued,
    };
  }

  private buildJob(input: NotificationQueueJobInput): NotificationQueueJob {
    return {
      id: randomUUID(),
      type: input.type,
      taskId: input.taskId ?? null,
      projectId: input.projectId ?? null,
      userId: input.userId ?? null,
      title: input.title ?? null,
      content: input.content ?? null,
      linkPath: input.linkPath ?? null,
      triggeredByUserId: input.triggeredByUserId ?? null,
      retryCount: input.retryCount ?? 0,
      availableAt: input.availableAt ?? new Date().toISOString(),
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
    };
  }

  private async dequeue() {
    try {
      const raw = await this.redisService.execute((client) => client.rpop(QUEUE_KEY));

      if (raw) {
        return JSON.parse(raw) as NotificationQueueJob;
      }
    } catch (error) {
      this.logger.warn(`Redis dequeue failed, fallback to memory queue: ${String(error)}`);
    }

    return this.memoryQueue.pop() ?? null;
  }

  private async requeue(job: NotificationQueueJob) {
    try {
      await this.redisService.execute((client) => client.rpush(QUEUE_KEY, JSON.stringify(job)));
      return;
    } catch (error) {
      this.logger.warn(`Redis requeue failed, fallback to memory queue: ${String(error)}`);
    }

    this.memoryQueue.unshift(job);
  }

  private async handleJobFailure(job: NotificationQueueJob, error: unknown) {
    const maxRetries = this.configService.get<number>('notificationMaxRetries') ?? 3;
    const retryDelayMs = this.configService.get<number>('notificationRetryDelayMs') ?? 5000;

    if (job.retryCount + 1 >= maxRetries) {
      this.logger.error(
        `Notification job dropped after ${job.retryCount + 1} attempts: ${String(error)}`,
      );
      return;
    }

    const nextJob: NotificationQueueJob = {
      ...job,
      retryCount: job.retryCount + 1,
      availableAt: new Date(Date.now() + retryDelayMs).toISOString(),
    };

    await this.requeue(nextJob);
  }
}
