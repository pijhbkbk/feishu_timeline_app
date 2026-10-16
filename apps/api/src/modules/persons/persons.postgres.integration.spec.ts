import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PersonsService } from './persons.service';
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
  it('rejects a revoked actor even on a previously successful command replay', async () => {
    const profile = await createOne(); const input = command(profile.id, 1, { note: '撤权前保存' });
    await service.saveSheet(input, member);
    await db.user.update({ where: { id: member.id }, data: { authVersion: { increment: 1 }, teamAccessApproved: false } });
    await expect(service.saveSheet(input, member)).rejects.toMatchObject({ status: 403 });
    expect(await db.personProfile.findUniqueOrThrow({ where: { id: profile.id } })).toMatchObject({ note: '撤权前保存', revision: 2 });
  });
});
