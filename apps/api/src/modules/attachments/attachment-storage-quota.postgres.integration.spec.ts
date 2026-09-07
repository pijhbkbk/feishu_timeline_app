import 'reflect-metadata';

import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AttachmentStorageQuotaService } from './attachment-storage-quota.service';

const databaseUrl = process.env.ATTACHMENTS_POSTGRES_TEST_DATABASE_URL;

describe.skipIf(!databaseUrl).sequential('attachment quota PostgreSQL transactions', () => {
  let db: PrismaClient;
  let service: AttachmentStorageQuotaService;
  let secondService: AttachmentStorageQuotaService;
  let secondDb: PrismaClient;
  const waiterName = `rc2-quota-waiter-${randomUUID()}`;
  const storage = {
    assertWriteCapacity: vi.fn().mockResolvedValue(undefined),
    readAvailableBytes: vi.fn().mockResolvedValue(10_000_000_000_000n),
  };
  let projectId: string;
  let actorUserId: string;

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
    const secondUrl = new URL(databaseUrl!);
    secondUrl.searchParams.set('application_name', waiterName);
    secondDb = new PrismaClient({ datasources: { db: { url: secondUrl.toString() } } });
    const id = randomUUID();
    const user = await db.user.create({ data: { username: `rc2_quota_${id}`, name: 'Local quota fixture' } });
    actorUserId = user.id;
    const project = await db.project.create({ data: { code: `RC2-QUOTA-${id}`, name: 'Local quota test', ownerUserId: user.id } });
    projectId = project.id;
    service = new AttachmentStorageQuotaService(
      db as never,
      { get: (key: string) => key === 'attachmentStorageActorMaxBytes' ? 500 : undefined } as never,
      storage as never,
      {} as never,
    );
    secondService = new AttachmentStorageQuotaService(
      secondDb as never,
      { get: (key: string) => key === 'attachmentStorageActorMaxBytes' ? 500 : undefined } as never,
      storage as never,
      {} as never,
    );
  });

  afterAll(async () => { await Promise.all([db?.$disconnect(), secondDb?.$disconnect()]); });

  function request() {
    const id = randomUUID();
    return { projectId, actorUserId, targetType: 'PROJECT' as const, targetId: projectId, bucket: 'local-test', quarantineStorageKey: `quarantine/${id}.pdf`, cleanStorageKey: `clean/${id}.pdf`, bytes: 400 };
  }

  it('atomically admits only one concurrent reservation near the actor quota', async () => {
    let signalReady!: () => void;
    let release!: () => void;
    let locked = false;
    const ready = new Promise<void>((resolve) => { signalReady = resolve; });
    const held = new Promise<void>((resolve) => { release = resolve; });
    storage.readAvailableBytes.mockImplementationOnce(async () => {
      locked = true;
      signalReady();
      await held;
      return 10_000_000_000_000n;
    });
    const first = service.reserve(request());
    const firstOutcome = Promise.allSettled([first]);
    void first.catch(() => signalReady());
    await ready;
    if (!locked) {
      await firstOutcome;
      await first;
      throw new Error('quota lock was not acquired');
    }
    const second = secondService.reserve(request());
    const outcomes = Promise.allSettled([first, second]);
    try {
      await expect.poll(async () => {
        const rows = await db.$queryRaw<Array<{ blocked: boolean }>>(Prisma.sql`
          SELECT EXISTS (
            SELECT 1 FROM pg_stat_activity
            WHERE application_name = ${waiterName}
              AND wait_event_type = 'Lock' AND wait_event = 'advisory'
          ) AS blocked
        `);
        return rows[0]?.blocked;
      }, { timeout: 2000, interval: 20 }).toBe(true);
    } finally {
      release();
      await outcomes;
    }
    const results = await outcomes;
    const success = results.filter((result) => result.status === 'fulfilled');
    const failures = results.filter((result) => result.status === 'rejected');
    expect(success).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ reason: { status: 507, response: { code: 'ATTACHMENT_STORAGE_QUOTA_EXCEEDED', scope: 'ACTOR' } } });
    const reservations = await db.attachmentStorageReservation.findMany({ where: { actorUserId } });
    expect(reservations).toHaveLength(1);
    expect(reservations[0]).toMatchObject({ reservedBytes: 400n, state: 'RESERVED' });
  });

  it('executes the reconciliation lock without modifying unexpired reservations', async () => {
    const before = await db.attachmentStorageReservation.findMany({ where: { actorUserId } });
    await expect(service.reconcileExpiredReservations()).resolves.toMatchObject({ claimed: 0, purged: 0, retained: 0, failed: 0 });
    expect(await db.attachmentStorageReservation.findMany({ where: { actorUserId } })).toEqual(before);
  });
});
