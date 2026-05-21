import { describe, expect, it, vi } from 'vitest';

import { ROLE_PERMISSION_CODE_MAP } from '../auth/auth.constants';
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
  it('assigns the read-only viewer role to new Feishu users', async () => {
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
        upsert: vi.fn().mockResolvedValue({ id: 'role-viewer', code: 'viewer' }),
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

    expect(tx.role.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { code: 'viewer' },
      }),
    );
    expect(tx.rolePermission.createMany).toHaveBeenCalledWith({
      data: ROLE_PERMISSION_CODE_MAP.viewer.map((permissionCode) => ({
        roleId: 'role-viewer',
        permissionCode,
      })),
    });
    expect(tx.userRole.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        roleId: 'role-viewer',
      },
    });
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
});
