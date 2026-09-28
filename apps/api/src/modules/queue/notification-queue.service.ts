import { TaskRemindersService } from '../notifications/task-reminders.service';
import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  NotificationType,
} from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';

import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';
import {
  NOTIFICATION_LINK_PATH_INVALID,
  NotificationLinkPathValidationError,
  normalizeNotificationLinkPathForWrite,
  parseNotificationLinkPath,
} from '../notifications/notification-link-path.rules';
import { NotificationsService } from '../notifications/notifications.service';
import type {
  NotificationQueueJob,
  NotificationQueueJobInput,
} from './notification-queue.types';

const QUEUE_KEY = 'notifications:jobs';
const QUEUE_DEDUPE_TTL_SECONDS = 2 * 24 * 60 * 60;
const MEMORY_DEDUPE_SWEEP_INTERVAL_MS = 60 * 1000;
const DEFAULT_MEMORY_QUEUE_MAX_JOBS = 1000;
const DEFAULT_MEMORY_DEDUPE_MAX_KEYS = 5000;
const DEFAULT_REDIS_QUEUE_MAX_JOBS = 2000;
const DEFAULT_JOB_MAX_BYTES = 65536;
const DEFAULT_SCAN_BATCH_SIZE = 100;
const DEFAULT_SCAN_MAX_ITEMS = 1000;
const ENQUEUE_SCRIPT = `
if redis.call('LLEN', KEYS[1]) >= tonumber(ARGV[1]) then
  return 0
end
redis.call('LPUSH', KEYS[1], ARGV[2])
return 1
`;
const REQUEUE_SCRIPT = `
if redis.call('LLEN', KEYS[1]) >= tonumber(ARGV[1]) then
  return 0
end
redis.call('RPUSH', KEYS[1], ARGV[2])
return 1
`;
const ENQUEUE_ONCE_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 1 then
  return 0
end
if redis.call('LLEN', KEYS[2]) >= tonumber(ARGV[2]) then
  return -1
