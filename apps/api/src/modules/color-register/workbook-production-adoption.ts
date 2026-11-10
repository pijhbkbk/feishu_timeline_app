import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../infra/prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { withTeamWrite } from '../../common/team-authorization';
import { commandHash, jsonData, object, textField } from './color-register.rules';
import { actualQuantity, grain, MONTHLY_ACTUAL_SCOPE, productionMonth } from '../production-facts/production-facts.rules';
import { readProductionMonth } from '../production-facts/production-basis';

type Input = { sha256: string; fromMonth: string; toMonth: string; expectedPlanHash?: string };
type Source = { id: string; sheetName: string; rowNumber: number; colorId: string | null; normalization: Prisma.JsonValue | null };
type PlannedRow = { source: Source; name: string; baseId: string; colorId: string | null; months: { month: string; cell: string; quantity: number | null }[] };

/** Operator-only adoption of already scanned, preserved source rows. A plan never writes.
 * Raw source and historical scopes remain immutable. Operational facts are separate,
 * uniquely keyed records, and an existing different value stops the entire adoption.
 */
export async function adoptWorkbookProduction(prisma: PrismaService, actor: AuthenticatedUser, input: Input) {
  if (!/^[a-f0-9]{64}$/.test(input.sha256)) throw new BadRequestException('来源摘要不正确。');
  const from = productionMonth(input.fromMonth), to = productionMonth(input.toMonth);
  if (from > to || from.slice(0, 4) !== to.slice(0, 4)) throw new BadRequestException('每次按同一年度明确月份范围。');
  if (input.expectedPlanHash && !/^[a-f0-9]{64}$/.test(input.expectedPlanHash)) throw new BadRequestException('导入计划摘要不正确。');
  return withTeamWrite(prisma, actor, async tx => {
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext('color-workbook-import'), hashtext(${input.sha256}))`);
    const batch = await tx.colorImportBatch.findUnique({ where: { sha256: input.sha256 } });
    if (!batch) throw new BadRequestException('须先通过原来源扫描及保全导入。');
    const key = `workbook-production:${batch.id}:${from}:${to}`;
    const receipt = await tx.adminCommandRequest.findUnique({ where: { idempotencyKey: key } });
    if (receipt) {
      if (receipt.action !== 'WORKBOOK_PRODUCTION_ADOPTED') throw new ConflictException('来源操作身份冲突。');
      if (input.expectedPlanHash && receipt.requestHash !== input.expectedPlanHash) throw new ConflictException('该范围已有另一计划的回执，请核对原结果。');
      return { status: 'ALREADY_APPLIED' as const, result: receipt.result };
    }
    const sources = await tx.colorImportRow.findMany({ where: { batchId: batch.id }, orderBy: [{ sheetName: 'asc' }, { rowNumber: 'asc' }], take: 10001 });
    if (sources.length > 10000 || sources.length !== batch.rowCount) throw new ConflictException('来源保全行数不一致。');
    const candidates = new Map<string, { colorId: string; baseCode: string; name: string }>();
    const baseNames = new Map<string, string>();
    for (const source of sources) {
      const normalized = object(source.normalization ?? {}); const candidate = normalized.candidate;
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
      const c = object(candidate);
      if (typeof c.baseCode !== 'string' || typeof c.productionBase !== 'string') continue;
      if (baseNames.has(c.baseCode) && baseNames.get(c.baseCode) !== c.productionBase) throw new ConflictException('来源基地标识存在冲突。');
      baseNames.set(c.baseCode, c.productionBase);
      if (source.colorId && typeof c.id === 'string' && typeof c.colorName === 'string') {
        const previous = candidates.get(c.id);
        if (previous && previous.colorId !== source.colorId) throw new ConflictException('同一来源标准关联多个颜色。');
        candidates.set(c.id, { colorId: source.colorId, baseCode: c.baseCode, name: c.colorName });
      }
    }
    const planned: PlannedRow[] = []; const logicalRows = new Set<string>();
    for (const source of sources) {
      const c = object(object(source.normalization ?? {}).candidate ?? {});
      if (c.year !== Number(from.slice(0, 4)) || !Array.isArray(c.months)) continue;
      const name = textField(c.colorNameRaw, '产量来源颜色名称', 200, true)!;
      const baseCode = textField(c.baseCodeCandidate, '来源基地', 64, true)!;
      const base = await tx.productionBase.findUnique({ where: { code: baseCode } });
      if (!base || base.name !== baseNames.get(baseCode)) throw new ConflictException('来源基地与业务目录不一致。');
      const logical = JSON.stringify([base.id, name]);
      if (logicalRows.has(logical)) throw new ConflictException('同基地同年度有重复产量行，须先核对，不能相加。');
      logicalRows.add(logical);
      if (!Array.isArray(c.exactLiteralNameBaseCandidates) || c.exactLiteralNameBaseCandidates.length > 1) throw new ConflictException('来源颜色存在多个候选，不能自动合并。');
      const candidate = candidates.get(String(c.exactLiteralNameBaseCandidates[0] ?? ''));
      if (c.exactLiteralNameBaseCandidates.length && (!candidate || candidate.baseCode !== baseCode || candidate.name !== name)) throw new ConflictException('来源标准匹配发生变化。');
      const colorId = source.colorId ?? candidate?.colorId ?? null;
      if (source.colorId && candidate && source.colorId !== candidate.colorId) throw new ConflictException('来源行已关联不同颜色。');
      if (colorId) {
        const color = await tx.color.findUnique({ where: { id: colorId }, select: { name: true, productionBaseId: true } });
        if (!color || color.name !== name || color.productionBaseId !== base.id) throw new ConflictException('已有颜色名称或基地已更正，请先核对。');
      } else if (await tx.color.count({ where: { productionBaseId: base.id, name } })) {
        throw new ConflictException('同基地已有同名非来源颜色，请明确身份映射后再导入。');
      }
      const months: PlannedRow['months'] = [];
      for (const raw of c.months) {
        const value = object(raw); const m = value.monthPosition;
        if (!Number.isInteger(m) || Number(m) < 1 || Number(m) > 12) throw new BadRequestException('来源月份不正确。');
        const month = `${c.year}-${String(m).padStart(2, '0')}`;
        if (month < from || month > to) continue;
        if (object(value.sourceHeader).effectiveValue !== `${m}月` || value.formula) throw new ConflictException('月值含公式或月份标题不一致，不能推算。');
        const quantity = actualQuantity(value.effectiveValue);
        const cell = textField(value.cell, '来源单元格', 32, true)!;
        if (!/^[A-Z]{1,3}[1-9][0-9]{0,5}$/.test(cell)) throw new BadRequestException('来源坐标不正确。');
        months.push({ month, cell, quantity });
      }
      const count = Number(to.slice(5)) - Number(from.slice(5)) + 1;
      if (months.length !== count || new Set(months.map(m => m.month)).size !== count) throw new ConflictException('来源月份不完整。');
      planned.push({ source, name, baseId: base.id, colorId, months });
    }
    if (!planned.length || planned.length > 500) throw new BadRequestException('没有可采用的产量行，或超出500行。');
    const locks = planned.flatMap(r => r.colorId ? r.months.map(m => grain({ colorId: r.colorId!, baseId: r.baseId, month: m.month })) : []).sort();
    for (const lock of locks) await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext('production-fact-month'), hashtext(${lock}))`);
    for (const id of [...new Set(planned.map(r => r.colorId).filter((v): v is string => !!v))].sort()) await tx.$queryRaw(Prisma.sql`SELECT id FROM colors WHERE id = ${id} FOR SHARE`);
    const conflicts: { sourceRowId: string; month: string; reason: string }[] = [];
    const existing = new Map<string, { id: string; revision: number; quantity: string | null }>();
    for (const r of planned) if (r.colorId) {
      const color = await tx.color.findUniqueOrThrow({ where: { id: r.colorId } });
      if (color.name !== r.name || color.productionBaseId !== r.baseId) throw new ConflictException('颜色身份在核对期间变化。');
      for (const m of r.months) {
        const current = await readProductionMonth(tx, { colorId: r.colorId, baseId: r.baseId, month: m.month });
        if (current.hasFacts && (current.invalid || current.reconciliationRequired || current.mode !== 'MONTH_TOTAL' || current.quantity !== (m.quantity === null ? null : String(m.quantity)))) conflicts.push({ sourceRowId: r.source.id, month: m.month, reason: '已有业务数值或统计依据不同' });
        const fact = current.facts.find(f => f.id === current.totalFactId);
        if (fact) existing.set(`${r.source.id}:${m.month}`, { id: fact.id, revision: fact.revision, quantity: fact.quantity });
      }
    }
    const plan = { batchId: batch.id, sha256: batch.sha256, fromMonth: from, toMonth: to,
      rows: planned.map(r => ({ sourceRowId: r.source.id, sheet: r.source.sheetName, row: r.source.rowNumber, name: r.name, baseId: r.baseId, colorId: r.colorId, months: r.months.map(m => ({ ...m, existing: existing.get(`${r.source.id}:${m.month}`) ?? null })) })), conflicts };
    const planHash = commandHash(plan);
    if (!input.expectedPlanHash) return { status: 'PLAN_ONLY' as const, planHash, plan };
    if (input.expectedPlanHash !== planHash || conflicts.length) throw new ConflictException('导入计划已变化或与已有业务记录冲突，未写入。');
    const facts: { id: string; revision: number; sourceRowId: string; month: string; quantity: string | null }[] = [];
    let newColors = 0;
    for (const r of planned) {
      let colorId = r.colorId;
      if (!colorId) {
        const color = await tx.color.create({ data: { name: r.name, productionBaseId: r.baseId, registerStatus: 'PENDING_REVIEW', status: 'DRAFT' } });
        colorId = color.id; newColors++;
        await tx.auditLog.create({ data: { actorUserId: actor.id, targetType: 'COLOR', targetId: color.id, action: 'COLOR_SOURCE_PRODUCTION_IDENTITY_CREATED', summary: '按原产量名称和基地保留独立身份，不推断标准或开发流程', afterData: { sourceRowId: r.source.id, sourceSha256: batch.sha256 } } });
      }
      if (!r.source.colorId) await tx.colorImportRow.update({ where: { id: r.source.id }, data: { colorId, status: 'MAPPED' } });
      for (const m of r.months) {
        const prior = existing.get(`${r.source.id}:${m.month}`);
        if (prior) { facts.push({ ...prior, sourceRowId: r.source.id, month: m.month }); continue; }
        const provenance = { fileName: batch.fileName, fileHash: batch.sha256, sheetName: r.source.sheetName, rowNumbers: [r.source.rowNumber], sourceRowId: r.source.id, sourceCell: m.cell, adoptedPlanHash: planHash };
        const fact = await tx.colorProductionFact.create({ data: { colorId, productionBaseId: r.baseId, month: m.month, metricScope: MONTHLY_ACTUAL_SCOPE, quantity: m.quantity, originalSource: provenance } });
        await tx.auditLog.create({ data: { actorUserId: actor.id, targetType: 'COLOR', targetId: colorId, action: 'COLOR_PRODUCTION_FACT_CREATED', summary: '采用明确月份的原件月产量，原始来源单独保留且不重复计数', afterData: jsonData({ factId: fact.id, revision: fact.revision, quantity: fact.quantity?.toString() ?? null, originalSource: provenance }) } });
        facts.push({ id: fact.id, revision: fact.revision, sourceRowId: r.source.id, month: m.month, quantity: fact.quantity?.toString() ?? null });
      }
    }
    const result = { batchId: batch.id, planHash, sourceSha256: batch.sha256, fromMonth: from, toMonth: to, rowCount: planned.length, newColors, facts };
    await tx.adminCommandRequest.create({ data: { actorUserId: actor.id, idempotencyKey: key, action: 'WORKBOOK_PRODUCTION_ADOPTED', requestHash: planHash, result: jsonData(result) } });
    return { status: 'APPLIED' as const, result };
  }, { timeout: 120000, maxWait: 10000 });
}
