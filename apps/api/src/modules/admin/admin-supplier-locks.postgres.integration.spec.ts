import 'reflect-metadata';

import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { Prisma, PrismaClient, UserStatus } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ProjectAccessService } from '../auth/project-access.service';
import { SuppliersService } from '../suppliers/suppliers.service';
import { WorkflowDeadlineService } from '../workflows/workflow-deadline.service';
import { AdminControlCenterService } from './admin-control-center.service';

// Explicitly opt in with a disposable database; these tests preserve audit rows until that database is removed.
const databaseUrl = process.env.ADMIN_SUPPLIERS_POSTGRES_TEST_DATABASE_URL;
const lockKinds = ['saved-view', 'admin-command', 'admin-project', 'system-admin', 'department-hierarchy', 'supplier-command', 'supplier-mutation', 'supplier-catalog'] as const;
type LockKind = typeof lockKinds[number];

function latch() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

function identified(result: unknown): { id: string; updatedAt: string; idempotentReplay: boolean } {
  expect(result).toMatchObject({ id: expect.any(String) });
  return result as { id: string; updatedAt: string; idempotentReplay: boolean };
}

describe.skipIf(!databaseUrl).sequential('Admin/Suppliers real service advisory locks', () => {
  let db: PrismaClient;
  let waiter: PrismaClient;
  let observer: PrismaClient;
  let firstPid: number;
  let waiterPid: number;
  let parentId: string;
  const runId = randomUUID();
  const waiterName = `rc2-closure-waiter-${runId}`;

  function client(name: string) {
    const url = new URL(databaseUrl!);
    url.searchParams.set('application_name', name);
    url.searchParams.set('connection_limit', '1');
    return new PrismaClient({ datasources: { db: { url: url.toString() } } });
  }

  function services(connection = db, settings: Record<string, number> = {}, auditOverride?: ActivityLogsService) {
    const access = new ProjectAccessService(connection as never);
    const audit = auditOverride ?? new ActivityLogsService(connection as never, access);
    return {
      audit,
      admin: new AdminControlCenterService(connection as never, audit, new WorkflowDeadlineService()),
      suppliers: new SuppliersService(connection as never, audit, new ConfigService(settings)),
    };
  }

  async function actor(systemAdmin = true): Promise<AuthenticatedUser> {
    const row = await db.user.create({ data: { username: `rc2-closure-${randomUUID()}`, name: 'RC2 isolated actor', status: UserStatus.ACTIVE, isSystemAdmin: systemAdmin } });
    return { id: row.id, username: row.username, name: row.name, email: null, departmentId: null, departmentName: null, isSystemAdmin: systemAdmin, authSource: 'mock', roleCodes: systemAdmin ? ['admin'] : ['purchaser'], permissionCodes: ['workflow.transition', 'project.read'] };
  }

  async function project(owner: AuthenticatedUser) {
    return db.project.create({ data: { code: `RC2-${randomUUID()}`, name: 'Before lock test', ownerUserId: owner.id } });
  }

  function supplierInput() {
    return { supplierCode: `RC2-${randomUUID()}`, supplierName: 'RC2 isolated supplier', status: 'ACTIVE' };
  }

  function departmentInput() {
    return { name: `RC2 department ${randomUUID()}`, parentId, isActive: true, acknowledgedConsequences: true, idempotencyKey: randomUUID() };
  }

  async function assertWait(namespace: string) {
    await expect.poll(async () => {
      const rows = await observer.$queryRaw<Array<{ pid: number; blockers: number[] }>>(Prisma.sql`
        SELECT activity.pid, pg_blocking_pids(activity.pid) AS blockers
        FROM pg_stat_activity activity JOIN pg_locks lock ON lock.pid = activity.pid
        WHERE application_name = ${waiterName} AND wait_event_type = 'Lock'
          AND wait_event = 'advisory' AND lock.locktype = 'advisory' AND NOT lock.granted
          AND ((lock.objsubid = 2 AND lock.classid::bigint = (hashtext(${namespace})::bigint & 4294967295))
            OR (lock.objsubid = 1 AND lock.objid::bigint = (hashtext(${namespace})::bigint & 4294967295)))
      `);
      return rows;
    }, { timeout: 2500, interval: 20 }).toEqual([{ pid: waiterPid, blockers: [firstPid] }]);
  }

  async function auditRows(targetId: string, expectedAction: string) {
    const rows = await db.auditLog.findMany({ where: { targetId, action: expectedAction } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.afterData).not.toBeNull();
  }

  async function scenario(kind: LockKind) {
    const user = await actor();
    const key = randomUUID();
    if (kind === 'saved-view') {
      const input = { pageKey: 'projects', name: `RC2 ${randomUUID()}`, config: { columns: ['name'] } };
      return {
        namespace: 'feishu-timeline:admin-saved-view', keys: [user.id],
        run: () => services(waiter).admin.saveView(input, user),
        verify: async () => {
          const rows = await services().admin.getSavedViews('projects', user);
          expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({ name: input.name, version: 1, config: input.config });
        },
      };
    }
    if (kind === 'admin-command' || kind === 'admin-project') {
      const row = await project(user);
      const input = { name: `After ${key}`, expectedVersion: row.updatedAt.toISOString(), idempotencyKey: key, reason: 'RC2 concurrency regression' };
      return {
        namespace: kind === 'admin-command' ? 'feishu-timeline:admin-command' : 'feishu-timeline:admin-project-mutation', keys: [kind === 'admin-command' ? key : row.id],
        run: () => services(waiter).admin.updateProjectBasicInfo(row.id, input, user, key),
        verify: async () => {
          expect(await db.project.findUnique({ where: { id: row.id } })).toMatchObject({ name: input.name });
          expect(await db.adminCommandRequest.count({ where: { idempotencyKey: key } })).toBe(1);
          await auditRows(row.id, 'ADMIN_PROJECT_BASIC_INFO_CHANGED');
        },
      };
    }
    if (kind === 'system-admin') {
      const target = await actor(false);
      const row = await db.user.findUniqueOrThrow({ where: { id: target.id } });
      return {
        namespace: 'feishu-timeline:system-administrator-mutation', keys: [],
        run: () => services(waiter).admin.changeUserStatus(row.id, { status: UserStatus.INACTIVE, expectedVersion: row.updatedAt.toISOString(), idempotencyKey: key, reason: 'RC2 status regression' }, user, key),
        verify: async () => {
          expect(await db.user.findUnique({ where: { id: row.id } })).toMatchObject({ status: UserStatus.INACTIVE });
          await auditRows(row.id, 'ADMIN_USER_STATUS_CHANGED');
        },
      };
    }
    if (kind === 'department-hierarchy') {
      const input = departmentInput();
      return {
        namespace: 'feishu-timeline:admin-department-hierarchy', keys: [],
        run: () => services(waiter).admin.changeDepartmentConfiguration(null, input, user, key),
        verify: async () => {
          const row = await db.department.findFirstOrThrow({ where: { name: input.name } });
          expect(row).toMatchObject({ parentId, level: 2 }); expect(row.path).toBe(`/BU_TECHNOLOGY/${row.code}`);
          await auditRows(row.id, 'ADMIN_DEPARTMENT_CREATED');
        },
      };
    }
    const input = supplierInput();
    const namespace = { 'supplier-command': 'feishu-timeline:supplier-command', 'supplier-mutation': 'feishu-timeline:supplier-mutation', 'supplier-catalog': 'feishu-timeline:supplier-catalog' }[kind];
    return {
      namespace, keys: [kind === 'supplier-command' ? `${user.id}:${key}` : kind === 'supplier-mutation' ? user.id : 'global'],
      run: () => services(waiter).suppliers.createSupplier(input, user, key),
      verify: async () => {
        const row = await db.supplier.findUniqueOrThrow({ where: { supplierCode: input.supplierCode } });
        expect(row).toMatchObject({ supplierName: input.supplierName });
        expect(await db.supplierMutationBucket.findUnique({ where: { actorUserId: user.id } })).toMatchObject({ requestCount: 1 });
        expect(await db.supplierCommandRequest.count({ where: { actorUserId: user.id, idempotencyKey: key } })).toBe(1);
        await auditRows(row.id, 'SUPPLIER_CREATED');
      },
    };
  }

  // Hold a real transaction on the first connection; every contender calls an actual service write method.
  async function runWhileLocked(spec: Awaited<ReturnType<typeof scenario>>) {
    const held = latch(); const ready = latch(); let acquired = false;
    const first = db.$transaction(async (tx) => {
      if (spec.keys.length) {
        await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${spec.namespace}), hashtext(${spec.keys[0]}))`);
      } else {
        await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${spec.namespace}))`);
      }
      acquired = true; ready.release(); await held.promise;
    }, { timeout: 10000 });
    const firstOutcome = Promise.allSettled([first]);
    void first.catch(() => ready.release());
    await ready.promise;
    if (!acquired) { await firstOutcome; await first; throw new Error('lock holder failed'); }
    const second = spec.run(); const outcomes = Promise.allSettled([first, second]);
    try { await assertWait(spec.namespace); } finally { held.release(); await outcomes; }
    await first; await second; await spec.verify();
  }

  // Pause only after the real audit INSERT, leaving all service and transaction code intact.
  async function raceAfterAudit<T, U>(namespace: string, firstRun: (audit: ActivityLogsService) => Promise<T>, secondRun: () => Promise<U>) {
    const realAudit = services().audit; const held = latch(); const ready = latch(); let inserted = false;
    const audit = { createWithExecutor: async (...args: Parameters<ActivityLogsService['createWithExecutor']>) => {
      const row = await realAudit.createWithExecutor(...args); inserted = true; ready.release(); await held.promise; return row;
    } } as unknown as ActivityLogsService;
    const first = firstRun(audit); const firstOutcome = Promise.allSettled([first]);
    void first.catch(() => ready.release()); await ready.promise;
    if (!inserted) { await firstOutcome; await first; throw new Error('service did not reach audit'); }
    const second = secondRun(); const results = Promise.allSettled([first, second]);
    try { await assertWait(namespace); } finally { held.release(); await results; }
    return results;
  }

  beforeAll(async () => {
    db = client(`rc2-closure-first-${runId}`); waiter = client(waiterName); observer = client(`rc2-closure-observer-${runId}`);
    await Promise.all([db.$connect(), waiter.$connect(), observer.$connect()]);
    firstPid = (await db.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`)[0]!.pid;
    waiterPid = (await waiter.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`)[0]!.pid;
    expect(firstPid).not.toBe(waiterPid);
    parentId = (await db.department.upsert({ where: { code: 'BU_TECHNOLOGY' }, create: { code: 'BU_TECHNOLOGY', name: '技术中心', path: '/BU_TECHNOLOGY', level: 1 }, update: {} })).id;
  });

  afterAll(async () => { await Promise.all([db?.$disconnect(), waiter?.$disconnect(), observer?.$disconnect()]); });

  it.each(['saved-view', 'admin-project', 'supplier-catalog'] as const)('normal path persists %s without a void result error', async (kind) => {
    const spec = await scenario(kind); await spec.run(); await spec.verify();
  });

  it.each(lockKinds)('%s waits on another PostgreSQL connection and persists its real service result', async (kind) => {
    await runWhileLocked(await scenario(kind));
  });

  it('saved-view CAS rejects a stale version and keeps user isolation', async () => {
    const owner = await actor(); const other = await actor(); const admin = services().admin;
    const input = { pageKey: 'projects', name: 'Concurrent view', config: { columns: ['name'] } };
    const created = await admin.saveView(input, owner);
    const results = await Promise.allSettled([
      admin.saveView({ ...input, expectedVersion: created.version, config: { columns: ['code'] } }, owner),
      services(waiter).admin.saveView({ ...input, expectedVersion: created.version, config: { columns: ['status'] } }, owner),
    ]);
    expect(results.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((item) => item.status === 'rejected')).toMatchObject({ reason: { response: { code: 'STALE_SAVED_VIEW' } } });
    expect(await admin.getSavedViews('projects', other)).toEqual([]);
    const saved = await admin.getSavedViews('projects', owner); expect(saved[0]?.version).toBe(2);
    await expect(admin.saveView({ ...input, expectedVersion: 2 }, owner)).resolves.toMatchObject({ version: 3 });
  });

  it('admin command competition replays one audit and rejects changed payload', async () => {
    const user = await actor(); const row = await project(user); const key = randomUUID();
    const input = { name: 'After idempotency', expectedVersion: row.updatedAt.toISOString(), idempotencyKey: key, reason: 'RC2 duplicate command' };
    const results = await raceAfterAudit('feishu-timeline:admin-command',
      (audit) => services(db, {}, audit).admin.updateProjectBasicInfo(row.id, input, user, key),
      () => services(waiter).admin.updateProjectBasicInfo(row.id, input, user, key));
    expect(results[0]).toMatchObject({ status: 'fulfilled', value: { idempotentReplay: false } });
    expect(results[1]).toMatchObject({ status: 'fulfilled', value: { idempotentReplay: true } });
    await auditRows(row.id, 'ADMIN_PROJECT_BASIC_INFO_CHANGED');
    await expect(services().admin.updateProjectBasicInfo(row.id, { ...input, name: 'Conflicting name' }, user, key)).rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_KEY_REUSED' } });
  });

  it('admin project competing versions allow one update and reject the stale writer', async () => {
    const user = await actor(); const row = await project(user);
    const input = { name: 'Winner', expectedVersion: row.updatedAt.toISOString(), idempotencyKey: randomUUID(), reason: 'RC2 project CAS' };
    const secondKey = randomUUID();
    const results = await raceAfterAudit('feishu-timeline:admin-project-mutation',
      (audit) => services(db, {}, audit).admin.updateProjectBasicInfo(row.id, input, user, input.idempotencyKey),
      () => services(waiter).admin.updateProjectBasicInfo(row.id, { ...input, name: 'Loser', idempotencyKey: secondKey }, user, secondKey));
    expect(results[0].status).toBe('fulfilled'); expect(results[1]).toMatchObject({ status: 'rejected', reason: { status: 409 } });
    expect(await db.project.findUnique({ where: { id: row.id } })).toMatchObject({ name: 'Winner' });
    expect(await db.adminCommandRequest.count({ where: { idempotencyKey: secondKey } })).toBe(0);
    await auditRows(row.id, 'ADMIN_PROJECT_BASIC_INFO_CHANGED');
  });

  it('system-admin lock rechecks user version under competing status changes', async () => {
    const user = await actor(); const target = await actor(false);
    const row = await db.user.findUniqueOrThrow({ where: { id: target.id } });
    const input = { status: UserStatus.INACTIVE, expectedVersion: row.updatedAt.toISOString(), idempotencyKey: randomUUID(), reason: 'RC2 user status CAS' };
    const key = randomUUID();
    const results = await raceAfterAudit('feishu-timeline:system-administrator-mutation',
      (audit) => services(db, {}, audit).admin.changeUserStatus(row.id, input, user, input.idempotencyKey),
      () => services(waiter).admin.changeUserStatus(row.id, { ...input, status: UserStatus.LOCKED, idempotencyKey: key }, user, key));
    expect(results[0].status).toBe('fulfilled'); expect(results[1]).toMatchObject({ status: 'rejected', reason: { status: 409 } });
    expect(await db.user.findUnique({ where: { id: row.id } })).toMatchObject({ status: UserStatus.INACTIVE });
    expect(await db.adminCommandRequest.count({ where: { idempotencyKey: key } })).toBe(0);
    await auditRows(row.id, 'ADMIN_USER_STATUS_CHANGED');
  });

  it('department hierarchy competition rechecks duplicates and preserves one audited child', async () => {
    const user = await actor(); const input = departmentInput(); const key = randomUUID();
    const results = await raceAfterAudit('feishu-timeline:admin-department-hierarchy',
      (audit) => services(db, {}, audit).admin.changeDepartmentConfiguration(null, input, user, input.idempotencyKey),
      () => services(waiter).admin.changeDepartmentConfiguration(null, { ...input, idempotencyKey: key }, user, key));
    expect(results[0].status).toBe('fulfilled'); expect(results[1]).toMatchObject({ status: 'rejected', reason: { response: { code: 'DEPARTMENT_CONFIGURATION_BLOCKED' } } });
    const rows = await db.department.findMany({ where: { name: input.name } }); expect(rows).toHaveLength(1);
    await auditRows(rows[0]!.id, 'ADMIN_DEPARTMENT_CREATED');
  });

  it('supplier catalog competition enforces capacity across different actors', async () => {
    const firstActor = await actor(false); const secondActor = await actor(false);
    const firstInput = supplierInput(); const secondInput = supplierInput();
    const settings = { supplierCatalogMaxItems: (await db.supplier.count()) + 1 };
    const results = await raceAfterAudit('feishu-timeline:supplier-catalog',
      (audit) => services(db, settings, audit).suppliers.createSupplier(firstInput, firstActor, randomUUID()),
      () => services(waiter, settings).suppliers.createSupplier(secondInput, secondActor, randomUUID()));
    expect(results[0].status).toBe('fulfilled'); expect(results[1]).toMatchObject({ status: 'rejected', reason: { response: { code: 'SUPPLIER_CATALOG_CAPACITY_EXCEEDED' } } });
    expect(await db.supplier.count({ where: { supplierCode: { in: [firstInput.supplierCode, secondInput.supplierCode] } } })).toBe(1);
  });

  it('supplier command competition replays without duplicate supplier or audit', async () => {
    const user = await actor(false); const input = supplierInput(); const key = randomUUID();
    const results = await raceAfterAudit('feishu-timeline:supplier-command',
      (audit) => services(db, {}, audit).suppliers.createSupplier(input, user, key),
      () => services(waiter).suppliers.createSupplier(input, user, key));
    expect(results[0]).toMatchObject({ status: 'fulfilled', value: { idempotentReplay: false } });
    expect(results[1]).toMatchObject({ status: 'fulfilled', value: { idempotentReplay: true } });
    const row = await db.supplier.findUniqueOrThrow({ where: { supplierCode: input.supplierCode } }); await auditRows(row.id, 'SUPPLIER_CREATED');
    await expect(services().suppliers.createSupplier({ ...input, supplierName: 'Different' }, user, key)).rejects.toMatchObject({ response: { statusCode: 409 } });
  });

  it('supplier mutation admission limits concurrent attempts without overcounting successful writes', async () => {
    const user = await actor(false); const firstInput = supplierInput(); const secondInput = supplierInput();
    const settings = { supplierMutationMaxRequests: 1 };
    const results = await Promise.allSettled([
      services(db, settings).suppliers.createSupplier(firstInput, user, randomUUID()),
      services(waiter, settings).suppliers.createSupplier(secondInput, user, randomUUID()),
    ]);
    expect(results.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((item) => item.status === 'rejected')).toMatchObject({ reason: { response: { code: 'SUPPLIER_MUTATION_RATE_EXCEEDED' } } });
    expect(await db.supplierMutationBucket.findUnique({ where: { actorUserId: user.id } })).toMatchObject({ requestCount: 1 });
    expect(await db.supplier.count({ where: { supplierCode: { in: [firstInput.supplierCode, secondInput.supplierCode] } } })).toBe(1);
  });

  it.each(['admin', 'supplier'] as const)('%s rolls back business/audit/command and releases locks for retry', async (kind) => {
    const user = await actor(); const key = randomUUID(); const row = await project(user); const input = supplierInput();
    const audit = services().audit;
    const failingAudit = { createWithExecutor: async (...args: Parameters<ActivityLogsService['createWithExecutor']>) => {
      await audit.createWithExecutor(...args); throw new Error('RC2 intentional failure after audit insertion');
    } } as unknown as ActivityLogsService;
    const projectInput = { name: 'After retry', expectedVersion: row.updatedAt.toISOString(), idempotencyKey: key, reason: 'RC2 rollback' };
    const write = (connection: PrismaClient, injected?: ActivityLogsService) => kind === 'admin'
      ? services(connection, {}, injected).admin.updateProjectBasicInfo(row.id, projectInput, user, key)
      : services(connection, {}, injected).suppliers.createSupplier(input, user, key);
    await expect(write(db, failingAudit)).rejects.toThrow('RC2 intentional failure');
    expect(await db.auditLog.count({ where: { actorUserId: user.id } })).toBe(0);
    expect(await db.adminCommandRequest.count({ where: { idempotencyKey: key } })).toBe(0);
    expect(await db.supplierCommandRequest.count({ where: { actorUserId: user.id } })).toBe(0);
    expect(await db.project.findUnique({ where: { id: row.id } })).toMatchObject({ name: row.name });
    expect(await db.supplier.count({ where: { supplierCode: input.supplierCode } })).toBe(0);
    // Supplier mutation attempts intentionally remain in their separately committed admission bucket.
    if (kind === 'supplier') expect(await db.supplierMutationBucket.findUnique({ where: { actorUserId: user.id } })).toMatchObject({ requestCount: 1 });
    await write(waiter); expect(await db.auditLog.count({ where: { actorUserId: user.id } })).toBe(1);
  });

  it('supplier update CAS preserves the winner, replays and rejects stale versions', async () => {
    const user = await actor(false); const input = supplierInput();
    const row = identified(await services().suppliers.createSupplier(input, user, randomUUID())); const key = randomUUID();
    const change = { ...input, supplierName: 'Updated supplier', expectedVersion: row.updatedAt };
    const updated = identified(await services().suppliers.updateSupplier(row.id, change, user, key));
    expect(updated.idempotentReplay).toBe(false);
    expect(await services(waiter).suppliers.updateSupplier(row.id, change, user, key)).toMatchObject({ id: row.id, idempotentReplay: true });
    await expect(services().suppliers.updateSupplier(row.id, { ...change, supplierName: 'Stale update' }, user, randomUUID())).rejects.toMatchObject({ response: { code: 'SUPPLIER_STATE_CHANGED' } });
    await auditRows(row.id, 'SUPPLIER_UPDATED');
  });

  it('service permission denials leave no business, admission, command or audit rows', async () => {
    const user = { ...await actor(false), permissionCodes: [] }; const input = supplierInput(); const department = departmentInput();
    await expect(services().suppliers.createSupplier(input, user, randomUUID())).rejects.toMatchObject({ status: 403 });
    await expect(services().admin.changeDepartmentConfiguration(null, department, user, randomUUID())).rejects.toMatchObject({ status: 403 });
    expect(await db.supplier.count({ where: { supplierCode: input.supplierCode } })).toBe(0);
    expect(await db.department.count({ where: { name: department.name } })).toBe(0);
    expect(await db.supplierMutationBucket.count({ where: { actorUserId: user.id } })).toBe(0);
    expect(await db.adminCommandRequest.count({ where: { actorUserId: user.id } })).toBe(0);
    expect(await db.supplierCommandRequest.count({ where: { actorUserId: user.id } })).toBe(0);
    expect(await db.auditLog.count({ where: { actorUserId: user.id } })).toBe(0);
  });
});
