import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AuthenticatedRequest } from '../modules/auth/auth.types';
import { API_UPLOAD_MAX_CONCURRENT_REQUESTS } from './upload-security.constants';

export type UploadAdmissionLease = {
  release(): void;
};

export const UPLOAD_RATE_TRACKER_MAX_ACTORS = 10_000;

export class UploadAdmissionRejectedException extends HttpException {
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
 * Per-process upload admission control.
 *
 * The lease is acquired from the authenticated request before Multer starts
 * consuming multipart bytes, and it remains held through scanner, storage and
 * database work. The counters are intentionally synchronous because one Node
 * process has a single event loop; multi-process deployments must account for
 * the configured limit once per API process.
 */
@Injectable()
export class UploadAdmissionService {
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
      'uploadAdmissionGlobalLimit',
      4,
      1,
      API_UPLOAD_MAX_CONCURRENT_REQUESTS,
    );
    this.perActorLimit = this.readLimit(
      configService,
      'uploadAdmissionPerActorLimit',
      2,
      1,
      4,
    );
    this.perTargetLimit = this.readLimit(
      configService,
      'uploadAdmissionPerTargetLimit',
      3,
      1,
      API_UPLOAD_MAX_CONCURRENT_REQUESTS,
    );
    this.rateMaxRequests = this.readLimit(
      configService,
      'uploadAdmissionRateMaxRequests',
      6,
      1,
      60,
    );
    this.rateWindowMs = this.readLimit(
      configService,
      'uploadAdmissionRateWindowMs',
      60_000,
      1_000,
      300_000,
    );

    if (this.perActorLimit > this.globalLimit) {
      throw new Error(
        'uploadAdmissionPerActorLimit must not exceed uploadAdmissionGlobalLimit.',
      );
    }
  }

  acquire(request: AuthenticatedRequest): UploadAdmissionLease {
    const actorId = request.authUser?.id?.trim();

    if (!actorId) {
      throw new UnauthorizedException(
        '上传准入要求先完成身份认证，请重新登录后重试。',
      );
    }

    const targetKey = this.resolveTargetKey(request);
    const actorActive = this.activeByActor.get(actorId) ?? 0;
    const targetActive = targetKey
      ? this.activeByTarget.get(targetKey) ?? 0
      : 0;

    if (actorActive >= this.perActorLimit) {
      throw new UploadAdmissionRejectedException(
        'UPLOAD_PER_ACTOR_CONCURRENCY_LIMIT',
        '当前账号已有过多上传请求，请稍后重试。',
        1,
      );
    }

    if (targetKey && targetActive >= this.perTargetLimit) {
      throw new UploadAdmissionRejectedException(
        'UPLOAD_PER_TARGET_CONCURRENCY_LIMIT',
        '当前上传目标已有过多上传请求，请稍后重试。',
        1,
      );
    }

    if (this.activeGlobal >= this.globalLimit) {
      throw new UploadAdmissionRejectedException(
        'UPLOAD_GLOBAL_CONCURRENCY_LIMIT',
        '当前服务已有过多上传请求，请稍后重试。',
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
      this.admittedAtByActor.size >= UPLOAD_RATE_TRACKER_MAX_ACTORS
    ) {
      this.pruneExpiredRateEntries(now);
    }
    if (
      !this.admittedAtByActor.has(actorId) &&
      this.admittedAtByActor.size >= UPLOAD_RATE_TRACKER_MAX_ACTORS
    ) {
      throw new UploadAdmissionRejectedException(
        'UPLOAD_RATE_TRACKER_CAPACITY',
        '上传准入记录已达到安全上限，请稍后重试。',
        Math.max(1, Math.ceil(this.rateWindowMs / 1000)),
      );
    }
    const actorAdmissions = (this.admittedAtByActor.get(actorId) ?? []).filter(
      (admittedAt) => now - admittedAt < this.rateWindowMs,
    );
    if (actorAdmissions.length >= this.rateMaxRequests) {
      const retryAfterMs = this.rateWindowMs - (now - actorAdmissions[0]!);
      this.admittedAtByActor.set(actorId, actorAdmissions);
      throw new UploadAdmissionRejectedException(
        'UPLOAD_RATE_LIMIT',
        '当前账号上传频率过高，请稍后重试。',
        Math.max(1, Math.ceil(retryAfterMs / 1000)),
      );
    }

    this.activeGlobal += 1;
    this.activeByActor.set(actorId, actorActive + 1);
    if (targetKey) {
      this.activeByTarget.set(targetKey, targetActive + 1);
    }
    actorAdmissions.push(now);
    this.admittedAtByActor.set(actorId, actorAdmissions);
    let released = false;

    return {
      release: () => {
        if (released) return;
        released = true;

        this.activeGlobal = Math.max(0, this.activeGlobal - 1);
        const currentActorActive = this.activeByActor.get(actorId) ?? 0;
        if (currentActorActive <= 1) {
          this.activeByActor.delete(actorId);
        } else {
          this.activeByActor.set(actorId, currentActorActive - 1);
        }

        if (targetKey) {
          const currentTargetActive = this.activeByTarget.get(targetKey) ?? 0;
          if (currentTargetActive <= 1) {
            this.activeByTarget.delete(targetKey);
          } else {
            this.activeByTarget.set(targetKey, currentTargetActive - 1);
          }
        }
      },
    };
  }

  private resolveTargetKey(request: AuthenticatedRequest) {
    for (const key of ['projectId', 'taskId'] as const) {
      const value = request.params?.[key];
      if (typeof value === 'string' && value.trim()) {
        return `${key}:${value.trim().slice(0, 128)}`;
      }
    }

    return null;
  }

  private pruneExpiredRateEntries(now: number) {
    for (const [actorId, admissions] of this.admittedAtByActor) {
      const recent = admissions.filter(
        (admittedAt) => now - admittedAt < this.rateWindowMs,
      );
      if (recent.length === 0) {
        this.admittedAtByActor.delete(actorId);
      } else if (recent.length !== admissions.length) {
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
