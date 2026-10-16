import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InspectionsService } from './inspections.service';
import { BusinessClock } from '../../common/business-clock';
import { ProjectAccessService } from '../auth/project-access.service';
import type { PrismaService } from '../../infra/prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';

const connection = process.env.LIGHT_TRUCK_FACTS_TEST_DATABASE_URL;
if (connection) {
  const url = new URL(connection);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1' || url.port !== '55438' || !/^\/light_truck_facts_test_[a-z0-9_]+$/.test(url.pathname)) throw new Error('Use an explicit disposable light_truck_facts_test_* database at loopback:55438.');
}
describe.skipIf(!connection).sequential('inspection command replay ordering on isolated PostgreSQL', () => {
  let db: PrismaClient, service: InspectionsService, actor: AuthenticatedUser, baseId: string, personId: string;
  const run = randomUUID();
  const receipt = (operationId: string) => db.adminCommandRequest.count({ where: { idempotencyKey: `inspections:${actor.id}:${operationId}` } });
  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: connection! } } }); await db.$connect();
    const user = await db.user.create({ data: { username: `replay-${run}`, name: '合成重放操作者', teamAccessApproved: true } });
    actor = { id: user.id, username: user.username, name: user.name, email: null, departmentId: null, departmentName: null, authSource: 'local', authVersion: user.authVersion, isSystemAdmin: false, teamAccessApproved: true, roleCodes: [], permissionCodes: [] };
    baseId = (await db.productionBase.create({ data: { code: `replay-${run}`, name: '合成重放基地' } })).id;
    personId = (await db.personProfile.create({ data: { name: '合成参与者', isActive: true } })).id;
    const prisma = db as unknown as PrismaService; service = new InspectionsService(prisma, new ProjectAccessService(prisma), new BusinessClock());
  });
  afterAll(async () => { await db?.$disconnect(); });
  it('replays successful object creation before uniqueness checks; repeated real conflicts create no receipt', async () => {
    const original = { operationId: randomUUID(), objectKind: 'VEHICLE', objectCode: `object-${run}`, vin: null, sampleId: null };
    const saved = await service.createObject(original, actor);
    // Model a committed response lost at transport: retain exact request and retry.
    expect(await service.createObject(original, actor)).toMatchObject({ id: saved.id });
    const rejected = { ...original, operationId: randomUUID() };
    for (let count = 0; count < 2; count++) await expect(service.createObject(rejected, actor)).rejects.toMatchObject({ status: 409 });
    expect(await receipt(original.operationId)).toBe(1); expect(await receipt(rejected.operationId)).toBe(0);
    expect(await db.inspectionObject.count({ where: { objectCode: original.objectCode } })).toBe(1);
  });
  it('replays successful activity creation before later participant invalidation; repeated real 400 leaves no partial activity', async () => {
    const original = { operationId: randomUUID(), date: '2026-10-13', baseId, personIds: [personId], note: null, batchLabel: null };
    const saved = await service.createActivity(original, actor);
    await db.personProfile.update({ where: { id: personId }, data: { isActive: false } });
    expect(await service.createActivity(original, actor)).toMatchObject({ id: saved.id });
    const rejected = { ...original, operationId: randomUUID() };
    for (let count = 0; count < 2; count++) await expect(service.createActivity(rejected, actor)).rejects.toMatchObject({ status: 400 });
    expect(await receipt(original.operationId)).toBe(1); expect(await receipt(rejected.operationId)).toBe(0);
    expect(await db.inspectionActivity.count({ where: { productionBaseId: baseId } })).toBe(1);
    expect(await db.inspectionParticipant.count({ where: { activityId: saved.id } })).toBe(1);
  });
  it('confirms a lost CAS rejection without a commit and permits correction under a fresh operation', async () => {
    const activity = await service.createActivity({ operationId: randomUUID(), date: '2026-10-13', baseId, personIds: [] }, actor);
    const body = { operationId: randomUUID(), expectedRevision: 1, date: '2026-10-13', personIds: [], note: 'first', batchLabel: null };
    const first = await service.updateActivity(activity.id, body, actor);
    const second = await service.updateActivity(activity.id, { ...body, operationId: randomUUID(), expectedRevision: first.revision, note: 'second' }, actor);
    expect(await service.updateActivity(activity.id, body, actor)).toMatchObject({ revision: first.revision, note: 'first' });
    const rejected = { ...body, operationId: randomUUID(), note: 'stale never committed' };
    for (let count = 0; count < 2; count++) await expect(service.updateActivity(activity.id, rejected, actor)).rejects.toMatchObject({ status: 409 });
    expect(await receipt(rejected.operationId)).toBe(0);
    expect(await db.inspectionActivity.findUniqueOrThrow({ where: { id: activity.id } })).toMatchObject({ revision: second.revision, note: 'second' });
    expect(await service.updateActivity(activity.id, { ...rejected, operationId: randomUUID(), expectedRevision: second.revision }, actor)).toMatchObject({ revision: second.revision + 1 });
  });
});
