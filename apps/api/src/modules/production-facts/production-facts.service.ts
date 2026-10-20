import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { assertApprovedTeamMember } from '../../common/team-membership';
import { withTeamWrite } from '../../common/team-authorization';
import type { AuthenticatedUser } from '../auth/auth.types';
import { commandHash, identity, jsonData, pagination } from '../color-register/color-register.rules';
import { factGrain, grain, MAX_MODELS_PER_MONTH, MONTHLY_ACTUAL_SCOPE, MONTHLY_ACTUAL_SCOPE_LABEL, MONTHLY_MODEL_SCOPE, MONTHLY_MODEL_SCOPE_LABEL, parseBasisRead, parseBasisWrite, parseProductionBatch, productionFilters } from './production-facts.rules';
import { operationalProductionWhere, readProductionMonth } from './production-basis';
import { readProductionStatistics } from './production-statistics';

const SELECT = { id: true, colorId: true, productionBaseId: true, month: true, metricScope: true, vehicleModel: true, quantity: true, revision: true, sourceRowId: true, originalSource: true,
  color: { select: { name: true, code: true } }, productionBase: { select: { name: true } } } satisfies Prisma.ColorProductionFactSelect;
type Fact = Prisma.ColorProductionFactGetPayload<{ select: typeof SELECT }>;
function row(fact: Fact) {
  return { id: fact.id, colorId: fact.colorId, colorName: fact.color.name, colorCode: fact.color.code, baseId: fact.productionBaseId, baseName: fact.productionBase.name,
    month: fact.month, originalSource: fact.originalSource, quantity: fact.quantity === null ? null : fact.quantity.toString(), unit: '台', revision: fact.revision,
    metricScope: fact.metricScope, metricScopeLabel: fact.metricScope === MONTHLY_MODEL_SCOPE ? MONTHLY_MODEL_SCOPE_LABEL : MONTHLY_ACTUAL_SCOPE_LABEL,
    rowKind: fact.metricScope === MONTHLY_MODEL_SCOPE ? 'MODEL_DETAIL' : 'MONTH_TOTAL', vehicleModel: fact.vehicleModel,
    editable: fact.sourceRowId === null && [MONTHLY_ACTUAL_SCOPE, MONTHLY_MODEL_SCOPE].includes(fact.metricScope) };
}
const canonical = operationalProductionWhere;

