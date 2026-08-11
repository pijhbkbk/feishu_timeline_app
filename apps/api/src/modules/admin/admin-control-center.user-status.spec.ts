import { UserStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthenticatedUser } from '../auth/auth.types';
import { AdminControlCenterService } from './admin-control-center.service';

type UserRow = {
  id: string;
  name: string;
  status: UserStatus;
  isSystemAdmin: boolean;
  updatedAt: Date;
};

type CommandRow = {
  action: string;
  requestHash: string;
  result: Record<string, unknown>;
};

describe('AdminControlCenterService user status security boundary', () => {
  const initialVersion = new Date('2026-08-11T00:00:00.000Z');
  const nextVersion = new Date('2026-08-11T00:01:00.000Z');
  let users: Map<string, UserRow>;
  let commandRequests: Map<string, CommandRow>;
  let lockTails: Map<string, Promise<void>>;

  const queryRaw = vi.fn();
  const userFindUnique = vi.fn(
    async ({ where }: { where: { id: string } }) => {
      const user = users.get(where.id);
      return user ? { ...user } : null;
    },
  );
  const userCount = vi.fn(async () =>
    [...users.values()].filter(
      (user) => user.isSystemAdmin && user.status === UserStatus.ACTIVE,
    ).length,
  );
  const userUpdateMany = vi.fn(
    async ({
      where,
      data,
    }: {
      where: { id: string; updatedAt?: Date };
      data: { status: UserStatus };
    }) => {
      const current = users.get(where.id);
      if (
        !current ||
        (where.updatedAt &&
          current.updatedAt.getTime() !== where.updatedAt.getTime())
      ) {
        return { count: 0 };
      }
      users.set(where.id, {
        ...current,
        status: data.status,
        updatedAt: nextVersion,
      });
      return { count: 1 };
    },
  );
  const commandFindUnique = vi.fn(
    async ({ where }: { where: { idempotencyKey: string } }) =>
      commandRequests.get(where.idempotencyKey) ?? null,
  );
  const commandCreate = vi.fn(
    async ({
      data,
    }: {
      data: CommandRow & { idempotencyKey: string };
    }) => {
      commandRequests.set(data.idempotencyKey, {
        action: data.action,
        requestHash: data.requestHash,
        result: data.result,
      });
      return { id: `command-${commandRequests.size}` };
    },
  );

  type TestTransaction = {
    $queryRaw: (query: { values?: unknown[] }) => Promise<Array<{ locked: boolean }>>;
    user: {
      findUnique: typeof userFindUnique;
      count: typeof userCount;
      updateMany: typeof userUpdateMany;
    };
    adminCommandRequest: {
      findUnique: typeof commandFindUnique;
      create: typeof commandCreate;
    };
  };

  const prisma = {
    adminCommandRequest: {
      findUnique: commandFindUnique,
    },
    $transaction: vi.fn(
      async (callback: (client: TestTransaction) => Promise<unknown>) => {
        const heldLocks: Array<{
          key: string;
          tail: Promise<void>;
          release: () => void;
        }> = [];
        const client: TestTransaction = {
          $queryRaw: async (query) => {
            queryRaw(query);
            const key = JSON.stringify(query.values ?? []);
            const previous = lockTails.get(key) ?? Promise.resolve();
            let release!: () => void;
            const tail = new Promise<void>((resolve) => {
              release = resolve;
            });
            lockTails.set(key, tail);
            await previous;
            heldLocks.push({ key, tail, release });
            return [{ locked: true }];
          },
          user: {
            findUnique: userFindUnique,
            count: userCount,
            updateMany: userUpdateMany,
          },
          adminCommandRequest: {
            findUnique: commandFindUnique,
            create: commandCreate,
          },
        };
        try {
          return await callback(client);
        } finally {
          for (const heldLock of heldLocks.reverse()) {
            heldLock.release();
            if (lockTails.get(heldLock.key) === heldLock.tail) {
              lockTails.delete(heldLock.key);
            }
          }
        }
      },
    ),
  };

  const activityLogsService = {
    createWithExecutor: vi.fn(async () => ({ id: 'audit-1' })),
  };

  let service: AdminControlCenterService;

  beforeEach(() => {
    vi.clearAllMocks();
    commandRequests = new Map();
    lockTails = new Map();
    users = new Map([
      [
        'super-a',
        {
          id: 'super-a',
          name: '超级管理员甲',
          status: UserStatus.ACTIVE,
          isSystemAdmin: true,
          updatedAt: initialVersion,
        },
      ],
      [
        'super-b',
        {
          id: 'super-b',
          name: '超级管理员乙',
          status: UserStatus.ACTIVE,
          isSystemAdmin: true,
          updatedAt: initialVersion,
        },
      ],
      [
        'ordinary-user',
        {
          id: 'ordinary-user',
          name: '普通用户',
          status: UserStatus.ACTIVE,
          isSystemAdmin: false,
          updatedAt: initialVersion,
        },
      ],
    ]);
    service = new AdminControlCenterService(
      prisma as never,
      activityLogsService as never,
      {} as never,
    );
  });

  it('rejects an ordinary administrator before changing a system administrator', async () => {
    await expect(
      service.changeUserStatus(
        'super-a',
        statusInput('ordinary-admin-command', UserStatus.LOCKED),
        actor('ordinary-admin', false),
        'request-ordinary-admin',
      ),
    ).rejects.toMatchObject({ status: 403 });

    expect(userUpdateMany).not.toHaveBeenCalled();
    expect(activityLogsService.createWithExecutor).not.toHaveBeenCalled();
  });

  it('preserves the existing delegated-admin path for a non-system user', async () => {
    await expect(
      service.changeUserStatus(
        'ordinary-user',
        statusInput('ordinary-user-command', UserStatus.LOCKED),
        actor('ordinary-admin', false),
        'request-ordinary-user',
      ),
    ).resolves.toMatchObject({
      userId: 'ordinary-user',
      status: UserStatus.LOCKED,
      idempotentReplay: false,
    });

    expect(users.get('ordinary-user')?.status).toBe(UserStatus.LOCKED);
  });

  it('serializes cross-deactivation so at least one active system administrator remains', async () => {
    const results = await Promise.allSettled([
      service.changeUserStatus(
        'super-b',
        statusInput('deactivate-super-b', UserStatus.INACTIVE),
        actor('super-a', true),
        'request-deactivate-super-b',
      ),
      service.changeUserStatus(
        'super-a',
        statusInput('deactivate-super-a', UserStatus.INACTIVE),
        actor('super-b', true),
        'request-deactivate-super-a',
      ),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(
      [...users.values()].filter(
        (user) => user.isSystemAdmin && user.status === UserStatus.ACTIVE,
      ),
    ).toHaveLength(1);
    expect(userUpdateMany).toHaveBeenCalledTimes(1);
    expect(activityLogsService.createWithExecutor).toHaveBeenCalledTimes(1);
    expect(systemAdministratorLockCalls()).toHaveLength(2);
  });

  it('replays two concurrent identical commands after one status write and audit', async () => {
    const input = statusInput('same-command', UserStatus.LOCKED);
    const results = await Promise.all([
      service.changeUserStatus(
        'ordinary-user',
        input,
        actor('ordinary-admin', false),
        'request-same-command',
      ),
      service.changeUserStatus(
        'ordinary-user',
        input,
        actor('ordinary-admin', false),
        'request-same-command',
      ),
    ]);

    expect(results.map((result) => result.idempotentReplay).sort()).toEqual([
      false,
      true,
    ]);
    expect(userUpdateMany).toHaveBeenCalledTimes(1);
    expect(activityLogsService.createWithExecutor).toHaveBeenCalledTimes(1);
    expect(commandCreate).toHaveBeenCalledTimes(1);
    expect(systemAdministratorLockCalls()).toHaveLength(1);
  });

  function systemAdministratorLockCalls() {
    return queryRaw.mock.calls.filter(([query]) =>
      (query as { values?: unknown[] }).values?.includes(
        'feishu-timeline:system-administrator-mutation',
      ),
    );
  }

  function actor(id: string, isSystemAdmin: boolean): AuthenticatedUser {
    return {
      id,
      username: id,
      name: id,
      email: null,
      departmentId: null,
      departmentName: null,
      isSystemAdmin,
      authSource: 'mock',
      roleCodes: ['admin'],
      permissionCodes: ['system.manage'],
    };
  }

  function statusInput(idempotencyKey: string, status: UserStatus) {
    return {
      expectedVersion: initialVersion.toISOString(),
      status,
      idempotencyKey,
      reason: '安全治理状态调整',
    };
  }
});
