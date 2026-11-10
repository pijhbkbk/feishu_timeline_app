import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { assertApprovedTeamMember } from '../../common/team-membership';
import { lockProjectWrite, withTeamWrite } from '../../common/team-authorization';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ProjectAccessService } from '../auth/project-access.service';
import { commandHash, identity, jsonData, pagination } from '../color-register/color-register.rules';
import { assertInspectionReviewLink, lockInspectionActivity } from './inspection-review-link';
import { parseVisualBatch, visualDate } from './visual-ledger.rules';

const include = { object: true, color: { select: { id: true, name: true } }, activity: { include: { reviewRecord: { select: { submittedAt: true } } } } } satisfies Prisma.InspectionOccurrenceInclude;
type Row = Prisma.InspectionOccurrenceGetPayload<{ include: typeof include }>;
function row(r: Row) {
  return { id: r.id, activityId: r.activityId, objectId: r.objectId, revision: r.revision, activityRevision: r.activity.revision, objectRevision: r.object.revision,
    baseId: r.activity.productionBaseId, date: r.activity.activityDate.toISOString().slice(0, 10), colorId: r.colorId, colorName: r.color.name,
    objectCode: r.object.objectCode, vehicleModel: r.object.vehicleModel, productionDate: r.object.productionDate?.toISOString().slice(0, 10) ?? null,
    scores: r.visualScores, conclusion: r.visualConclusion, action: r.handlingOpinion, rectify: r.manualRectification,
    deadline: r.rectificationDueDate?.toISOString().slice(0, 10) ?? null, paintUnit: r.paintUnit, responsibleUnit: r.responsibleUnit, rectificationUnit: r.rectificationUnit,
    originalSource: r.originalSource, overallConclusion: r.overallConclusion, editable: !r.activity.reviewRecord?.submittedAt, updatedAt: r.updatedAt.toISOString() };
}
@Injectable()
export class VisualLedgerService {
  constructor(private readonly prisma: PrismaService, private readonly access: ProjectAccessService) {}

