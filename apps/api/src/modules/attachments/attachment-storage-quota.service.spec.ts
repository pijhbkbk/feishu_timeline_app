import { HttpStatus } from '@nestjs/common';
import { AttachmentBinaryState, AttachmentScanStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { AttachmentStorageQuotaService } from './attachment-storage-quota.service';

const quotaConfig = new Map<string, number>([
  ['attachmentStorageGlobalMaxBytes', 1_000],
  ['attachmentStorageProjectMaxBytes', 800],
  ['attachmentStorageActorMaxBytes', 500],
  ['attachmentStorageGlobalMaxObjects', 4],
  ['attachmentStorageProjectMaxObjects', 3],
  ['attachmentStorageActorMaxObjects', 2],
  ['attachmentStorageMinFreeBytes', 256],
  ['attachmentStorageReservationTtlMs', 7_200_000],
  ['attachmentStorageActorWindowMs', 2_592_000_000],
  ['attachmentStorageReconcileBatchSize', 100],
  ['attachmentStorageReconciliationLeaseMs', 300_000],
  ['attachmentStorageReconciliationRetryMs', 300_000],
  ['attachmentStoragePurgedMetadataRetentionMs', 7_776_000_000],
]);

describe('AttachmentStorageQuotaService', () => {
  it('charges all null-project sheet images to the same bounded project quota', async () => {
    const harness = createHarness({ project: usage(790, 1) });
    await expect(harness.service.reserve({ ...reservationInput(128), projectId: null, targetType: 'SHEET_PERSON', targetId: 'person-1' })).rejects.toMatchObject({ response: expect.objectContaining({ code: 'ATTACHMENT_STORAGE_QUOTA_EXCEEDED', scope: 'PROJECT' }) });
    expect(harness.tx.attachmentStorageReservation.aggregate).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ projectId: null }) }));
    expect(harness.tx.attachmentStorageReservation.create).not.toHaveBeenCalled();
  });
  it('rejects mixing legacy targets with null project and sheet targets with a project', async () => {
    const harness = createHarness();
    await expect(harness.service.reserve({ ...reservationInput(128), projectId: null })).rejects.toThrow('SCOPE_INVALID');
    await expect(harness.service.reserve({ ...reservationInput(128), targetType: 'SHEET_COLOR' })).rejects.toThrow('SCOPE_INVALID');
    expect(harness.prisma.$transaction).not.toHaveBeenCalled();
  });
  it('starts one bounded reconciliation pass immediately instead of waiting for the first interval', async () => {
    const harness = createHarness();
    const reconcile = vi
      .spyOn(harness.service, 'reconcileExpiredReservations')
      .mockResolvedValue({ claimed: 0, purged: 0, retained: 0, failed: 0 });

    harness.service.onModuleInit();
    await vi.waitFor(() => expect(reconcile).toHaveBeenCalledOnce());
    harness.service.onModuleDestroy();
  });

  it('returns a fixed 507 before opening a database transaction when disk headroom is unavailable', async () => {
    const harness = createHarness();
    harness.objectStorageService.assertWriteCapacity.mockRejectedValueOnce(
      new Error('OBJECT_STORAGE_CAPACITY_BELOW_RESERVED_HEADROOM'),
    );

    await expect(
      harness.service.reserve(reservationInput(128)),
    ).rejects.toMatchObject({
      status: HttpStatus.INSUFFICIENT_STORAGE,
      response: expect.objectContaining({
        code: 'ATTACHMENT_STORAGE_CAPACITY_INSUFFICIENT',
      }),
    });
    expect(harness.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an actor byte quota before creating a reservation', async () => {
    const harness = createHarness({
      global: usage(400, 1),
      project: usage(400, 1),
      actor: usage(450, 1),
    });

    await expect(
      harness.service.reserve({
        projectId: 'project-1',
        actorUserId: 'actor-1',
        targetType: 'PROJECT',
        targetId: 'project-1',
        bucket: 'bucket-1',
        quarantineStorageKey: 'quarantine/project-1/a.pdf',
        cleanStorageKey: 'project-1/a.pdf',
        bytes: 100,
      }),
    ).rejects.toMatchObject({
      status: HttpStatus.INSUFFICIENT_STORAGE,
      response: expect.objectContaining({
        code: 'ATTACHMENT_STORAGE_QUOTA_EXCEEDED',
        scope: 'ACTOR',
      }),
    });

    expect(harness.tx.attachmentStorageReservation.create).not.toHaveBeenCalled();
  });

  it('preflights disk capacity outside the transaction, then atomically persists a bounded reservation', async () => {
    const harness = createHarness();

    await expect(
      harness.service.reserve({
        projectId: 'project-1',
        actorUserId: 'actor-1',
        targetType: 'PROJECT',
        targetId: 'project-1',
        bucket: 'bucket-1',
        quarantineStorageKey: 'quarantine/project-1/a.pdf',
        cleanStorageKey: 'project-1/a.pdf',
        bytes: 128,
      }),
    ).resolves.toMatchObject({
      id: 'reservation-1',
      state: AttachmentBinaryState.RESERVED,
      reservedBytes: 128n,
    });

    expect(harness.events).toEqual([
      'capacity',
      'advisory',
      'capacity:locked',
      'aggregate:outstanding',
      'aggregate:global',
      'aggregate:project',
      'aggregate:actor',
      'create',
    ]);
    expect(harness.tx.attachmentStorageReservation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: 'project-1',
        actorUserId: 'actor-1',
        reservedBytes: 128n,
        state: AttachmentBinaryState.RESERVED,
        leaseExpiresAt: expect.any(Date),
      }),
    });
  });

  it('subtracts concurrent outstanding reservations from observed free space under the admission lock', async () => {
    const harness = createHarness({ outstanding: usage(700, 2) });
    harness.objectStorageService.readAvailableBytes.mockResolvedValueOnce(1_000n);

    await expect(
      harness.service.reserve(reservationInput(100)),
    ).rejects.toMatchObject({
      status: HttpStatus.INSUFFICIENT_STORAGE,
      response: expect.objectContaining({
        code: 'ATTACHMENT_STORAGE_CAPACITY_INSUFFICIENT',
      }),
    });
    expect(harness.tx.attachmentStorageReservation.create).not.toHaveBeenCalled();
  });

  it('refreshes filesystem headroom under the quota lock after another upload becomes retained', async () => {
    const harness = createHarness();
    harness.objectStorageService.assertWriteCapacity.mockImplementationOnce(
      async () => {
        harness.events.push('capacity');
        return { availableBytes: 400n };
      },
    );
    harness.objectStorageService.readAvailableBytes.mockImplementationOnce(
      async () => {
        harness.events.push('capacity:locked');
        return 320n;
      },
    );

    await expect(
      harness.service.reserve(reservationInput(100)),
    ).rejects.toMatchObject({
      status: HttpStatus.INSUFFICIENT_STORAGE,
      response: expect.objectContaining({
        code: 'ATTACHMENT_STORAGE_CAPACITY_INSUFFICIENT',
      }),
    });

    expect(harness.events.slice(0, 3)).toEqual([
      'capacity',
      'advisory',
      'capacity:locked',
    ]);
    expect(harness.tx.attachmentStorageReservation.create).not.toHaveBeenCalled();
  });

  it('serializes RESERVED to RETAINED with the same quota advisory before changing accounting state', async () => {
    const harness = createHarness();

    await harness.service.markRetainedWithExecutor(harness.tx as never, {
      reservationId: 'reservation-1',
      ownerToken: 'reservation-owner',
      attachmentId: 'attachment-1',
    });

    expect(harness.events).toEqual(['advisory']);
    expect(
      harness.tx.$executeRaw.mock.invocationCallOrder[0],
    ).toBeLessThan(
      harness.tx.attachmentStorageReservation.updateMany.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('serializes near-quota reservations so exactly one concurrent request succeeds', async () => {
    const state = { bytes: 400n, count: 1 };
    let transactionTail = Promise.resolve();
    const harness = createHarness({
      transaction: async (callback, tx) => {
        const previous = transactionTail;
        let release!: () => void;
        transactionTail = new Promise<void>((resolve) => {
          release = resolve;
        });
        await previous;
        try {
          return await callback(tx);
        } finally {
          release();
        }
      },
      aggregate: () => usage(Number(state.bytes), state.count),
      create: async (input) => {
        state.bytes += input.data.reservedBytes as bigint;
        state.count += 1;
        return {
          id: `reservation-${state.count}`,
          ...input.data,
        };
      },
    });

    const results = await Promise.allSettled([
      harness.service.reserve(reservationInput(100)),
      harness.service.reserve(reservationInput(100)),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(state.bytes).toBe(500n);
    expect(harness.tx.attachmentStorageReservation.create).toHaveBeenCalledTimes(1);
  });

  it('releases quota only after physical purge succeeds', async () => {
    const harness = createHarness();
    harness.objectStorageService.purge.mockRejectedValueOnce(new Error('disk busy'));

    await expect(
      harness.service.purgeAndRelease({
        reservationId: 'reservation-1',
        expectedOwnerToken: 'reservation-owner',
        reason: 'SCAN_REJECTED',
      }),
    ).rejects.toThrow('disk busy');

    expect(harness.prisma.attachmentStorageReservation.updateMany).toHaveBeenLastCalledWith({
      where: {
        id: 'reservation-1',
        ownerToken: expect.any(String),
        state: AttachmentBinaryState.PURGING,
      },
      data: expect.objectContaining({
        state: AttachmentBinaryState.RECONCILIATION_REQUIRED,
      }),
    });
    expect(harness.prisma.attachmentStorageReservation.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ state: AttachmentBinaryState.PURGED }),
      }),
    );
  });

  it('marks quota PURGED only after physical deletion succeeds', async () => {
    const harness = createHarness();

    await harness.service.purgeAndRelease({
      reservationId: 'reservation-1',
      expectedOwnerToken: 'reservation-owner',
      reason: 'SCAN_REJECTED',
    });

    expect(harness.events).toContain('purge');
    expect(harness.tx.attachmentStorageReservation.updateMany).toHaveBeenLastCalledWith({
      where: {
        id: 'reservation-1',
        ownerToken: expect.any(String),
        state: AttachmentBinaryState.PURGING,
      },
      data: expect.objectContaining({
        state: AttachmentBinaryState.PURGED,
        purgedAt: expect.any(Date),
        leaseExpiresAt: null,
      }),
    });
  });

  it('claims only expired non-retained reservations in a bounded batch and suppresses overlapping runs', async () => {
    const harness = createHarness();
    const purgeStarted = createDeferred<void>();
    const releasePurge = createDeferred<void>();
    const candidate = {
      id: 'reservation-stale',
      attachmentId: 'attachment-stale',
      projectId: 'project-1',
      actorUserId: 'actor-1',
      bucket: 'bucket-1',
      quarantineStorageKey: 'quarantine/project-1/stale.pdf',
      cleanStorageKey: 'project-1/stale.pdf',
      state: AttachmentBinaryState.RESERVED,
      ownerToken: 'stale-owner',
      leaseExpiresAt: new Date('2026-08-11T07:00:00.000Z'),
      updatedAt: new Date('2026-08-11T07:00:00.000Z'),
    };
    harness.tx.attachmentStorageReservation.findMany
      .mockResolvedValueOnce([candidate] as never)
      .mockResolvedValueOnce([]);
    let purgeCall = 0;
    harness.objectStorageService.purge.mockImplementation(async () => {
      purgeCall += 1;
      harness.events.push('purge');
      if (purgeCall === 1) {
        purgeStarted.resolve();
        await releasePurge.promise;
      }
    });

    const first = harness.service.reconcileExpiredReservations();
    await purgeStarted.promise;
    await expect(harness.service.reconcileExpiredReservations()).resolves.toEqual({
      claimed: 0,
      purged: 0,
      retained: 0,
      failed: 0,
    });
    releasePurge.resolve();
    await expect(first).resolves.toEqual({
      claimed: 1,
      purged: 1,
      retained: 0,
      failed: 0,
    });

    expect(harness.tx.attachmentStorageReservation.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          state: {
            in: [
              AttachmentBinaryState.RESERVED,
              AttachmentBinaryState.PURGING,
              AttachmentBinaryState.RECONCILIATION_REQUIRED,
            ],
          },
        }),
        take: 100,
      }),
    );
    expect(harness.objectStorageService.purge).toHaveBeenCalledWith({
      bucket: 'bucket-1',
      storageKey: candidate.quarantineStorageKey,
    });
    expect(harness.objectStorageService.purge).toHaveBeenCalledWith({
      bucket: 'bucket-1',
      storageKey: candidate.cleanStorageKey,
    });
  });

  it('inventories an existing legacy binary as retained without deleting either deterministic key', async () => {
    const harness = createHarness();
    const candidate = staleCandidate({
      reservedBytes: 128n,
      attachment: { scanStatus: AttachmentScanStatus.LEGACY_UNSCANNED },
    });
    harness.tx.attachmentStorageReservation.findMany
      .mockResolvedValueOnce([candidate] as never)
      .mockResolvedValueOnce([]);
    harness.objectStorageService.inspect
      .mockResolvedValueOnce({ exists: false, size: null })
      .mockResolvedValueOnce({ exists: true, size: 128 });

    await expect(harness.service.reconcileExpiredReservations()).resolves.toEqual({
      claimed: 1,
      purged: 0,
      retained: 1,
      failed: 0,
    });

    expect(harness.objectStorageService.purge).not.toHaveBeenCalled();
    expect(harness.tx.attachmentStorageReservation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          state: AttachmentBinaryState.RETAINED,
          failureReason: 'LEGACY_BINARY_INVENTORIED',
        }),
      }),
    );
  });

  it('releases a missing legacy binary but never purges a mismatched CLEAN attachment', async () => {
    const missingLegacy = createHarness();
    missingLegacy.tx.attachmentStorageReservation.findMany
      .mockResolvedValueOnce([
        staleCandidate({
          reservedBytes: 128n,
          attachment: { scanStatus: AttachmentScanStatus.LEGACY_UNSCANNED },
        }),
      ] as never)
      .mockResolvedValueOnce([]);

    await expect(
      missingLegacy.service.reconcileExpiredReservations(),
    ).resolves.toEqual({ claimed: 1, purged: 1, retained: 0, failed: 0 });
    expect(missingLegacy.objectStorageService.purge).not.toHaveBeenCalled();
    expect(
      missingLegacy.tx.attachmentStorageReservation.updateMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          state: AttachmentBinaryState.PURGED,
          failureReason: 'LEGACY_BINARY_ABSENT',
        }),
      }),
    );

    const mismatchedClean = createHarness();
    mismatchedClean.tx.attachmentStorageReservation.findMany
      .mockResolvedValueOnce([
        staleCandidate({
          reservedBytes: 128n,
          attachment: { scanStatus: AttachmentScanStatus.CLEAN },
        }),
      ] as never)
      .mockResolvedValueOnce([]);
    mismatchedClean.objectStorageService.inspect
      .mockResolvedValueOnce({ exists: false, size: null })
      .mockResolvedValueOnce({ exists: true, size: 127 });

    await expect(
      mismatchedClean.service.reconcileExpiredReservations(),
    ).resolves.toEqual({ claimed: 1, purged: 0, retained: 0, failed: 1 });
    expect(mismatchedClean.objectStorageService.purge).not.toHaveBeenCalled();
    expect(
      mismatchedClean.prisma.attachmentStorageReservation.updateMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          state: AttachmentBinaryState.RECONCILIATION_REQUIRED,
          failureReason: 'CLEAN_BINARY_INVENTORY_MISMATCH',
        }),
      }),
    );
  });

  it('deletes only bounded expired PURGED reservation metadata and never attachment/audit history', async () => {
    const harness = createHarness();
    const expiredRows = Array.from({ length: 100 }, (_, index) => ({
      id: `purged-${index}`,
    }));
    harness.tx.attachmentStorageReservation.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(expiredRows as never);

    await harness.service.reconcileExpiredReservations();

    expect(harness.tx.attachmentStorageReservation.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({ state: AttachmentBinaryState.PURGED }),
        take: 100,
      }),
    );
    expect(harness.tx.attachmentStorageReservation.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: expiredRows.map((row) => row.id) } },
    });
  });
});

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

