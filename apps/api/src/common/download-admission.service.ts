import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AuthenticatedRequest } from '../modules/auth/auth.types';

export type DownloadAdmissionLease = { release(): void };

export const DOWNLOAD_RATE_TRACKER_MAX_ACTORS = 10_000;

export class DownloadAdmissionRejectedException extends HttpException {
  constructor(
    code: string,
    message: string,
    readonly retryAfterSeconds: number,
  ) {
    super(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: 'Too Many Requests',
        code,
        message,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

/**
 * Per-process admission for authenticated attachment downloads. The HTTP
 * lifecycle owns each lease, so a slow or aborted client consumes capacity
 * until both its transport and object stream have terminated.
 */
@Injectable()
export class DownloadAdmissionService {
  private readonly globalLimit: number;
  private readonly perActorLimit: number;
  private readonly perTargetLimit: number;
  private readonly rateMaxRequests: number;
  private readonly rateWindowMs: number;
  private activeGlobal = 0;
  private readonly activeByActor = new Map<string, number>();
  private readonly activeByTarget = new Map<string, number>();
  private readonly admittedAtByActor = new Map<string, number[]>();
  private lastRateSweepAt = 0;

  constructor(@Inject(ConfigService) configService: ConfigService) {
    this.globalLimit = this.readLimit(
      configService,
      'downloadAdmissionGlobalLimit',
      8,
      1,
      32,
    );
    this.perActorLimit = this.readLimit(
      configService,
      'downloadAdmissionPerActorLimit',
      2,
      1,
      8,
    );
    this.perTargetLimit = this.readLimit(
      configService,
      'downloadAdmissionPerTargetLimit',
      2,
      1,
      8,
    );
    this.rateMaxRequests = this.readLimit(
      configService,
      'downloadAdmissionRateMaxRequests',
      12,
      1,
      120,
    );
    this.rateWindowMs = this.readLimit(
      configService,
      'downloadAdmissionRateWindowMs',
      60_000,
      1_000,
      300_000,
    );

    if (this.perActorLimit > this.globalLimit) {
      throw new Error(
        'downloadAdmissionPerActorLimit must not exceed downloadAdmissionGlobalLimit.',
      );
    }
    if (this.perTargetLimit > this.globalLimit) {
      throw new Error(
        'downloadAdmissionPerTargetLimit must not exceed downloadAdmissionGlobalLimit.',
      );
    }
  }

  acquire(request: AuthenticatedRequest): DownloadAdmissionLease {
    const actorId = request.authUser?.id?.trim();
    if (!actorId) {
      throw new UnauthorizedException(
        '下载准入要求先完成身份认证，请重新登录后重试。',
      );
    }

    const targetKey = this.resolveTargetKey(request);
    const actorActive = this.activeByActor.get(actorId) ?? 0;
    const targetActive = this.activeByTarget.get(targetKey) ?? 0;

    if (actorActive >= this.perActorLimit) {
      throw new DownloadAdmissionRejectedException(
        'DOWNLOAD_PER_ACTOR_CONCURRENCY_LIMIT',
        '当前账号已有过多下载请求，请稍后重试。',
        1,
      );
    }
    if (targetActive >= this.perTargetLimit) {
      throw new DownloadAdmissionRejectedException(
        'DOWNLOAD_PER_TARGET_CONCURRENCY_LIMIT',
        '当前附件已有过多下载请求，请稍后重试。',
        1,
      );
    }
    if (this.activeGlobal >= this.globalLimit) {
      throw new DownloadAdmissionRejectedException(
        'DOWNLOAD_GLOBAL_CONCURRENCY_LIMIT',
        '当前服务已有过多下载请求，请稍后重试。',
        1,
      );
    }

    const now = Date.now();
    const sweepIntervalMs = Math.min(this.rateWindowMs, 10_000);
    if (now - this.lastRateSweepAt >= sweepIntervalMs) {
      this.pruneExpiredRateEntries(now);
    }
    if (
      !this.admittedAtByActor.has(actorId) &&
      this.admittedAtByActor.size >= DOWNLOAD_RATE_TRACKER_MAX_ACTORS
    ) {
      this.pruneExpiredRateEntries(now);
    }
    if (
      !this.admittedAtByActor.has(actorId) &&
      this.admittedAtByActor.size >= DOWNLOAD_RATE_TRACKER_MAX_ACTORS
    ) {
      throw new DownloadAdmissionRejectedException(
        'DOWNLOAD_RATE_TRACKER_CAPACITY',
        '下载准入记录已达到安全上限，请稍后重试。',
        Math.max(1, Math.ceil(this.rateWindowMs / 1000)),
      );
    }

    const actorAdmissions = (this.admittedAtByActor.get(actorId) ?? []).filter(
      (admittedAt) => now - admittedAt < this.rateWindowMs,
    );
    if (actorAdmissions.length >= this.rateMaxRequests) {
      const retryAfterMs = this.rateWindowMs - (now - actorAdmissions[0]!);
      this.admittedAtByActor.set(actorId, actorAdmissions);
      throw new DownloadAdmissionRejectedException(
        'DOWNLOAD_RATE_LIMIT',
        '当前账号下载频率过高，请稍后重试。',
        Math.max(1, Math.ceil(retryAfterMs / 1000)),
      );
    }

    this.activeGlobal += 1;
    this.activeByActor.set(actorId, actorActive + 1);
    this.activeByTarget.set(targetKey, targetActive + 1);
    actorAdmissions.push(now);
    this.admittedAtByActor.set(actorId, actorAdmissions);
    let released = false;

    return {
      release: () => {
        if (released) return;
        released = true;
        this.activeGlobal = Math.max(0, this.activeGlobal - 1);
        this.decrement(this.activeByActor, actorId);
        this.decrement(this.activeByTarget, targetKey);
      },
    };
  }

  private resolveTargetKey(request: AuthenticatedRequest) {
    const attachmentId = request.params?.attachmentId;
    if (typeof attachmentId !== 'string' || !attachmentId.trim()) {
      throw new DownloadAdmissionRejectedException(
        'DOWNLOAD_TARGET_REQUIRED',
        '下载目标无效，请刷新页面后重试。',
        1,
      );
    }
    return `attachmentId:${attachmentId.trim().slice(0, 128)}`;
  }

  private decrement(counter: Map<string, number>, key: string) {
    const current = counter.get(key) ?? 0;
    if (current <= 1) counter.delete(key);
    else counter.set(key, current - 1);
  }

  private pruneExpiredRateEntries(now: number) {
    for (const [actorId, admissions] of this.admittedAtByActor) {
      const recent = admissions.filter(
        (admittedAt) => now - admittedAt < this.rateWindowMs,
      );
      if (recent.length === 0) this.admittedAtByActor.delete(actorId);
      else if (recent.length !== admissions.length) {
        this.admittedAtByActor.set(actorId, recent);
      }
    }
    this.lastRateSweepAt = now;
  }

  private readLimit(
    configService: ConfigService,
    key: string,
    fallback: number,
    minimum: number,
    maximum: number,
  ) {
    const value = configService.get<number>(key) ?? fallback;
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
      throw new Error(`${key} must be an integer between ${minimum} and ${maximum}.`);
    }
    return value;
  }
}