  async list(query: Record<string, unknown>, actor: AuthenticatedUser) {
    assertApprovedTeamMember(actor);
    const { page, pageSize, skip } = pagination(query);
    const where: Prisma.InspectionOccurrenceWhereInput = { object: { objectKind: 'VEHICLE' }, activity: {
      productionBaseId: identity(query.baseId), ...(query.fromDate || query.toDate ? { activityDate: { ...(query.fromDate ? { gte: visualDate(query.fromDate, true)! } : {}), ...(query.toDate ? { lte: visualDate(query.toDate, true)! } : {}) } } : {}),
    } };
    return this.prisma.$transaction(async tx => {
      const items = await tx.inspectionOccurrence.findMany({ where, include, orderBy: [{ activity: { activityDate: 'desc' } }, { id: 'asc' }], take: pageSize, skip });
      for (const projectId of new Set(items.flatMap(r => r.activity.projectId ? [r.activity.projectId] : []))) await this.access.assertProjectAccess(tx, projectId, actor, 'project.read');
      return { items: items.map(row), total: await tx.inspectionOccurrence.count({ where }), page, pageSize };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  async history(id: string, actor: AuthenticatedUser) {
    assertApprovedTeamMember(actor); identity(id);
    const record = await this.prisma.inspectionOccurrence.findUnique({ where: { id }, include });
    if (!record) throw new NotFoundException('台次不存在。');
    if (record.activity.projectId) await this.access.assertProjectAccess(this.prisma, record.activity.projectId, actor, 'project.read');
    return this.prisma.auditLog.findMany({ where: { targetType: 'SYSTEM', targetId: id, action: { in: ['VISUAL_LEDGER_CREATED', 'VISUAL_LEDGER_UPDATED'] } }, select: { id: true, action: true, createdAt: true, actorUserId: true, beforeData: true, afterData: true }, orderBy: { createdAt: 'desc' }, take: 50 });
  }
  async detail(id: string, actor: AuthenticatedUser) {
    assertApprovedTeamMember(actor); identity(id);
    const record = await this.prisma.inspectionOccurrence.findUnique({ where: { id }, include });
    if (!record) throw new NotFoundException('台次不存在。');
    if (record.activity.projectId) await this.access.assertProjectAccess(this.prisma, record.activity.projectId, actor, 'project.read');
    return row(record);
  }
  async save(raw: unknown, actor: AuthenticatedUser) {
    assertApprovedTeamMember(actor); const input = parseVisualBatch(raw);
    return withTeamWrite(this.prisma, actor, async tx => {
      // Project fence precedes command/activity/object locks, including linked review writes.
      const ids = input.items.flatMap(i => i.id ? [i.id] : []);
      const initial = await tx.inspectionOccurrence.findMany({ where: { id: { in: ids } }, include });
      if (initial.length !== ids.length) throw new NotFoundException('台次不存在。');
      for (const projectId of [...new Set(initial.flatMap(r => r.activity.projectId ? [r.activity.projectId] : []))].sort()) {
        await lockProjectWrite(tx, projectId); await this.access.assertProjectAccess(tx, projectId, actor, 'project.write');
      }
      const key = `visual-ledger:${actor.id}:${input.operationId}`;
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);
      const hash = commandHash(input); const prior = await tx.adminCommandRequest.findUnique({ where: { idempotencyKey: key } });
      if (prior) { if (prior.action !== 'VISUAL_LEDGER_BATCH' || prior.requestHash !== hash) throw new ConflictException('操作标识已使用且内容不同。'); return prior.result; }
      const activityVersions = new Map<string, number>();
      for (const id of [...new Set(initial.map(r => r.activityId))].sort()) activityVersions.set(id, (await lockInspectionActivity(tx, id)).revision);
      // Match the existing object-creation lock. Immutable object identity is never replaced by a name.
      for (const code of [...new Set(input.items.map(i => i.objectCode))].sort()) await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext('inspection-object'),hashtext(${code}))`);
      const existingObjects = await tx.inspectionObject.findMany({ where: { objectCode: { in: input.items.map(i => i.objectCode) } }, select: { id: true } });
      const objectIds = [...new Set([...initial.map(r => r.objectId), ...existingObjects.map(r => r.id)])].sort();
      if (objectIds.length) await tx.$queryRaw(Prisma.sql`SELECT id FROM inspection_objects WHERE id IN (${Prisma.join(objectIds)}) ORDER BY id FOR UPDATE`);
      const objectVersions = new Map((await tx.inspectionObject.findMany({ where: { id: { in: objectIds } }, select: { id: true, revision: true } })).map(r => [r.id, r.revision]));
      const objectInputs = new Map<string, string>();
      for (const item of input.items) {
        const key = item.id ? initial.find(r => r.id === item.id)!.objectId : item.objectCode;
        const signature = commandHash({ objectCode: item.objectCode, vehicleModel: item.vehicleModel, productionDate: item.productionDate });
        if (objectInputs.has(key) && objectInputs.get(key) !== signature) throw new BadRequestException('同一车辆在本批次的基础资料不一致。');
        objectInputs.set(key, signature);
      }
      for (const colorId of [...new Set(input.items.map(i => i.colorId))].sort()) await tx.$queryRaw(Prisma.sql`SELECT id FROM colors WHERE id=${colorId} FOR SHARE`);
      const result = []; const updatedActivities = new Set<string>();
      for (const item of input.items) {
        const color = await tx.color.findUnique({ where: { id: item.colorId }, select: { productionBaseId: true } });
        if (!color || color.productionBaseId !== item.baseId) throw new BadRequestException('颜色不属于所选基地。');
        const values = { visualScores: item.scores === null ? Prisma.DbNull : jsonData(item.scores), visualConclusion: item.conclusion, handlingOpinion: item.action, manualRectification: item.rectify, rectificationDueDate: item.deadline, paintUnit: item.paintUnit, responsibleUnit: item.responsibleUnit, rectificationUnit: item.rectificationUnit };
        const objectValues = { objectCode: item.objectCode, vehicleModel: item.vehicleModel, productionDate: item.productionDate };
        let before: Row | null = null; let id: string;
        if (item.id) {
          before = await tx.inspectionOccurrence.findUniqueOrThrow({ where: { id: item.id }, include });
          if (before.activity.projectId !== initial.find(r => r.id === item.id)!.activity.projectId) throw new ConflictException('评审关联已变化，请重新读取。');
          if (before.revision !== item.expectedRevision || activityVersions.get(before.activityId) !== item.expectedActivityRevision || objectVersions.get(before.objectId) !== item.expectedObjectRevision) throw new ConflictException({ code: 'VISUAL_REVISION_CONFLICT', message: '记录已被修改。输入保留，请核对最新版本。', current: row(before) });
          if (before.object.objectKind !== 'VEHICLE' || before.activity.productionBaseId !== item.baseId) throw new BadRequestException('不能通过目视台账更换对象类型或基地。');
          if (item.scores === null && before.visualScores !== null) throw new BadRequestException('已采集评分须保留四条顺序；单项未判定可留空，不能删除整个原始评分结构。');
          if (before.colorId !== item.colorId && (await tx.inspectionMeasurement.count({ where: { occurrenceId: before.id } }) || await tx.inspectionDefect.count({ where: { occurrenceId: before.id } }))) throw new ConflictException('已有仪器或缺陷事实，颜色更正须先核对原关联，不能通过目视表改派。');
          const dateChanged = before.activity.activityDate.valueOf() !== item.date.valueOf();
          if (dateChanged && (before.activity.reviewRecordId || await tx.inspectionOccurrence.count({ where: { activityId: before.activityId } }) !== 1)) throw new ConflictException('共享或关联评审的活动日期须沿原活动更正流程维护。');
          const objectChanged = commandHash({ objectCode: before.object.objectCode, vehicleModel: before.object.vehicleModel, productionDate: before.object.productionDate }) !== commandHash(objectValues);
          if (objectChanged && await tx.inspectionOccurrence.count({ where: { objectId: before.objectId, id: { not: before.id } } })) throw new ConflictException('车辆已有其他历史台次，车辆基础资料请先沿对象维护流程核对，不能覆盖历史。');
          if (objectChanged) await tx.inspectionObject.update({ where: { id: before.objectId }, data: { ...objectValues, revision: { increment: 1 } } });
          if (!updatedActivities.has(before.activityId)) {
            await tx.inspectionActivity.update({ where: { id: before.activityId }, data: { activityDate: item.date, revision: { increment: 1 } } });
            updatedActivities.add(before.activityId);
          }
          await tx.inspectionOccurrence.update({ where: { id: item.id }, data: { ...values, colorId: item.colorId, revision: { increment: 1 } } });
          if (before.activity.reviewRecordId) {
            const review = await tx.reviewRecord.findUniqueOrThrow({ where: { id: before.activity.reviewRecordId } });
            await assertInspectionReviewLink(tx, { reviewId: review.id, projectId: review.projectId, reviewedAt: review.reviewedAt, standardVersionId: review.standardVersionId });
          }
          id = item.id;
        } else {
          let obj = await tx.inspectionObject.findUnique({ where: { objectCode: item.objectCode } });
          if (obj) {
            // Recheck under row lock: another table may be correcting the same vehicle.
            await tx.$queryRaw(Prisma.sql`SELECT id FROM inspection_objects WHERE id=${obj.id} FOR UPDATE`);
            obj = await tx.inspectionObject.findUniqueOrThrow({ where: { id: obj.id } });
            if (obj.objectKind !== 'VEHICLE' || obj.vehicleModel !== item.vehicleModel || obj.productionDate?.valueOf() !== item.productionDate?.valueOf()) throw new ConflictException('该车身号已登记且基础资料不同，请核对已有车辆，不能另建同名对象。');
          } else obj = await tx.inspectionObject.create({ data: { objectKind: 'VEHICLE', ...objectValues } });
          const activity = await tx.inspectionActivity.create({ data: { activityDate: item.date, productionBaseId: item.baseId, createdById: actor.id } });
          const created = await tx.inspectionOccurrence.create({ data: { activityId: activity.id, objectId: obj.id, colorId: item.colorId, ...values } });
          id = created.id;
        }
        const saved = await tx.inspectionOccurrence.findUniqueOrThrow({ where: { id }, include });
        await tx.auditLog.create({ data: { actorUserId: actor.id, projectId: saved.activity.projectId, targetType: 'SYSTEM', targetId: id, action: before ? 'VISUAL_LEDGER_UPDATED' : 'VISUAL_LEDGER_CREATED', summary: '原样保存目视评分及人工结论；不推进审批', beforeData: jsonData(before ? row(before) : {}), afterData: jsonData(row(saved)) } });
        result.push({ ...row(saved), ...(item.clientId ? { clientId: item.clientId } : {}) });
      }
      const response = { items: result };
      await tx.adminCommandRequest.create({ data: { actorUserId: actor.id, idempotencyKey: key, action: 'VISUAL_LEDGER_BATCH', requestHash: hash, result: jsonData(response) } });
      return response;
    }, { timeout: 15000 }).catch(error => { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('车身号或台次已经存在，请核对稳定ID后修改。'); throw error; });
  }
}
