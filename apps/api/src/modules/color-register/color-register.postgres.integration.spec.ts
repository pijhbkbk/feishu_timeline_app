import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaService } from '../../infra/prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { importColorWorkbook } from './color-register-import';
import { ColorRegisterService } from './color-register.service';
import { ProjectColorLinkService } from '../projects/project-color-link.service';
import { readSystemColorProduction } from './color-production';
import { syntheticColorWorkbook } from './color-register.synthetic.fixture';

const databaseUrl = process.env.COLOR_REGISTER_TEST_DATABASE_URL;

// Real PostgreSQL transactions, service validation, row/advisory locks and audit.
// The manifest and source scan evidence are explicit synthetic fixtures. Actual
// XLSX parser, object storage, scanner, HTTP and browser evidence are separate gates.
describe.skipIf(!databaseUrl).sequential('color register PostgreSQL boundaries', () => {
  const run = randomUUID();
  let db: PrismaClient;
  let service: ColorRegisterService;
  let actorA: AuthenticatedUser;
  let actorB: AuthenticatedUser;
  let outsider: AuthenticatedUser;
  let fixture: ReturnType<typeof syntheticColorWorkbook>;
  let batchId: string;
  const actors: string[] = [];
  const directColors: string[] = [];
  const baseNames: Record<string, string> = {};
  let projectsBefore: number;
  let workflowTasksBefore: number;

  const prisma = () => db as unknown as PrismaService;
  const operationId = () => randomUUID();
  const auditCount = (action: string) => db.auditLog.count({ where: { actorUserId: { in: actors }, action } });
  const commandCount = (id: string, actor = actorA) => db.adminCommandRequest.count({ where: { idempotencyKey: `color-register:${actor.id}:${id}` } });
  const importFixture = (value: ReturnType<typeof syntheticColorWorkbook>, actor = actorA, client = prisma()) => importColorWorkbook(client, actor, value.input);
  const source = (sheetName: string, rowNumber: number, batch = batchId) => db.colorImportRow.findUniqueOrThrow({
    where: { batchId_sheetName_rowNumber: { batchId: batch, sheetName, rowNumber } },
    include: { color: { include: { productionBase: true, versions: { orderBy: { versionNo: 'asc' } } } } },
  });
  const colorAt = async (sheetName: string, rowNumber: number) => {
    const record = await source(sheetName, rowNumber);
    if (!record.color) throw new Error('Synthetic color source did not map.');
    return record.color;
  };
  const ownCounts = async () => {
    const batches = await db.colorImportBatch.findMany({ where: { importedById: { in: actors } }, select: { id: true } });
    const rows = await db.colorImportRow.findMany({ where: { batchId: { in: batches.map(value => value.id) } }, select: { colorId: true } });
    const colorIds = [...new Set(rows.flatMap(value => value.colorId ? [value.colorId] : [])), ...directColors];
    const [colors, versions, production, sourceRows, audits] = await Promise.all([
      db.color.count({ where: { id: { in: colorIds } } }), db.colorVersion.count({ where: { colorId: { in: colorIds } } }),
      db.colorProductionFact.count({ where: { colorId: { in: colorIds } } }),
      db.colorImportRow.count({ where: { batchId: { in: batches.map(value => value.id) } } }),
      db.auditLog.count({ where: { actorUserId: { in: actors } } }),
    ]);
    return { batches: batches.length, colors, versions, production, sourceRows, audits };
  };
  const correction = (revision: number) => ({
    operationId: operationId(), expectedRevision: revision, boardCode: 'SYNTHETIC-CORRECTION',
    technicalData: { measurements: [{ angle: 25, l: null, a: 0, b: '', originalControlLimits: '保留原限值 ±0.7' }],
      conditions: '合成更正测量条件', originalControlLimits: '原控制限文本，不换算',
      measurementDate: null, issueDate: null, expiryDate: null,
      manufacturer: '合成更正制作单位', paintType: '合成更正漆种', changeSummary: '合成标准更正，历史必须保留' },
  });

  // Inject a failure only after the real audit INSERT has executed inside the
  // real PostgreSQL transaction, so rollback assertions cover persisted writes.
  function failAfterAudit(action: string) {
    let reached = 0;
    const client = new Proxy(db, {
      get(target, property) {
        if (property === '$transaction') {
          return (execute: (tx: Prisma.TransactionClient) => Promise<unknown>, options?: { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel }) => target.$transaction(async tx => {
            const audit = new Proxy(tx.auditLog, {
              get(delegate, method) {
                if (method === 'create') return async (args: Prisma.AuditLogCreateArgs) => {
                  const result = await delegate.create(args);
                  if (args.data.action === action) { reached += 1; throw new Error('SYNTHETIC_FAILURE_AFTER_AUDIT_INSERT'); }
                  return result;
                };
                const value = Reflect.get(delegate, method);
                return typeof value === 'function' ? value.bind(delegate) : value;
              },
            });
            const injectedTx = new Proxy(tx, { get(transaction, key) {
              if (key === 'auditLog') return audit;
              const value = Reflect.get(transaction, key);
              return typeof value === 'function' ? value.bind(transaction) : value;
            } });
            return execute(injectedTx);
          }, options);
        }
        const value = Reflect.get(target, property);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }) as unknown as PrismaService;
    return { client, reached: () => reached };
  }

  beforeAll(async () => {
    // Validate before constructing or connecting Prisma. Never fall back to
    // DATABASE_URL, the source-import DB, a remote host, or an application DB.
    const parsed = new URL(databaseUrl!);
    const databaseName = decodeURIComponent(parsed.pathname.slice(1));
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) || !databaseName.includes('color_register_test')) {
      throw new Error('COLOR_REGISTER_TEST_DATABASE_URL must be a dedicated loopback color_register_test database.');
    }
    db = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
    await db.$connect();
    service = new ColorRegisterService(prisma());
    for (const base of await db.productionBase.findMany({ where: { code: { in: ['XINGANG', 'QINGZHOU', 'SHANDONG'] } } })) {
      baseNames[base.code] = base.name;
    }
    const actor = async (label: string, approved: boolean): Promise<AuthenticatedUser> => {
      const user = await db.user.create({ data: { username: `color-reg-${label}-${run}`, name: `合成清单成员 ${label}`, teamAccessApproved: approved } });
      actors.push(user.id);
      return { id: user.id, username: user.username, name: user.name, email: null, departmentId: null, departmentName: null,
        isSystemAdmin: false, teamAccessApproved: approved, authSource: 'local', roleCodes: [], permissionCodes: [], authVersion: user.authVersion };
    };
    actorA = await actor('A', true); actorB = await actor('B', true); outsider = await actor('outside', false);
    [projectsBefore, workflowTasksBefore] = await Promise.all([db.project.count(), db.workflowTask.count()]);
    fixture = syntheticColorWorkbook(run, 'main', baseNames);
    batchId = (await importFixture(fixture)).batchId;
  }, 30000);

  afterAll(async () => {
    // Keep synthetic evidence in the dedicated disposable test database. Audit logs are append-only.
    if (db) await db.$disconnect();
  });

  it('preserves every sheet/row/raw value and unresolved source without inventing historical workflows', async () => {
    const batch = await db.colorImportBatch.findUniqueOrThrow({ where: { id: batchId } });
    expect([batch.sheetCount, batch.rowCount, batch.colorCount]).toEqual([3, 20, 6]);
    for (const sheet of fixture.manifest.rawWorkbook.sheets) {
      const stored = await db.colorImportRow.findMany({ where: { batchId, sheetName: sheet.name }, orderBy: { rowNumber: 'asc' } });
      expect(stored.map(value => ({ row: value.rowNumber, cells: value.rawCells }))).toEqual(sheet.rows);
    }
    expect(batch.metadata).toMatchObject({ sheets: expect.arrayContaining([expect.objectContaining({ name: '合成标准乙', state: 'hidden' })]) });
    expect(await source('合成标准甲', 7)).toMatchObject({ status: 'PENDING_REVIEW', colorId: null });
    expect(await source('合成标准甲', 8)).toMatchObject({ status: 'PRESERVED', colorId: null });
    expect(await source('合成产量', 6)).toMatchObject({ status: 'PENDING_REVIEW', colorId: null });
    const color = await colorAt('合成标准甲', 3);
    expect(color).toMatchObject({ projectId: null, code: null, registerMonth: null, registeredAt: null });
    expect(color.versions[0]).toMatchObject({ createdById: null, publishedAt: null, confirmedAt: null,
      technicalData: { measurements: [{ angle: 15, l: 80.25, a: null, b: '' }, { angle: 45, l: 79.5, a: -0.6, b: 0 }], measurementDate: null, issueDate: '2021-04-03', expiryDate: null } });
    expect(await db.project.count()).toBe(projectsBefore);
    expect(await db.workflowTask.count()).toBe(workflowTasksBefore);
  });

  it('shares only the explicitly mapped hue while base/color identities, homonyms and SD remain independent', async () => {
    const [whiteXg, whiteQz, blueSd, blueXg, homonymXg, homonymQz] = await Promise.all([
      colorAt('合成标准甲', 3), colorAt('合成标准乙', 2), colorAt('合成标准甲', 5),
      colorAt('合成标准乙', 3), colorAt('合成标准甲', 6), colorAt('合成标准乙', 4),
    ]);
    expect(whiteXg.id).not.toBe(whiteQz.id); expect(whiteXg.productionBaseId).not.toBe(whiteQz.productionBaseId);
    expect(whiteXg.hueStandardId).toBe(whiteQz.hueStandardId);
    expect(whiteXg.name).toBe('新汉玉白'); expect(whiteQz.name).toBe('新汉玉白');
    expect(whiteXg.manufacturer).not.toBe(whiteQz.manufacturer);
    expect(blueSd).toMatchObject({ name: '尊贵蓝（SD）', productionBase: { code: 'SHANDONG' } });
    expect(blueXg).toMatchObject({ name: '尊贵蓝', productionBase: { code: 'XINGANG' } });
    expect(blueSd.hueStandardId).not.toBe(blueXg.hueStandardId);
    expect(homonymXg.hueStandardId).not.toBe(homonymQz.hueStandardId);
    expect(new Set([whiteXg, whiteQz, blueSd, blueXg, homonymXg, homonymQz].map(value => value.versions[0]!.boardCode))).toEqual(new Set(['SYNTHETIC-SHARED-BOARD-CODE']));
    const xg = await service.list({ baseId: whiteXg.productionBaseId, search: '尊贵蓝' }, actorB);
    expect(xg.items.some(value => value.id === blueXg.id)).toBe(true);
    expect(xg.items.some(value => value.id === blueSd.id)).toBe(false);
    expect(xg.items.every(value => value.base?.id === whiteXg.productionBaseId)).toBe(true);
  });

  it('replays one file hash concurrently without duplicate colors, standards, source rows, production or audit', async () => {
    const before = await ownCounts();
    const results = await Promise.all([importFixture(fixture), importFixture(fixture, actorB), importFixture(fixture)]);
    expect(results.every(result => result.batchId === batchId && result.idempotentReplay)).toBe(true);
    expect(await ownCounts()).toEqual(before);
    expect(await auditCount('COLOR_WORKBOOK_IMPORTED')).toBe(1);
  });

  it('denies unapproved readers/writers even when the target record exists', async () => {
    const color = await colorAt('合成标准甲', 3);
    const before = await ownCounts();
    await expect(service.list({}, outsider)).rejects.toMatchObject({ status: 403 });
    await expect(service.detail(color.id, {}, outsider)).rejects.toMatchObject({ status: 403 });
    await expect(service.sources({}, outsider)).rejects.toMatchObject({ status: 403 });
    await expect(service.saveNotes({ operationId: operationId(), items: [{ id: color.id, expectedRevision: color.registerRevision, note: '不应写入' }] }, outsider)).rejects.toMatchObject({ status: 403 });
    await expect(service.correctStandard(color.id, correction(color.registerRevision), outsider)).rejects.toMatchObject({ status: 403 });
    await expect(importFixture(syntheticColorWorkbook(run, 'denied', baseNames), outsider)).rejects.toMatchObject({ status: 403 });
    expect(await ownCounts()).toEqual(before);
  });

  it('persists multiline notes, explicit null and empty string with the equal-permission author and refresh readback', async () => {
    const color = await colorAt('合成标准甲', 3);
    expect(actorB.roleCodes).toEqual([]); expect(actorB.isSystemAdmin).toBe(false);
    for (const note of ['合成备注\n山东文字不改变这条记录的基地\t保持原文', null, '']) {
      const before = await db.color.findUniqueOrThrow({ where: { id: color.id } });
      await service.saveNotes({ operationId: operationId(), items: [{ id: color.id, expectedRevision: before.registerRevision, note }] }, actorB);
      const fresh = await new ColorRegisterService(prisma()).detail(color.id, {}, actorA);
      expect(fresh).toMatchObject({ note, revision: before.registerRevision + 1, base: { id: color.productionBaseId } });
      const audit = await db.auditLog.findFirstOrThrow({ where: { actorUserId: actorB.id, action: 'COLOR_REGISTER_NOTE_SAVED', targetId: color.id }, orderBy: { createdAt: 'desc' } });
      expect(audit).toMatchObject({ beforeData: { note: before.registerNote, revision: before.registerRevision }, afterData: { note, revision: before.registerRevision + 1 } });
    }
  });

  it('rolls back an entire notes batch on late CAS failure and admits only one concurrent stale-version writer', async () => {
    const colors = (await Promise.all([colorAt('合成标准甲', 3), colorAt('合成标准乙', 2)])).sort((left, right) => left.id.localeCompare(right.id));
    const id = operationId(); const auditsBefore = await auditCount('COLOR_REGISTER_NOTE_SAVED');
    await expect(service.saveNotes({ operationId: id, items: colors.map((color, index) => ({ id: color.id, expectedRevision: color.registerRevision + index, note: '必须整批回滚' })) }, actorA)).rejects.toMatchObject({ status: 409 });
    for (const color of colors) expect(await db.color.findUniqueOrThrow({ where: { id: color.id } })).toMatchObject({ registerNote: color.registerNote, registerRevision: color.registerRevision });
    expect(await auditCount('COLOR_REGISTER_NOTE_SAVED')).toBe(auditsBefore); expect(await commandCount(id)).toBe(0);
    const commands = [actorA, actorB].map((actor, index) => service.saveNotes({ operationId: operationId(), items: [{ id: colors[0].id, expectedRevision: colors[0].registerRevision, note: `并发备注 ${index}` }] }, actor));
    const outcomes = await Promise.allSettled(commands);
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(result => result.status === 'rejected')).toHaveLength(1);
    const rejected = outcomes.find(result => result.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ status: 409 });
    expect(await db.color.findUniqueOrThrow({ where: { id: colors[0].id } })).toMatchObject({ registerRevision: colors[0].registerRevision + 1 });
    expect(await auditCount('COLOR_REGISTER_NOTE_SAVED')).toBe(auditsBefore + 1);
  });

  it('serializes duplicate note commands and rejects changed content under a used operation key', async () => {
    const color = await colorAt('合成标准乙', 2); const auditsBefore = await auditCount('COLOR_REGISTER_NOTE_SAVED');
    const command = { operationId: operationId(), items: [{ id: color.id, expectedRevision: color.registerRevision, note: '重复保存仅一次' }] };
    const results = await Promise.all([service.saveNotes(command, actorA), service.saveNotes(command, actorA)]);
    expect(results[0]).toEqual(results[1]); expect(await commandCount(command.operationId)).toBe(1);
    expect(await auditCount('COLOR_REGISTER_NOTE_SAVED')).toBe(auditsBefore + 1);
    await expect(service.saveNotes({ ...command, items: [{ ...command.items[0], note: '不可复用旧 key' }] }, actorA)).rejects.toMatchObject({ status: 409 });
    expect(await service.detail(color.id, {}, actorB)).toMatchObject({ note: '重复保存仅一次', revision: color.registerRevision + 1 });
  });

  it('appends a standard with preserved history/null dates, replays once, and cannot list a candidate through correction', async () => {
    const color = await colorAt('合成标准甲', 3); const previous = color.versions[0]!;
    const command = correction(color.registerRevision);
    const result = await service.correctStandard(color.id, command, actorB);
    expect(await service.correctStandard(color.id, command, actorB)).toEqual(result);
    expect(result).toMatchObject({ colorId: color.id, versionNo: 2, revision: color.registerRevision + 1 });
    expect(await db.colorVersion.findUniqueOrThrow({ where: { id: previous.id } })).toEqual(previous);
    const fresh = await service.detail(color.id, {}, actorA);
    expect(fresh).toMatchObject({ registerMonth: null, productionApprovalStatus: 'UNKNOWN', versionsTotal: 2 });
    expect(fresh.versions[0]).toMatchObject({ measurementDate: null, issueDate: null, expiryDate: null, effectiveDate: null,
      measurements: [{ angle: 25, l: null, a: 0, b: '', originalControlLimits: '保留原限值 ±0.7' }] });
    expect(fresh.versions[1]).toMatchObject({ issueDate: '2021-04-03', measurementDate: null });
    const candidate = await db.color.create({ data: { name: `合成候选-${run}`, productionBaseId: color.productionBaseId, registerStatus: 'CANDIDATE' } });
    directColors.push(candidate.id);
    await expect(service.correctStandard(candidate.id, correction(candidate.registerRevision), actorA)).rejects.toMatchObject({ status: 400 });
    expect(await db.colorVersion.count({ where: { colorId: candidate.id } })).toBe(0);
    expect(await db.color.findUniqueOrThrow({ where: { id: candidate.id } })).toMatchObject({ registerStatus: 'CANDIDATE', code: null, registerMonth: null });
  });

  it('keeps production at color/base/month/scope grain across multiple angles/versions and retains unknown quantities', async () => {
    const color = await colorAt('合成标准甲', 3);
    const facts = await db.colorProductionFact.findMany({ where: { colorId: color.id }, orderBy: { month: 'asc' } });
    expect(facts.map(value => [value.month, value.quantity?.toString() ?? null, value.metricScope, value.productionBaseId])).toEqual([
      ['2025-01', '12.5', '合成统计口径', color.productionBaseId], ['2025-02', null, '合成统计口径', color.productionBaseId],
      ['2025-03', '0', '合成统计口径', color.productionBaseId], ['2025-04', null, '合成统计口径', color.productionBaseId],
    ]);
    const detail = await service.detail(color.id, {}, actorB);
    expect(detail.versionsTotal).toBe(2); expect(detail.production).toHaveLength(4);
    expect(detail.production.reduce((sum, value) => sum + Number(value.quantity ?? 0), 0)).toBe(12.5);
    expect((await colorAt('合成标准乙', 2)).productionBaseId).not.toBe(color.productionBaseId);
    expect(await db.colorProductionFact.count({ where: { colorId: (await colorAt('合成标准乙', 2)).id } })).toBe(0);
    expect(await db.colorProductionFact.count({ where: { colorId: (await colorAt('合成标准甲', 5)).id } })).toBe(0);
    const productionSource = await source('合成产量', 3);
    expect(productionSource.rawCells).toEqual(fixture.manifest.rawWorkbook.sheets[2]!.rows[2]!.cells);
    expect(await source('合成产量', 5)).toMatchObject({ status: 'PENDING_REVIEW', colorId: null });
  });

  it('rolls back the entire import after a real final audit insert, then allows one clean retry', async () => {
    const input = syntheticColorWorkbook(run, 'import-rollback', baseNames); const before = await ownCounts();
    const globalBefore = { colors: await db.color.count(), versions: await db.colorVersion.count(), hues: await db.hueStandard.count() };
    const failed = failAfterAudit('COLOR_WORKBOOK_IMPORTED');
    await expect(importFixture(input, actorA, failed.client)).rejects.toThrow('SYNTHETIC_FAILURE_AFTER_AUDIT_INSERT');
    expect(failed.reached()).toBe(1);
    expect(await db.colorImportBatch.findUnique({ where: { sha256: input.input.sha256 } })).toBeNull();
    expect(await ownCounts()).toEqual(before);
    expect({ colors: await db.color.count(), versions: await db.colorVersion.count(), hues: await db.hueStandard.count() }).toEqual(globalBefore);
    const result = await importFixture(input);
    expect(result).toMatchObject({ colorCount: 6, rowCount: 20, sheetCount: 3, mappedProductionRows: 1, idempotentReplay: false });
    expect(await importFixture(input)).toMatchObject({ batchId: result.batchId, idempotentReplay: true });
  });

  it('rolls back a standard version/register revision/audit together when the transaction fails after audit INSERT', async () => {
    const color = await colorAt('合成标准乙', 2);
    const before = await db.color.findUniqueOrThrow({ where: { id: color.id } });
    const versions = await db.colorVersion.findMany({ where: { colorId: color.id }, orderBy: { versionNo: 'asc' } });
    const auditsBefore = await auditCount('COLOR_STANDARD_CORRECTED'); const command = correction(color.registerRevision);
    const failed = failAfterAudit('COLOR_STANDARD_CORRECTED');
    await expect(new ColorRegisterService(failed.client).correctStandard(color.id, command, actorA)).rejects.toThrow('SYNTHETIC_FAILURE_AFTER_AUDIT_INSERT');
    expect(failed.reached()).toBe(1); expect(await commandCount(command.operationId)).toBe(0);
    expect(await db.color.findUniqueOrThrow({ where: { id: color.id } })).toEqual(before);
    expect(await db.colorVersion.findMany({ where: { colorId: color.id }, orderBy: { versionNo: 'asc' } })).toEqual(versions);
    expect(await auditCount('COLOR_STANDARD_CORRECTED')).toBe(auditsBefore);
    expect(await service.correctStandard(color.id, command, actorA)).toMatchObject({ versionNo: 2, revision: color.registerRevision + 1 });
  });

  it('rechecks persisted membership before mutation even when the caller holds a formerly approved actor', async () => {
    const color = await colorAt('合成标准甲', 3); const before = await ownCounts();
    await db.user.update({ where: { id: actorB.id }, data: { teamAccessApproved: false } });
    try {
      await expect(service.saveNotes({ operationId: operationId(), items: [{ id: color.id, expectedRevision: color.registerRevision, note: '撤权后不可写入' }] }, actorB)).rejects.toMatchObject({ status: 403 });
      await expect(service.correctStandard(color.id, correction(color.registerRevision), actorB)).rejects.toMatchObject({ status: 403 });
      await expect(importFixture(syntheticColorWorkbook(run, 'revoked', baseNames), actorB)).rejects.toMatchObject({ status: 403 });
      expect(await ownCounts()).toEqual(before);
      expect(await db.color.findUniqueOrThrow({ where: { id: color.id } })).toMatchObject({ registerNote: color.registerNote, registerRevision: color.registerRevision });
    } finally { await db.user.update({ where: { id: actorB.id }, data: { teamAccessApproved: true } }); }
  });
  it('groups system production by exact color/base/business month without versions, angles or imported totals', async () => {
    const color = await colorAt('合成标准甲', 3);
    const other = await colorAt('合成标准乙', 2);
    const project = await db.project.create({ data: { code: `sys-production-${run}`, name: '合成系统产量', primaryColorId: color.id } });
    const otherProject = await db.project.create({ data: { code: `sys-production-other-${run}`, name: '合成其他基地产量', primaryColorId: other.id } });
    await db.productionPlan.createMany({ data: [
      { projectId: project.id, planNo: 'A', planType: 'MASS_PRODUCTION', status: 'COMPLETED', actualQuantity: 7, planDate: new Date('2026-08-31T16:00:00Z') },
      { projectId: project.id, planNo: 'B', planType: 'MASS_PRODUCTION', status: 'COMPLETED', actualQuantity: 11, planDate: new Date('2026-09-12T16:00:00Z') },
      { projectId: project.id, planNo: 'DRAFT', planType: 'MASS_PRODUCTION', status: 'DRAFT', actualQuantity: 900, planDate: new Date('2026-09-12') },
      { projectId: project.id, planNo: 'FIRST', planType: 'FIRST_UNIT', status: 'COMPLETED', actualQuantity: 800, planDate: new Date('2026-09-12') },
      { projectId: otherProject.id, planNo: 'OTHER', planType: 'MASS_PRODUCTION', status: 'COMPLETED', actualQuantity: 700, planDate: new Date('2026-09-12') },
      { projectId: project.id, planNo: 'UNKNOWN', planType: 'MASS_PRODUCTION', status: 'COMPLETED', actualQuantity: null, planDate: new Date('2026-08-12') },
    ].map(value => ({ ...value, planType: value.planType as 'MASS_PRODUCTION' | 'FIRST_UNIT', status: value.status as 'COMPLETED' | 'DRAFT', quantity: 1000, lineName: '合成生产线', workshop: '合成车间', batchNo: 'SYNTHETIC' })) });
    const before = await readSystemColorProduction(prisma(), color.id);
    expect(before).toMatchObject({ hasMore: false, undatedRecordCount: 0, items: [
      { month: '2026-09', productionBaseId: color.productionBaseId, quantity: '18', recordCount: 2, unknownQuantityCount: 0 },
      { month: '2026-08', quantity: null, recordCount: 1, unknownQuantityCount: 1 },
    ] });
    const current = await db.color.findUniqueOrThrow({ where: { id: color.id } });
    await service.correctStandard(color.id, correction(current.registerRevision), actorA);
    expect(await readSystemColorProduction(prisma(), color.id)).toEqual(before);
  });

  it('links an existing project once with exact base, retains authors and serializes concurrent confirmations', async () => {
    const color = await colorAt('合成标准乙', 2);
    const colorBefore = await db.color.findUniqueOrThrow({ where: { id: color.id } });
    const project = await db.project.create({ data: { code: `existing-link-${run}`, name: '合成待核对旧项目', ownerUserId: actorB.id } });
    const links = new ProjectColorLinkService(prisma());
    const input = { existingColorId: color.id, productionBaseId: color.productionBaseId, expectedColorRevision: color.registerRevision,
      expectedProjectUpdatedAt: project.updatedAt.toISOString(), idempotencyKey: randomUUID() };
    await expect(links.link(project.id, { ...input, productionBaseId: 'wrong-base' }, actorA)).rejects.toMatchObject({ status: 400 });
    await expect(links.link(project.id, input, outsider)).rejects.toMatchObject({ status: 403 });
    const results = await Promise.all([links.link(project.id, input, actorA), links.link(project.id, input, actorA)]);
    expect(results.map(result => result.idempotentReplay).sort()).toEqual([false, true]);
    expect(await db.project.findUniqueOrThrow({ where: { id: project.id } })).toMatchObject({ primaryColorId: color.id, ownerUserId: actorB.id, name: project.name, createdAt: project.createdAt });
    expect(await db.color.findUniqueOrThrow({ where: { id: color.id } })).toEqual(colorBefore);
    expect(await db.auditLog.count({ where: { projectId: project.id, action: 'PROJECT_COLOR_LINKED' } })).toBe(1);
    await expect(links.link(project.id, { ...input, idempotencyKey: randomUUID() }, actorB)).rejects.toMatchObject({ status: 409 });
  });

  it('rolls back existing project identity when the real audit insertion fails', async () => {
    const color = await colorAt('合成标准乙', 2);
    const project = await db.project.create({ data: { code: `existing-link-fault-${run}`, name: '合成关联故障', ownerUserId: actorB.id } });
    const failure = failAfterAudit('PROJECT_COLOR_LINKED');
    const links = new ProjectColorLinkService(failure.client);
    const input = { existingColorId: color.id, productionBaseId: color.productionBaseId, expectedColorRevision: color.registerRevision,
      expectedProjectUpdatedAt: project.updatedAt.toISOString(), idempotencyKey: randomUUID() };
    await expect(links.link(project.id, input, actorA)).rejects.toThrow('SYNTHETIC_FAILURE_AFTER_AUDIT_INSERT');
    expect(failure.reached()).toBe(1);
    expect(await db.project.findUniqueOrThrow({ where: { id: project.id } })).toEqual(project);
    expect(await db.auditLog.count({ where: { projectId: project.id } })).toBe(0);
    expect(await db.r26CommandRequest.count({ where: { projectId: project.id } })).toBe(0);
  });

});
