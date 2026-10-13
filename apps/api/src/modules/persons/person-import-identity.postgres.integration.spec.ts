import { createHash, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PersonsService } from './persons.service';
const connection = process.env.PERSONS_TEST_DATABASE_URL;
if (connection) { const url = new URL(connection); if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1' || url.port !== '55438' || !/^\/personnel_sheet_[a-z0-9_]+$/.test(url.pathname)) throw new Error('Explicit disposable personnel_sheet_* PostgreSQL on loopback:55438 only.'); }
describe.runIf(Boolean(connection)).sequential('person source identity on isolated PostgreSQL', () => {
  const db = new PrismaClient({ datasources: { db: { url: connection ?? 'postgresql://synthetic:synthetic@127.0.0.1:55438/personnel_sheet_not_running' } } });
  const service = new PersonsService(db as never), run = randomUUID();
  let a: AuthenticatedUser, b: AuthenticatedUser;
  async function actor(label: string) { const user = await db.user.create({ data: { username: `source-${run}-${label}`, name: '来源测试成员', teamAccessApproved: true } });
    return { id: user.id, username: user.username, name: user.name, email: null, departmentId: null, departmentName: null, authSource: 'local', authVersion: user.authVersion, isSystemAdmin: false, teamAccessApproved: true, roleCodes: [] } satisfies AuthenticatedUser; }
  const source = (label: string, rowNumbers = [2]) => ({ fileName: '同名人员.xlsx', fileHash: createHash('sha256').update(`${run}:${label}`).digest('hex'), sheetName: '人员', rowNumbers });
  const item = (clientId: string, originalSource: ReturnType<typeof source>) => ({ clientId, fields: { name: '完全同名', position: '说明不会授予资格' }, source: originalSource });
  beforeAll(async () => { a = await actor('a'); b = await actor('b'); });
  afterAll(async () => { await db.$disconnect(); });

  it('distinguishes same-name source rows, stores provenance, and replays the same operation without creating accounts', async () => {
    const counts = await Promise.all([db.user.count(), db.localCredential.count(), db.userRole.count()]);
    const original = source('two-rows');
    const input = { operationId: randomUUID(), items: [item('row-2', original), item('row-3', { ...original, rowNumbers: [3] })] };
    const result = await service.create(input, a);
    expect(result.items).toHaveLength(2); expect(result.items[0]!.id).not.toBe(result.items[1]!.id);
    for (const profile of result.items) expect(profile).toMatchObject({ name: '完全同名', userId: null, account: null, revision: 1 });
    expect((await service.create(input, a)).replayed).toBe(true);
    expect(await Promise.all([db.user.count(), db.localCredential.count(), db.userRole.count()])).toEqual(counts);
    expect(await db.personProfile.count({ where: { id: { in: result.items.map(value => value.id) } } })).toBe(2);
    expect(await db.auditLog.count({ where: { targetId: { in: result.items.map(value => value.id) }, action: 'PERSON_PROFILE_CREATED' } })).toBe(2);
    const first = result.items.find(value => value.clientId === 'row-2')!;
    expect(await service.detail(first.id, a)).toMatchObject({ originalSource: original });
    await expect(service.saveSheet({ operationId: randomUUID(), items: [{ id: first.id, expectedRevision: 1, changes: { originalSource: { ...original, rowNumbers: [9] } } }] }, a)).rejects.toMatchObject({ status: 400 });
    expect(await service.detail(first.id, a)).toMatchObject({ originalSource: original, revision: 1 });
  });

  it('makes cross-actor, new-operation imports of the identical source row mutually exclusive', async () => {
    const original = source('concurrent', [5, 2]);
    const outcomes = await Promise.allSettled([
      service.create({ operationId: randomUUID(), items: [item('row-a', original)] }, a),
      service.create({ operationId: randomUUID(), items: [item('row-b', { ...original, fileHash: original.fileHash.toUpperCase(), rowNumbers: [2, 5], fileName: '改名不产生新人.xlsx' })] }, b),
    ]);
    expect(outcomes.filter(value => value.status === 'fulfilled')).toHaveLength(1);
    const failed = outcomes.find(value => value.status === 'rejected') as PromiseRejectedResult;
    expect(failed.reason).toMatchObject({ status: 409, response: { code: 'PERSON_SOURCE_ALREADY_IMPORTED' } });
    const importKey = createHash('sha256').update(JSON.stringify({ fileHash: original.fileHash, sheetName: original.sheetName, rowNumbers: [2, 5] })).digest('hex');
    expect(await db.personProfile.count({ where: { importKey } })).toBe(1);
    const profile = await db.personProfile.findUniqueOrThrow({ where: { importKey } });
    expect(await db.auditLog.count({ where: { targetId: profile.id, action: 'PERSON_PROFILE_CREATED' } })).toBe(1);
  });

  it('rolls back earlier newly created rows when a later source identity is already imported', async () => {
    const original = source('existing');
    const prior = await service.create({ operationId: randomUUID(), items: [item('only', original)] }, a);
    const operationId = randomUUID(), fresh = source('should-rollback');
    const before = await db.personProfile.count();
    await expect(service.create({ operationId, items: [item('a-first', fresh), item('z-existing', original)] }, b)).rejects.toMatchObject({ status: 409 });
    expect(await db.personProfile.count()).toBe(before);
    expect(await db.adminCommandRequest.count({ where: { idempotencyKey: `person-profile:${b.id}:${operationId}` } })).toBe(0);
    expect(await service.detail(prior.items[0]!.id, a)).toMatchObject({ revision: 1, originalSource: original });
    const retry = await service.create({ operationId: randomUUID(), items: [item('after-rollback', fresh)] }, b);
    expect(retry.items).toHaveLength(1);
  });
});
