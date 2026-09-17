import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { NATIVE_ADMIN_LOCK } from '../auth/native-auth.rules';
import { baseRoles, defaultProcessTemplate, rolePermissionMap, systemParameters, workflowNodes } from './base-catalog';
import { CATALOG_INITIALIZATION_ACTION, initializeCatalog, migrationAuditor } from './initialize-catalog';

const databaseUrl = process.env.NATIVE_CATALOG_TEST_DATABASE_URL;
const suffix = randomUUID().replace(/-/g, '');

describe.skipIf(!databaseUrl).sequential('fresh catalog isolated PostgreSQL boundaries', () => {
  let control: PrismaClient;
  let prisma: PrismaClient;
  let databaseName: string;
  let counter = 0;

  beforeAll(async () => {
    const parsed = new URL(databaseUrl!);
    if (parsed.hostname !== '127.0.0.1' || parsed.port !== '55449' || parsed.pathname !== '/native_catalog_test') {
      throw new Error('Only the dedicated localhost:55449 native_catalog_test migrated template is allowed.');
    }
    parsed.pathname = '/postgres';
    control = new PrismaClient({ datasources: { db: { url: parsed.toString() } } });
    await control.$connect();
  });

  beforeEach(async () => {
    databaseName = `native_catalog_${suffix}_${++counter}`;
    // Both identifiers are test-controlled, never supplied by a caller.
    await control.$executeRawUnsafe(`CREATE DATABASE "${databaseName}" TEMPLATE "native_catalog_test"`);
    const parsed = new URL(databaseUrl!);
    parsed.pathname = `/${databaseName}`;
    prisma = new PrismaClient({ datasources: { db: { url: parsed.toString() } } });
    await prisma.$connect();
  });
  afterEach(async () => {
    await prisma?.$disconnect();
    if (databaseName) await control.$executeRawUnsafe(`DROP DATABASE "${databaseName}"`);
  });
  afterAll(async () => { await control?.$disconnect(); });

  async function baseline() {
    return { roles: await prisma.role.findMany(), permissions: await prisma.rolePermission.findMany({ orderBy: { id: 'asc' } }), departments: await prisma.department.findMany({ orderBy: { id: 'asc' } }) };
  }

  async function waitForLock(locktype: 'relation' | 'advisory') {
    for (let attempt = 0; attempt < 100; attempt++) {
      const [row] = await prisma.$queryRaw<Array<{ waiting: boolean }>>(Prisma.sql`
        SELECT EXISTS (SELECT 1 FROM pg_locks l JOIN pg_stat_activity a ON l.pid = a.pid
        WHERE a.datname = current_database() AND NOT l.granted AND l.locktype = ${locktype}) AS waiting`);
      if (row?.waiting) return;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error('Expected database lock wait was not observed.');
  }

  it('creates the complete approved catalog, preserves migration IDs/values/times and creates no accounts or demo data', async () => {
    const original = await baseline();
    const result = await initializeCatalog(prisma);
    expect(result).toMatchObject({ roles: 9, workflowNodes: 18, enumItems: 5, systemParameters: 4, departmentsPreserved: 6, calendarYears: [2026, 2027] });
    expect(await prisma.role.findUnique({ where: { id: migrationAuditor.id } })).toEqual(original.roles[0]);
    expect(await prisma.rolePermission.findMany({ where: { roleId: migrationAuditor.id }, orderBy: { id: 'asc' } })).toEqual(original.permissions);
    expect(await prisma.department.findMany({ orderBy: { id: 'asc' } })).toEqual(original.departments);
    for (const role of baseRoles) {
      const actual = await prisma.role.findUniqueOrThrow({ where: { code: role.code }, include: { rolePermissions: true } });
      expect(actual.rolePermissions.map(permission => permission.permissionCode).sort()).toEqual([...rolePermissionMap[role.code]].sort());
    }
    expect(await prisma.processTemplate.findFirst()).toMatchObject(defaultProcessTemplate);
    for (const node of workflowNodes) {
      const actual = await prisma.workflowNodeDefinition.findUniqueOrThrow({ where: { nodeCode: node.nodeCode } });
      expect(actual).toMatchObject(Object.fromEntries(Object.entries(node).filter(([key]) => key !== 'defaultChargeAmount')));
      if ('defaultChargeAmount' in node) expect(actual.defaultChargeAmount?.toString()).toBe(Number(node.defaultChargeAmount).toString());
    }
    expect(await prisma.systemParameter.count()).toBe(systemParameters.length);
    for (const parameter of systemParameters) {
      const actual = await prisma.systemParameter.findUniqueOrThrow({ where: { category_code: { category: parameter.category, code: parameter.code } } });
      expect(actual).toMatchObject(Object.fromEntries(Object.entries(parameter).filter(([key]) => key !== 'valueNumber')));
      if ('valueNumber' in parameter) expect(actual.valueNumber?.toString()).toBe(Number(parameter.valueNumber).toString());
    }
    expect(await prisma.workCalendar.count()).toBe(730);
    expect(await prisma.workCalendar.findUnique({ where: { calendarDate: new Date('2026-09-19T00:00:00.000Z') } })).toMatchObject({ dayType: 'WEEKEND', isWorkday: false });
    for (const table of ['users', 'local_credentials', 'user_roles', 'auth_initialization', 'projects', 'suppliers', 'attachments', 'notifications']) {
      expect(await prisma.$queryRawUnsafe(`SELECT 1 FROM "${table}" LIMIT 1`)).toEqual([]);
    }
    expect(await prisma.auditLog.findMany()).toEqual([expect.objectContaining({ actorUserId: null, action: CATALOG_INITIALIZATION_ACTION, targetType: 'SYSTEM' })]);
    await expect(initializeCatalog(prisma)).rejects.toThrow('fresh empty business database');
    expect(await prisma.auditLog.count()).toBe(1);
  });

  it('serializes simultaneous initializers and only records one successful initialization', async () => {
    const results = await Promise.allSettled([initializeCatalog(prisma), initializeCatalog(prisma)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect(await prisma.auditLog.count()).toBe(1);
    expect(await prisma.role.count()).toBe(9);
  });

  it.each(['user', 'project', 'configuration', 'audit', 'supplier', 'credentials-and-notification', 'attachment'] as const)('rejects existing %s without changing any reference rows', async kind => {
    if (kind === 'user') await prisma.user.create({ data: { username: 'existing', name: 'Synthetic existing user' } });
    if (kind === 'project') await prisma.project.create({ data: { code: 'EXISTING', name: 'Synthetic project' } });
    if (kind === 'configuration') await prisma.systemParameter.create({ data: { category: 'CALENDAR', code: 'EXISTING', valueType: 'STRING', valueText: 'preserve' } });
    if (kind === 'audit') await prisma.auditLog.create({ data: { targetType: 'SYSTEM', targetId: 'existing', action: 'SYNTHETIC_EXISTING' } });
    if (kind === 'supplier') await prisma.supplier.create({ data: { supplierCode: 'EXISTING', supplierName: 'Synthetic supplier' } });
    if (kind === 'credentials-and-notification') {
      const user = await prisma.user.create({ data: { username: 'existing', name: 'Synthetic account', localCredential: { create: { loginName: 'existing' } } } });
      await prisma.notification.create({ data: { userId: user.id, notificationType: 'SYSTEM_INFO', title: 'Synthetic notification', content: 'preserve' } });
    }
    if (kind === 'attachment') {
      const project = await prisma.project.create({ data: { code: 'EXISTING', name: 'Synthetic attachment project' } });
      await prisma.attachment.create({ data: { projectId: project.id, entityType: 'PROJECT', entityId: project.id, bucket: 'synthetic', storageKey: 'synthetic/existing.txt', fileName: 'existing.txt', mimeType: 'text/plain', fileSize: 4 } });
    }
    const before = await baseline();
    await expect(initializeCatalog(prisma)).rejects.toThrow('fresh empty business database');
    expect(await baseline()).toEqual(before);
    expect(await prisma.workflowNodeDefinition.count()).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: CATALOG_INITIALIZATION_ACTION } })).toBe(0);
  });

  it('rejects altered migration permissions and retains the alteration without overwriting it', async () => {
    await prisma.rolePermission.create({ data: { roleId: migrationAuditor.id, permissionCode: 'system.manage' } });
    const before = await baseline();
    await expect(initializeCatalog(prisma)).rejects.toThrow('unchanged migration reference baseline');
    expect(await baseline()).toEqual(before);
  });

  it('refuses an unknown table instead of treating a different schema as a fresh install', async () => {
    await prisma.$executeRawUnsafe('CREATE TABLE unknown_configuration (value text NOT NULL)');
    await expect(initializeCatalog(prisma)).rejects.toThrow('schema must match');
    expect(await prisma.role.count()).toBe(1);
    expect(await prisma.auditLog.count()).toBe(0);
  });

  it('refuses incomplete migration receipts before making any catalog writes', async () => {
    await prisma.$executeRawUnsafe("UPDATE _prisma_migrations SET finished_at = NULL WHERE migration_name = '20260912190000_native_accounts'");
    await expect(initializeCatalog(prisma)).rejects.toThrow('Complete migrations');
    expect(await prisma.role.count()).toBe(1);
    expect(await prisma.auditLog.count()).toBe(0);
  });

  it('rolls back all writes if the final audit write fails, then can initialize the same untouched baseline', async () => {
    await prisma.$executeRawUnsafe(`CREATE FUNCTION test_reject_catalog_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic rollback test'; END $$`);
    await prisma.$executeRawUnsafe('CREATE TRIGGER reject_catalog_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION test_reject_catalog_audit()');
    const before = await baseline();
    await expect(initializeCatalog(prisma)).rejects.toThrow();
    expect(await baseline()).toEqual(before);
    expect(await prisma.workflowNodeDefinition.count()).toBe(0);
    expect(await prisma.workCalendar.count()).toBe(0);
    await prisma.$executeRawUnsafe('DROP TRIGGER reject_catalog_audit ON audit_logs');
    await prisma.$executeRawUnsafe('DROP FUNCTION test_reject_catalog_audit()');
    await initializeCatalog(prisma);
    expect(await prisma.auditLog.count()).toBe(1);
  });

  it('waits for an in-flight ordinary writer and rejects after its committed user is visible', async () => {
    let signalWritten!: () => void;
    let release!: () => void;
    const written = new Promise<void>(resolve => { signalWritten = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const writer = prisma.$transaction(async tx => {
      await tx.user.create({ data: { username: 'concurrent', name: 'Synthetic registration' } });
      signalWritten();
      await gate;
    });
    await written;
    const result = initializeCatalog(prisma).then(() => 'initialized', () => 'rejected');
    try { await waitForLock('relation'); } finally { release(); }
    await writer;
    expect(await result).toBe('rejected');
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.role.count()).toBe(1);
  });

  it('takes the same administrator lock and sees an administrator mutation before touching the catalog', async () => {
    let acquired!: () => void;
    let release!: () => void;
    const locked = new Promise<void>(resolve => { acquired = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const initializer = prisma.$transaction(async tx => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${NATIVE_ADMIN_LOCK}))`);
      acquired();
      await gate;
      await tx.user.create({ data: { username: 'admin-race', name: 'Synthetic administrator', isSystemAdmin: true } });
    });
    await locked;
    const result = initializeCatalog(prisma).then(() => 'initialized', () => 'rejected');
    try { await waitForLock('advisory'); } finally { release(); }
    await initializer;
    expect(await result).toBe('rejected');
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.auditLog.count()).toBe(0);
  });
});
