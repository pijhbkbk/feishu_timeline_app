import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { AuthService } from '../auth/auth.service';
import { NativeAuthService } from '../auth/native-auth.service';
import { NativePasswordService } from '../auth/native-password.service';
import { UsersService } from '../users/users.service';
import { PersonsService } from './persons.service';
import { PersonnelService } from '../personnel/personnel.service';
import { TEAM_BUSINESS_PERMISSIONS } from '../../common/team-membership';
import type { AuthenticatedUser } from '../auth/auth.types';

// Explicit isolated local database only. Absence means NOT_VERIFIED, never PASS.
const connection = process.env.PERSONS_TEST_DATABASE_URL;
if (connection) {
  const target = new URL(connection);
  if (target.hostname !== '127.0.0.1' || target.port !== '55438' || !/^\/personnel_sheet_[a-z0-9_]+$/.test(target.pathname)) throw new Error('Only an explicitly isolated personnel_sheet_* PostgreSQL database at loopback:55438 is allowed.');
}
describe.runIf(Boolean(connection))('person profile real PostgreSQL contracts', () => {
  const db = new PrismaClient({ datasources: { db: { url: connection ?? 'postgresql://synthetic:synthetic@127.0.0.1:55438/personnel_sheet_not_running' } } });
  const service = new PersonsService(db as never);
  const suffix = randomUUID().replaceAll('-', '');
  let member: AuthenticatedUser; let admin: AuthenticatedUser;
  let departmentA: string; let departmentB: string; let accountId: string;
  async function createActor(system: boolean) {
    const user = await db.user.create({ data: { username: `person-test-${suffix}-${system ? 'admin' : 'worker'}`,
      name: '合成授权人员', isSystemAdmin: system, teamAccessApproved: true,
      localCredential: { create: { loginName: `person-test-${suffix}-${system ? 'admin' : 'worker'}`, passwordHash: 'synthetic-service-test-no-login' } } } });
    return { id: user.id, username: user.username, name: user.name, email: null, departmentId: null,
      departmentName: null, isSystemAdmin: system, teamAccessApproved: true, authSource: 'local', authVersion: user.authVersion,
      roleCodes: [], permissionCodes: [...TEAM_BUSINESS_PERMISSIONS] } satisfies AuthenticatedUser;
  }
  beforeAll(async () => {
    member = await createActor(false); admin = await createActor(true);
    departmentA = (await db.department.create({ data: { code: `persons-a-${suffix}`, name: '合成部门甲' } })).id;
    departmentB = (await db.department.create({ data: { code: `persons-b-${suffix}`, name: '合成部门乙' } })).id;
    accountId = (await db.user.create({ data: { username: `person-link-${suffix}`, name: '账号原名', teamAccessApproved: true,
      localCredential: { create: { loginName: `person-link-${suffix}`, passwordHash: 'synthetic-service-test-no-login' } } } })).id;
  });
  afterAll(async () => { await db.$disconnect(); });
  const command = (id: string, expectedRevision: number, changes: object, operationId = randomUUID()) => ({ operationId, items: [{ id, expectedRevision, changes }] });
  async function createOne(name = '同名合成人员') {
    const result = await service.create({ operationId: randomUUID(), items: [{ clientId: 'row-1', fields: { name, departmentId: departmentA } }] }, member);
    return (result as { items: Array<{ id: string; revision: number }> }).items[0]!;
  }

  it('creates two same-name profiles without a User, credential or role and edits only the chosen stable ID', async () => {
    const before = await Promise.all([db.user.count(), db.localCredential.count(), db.userRole.count()]);
    const first = await createOne(); const second = await createOne();
    expect(first.id).not.toBe(second.id);
    expect(await Promise.all([db.user.count(), db.localCredential.count(), db.userRole.count()])).toEqual(before);
    await service.saveSheet(command(second.id, second.revision, { departmentId: departmentB, name: '仅修改第二位' }), member);
    expect(await service.detail(first.id, member)).toMatchObject({ name: '同名合成人员', departmentId: departmentA, revision: 1, userId: null });
    expect(await service.detail(second.id, member)).toMatchObject({ name: '仅修改第二位', departmentId: departmentB, revision: 2, userId: null });
  });
  it('makes overlapping writes CAS-exclusive and keeps a failed multi-row operation atomic', async () => {
    const first = await createOne('竞争记录'); const second = await createOne('批量记录');
    const outcomes = await Promise.allSettled([
      service.saveSheet(command(first.id, 1, { note: '请求甲' }), member),
      service.saveSheet(command(first.id, 1, { note: '请求乙' }), member),
    ]);
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(await db.auditLog.count({ where: { targetId: first.id, action: 'PERSON_PROFILE_UPDATED' } })).toBe(1);
    const operationId = randomUUID();
    await expect(service.saveSheet({ operationId, items: [
      { id: second.id, expectedRevision: 1, changes: { note: '不应落库' } },
      { id: first.id, expectedRevision: 1, changes: { note: '过期版本' } },
    ] }, member)).rejects.toMatchObject({ status: 409 });
    expect(await service.detail(second.id, member)).toMatchObject({ note: null, revision: 1 });
    expect(await db.adminCommandRequest.count({ where: { idempotencyKey: `person-profile:${member.id}:${operationId}` } })).toBe(0);
  });
  it('replays a committed request after later edits without applying again, and no-ops do not increment revision', async () => {
    const profile = await createOne(); const input = command(profile.id, 1, { note: '已保存' });
    await service.saveSheet(input, member);
    await service.saveSheet(command(profile.id, 2, { note: '随后保存' }), member);
    expect(await service.saveSheet(input, member)).toMatchObject({ replayed: true });
    expect(await service.detail(profile.id, member)).toMatchObject({ note: '随后保存', revision: 3 });
    await service.saveSheet(command(profile.id, 3, { note: '随后保存' }), member);
    expect(await service.detail(profile.id, member)).toMatchObject({ revision: 3 });
    await expect(service.saveSheet({ ...input, items: [{ ...input.items[0]!, changes: { note: '换内容' } }] }, member)).rejects.toMatchObject({ status: 409 });
  });
  it('links only exact IDs as administrator, preserves User security fields and restricts bound metadata', async () => {
    const profile = await createOne();
    const before = await db.user.findUniqueOrThrow({ where: { id: accountId }, include: { userRoles: true, localCredential: true } });
    const input = { operationId: randomUUID(), expectedRevision: 1, userId: accountId, expectedUserVersion: before.updatedAt.toISOString(), reason: '仅关联准确账号 ID' };
    await expect(service.linkAccount(profile.id, input, member)).rejects.toMatchObject({ status: 403 });
    await service.linkAccount(profile.id, input, admin);
    expect(await db.user.findUniqueOrThrow({ where: { id: accountId }, include: { userRoles: true, localCredential: true } })).toEqual(before);
    await expect(service.saveSheet(command(profile.id, 2, { departmentId: departmentB }), member)).rejects.toMatchObject({ status: 403 });
    await expect(service.saveSheet(command(profile.id, 2, { isActive: false }), admin)).rejects.toMatchObject({ status: 403 });
    await service.changeDepartment(profile.id, { operationId: randomUUID(), expectedRevision: 2, departmentId: departmentB, reason: '受控档案部门调整' }, admin);
    await service.saveSheet(command(profile.id, 3, { name: '已关联人员最新姓名' }), member);
    expect(await service.detail(profile.id, member)).toMatchObject({ userId: accountId, name: '已关联人员最新姓名', departmentId: departmentB, revision: 4 });
    expect(await db.user.findUniqueOrThrow({ where: { id: accountId }, include: { userRoles: true, localCredential: true } })).toEqual(before);
  });
  it('archives only inactive profiles, hides them by default, retains audit and restores without activating', async () => {
    const profile = await createOne('归档联系人');
    const archive = (revision: number, archived: boolean) => ({ operationId: randomUUID(), expectedRevision: revision, archived, reason: '合成人员生命周期验证' });
    await expect(service.archive(profile.id, archive(1, true), member)).rejects.toMatchObject({ status: 409 });
    await service.saveSheet(command(profile.id, 1, { isActive: false }), member);
    const request = archive(2, true);
    await service.archive(profile.id, request, member);
    expect((await service.list({ q: '归档联系人' }, member)).items.some(item => item.id === profile.id)).toBe(false);
    expect((await service.list({ q: '归档联系人', archived: 'true' }, member)).items.some(item => item.id === profile.id)).toBe(true);
    expect(await service.detail(profile.id, member)).toMatchObject({ name: '归档联系人', userId: null, isActive: false, revision: 3 });
    await expect(service.saveSheet(command(profile.id, 3, { name: '不能改归档事实' }), member)).rejects.toMatchObject({ status: 409 });
    await expect(service.archive(profile.id, archive(2, false), member)).rejects.toMatchObject({ status: 409 });
    await service.archive(profile.id, archive(3, false), member);
    expect(await service.detail(profile.id, member)).toMatchObject({ archivedAt: null, isActive: false, revision: 4 });
    expect(await service.archive(profile.id, request, member)).toMatchObject({ replayed: true });
    expect(await service.detail(profile.id, member)).toMatchObject({ archivedAt: null, revision: 4 });
    expect(await db.auditLog.count({ where: { targetId: profile.id, action: { in: ['PERSON_PROFILE_CREATED', 'PERSON_PROFILE_UPDATED', 'PERSON_PROFILE_ARCHIVED', 'PERSON_PROFILE_RESTORED'] } } })).toBe(4);
  });
  it('serializes archive races and keeps account activation, session revocation and admission authoritative', async () => {
    const profile = await createOne('关联生命周期');
    const username = `person-lifecycle-${suffix}`;
    const account = await db.user.create({ data: { username, name: '明确内部身份', teamAccessApproved: true,
      localCredential: { create: { loginName: username, passwordHash: 'synthetic-service-test-no-login' } } } });
    await service.linkAccount(profile.id, { operationId: randomUUID(), expectedRevision: 1, userId: account.id, expectedUserVersion: account.updatedAt.toISOString(), reason: '精确ID' }, admin);
    const personnel = new PersonnelService(db as never);
    const change = (version: string, status: 'ACTIVE' | 'INACTIVE') => ({ requestId: randomUUID(), expectedVersion: version, status, reason: '合成停用验证' });
    await expect(personnel.change(member, account.id, change(account.updatedAt.toISOString(), 'INACTIVE'))).rejects.toMatchObject({ status: 403 });
    await personnel.change(admin, account.id, change(account.updatedAt.toISOString(), 'INACTIVE'));
    const stopped = await db.user.findUniqueOrThrow({ where: { id: account.id } });
    expect(stopped.authVersion).toBe(account.authVersion + 1);
    const archive = (archived: boolean) => ({ operationId: randomUUID(), expectedRevision: 2, archived, reason: '合成归档验证' });
    const results = await Promise.allSettled([service.archive(profile.id, archive(true), member), service.archive(profile.id, archive(true), member)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    await expect(personnel.change(admin, account.id, change(stopped.updatedAt.toISOString(), 'ACTIVE'))).rejects.toMatchObject({ status: 409 });
    await service.archive(profile.id, { ...archive(false), expectedRevision: 3 }, member);
    expect(await db.user.findUniqueOrThrow({ where: { id: account.id } })).toEqual(stopped);
    expect(await service.detail(profile.id, member)).toMatchObject({ archivedAt: null, isActive: false, userId: account.id });
    const self = await db.user.findUniqueOrThrow({ where: { id: admin.id } });
    await expect(personnel.change(admin, admin.id, change(self.updatedAt.toISOString(), 'INACTIVE'))).rejects.toMatchObject({ status: 409 });
  });
  it('creates one exact profile per registered account and rejects its pre-disable authenticated session', async () => {
    const sessions = new Map<string, unknown>();
    const store = { setJson: async (key: string, value: unknown) => { sessions.set(key, value); },
      getJson: async (key: string) => sessions.get(key) ?? null, delete: async (key: string) => { sessions.delete(key); }, incrementWithTtl: async () => 1 };
    const config = { get: (key: string) => ({ nodeEnv: 'production', authMockEnabled: false, sessionCookieName: 'ft_session', sessionTtlSeconds: 3600 } as Record<string, unknown>)[key] };
    const auth = new AuthService(config as never, new UsersService(db as never), store as never, { isConfigured: () => false } as never);
    const native = new NativeAuthService(db as never, new NativePasswordService(), auth, store as never);
    const username = `signup-${suffix}`, password = 'Synthetic directory login phrase 2026!';
    await native.register({ username, password, name: '合成注册人员' }, 'isolated-directory-test');
    const account = await db.user.findUniqueOrThrow({ where: { username } });
    expect(account.teamAccessApproved).toBe(false); expect(account.isSystemAdmin).toBe(false);
    expect(await db.userRole.count({ where: { userId: account.id } })).toBe(0);
    const profiles = await db.personProfile.findMany({ where: { userId: account.id } });
    expect(profiles).toHaveLength(1); expect(profiles[0]).toMatchObject({ name: '合成注册人员', archivedAt: null });
    let token = '';
    await native.login({ username, password }, 'isolated-directory-test', undefined,
      { cookie: (_name: string, value: string) => { token = value; }, clearCookie: () => undefined } as never);
    expect((await auth.getAuthenticatedUserFromSessionToken(token))?.id).toBe(account.id);
    await new PersonnelService(db as never).change(admin, account.id, { requestId: randomUUID(), expectedVersion: account.updatedAt.toISOString(), status: 'INACTIVE', reason: '合成真实会话撤销' });
    expect(await auth.getAuthenticatedUserFromSessionToken(token)).toBeNull();
    expect(await db.personProfile.count({ where: { userId: account.id } })).toBe(1);
  });
  it('rejects a revoked actor even on a previously successful command replay', async () => {
    const profile = await createOne(); const input = command(profile.id, 1, { note: '撤权前保存' });
    await service.saveSheet(input, member);
    await db.user.update({ where: { id: member.id }, data: { authVersion: { increment: 1 }, teamAccessApproved: false } });
    await expect(service.saveSheet(input, member)).rejects.toMatchObject({ status: 403 });
    expect(await db.personProfile.findUniqueOrThrow({ where: { id: profile.id } })).toMatchObject({ note: '撤权前保存', revision: 2 });
  });
});
