import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { assertApprovedTeamMember } from '../../common/team-membership';
import { withTeamWrite } from '../../common/team-authorization';
import type { AuthenticatedUser } from '../auth/auth.types';
import { commandHash, identity, jsonData, pagination } from '../color-register/color-register.rules';
import { grain, MONTHLY_ACTUAL_SCOPE, MONTHLY_ACTUAL_SCOPE_LABEL, parseProductionBatch, productionFilters } from './production-facts.rules';

const SELECT = { id: true, colorId: true, productionBaseId: true, month: true, metricScope: true, quantity: true, revision: true, sourceRowId: true, originalSource: true,
  color: { select: { name: true, code: true } }, productionBase: { select: { name: true } } } satisfies Prisma.ColorProductionFactSelect;
type Fact = Prisma.ColorProductionFactGetPayload<{ select: typeof SELECT }>;
function row(fact: Fact) {
  return { id: fact.id, colorId: fact.colorId, colorName: fact.color.name, colorCode: fact.color.code, baseId: fact.productionBaseId, baseName: fact.productionBase.name,
    month: fact.month, originalSource: fact.originalSource, quantity: fact.quantity === null ? null : fact.quantity.toString(), unit: '台', revision: fact.revision,
    metricScope: fact.metricScope, metricScopeLabel: MONTHLY_ACTUAL_SCOPE_LABEL, rowKind: 'MONTH_TOTAL',
    editable: fact.sourceRowId === null && fact.metricScope === MONTHLY_ACTUAL_SCOPE };
}
const canonical = { metricScope: MONTHLY_ACTUAL_SCOPE, sourceRowId: null } satisfies Prisma.ColorProductionFactWhereInput;

@Injectable()
export class ProductionFactsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: Record<string, unknown>, actor: AuthenticatedUser) {
    assertApprovedTeamMember(actor);
    const { page, pageSize, skip } = pagination(query);
    const where = { ...productionFilters(query), ...canonical };
    const [items, total, sourceCount] = await Promise.all([
      this.prisma.colorProductionFact.findMany({ where, select: SELECT, orderBy: [{ month: 'desc' }, { id: 'asc' }], take: pageSize, skip }),
      this.prisma.colorProductionFact.count({ where }),
      this.prisma.colorProductionFact.count({ where: { ...productionFilters(query), NOT: canonical } }),
    ]);
    return { items: items.map(row), total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)), scope: MONTHLY_ACTUAL_SCOPE_LABEL,
      reconciliationFactCount: sourceCount, reconciliationExcluded: true, unsupportedDimensions: ['日', '车型细分', '产线', '班次', '增量批次'] };
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
    const where = { ...productionFilters(query), ...canonical };
    const { totals, byBase } = await this.prisma.$transaction(async tx => {
      const totals = await tx.colorProductionFact.aggregate({ where, _count: { _all: true, quantity: true }, _sum: { quantity: true } });
      const byBase = await tx.colorProductionFact.groupBy({ by: ['productionBaseId'], where, _sum: { quantity: true }, _count: { _all: true, quantity: true }, orderBy: { productionBaseId: 'asc' }, take: 201 });
      return { totals, byBase };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    const unknown = totals._count._all - totals._count.quantity;
    return { scope: MONTHLY_ACTUAL_SCOPE_LABEL, metricScope: MONTHLY_ACTUAL_SCOPE, unit: '台', factCount: totals._count._all, unknownCount: unknown,
      knownQuantity: totals._sum.quantity?.toString() ?? '0', quantity: unknown ? null : totals._sum.quantity?.toString() ?? '0',
      byBase: byBase.slice(0, 200).map(item => ({ baseId: item.productionBaseId, factCount: item._count._all,
        unknownCount: item._count._all - item._count.quantity, knownQuantity: item._sum.quantity?.toString() ?? '0',
        quantity: item._count._all === item._count.quantity ? item._sum.quantity?.toString() ?? '0' : null })),
      byBaseHasMore: byBase.length > 200, reconciliationExcluded: true };
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
      const keys = input.items.map(item => {
        if (item.kind === 'create') return grain(item);
        const current = before.get(item.id);
        if (!current) throw new NotFoundException('产量记录不存在。');
        if (current.sourceRowId !== null || current.metricScope !== MONTHLY_ACTUAL_SCOPE) throw new BadRequestException('历史来源事实只读；请使用来源核对入口，不得覆盖原始资料。');
        return grain({ colorId: current.colorId, baseId: current.productionBaseId, month: current.month });
      });
      if (new Set(keys).size !== keys.length) throw new BadRequestException('同一批次不能多次修改同一月度业务键。');
      for (const key of [...keys].sort()) await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext('production-fact-grain'), hashtext(${key}))`);
      // Lock colors as well: a base reassignment must not slip between identity validation and creation.
      const colorIds = [...new Set(input.items.map(item => item.kind === 'create' ? item.colorId : before.get(item.id)!.colorId))].sort();
      for (const id of colorIds) await tx.$queryRaw(Prisma.sql`SELECT id FROM colors WHERE id = ${id} FOR SHARE`);
      const saved = [];
      for (const item of input.items) {
        if (item.kind === 'create') {
          const color = await tx.color.findUnique({ where: { id: item.colorId }, select: { productionBaseId: true } });
          if (!color || color.productionBaseId !== item.baseId) throw new BadRequestException({ code: 'PRODUCTION_FIELD_ERROR', clientId: item.clientId, field: 'colorId', message: '颜色不存在或不属于所选基地；须用颜色 ID 选择。' });
          const existing = await tx.colorProductionFact.findUnique({ where: { colorId_productionBaseId_month_metricScope: { colorId: item.colorId, productionBaseId: item.baseId, month: item.month, metricScope: MONTHLY_ACTUAL_SCOPE } }, select: SELECT });
          if (existing) throw new ConflictException({ code: 'PRODUCTION_DUPLICATE_GRAIN', clientId: item.clientId, message: '该月份颜色总量已存在，请读取后修改原记录。', current: row(existing) });
          const fact = await tx.colorProductionFact.create({ data: { colorId: item.colorId, productionBaseId: item.baseId, month: item.month, metricScope: MONTHLY_ACTUAL_SCOPE, quantity: item.quantity, ...(item.source ? { originalSource: jsonData(item.source) } : {}) }, select: SELECT });
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
      const result = { items: saved, submittedCount: input.items.length };
      await tx.adminCommandRequest.create({ data: { actorUserId: actor.id, idempotencyKey: key, action: 'PRODUCTION_FACT_BATCH', requestHash, result: jsonData(result) } });
      return result;
    }, { timeout: 30000 });
  }

  private async audit(tx: Prisma.TransactionClient, actorId: string, fact: Fact, before: Fact | null) {
    await tx.auditLog.create({ data: { actorUserId: actorId, targetType: 'COLOR', targetId: fact.colorId,
      action: before ? 'COLOR_PRODUCTION_FACT_UPDATED' : 'COLOR_PRODUCTION_FACT_CREATED', summary: before ? '更正月度实际产量总量' : '记录月度实际产量总量',
      beforeData: jsonData(before ? { factId: before.id, quantity: before.quantity?.toString() ?? null, revision: before.revision } : {}),
      afterData: jsonData({ factId: fact.id, colorId: fact.colorId, baseId: fact.productionBaseId, month: fact.month, metricScope: fact.metricScope, originalSource: fact.originalSource, quantity: fact.quantity?.toString() ?? null, revision: fact.revision }) } });
  }
}
