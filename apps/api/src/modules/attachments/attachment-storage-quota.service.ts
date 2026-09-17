import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AttachmentBinaryState,
  AttachmentScanStatus,
  AuditTargetType,
  Prisma,
  type AttachmentTargetType,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../infra/prisma/prisma.service';
import { ObjectStorageService } from '../../infra/storage/object-storage.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';

const ACTIVE_QUOTA_STATES = [
  AttachmentBinaryState.RESERVED,
  AttachmentBinaryState.RETAINED,
  AttachmentBinaryState.PURGING,
  AttachmentBinaryState.RECONCILIATION_REQUIRED,
] as const;
const QUOTA_LOCK_NAMESPACE = 'feishu-timeline:attachment-storage-quota:v1';
const RECONCILIATION_LOCK_NAMESPACE =
  'feishu-timeline:attachment-storage-reconciliation:v1';

type ReserveAttachmentStorageInput = {
  projectId: string;
  actorUserId: string;
  targetType: AttachmentTargetType;
  targetId: string;
  bucket: string;
  quarantineStorageKey: string;
  cleanStorageKey: string;
  bytes: number;
};

type PurgeReservationInput = {
  reservationId: string;
  reason: string;
  expectedOwnerToken: string;
};

@Injectable()
export class AttachmentStorageQuotaService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(AttachmentStorageQuotaService.name);
  private reconcileTimer: ReturnType<typeof setInterval> | null = null;
  private reconciliationInFlight = false;
  private stopping = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly objectStorageService: ObjectStorageService,
    private readonly activityLogsService: ActivityLogsService,
  ) {}

  onModuleInit() {
    const intervalMs = this.readLimit(
      'attachmentStorageReconcileIntervalMs',
      300_000,
    );
    this.triggerReconciliation();
    this.reconcileTimer = setInterval(
      () => this.triggerReconciliation(),
      intervalMs,
    );
    this.reconcileTimer.unref?.();
  }

  onModuleDestroy() {
    this.stopping = true;
    if (this.reconcileTimer) {
      clearInterval(this.reconcileTimer);
      this.reconcileTimer = null;
    }
  }

  beginShutdown() { this.onModuleDestroy(); }

  isShutdownIdle() { return !this.reconciliationInFlight; }

  async reserve(input: ReserveAttachmentStorageInput) {
    if (!Number.isSafeInteger(input.bytes) || input.bytes <= 0) {
      throw new HttpException(
        {
          code: 'ATTACHMENT_STORAGE_SIZE_INVALID',
          message: '附件存储大小不合法。',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const minFreeBytes = this.readLimit(
      'attachmentStorageMinFreeBytes',
      1_073_741_824,
    );
    try {
      await this.objectStorageService.assertWriteCapacity({
        bytes: input.bytes,
        minFreeBytes,
      });
    } catch {
      throw this.storageCapacityInsufficient();
    }

    const now = new Date();
    const ownerToken = randomUUID();
    const leaseExpiresAt = new Date(
      now.getTime() +
        this.readLimit('attachmentStorageReservationTtlMs', 7_200_000),
    );
    const actorWindowStart = new Date(
      now.getTime() -
        this.readLimit('attachmentStorageActorWindowMs', 2_592_000_000),
    );

    return this.prisma.$transaction(async (tx) => {
      await this.lockQuotaAdmission(tx);

      const availableBytes = await this.readAvailableStorageBytes();

      const outstandingUsage =
        await tx.attachmentStorageReservation.aggregate({
          where: {
            state: {
              in: [
                AttachmentBinaryState.RESERVED,
                AttachmentBinaryState.PURGING,
                AttachmentBinaryState.RECONCILIATION_REQUIRED,
              ],
            },
          },
          _sum: { reservedBytes: true },
          _count: { _all: true },
        });
      const conservativeAvailableBytes =
        availableBytes - this.readSum(outstandingUsage);
      if (
        conservativeAvailableBytes <
        BigInt(input.bytes) + BigInt(minFreeBytes)
      ) {
        throw this.storageCapacityInsufficient();
      }

      const globalUsage = await this.readUsage(tx, {});
      const projectUsage = await this.readUsage(tx, {
        projectId: input.projectId,
      });
      const actorUsage = await this.readUsage(tx, {
        actorUserId: input.actorUserId,
        createdAt: { gte: actorWindowStart },
      });
      this.assertWithinQuota(
        'GLOBAL',
        globalUsage,
        input.bytes,
        this.readLimit('attachmentStorageGlobalMaxBytes', 5_368_709_120),
        this.readLimit('attachmentStorageGlobalMaxObjects', 5_000),
      );
      this.assertWithinQuota(
        'PROJECT',
        projectUsage,
        input.bytes,
        this.readLimit('attachmentStorageProjectMaxBytes', 1_073_741_824),
        this.readLimit('attachmentStorageProjectMaxObjects', 1_000),
      );
      this.assertWithinQuota(
        'ACTOR',
        actorUsage,
        input.bytes,
        this.readLimit('attachmentStorageActorMaxBytes', 536_870_912),
        this.readLimit('attachmentStorageActorMaxObjects', 500),
      );

      return tx.attachmentStorageReservation.create({
        data: {
          projectId: input.projectId,
          actorUserId: input.actorUserId,
          targetType: input.targetType,
          targetId: input.targetId,
          bucket: input.bucket,
          quarantineStorageKey: input.quarantineStorageKey,
          cleanStorageKey: input.cleanStorageKey,
          reservedBytes: BigInt(input.bytes),
          state: AttachmentBinaryState.RESERVED,
          ownerToken,
          leaseExpiresAt,
        },
      });
    });
  }

  async heartbeat(reservationId: string, ownerToken: string) {
    const leaseExpiresAt = new Date(
      Date.now() +
        this.readLimit('attachmentStorageReservationTtlMs', 7_200_000),
    );
    const updated = await this.prisma.attachmentStorageReservation.updateMany({
      where: {
        id: reservationId,
        ownerToken,
        state: AttachmentBinaryState.RESERVED,
      },
      data: { leaseExpiresAt },
    });
    if (updated.count !== 1) {
      throw this.reservationStateChanged();
    }
  }

  async markRetainedWithExecutor(
    tx: Prisma.TransactionClient,
    input: {
      reservationId: string;
      ownerToken: string;
      attachmentId: string;
    },
  ) {
    await this.lockQuotaAdmission(tx);
    const updated = await tx.attachmentStorageReservation.updateMany({
      where: {
        id: input.reservationId,
        ownerToken: input.ownerToken,
        state: AttachmentBinaryState.RESERVED,
      },
      data: {
        attachmentId: input.attachmentId,
        state: AttachmentBinaryState.RETAINED,
        leaseExpiresAt: null,
        failureReason: null,
      },
    });
    if (updated.count !== 1) {
      throw this.reservationStateChanged();
    }
  }

  async attachPendingRecordWithExecutor(
    tx: Prisma.TransactionClient,
    input: {
      reservationId: string;
      ownerToken: string;
      attachmentId: string;
    },
  ) {
    const updated = await tx.attachmentStorageReservation.updateMany({
      where: {
        id: input.reservationId,
        ownerToken: input.ownerToken,
        state: AttachmentBinaryState.RESERVED,
        attachmentId: null,
      },
      data: { attachmentId: input.attachmentId },
    });
    if (updated.count !== 1) {
      throw this.reservationStateChanged();
    }
  }

  async purgeAndRelease(input: PurgeReservationInput) {
    const claimed = await this.prisma.$transaction(async (tx) => {
      const reservation = await tx.attachmentStorageReservation.findUnique({
        where: { id: input.reservationId },
      });
      if (!reservation) {
        throw this.reservationStateChanged();
      }
      if (reservation.state === AttachmentBinaryState.PURGED) {
        return null;
      }
      if (reservation.ownerToken !== input.expectedOwnerToken) {
        throw this.reservationStateChanged();
      }
      if (
        reservation.state !== AttachmentBinaryState.RESERVED &&
        reservation.state !==
          AttachmentBinaryState.RECONCILIATION_REQUIRED
      ) {
        throw this.reservationStateChanged();
      }
      const ownerToken = randomUUID();
      const claim = await tx.attachmentStorageReservation.updateMany({
        where: {
          id: reservation.id,
          state: reservation.state,
          updatedAt: reservation.updatedAt,
        },
        data: {
          state: AttachmentBinaryState.PURGING,
          ownerToken,
          leaseExpiresAt: new Date(
            Date.now() +
              this.readLimit(
                'attachmentStorageReconciliationLeaseMs',
                300_000,
              ),
          ),
          failureReason: input.reason,
        },
      });
      if (claim.count !== 1) {
        throw this.reservationStateChanged();
      }
      return { ...reservation, ownerToken };
    });

    if (!claimed) {
      return;
    }
    await this.purgeClaimedReservation(claimed, input.reason);
  }

  async reconcileExpiredReservations() {
    if (this.stopping || this.reconciliationInFlight) {
      return { claimed: 0, purged: 0, retained: 0, failed: 0 };
    }
    this.reconciliationInFlight = true;
    try {
      const now = new Date();
      const ownerToken = randomUUID();
      const batchSize = this.readLimit(
        'attachmentStorageReconcileBatchSize',
        100,
      );
      const claimed = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw(
          Prisma.sql`
            SELECT pg_advisory_xact_lock(
              hashtext(${RECONCILIATION_LOCK_NAMESPACE})
            )
          `,
        );
        const candidates = await tx.attachmentStorageReservation.findMany({
          where: {
            state: {
              in: [
                AttachmentBinaryState.RESERVED,
                AttachmentBinaryState.PURGING,
                AttachmentBinaryState.RECONCILIATION_REQUIRED,
              ],
            },
            leaseExpiresAt: { lte: now },
          },
          orderBy: [{ leaseExpiresAt: 'asc' }, { id: 'asc' }],
          take: batchSize,
          include: {
            attachment: {
              select: {
                scanStatus: true,
              },
            },
          },
        });
        const rows = [];
        for (const candidate of candidates) {
          const claim = await tx.attachmentStorageReservation.updateMany({
            where: {
              id: candidate.id,
              state: candidate.state,
              updatedAt: candidate.updatedAt,
              leaseExpiresAt: { lte: now },
            },
            data: {
              state: AttachmentBinaryState.PURGING,
              ownerToken,
              leaseExpiresAt: new Date(
                now.getTime() +
                  this.readLimit(
                    'attachmentStorageReconciliationLeaseMs',
                    300_000,
                  ),
              ),
              failureReason: 'STALE_RESERVATION_RECONCILIATION',
            },
          });
          if (claim.count === 1) {
            rows.push({ ...candidate, ownerToken });
          }
        }
        return rows;
      });

      let purged = 0;
      let retained = 0;
      let failed = 0;
      for (const reservation of claimed) {
        try {
          const resolution = await this.reconcileClaimedReservation(
            reservation,
            'STALE_RESERVATION_RECONCILIATION',
          );
          if (resolution === 'retained') {
            retained += 1;
          } else {
            purged += 1;
          }
        } catch {
          failed += 1;
        }
      }
      await this.deleteExpiredPurgedMetadata();
      return { claimed: claimed.length, purged, retained, failed };
    } finally {
      this.reconciliationInFlight = false;
    }
  }

  private async reconcileClaimedReservation(
    reservation: {
      id: string;
      attachmentId: string | null;
      projectId: string;
      actorUserId: string | null;
      bucket: string;
      quarantineStorageKey: string;
      cleanStorageKey: string;
      reservedBytes: bigint;
      ownerToken: string;
      attachment?: { scanStatus: AttachmentScanStatus } | null;
    },
    reason: string,
  ): Promise<'purged' | 'retained'> {
    const scanStatus = reservation.attachment?.scanStatus;
    if (
      scanStatus !== AttachmentScanStatus.CLEAN &&
      scanStatus !== AttachmentScanStatus.LEGACY_UNSCANNED
    ) {
      await this.purgeClaimedReservation(reservation, reason);
      return 'purged';
    }

    const [quarantineMetadata, cleanMetadata] = await Promise.all([
      this.objectStorageService.inspect({
        bucket: reservation.bucket,
        storageKey: reservation.quarantineStorageKey,
      }),
      this.objectStorageService.inspect({
        bucket: reservation.bucket,
        storageKey: reservation.cleanStorageKey,
      }),
    ]);
    const presentObjects = [quarantineMetadata, cleanMetadata].filter(
      (metadata) => metadata.exists,
    );
    const hasExactSingleObject =
      presentObjects.length === 1 &&
      presentObjects[0]?.size === Number(reservation.reservedBytes);

    if (hasExactSingleObject) {
      await this.prisma.$transaction(async (tx) => {
        const retained = await tx.attachmentStorageReservation.updateMany({
          where: {
            id: reservation.id,
            ownerToken: reservation.ownerToken,
            state: AttachmentBinaryState.PURGING,
          },
          data: {
            state: AttachmentBinaryState.RETAINED,
            leaseExpiresAt: null,
            failureReason:
              scanStatus === AttachmentScanStatus.CLEAN
                ? 'CLEAN_BINARY_INVENTORIED'
                : 'LEGACY_BINARY_INVENTORIED',
          },
        });
        if (retained.count !== 1) {
          throw this.reservationStateChanged();
        }
        if (reservation.attachmentId) {
          await this.activityLogsService.createWithExecutor(tx, {
            projectId: reservation.projectId,
            actorUserId: reservation.actorUserId,
            targetType: AuditTargetType.ATTACHMENT,
            targetId: reservation.attachmentId,
            action: 'ATTACHMENT_BINARY_RECONCILED_RETAINED',
            summary: '附件二进制盘点通过，继续按正式历史保留并计入配额。',
            metadata: { scanStatus },
          });
        }
      });
      return 'retained';
    }

    if (
      presentObjects.length === 0 &&
      scanStatus === AttachmentScanStatus.LEGACY_UNSCANNED
    ) {
      await this.markClaimedReservationPurged(
        reservation,
        'LEGACY_BINARY_ABSENT',
      );
      return 'purged';
    }

    await this.markClaimedReservationForRetry(
      reservation,
      scanStatus === AttachmentScanStatus.CLEAN
        ? 'CLEAN_BINARY_INVENTORY_MISMATCH'
        : 'LEGACY_BINARY_INVENTORY_MISMATCH',
    );
    throw new Error('ATTACHMENT_BINARY_INVENTORY_MISMATCH');
  }

  private async purgeClaimedReservation(
    reservation: {
      id: string;
      attachmentId: string | null;
      projectId: string;
      actorUserId: string | null;
      bucket: string;
      quarantineStorageKey: string;
      cleanStorageKey: string;
      ownerToken: string;
    },
    reason: string,
  ) {
    try {
      await this.objectStorageService.purge({
        bucket: reservation.bucket,
        storageKey: reservation.quarantineStorageKey,
      });
      await this.objectStorageService.purge({
        bucket: reservation.bucket,
        storageKey: reservation.cleanStorageKey,
      });
    } catch (error) {
      await this.markClaimedReservationForRetry(reservation, reason);
      throw error;
    }

    await this.markClaimedReservationPurged(reservation, reason);
  }

  private async markClaimedReservationForRetry(
    reservation: { id: string; ownerToken: string },
    reason: string,
  ) {
    await this.prisma.attachmentStorageReservation.updateMany({
      where: {
        id: reservation.id,
        ownerToken: reservation.ownerToken,
        state: AttachmentBinaryState.PURGING,
      },
      data: {
        state: AttachmentBinaryState.RECONCILIATION_REQUIRED,
        leaseExpiresAt: new Date(
          Date.now() +
            this.readLimit('attachmentStorageReconciliationRetryMs', 300_000),
        ),
        failureReason: reason,
      },
    });
  }

  private async markClaimedReservationPurged(
    reservation: {
      id: string;
      attachmentId: string | null;
      projectId: string;
      actorUserId: string | null;
      ownerToken: string;
    },
    reason: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const released = await tx.attachmentStorageReservation.updateMany({
        where: {
          id: reservation.id,
          ownerToken: reservation.ownerToken,
          state: AttachmentBinaryState.PURGING,
        },
        data: {
          state: AttachmentBinaryState.PURGED,
          leaseExpiresAt: null,
          purgedAt: new Date(),
          failureReason: reason,
        },
      });
      if (released.count !== 1) {
        throw this.reservationStateChanged();
      }
      if (reservation.attachmentId) {
        await this.activityLogsService.createWithExecutor(tx, {
          projectId: reservation.projectId,
          actorUserId: reservation.actorUserId,
          targetType: AuditTargetType.ATTACHMENT,
          targetId: reservation.attachmentId,
          action: 'ATTACHMENT_BINARY_PURGED',
          summary: '附件二进制已完成受控清理，审计元数据继续保留。',
          metadata: { reason },
        });
      }
    });
  }

  private triggerReconciliation() {
    void this.reconcileExpiredReservations().catch(() => {
      this.logger.error(
        'eventType=attachment_storage_reconciliation result=failed',
      );
    });
  }

  private async deleteExpiredPurgedMetadata() {
    const cutoff = new Date(
      Date.now() -
        this.readLimit(
          'attachmentStoragePurgedMetadataRetentionMs',
          7_776_000_000,
        ),
    );
    const take = this.readLimit('attachmentStorageReconcileBatchSize', 100);
    const rows = await this.prisma.attachmentStorageReservation.findMany({
      where: {
        state: AttachmentBinaryState.PURGED,
        purgedAt: { lt: cutoff },
      },
      select: { id: true },
      orderBy: [{ purgedAt: 'asc' }, { id: 'asc' }],
      take,
    });
    if (rows.length > 0) {
      await this.prisma.attachmentStorageReservation.deleteMany({
        where: { id: { in: rows.map((row) => row.id) } },
      });
    }
  }

  private async lockQuotaAdmission(tx: Prisma.TransactionClient) {
    await tx.$executeRaw(
      Prisma.sql`
        SELECT pg_advisory_xact_lock(
          hashtext(${QUOTA_LOCK_NAMESPACE})
        )
      `,
    );
  }

  private readUsage(
    tx: Prisma.TransactionClient,
    where: Prisma.AttachmentStorageReservationWhereInput,
  ) {
    return tx.attachmentStorageReservation.aggregate({
      where: {
        ...where,
        state: { in: [...ACTIVE_QUOTA_STATES] },
      },
      _sum: { reservedBytes: true },
      _count: { _all: true },
    });
  }

  private assertWithinQuota(
    scope: 'GLOBAL' | 'PROJECT' | 'ACTOR',
    usage: {
      _sum: { reservedBytes: bigint | null };
      _count: { _all: number };
    },
    requestedBytes: number,
    maxBytes: number,
    maxObjects: number,
  ) {
    const nextBytes = this.readSum(usage) + BigInt(requestedBytes);
    const nextObjects = usage._count._all + 1;
    if (nextBytes > BigInt(maxBytes) || nextObjects > maxObjects) {
      throw new HttpException(
        {
          code: 'ATTACHMENT_STORAGE_QUOTA_EXCEEDED',
          message: '附件累计存储配额不足，请清理或联系管理员。',
          scope,
          maxBytes,
          maxObjects,
        },
        HttpStatus.INSUFFICIENT_STORAGE,
      );
    }
  }

  private readSum(value: { _sum: { reservedBytes: bigint | null } }) {
    return value._sum.reservedBytes ?? 0n;
  }

  private readLimit(key: string, fallback: number) {
    return this.configService.get<number>(key) ?? fallback;
  }

  private async readAvailableStorageBytes() {
    try {
      return await this.objectStorageService.readAvailableBytes();
    } catch {
      throw this.storageCapacityInsufficient();
    }
  }

  private reservationStateChanged() {
    return new ServiceUnavailableException({
      code: 'ATTACHMENT_STORAGE_RESERVATION_STATE_CHANGED',
      message: '附件存储预留状态已变化，请重试。',
    });
  }

  private storageCapacityInsufficient() {
    return new HttpException(
      {
        code: 'ATTACHMENT_STORAGE_CAPACITY_INSUFFICIENT',
        message: '附件存储可用空间不足，请稍后重试或联系管理员。',
      },
      HttpStatus.INSUFFICIENT_STORAGE,
    );
  }
}
