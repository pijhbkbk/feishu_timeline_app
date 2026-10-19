import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEAM_BUSINESS_PERMISSIONS } from '../../common/team-membership';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AuthService } from '../auth/auth.service';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { UsersService } from '../users/users.service';
import { ColorRegisterController } from './color-register.controller';
import { ColorRegisterService } from './color-register.service';
import { ColorAnnualReviewService } from './color-annual-review.service';
import { ANNUAL_REVIEW_ACTION, firstAnnualReviewWindow } from './color-annual-review.rules';
import { MONTHLY_ACTUAL_SCOPE } from '../production-facts/production-facts.rules';
import { assertAnnualReviewExitBasis } from '../color-exits/color-exits.annual-review';
import { ProductionFactsService } from '../production-facts/production-facts.service';

const connection = process.env.COLOR_ANNUAL_REVIEW_TEST_DATABASE_URL;
if (connection) {
  const target = new URL(connection);
  if (!['postgres:', 'postgresql:'].includes(target.protocol) || target.hostname !== '127.0.0.1' || target.port !== '55438' || target.pathname !== '/personnel_sheet_design_20261019') throw new Error('Annual review tests require the specifically authorized isolated loopback synthetic test database.');
}

describe.runIf(Boolean(connection)).sequential('first annual review real PostgreSQL and HTTP', () => {
  const db = new PrismaClient({ datasources: { db: { url: connection ?? 'postgresql://synthetic:synthetic@127.0.0.1:55438/personnel_sheet_not_running' } } });
  const service = new ColorAnnualReviewService(db as never);
  const production = new ProductionFactsService(db as never);
  const run = randomUUID();
  let actor: AuthenticatedUser, outsider: AuthenticatedUser;
  let baseId: string;
  beforeAll(async () => {
    const user = await db.user.create({ data: { username: `annual-${run}`, name: '合成年复核成员', teamAccessApproved: true } });
    actor = { id: user.id, username: user.username, name: user.name, email: null, departmentId: null, departmentName: null,
      isSystemAdmin: false, teamAccessApproved: true, authSource: 'local', authVersion: user.authVersion, roleCodes: [], permissionCodes: [...TEAM_BUSINESS_PERMISSIONS] };
    outsider = { ...actor, teamAccessApproved: false };
    baseId = (await db.productionBase.create({ data: { code: `annual-${run}`, name: '合成年度基地' } })).id;
  });
  afterAll(async () => { await db.$disconnect(); });
  async function setup(quantity = 20, options: { count?: number; month?: string; unknown?: boolean } = {}) {
    const color = await db.color.create({ data: { name: '合成年度颜色', productionBaseId: baseId, registerStatus: 'LISTED', registerMonth: options.month ?? '2024-09' } });
    const window = firstAnnualReviewWindow(color.registerMonth)!;
    await db.colorProductionFact.createMany({ data: window.months.slice(0, options.count ?? 13).map((month, index) => ({ colorId: color.id, productionBaseId: baseId, month, metricScope: MONTHLY_ACTUAL_SCOPE,
      quantity: index === 0 ? options.unknown ? null : quantity : 0 })) });
    return color;
  }
  function command(snapshot: Awaited<ReturnType<typeof service.read>>, operationId = randomUUID()) {
    return { operationId, expectedRevision: snapshot.revision, expectedSnapshot: snapshot.snapshotHash, note: '逐月核对合成实际总量，保存首尾13月事实。' };
  }
  it.each([19, 20, 21])('records %i with full 13-month snapshot and audit, without changing exit facts or creating workflows', async quantity => {
    const color = await setup(quantity);
    const before = await db.workflowTask.count();
    const view = await service.read(color.id, actor);
    expect(view).toMatchObject({ quantity: String(quantity), decision: quantity < 20 ? 'EXIT_REVIEW_REQUIRED' : 'RETAIN', canRecord: true });
    expect(view.months).toHaveLength(13);
    await service.record(color.id, command(view), actor);
    const stored = await db.color.findUniqueOrThrow({ where: { id: color.id } });
    expect(stored).toMatchObject({ exitFlag: false, exitDate: null, registerStatus: 'LISTED', registerRevision: 2 });
    expect(await db.workflowTask.count()).toBe(before);
    const audit = await db.auditLog.findFirstOrThrow({ where: { targetId: color.id, action: ANNUAL_REVIEW_ACTION } });
    expect(audit.afterData).toMatchObject({ quantity: String(quantity), decision: view.decision, window: { fromMonth: '2024-09', toMonth: '2025-09', reviewMonth: '2025-10', monthCount: 13 } });
    expect((await service.read(color.id, actor)).history[0]?.id).toBe(audit.id);
  });
  it('does not accept 12 months, missing quantities, or an early review', async () => {
    for (const options of [{ count: 12 }, { unknown: true }, { month: '2030-09' }]) {
      const color = await setup(20, options); const view = await service.read(color.id, actor);
      expect(view.canRecord).toBe(false);
      if (!('month' in options)) expect(view.quantity).toBeNull();
      await expect(service.record(color.id, command(view), actor)).rejects.toMatchObject({ status: 400 });
      expect(await db.auditLog.count({ where: { targetId: color.id, action: ANNUAL_REVIEW_ACTION } })).toBe(0);
    }
  });
  it('excludes adjacent months, other bases/colors, and historical source scopes', async () => {
    const color = await setup(20);
    await db.colorProductionFact.createMany({ data: [
      { colorId: color.id, productionBaseId: baseId, month: '2024-08', metricScope: MONTHLY_ACTUAL_SCOPE, quantity: 999 },
      { colorId: color.id, productionBaseId: baseId, month: '2025-10', metricScope: MONTHLY_ACTUAL_SCOPE, quantity: 999 },
      { colorId: color.id, productionBaseId: baseId, month: '2024-09', metricScope: 'HISTORICAL_SOURCE', quantity: 999 },
    ] });
    const other = await setup(999);
    expect(other.id).not.toBe(color.id);
    expect(await service.read(color.id, actor)).toMatchObject({ quantity: '20', decision: 'RETAIN' });
  });
  it('rejects client-selected dates/totals/decisions and unknown or unauthorized identities', async () => {
    const color = await setup(); const view = await service.read(color.id, actor);
    for (const extra of [{ fromMonth: '2024-10' }, { toMonth: '2025-08' }, { quantity: '19' }, { decision: 'EXIT' }]) await expect(service.record(color.id, { ...command(view), ...extra }, actor)).rejects.toMatchObject({ status: 400 });
    await expect(service.read(color.id, outsider)).rejects.toMatchObject({ status: 403 });
    await expect(service.record(color.id, command(view), outsider)).rejects.toMatchObject({ status: 403 });
    await expect(service.read('missing-annual-color', actor)).rejects.toMatchObject({ status: 404 });
  });
  it('detects changed production with unchanged color revision and serializes CAS/replay without duplicate history', async () => {
    const color = await setup(); const view = await service.read(color.id, actor);
    const first = view.months[0]!;
    await production.saveBatch({ operationId: randomUUID(), items: [{ kind: 'update', id: first.factId, expectedRevision: first.revision, quantity: 21 }] }, actor);
    await expect(service.record(color.id, command(view), actor)).rejects.toMatchObject({ status: 409 });
    const fresh = await service.read(color.id, actor); const input = command(fresh);
    const outcomes = await Promise.allSettled([service.record(color.id, input, actor), service.record(color.id, command(fresh), actor)]);
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const winner = outcomes.find(result => result.status === 'fulfilled');
    expect(await db.auditLog.count({ where: { targetId: color.id, action: ANNUAL_REVIEW_ACTION } })).toBe(1);
    if (outcomes[0]?.status === 'fulfilled') expect(await service.record(color.id, input, actor)).toEqual(winner?.status === 'fulfilled' ? winner.value : null);
    const updated = await service.read(color.id, actor);
    await service.record(color.id, command(updated), actor);
    expect(await db.auditLog.count({ where: { targetId: color.id, action: ANNUAL_REVIEW_ACTION } })).toBe(2);
  });
  it('rolls back the audit, color revision and command when the transaction fails after audit insertion', async () => {
    const color = await setup(); const view = await service.read(color.id, actor); const input = command(view);
    const failing = new Proxy(db, { get(target, property) {
      if (property === '$transaction') return (execute: (tx: unknown) => Promise<unknown>, options: object) => target.$transaction(async tx => {
        const auditLog = new Proxy(tx.auditLog, { get(delegate, method) {
          if (method === 'create') return async (args: Parameters<typeof delegate.create>[0]) => { await delegate.create(args); throw new Error('SYNTHETIC_AFTER_AUDIT'); };
          const value = Reflect.get(delegate, method); return typeof value === 'function' ? value.bind(delegate) : value;
        } });
        return execute(new Proxy(tx, { get(transaction, key) { const value = key === 'auditLog' ? auditLog : Reflect.get(transaction, key); return typeof value === 'function' ? value.bind(transaction) : value; } }));
      }, options);
      const value = Reflect.get(target, property); return typeof value === 'function' ? value.bind(target) : value;
    } });
    await expect(new ColorAnnualReviewService(failing as never).record(color.id, input, actor)).rejects.toThrow('SYNTHETIC_AFTER_AUDIT');
    expect((await db.color.findUniqueOrThrow({ where: { id: color.id } })).registerRevision).toBe(1);
    expect(await db.auditLog.count({ where: { targetId: color.id, action: ANNUAL_REVIEW_ACTION } })).toBe(0);
    expect(await db.adminCommandRequest.count({ where: { idempotencyKey: `color-annual-review:${actor.id}:${input.operationId}` } })).toBe(0);
  });

  it('binds existing exit writes to the saved 13-month fact and rejects a forged 19 at actual 20', async () => {
    for (const quantity of [19, 20, 21]) {
      const color = await setup(quantity); const view = await service.read(color.id, actor);
      await service.record(color.id, command(view), actor);
      const basis = (annualOutput: number, finalDecision: string, statisticYear = 2025) => db.$transaction(tx => assertAnnualReviewExitBasis(tx, color.id, { annualOutput, finalDecision, statisticYear }));
      expect(await basis(quantity, quantity < 20 ? 'EXIT' : 'RETAIN')).toMatchObject({ quantity: String(quantity), monthCount: 13, fromMonth: '2024-09', toMonth: '2025-09' });
      if (quantity >= 20) {
        await expect(basis(19, 'EXIT')).rejects.toMatchObject({ status: 400 });
        await expect(basis(quantity, 'EXIT')).rejects.toMatchObject({ status: 400 });
      }
      await expect(basis(quantity, 'RETAIN', 2024)).rejects.toMatchObject({ status: 400 });
      const fact = view.months[0]!;
      await production.saveBatch({ operationId: randomUUID(), items: [{ kind: 'update', id: fact.factId, expectedRevision: fact.revision, quantity: quantity + 1 }] }, actor);
      await expect(basis(quantity, 'RETAIN')).rejects.toMatchObject({ status: 409 });
      expect((await db.color.findUniqueOrThrow({ where: { id: color.id } })).exitFlag).toBe(false);
    }
  });

  it('rechecks persisted authorization before replay and does not revive an exited color', async () => {
    const color = await setup(); const view = await service.read(color.id, actor); const input = command(view);
    await service.record(color.id, input, actor);
    await db.user.update({ where: { id: actor.id }, data: { authVersion: { increment: 1 } } });
    await expect(service.record(color.id, input, actor)).rejects.toMatchObject({ status: 403 });
    actor = { ...actor, authVersion: actor.authVersion! + 1 };
    await db.color.update({ where: { id: color.id }, data: { exitFlag: true, exitDate: new Date('2025-10-01') } });
    const exited = await service.read(color.id, actor);
    expect(exited.canRecord).toBe(false);
    await expect(service.record(color.id, command(exited), actor)).rejects.toMatchObject({ status: 400 });
    expect((await db.color.findUniqueOrThrow({ where: { id: color.id } })).exitFlag).toBe(true);
  });
  it('serves actual HTTP routes through session and permission guards, persists POST then GET', async () => {
    const sessions = new Map<string, unknown>();
    const store = { setJson: async (key: string, value: unknown) => { sessions.set(key, value); }, getJson: async (key: string) => sessions.get(key) ?? null, delete: async (key: string) => { sessions.delete(key); } };
    const config = { get: (key: string) => ({ nodeEnv: 'production', authMockEnabled: false, sessionCookieName: 'annual_test_session', sessionTtlSeconds: 3600 } as Record<string, unknown>)[key] };
    const auth = new AuthService(config as never, new UsersService(db as never), store as never, { isConfigured: () => false } as never);
    let token = '';
    await auth.createNativeSession(actor.id, actor.authVersion!, undefined, { cookie: (_key: string, value: string) => { token = value; } } as never);
    Reflect.defineMetadata('design:paramtypes', [ColorRegisterService, ColorAnnualReviewService], ColorRegisterController);
    @Module({ controllers: [ColorRegisterController], providers: [{ provide: ColorRegisterService, useValue: new ColorRegisterService(db as never) }, { provide: ColorAnnualReviewService, useValue: service }] })
    class HttpModule {}
    const app = await NestFactory.create(HttpModule, { logger: false });
    app.setGlobalPrefix('api'); app.use(cookieParser());
    app.useGlobalGuards(new SessionAuthGuard(new Reflector(), config as never, auth), new PermissionsGuard(new Reflector()));
    await app.listen(0, '127.0.0.1');
    try {
      const color = await setup(); const url = `${await app.getUrl()}/api/color-register/${color.id}/annual-review`;
      expect((await fetch(url)).status).toBe(401);
      const headers = { Cookie: `annual_test_session=${token}`, 'Content-Type': 'application/json' };
      const response = await fetch(url, { headers }); expect(response.status).toBe(200);
      const view = await response.json() as Awaited<ReturnType<typeof service.read>>;
      const saved = await fetch(url, { method: 'POST', headers, body: JSON.stringify(command(view)) });
      expect(saved.status).toBe(201);
      expect(await saved.json()).toMatchObject({ colorId: color.id, decision: 'RETAIN' });
      const refreshed = await (await fetch(url, { headers })).json() as Awaited<ReturnType<typeof service.read>>;
      expect(refreshed.history).toHaveLength(1);
      expect((await fetch(url, { method: 'POST', headers, body: JSON.stringify({ ...command(view), fromMonth: '2024-10' }) })).status).toBe(400);
    } finally { await app.close(); }
  });
});
