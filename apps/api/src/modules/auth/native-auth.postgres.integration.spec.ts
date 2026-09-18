import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { ConflictException, ForbiddenException, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { PrismaClient, type Prisma } from '@prisma/client';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';

import { AuthService } from './auth.service';
import { NativeAuthService } from './native-auth.service';
import { NativePasswordService } from './native-password.service';
import { NativeRegisterDto } from './dto/native-auth.dto';
import { UsersService } from '../users/users.service';
import type { AuthenticatedUser } from './auth.types';
import { AdminControlCenterService } from '../admin/admin-control-center.service';

const databaseUrl = process.env.NATIVE_AUTH_TEST_DATABASE_URL;
const password = 'Test only native login phrase 2026!';
const replacement = 'Another isolated test phrase 2026!';
const runId = randomUUID().slice(0, 8);

describe.skipIf(!databaseUrl).sequential('native identity real PostgreSQL boundaries', () => {
  const prismaOptions: Prisma.PrismaClientOptions = databaseUrl ? { datasources: { db: { url: databaseUrl } } } : {};
  const prisma = new PrismaClient(prismaOptions);
  const passwordService = new NativePasswordService();
  const sessions = new Map<string, unknown>();
  const store = {
    setJson: vi.fn(async (key: string, data: unknown) => { sessions.set(key, data); }),
    getJson: vi.fn(async (key: string) => sessions.get(key) ?? null),
    delete: vi.fn(async (key: string) => { sessions.delete(key); }),
    incrementWithTtl: vi.fn(async () => 1),
  };
  const config = { get: (key: string) => ({ nodeEnv: 'production', authMockEnabled: false, sessionCookieName: 'ft_session', sessionTtlSeconds: 3600 } as Record<string, unknown>)[key] };
  const users = new UsersService(prisma as never);
  const auth = new AuthService(config as never, users, store as never, { isConfigured: () => false } as never);
  const service = new NativeAuthService(prisma as never, passwordService, auth, store as never);
  let admin: AuthenticatedUser;
  let member: AuthenticatedUser;
  let memberCookie: string;
  let otherAdmin: AuthenticatedUser;

  async function actor(id: string) { return (await users.getAuthenticatedUser(id, 'local'))!; }
  async function login(username: string, supplied = password, oldToken?: string) {
    const response = { cookie: vi.fn(), clearCookie: vi.fn() };
    const result = await service.login({ username, password: supplied }, 'isolated-test', oldToken, response as never);
    expect(response.cookie).toHaveBeenCalledWith('ft_session', expect.any(String), expect.objectContaining({ secure: true, httpOnly: true, sameSite: 'lax', path: '/' }));
    return { result, token: response.cookie.mock.calls[0]![1] as string };
  }

  beforeAll(async () => {
    const parsed = new URL(databaseUrl!);
    if (parsed.hostname !== '127.0.0.1' || parsed.port !== '55439' || !/^\/native_auth_test(?:_[a-f0-9]{8})?$/.test(parsed.pathname)) throw new Error('Only the explicitly isolated native_auth_test database is allowed.');
    await prisma.$connect();
    // The initializer singleton intentionally persists. Each run requires a fresh isolated database.
    if (await prisma.authInitialization.count()) throw new Error('Use a fresh isolated test database; never clear a live initialization marker.');
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it('rejects privilege injection at the real global DTO validation boundary', async () => {
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
    for (const field of ['roleCodes', 'isSystemAdmin', 'departmentId', 'authVersion', 'userId', 'feishuOpenId']) {
      await expect(pipe.transform({ username: 'valid-name', name: '测试用户', password, [field]: 'injected' }, { type: 'body', metatype: NativeRegisterDto })).rejects.toThrow();
    }
  });

  it('serializes first administrator initialization and preserves exact legacy identity and audit foreign keys', async () => {
    const legacy = await prisma.user.create({ data: { username: `legacy-${runId}`, name: '历史测试管理员', isSystemAdmin: true, feishuOpenId: `ou-test-${runId}` } });
    const audit = await prisma.auditLog.create({ data: { actorUserId: legacy.id, targetType: 'USER', targetId: legacy.id, action: 'TEST_BEFORE_MIGRATION', summary: 'Synthetic identity preservation fixture' } });
    await expect(service.initializeAdministrator({ username: `unbound-${runId}`, name: '未绑定测试管理员', password })).rejects.toBeInstanceOf(ConflictException);
    expect(await prisma.user.count({ where: { isSystemAdmin: true } })).toBe(1);
    expect(await prisma.authInitialization.count()).toBe(0);
    await expect(service.initializeAdministrator({ username: `admin-${runId}`, name: '测试管理员', password: 'riveroa', existingUserId: legacy.id })).rejects.toThrow();
    const results = await Promise.allSettled([
      service.initializeAdministrator({ username: `admin-${runId}`, name: '测试管理员', password: 'riveroak', existingUserId: legacy.id }),
      service.initializeAdministrator({ username: `admin-other-${runId}`, name: '测试管理员二', password: 'riveroak', existingUserId: legacy.id }),
    ]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
    const migrated = await prisma.user.findUniqueOrThrow({ where: { id: legacy.id } });
    expect(migrated.feishuOpenId).toBe(legacy.feishuOpenId);
    expect((await prisma.auditLog.findUniqueOrThrow({ where: { id: audit.id } })).actorUserId).toBe(legacy.id);
    expect(await prisma.authInitialization.count()).toBe(1);
    admin = await actor(legacy.id);
    expect(admin.isSystemAdmin).toBe(true);
    await login(admin.username, 'riveroak');
    await expect(service.initializeAdministrator({ username: `admin-late-${runId}`, name: '测试', password })).rejects.toBeInstanceOf(ConflictException);
  });

  it('keeps leading-zero employee numbers distinct and applies 8/7 boundaries to registration, change, recovery and host binding', async () => {
    await expect(service.register({ username: '001234', name: '前导零测试', password: 'riveroa' }, 'policy-short')).rejects.toThrow();
    await expect(service.register({ username: '001234', name: '前导零测试', password: 'password' }, 'policy-weak')).rejects.toThrow();
    await service.register({ username: '001234', name: '前导零测试', password: 'riveroak' }, 'policy-register');
    await service.register({ username: '1234', name: '非前导零测试', password }, 'policy-long');
    const zero = await prisma.user.findUniqueOrThrow({ where: { username: '001234' }, include: { userRoles: true, projectMembers: true } });
    const long = await prisma.user.findUniqueOrThrow({ where: { username: '1234' } });
    expect(zero.id).not.toBe(long.id);
    expect(zero).toMatchObject({ username: '001234', isSystemAdmin: false, departmentId: null, userRoles: [], projectMembers: [] });
    await expect(service.register({ username: '001234', name: '不得认领', password }, 'policy-duplicate')).rejects.toBeInstanceOf(ConflictException);
    const old = await login('001234', 'riveroak');
    let user = await actor(zero.id);
    await expect(service.changePassword(user, { currentPassword: 'riveroak', newPassword: 'meadowa' }, 'policy-change-short')).rejects.toThrow();
    expect(await auth.getAuthenticatedUserFromSessionToken(old.token)).not.toBeNull();
    await service.changePassword(user, { currentPassword: 'riveroak', newPassword: 'meadoway' }, 'policy-change');
    expect(await auth.getAuthenticatedUserFromSessionToken(old.token)).toBeNull();
    await login('001234', 'meadoway');
    const recovery = await service.issueRecovery(admin, zero.id, 'policy-recovery');
    await expect(service.recover({ token: recovery.token, newPassword: 'cedarba' }, 'policy-recover-short')).rejects.toThrow();
    await service.recover({ token: recovery.token, newPassword: 'cedarbay' }, 'policy-recover');
    await login('001234', 'cedarbay');
    await expect(service.bindFromHost(zero.id, zero.username, 'mapleru')).rejects.toThrow();
    await service.bindFromHost(zero.id, zero.username, 'maplerun');
    await login('001234', 'maplerun');
    const stillLong = await login('1234', password);
    expect(stillLong.result.user?.id).toBe(long.id);
    user = await actor(zero.id);
    expect(user).toMatchObject({ id: zero.id, username: '001234', isSystemAdmin: false, roleCodes: [], permissionCodes: [] });
  });

  it('admits one case-insensitive registration with no roles, department, or project memberships', async () => {
    const username = `member-${runId}`;
    const results = await Promise.allSettled([
      service.register({ username, name: '注册测试人员', password }, 'register-a'),
      service.register({ username: ` ${username.toUpperCase()} `, name: '重复注册人员', password }, 'register-b'),
    ]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const user = await prisma.user.findUniqueOrThrow({ where: { username }, include: { userRoles: true, projectMembers: true, localCredential: true } });
    expect(user).toMatchObject({ isSystemAdmin: false, departmentId: null, onboardingCompleted: false, userRoles: [], projectMembers: [] });
    expect(user.localCredential!.passwordHash).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=1\$/);
    expect(user.localCredential!.passwordHash).not.toContain(password);
    member = await actor(user.id);
    const logged = await login(username);
    memberCookie = logged.token;
    expect(logged.result).toMatchObject({ authenticated: true, mockEnabled: false, feishuEnabled: false, user: { authSource: 'local', roleCodes: [], permissionCodes: [] } });
    await expect(service.login({ username, password: 'incorrect password phrase' }, 'login-test', undefined, {} as never)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rotates sessions, confines job selection to intent, and rejects administrator recovery by ordinary users', async () => {
    const rotated = await login(member.username, password, memberCookie);
    expect(rotated.token).not.toBe(memberCookie);
    expect(await auth.getAuthenticatedUserFromSessionToken(memberCookie)).toBeNull();
    memberCookie = rotated.token;
    await service.chooseJob(member, 'purchaser');
    await service.chooseJob(member, 'purchaser');
    await expect(service.chooseJob(member, 'process_engineer')).rejects.toBeInstanceOf(ConflictException);
    member = await actor(member.id);
    expect(member).toMatchObject({ requestedJob: 'purchaser', onboardingCompleted: true, isSystemAdmin: false, roleCodes: [], permissionCodes: [] });
    await expect(service.issueRecovery(member, admin.id, 'ordinary')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.listAccounts(member)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects legacy, malformed, missing-version and stale-epoch sessions', async () => {
    for (const overrides of [{ authSource: 'feishu' }, { authSource: 'mock' }, { authVersion: undefined }, { authVersion: -1 }, { authVersion: member.authVersion! + 1 }, { expiresAt: 'invalid' }, { authSource: 'google' }]) {
      const token = randomUUID();
      sessions.set(`auth:session:${token}`, { userId: member.id, authSource: 'local', authVersion: member.authVersion, expiresAt: new Date(Date.now() + 60000).toISOString(), ...overrides });
      expect(await auth.getAuthenticatedUserFromSessionToken(token)).toBeNull();
    }
    expect(await auth.getAuthenticatedUserFromSessionToken(memberCookie)).not.toBeNull();
  });

  it('requires the old password, changes it once under concurrency, and revokes every previous session', async () => {
    await expect(service.changePassword(member, { currentPassword: 'incorrect long phrase', newPassword: replacement }, 'pw')).rejects.toBeInstanceOf(UnauthorizedException);
    const another = await login(member.username);
    const results = await Promise.allSettled([
      service.changePassword(member, { currentPassword: password, newPassword: replacement }, 'pw-a'),
      service.changePassword(member, { currentPassword: password, newPassword: 'Different replacement phrase 2026!' }, 'pw-b'),
    ]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(await auth.getAuthenticatedUserFromSessionToken(memberCookie)).toBeNull();
    expect(await auth.getAuthenticatedUserFromSessionToken(another.token)).toBeNull();
    await expect(service.login({ username: member.username, password }, 'pw-old', undefined, {} as never)).rejects.toBeInstanceOf(UnauthorizedException);
    member = await actor(member.id);
  });

  it('stores only a recovery digest, consumes it once under concurrency, and records no credential in audit/idempotency results', async () => {
    const issued = await service.issueRecovery(admin, member.id, 'admin');
    const stored = await prisma.localCredential.findUniqueOrThrow({ where: { userId: member.id } });
    expect(stored.passwordHash).toBeNull();
    expect(stored.resetTokenHash).toHaveLength(64);
    expect(stored.resetTokenHash).not.toBe(issued.token);
    const results = await Promise.allSettled([
      service.recover({ token: issued.token, newPassword: replacement }, 'recover-a'),
      service.recover({ token: issued.token, newPassword: replacement }, 'recover-b'),
    ]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
    await expect(service.recover({ token: issued.token, newPassword: replacement }, 'recover-c')).rejects.toBeInstanceOf(UnauthorizedException);
    await login(member.username, replacement);
    const audit = JSON.stringify(await prisma.auditLog.findMany({ where: { targetId: member.id } }));
    for (const secret of [password, replacement, issued.token, stored.resetTokenHash!]) expect(audit).not.toContain(secret);
    expect(await prisma.adminCommandRequest.count()).toBe(0);
    expect(await service.listAccounts(admin)).not.toEqual(expect.arrayContaining([expect.objectContaining({ passwordHash: expect.anything() })]));
  });

  it('refuses expired recovery and invalidates it when a host binding replaces credentials', async () => {
    const issued = await service.issueRecovery(admin, member.id, 'expire');
    await prisma.localCredential.update({ where: { userId: member.id }, data: { resetExpiresAt: new Date(0) } });
    await expect(service.recover({ token: issued.token, newPassword: replacement }, 'expire')).rejects.toBeInstanceOf(UnauthorizedException);
    const newer = await service.issueRecovery(admin, member.id, 'bind');
    await service.bindFromHost(member.id, member.username, password);
    await expect(service.recover({ token: newer.token, newPassword: replacement }, 'bind')).rejects.toBeInstanceOf(UnauthorizedException);
    const original = await prisma.user.findUniqueOrThrow({ where: { id: member.id } });
    expect(original.isSystemAdmin).toBe(false);
    expect(await prisma.userRole.count({ where: { userId: member.id } })).toBe(0);
  });

  it('protects the final native administrator even when another legacy administrator is ACTIVE', async () => {
    const legacy = await prisma.user.create({ data: { username: `legacy-second-${runId}`, name: '第二历史测试管理员', isSystemAdmin: true } });
    await expect(service.issueRecovery(admin, admin.id, 'last')).rejects.toBeInstanceOf(ConflictException);
    const center = new AdminControlCenterService(prisma as never, {} as never, {} as never);
    const guard = center as unknown as { assertNativeAdministratorRemains: (tx: unknown, userId: string) => Promise<void> };
    await expect(prisma.$transaction(tx => guard.assertNativeAdministratorRemains(tx, admin.id))).rejects.toBeInstanceOf(ConflictException);
    await service.bindFromHost(legacy.id, legacy.username, password);
    otherAdmin = await actor(legacy.id);
    await expect(prisma.$transaction(tx => guard.assertNativeAdministratorRemains(tx, admin.id))).resolves.toBeUndefined();
    // Simultaneous resets cannot disable both administrators.
    const results = await Promise.allSettled([
      service.issueRecovery(admin, otherAdmin.id, 'race-admin-a'),
      service.issueRecovery(otherAdmin, admin.id, 'race-admin-b'),
    ]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.user.count({ where: { isSystemAdmin: true, status: 'ACTIVE', localCredential: { is: { passwordHash: { not: null } } } } })).toBe(1);
  });

  it('holds the signing administrator version until issuance commits and rejects a later stale signer', async () => {
    const active = await prisma.user.findFirstOrThrow({ where: { isSystemAdmin: true, localCredential: { is: { passwordHash: { not: null } } } } });
    const signingActor = await actor(active.id);
    let actorRead!: () => void;
    let resume!: () => void;
    const readBarrier = new Promise<void>(resolve => { actorRead = resolve; });
    const resumeBarrier = new Promise<void>(resolve => { resume = resolve; });
    let paused = false;
    const wrapped = { $transaction: (callback: (tx: unknown) => Promise<unknown>) => prisma.$transaction(async tx => {
      const proxy = new Proxy(tx, { get(target, property) {
        if (property !== 'user') return Reflect.get(target, property);
        return new Proxy(tx.user, { get(delegate, method) {
          if (method !== 'findUnique') return Reflect.get(delegate, method);
          return async (...args: unknown[]) => {
            const record = await (delegate.findUnique as (...input: unknown[]) => Promise<{ id: string } | null>)(...args);
            if (!paused && record?.id === signingActor.id) { paused = true; actorRead(); await resumeBarrier; }
            return record;
          };
        } });
      } });
      return callback(proxy);
    }) };
    const controlled = new NativeAuthService(wrapped as never, passwordService, auth, store as never);
    const issuance = controlled.issueRecovery(signingActor, member.id, 'controlled-race');
    await readBarrier;
    const second = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
    let committed = false;
    const revocation = second.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET LOCAL application_name = 'native_revoke_test'");
      await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '3000ms'");
      await tx.user.update({ where: { id: signingActor.id }, data: { authVersion: { increment: 1 } } });
    }).then(() => { committed = true; });
    try {
      let waiting = false;
      for (let attempt = 0; attempt < 40; attempt++) {
        const rows = await prisma.$queryRaw<Array<{ waiting: boolean }>>`SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE application_name='native_revoke_test' AND wait_event_type='Lock') AS waiting`;
        if (rows[0]?.waiting) { waiting = true; break; }
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      expect(waiting).toBe(true);
      expect(committed).toBe(false);
    } finally { resume(); }
    try {
      await issuance;
      await revocation;
      expect(committed).toBe(true);
      await expect(service.issueRecovery(signingActor, member.id, 'stale-signer')).rejects.toBeInstanceOf(UnauthorizedException);
    } finally { await second.$disconnect(); }
  });

  it('rejects a waiting delegated administrator command after role permission revocation commits', async () => {
    const role = await prisma.role.findUniqueOrThrow({ where: { code: 'admin' } });
    await prisma.rolePermission.upsert({ where: { roleId_permissionCode: { roleId: role.id, permissionCode: 'system.manage' } }, create: { roleId: role.id, permissionCode: 'system.manage' }, update: {} });
    const delegated = await prisma.user.create({ data: { username: `delegated-${runId}`, name: '合成普通管理员', localCredential: { create: { loginName: `delegated-${runId}`, passwordHash: await passwordService.hash(password) } }, userRoles: { create: { roleId: role.id } } } });
    const stale = await actor(delegated.id);
    expect(stale.permissionCodes).toContain('system.manage');
    const target = await prisma.user.findUniqueOrThrow({ where: { id: member.id } });
    let locked!: () => void; let release!: () => void;
    const lockReady = new Promise<void>(resolve => { locked = resolve; });
    const releaseBarrier = new Promise<void>(resolve => { release = resolve; });
    const revoke = prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'feishu-timeline:system-administrator-mutation'}))`;
      await tx.rolePermission.deleteMany({ where: { roleId: role.id, permissionCode: 'system.manage' } });
      locked(); await releaseBarrier;
    });
    await lockReady;
    const center = new AdminControlCenterService(prisma as never, { createWithExecutor: vi.fn() } as never, {} as never);
    const commandKey = `revoked-${runId}`;
    const result = center.changeUserStatus(member.id, { status: 'INACTIVE', expectedVersion: target.updatedAt.toISOString(), reason: 'Synthetic permission race', idempotencyKey: commandKey } as never, stale, commandKey).then(() => 'unexpected-success', error => error);
    try {
      let waiting = false;
      for (let attempt = 0; attempt < 40; attempt++) {
        const rows = await prisma.$queryRaw<Array<{ waiting: boolean }>>`SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%pg_advisory_xact_lock%') AS waiting`;
        if (rows[0]?.waiting) { waiting = true; break; }
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      expect(waiting).toBe(true);
    } finally { release(); }
    await revoke;
    expect(await result).toBeInstanceOf(ForbiddenException);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: member.id } })).status).toBe('ACTIVE');
    expect(await prisma.adminCommandRequest.count({ where: { idempotencyKey: commandKey } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { targetId: member.id, action: 'ADMIN_USER_STATUS_CHANGED' } })).toBe(0);
  });

  it('throttles before database lookup or password hashing and reports unavailable storage fail-closed', async () => {
    store.incrementWithTtl.mockResolvedValueOnce(201);
    await expect(service.login({ username: member.username, password }, 'limited', undefined, {} as never)).rejects.toMatchObject({ status: 429 });
    store.incrementWithTtl.mockRejectedValueOnce(new Error('simulated unavailable Redis'));
    await expect(service.register({ username: 'failure-test', name: '测试', password }, 'down')).rejects.toThrow('simulated unavailable Redis');
    expect(await prisma.user.findUnique({ where: { username: 'failure-test' } })).toBeNull();
  });
});
