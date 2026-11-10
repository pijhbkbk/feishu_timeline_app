import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaService } from '../../infra/prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { importColorWorkbook } from './color-register-import';
import { adoptWorkbookProduction } from './workbook-production-adoption';
import { ProductionFactsService } from '../production-facts/production-facts.service';

const connection = process.env.TABLE_FIRST_TEST_DATABASE_URL;
if (connection) { const u = new URL(connection); if (u.hostname !== '127.0.0.1' || u.port !== '55470' || !/^\/table_first_[a-z0-9_]+$/.test(u.pathname)) throw Error('Explicit isolated table_first_* database required.'); }
describe.skipIf(!connection).sequential('source adoption PostgreSQL boundaries', () => {
  let db: PrismaClient, actor: AuthenticatedUser;
  const run = randomUUID(), client = () => db as unknown as PrismaService;
  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: connection! } } });
    const u = await db.user.create({ data: { username: `adopt-${run}`, name: '合成来源采用成员', teamAccessApproved: true } });
    actor = { id: u.id, username: u.username, name: u.name, email: null, departmentId: null, departmentName: null, isSystemAdmin: false, teamAccessApproved: true, authSource: 'local', authVersion: u.authVersion, roleCodes: [], permissionCodes: [] };
  });
  afterAll(async () => { await db?.$disconnect(); });
  async function source(label: string, corrupt = false) {
    const sha256 = createHash('sha256').update(run + label).digest('hex'), baseCode = `ADOPT-${label}-${run}`, baseName = `合成${label}`;
    const standard = (row: number) => ({ id: `color-${row}`, source: { sheet: '标准', rows: [row] }, baseCode, productionBase: baseName, colorName: `颜色${row}`, measurements: [], issues: [], measurementCondition: {} });
    const production = (row: number) => ({ source: { sheet: '产量', rows: [row] }, colorNameRaw: `颜色${row}`, baseCodeCandidate: baseCode, exactLiteralNameBaseCandidates: row <= 2 ? [`color-${row}`] : [], year: 2026, sectionLabelRaw: '来源月度总量', months: [5, 0, null].map((quantity, i) => ({ monthPosition: i + 1, effectiveValue: quantity, cell: `${String.fromCharCode(66 + i)}${row}`, sourceHeader: { effectiveValue: `${i + 1}月` }, ...(corrupt && row === 3 && i === 2 ? { formula: '=SUM(A1:A2)' } : {}) })) });
    const sheets = [{ name: '标准', rows: [1, 2].map(row => ({ row, cells: [{ value: `颜色${row}` }] })) }, { name: '产量', rows: [1, 2, 3].map(row => ({ row, cells: [{ value: `颜色${row}` }, { value: 5 }, { value: 0 }, { value: null }] })) }];
    const input = { sha256, byteSize: 10, fileName: '合成来源.xlsx', objectKey: `synthetic/${sha256}.xlsx`, preserveProductionOnly: true, scanEvidence: { engine: 'UNIT_DOMAIN_FIXTURE_NOT_SCAN_PROOF' }, manifest: {
      schemaVersion: 'source-analysis-candidate-v2', sourceSha256: sha256, rawWorkbook: { sourceSha256: sha256, sourceAfterSha256: sha256, sourceBytes: 10, sheets },
      rowPreservationLedger: sheets.flatMap(s => s.rows.map(r => ({ sheet: s.name, row: r.row, classifications: [{ kind: 'SYNTHETIC' }] }))),
      baseColorCandidates: [standard(1), standard(2)], productionCandidates: [production(1), production(2), production(3)], rules: {}, sectionMappings: [],
    } };
    const imported = await importColorWorkbook(client(), actor, input);
    return { sha256, baseCode, batchId: imported.batchId, input: { sha256, fromMonth: '2026-01', toMonth: '2026-03' } };
  }
  it('plans without writes, applies exact zero/null and source-only identity, and replays once', async () => {
    const s = await source('main');
    const before = await db.colorImportRow.findMany({ where: { batchId: s.batchId }, select: { id: true, rawCells: true, normalization: true } });
    const colors = await db.color.count(), facts = await db.colorProductionFact.count();
    const plan = await adoptWorkbookProduction(client(), actor, s.input);
    expect(plan.status).toBe('PLAN_ONLY'); if (plan.status !== 'PLAN_ONLY') throw Error('plan expected');
    expect(plan.plan.rows).toHaveLength(3); expect(plan.plan.conflicts).toEqual([]);
    expect(await db.color.count()).toBe(colors); expect(await db.colorProductionFact.count()).toBe(facts);
    const first = await adoptWorkbookProduction(client(), actor, { ...s.input, expectedPlanHash: plan.planHash });
    expect(first.status).toBe('APPLIED'); if (first.status !== 'APPLIED') throw Error('apply expected');
    expect(first.result.newColors).toBe(1); expect(first.result.facts.map(f => f.quantity)).toEqual(['5', '0', null, '5', '0', null, '5', '0', null]);
    const repeated = await Promise.all([adoptWorkbookProduction(client(), actor, { ...s.input, expectedPlanHash: plan.planHash }), adoptWorkbookProduction(client(), actor, s.input)]);
    expect(repeated.every(r => r.status === 'ALREADY_APPLIED')).toBe(true);
    expect(await db.colorProductionFact.count()).toBe(facts + 9);
    expect(await db.colorImportRow.findMany({ where: { batchId: s.batchId }, select: { id: true, rawCells: true, normalization: true } })).toEqual(before);
    const base = await db.productionBase.findUniqueOrThrow({ where: { code: s.baseCode } });
    const api = new ProductionFactsService(client());
    const matrix = await api.matrix({ baseId: base.id, year: '2026' }, actor);
    expect(matrix.items.every(c => c.cells.slice(0, 3).every(m => m.editable))).toBe(true);
    const changed = first.result.facts[0]!;
    await api.saveBatch({ operationId: randomUUID(), items: [{ kind: 'update', id: changed.id, expectedRevision: 1, quantity: 7 }] }, actor);
    await adoptWorkbookProduction(client(), actor, s.input);
    expect((await db.colorProductionFact.findUniqueOrThrow({ where: { id: changed.id } })).quantity?.toString()).toBe('7');
  });
  it('rejects a stale plan and never overwrites a manual fact or partially adds missing identities', async () => {
    const s = await source('conflict'); const plan = await adoptWorkbookProduction(client(), actor, s.input);
    if (plan.status !== 'PLAN_ONLY') throw Error('plan expected');
    const r = plan.plan.rows[0]!;
    await new ProductionFactsService(client()).saveBatch({ operationId: randomUUID(), items: [{ kind: 'create', clientId: randomUUID(), colorId: r.colorId, baseId: r.baseId, month: '2026-01', rowKind: 'MONTH_TOTAL', quantity: 8 }] }, actor);
    const colors = await db.color.count(), facts = await db.colorProductionFact.count();
    await expect(adoptWorkbookProduction(client(), actor, { ...s.input, expectedPlanHash: plan.planHash })).rejects.toMatchObject({ status: 409 });
    expect(await db.color.count()).toBe(colors); expect(await db.colorProductionFact.count()).toBe(facts);
    const updated = await adoptWorkbookProduction(client(), actor, s.input); expect(updated.status === 'PLAN_ONLY' && updated.plan.conflicts.length).toBe(1);
  });
  it('rejects source formula substitution rather than calculating or changing it', async () => {
    const s = await source('formula', true); const count = await db.colorProductionFact.count();
    await expect(adoptWorkbookProduction(client(), actor, s.input)).rejects.toMatchObject({ status: 409 });
    expect(await db.colorProductionFact.count()).toBe(count);
  });
  it('checks current authorization before replay or planning', async () => {
    const s = await source('revoked'); await db.user.update({ where: { id: actor.id }, data: { teamAccessApproved: false } });
    await expect(adoptWorkbookProduction(client(), actor, s.input)).rejects.toMatchObject({ status: 403 });
    await db.user.update({ where: { id: actor.id }, data: { teamAccessApproved: true } });
  });
});
