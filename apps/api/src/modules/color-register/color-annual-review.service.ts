import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { assertApprovedTeamMember } from '../../common/team-membership';
import { withTeamWrite } from '../../common/team-authorization';
import { lockRegisterColor } from '../../common/color-standard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { MONTHLY_ACTUAL_SCOPE, MONTHLY_ACTUAL_SCOPE_LABEL, onlyFields } from '../production-facts/production-facts.rules';
import { operationalProductionWhere, PRODUCTION_SNAPSHOT_SELECT, resolveProductionMonth } from '../production-facts/production-basis';
import { MAX_MODELS_PER_MONTH } from '../production-facts/production-facts.rules';
import { commandHash, identity, jsonData, object, positiveInt, textField } from './color-register.rules';
import { ANNUAL_REVIEW_ACTION, ANNUAL_REVIEW_POLICY, annualReviewDecision, businessMonth, firstAnnualReviewWindow } from './color-annual-review.rules';

type Color = { id: string; name: string; productionBaseId: string | null; registerMonth: string | null; registerRevision: number; registerStatus: string; exitFlag: boolean; projectId: string | null };
type Db = Prisma.TransactionClient | PrismaService;

@Injectable()
export class ColorAnnualReviewService {
  constructor(private readonly prisma: PrismaService) {}

