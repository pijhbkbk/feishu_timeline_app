import { UserStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { UsersService } from './users.service';

function createService(tx: Record<string, unknown>) {
  const prisma = {
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };

  return {
    service: new UsersService(prisma as never),
    prisma,
  };
}

describe('UsersService', () => {
  it('preserves the assigned least-privilege role for an active authenticated user', async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'viewer-user',
          username: 'viewer-user',
          name: '普通用户',
          email: null,
          departmentId: null,
          status: UserStatus.ACTIVE,
          isSystemAdmin: false,
          department: null,
          userRoles: [
            {
              role: {
                code: 'viewer',
                rolePermissions: [{ permissionCode: 'project.read' }],
              },
            },
          ],
        }),
      },
    };
    const service = new UsersService(prisma as never);

    await expect(service.getAuthenticatedUser('viewer-user', 'feishu')).resolves.toMatchObject({
      id: 'viewer-user',
      isSystemAdmin: false,
      roleCodes: ['viewer'],
      permissionCodes: ['project.read'],
    });
  });

  it('assigns the existing viewer role without mutating its governed definition', async () => {
    const tx = {
      user: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'user-1' }),
      },
      userRole: {
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn(),
      },
      role: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'role-viewer',
          code: 'viewer',
          status: 'ACTIVE',
        }),
        upsert: vi.fn(),
      },
      rolePermission: {
        deleteMany: vi.fn(),
        createMany: vi.fn(),
      },
    };
    const { service } = createService(tx);

    await service.upsertFeishuUser({
      openId: 'ou-user-1',
      userId: 'feishu-user-1',
      unionId: null,
      name: '飞书用户',
      email: null,
    });

    expect(tx.role.findUnique).toHaveBeenCalledWith({
      where: { code: 'viewer' },
      select: { id: true, code: true, status: true },
    });
    expect(tx.role.upsert).not.toHaveBeenCalled();
    expect(tx.rolePermission.deleteMany).not.toHaveBeenCalled();
    expect(tx.rolePermission.createMany).not.toHaveBeenCalled();
    expect(tx.userRole.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        roleId: 'role-viewer',
      },
    });
  });

  it('fails closed when the governed default Feishu role is missing', async () => {
    const tx = {
      user: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'user-1' }),
      },
      userRole: {
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn(),
      },
      role: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };
    const { service } = createService(tx);

    await expect(
      service.upsertFeishuUser({
        openId: 'ou-missing-role',
        userId: 'feishu-missing-role',
        unionId: null,
        name: '飞书用户',
        email: null,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'DEFAULT_FEISHU_ROLE_MISSING' }),
    });

    expect(tx.userRole.create).not.toHaveBeenCalled();
  });

  it('keeps existing Feishu role assignments unchanged', async () => {
    const tx = {
      user: {
        findFirst: vi.fn().mockResolvedValue({ id: 'user-1', email: 'old@example.com' }),
        update: vi.fn().mockResolvedValue({ id: 'user-1' }),
      },
      userRole: {
        count: vi.fn().mockResolvedValue(1),
        create: vi.fn(),
      },
      role: {
        upsert: vi.fn(),
      },
      rolePermission: {
        deleteMany: vi.fn(),
        createMany: vi.fn(),
      },
    };
    const { service } = createService(tx);

    await service.upsertFeishuUser({
      openId: 'ou-user-1',
      userId: 'feishu-user-1',
      unionId: null,
      name: '飞书用户',
      email: null,
    });

    expect(tx.userRole.count).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
      },
    });
    expect(tx.role.upsert).not.toHaveBeenCalled();
    expect(tx.userRole.create).not.toHaveBeenCalled();
    expect(tx.rolePermission.deleteMany).not.toHaveBeenCalled();
  });

  it('reconciles a test-version Feishu identity with an existing user by verified mobile', async () => {
    const existingUser = {
      id: 'user-1',
      email: 'existing@example.com',
      mobile: '13800000000',
    };
    const tx = {
      user: {
        findFirst: vi.fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(existingUser),
        update: vi.fn().mockResolvedValue({ id: 'user-1' }),
        create: vi.fn(),
      },
      userRole: {
        count: vi.fn().mockResolvedValue(1),
        create: vi.fn(),
      },
      role: {
        upsert: vi.fn(),
      },
      rolePermission: {
        deleteMany: vi.fn(),
        createMany: vi.fn(),
      },
    };
    const { service } = createService(tx);

    await service.upsertFeishuUser({
      openId: 'ou-test-version',
      userId: null,
      unionId: 'on-cross-app',
      name: '飞书测试用户',
      email: null,
      mobile: '13800000000',
    });

    expect(tx.user.findFirst).toHaveBeenNthCalledWith(1, {
      where: {
        OR: [
          { feishuOpenId: 'ou-test-version' },
          { feishuUnionId: 'on-cross-app' },
        ],
      },
    });
    expect(tx.user.findFirst).toHaveBeenNthCalledWith(2, {
      where: {
        OR: [{ mobile: '13800000000' }],
      },
    });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        username: 'feishu_ou-test-version',
        name: '飞书测试用户',
        email: 'existing@example.com',
        mobile: '13800000000',
        feishuOpenId: 'ou-test-version',
        feishuUserId: null,
        feishuUnionId: 'on-cross-app',
      },
    });
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it.each([UserStatus.INACTIVE, UserStatus.LOCKED])(
    'does not reactivate an existing %s Feishu user during profile refresh',
    async (status) => {
      const existingUser = {
        id: 'user-disabled',
        email: 'disabled@example.com',
        mobile: null,
        status,
      };
      const tx = {
        user: {
          findFirst: vi.fn().mockResolvedValue(existingUser),
          update: vi.fn().mockResolvedValue(existingUser),
        },
        userRole: {
          count: vi.fn().mockResolvedValue(1),
          create: vi.fn(),
        },
        role: {
          upsert: vi.fn(),
        },
        rolePermission: {
          deleteMany: vi.fn(),
          createMany: vi.fn(),
        },
      };
      const { service } = createService(tx);

      await expect(
        service.upsertFeishuUser({
          openId: 'ou-disabled',
          userId: 'feishu-disabled',
          unionId: null,
          name: '停用用户',
          email: null,
        }),
      ).resolves.toMatchObject({ status });

      const updateInput = tx.user.update.mock.calls[0]?.[0];
      expect(updateInput.data).not.toHaveProperty('status');
    },
  );
});
