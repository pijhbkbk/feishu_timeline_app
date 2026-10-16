import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { InspectionsService } from './inspections.service';
import { parseInspectionBatch } from './inspections.rules';
import { commandHash } from '../color-register/color-register.rules';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { PrismaService } from '../../infra/prisma/prisma.service';
import type { ProjectAccessService } from '../auth/project-access.service';
import type { BusinessClock } from '../../common/business-clock';

const actor = { id: 'member-a', username: 'member-a', name: '合成成员', email: null, departmentId: null, departmentName: null, authSource: 'local', authVersion: 1, isSystemAdmin: false, teamAccessApproved: true, roleCodes: [], permissionCodes: [] } satisfies AuthenticatedUser;
const op = 'command-operation-1', activityId = 'activity-id';
const objectBody = { operationId: op, objectKind: 'VEHICLE', objectCode: 'SYNTHETIC-OBJECT', vin: null, vehicleModel: null, vehicleClass: null, sampleId: null };
const activityBody = { operationId: op, date: '2026-10-13', baseId: 'base-id', batchLabel: null, note: null, personIds: ['person-id'] };
const updateBody = { operationId: op, expectedRevision: 1, date: '2026-10-13', batchLabel: null, note: null, personIds: ['person-id'] };
const batchBody = { operationId: op, expectedRevision: 1, items: [{ entity: 'occurrence', kind: 'create', clientId: 'row-1', objectId: 'object-id', colorId: 'color-id', values: { overallConclusion: 'PENDING', visualConclusion: null, handlingOpinion: null, note: null } }] };
const linkBody = { operationId: op, expectedRevision: 1, projectId: 'project-id', recurringTaskId: 'monthly-id', reviewRecordId: 'review-id' };
const cases = [
  { name: 'object create', action: 'INSPECTION_OBJECT_CREATE', normalized: { objectKind: 'VEHICLE', objectCode: objectBody.objectCode, vin: null, vehicleModel: null, vehicleClass: null, sampleId: null }, send: (service: InspectionsService) => service.createObject(objectBody, actor) },
  { name: 'activity create', action: 'INSPECTION_ACTIVITY_CREATE', normalized: { activityDate: new Date('2026-10-13Z'), productionBaseId: 'base-id', batchLabel: null, note: null, personIds: ['person-id'] }, send: (service: InspectionsService) => service.createActivity(activityBody, actor) },
  { name: 'activity update', action: 'INSPECTION_ACTIVITY_UPDATE', normalized: { id: activityId, expectedRevision: 1, activityDate: new Date('2026-10-13Z'), batchLabel: null, note: null, personIds: ['person-id'] }, send: (service: InspectionsService) => service.updateActivity(activityId, updateBody, actor) },
  { name: 'fact batch', action: 'INSPECTION_FACT_BATCH', normalized: { id: activityId, ...parseInspectionBatch(batchBody) }, send: (service: InspectionsService) => service.saveBatch(activityId, batchBody, actor) },
  { name: 'review link', action: 'INSPECTION_LINK_REVIEW', normalized: { id: activityId, expectedRevision: 1, projectId: 'project-id', recurringTaskId: 'monthly-id', reviewRecordId: 'review-id' }, send: (service: InspectionsService) => service.linkReview(activityId, linkBody, actor) },
];

function harness(prior: unknown) {
  const current = { status: 'ACTIVE', authVersion: 1, isSystemAdmin: false, teamAccessApproved: true, userRoles: [] };
  const touched: string[] = [];
  const tx = {
    $executeRaw: vi.fn(async () => 1), $queryRaw: vi.fn(async () => { touched.push('domain row lock'); throw new Error('business path must not run on successful replay'); }),
    user: { findUnique: vi.fn(async () => current) },
    adminCommandRequest: { findUnique: vi.fn(async () => prior), create: vi.fn() },
    productionBase: { findUnique: vi.fn(async () => { touched.push('base validation'); throw new Error('base changed after success'); }) },
    inspectionObject: { findFirst: vi.fn(async () => { touched.push('duplicate check'); throw new Error('object exists after success'); }) },
  };
  const prisma = { $transaction: vi.fn(async (run: (value: typeof tx) => Promise<unknown>) => run(tx)) };
  const access = { assertProjectAccess: vi.fn(async () => {}) };
  const service = new InspectionsService(prisma as unknown as PrismaService, access as unknown as ProjectAccessService, {} as BusinessClock);
  return { service, tx, current, touched, access };
}
describe('actual inspection service command boundary', () => {
  it.each(cases)('$name returns its stored result before any mutable business check', async entry => {
    const result = { marker: `${entry.action}:original-success`, id: 'original-id' };
    const env = harness({ action: entry.action, requestHash: commandHash(entry.normalized), result });
    expect(await entry.send(env.service)).toEqual(result);
    expect(env.tx.adminCommandRequest.findUnique).toHaveBeenCalledWith({ where: { idempotencyKey: `inspections:${actor.id}:${op}` } });
    expect(env.touched).toEqual([]); expect(env.tx.adminCommandRequest.create).not.toHaveBeenCalled();
    // Successful receipt replay is still behind the original current-actor fence.
    env.current.teamAccessApproved = false;
    await expect(entry.send(env.service)).rejects.toMatchObject({ status: 403 });
    expect(env.tx.adminCommandRequest.findUnique).toHaveBeenCalledTimes(1);
  });
  it('rejects a repeated object collision without recording a successful command', async () => {
    const env = harness(null); env.tx.inspectionObject.findFirst.mockImplementation(async () => ({ id: 'already-existing' }) as never);
    for (let count = 0; count < 2; count++) await expect(env.service.createObject(objectBody, actor)).rejects.toMatchObject({ status: 409 });
    expect(env.tx.adminCommandRequest.findUnique).toHaveBeenCalledTimes(2); expect(env.tx.adminCommandRequest.create).not.toHaveBeenCalled();
  });
  it('rejects repeated mutable base validation without recording a successful create', async () => {
    const env = harness(null); env.tx.productionBase.findUnique.mockImplementation(async () => null as never);
    for (let count = 0; count < 2; count++) await expect(env.service.createActivity(activityBody, actor)).rejects.toMatchObject({ status: 400 });
    expect(env.tx.adminCommandRequest.findUnique).toHaveBeenCalledTimes(2); expect(env.tx.adminCommandRequest.create).not.toHaveBeenCalled();
  });
});