@Injectable()
export class ProductionFactsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: Record<string, unknown>, actor: AuthenticatedUser) {
    assertApprovedTeamMember(actor);
    const { page, pageSize, skip } = pagination(query);
    const where = { ...productionFilters(query), ...canonical };
    const { items, total, sourceCount, snapshotHash } = await this.prisma.$transaction(async tx => {
      const [facts, total, sourceCount] = await Promise.all([
        tx.colorProductionFact.findMany({ where, select: SELECT, orderBy: [{ month: 'desc' }, { id: 'asc' }], take: pageSize, skip }),
        tx.colorProductionFact.count({ where }),
        tx.colorProductionFact.count({ where: { ...productionFilters(query), NOT: canonical } }),
      ]);
      const groups = new Map<string, Awaited<ReturnType<typeof readProductionMonth>>>();
      for (const fact of facts) {
        const input = { colorId: fact.colorId, baseId: fact.productionBaseId, month: fact.month };
        if (!groups.has(grain(input))) groups.set(grain(input), await readProductionMonth(tx, input));
      }
      const items = facts.map(fact => {
        const basis = groups.get(grain({ colorId: fact.colorId, baseId: fact.productionBaseId, month: fact.month }))!;
        const included = !basis.reconciliationRequired && (basis.mode === 'MONTH_TOTAL' ? fact.metricScope === MONTHLY_ACTUAL_SCOPE : fact.metricScope === MONTHLY_MODEL_SCOPE);
        return { ...row(fact), countingStatus: basis.reconciliationRequired ? '待核对：未选择唯一口径' : included ? '计入月度统计' : '保留对账，不计入统计',
          includedInOperationalTotal: included, effectiveQuantity: included ? fact.quantity?.toString() ?? null : null };
      });
      // Revisions are monotone for all sanctioned writes; the page reader rejects
      // a fact/basis change between pages instead of exporting two counting modes.
      const groupWhere = productionFilters(query, false);
      const [factEpoch, basisEpoch] = await Promise.all([
        tx.colorProductionFact.aggregate({ where: { ...groupWhere, ...canonical }, _count: { _all: true }, _sum: { revision: true } }),
        tx.colorProductionBasis.aggregate({ where: groupWhere, _count: { _all: true }, _sum: { revision: true } }),
      ]);
      const snapshotHash = commandHash({ factEpoch, basisEpoch });
      return { items, total, sourceCount, snapshotHash };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)), snapshotHash, scope: MONTHLY_ACTUAL_SCOPE_LABEL,
      reconciliationFactCount: sourceCount, reconciliationExcluded: true, unsupportedDimensions: ['日', '产线', '班次', '增量批次'] };
  }

  /** Raw historical scopes are deliberately separate; no inferred additive mapping. */
  async sources(query: Record<string, unknown>, actor: AuthenticatedUser) {
    assertApprovedTeamMember(actor);
    const { page, pageSize, skip } = pagination(query);
    const where = { ...productionFilters(query), NOT: canonical };
    const [items, total] = await Promise.all([
      this.prisma.colorProductionFact.findMany({ where, select: { ...SELECT, sourceCell: true, sourceRow: { select: { sheetName: true, rowNumber: true, batch: { select: { fileName: true } } } } }, orderBy: [{ month: 'desc' }, { id: 'asc' }], take: pageSize, skip }),
      this.prisma.colorProductionFact.count({ where }),
    ]);
    return { items: items.map(item => ({ ...row(item), metricScopeLabel: item.metricScope, editable: false, sourceCell: item.sourceCell, source: item.sourceRow, includedInOperationalTotal: false })), total, page, pageSize,
      scope: '原始来源对账：保留原 metricScope；不与本系统月度总量或项目完成批次数量相加。' };
  }

  async detail(id: string, actor: AuthenticatedUser) {
    assertApprovedTeamMember(actor); identity(id);
    const fact = await this.prisma.colorProductionFact.findFirst({ where: { id, ...canonical }, select: SELECT });
    if (!fact) throw new NotFoundException('可维护产量事实不存在；来源历史请在颜色详情查看。');
    return row(fact);
  }

  /** Database aggregation over all matches, never the current page or joins to photos/versions. */
  async statistics(query: Record<string, unknown>, actor: AuthenticatedUser) {
    assertApprovedTeamMember(actor);
    const result = await this.prisma.$transaction(tx => readProductionStatistics(tx, query), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    return { ...result, scope: '每个颜色／基地／月份只计所选口径；混合未选、空数量或未拆分车型均待核对', metricScope: MONTHLY_ACTUAL_SCOPE, unit: '台', reconciliationExcluded: true };
  }

  async basis(query: Record<string, unknown>, actor: AuthenticatedUser) {
    assertApprovedTeamMember(actor);
    const input = parseBasisRead(query);
    return this.prisma.$transaction(async tx => ({ ...input, ...await readProductionMonth(tx, input) }), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async selectBasis(raw: unknown, actor: AuthenticatedUser) {
    assertApprovedTeamMember(actor);
    const input = parseBasisWrite(raw);
    return withTeamWrite(this.prisma, actor, async tx => {
      const key = `production-basis:${actor.id}:${input.operationId}`;
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);
      const requestHash = commandHash(input);
      const replay = await tx.adminCommandRequest.findUnique({ where: { idempotencyKey: key } });
      if (replay) {
        if (replay.action !== 'PRODUCTION_BASIS_SELECTED' || replay.requestHash !== requestHash) throw new ConflictException('操作标识已使用且内容不同。');
        return replay.result;
      }
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext('production-fact-month'), hashtext(${grain(input)}))`);
      await tx.$queryRaw(Prisma.sql`SELECT id FROM colors WHERE id = ${input.colorId} FOR SHARE`);
      const before = await readProductionMonth(tx, input);
      if (before.revision !== input.expectedRevision || before.snapshotHash !== input.expectedSnapshot) throw new ConflictException({ code: 'PRODUCTION_BASIS_CHANGED', message: '产量或口径已变化，请重新读取完整月份后选择。' });
      if (before.invalid || (input.mode === 'MONTH_TOTAL' ? !before.totalFactId : !before.modelCount)) throw new BadRequestException('所选口径没有可用事实。');
      const value = await tx.colorProductionBasis.upsert({
        where: { colorId_productionBaseId_month: { colorId: input.colorId, productionBaseId: input.baseId, month: input.month } },
        create: { colorId: input.colorId, productionBaseId: input.baseId, month: input.month, mode: input.mode, snapshotHash: before.snapshotHash },
        update: { mode: input.mode, snapshotHash: before.snapshotHash, revision: { increment: 1 } },
      });
      await tx.auditLog.create({ data: { actorUserId: actor.id, targetType: 'COLOR', targetId: input.colorId, action: 'PRODUCTION_BASIS_SELECTED', summary: '明确月度唯一产量统计口径，保留全部原事实',
        beforeData: jsonData(before), afterData: jsonData({ baseId: input.baseId, month: input.month, mode: value.mode, revision: value.revision, snapshotHash: value.snapshotHash }) } });
      const result = { ...input, ...await readProductionMonth(tx, input) };
      await tx.adminCommandRequest.create({ data: { actorUserId: actor.id, idempotencyKey: key, action: 'PRODUCTION_BASIS_SELECTED', requestHash, result: jsonData(result) } });
      return result;
    });
  }

  async saveBatch(raw: unknown, actor: AuthenticatedUser) {
    assertApprovedTeamMember(actor);
    const input = parseProductionBatch(raw);
    return withTeamWrite(this.prisma, actor, async tx => {
      const key = `production-facts:${actor.id}:${input.operationId}`;
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);
      const requestHash = commandHash(input.items);
      const replay = await tx.adminCommandRequest.findUnique({ where: { idempotencyKey: key } });
      if (replay) {
        if (replay.action !== 'PRODUCTION_FACT_BATCH' || replay.requestHash !== requestHash) throw new ConflictException('操作标识已使用，且内容不同。');
        return replay.result;
      }
      // Resolve immutable identities before sorted grain locks. All writes use the same grain order.
      const updates = input.items.filter(item => item.kind === 'update');
      const currentRows = await tx.colorProductionFact.findMany({ where: { id: { in: updates.map(item => item.id) } }, select: SELECT });
      const before = new Map(currentRows.map(item => [item.id, item]));
      const resolved = input.items.map(item => {
        if (item.kind === 'create') return item;
        const current = before.get(item.id);
        if (!current) throw new NotFoundException('产量记录不存在。');
        if (current.sourceRowId !== null || ![MONTHLY_ACTUAL_SCOPE, MONTHLY_MODEL_SCOPE].includes(current.metricScope)) throw new BadRequestException('历史来源事实只读；请使用来源核对入口，不得覆盖原始资料。');
        return { colorId: current.colorId, baseId: current.productionBaseId, month: current.month, vehicleModel: current.vehicleModel };
      });
      const keys = resolved.map(factGrain);
      if (new Set(keys).size !== keys.length) throw new BadRequestException('同一批次不能多次修改同一月度业务键。');
      // Basis selection and every fact mutation serialize on the same full-month group.
      for (const key of [...new Set(resolved.map(grain))].sort()) await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext('production-fact-month'), hashtext(${key}))`);
      for (const key of [...keys].sort()) await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext('production-fact-grain'), hashtext(${key}))`);
      // Lock colors as well: a base reassignment must not slip between identity validation and creation.
      const colorIds = [...new Set(input.items.map(item => item.kind === 'create' ? item.colorId : before.get(item.id)!.colorId))].sort();
      for (const id of colorIds) await tx.$queryRaw(Prisma.sql`SELECT id FROM colors WHERE id = ${id} FOR SHARE`);
      const saved = [];
      for (const item of input.items) {
        if (item.kind === 'create') {
          const color = await tx.color.findUnique({ where: { id: item.colorId }, select: { productionBaseId: true } });
          if (!color || color.productionBaseId !== item.baseId) throw new BadRequestException({ code: 'PRODUCTION_FIELD_ERROR', clientId: item.clientId, field: 'colorId', message: '颜色不存在或不属于所选基地；须用颜色 ID 选择。' });
          const metricScope = item.rowKind === 'MODEL_DETAIL' ? MONTHLY_MODEL_SCOPE : MONTHLY_ACTUAL_SCOPE;
          const existing = await tx.colorProductionFact.findUnique({ where: { colorId_productionBaseId_month_metricScope_vehicleModel: { colorId: item.colorId, productionBaseId: item.baseId, month: item.month, metricScope, vehicleModel: item.vehicleModel } }, select: SELECT });
          if (existing) throw new ConflictException({ code: 'PRODUCTION_DUPLICATE_GRAIN', clientId: item.clientId, message: '该月份颜色总量已存在，请读取后修改原记录。', current: row(existing) });
          if (item.rowKind === 'MODEL_DETAIL' && await tx.colorProductionFact.count({ where: { colorId: item.colorId, productionBaseId: item.baseId, month: item.month, metricScope: MONTHLY_MODEL_SCOPE } }) >= MAX_MODELS_PER_MONTH) throw new BadRequestException('同一颜色／基地／月份最多维护100个车型，请先核对已有原文。');
          const fact = await tx.colorProductionFact.create({ data: { colorId: item.colorId, productionBaseId: item.baseId, month: item.month, metricScope, vehicleModel: item.vehicleModel, quantity: item.quantity, ...(item.source ? { originalSource: jsonData(item.source) } : {}) }, select: SELECT });
          await this.audit(tx, actor.id, fact, null);
          saved.push({ ...row(fact), clientId: item.clientId });
        } else {
          await tx.$queryRaw(Prisma.sql`SELECT id FROM color_production_facts WHERE id = ${item.id} FOR UPDATE`);
          const current = await tx.colorProductionFact.findUniqueOrThrow({ where: { id: item.id }, select: SELECT });
          if (current.revision !== item.expectedRevision) throw new ConflictException({ code: 'PRODUCTION_REVISION_CONFLICT', id: item.id, message: '产量已被修改，请核对最新值后重新提交。', current: row(current) });
          const unchanged = current.quantity === null ? item.quantity === null : item.quantity !== null && current.quantity.equals(item.quantity);
          const fact = unchanged ? current : await tx.colorProductionFact.update({ where: { id: item.id }, data: { quantity: item.quantity, revision: { increment: 1 } }, select: SELECT });
          if (!unchanged) await this.audit(tx, actor.id, fact, current);
          saved.push(row(fact));
        }
      }
      const groups = new Map<string, Awaited<ReturnType<typeof readProductionMonth>>>();
      for (const fact of saved) {
        const input = { colorId: fact.colorId, baseId: fact.baseId, month: fact.month };
        if (!groups.has(grain(input))) groups.set(grain(input), await readProductionMonth(tx, input));
      }
      const result = { items: saved.map(fact => {
        const basis = groups.get(grain(fact))!;
        const included = !basis.reconciliationRequired && (basis.mode === 'MONTH_TOTAL' ? fact.rowKind === 'MONTH_TOTAL' : fact.rowKind === 'MODEL_DETAIL');
        return { ...fact, includedInOperationalTotal: included, effectiveQuantity: included ? fact.quantity : null,
          countingStatus: basis.reconciliationRequired ? '待核对：未选择唯一口径' : included ? '计入月度统计' : '保留对账，不计入统计' };
      }), submittedCount: input.items.length };
      await tx.adminCommandRequest.create({ data: { actorUserId: actor.id, idempotencyKey: key, action: 'PRODUCTION_FACT_BATCH', requestHash, result: jsonData(result) } });
      return result;
    }, { timeout: 30000 });
  }

  private async audit(tx: Prisma.TransactionClient, actorId: string, fact: Fact, before: Fact | null) {
    await tx.auditLog.create({ data: { actorUserId: actorId, targetType: 'COLOR', targetId: fact.colorId,
      action: before ? 'COLOR_PRODUCTION_FACT_UPDATED' : 'COLOR_PRODUCTION_FACT_CREATED', summary: before ? '更正月度实际产量总量' : '记录月度实际产量总量',
      beforeData: jsonData(before ? { factId: before.id, quantity: before.quantity?.toString() ?? null, revision: before.revision } : {}),
      afterData: jsonData({ factId: fact.id, colorId: fact.colorId, baseId: fact.productionBaseId, month: fact.month, metricScope: fact.metricScope, vehicleModel: fact.vehicleModel, originalSource: fact.originalSource, quantity: fact.quantity?.toString() ?? null, revision: fact.revision }) } });
  }
}