end
redis.call('LPUSH', KEYS[2], ARGV[3])
redis.call('SET', KEYS[1], '1', 'EX', ARGV[1])
return 1
`;

type NotificationQueueChannel = 'redis' | 'memory';

type NotificationQueueDequeueResult =
  | { kind: 'empty' }
  | { kind: 'invalid' }
  | {
      kind: 'job';
      job: NotificationQueueJob;
      queueChannel: NotificationQueueChannel;
    };

@Injectable()
export class NotificationQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationQueueService.name);
  private readonly memoryQueue: string[] = [];
  private readonly memoryDedupeKeys = new Map<string, number>();
  private workerTimer: NodeJS.Timeout | null = null;
  private overdueScanTimer: NodeJS.Timeout | null = null;
  private monthlyReviewScanTimer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private isOverdueScanProcessing = false;
  private isDueReminderScanProcessing = false;
  private isMonthlyReviewScanProcessing = false;
  private stopping = false;
  private nextMemoryDedupeSweepAt = 0;

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
      this.runScheduledTask('process_pending_jobs', () => this.processPendingJobs());
    }, pollMs);
    this.workerTimer.unref();

    this.overdueScanTimer = setInterval(() => {
      this.runScheduledTask('process_overdue_scan', () => this.processOverdueScan());
    }, scanMs);
    this.overdueScanTimer.unref();

    this.monthlyReviewScanTimer = setInterval(() => {
      this.runScheduledTask(
        'process_monthly_review_schedule',
        () => this.processMonthlyReviewSchedule(),
      );
      this.runScheduledTask('process_due_reminder_scan', () =>
        this.processDueReminderScan(),
      );
    }, scanMs);
    this.monthlyReviewScanTimer.unref();
  }

  onModuleDestroy() {
    this.stopping = true;
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

  /** Stop timers before HTTP drain; an already dequeued job must finish/requeue. */
  beginShutdown() { this.onModuleDestroy(); }

  isShutdownIdle() {
    return !this.isProcessing && !this.isOverdueScanProcessing &&
      !this.isDueReminderScanProcessing && !this.isMonthlyReviewScanProcessing &&
      this.memoryQueue.length === 0;
  }

  async enqueue(input: NotificationQueueJobInput) {
    const linkPath = this.normalizeIngressLinkPath(input.linkPath);
    const job = this.buildJob(input, linkPath);
    const serialized = this.serializeJob(job);

    if (serialized === null) {
      return this.jobTooLargeResult();
    }

    try {
      const result = await this.redisService.execute((client) =>
        client.eval(
          ENQUEUE_SCRIPT,
          1,
          QUEUE_KEY,
          String(this.redisQueueMaxJobs),
          serialized,
        ),
      );
      return this.redisInsertResult(result, job.id, 'enqueue');
    } catch {
      this.logger.warn(
        'eventType=notification_queue operation=enqueue result=memory_fallback',
      );
      return this.insertMemoryJob(job.id, serialized);
    }
  }

  private async enqueueOnce(input: NotificationQueueJobInput, dedupeKey: string) {
    const linkPath = this.normalizeIngressLinkPath(input.linkPath);
    const job = this.buildJob(input, linkPath);
    const serialized = this.serializeJob(job);

    if (serialized === null) {
      return {
        ...this.jobTooLargeResult(),
        duplicate: false,
      };
    }

    const markerKey = `notifications:queued:${createHash('sha256').update(dedupeKey).digest('hex')}`;

    try {
      const result = await this.redisService.execute((client) =>
        client.eval(
          ENQUEUE_ONCE_SCRIPT,
          2,
          markerKey,
          QUEUE_KEY,
          String(QUEUE_DEDUPE_TTL_SECONDS),
          String(this.redisQueueMaxJobs),
          serialized,
        ),
      );
      const admission = Number(result);

      if (admission === 1) {
        return {
          queued: true,
          duplicate: false,
          channel: 'redis' as const,
          jobId: job.id,
        };
      }

      if (admission === 0) {
        return {
          queued: false,
          duplicate: true,
          channel: 'redis' as const,
          jobId: null,
        };
      }

      if (admission === -1) {
        return {
          ...this.redisQueueFullResult('enqueue_once'),
          duplicate: false,
        };
      }

      this.logger.error(
        'eventType=notification_queue operation=enqueue_once result=dropped reason=unexpected_redis_result',
      );
      return {
        queued: false,
        duplicate: false,
        channel: 'redis' as const,
        jobId: null,
        reason: 'unexpected_redis_result' as const,
      };
    } catch {
      this.logger.warn(
        'eventType=notification_queue operation=enqueue_once result=memory_fallback',
      );
      const now = Date.now();
      const existingExpiry = this.memoryDedupeKeys.get(markerKey) ?? 0;
      if (existingExpiry > now) {
        return {
          queued: false,
          duplicate: true,
          channel: 'memory' as const,
          jobId: null,
        };
      }

      if (existingExpiry > 0) {
        this.memoryDedupeKeys.delete(markerKey);
      }

      this.sweepExpiredMemoryDedupeKeys(now);
      const dedupeCapacity = this.memoryDedupeMaxKeys;
      if (this.memoryDedupeKeys.size >= dedupeCapacity) {
        this.sweepExpiredMemoryDedupeKeys(now, true);
      }

      if (this.memoryDedupeKeys.size >= dedupeCapacity) {
        this.logger.warn(
          'eventType=notification_queue operation=enqueue_once result=dropped reason=memory_dedupe_full',
        );
        return {
          queued: false,
          duplicate: false,
          channel: 'memory' as const,
          jobId: null,
          reason: 'memory_dedupe_full' as const,
        };
      }

      const admission = this.insertMemoryJob(job.id, serialized);
      if (!admission.queued) {
        return {
          ...admission,
          duplicate: false,
        };
      }

      this.memoryDedupeKeys.set(
        markerKey,
        now + QUEUE_DEDUPE_TTL_SECONDS * 1000,
      );
      return {
        ...admission,
        duplicate: false,
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
    if (this.stopping || this.isProcessing) {
      return { processed: 0 };
    }

    this.isProcessing = true;
    let processed = 0;
    let inspected = 0;

    try {
      while (!this.stopping && inspected < 20) {
        const dequeued = await this.dequeue();

        if (dequeued.kind === 'empty') {
          break;
        }

        inspected += 1;

        if (dequeued.kind === 'invalid') {
          continue;
        }

        const { job, queueChannel } = dequeued;

        if (new Date(job.availableAt).getTime() > Date.now()) {
          await this.requeue(job);
          break;
        }

        try {
          await this.notificationsService.processQueuedNotification(job);
        } catch (error) {
          if (error instanceof NotificationLinkPathValidationError) {
            this.logTerminalInvalidJob(
              NOTIFICATION_LINK_PATH_INVALID,
              queueChannel,
              job.id,
            );
          } else {
            await this.handleJobFailure(job);
          }
        }

        processed += 1;
      }
    } finally {
      this.isProcessing = false;
    }

    return { processed };
  }

  async processOverdueScan(now = new Date()) {
    if (this.stopping || this.isOverdueScanProcessing) return this.skippedScanResult();
    this.isOverdueScanProcessing = true;
    try { return await new TaskRemindersService(this.prisma).scan('ordinary', now); }
    finally { this.isOverdueScanProcessing = false; }
  }

  async processDueReminderScan(now = new Date()) {
    if (this.stopping || this.isDueReminderScanProcessing) return this.skippedScanResult();
    this.isDueReminderScanProcessing = true;
    try { return await new TaskRemindersService(this.prisma).scan('ordinary', now); }
    finally { this.isDueReminderScanProcessing = false; }
  }

  async processMonthlyReviewSchedule(now = new Date()) {
    if (this.stopping || this.isMonthlyReviewScanProcessing) return { ...this.skippedScanResult(), markedOverdue: 0 };
    this.isMonthlyReviewScanProcessing = true;
    try { return await new TaskRemindersService(this.prisma).scan('monthly', now); }
    finally { this.isMonthlyReviewScanProcessing = false; }
  }

  private runScheduledTask(
    operation: string,
    task: () => Promise<unknown>,
  ) {
    void Promise.resolve()
      .then(task)
      .catch(() => {
        this.logger.error(
          `eventType=notification_queue operation=${operation} result=failed`,
        );
      });
  }

  private serializeJob(job: NotificationQueueJob) {
    let serialized: string;

    try {
      serialized = JSON.stringify(job);
    } catch {
      this.logger.warn(
        'eventType=notification_queue operation=serialize result=dropped reason=invalid_job',
      );
      return null;
    }

    if (Buffer.byteLength(serialized, 'utf8') > this.jobMaxBytes) {
      this.logger.warn(
        'eventType=notification_queue operation=serialize result=dropped reason=job_too_large',
      );
      return null;
    }

    return serialized;
  }

  private insertMemoryJob(jobId: string, serialized: string) {
    if (Buffer.byteLength(serialized, 'utf8') > this.jobMaxBytes) {
      return this.jobTooLargeResult();
    }

    if (this.memoryQueue.length >= this.memoryQueueMaxJobs) {
      this.logger.warn(
        'eventType=notification_queue operation=memory_admission result=dropped reason=memory_queue_full',
      );
      return {
        queued: false,
        channel: 'memory' as const,
        jobId: null,
        reason: 'memory_queue_full' as const,
      };
    }

    this.memoryQueue.unshift(serialized);
    return {
      queued: true,
      channel: 'memory' as const,
      jobId,
    };
  }

  private jobTooLargeResult() {
    return {
      queued: false,
      channel: 'none' as const,
      jobId: null,
      reason: 'job_too_large' as const,
    };
  }

  private redisInsertResult(
    result: unknown,
    jobId: string,
    operation: 'enqueue' | 'requeue',
  ) {
    const admission = Number(result);

    if (admission === 1) {
      return {
        queued: true,
        channel: 'redis' as const,
        jobId,
      };
    }

    if (admission === 0) {
      return this.redisQueueFullResult(operation);
    }

    this.logger.error(
      `eventType=notification_queue operation=${operation} result=dropped reason=unexpected_redis_result`,
    );
    return {
      queued: false,
      channel: 'redis' as const,
      jobId: null,
      reason: 'unexpected_redis_result' as const,
    };
  }

  private redisQueueFullResult(
    operation: 'enqueue' | 'enqueue_once' | 'requeue',
  ) {
    this.logger.warn(
      `eventType=notification_queue operation=${operation} result=dropped reason=redis_queue_full`,
    );
    return {
      queued: false,
      channel: 'redis' as const,
      jobId: null,
      reason: 'redis_queue_full' as const,
    };
  }

  private sweepExpiredMemoryDedupeKeys(now: number, force = false) {
    if (!force && now < this.nextMemoryDedupeSweepAt) {
      return;
    }

    for (const [markerKey, expiresAt] of this.memoryDedupeKeys) {
      if (expiresAt > now) {
        break;
      }

      this.memoryDedupeKeys.delete(markerKey);
    }

    this.nextMemoryDedupeSweepAt = now + MEMORY_DEDUPE_SWEEP_INTERVAL_MS;
  }

  private skippedScanResult() {
    return {
      scanned: 0,
      enqueued: 0,
      skipped: true,
      reason: 'scan_in_progress' as const,
    };
  }

  private get memoryQueueMaxJobs() {
    return this.configService.get<number>('notificationMemoryQueueMaxJobs') ??
      DEFAULT_MEMORY_QUEUE_MAX_JOBS;
  }

  private get redisQueueMaxJobs() {
    return this.configService.get<number>('notificationRedisQueueMaxJobs') ??
      DEFAULT_REDIS_QUEUE_MAX_JOBS;
  }

  private get memoryDedupeMaxKeys() {
    return this.configService.get<number>('notificationMemoryDedupeMaxKeys') ??
      DEFAULT_MEMORY_DEDUPE_MAX_KEYS;
  }

  private get jobMaxBytes() {
    return this.configService.get<number>('notificationJobMaxBytes') ??
      DEFAULT_JOB_MAX_BYTES;
  }

  private get scanBatchSize() {
    return this.configService.get<number>('notificationScanBatchSize') ??
      DEFAULT_SCAN_BATCH_SIZE;
  }

  private get scanMaxItems() {
    return this.configService.get<number>('notificationScanMaxItems') ??
      DEFAULT_SCAN_MAX_ITEMS;
  }

  private buildJob(
    input: NotificationQueueJobInput,
    linkPath: string | null,
  ): NotificationQueueJob {
    return {
      id: randomUUID(),
      type: input.type,
      taskId: input.taskId ?? null,
      projectId: input.projectId ?? null,
      userId: input.userId ?? null,
      title: input.title ?? null,
      content: input.content ?? null,
      linkPath,
      triggeredByUserId: input.triggeredByUserId ?? null,
      retryCount: input.retryCount ?? 0,
      availableAt: input.availableAt ?? new Date().toISOString(),
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
    };
  }

  private normalizeIngressLinkPath(linkPath: unknown) {
    try {
      return normalizeNotificationLinkPathForWrite(linkPath);
    } catch (error) {
      if (!(error instanceof NotificationLinkPathValidationError)) {
        throw error;
      }

      throw new BadRequestException('通知链接必须是站内绝对路径。');
    }
  }

  private async dequeue(): Promise<NotificationQueueDequeueResult> {
    try {
      const raw = await this.redisService.execute((client) => client.rpop(QUEUE_KEY));

      if (raw) {
        return this.deserializeJob(raw, 'redis');
      }
    } catch {
      this.logger.warn(
        'eventType=notification_queue operation=dequeue result=memory_fallback',
      );
    }

    const memoryJob = this.memoryQueue.pop();
    return memoryJob
      ? this.deserializeJob(memoryJob, 'memory')
      : { kind: 'empty' };
  }

  private deserializeJob(
    serialized: string,
    queueChannel: NotificationQueueChannel,
  ): NotificationQueueDequeueResult {
    if (Buffer.byteLength(serialized, 'utf8') > this.jobMaxBytes) {
      this.logTerminalInvalidJob('job_too_large', queueChannel);
      return { kind: 'invalid' };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(serialized) as unknown;
    } catch {
      this.logTerminalInvalidJob('invalid_job', queueChannel);
      return { kind: 'invalid' };
    }

    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      this.logTerminalInvalidJob('invalid_job', queueChannel);
      return { kind: 'invalid' };
    }

    const record = parsed as Record<string, unknown>;
    const admission = parseNotificationLinkPath(record.linkPath);
    if (!admission.ok) {
      this.logTerminalInvalidJob(
        NOTIFICATION_LINK_PATH_INVALID,
        queueChannel,
        record.id,
      );
      return { kind: 'invalid' };
    }

    return {
      kind: 'job',
      queueChannel,
      job: {
        ...(parsed as NotificationQueueJob),
        linkPath: admission.normalized,
      },
    };
  }

  private logTerminalInvalidJob(
    reason: 'job_too_large' | 'invalid_job' | typeof NOTIFICATION_LINK_PATH_INVALID,
    queueChannel: NotificationQueueChannel,
    jobId: unknown = null,
  ) {
    const jobIdField =
      typeof jobId === 'string'
        ? ` jobIdHash=${createHash('sha256').update(jobId).digest('hex').slice(0, 16)}`
        : '';
    this.logger.warn(
      `eventType=notification_queue operation=dequeue result=dropped reason=${reason} queueChannel=${queueChannel}${jobIdField}`,
    );
  }

  private async requeue(job: NotificationQueueJob) {
    const serialized = this.serializeJob(job);

    if (serialized === null) {
      return this.jobTooLargeResult();
    }

    try {
      const result = await this.redisService.execute((client) =>
        client.eval(
          REQUEUE_SCRIPT,
          1,
          QUEUE_KEY,
          String(this.redisQueueMaxJobs),
          serialized,
        ),
      );
      return this.redisInsertResult(result, job.id, 'requeue');
    } catch {
      this.logger.warn(
        'eventType=notification_queue operation=requeue result=memory_fallback',
      );
    }

    return this.insertMemoryJob(job.id, serialized);
  }

  private async handleJobFailure(job: NotificationQueueJob) {
    const maxRetries = this.configService.get<number>('notificationMaxRetries') ?? 3;
    const retryDelayMs = this.configService.get<number>('notificationRetryDelayMs') ?? 5000;

    if (job.retryCount + 1 >= maxRetries) {
      this.logger.error(
        `eventType=notification_job result=dropped retryCount=${job.retryCount + 1}`,
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
