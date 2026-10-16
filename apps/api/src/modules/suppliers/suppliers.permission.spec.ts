import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { AuthenticatedUser } from '../auth/auth.types';
import { SuppliersService } from './suppliers.service';

const readOnlyActor: AuthenticatedUser = {
  id: 'ordinary-admin-1',
  username: 'ordinary-admin-1',
  name: '已撤销业务权限的普通管理员',
  email: null,
  departmentId: null,
  departmentName: null,
  isSystemAdmin: false,
  authSource: 'local', teamAccessApproved: false,
  roleCodes: ['admin'],
  permissionCodes: [],
};

function createHarness() {
  const prisma = {
    supplier: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi
      .fn()
      .mockRejectedValue(new Error('unauthorized supplier write reached database')),
  };
  const service = new SuppliersService(
    prisma as never,
    {} as never,
    { get: vi.fn() } as never,
  );
  return { service, prisma };
}

describe('SuppliersService permission matrix', () => {
  it('denies supplier contacts to a role-holder whose project.read permission was revoked', async () => {
    const { service, prisma } = createHarness();

    await expect(service.listSuppliers(readOnlyActor)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.supplier.findMany).not.toHaveBeenCalled();
  });

  it.each(['create', 'update'] as const)(
    'denies %s to a role-holder whose workflow.transition permission was revoked',
    async (action) => {
      const { service, prisma } = createHarness();
      const payload = {
        supplierCode: 'SUP-001',
        supplierName: '安全供应商',
        contactName: '联系人',
        contactPhone: '10086',
        status: 'ACTIVE',
      };

      const request = action === 'create'
        ? service.createSupplier(payload, readOnlyActor)
        : service.updateSupplier('supplier-1', payload, readOnlyActor);

      await expect(request).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it('allows the explicit native system administrator without legacy roles', async () => {
    const { service, prisma } = createHarness();
    const systemAdmin: AuthenticatedUser = {
      ...readOnlyActor,
      id: 'system-admin-1',
      username: 'system-admin-1',
      isSystemAdmin: true,
    };

    await expect(service.listSuppliers(systemAdmin)).resolves.toEqual({
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 1,
      items: [],
    });
    expect(prisma.supplier.findMany).toHaveBeenCalledTimes(1);
  });
});
