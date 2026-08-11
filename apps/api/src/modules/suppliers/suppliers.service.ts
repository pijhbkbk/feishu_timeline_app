import { createHash } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AuditTargetType,
  Prisma,
  SupplierStatus,
} from '@prisma/client';

import { PrismaService } from '../../infra/prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { normalizePage, normalizePageSize } from '../tasks/tasks.rules';

type SupplierDbClient = Prisma.TransactionClient | PrismaService;

type SupplierWriteInput = {
  supplierCode: string;
  supplierName: string;
  contactName: string | null;
  contactPhone: string | null;
  status: SupplierStatus;
};

type SupplierUpdateInput = SupplierWriteInput & {
  expectedVersion: Date;
  expectedVersionText: string;
};

const SUPPLIER_STATUS_VALUES = Object.values(SupplierStatus);
const SUPPLIER_CODE_MAX_LENGTH = 64;
const SUPPLIER_NAME_MAX_LENGTH = 200;
const SUPPLIER_CONTACT_NAME_MAX_LENGTH = 100;
const SUPPLIER_CONTACT_PHONE_MAX_LENGTH = 64;
const SUPPLIER_SEARCH_MAX_LENGTH = 100;
const SUPPLIER_CODE_PATTERN = /^[A-Za-z0-9._-]+$/;
const SUPPLIER_PHONE_PATTERN = /^[0-9+(). -]+$/;
const SUPPLIER_IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]+$/;
const SUPPLIER_IDEMPOTENCY_KEY_MAX_LENGTH = 128;
const SUPPLIER_COMMAND_RETENTION_MS = 86_400_000;
const SUPPLIER_COMMAND_MAX_PER_ACTOR = 1_000;
const SUPPLIER_CREATE_ACTION = 'SUPPLIER_CREATE';
const SUPPLIER_UPDATE_ACTION = 'SUPPLIER_UPDATE';

function containsControlCharacter(value: string) {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)) {
      return true;
    }
  }

  return false;
}

