import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ProductionFactsService } from './production-facts.service';
const connection = process.env.LIGHT_TRUCK_FACTS_TEST_DATABASE_URL;
if (connection) { const url = new URL(connection); if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1' || url.port !== '55438' || !/^\/light_truck_facts_test_[a-z0-9_]+$/.test(url.pathname)) throw new Error('Explicit disposable light_truck_facts_test_* PostgreSQL on loopback:55438 only.'); }
describe.runIf(Boolean(connection))('production statistics use one SQL snapshot', () => {
  const db = new PrismaClient({ datasources: { db: { url: connection ?? 'postgresql://synthetic:synthetic@127.0.0.1:55438/light_truck_facts_test_not_running' } } });
  const run = randomUUID(); let actor: AuthenticatedUser, baseId: string, colorId: string;
  beforeAll(async () => {
    const user = await db.user.create({ data: { username: `snapshot-${run}`, name: '普通统计成员', teamAccessApproved: true } });
    actor = { id: user.id, username: user.username, name: user.name, email: null, departmentId: null, departmentName: null, authSource: 'local', authVersion: user.authVersion, isSystemAdmin: false, teamAccessApproved: true, roleCodes: [] };
    baseId = (await db.productionBase.create({ data: { code: `snapshot-${run}`, name: '统计隔离基地' } })).id;
    colorId = (await db.color.create({ data: { name: '统计隔离颜色', productionBaseId: baseId } })).id;
  });
  afterAll(async () => { await db.$disconnect(); });
  it('keeps total and grouped quantities coherent when another connection commits between aggregate and groupBy', async () => {
    const service = new ProductionFactsService(db as never);
    const saved = await service.saveBatch({ operationId: randomUUID(), items: [{ kind: 'create', clientId: 'a', colorId, baseId, month: '2026-11', quantity: 10, rowKind: 'MONTH_TOTAL' }] }, actor) as { items: Array<{ id: string }> };
    let concurrentCommit = false;
    const client = {
      $transaction: <T>(runTransaction: (tx: Prisma.TransactionClient) => Promise<T>, options?: { isolationLevel?: Prisma.TransactionIsolationLevel }) => db.$transaction(async tx => {
        const delegate = new Proxy(tx.colorProductionFact, {
          get(target, name) {
            const value = Reflect.get(target, name);
            if (name !== 'aggregate') return typeof value === 'function' ? value.bind(target) : value;
            return async (...args: unknown[]) => {
              const result = await Reflect.apply(value, target, args);
              // Real second connection commits after the first SELECT established the read snapshot.
              await db.colorProductionFact.update({ where: { id: saved.items[0]!.id }, data: { quantity: null } });
              concurrentCommit = true;
              return result;
            };
          },
        });
        const intercepted = new Proxy(tx, { get(target, name) { const value = Reflect.get(target, name); return name === 'colorProductionFact' ? delegate : typeof value === 'function' ? value.bind(target) : value; } });
        return runTransaction(intercepted);
      }, options),
    };
    const consistent = await new ProductionFactsService(client as never).statistics({ baseId, fromMonth: '2026-11', toMonth: '2026-11' }, actor);
    expect(concurrentCommit).toBe(true);
    expect(consistent).toMatchObject({ factCount: 1, unknownCount: 0, quantity: '10', knownQuantity: '10', byBase: [{ baseId, factCount: 1, unknownCount: 0, quantity: '10', knownQuantity: '10' }] });
    expect(await service.statistics({ baseId, fromMonth: '2026-11', toMonth: '2026-11' }, actor)).toMatchObject({ factCount: 1, unknownCount: 1, quantity: null, knownQuantity: '0', byBase: [{ baseId, factCount: 1, unknownCount: 1, quantity: null, knownQuantity: '0' }] });
  });
});
