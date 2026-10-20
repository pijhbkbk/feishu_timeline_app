import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ProductionFactsService } from './production-facts.service';
import { ColorAnnualReviewService, readColorAnnualSnapshot } from '../color-register/color-annual-review.service';
import { MONTHLY_MODEL_SCOPE } from './production-facts.rules';

const url = process.env.PRODUCTION_MODEL_TEST_DATABASE_URL;
if (url) {
  const parsed = new URL(url);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || parsed.hostname !== '127.0.0.1' || parsed.port !== '55462' || !['/v1_production_model_20261020', '/v1_production_model_final_20261020'].includes(parsed.pathname)) throw new Error('Dedicated production-model database only.');
}
describe.skipIf(!url).sequential('A14 model facts, monthly basis and annual evidence on PostgreSQL', () => {
  const db = new PrismaClient({ datasources: { db: { url: url ?? 'postgresql://synthetic:unused@127.0.0.1:55462/v1_production_model_20261020' } } });
  const run = randomUUID();
  let actor: AuthenticatedUser, service: ProductionFactsService, baseId: string, colorId: string;
  const create = (model: string, quantity: number | null, month = '2026-09', color = colorId) => ({
    kind: 'create', clientId: randomUUID(), colorId: color, baseId, month, quantity,
    rowKind: model ? 'MODEL_DETAIL' : 'MONTH_TOTAL', ...(model ? { vehicleModel: model } : {}),
  });
  const save = (items: unknown[], operationId = randomUUID()) => service.saveBatch({ operationId, items }, actor) as Promise<{ items: Array<{ id: string; revision: number; quantity: string | null }> }>;
  const stats = (month = '2026-09', extra = {}) => service.statistics({ colorId, baseId, fromMonth: month, toMonth: month, ...extra }, actor);
  beforeAll(async () => {
    const user = await db.user.create({ data: { username: `model-${run}`, name: '合成产量成员', teamAccessApproved: true } });
    actor = { id: user.id, username: user.username, name: user.name, email: null, departmentId: null, departmentName: null, authSource: 'local', authVersion: user.authVersion, isSystemAdmin: false, teamAccessApproved: true, roleCodes: [] };
    baseId = (await db.productionBase.create({ data: { code: `models-${run}`, name: '合成车型基地' } })).id;
    colorId = (await db.color.create({ data: { name: '合成原文车型色', productionBaseId: baseId } })).id;
    service = new ProductionFactsService(db as never);
  });
  afterAll(async () => { await db.$disconnect(); });

  it('persists same color/base/month models 10+12+5=27, replaces 10→8→9 and replays without adding', async () => {
    const items = [create('车型甲', 10), create('车型乙', 12), create('车型丙', 5)], operationId = randomUUID();
    const first = await save(items, operationId);
    expect(await stats()).toMatchObject({ quantity: '27', factCount: 3, unknownCount: 0 });
    const id = first.items[0]!.id, updateOp = randomUUID();
    const update = [{ kind: 'update', id, expectedRevision: 1, quantity: 8 }];
    await save(update, updateOp); expect(await stats()).toMatchObject({ quantity: '25' });
    await save(update, updateOp); expect(await stats()).toMatchObject({ quantity: '25' });
    await save([{ kind: 'update', id, expectedRevision: 2, quantity: 9 }]);
    await save(items, operationId);
    expect(await stats()).toMatchObject({ quantity: '26' });
    expect(await service.detail(id, actor)).toMatchObject({ id, quantity: '9', revision: 3, vehicleModel: '车型甲' });
    const list = await service.list({ colorId, baseId, fromMonth: '2026-09', toMonth: '2026-09' }, actor);
    expect(list.items).toHaveLength(3); expect(list.items.every(item => item.includedInOperationalTotal)).toBe(true);
    expect(list.items.reduce((sum, item) => sum + Number(item.effectiveQuantity), 0)).toBe(26);
    expect(await stats('2026-09', { vehicleModel: '车型甲' })).toMatchObject({ quantity: '9', factCount: 1 });
    await expect(save(update)).rejects.toMatchObject({ status: 409 });
  });

  it('retains a mixed total unchanged and never counts 100+40+60 without explicit snapshot-bound choice', async () => {
    const first = await save([create('', 100, '2026-10'), create('车型甲', 40, '2026-10'), create('车型乙', 60, '2026-10')]);
    expect(await stats('2026-10')).toMatchObject({ quantity: null, knownQuantity: '0', reconciliationMonthCount: 1 });
    const group = { colorId, baseId, month: '2026-10' };
    const before = await service.basis(group, actor);
    const request = { ...group, operationId: randomUUID(), mode: 'MONTH_TOTAL', expectedRevision: before.revision, expectedSnapshot: before.snapshotHash };
    await service.selectBasis(request, actor);
    await service.selectBasis(request, actor);
    expect(await stats('2026-10')).toMatchObject({ quantity: '100', factCount: 1, reconciliationMonthCount: 0 });
    expect(await stats('2026-10', { vehicleModel: '车型甲' })).toMatchObject({ quantity: null, unallocatedMonthCount: 1 });
    const selected = await service.basis(group, actor);
    const firstPage = await service.list({ colorId, fromMonth: '2026-10', toMonth: '2026-10', pageSize: '1' }, actor);
    await service.selectBasis({ ...request, operationId: randomUUID(), mode: 'MODEL_DETAILS', expectedRevision: selected.revision, expectedSnapshot: selected.snapshotHash }, actor);
    const changedPage = await service.list({ colorId, fromMonth: '2026-10', toMonth: '2026-10', pageSize: '1', page: '2' }, actor);
    expect(changedPage.snapshotHash).not.toBe(firstPage.snapshotHash);
    await save([{ kind: 'update', id: first.items[1]!.id, expectedRevision: 1, quantity: 39 }]);
    expect(await stats('2026-10')).toMatchObject({ quantity: '99', factCount: 2 });
    expect(await service.detail(first.items[0]!.id, actor)).toMatchObject({ quantity: '100', revision: 1 });
    expect(await db.colorProductionFact.count({ where: { colorId, month: '2026-10' } })).toBe(3);
    await expect(service.selectBasis({ ...request, operationId: randomUUID() }, actor)).rejects.toMatchObject({ status: 409 });
  });

  it('shares the month lock between selecting a basis and editing a fact, rejecting a stale selection', async () => {
    const made = await save([create('', 20, '2026-11'), create('车型甲', 20, '2026-11')]);
    const group = { colorId, baseId, month: '2026-11' }, before = await service.basis(group, actor);
    let release!: () => void, entered!: () => void;
    const held = new Promise<void>(resolve => { entered = resolve; });
    const unlock = new Promise<void>(resolve => { release = resolve; });
    const writer = db.$transaction(async tx => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext('production-fact-month'), hashtext(${`${colorId}:${baseId}:2026-11`}))`);
      await tx.colorProductionFact.update({ where: { id: made.items[1]!.id }, data: { quantity: 19, revision: { increment: 1 } } });
      entered(); await unlock;
    });
    await held;
    let settled = false;
    const select = service.selectBasis({ ...group, operationId: randomUUID(), mode: 'MODEL_DETAILS', expectedRevision: 0, expectedSnapshot: before.snapshotHash }, actor)
      .then(() => { settled = true; return null; }, error => { settled = true; return error; });
    await new Promise(resolve => setTimeout(resolve, 100)); expect(settled).toBe(false);
    release(); await writer; expect(await select).toMatchObject({ status: 409 });
    expect((await service.basis(group, actor)).mode).toBeNull();
  });

  it('has one winner under concurrent CAS and rolls back other entries on a stale batch', async () => {
    const created = await save([create('并发甲', 1, '2026-12'), create('并发乙', 2, '2026-12')]);
    const id = created.items[0]!.id;
    const results = await Promise.allSettled([save([{ kind: 'update', id, expectedRevision: 1, quantity: 8 }]), save([{ kind: 'update', id, expectedRevision: 1, quantity: 9 }])]);
    expect(results.filter(item => item.status === 'fulfilled')).toHaveLength(1);
    await expect(save([{ kind: 'update', id: created.items[1]!.id, expectedRevision: 1, quantity: 99 }, { kind: 'update', id, expectedRevision: 1, quantity: 3 }])).rejects.toMatchObject({ status: 409 });
    expect(await service.detail(created.items[1]!.id, actor)).toMatchObject({ quantity: '2', revision: 1 });
  });

  it('propagates null independently of zero and rejects forged identity/model mutation', async () => {
    const created = await save([create('空值车', null, '2027-01'), create('零值车', 0, '2027-01')]);
    expect(await stats('2027-01')).toMatchObject({ quantity: null, knownQuantity: '0', unknownCount: 1 });
    await expect(save([{ kind: 'update', id: created.items[0]!.id, expectedRevision: 1, quantity: 1, vehicleModel: '其他车' }])).rejects.toMatchObject({ status: 400 });
    await expect(save([create('零值车', 1, '2027-01')])).rejects.toMatchObject({ status: 409 });
    await expect(save([{ ...create('零值车', 1), baseId: 'other-base' }])).rejects.toMatchObject({ status: 400 });
    await expect(db.colorProductionFact.create({ data: { colorId, productionBaseId: baseId, month: '2027-02', metricScope: MONTHLY_MODEL_SCOPE, vehicleModel: '', quantity: 1 } })).rejects.toThrow();
  });

  it('caps each model group at 100 without reading or overwriting original source scopes', async () => {
    for (const start of [0, 50]) await save(Array.from({ length: 50 }, (_, i) => create(`车型${start + i}`, 0, '2027-03')));
    await expect(save([create('第101车型', 1, '2027-03')])).rejects.toMatchObject({ status: 400 });
    await db.colorProductionFact.create({ data: { colorId, productionBaseId: baseId, month: '2027-03', metricScope: '历史来源未确认', quantity: 999 } });
    expect(await stats('2027-03')).toMatchObject({ quantity: '0', factCount: 100 });
    expect(await service.sources({ colorId, fromMonth: '2027-03', toMonth: '2027-03' }, actor)).toMatchObject({ total: 1 });
  });

  it('uses 13 months, keeps 20, rejects null/missing/mixed months and preserves old total snapshot shape', async () => {
    const color = await db.color.create({ data: { name: '合成年复核车型色', productionBaseId: baseId, registerMonth: '2024-09', registerStatus: 'LISTED' } });
    const months = Array.from({ length: 13 }, (_, i) => { const date = new Date(Date.UTC(2024, 8 + i, 1)); return date.toISOString().slice(0, 7); });
    await save(months.map((month, i) => create('年度车型', i === 0 ? 20 : 0, month, color.id)));
    const review = new ColorAnnualReviewService(db as never);
    let snap = await review.read(color.id, actor);
    expect(snap).toMatchObject({ quantity: '20', decision: 'RETAIN', canRecord: true }); expect(snap.months).toHaveLength(13);
    const saved = await review.record(color.id, { operationId: randomUUID(), expectedRevision: snap.revision, expectedSnapshot: snap.snapshotHash, note: '合成13个月车型复核' }, actor);
    expect(saved).toMatchObject({ decision: 'RETAIN' });
    const first = await db.colorProductionFact.findFirstOrThrow({ where: { colorId: color.id, month: months[0]! } });
    await save([{ kind: 'update', id: first.id, expectedRevision: 1, quantity: 19 }]);
    snap = await review.read(color.id, actor); expect(snap).toMatchObject({ quantity: '19', decision: 'EXIT_REVIEW_REQUIRED' });
    expect(snap.history[0]!.snapshot).toMatchObject({ quantity: '20', decision: 'RETAIN' });
    await save([{ kind: 'update', id: first.id, expectedRevision: 2, quantity: null }]);
    expect(await review.read(color.id, actor)).toMatchObject({ quantity: null, canRecord: false });
    await save([{ kind: 'update', id: first.id, expectedRevision: 3, quantity: 20 }, create('', 20, months[0], color.id)]);
    expect(await review.read(color.id, actor)).toMatchObject({ quantity: null, canRecord: false });
    const group = { colorId: color.id, baseId, month: months[0]! }, basis = await service.basis(group, actor);
    await service.selectBasis({ ...group, operationId: randomUUID(), mode: 'MODEL_DETAILS', expectedRevision: 0, expectedSnapshot: basis.snapshotHash }, actor);
    expect(await review.read(color.id, actor)).toMatchObject({ quantity: '20', canRecord: true });
    await save([{ kind: 'update', id: first.id, expectedRevision: 4, quantity: 21 }]);
    expect(await review.read(color.id, actor)).toMatchObject({ quantity: '21', decision: 'RETAIN', canRecord: true });
    const legacy = await db.color.create({ data: { name: '旧总量快照', productionBaseId: baseId, registerMonth: '2024-09', registerStatus: 'LISTED' } });
    const made = await save(months.slice(0, 12).map(month => create('', 0, month, legacy.id)));
    expect(await review.read(legacy.id, actor)).toMatchObject({ quantity: null, canRecord: false, missingMonths: [months[12]] });
    await save([create('', 20, months[12], legacy.id)]);
    const old = await readColorAnnualSnapshot(db, legacy);
    expect(old).toMatchObject({ quantity: '20', canRecord: true });
    expect(old.months[0]).toEqual({ month: months[0], factId: made.items[0]!.id, revision: 1, quantity: '0' });
  });

  it('holds a repeatable SQL snapshot across total and dimension reads while another connection commits', async () => {
    const created = await save([create('快照车', 10, '2027-05')]);
    let concurrentCommit = false;
    const client = {
      $transaction: <T>(runTransaction: (tx: Prisma.TransactionClient) => Promise<T>, options?: { isolationLevel?: Prisma.TransactionIsolationLevel }) =>
        db.$transaction(async tx => runTransaction(new Proxy(tx, {
          get(target, name) {
            const value = Reflect.get(target, name);
            if (name !== '$queryRaw') return typeof value === 'function' ? value.bind(target) : value;
            return async (...args: unknown[]) => {
              const result = await Reflect.apply(value, target, args);
              if (!concurrentCommit) {
                await db.colorProductionFact.update({ where: { id: created.items[0]!.id }, data: { quantity: null, revision: { increment: 1 } } });
                concurrentCommit = true;
              }
              return result;
            };
          },
        })), options),
    };
    const consistent = await new ProductionFactsService(client as never).statistics({ colorId, fromMonth: '2027-05', toMonth: '2027-05' }, actor);
    expect(concurrentCommit).toBe(true);
    expect(consistent).toMatchObject({ quantity: '10', unknownCount: 0, byBase: [{ baseId, quantity: '10' }], byVehicleModel: [{ vehicleModel: '快照车', quantity: '10' }] });
    expect(await stats('2027-05')).toMatchObject({ quantity: null, unknownCount: 1 });
  });

  it('rechecks live approval before both replay and a new basis choice', async () => {
    const group = { colorId, baseId, month: '2026-09' }, basis = await service.basis(group, actor);
    const request = { ...group, operationId: randomUUID(), mode: 'MODEL_DETAILS', expectedRevision: basis.revision, expectedSnapshot: basis.snapshotHash };
    await service.selectBasis(request, actor);
    await db.user.update({ where: { id: actor.id }, data: { teamAccessApproved: false, authVersion: { increment: 1 } } });
    await expect(service.selectBasis(request, actor)).rejects.toMatchObject({ status: 403 });
    await expect(save([create('撤权后', 1, '2027-04')])).rejects.toMatchObject({ status: 403 });
  });
});