@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLogsService: ActivityLogsService,
    private readonly configService: ConfigService,
  ) {}

  async listSuppliers(
    actor: AuthenticatedUser,
    rawQuery: Record<string, string | undefined> = {},
  ) {
    this.assertPermission(actor, 'project.read');
    const page = normalizePage(rawQuery.page, 1);
    const pageSize = normalizePageSize(rawQuery.pageSize, 20);
    const search = rawQuery.q?.trim() ?? '';

    if (
      search.length > SUPPLIER_SEARCH_MAX_LENGTH ||
      containsControlCharacter(search)
    ) {
      this.throwInvalidInput(
        'SUPPLIER_SEARCH_TOO_LONG',
        `供应商搜索词不得超过 ${SUPPLIER_SEARCH_MAX_LENGTH} 个字符。`,
      );
    }

    const where: Prisma.SupplierWhereInput = search
      ? {
          OR: [
            { supplierCode: { contains: search, mode: 'insensitive' } },
            { supplierName: { contains: search, mode: 'insensitive' } },
            { contactName: { contains: search, mode: 'insensitive' } },
            { contactPhone: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {};

    const [total, suppliers] = await Promise.all([
      this.prisma.supplier.count({ where }),
      this.prisma.supplier.findMany({
        where,
        orderBy: [
          { status: 'asc' },
          { supplierName: 'asc' },
          { id: 'asc' },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      items: suppliers.map((supplier) => this.toSupplierSummary(supplier)),
    };
  }

  async createSupplier(
    rawInput: unknown,
    actor: AuthenticatedUser,
    rawIdempotencyKey?: string,
  ) {
    this.assertPermission(actor, 'workflow.transition');
    const input = this.parseSupplierWriteInput(rawInput);
    const idempotencyKey = this.parseIdempotencyKey(rawIdempotencyKey);
    const requestHash = this.hashSupplierCommand({
      action: SUPPLIER_CREATE_ACTION,
      targetId: null,
      input,
    });
    const commandInput = {
      actorUserId: actor.id,
      idempotencyKey,
      action: SUPPLIER_CREATE_ACTION,
      targetId: null,
      requestHash,
    };

    const replay = await this.findSupplierCommandReplay(this.prisma, commandInput);
    if (replay) {
      return replay;
    }
    await this.admitSupplierMutationAttempt(actor.id);

    return this.prisma.$transaction(async (tx) => {
      await this.lockSupplierCommand(tx, actor.id, idempotencyKey);
      const lockedReplay = await this.findSupplierCommandReplay(tx, commandInput);
      if (lockedReplay) {
        return lockedReplay;
      }

      await this.lockSupplierCatalog(tx);
      const catalogCount = await tx.supplier.count();
      if (catalogCount >= this.getSupplierCatalogMaxItems()) {
        throw new HttpException(
          {
            statusCode: 507,
            error: 'Insufficient Storage',
            code: 'SUPPLIER_CATALOG_CAPACITY_EXCEEDED',
            message: '供应商目录已达到容量上限，请联系系统管理员处理。',
          },
          507,
        );
      }

      const existingSupplier = await tx.supplier.findUnique({
        where: {
          supplierCode: input.supplierCode,
        },
        select: {
          id: true,
        },
      });

      if (existingSupplier) {
        throw new BadRequestException('供应商编码已存在。');
      }

      const supplier = await tx.supplier.create({
        data: {
          supplierCode: input.supplierCode,
          supplierName: input.supplierName,
          contactName: input.contactName,
          contactPhone: input.contactPhone,
          status: input.status,
        },
      });

      await this.activityLogsService.createWithExecutor(tx, {
        actorUserId: actor.id,
        targetType: AuditTargetType.SUPPLIER,
        targetId: supplier.id,
        action: 'SUPPLIER_CREATED',
        summary: `创建供应商 ${supplier.supplierName}`,
        afterData: this.toSupplierAuditSnapshot(supplier),
      });

      const result = this.toSupplierSummary(supplier);
      await this.recordSupplierCommand(tx, {
        actorUserId: actor.id,
        idempotencyKey,
        action: SUPPLIER_CREATE_ACTION,
        targetId: null,
        requestHash,
        result,
      });

      return { ...result, idempotentReplay: false };
    });
  }

  async updateSupplier(
    supplierId: string,
    rawInput: unknown,
    actor: AuthenticatedUser,
    rawIdempotencyKey?: string,
  ) {
    this.assertPermission(actor, 'workflow.transition');
    const input = this.parseSupplierUpdateInput(rawInput);
    const idempotencyKey = this.parseIdempotencyKey(rawIdempotencyKey);
    const requestHash = this.hashSupplierCommand({
      action: SUPPLIER_UPDATE_ACTION,
      targetId: supplierId,
      input,
    });
    const commandInput = {
      actorUserId: actor.id,
      idempotencyKey,
      action: SUPPLIER_UPDATE_ACTION,
      targetId: supplierId,
      requestHash,
    };

    const replay = await this.findSupplierCommandReplay(this.prisma, commandInput);
    if (replay) {
      return replay;
    }
    await this.admitSupplierMutationAttempt(actor.id);

    return this.prisma.$transaction(async (tx) => {
      await this.lockSupplierCommand(tx, actor.id, idempotencyKey);
      const lockedReplay = await this.findSupplierCommandReplay(tx, commandInput);
      if (lockedReplay) {
        return lockedReplay;
      }

      const supplier = await this.getSupplierOrThrow(tx, supplierId);
      if (supplier.updatedAt.getTime() !== input.expectedVersion.getTime()) {
        this.throwSupplierStateChanged();
      }

      if (this.supplierMatchesInput(supplier, input)) {
        const result = this.toSupplierSummary(supplier);
        await this.recordSupplierCommand(tx, {
          actorUserId: actor.id,
          idempotencyKey,
          action: SUPPLIER_UPDATE_ACTION,
          targetId: supplier.id,
          requestHash,
          result,
        });
        return { ...result, idempotentReplay: false };
      }

      if (supplier.supplierCode !== input.supplierCode) {
        const duplicatedSupplier = await tx.supplier.findUnique({
          where: {
            supplierCode: input.supplierCode,
          },
          select: {
            id: true,
          },
        });

        if (duplicatedSupplier) {
          throw new BadRequestException('供应商编码已存在。');
        }
      }

      const claimed = await tx.supplier.updateMany({
        where: {
          id: supplierId,
          updatedAt: input.expectedVersion,
        },
        data: {
          supplierCode: input.supplierCode,
          supplierName: input.supplierName,
          contactName: input.contactName,
          contactPhone: input.contactPhone,
          status: input.status,
        },
      });
      if (claimed.count !== 1) {
        this.throwSupplierStateChanged();
      }
      const updatedSupplier = await tx.supplier.findUniqueOrThrow({
        where: { id: supplierId },
      });

      await this.activityLogsService.createWithExecutor(tx, {
        actorUserId: actor.id,
        targetType: AuditTargetType.SUPPLIER,
        targetId: supplierId,
        action: 'SUPPLIER_UPDATED',
        summary: `更新供应商 ${updatedSupplier.supplierName}`,
        beforeData: this.toSupplierAuditSnapshot(supplier),
        afterData: this.toSupplierAuditSnapshot(updatedSupplier),
      });

      const result = this.toSupplierSummary(updatedSupplier);
      await this.recordSupplierCommand(tx, {
        actorUserId: actor.id,
        idempotencyKey,
        action: SUPPLIER_UPDATE_ACTION,
        targetId: supplierId,
        requestHash,
        result,
      });

      return { ...result, idempotentReplay: false };
    });
  }

  private async lockSupplierCommand(
    tx: Prisma.TransactionClient,
    actorUserId: string,
    idempotencyKey: string,
  ) {
    await tx.$queryRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(
        hashtext('feishu-timeline:supplier-command'),
        hashtext(${`${actorUserId}:${idempotencyKey}`})
      )
    `);
  }

  private async lockSupplierMutationActor(
    tx: Prisma.TransactionClient,
    actorUserId: string,
  ) {
    await tx.$queryRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(
        hashtext('feishu-timeline:supplier-mutation'),
        hashtext(${actorUserId})
      )
    `);
  }

  private async lockSupplierCatalog(tx: Prisma.TransactionClient) {
    await tx.$queryRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(
        hashtext('feishu-timeline:supplier-catalog'),
        hashtext('global')
      )
    `);
  }

  private async findSupplierCommandReplay(
    tx: SupplierDbClient,
    input: {
      actorUserId: string;
      idempotencyKey: string;
      action: string;
      targetId: string | null;
      requestHash: string;
    },
  ) {
    const existing = await tx.supplierCommandRequest.findUnique({
      where: {
        actorUserId_idempotencyKey: {
          actorUserId: input.actorUserId,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (!existing) {
      return null;
    }
    if (
      existing.action !== input.action ||
      existing.targetId !== input.targetId ||
      existing.requestHash !== input.requestHash
    ) {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        code: 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST',
        message: '同一幂等键不能用于不同的供应商写请求。',
      });
    }
    if (
      !existing.resultSnapshot ||
      typeof existing.resultSnapshot !== 'object' ||
      Array.isArray(existing.resultSnapshot)
    ) {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        code: 'SUPPLIER_COMMAND_RESULT_INVALID',
        message: '供应商写请求的幂等结果不可用，请联系系统管理员。',
      });
    }
    return {
      ...(existing.resultSnapshot as Record<string, unknown>),
      idempotentReplay: true,
    };
  }

  private async admitSupplierMutationAttempt(actorUserId: string) {
    await this.prisma.$transaction(async (tx) => {
      await this.reserveSupplierMutation(tx, actorUserId);
    });
  }

  private async reserveSupplierMutation(
    tx: Prisma.TransactionClient,
    actorUserId: string,
  ) {
    await this.lockSupplierMutationActor(tx, actorUserId);
    const now = new Date();
    const commandCutoff = new Date(now.getTime() - SUPPLIER_COMMAND_RETENTION_MS);
    await tx.supplierCommandRequest.deleteMany({
      where: {
        actorUserId,
        createdAt: { lt: commandCutoff },
      },
    });
    const commandCount = await tx.supplierCommandRequest.count({
      where: { actorUserId },
    });
    if (commandCount >= SUPPLIER_COMMAND_MAX_PER_ACTOR) {
      throw new HttpException(
        {
          statusCode: 503,
          error: 'Service Unavailable',
          code: 'SUPPLIER_COMMAND_LEDGER_CAPACITY_EXCEEDED',
          message: '供应商写请求记录暂时达到上限，请稍后重试。',
        },
        503,
      );
    }

    const bucket = await tx.supplierMutationBucket.findUnique({
      where: { actorUserId },
    });
    const mutationLimit = this.getSupplierMutationMaxRequests();
    const windowMs = this.getSupplierMutationWindowMs();
    const windowExpired =
      !bucket || now.getTime() - bucket.windowStartedAt.getTime() >= windowMs;
    if (windowExpired) {
      await tx.supplierMutationBucket.upsert({
        where: { actorUserId },
        create: {
          actorUserId,
          windowStartedAt: now,
          requestCount: 1,
        },
        update: {
          windowStartedAt: now,
          requestCount: 1,
        },
      });
      return;
    }
    if (bucket.requestCount >= mutationLimit) {
      throw new HttpException(
        {
          statusCode: 429,
          error: 'Too Many Requests',
          code: 'SUPPLIER_MUTATION_RATE_EXCEEDED',
          message: '供应商写操作过于频繁，请稍后重试。',
        },
        429,
      );
    }
    await tx.supplierMutationBucket.update({
      where: { actorUserId },
      data: { requestCount: { increment: 1 } },
    });
  }

  private async recordSupplierCommand(
    tx: Prisma.TransactionClient,
    input: {
      actorUserId: string;
      idempotencyKey: string;
      action: string;
      targetId: string | null;
      requestHash: string;
      result: Record<string, unknown>;
    },
  ) {
    await tx.supplierCommandRequest.create({
      data: {
        actorUserId: input.actorUserId,
        idempotencyKey: input.idempotencyKey,
        action: input.action,
        targetId: input.targetId,
        requestHash: input.requestHash,
        resultSnapshot: input.result as Prisma.InputJsonValue,
      },
    });
  }

  private async getSupplierOrThrow(db: SupplierDbClient, supplierId: string) {
    const supplier = await db.supplier.findUnique({
      where: { id: supplierId },
    });

    if (!supplier) {
      throw new NotFoundException('供应商不存在。');
    }

    return supplier;
  }

  private assertPermission(
    actor: AuthenticatedUser,
    requiredPermission: 'project.read' | 'workflow.transition',
  ) {
    if (actor.isSystemAdmin || actor.permissionCodes?.includes(requiredPermission)) {
      return;
    }

    throw new ForbiddenException('当前用户没有供应商目录操作权限。');
  }

  private parseSupplierWriteInput(rawInput: unknown): SupplierWriteInput {
    if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
      throw new BadRequestException('供应商数据格式不正确。');
    }

    const input = rawInput as Record<string, unknown>;
    const supplierCode =
      typeof input.supplierCode === 'string' ? input.supplierCode.trim() : '';
    const supplierName =
      typeof input.supplierName === 'string' ? input.supplierName.trim() : '';
    const contactName =
      typeof input.contactName === 'string' && input.contactName.trim().length > 0
        ? input.contactName.trim()
        : null;
    const contactPhone =
      typeof input.contactPhone === 'string' && input.contactPhone.trim().length > 0
        ? input.contactPhone.trim()
        : null;
    const status =
      typeof input.status === 'string' && SUPPLIER_STATUS_VALUES.includes(input.status as SupplierStatus)
        ? (input.status as SupplierStatus)
        : SupplierStatus.ACTIVE;

    if (!supplierCode) {
      throw new BadRequestException('供应商编码不能为空。');
    }

    if (!supplierName) {
      throw new BadRequestException('供应商名称不能为空。');
    }

    if (supplierCode.length > SUPPLIER_CODE_MAX_LENGTH) {
      this.throwInvalidInput(
        'SUPPLIER_CODE_TOO_LONG',
        `供应商编码不得超过 ${SUPPLIER_CODE_MAX_LENGTH} 个字符。`,
      );
    }

    if (!SUPPLIER_CODE_PATTERN.test(supplierCode)) {
      this.throwInvalidInput(
        'SUPPLIER_CODE_INVALID',
        '供应商编码只能包含英文字母、数字、点、下划线和连字符。',
      );
    }

    if (
      supplierName.length > SUPPLIER_NAME_MAX_LENGTH ||
      containsControlCharacter(supplierName)
    ) {
      this.throwInvalidInput(
        'SUPPLIER_NAME_TOO_LONG',
        `供应商名称不得超过 ${SUPPLIER_NAME_MAX_LENGTH} 个字符且不能包含控制字符。`,
      );
    }

    if (
      contactName &&
      (contactName.length > SUPPLIER_CONTACT_NAME_MAX_LENGTH ||
        containsControlCharacter(contactName))
    ) {
      this.throwInvalidInput(
        'SUPPLIER_CONTACT_NAME_TOO_LONG',
        `联系人姓名不得超过 ${SUPPLIER_CONTACT_NAME_MAX_LENGTH} 个字符且不能包含控制字符。`,
      );
    }

    if (contactPhone && contactPhone.length > SUPPLIER_CONTACT_PHONE_MAX_LENGTH) {
      this.throwInvalidInput(
        'SUPPLIER_CONTACT_PHONE_TOO_LONG',
        `联系人电话不得超过 ${SUPPLIER_CONTACT_PHONE_MAX_LENGTH} 个字符。`,
      );
    }

    if (contactPhone && !SUPPLIER_PHONE_PATTERN.test(contactPhone)) {
      this.throwInvalidInput(
        'SUPPLIER_CONTACT_PHONE_INVALID',
        '联系人电话包含不允许的字符。',
      );
    }

    return {
      supplierCode,
      supplierName,
      contactName,
      contactPhone,
      status,
    };
  }

  private parseSupplierUpdateInput(rawInput: unknown): SupplierUpdateInput {
    const input = this.parseSupplierWriteInput(rawInput);
    const record = rawInput as Record<string, unknown>;
    const expectedVersionText =
      typeof record.expectedVersion === 'string'
        ? record.expectedVersion.trim()
        : '';
    const expectedVersion = new Date(expectedVersionText);
    if (
      !expectedVersionText ||
      Number.isNaN(expectedVersion.getTime()) ||
      expectedVersion.toISOString() !== expectedVersionText
    ) {
      this.throwInvalidInput(
        'SUPPLIER_EXPECTED_VERSION_INVALID',
        '更新供应商时必须提供当前版本时间。',
      );
    }
    return {
      ...input,
      expectedVersion,
      expectedVersionText,
    };
  }

  private parseIdempotencyKey(rawValue: string | undefined) {
    const value = rawValue?.trim() ?? '';
    if (
      !value ||
      value.length > SUPPLIER_IDEMPOTENCY_KEY_MAX_LENGTH ||
      !SUPPLIER_IDEMPOTENCY_KEY_PATTERN.test(value)
    ) {
      this.throwInvalidInput(
        'SUPPLIER_IDEMPOTENCY_KEY_INVALID',
        `Idempotency-Key 必须为 1-${SUPPLIER_IDEMPOTENCY_KEY_MAX_LENGTH} 位安全字符。`,
      );
    }
    return value;
  }

  private hashSupplierCommand(input: {
    action: string;
    targetId: string | null;
    input: SupplierWriteInput | SupplierUpdateInput;
  }) {
    const expectedVersion = 'expectedVersionText' in input.input
      ? input.input.expectedVersionText
      : null;
    return createHash('sha256')
      .update(JSON.stringify({
        action: input.action,
        targetId: input.targetId,
        supplierCode: input.input.supplierCode,
        supplierName: input.input.supplierName,
        contactName: input.input.contactName,
        contactPhone: input.input.contactPhone,
        status: input.input.status,
        expectedVersion,
      }))
      .digest('hex');
  }

  private supplierMatchesInput(
    supplier: Prisma.SupplierGetPayload<Record<string, never>>,
    input: SupplierWriteInput,
  ) {
    return (
      supplier.supplierCode === input.supplierCode &&
      supplier.supplierName === input.supplierName &&
      supplier.contactName === input.contactName &&
      supplier.contactPhone === input.contactPhone &&
      supplier.status === input.status
    );
  }

  private throwSupplierStateChanged(): never {
    throw new ConflictException({
      statusCode: 409,
      error: 'Conflict',
      code: 'SUPPLIER_STATE_CHANGED',
      message: '供应商信息已变化，请刷新后重试。',
    });
  }

  private getSupplierCatalogMaxItems() {
    return this.configService.get<number>('supplierCatalogMaxItems') ?? 5_000;
  }

  private getSupplierMutationMaxRequests() {
    return this.configService.get<number>('supplierMutationMaxRequests') ?? 30;
  }

  private getSupplierMutationWindowMs() {
    return this.configService.get<number>('supplierMutationWindowMs') ?? 3_600_000;
  }

  private throwInvalidInput(code: string, message: string): never {
    throw new BadRequestException({
      statusCode: 400,
      error: 'Bad Request',
      code,
      message,
    });
  }

  private toSupplierSummary(
    supplier: Prisma.SupplierGetPayload<Record<string, never>>,
  ) {
    return {
      id: supplier.id,
      supplierCode: supplier.supplierCode,
      supplierName: supplier.supplierName,
      contactName: supplier.contactName,
      contactPhone: supplier.contactPhone,
      status: supplier.status,
      createdAt: supplier.createdAt.toISOString(),
      updatedAt: supplier.updatedAt.toISOString(),
    };
  }

  private toSupplierAuditSnapshot(
    supplier: Prisma.SupplierGetPayload<Record<string, never>>,
  ) {
    return {
      id: supplier.id,
      supplierCode: supplier.supplierCode,
      supplierName: supplier.supplierName,
      contactName: supplier.contactName,
      contactPhone: supplier.contactPhone,
      status: supplier.status,
    } satisfies Prisma.InputJsonValue;
  }
}