  async read(id: string, actor: AuthenticatedUser) {
    assertApprovedTeamMember(actor); identity(id);
    return this.prisma.$transaction(async tx => {
      const color = await tx.color.findUnique({ where: { id }, select: { id: true, name: true, productionBaseId: true, registerMonth: true, registerRevision: true, registerStatus: true, exitFlag: true, projectId: true } });
      if (!color) throw new NotFoundException('颜色记录不存在。');
      const [snapshot, history, projects] = await Promise.all([
        readColorAnnualSnapshot(tx, color),
        tx.auditLog.findMany({ where: { targetType: 'COLOR', targetId: id, action: ANNUAL_REVIEW_ACTION }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 21,
          select: { id: true, createdAt: true, actorUser: { select: { name: true } }, afterData: true } }),
        tx.project.findMany({ where: { primaryColorId: id }, orderBy: { id: 'asc' }, take: 51, select: { id: true, name: true } }),
      ]);
      return { ...snapshot, history: history.slice(0, 20).map(item => ({ id: item.id, createdAt: item.createdAt.toISOString(), actorName: item.actorUser?.name ?? null, snapshot: item.afterData })),
        historyHasMore: history.length > 20, projects: projects.slice(0, 50), projectsHasMore: projects.length > 50 };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async record(id: string, raw: unknown, actor: AuthenticatedUser) {
    assertApprovedTeamMember(actor); identity(id);
    const body = object(raw);
    onlyFields(body, ['operationId', 'expectedRevision', 'expectedSnapshot', 'note']);
    const input = { colorId: id, operationId: identity(body.operationId, '操作标识'), expectedRevision: positiveInt(body.expectedRevision, '颜色版本'),
      expectedSnapshot: textField(body.expectedSnapshot, '统计快照', 64), note: textField(body.note, '复核说明', 1000)?.trim() ?? null };
    if (!input.expectedSnapshot || !/^[a-f0-9]{64}$/.test(input.expectedSnapshot)) throw new BadRequestException('统计快照标识不正确。');
    if (!input.note) throw new BadRequestException('请填写复核说明。');
    return withTeamWrite(this.prisma, actor, async tx => {
      const key = `color-annual-review:${actor.id}:${input.operationId}`;
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);
      const hash = commandHash(input);
      const replay = await tx.adminCommandRequest.findUnique({ where: { idempotencyKey: key } });
      if (replay) {
        if (replay.action !== ANNUAL_REVIEW_ACTION || replay.requestHash !== hash) throw new ConflictException('操作标识已使用且内容不同。');
        return replay.result;
      }
      // Production writes take FOR SHARE on this same color before changing facts.
      // FOR UPDATE therefore holds the complete 13-month snapshot stable until audit commits.
      const color = await lockRegisterColor(tx, id);
      const snapshot = await readColorAnnualSnapshot(tx, color);
      if (color.registerRevision !== input.expectedRevision || snapshot.snapshotHash !== input.expectedSnapshot) throw new ConflictException({ code: 'ANNUAL_REVIEW_CHANGED', message: '颜色或月度产量已变化，请重新读取并核对后保存。' });
      if (!snapshot.canRecord) throw new BadRequestException(snapshot.issue ?? '当前不能保存年度复核。');
      const record = await tx.auditLog.create({ data: { projectId: color.projectId, actorUserId: actor.id, targetType: 'COLOR', targetId: id,
        action: ANNUAL_REVIEW_ACTION, summary: snapshot.decision === 'RETAIN' ? '首次年度复核：继续保留' : '首次年度复核：低于20台，须经原退出评审',
        afterData: jsonData({ ...snapshot, note: input.note, decisionScope: '仅记录复核事实，不执行退出、不覆盖历史' }) }, select: { id: true, createdAt: true } });
      await tx.color.update({ where: { id }, data: { registerRevision: { increment: 1 } } });
      const result = { id: record.id, colorId: id, revision: color.registerRevision + 1, decision: snapshot.decision, createdAt: record.createdAt.toISOString() };
      await tx.adminCommandRequest.create({ data: { actorUserId: actor.id, idempotencyKey: key, action: ANNUAL_REVIEW_ACTION, requestHash: hash, result } });
      return result;
    });
  }

}

export async function readColorAnnualSnapshot(db: Db, color: Color) {
    const window = firstAnnualReviewWindow(color.registerMonth);
    const [facts, bases] = window && color.productionBaseId ? await Promise.all([
      db.colorProductionFact.findMany({
        where: { colorId: color.id, productionBaseId: color.productionBaseId, ...operationalProductionWhere, month: { gte: window.fromMonth, lte: window.toMonth } },
        orderBy: [{ month: 'asc' }, { id: 'asc' }], take: 13 * (MAX_MODELS_PER_MONTH + 1) + 1, select: PRODUCTION_SNAPSHOT_SELECT,
      }),
      db.colorProductionBasis.findMany({ where: { colorId: color.id, productionBaseId: color.productionBaseId, month: { gte: window.fromMonth, lte: window.toMonth } },
        take: 14, orderBy: { month: 'asc' }, select: { month: true, mode: true, revision: true, snapshotHash: true } }),
    ]) : [[], []];
    const resolved = window?.months.map(month => resolveProductionMonth(month, facts.filter(fact => fact.month === month), bases.find(value => value.month === month) ?? null)) ?? [];
    const months = resolved.map(value => {
      const total = facts.find(fact => fact.month === value.month && fact.metricScope === MONTHLY_ACTUAL_SCOPE);
      // Existing total-only annual evidence retains its exact public snapshot shape.
      if (!value.modelCount) return { month: value.month, factId: total?.id ?? null, revision: total?.revision ?? null, quantity: value.quantity };
      return { month: value.month, factId: value.hasFacts ? (value.totalFactId ?? value.facts[0]!.id) : null,
        revision: value.revision, quantity: value.quantity, mode: value.mode,
        factsSnapshot: value.snapshotHash, reconciliationRequired: value.reconciliationRequired };
    });
    const missingMonths = resolved.filter(value => !value.hasFacts).map(value => value.month);
    const unknownMonths = resolved.filter(value => value.hasFacts && value.quantity === null).map(value => value.month);
    const invalid = facts.length > 13 * (MAX_MODELS_PER_MONTH + 1) || bases.length > 13 || resolved.some(value => value.invalid);
    const complete = Boolean(window && color.productionBaseId && !missingMonths.length && !unknownMonths.length && !invalid);
    const quantity = complete ? months.reduce((sum, value) => sum + BigInt(value.quantity!), 0n).toString() : null;
    const decision = annualReviewDecision(quantity);
    const issue = !window ? '请先核对并保存入清单月份。' : !color.productionBaseId ? '请先明确生产基地。'
      : color.registerStatus !== 'LISTED' ? '仅已入清单的颜色可进行首次年度复核。' : color.exitFlag ? '该颜色已有退出事实，请在原记录核对，不重写历史。'
        : invalid ? '月度产量不符合整数总量口径，请核对原事实。' : !complete ? '13个月份须逐月有明确统计口径与数量；混合未选择、缺月和空数量不能当作0。'
          : businessMonth() < window.reviewMonth ? `尚未到复核月份 ${window.reviewMonth}。` : null;
    const stable = { policy: ANNUAL_REVIEW_POLICY, colorId: color.id, baseId: color.productionBaseId, revision: color.registerRevision,
      registerMonth: color.registerMonth, window, metricScope: MONTHLY_ACTUAL_SCOPE, months, quantity, decision };
    return { ...stable, colorName: color.name, scopeLabel: MONTHLY_ACTUAL_SCOPE_LABEL, threshold: 20, missingMonths, unknownMonths,
      canRecord: issue === null, issue, snapshotHash: commandHash(stable) };
  }
