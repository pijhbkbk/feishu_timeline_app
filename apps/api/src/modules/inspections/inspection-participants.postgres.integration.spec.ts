import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaService } from '../../infra/prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { BusinessClock } from '../../common/business-clock';
import { ProjectAccessService } from '../auth/project-access.service';
import { PersonnelService } from '../personnel/personnel.service';
import { InspectionsService } from './inspections.service';

const connection = process.env.LIGHT_TRUCK_FACTS_TEST_DATABASE_URL;
if (connection) {
  const url = new URL(connection);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1' || url.port !== '55438' || !/^\/light_truck_facts_test_[a-z0-9_]+$/.test(url.pathname)) {
    throw new Error('Use an explicit disposable light_truck_facts_test_* database at loopback:55438.');
  }
}
// Real SQL and existing administrator status commands. No browser or login claims.
describe.skipIf(!connection).sequential('inspection participant effective availability on isolated PostgreSQL', () => {
  let db: PrismaClient; let inspection: InspectionsService; let personnel: PersonnelService;
  let admin: AuthenticatedUser; let actor: AuthenticatedUser; let baseId: string;
  const run = randomUUID();
  const op = () => randomUUID();
  async function makeActor(system: boolean) {
    const user = await db.user.create({ data: { username: `participant-${run}-${system}`, name: '合成操作者', isSystemAdmin: system, teamAccessApproved: true,
      localCredential: { create: { loginName: `participant-${run}-${system}`, passwordHash: 'synthetic-no-login' } } } });
    return { id: user.id, username: user.username, name: user.name, email: null, departmentId: null, departmentName: null,
      isSystemAdmin: system, teamAccessApproved: true, authSource: 'local', authVersion: user.authVersion, roleCodes: [], permissionCodes: [] } satisfies AuthenticatedUser;
  }
  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: connection! } } }); await db.$connect();
    admin = await makeActor(true); actor = await makeActor(false);
    baseId = (await db.productionBase.create({ data: { code: `participant-${run}`, name: '合成人员状态基地' } })).id;
    const prisma = db as unknown as PrismaService;
    inspection = new InspectionsService(prisma, new ProjectAccessService(prisma), new BusinessClock());
    personnel = new PersonnelService(prisma);
  });
  afterAll(async () => { if (db) await db.$disconnect(); });
  const create = (personIds: string[], operationId = op()) => inspection.createActivity({ operationId, date: '2026-09-15', baseId, personIds, note: null, batchLabel: '合成参与人员验证' }, actor);
  async function changeStatus(userId: string, status: 'ACTIVE' | 'INACTIVE') {
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    return personnel.change(admin, userId, { requestId: op(), expectedVersion: user.updatedAt.toISOString(), status, reason: '隔离测试：从原账号服务变更状态' });
  }
  it('rejects a linked disabled account, preserves history, and allows it again after the original admin entry re-enables it', async () => {
    const user = await db.user.create({ data: { username: `participant-target-${run}`, name: '合成参与人员', teamAccessApproved: false,
      localCredential: { create: { loginName: `participant-target-${run}`, passwordHash: 'synthetic-no-login' } },
      personProfile: { create: { name: '合成参与人员档案', isActive: true } } }, include: { personProfile: true } });
    const personId = user.personProfile!.id;
    // A participant is a recorded person, not an approved task operator or role grant.
    const first = await create([personId]);
    expect(await inspection.detail(first.id, actor)).toMatchObject({ participants: [{ person: { id: personId, isActive: true } }] });
    await changeStatus(user.id, 'INACTIVE');
    expect(await db.personProfile.findUniqueOrThrow({ where: { id: personId } })).toMatchObject({ isActive: true });
    expect(await inspection.detail(first.id, actor)).toMatchObject({ participants: [{ person: { id: personId, isActive: false } }] });
    const rejectedOperation = op();
    const before = await db.inspectionActivity.count({ where: { productionBaseId: baseId } });
    await expect(create([personId], rejectedOperation)).rejects.toMatchObject({ status: 400 });
    await expect(inspection.updateActivity(first.id, { operationId: op(), expectedRevision: 1, date: '2026-09-15', personIds: [personId], note: '不能以旧状态保存', batchLabel: null }, actor)).rejects.toMatchObject({ status: 400 });
    expect(await db.inspectionActivity.count({ where: { productionBaseId: baseId } })).toBe(before);
    expect(await db.adminCommandRequest.count({ where: { idempotencyKey: `inspections:${actor.id}:${rejectedOperation}` } })).toBe(0);
    expect(await db.inspectionActivity.findUniqueOrThrow({ where: { id: first.id } })).toMatchObject({ revision: 1, note: null });
    await changeStatus(user.id, 'ACTIVE');
    await expect(create([personId])).resolves.toMatchObject({ revision: 1 });
    expect(await inspection.detail(first.id, actor)).toMatchObject({ participants: [{ person: { isActive: true } }] });
    expect(await db.user.findUniqueOrThrow({ where: { id: user.id }, include: { userRoles: true } })).toMatchObject({ teamAccessApproved: false, userRoles: [] });
  });
  it('accepts a re-enabled linked account even when its historical profile flag is false', async () => {
    const user = await db.user.create({ data: { username: `participant-old-disabled-${run}`, name: '迁移停用档案', status: 'INACTIVE', teamAccessApproved: false,
      localCredential: { create: { loginName: `participant-old-disabled-${run}`, passwordHash: 'synthetic-no-login' } },
      personProfile: { create: { name: '迁移停用档案', isActive: false } } }, include: { personProfile: true } });
    const personId = user.personProfile!.id;
    await expect(create([personId])).rejects.toMatchObject({ status: 400 });
    await changeStatus(user.id, 'ACTIVE');
    expect(await db.personProfile.findUniqueOrThrow({ where: { id: personId } })).toMatchObject({ isActive: false });
    const saved = await create([personId]);
    expect(await inspection.detail(saved.id, actor)).toMatchObject({ participants: [{ person: { id: personId, isActive: true } }] });
  });
  it('rejects an unlinked inactive profile and accepts an active profile without creating any account or grant', async () => {
    const inactive = await db.personProfile.create({ data: { name: '无账号停用档案', isActive: false } });
    const active = await db.personProfile.create({ data: { name: '无账号启用档案', isActive: true } });
    const before = await Promise.all([db.user.count(), db.localCredential.count(), db.userRole.count()]);
    await expect(create([inactive.id])).rejects.toMatchObject({ status: 400 });
    const saved = await create([active.id]);
    expect(await inspection.detail(saved.id, actor)).toMatchObject({ participants: [{ person: { id: active.id, isActive: true } }] });
    expect(await Promise.all([db.user.count(), db.localCredential.count(), db.userRole.count()])).toEqual(before);
  });
});
