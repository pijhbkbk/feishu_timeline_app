import { SupplierStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import type { AuthenticatedUser } from '../auth/auth.types';
import { SuppliersService } from './suppliers.service';

const actor: AuthenticatedUser = {
  id: 'supplier-manager',
  username: 'supplier-manager',
  name: '供应商管理员',
  email: null,
  departmentId: null,
  departmentName: null,
  isSystemAdmin: false,
  authSource: 'mock',
  roleCodes: ['purchaser'],
  permissionCodes: ['project.read', 'workflow.transition'],
};

const baseInput = {
  supplierCode: 'SUP-001',
  supplierName: '安全供应商',
  contactName: '联系人',
  contactPhone: '+86 138-0000-0000',
  status: SupplierStatus.ACTIVE,
};

type SupplierRow = ReturnType<typeof createSupplierRow>;

function createSupplierRow(overrides: Partial<{
  id: string;
  supplierCode: string;
  supplierName: string;
  contactName: string | null;
  contactPhone: string | null;
  status: SupplierStatus;
  createdAt: Date;
  updatedAt: Date;
}> = {}) {
  return {
    id: 'supplier-1',
    supplierCode: 'SUP-001',
    supplierName: '安全供应商',
    contactName: '联系人',
    contactPhone: '+86 138-0000-0000',
    email: null,
    status: SupplierStatus.ACTIVE,
    createdAt: new Date('2026-08-11T00:00:00.000Z'),
    updatedAt: new Date('2026-08-11T00:00:00.000Z'),
    ...overrides,
  };
}

function createMutationHarness(options: {
  initialSupplier?: SupplierRow;
  catalogCount?: number;
  mutationCount?: number;
} = {}) {
  const suppliers: SupplierRow[] = options.initialSupplier
    ? [{ ...options.initialSupplier }]
    : [];
  const commands: Array<{
    id: string;
    actorUserId: string;
    idempotencyKey: string;
    action: string;
    targetId: string | null;
    requestHash: string;
    resultSnapshot: Record<string, unknown>;
    createdAt: Date;
  }> = [];
  let bucket = options.mutationCount === undefined
    ? null
    : {
        actorUserId: actor.id,
        windowStartedAt: new Date(),
        requestCount: options.mutationCount,
      };
  let transactionTail = Promise.resolve();

  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(0),
    supplier: {
      count: vi.fn().mockImplementation(() =>
        Promise.resolve(options.catalogCount ?? suppliers.length),
      ),
      findUnique: vi.fn().mockImplementation(({ where }: { where: Record<string, string> }) => {
        const row = 'supplierCode' in where
          ? suppliers.find((item) => item.supplierCode === where.supplierCode)
          : suppliers.find((item) => item.id === where.id);
        return Promise.resolve(row ? { ...row } : null);
      }),
      findUniqueOrThrow: vi.fn().mockImplementation(({ where }: { where: { id: string } }) => {
        const row = suppliers.find((item) => item.id === where.id);
        if (!row) throw new Error('supplier missing');
        return Promise.resolve({ ...row });
      }),
      create: vi.fn().mockImplementation(({ data }: { data: Omit<SupplierRow, 'id' | 'email' | 'createdAt' | 'updatedAt'> }) => {
        const row = createSupplierRow({
          ...data,
          id: `supplier-${suppliers.length + 1}`,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        suppliers.push(row);
        return Promise.resolve({ ...row });
      }),
      update: vi.fn().mockImplementation(({ where, data }: {
        where: { id: string };
        data: Partial<SupplierRow>;
      }) => {
        const row = suppliers.find((item) => item.id === where.id);
        if (!row) throw new Error('supplier missing');
        Object.assign(row, data, { updatedAt: new Date(row.updatedAt.getTime() + 1) });
        return Promise.resolve({ ...row });
      }),
      updateMany: vi.fn().mockImplementation(({ where, data }: {
        where: { id: string; updatedAt: Date };
        data: Partial<SupplierRow>;
      }) => {
        const row = suppliers.find(
          (item) =>
            item.id === where.id &&
            item.updatedAt.getTime() === where.updatedAt.getTime(),
        );
        if (!row) return Promise.resolve({ count: 0 });
        Object.assign(row, data, { updatedAt: new Date(row.updatedAt.getTime() + 1) });
        return Promise.resolve({ count: 1 });
      }),
    },
    supplierCommandRequest: {
      deleteMany: vi.fn().mockImplementation(() => Promise.resolve({ count: 0 })),
      count: vi.fn().mockImplementation(() => Promise.resolve(commands.length)),
      findUnique: vi.fn().mockImplementation(({ where }: {
        where: { actorUserId_idempotencyKey: { actorUserId: string; idempotencyKey: string } };
      }) => Promise.resolve(
        commands.find(
          (item) =>
            item.actorUserId === where.actorUserId_idempotencyKey.actorUserId &&
            item.idempotencyKey === where.actorUserId_idempotencyKey.idempotencyKey,
        ) ?? null,
      )),
      create: vi.fn().mockImplementation(({ data }: { data: Omit<(typeof commands)[number], 'id' | 'createdAt'> }) => {
        const record = {
          ...data,
          id: `command-${commands.length + 1}`,
          createdAt: new Date(),
        };
        commands.push(record);
        return Promise.resolve(record);
      }),
    },
    supplierMutationBucket: {
      findUnique: vi.fn().mockImplementation(() => Promise.resolve(bucket)),
      upsert: vi.fn().mockImplementation(({ create, update }: {
        create: typeof bucket;
        update: Partial<NonNullable<typeof bucket>>;
      }) => {
        bucket = bucket ? { ...bucket, ...update } : create;
        return Promise.resolve(bucket);
      }),
      update: vi.fn().mockImplementation(({ data }: {
        data: Omit<Partial<NonNullable<typeof bucket>>, 'requestCount'> & {
          requestCount?: number | { increment: number };
        };
      }) => {
        if (!bucket) throw new Error('bucket missing');
        const { requestCount, ...otherData } = data;
        bucket = {
          ...bucket,
          ...otherData,
          requestCount:
            typeof requestCount === 'object'
              ? bucket.requestCount + requestCount.increment
              : (requestCount ?? bucket.requestCount),
        };
        return Promise.resolve(bucket);
      }),
    },
  };

  const prisma = {
    ...tx,
    $transaction: vi.fn(<T>(callback: (client: typeof tx) => Promise<T>) => {
      const execution = transactionTail.then(() => callback(tx));
      transactionTail = execution.then(() => undefined, () => undefined);
      return execution;
    }),
  };
  const activityLogsService = {
    createWithExecutor: vi.fn().mockResolvedValue({ id: 'audit-1' }),
  };
  const configService = {
    get: vi.fn((key: string) => ({
      supplierCatalogMaxItems: 5_000,
      supplierMutationMaxRequests: 30,
      supplierMutationWindowMs: 3_600_000,
    })[key]),
  };
  const service = new SuppliersService(
    prisma as never,
    activityLogsService as never,
    configService as never,
  );

  return {
    service,
    prisma,
    tx,
    suppliers,
    commands,
    activityLogsService,
  };
}

function createWithKey(
  service: SuppliersService,
  input: typeof baseInput,
  idempotencyKey: string,
) {
  return (
    service.createSupplier as unknown as (
      rawInput: unknown,
      currentActor: AuthenticatedUser,
      key: string,
    ) => Promise<Record<string, unknown>>
  )(input, actor, idempotencyKey);
}

function updateWithKey(
  service: SuppliersService,
  supplierId: string,
  input: typeof baseInput & { expectedVersion: string },
  idempotencyKey: string,
  currentActor: AuthenticatedUser = actor,
) {
  return (
    service.updateSupplier as unknown as (
      id: string,
      rawInput: unknown,
      currentActor: AuthenticatedUser,
      key: string,
    ) => Promise<Record<string, unknown>>
  )(supplierId, input, currentActor, idempotencyKey);
}

describe('SuppliersService mutation integrity', () => {
  it('replays concurrent create requests with the same actor, key, and payload', async () => {
    const { service, tx, commands, activityLogsService } = createMutationHarness();

    const [first, second] = await Promise.all([
      createWithKey(service, baseInput, 'supplier-create-1'),
      createWithKey(service, baseInput, 'supplier-create-1'),
    ]);

    expect([first.idempotentReplay, second.idempotentReplay].sort()).toEqual([
      false,
      true,
    ]);
    expect(tx.supplier.create).toHaveBeenCalledTimes(1);
    expect(activityLogsService.createWithExecutor).toHaveBeenCalledTimes(1);
    expect(commands).toHaveLength(1);
  });

  it('rejects a changed payload under an existing idempotency key', async () => {
    const { service, tx, activityLogsService } = createMutationHarness();
    await createWithKey(service, baseInput, 'supplier-create-2');

    await expect(
      createWithKey(
        service,
        { ...baseInput, supplierName: '不同供应商' },
        'supplier-create-2',
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST',
      }),
    });
    expect(tx.supplier.create).toHaveBeenCalledTimes(1);
    expect(activityLogsService.createWithExecutor).toHaveBeenCalledTimes(1);
  });

  it('rejects create at the configured global catalog cap before supplier or audit writes', async () => {
    const { service, tx, activityLogsService } = createMutationHarness({
      catalogCount: 5_000,
    });

    await expect(
      createWithKey(service, baseInput, 'supplier-capacity-1'),
    ).rejects.toMatchObject({
      status: 507,
      response: expect.objectContaining({
        code: 'SUPPLIER_CATALOG_CAPACITY_EXCEEDED',
      }),
    });
    expect(tx.supplier.create).not.toHaveBeenCalled();
    expect(activityLogsService.createWithExecutor).not.toHaveBeenCalled();
  });

  it('rejects an actor at the persisted mutation rate before supplier or audit writes', async () => {
    const { service, tx, activityLogsService } = createMutationHarness({
      mutationCount: 30,
    });

    await expect(
      createWithKey(service, baseInput, 'supplier-rate-1'),
    ).rejects.toMatchObject({
      status: 429,
      response: expect.objectContaining({
        code: 'SUPPLIER_MUTATION_RATE_EXCEEDED',
      }),
    });
    expect(tx.supplier.create).not.toHaveBeenCalled();
    expect(activityLogsService.createWithExecutor).not.toHaveBeenCalled();
  });

  it('commits mutation admission in a short transaction before a later domain rejection', async () => {
    const { service, prisma, tx, activityLogsService } = createMutationHarness({
      initialSupplier: createSupplierRow(),
    });

    await expect(
      createWithKey(service, baseInput, 'supplier-duplicate-attempt-1'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        message: '供应商编码已存在。',
      }),
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(tx.supplierMutationBucket.upsert).toHaveBeenCalledTimes(1);
    expect(tx.supplier.create).not.toHaveBeenCalled();
    expect(activityLogsService.createWithExecutor).not.toHaveBeenCalled();
  });

  it('replays a successful update after its expectedVersion has advanced', async () => {
    const initial = createSupplierRow();
    const { service, tx, commands, activityLogsService } = createMutationHarness({
      initialSupplier: initial,
    });
    const input = {
      ...baseInput,
      supplierName: '更新后的供应商',
      expectedVersion: initial.updatedAt.toISOString(),
    };

    const first = await updateWithKey(service, initial.id, input, 'supplier-update-1');
    const replay = await updateWithKey(service, initial.id, input, 'supplier-update-1');

    expect(first.idempotentReplay).toBe(false);
    expect(replay.idempotentReplay).toBe(true);
    expect(tx.supplier.updateMany).toHaveBeenCalledTimes(1);
    expect(activityLogsService.createWithExecutor).toHaveBeenCalledTimes(1);
    expect(commands).toHaveLength(1);
  });

  it('lets only one different-key update claim the same expectedVersion', async () => {
    const initial = createSupplierRow();
    const { service, tx, activityLogsService } = createMutationHarness({
      initialSupplier: initial,
    });
    const input = {
      ...baseInput,
      expectedVersion: initial.updatedAt.toISOString(),
    };
    const results = await Promise.allSettled([
      updateWithKey(
        service,
        initial.id,
        { ...input, supplierName: '更新 A' },
        'supplier-update-a',
      ),
      updateWithKey(
        service,
        initial.id,
        { ...input, supplierName: '更新 B' },
        'supplier-update-b',
      ),
    ]);

    expect(results.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((item) => item.status === 'rejected')).toHaveLength(1);
    expect(tx.supplier.updateMany).toHaveBeenCalledTimes(1);
    expect(activityLogsService.createWithExecutor).toHaveBeenCalledTimes(1);
  });

  it('uses the supplier row CAS when different actors race from the same version', async () => {
    const initial = createSupplierRow();
    const current = { ...initial };
    let arrivals = 0;
    let releaseBoth!: () => void;
    const bothArrived = new Promise<void>((resolve) => {
      releaseBoth = resolve;
    });
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(0),
      supplier: {
        findUnique: vi.fn().mockImplementation(() => Promise.resolve({ ...initial })),
        updateMany: vi.fn().mockImplementation(async ({ where, data }: {
          where: { id: string; updatedAt: Date };
          data: Partial<SupplierRow>;
        }) => {
          arrivals += 1;
          if (arrivals === 2) releaseBoth();
          await bothArrived;
          if (
            current.id !== where.id ||
            current.updatedAt.getTime() !== where.updatedAt.getTime()
          ) {
            return { count: 0 };
          }
          Object.assign(current, data, {
            updatedAt: new Date(current.updatedAt.getTime() + 1),
          });
          return { count: 1 };
        }),
        findUniqueOrThrow: vi.fn().mockImplementation(() => Promise.resolve({ ...current })),
      },
      supplierCommandRequest: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'command-winner' }),
      },
    };
    const prisma = {
      supplierCommandRequest: tx.supplierCommandRequest,
      $transaction: vi.fn(<T>(callback: (client: typeof tx) => Promise<T>) => callback(tx)),
    };
    const activityLogsService = {
      createWithExecutor: vi.fn().mockResolvedValue({ id: 'audit-winner' }),
    };
    const service = new SuppliersService(
      prisma as never,
      activityLogsService as never,
      {
        get: vi.fn((key: string) => ({
          supplierCatalogMaxItems: 5_000,
          supplierMutationMaxRequests: 30,
          supplierMutationWindowMs: 3_600_000,
        })[key]),
      } as never,
    );
    vi.spyOn(
      service as unknown as {
        admitSupplierMutationAttempt: (actorUserId: string) => Promise<void>;
      },
      'admitSupplierMutationAttempt',
    ).mockResolvedValue(undefined);
    const otherActor = { ...actor, id: 'supplier-manager-2' };
    const input = {
      ...baseInput,
      expectedVersion: initial.updatedAt.toISOString(),
    };

    const results = await Promise.allSettled([
      updateWithKey(
        service,
        initial.id,
        { ...input, supplierName: '更新 A' },
        'supplier-actor-a',
        actor,
      ),
      updateWithKey(
        service,
        initial.id,
        { ...input, supplierName: '更新 B' },
        'supplier-actor-b',
        otherActor,
      ),
    ]);

    expect(results.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((item) => item.status === 'rejected')).toHaveLength(1);
    expect(tx.supplier.updateMany).toHaveBeenCalledTimes(2);
    expect(activityLogsService.createWithExecutor).toHaveBeenCalledTimes(1);
  });

  it('records an idempotent no-op result without appending a supplier audit', async () => {
    const initial = createSupplierRow();
    const { service, tx, commands, activityLogsService } = createMutationHarness({
      initialSupplier: initial,
    });

    const result = await updateWithKey(
      service,
      initial.id,
      { ...baseInput, expectedVersion: initial.updatedAt.toISOString() },
      'supplier-noop-1',
    );

    expect(result).toMatchObject({ id: initial.id, idempotentReplay: false });
    expect(tx.supplier.updateMany).not.toHaveBeenCalled();
    expect(activityLogsService.createWithExecutor).not.toHaveBeenCalled();
    expect(commands).toHaveLength(1);
  });
});
