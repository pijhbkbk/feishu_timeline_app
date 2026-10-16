import { SupplierStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import type { AuthenticatedUser } from '../auth/auth.types';
import { PaintProcurementsService } from '../paint-procurements/paint-procurements.service';
import { SuppliersService } from './suppliers.service';

const actor: AuthenticatedUser = {
  id: 'supplier-manager',
  username: 'supplier-manager',
  name: '供应商管理员',
  email: null,
  departmentId: null,
  departmentName: null,
  isSystemAdmin: false,
  authSource: 'local', teamAccessApproved: true,
  roleCodes: ['purchaser'],
  permissionCodes: ['project.read', 'workflow.transition'],
};

function supplierRecord(index: number) {
  return {
    id: `supplier-${index}`,
    supplierCode: `SUP-${String(index).padStart(3, '0')}`,
    supplierName: `供应商 ${index}`,
    contactName: null,
    contactPhone: null,
    email: null,
    status: SupplierStatus.ACTIVE,
    createdAt: new Date('2026-08-11T00:00:00.000Z'),
    updatedAt: new Date('2026-08-11T00:00:00.000Z'),
  };
}

describe('SuppliersService resource bounds', () => {
  it.each([
    ['supplierCode', 'SUP;DROP', 'SUPPLIER_CODE_INVALID'],
    ['supplierCode', 'S'.repeat(65), 'SUPPLIER_CODE_TOO_LONG'],
    ['supplierName', '供'.repeat(201), 'SUPPLIER_NAME_TOO_LONG'],
    ['contactName', '联'.repeat(101), 'SUPPLIER_CONTACT_NAME_TOO_LONG'],
    ['contactPhone', '1234;curl', 'SUPPLIER_CONTACT_PHONE_INVALID'],
    ['contactPhone', '1'.repeat(65), 'SUPPLIER_CONTACT_PHONE_TOO_LONG'],
  ] as const)(
    'rejects invalid or oversized %s before starting a transaction',
    async (field, value, code) => {
      const prisma = {
        $transaction: vi.fn().mockRejectedValue(new Error('database reached')),
      };
      const service = new SuppliersService(
        prisma as never,
        {} as never,
        { get: vi.fn() } as never,
      );
      const input = {
        supplierCode: 'SUP-001',
        supplierName: '安全供应商',
        contactName: '联系人',
        contactPhone: '+86 138-0000-0000',
        status: SupplierStatus.ACTIVE,
        [field]: value,
      };

      await expect(service.createSupplier(input, actor)).rejects.toMatchObject({
        response: expect.objectContaining({ code }),
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it('returns a bounded supplier page instead of materializing the whole catalog', async () => {
    const rows = Array.from({ length: 100 }, (_, index) => supplierRecord(index));
    const prisma = {
      supplier: {
        count: vi.fn().mockResolvedValue(1_000_000),
        findMany: vi.fn().mockResolvedValue(rows),
      },
    };
    const service = new SuppliersService(
      prisma as never,
      {} as never,
      { get: vi.fn() } as never,
    );

    const result = await (
      service.listSuppliers as unknown as (
        currentActor: AuthenticatedUser,
        query: Record<string, string | undefined>,
      ) => Promise<{
        page: number;
        pageSize: number;
        total: number;
        items: unknown[];
      }>
    )(actor, { page: '1', pageSize: '100' });

    expect(prisma.supplier.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 100,
      }),
    );
    expect(result).toMatchObject({
      page: 1,
      pageSize: 100,
      total: 1_000_000,
    });
    expect(result.items).toHaveLength(100);
  });

  it('rejects oversized supplier search before querying the catalog', async () => {
    const prisma = {
      supplier: {
        count: vi.fn(),
        findMany: vi.fn(),
      },
    };
    const service = new SuppliersService(
      prisma as never,
      {} as never,
      { get: vi.fn() } as never,
    );

    await expect(
      (
        service.listSuppliers as unknown as (
          currentActor: AuthenticatedUser,
          query: Record<string, string | undefined>,
        ) => Promise<unknown>
      )(actor, { q: 'x'.repeat(101) }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'SUPPLIER_SEARCH_TOO_LONG' }),
    });
    expect(prisma.supplier.count).not.toHaveBeenCalled();
    expect(prisma.supplier.findMany).not.toHaveBeenCalled();
  });
});

describe('Paint procurement supplier selector bound', () => {
  it('caps the embedded supplier query at one hundred rows', async () => {
    const prisma = {
      paintProcurement: { findMany: vi.fn().mockResolvedValue([]) },
      supplier: { findMany: vi.fn().mockResolvedValue([]) },
      workflowTask: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const service = new PaintProcurementsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );
    vi.spyOn(
      service as unknown as {
        getProjectOrThrow: () => Promise<unknown>;
      },
      'getProjectOrThrow',
    ).mockResolvedValue({
      id: 'project-1',
      code: 'P-001',
      name: '项目一',
      currentNodeCode: null,
      plannedEndDate: null,
      priority: 'MEDIUM',
    });
    vi.spyOn(
      service as unknown as {
        getActiveProcurementTask: () => Promise<unknown>;
      },
      'getActiveProcurementTask',
    ).mockResolvedValue(null);

    await (
      service as unknown as {
        buildWorkspace: (db: unknown, projectId: string) => Promise<unknown>;
      }
    ).buildWorkspace(prisma, 'project-1');

    expect(prisma.supplier.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 }),
    );
    expect(prisma.workflowTask.findMany).not.toHaveBeenCalled();
  });
});
