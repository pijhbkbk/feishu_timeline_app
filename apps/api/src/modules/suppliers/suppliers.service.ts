import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditTargetType,
  SupplierStatus,
  type Prisma,
} from '@prisma/client';

import { PrismaService } from '../../infra/prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import type { AuthenticatedUser } from '../auth/auth.types';

type SupplierDbClient = Prisma.TransactionClient | PrismaService;

type SupplierWriteInput = {
  supplierCode: string;
  supplierName: string;
  contactName: string | null;
  contactPhone: string | null;
  status: SupplierStatus;
};

const SUPPLIER_STATUS_VALUES = Object.values(SupplierStatus);

@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLogsService: ActivityLogsService,
  ) {}

  async listSuppliers() {
    const suppliers = await this.prisma.supplier.findMany({
      orderBy: [
        { status: 'asc' },
        { supplierName: 'asc' },
      ],
    });

    return suppliers.map((supplier) => this.toSupplierSummary(supplier));
  }

  async createSupplier(rawInput: unknown, actor: AuthenticatedUser) {
    const input = this.parseSupplierWriteInput(rawInput);

    return this.prisma.$transaction(async (tx) => {
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

      return this.toSupplierSummary(supplier);
    });
  }

  async updateSupplier(
    supplierId: string,
    rawInput: unknown,
    actor: AuthenticatedUser,
  ) {
    const input = this.parseSupplierWriteInput(rawInput);

    return this.prisma.$transaction(async (tx) => {
      const supplier = await this.getSupplierOrThrow(tx, supplierId);

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

      const updatedSupplier = await tx.supplier.update({
        where: { id: supplierId },
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
        targetId: supplierId,
        action: 'SUPPLIER_UPDATED',
        summary: `更新供应商 ${updatedSupplier.supplierName}`,
        beforeData: this.toSupplierAuditSnapshot(supplier),
        afterData: this.toSupplierAuditSnapshot(updatedSupplier),
      });

      return this.toSupplierSummary(updatedSupplier);
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

    return {
      supplierCode,
      supplierName,
      contactName,
      contactPhone,
      status,
    };
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