function reservationInput(bytes: number) {
  return {
    projectId: 'project-1',
    actorUserId: 'actor-1',
    targetType: 'PROJECT',
    targetId: 'project-1',
    bucket: 'bucket-1',
    quarantineStorageKey: `quarantine/project-1/${bytes}.pdf`,
    cleanStorageKey: `project-1/${bytes}.pdf`,
    bytes,
  } as const;
}

function staleCandidate(overrides: Record<string, unknown> = {}) {
  return {
    id: 'reservation-stale',
    attachmentId: 'attachment-stale',
    projectId: 'project-1',
    actorUserId: 'actor-1',
    bucket: 'bucket-1',
    quarantineStorageKey: 'quarantine/project-1/stale.pdf',
    cleanStorageKey: 'project-1/stale.pdf',
    reservedBytes: 128n,
    state: AttachmentBinaryState.RECONCILIATION_REQUIRED,
    ownerToken: 'stale-owner',
    leaseExpiresAt: new Date('2026-08-11T07:00:00.000Z'),
    updatedAt: new Date('2026-08-11T07:00:00.000Z'),
    attachment: null,
    ...overrides,
  };
}

function usage(bytes = 0, count = 0) {
  return {
    _sum: { reservedBytes: BigInt(bytes) },
    _count: { _all: count },
  };
}

