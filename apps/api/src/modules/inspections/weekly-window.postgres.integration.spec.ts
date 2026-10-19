import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaService } from '../../infra/prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ProjectAccessService } from '../auth/project-access.service';
import { BusinessClock } from '../../common/business-clock';
import { InspectionsService } from './inspections.service';
const connection = process.env.WEEKLY_INSPECTION_TEST_DATABASE_URL;
if (connection) {
  const url = new URL(connection);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1' || url.port !== '55438' || url.pathname !== '/free_workbook_design_20261019') throw new Error('Use the explicitly assigned isolated weekly fixture database.');
}
describe.skipIf(!connection).sequential('real PostgreSQL natural-week activity window', () => {
  let db: PrismaClient;let service: InspectionsService;let actor: AuthenticatedUser;let baseA: string;let baseB: string;let colorA: string;
  const run = randomUUID();const inside: string[] = [];const allCreated: string[] = [];
  const range = {fromDate: '2026-12-28', toDate: '2027-01-03'};
  async function activity(date: string, baseId = baseA) {
    const saved = await service.createActivity({operationId: randomUUID(), date, baseId, batchLabel: `weekly-${run}`, personIds: []}, actor) as {id: string};
    allCreated.push(saved.id);return saved.id;
  }
  beforeAll(async () => {
    db = new PrismaClient({datasources: {db: {url: connection!}}});await db.$connect();
    const user = await db.user.create({data: {username: `weekly-${run}`, name: '合成周记录成员', teamAccessApproved: true}});
    actor = {id: user.id, username: user.username, name: user.name, email: null, departmentId: null, departmentName: null, isSystemAdmin: false, teamAccessApproved: true, authSource: 'local', authVersion: user.authVersion, roleCodes: [], permissionCodes: []};
    baseA = (await db.productionBase.create({data: {code: `weekly-a-${run}`, name: '合成周基地甲'}})).id;
    baseB = (await db.productionBase.create({data: {code: `weekly-b-${run}`, name: '合成周基地乙'}})).id;
    colorA = (await db.color.create({data: {name: '合成周颜色', productionBaseId: baseA}})).id;
    const prisma = db as unknown as PrismaService;service = new InspectionsService(prisma, new ProjectAccessService(prisma), new BusinessClock());
    inside.push(await activity(range.fromDate), await activity(range.toDate));
    for (let i = 0; i < 26; i++) inside.push(await activity('2026-12-30'));
    await activity('2026-12-27');await activity('2027-01-04');await activity('2027-01-02', baseB);
  }, 30000);
  afterAll(async () => {await db?.$disconnect();}); // Retain synthetic facts and audit; never clear the database.
  it('filters both inclusive dates in PostgreSQL before the bounded page, across year boundary', async () => {
    const first = await service.list({...range, baseId: baseA, page: '1', pageSize: '25'}, actor);
    const second = await service.list({...range, baseId: baseA, page: '2', pageSize: '25'}, actor);
    expect(first.total).toBe(28);expect(first.items).toHaveLength(25);expect(second.items).toHaveLength(3);
    expect(new Set([...first.items, ...second.items].map(item => item.id))).toEqual(new Set(inside));
    expect(first.items[0]!.activityDate.toISOString().slice(0, 10)).toBe(range.toDate);
    expect(second.items.at(-1)!.activityDate.toISOString().slice(0, 10)).toBe(range.fromDate);
    expect((await service.list({baseId: baseA, pageSize: '50'}, actor)).total).toBe(30);
    expect((await service.list({...range, baseId: baseB}, actor)).total).toBe(1);
  });
  it('uses the identical date/base scope for aggregate stats and deduplicates cross-activity vehicles', async () => {
    const object = async (suffix: string) => (await service.createObject({operationId: randomUUID(), objectCode: `weekly-${suffix}-${run}`, objectKind: 'VEHICLE', vin: null, sampleId: null}, actor) as {id: string}).id;
    const one = await object('one'), two = await object('two');
    for (const [index, objectId, overallConclusion] of [[0, one, 'PASS'], [1, one, 'PENDING'], [2, two, 'FAIL'], [28, one, 'FAIL']] as const) {
      await service.saveBatch(allCreated[index]!, {operationId: randomUUID(), expectedRevision: 1, items: [{entity: 'occurrence', kind: 'create', clientId: randomUUID(), objectId, colorId: colorA, values: {overallConclusion}}]}, actor);
    }
    expect(await service.statistics({...range, baseId: baseA}, actor)).toMatchObject({occurrences: 3, uniqueVehicles: 2, passed: 1, failed: 1, pending: 1, judged: 2, passRate: 0.5});
    expect(await service.statistics({...range, baseId: baseB}, actor)).toMatchObject({occurrences: 0, uniqueVehicles: 0, passRate: null});
  });
  it('keeps activity ID and optimistic concurrency when editing its date and note', async () => {
    const id = inside[3]!;const operationId = randomUUID();const input = {operationId, expectedRevision: 1, date: '2026-12-31', note: '合成周备注更正', personIds: []};
    const saved = await service.updateActivity(id, input, actor) as {id: string;revision: number};
    expect(saved).toMatchObject({id, revision: 2});
    expect(await service.updateActivity(id, input, actor)).toMatchObject({id, revision: 2});
    await expect(service.updateActivity(id, {...input, operationId: randomUUID(), note: 'stale'}, actor)).rejects.toMatchObject({status: 409});
    expect(await service.detail(id, actor)).toMatchObject({id, revision: 2, note: '合成周备注更正', productionBaseId: baseA});
    expect((await service.list({...range, baseId: baseA}, actor)).total).toBe(28);
    expect(await db.auditLog.count({where: {actorUserId: actor.id, action: 'INSPECTION_ACTIVITY_UPDATED'}})).toBe(1);
  });
  it('retains member authorization for both window reads and statistics', async () => {
    const blocked = {...actor, teamAccessApproved: false};
    await expect(service.list({...range, baseId: baseA}, blocked)).rejects.toMatchObject({status: 403});
    await expect(service.statistics({...range, baseId: baseA}, blocked)).rejects.toMatchObject({status: 403});
  });
});