function createHarness(
  options: {
    outstanding?: ReturnType<typeof usage>;
    global?: ReturnType<typeof usage>;
    project?: ReturnType<typeof usage>;
    actor?: ReturnType<typeof usage>;
    aggregate?: () => ReturnType<typeof usage>;
    create?: (input: { data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
    transaction?: (
      callback: (tx: ReturnType<typeof createTransaction>) => Promise<unknown>,
      tx: ReturnType<typeof createTransaction>,
    ) => Promise<unknown>;
  } = {},
) {
  const events: string[] = [];
  const aggregateResults = [
    options.outstanding ?? usage(),
    options.global ?? usage(),
    options.project ?? usage(),
    options.actor ?? usage(),
  ];
  const tx = createTransaction(events, aggregateResults, options);
  const prisma = {
    attachmentStorageReservation: tx.attachmentStorageReservation,
    $transaction: vi.fn(
      async (callback: (client: typeof tx) => Promise<unknown>) =>
        options.transaction
          ? options.transaction(callback, tx)
          : callback(tx),
    ),
  };
  const configService = {
    get: vi.fn((key: string) => quotaConfig.get(key)),
  };
  const objectStorageService = {
    assertWriteCapacity: vi.fn(async () => {
      events.push('capacity');
      return { availableBytes: 10_000n };
    }),
    inspect: vi.fn(
      async (): Promise<{ exists: boolean; size: number | null }> => ({
        exists: false,
        size: null,
      }),
    ),
    readAvailableBytes: vi.fn(async () => {
      events.push('capacity:locked');
      return 10_000n;
    }),
    purge: vi.fn(async () => {
      events.push('purge');
    }),
  };
  const service = new AttachmentStorageQuotaService(
    prisma as never,
    configService as never,
    objectStorageService as never,
    { createWithExecutor: vi.fn() } as never,
  );

  return { service, prisma, tx, objectStorageService, events };
}

function createTransaction(
  events: string[],
  aggregateResults: Array<ReturnType<typeof usage>>,
  options: {
    aggregate?: () => ReturnType<typeof usage>;
    create?: (input: { data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
  },
) {
  let aggregateIndex = 0;
  return {
    $executeRaw: vi.fn(async () => {
      events.push('advisory');
      return 0;
    }),
    attachmentStorageReservation: {
      aggregate: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const state = where.state as { in?: unknown[] } | undefined;
        const scope = state?.in?.length === 3
          ? 'outstanding'
          : where.actorUserId
            ? 'actor'
            : where.projectId
              ? 'project'
              : 'global';
        events.push(`aggregate:${scope}`);
        if (options.aggregate) return options.aggregate();
        return aggregateResults[aggregateIndex++] ?? usage();
      }),
      create: vi.fn(async (input: { data: Record<string, unknown> }) => {
        events.push('create');
        if (options.create) return options.create(input);
        return {
          id: 'reservation-1',
          ...input.data,
        };
      }),
      findUnique: vi.fn(async () => ({
        id: 'reservation-1',
        attachmentId: 'attachment-1',
        projectId: 'project-1',
        actorUserId: 'actor-1',
        bucket: 'bucket-1',
        quarantineStorageKey: 'quarantine/project-1/a.pdf',
        cleanStorageKey: 'project-1/a.pdf',
        state: AttachmentBinaryState.RESERVED,
        ownerToken: 'reservation-owner',
        updatedAt: new Date('2026-08-11T08:00:00.000Z'),
      })),
      findMany: vi.fn(async () => []),
      deleteMany: vi.fn(async () => ({ count: 0 })),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
  };
}
