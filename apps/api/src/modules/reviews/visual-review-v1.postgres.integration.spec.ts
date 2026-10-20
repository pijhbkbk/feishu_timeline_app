import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BusinessClock } from '../../common/business-clock';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ProjectAccessService } from '../auth/project-access.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { WorkflowsService } from '../workflows/workflows.service';
import { WorkflowDeadlineService } from '../workflows/workflow-deadline.service';
import { WorkflowRecurringService } from '../workflows/workflow-recurring.service';
import { ReviewsService } from './reviews.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { InspectionsService } from '../inspections/inspections.service';

const url = process.env.PERFORMANCE_ARRIVAL_TEST_DATABASE_URL;
describe.skipIf(!url).sequential('A12 V1 actual review stage on exclusive synthetic PostgreSQL', { timeout: 20_000 }, () => {
  const db = new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
  const access = new ProjectAccessService(db as never);
  const audit = new ActivityLogsService(db as never, access);
  const workflow = new WorkflowsService(db as never, audit, {} as never, new WorkflowDeadlineService(), new WorkflowRecurringService(), access);
  let beforeAttachmentFinalize: (() => Promise<void>) | undefined;
  // Real domain preflight/finalize transactions, with synthetic CLEAN metadata.
  // This does not claim binary storage, HTTP upload or malware scanning coverage.
  const attachments = { toAttachmentSummary: AttachmentsService.prototype.toAttachmentSummary,
    createStoredAttachment: async (request: Parameters<AttachmentsService['createStoredAttachment']>[0]) => {
    await beforeAttachmentFinalize?.();
    return db.$transaction(async tx => {
      const attachment = await tx.attachment.create({ data: { projectId: request.projectId, entityType: request.targetType,
        entityId: request.targetId, bucket: 'synthetic', storageKey: randomUUID(), fileName: 'synthetic-review.pdf',
        mimeType: 'application/pdf', fileSize: 16, scanStatus: 'CLEAN' } });
      await request.finalizeDomainAttachment!(tx, { attachmentId: attachment.id });
      return attachment;
    });
  } };
  const reviews = new ReviewsService(db as never, audit, attachments as never, workflow, access, new BusinessClock());
  const inspections = new InspectionsService(db as never, access, new BusinessClock());
  let actor: AuthenticatedUser;
  beforeAll(async () => {
    const target = new URL(url!);
    if (target.hostname !== '127.0.0.1' || target.port !== '55461' || target.pathname !== '/v1_performance_20261020') throw new Error('Only the task-owned synthetic PostgreSQL is allowed.');
    const role = await db.role.upsert({ where: { code: 'quality_engineer' }, create: { code: 'quality_engineer', name: '合成质量' }, update: {} });
    const username = `a12-stage-${randomUUID()}`;
    const user = await db.user.create({ data: { username, name: '合成实际阶段评审员', teamAccessApproved: true,
      localCredential: { create: { loginName: username, passwordHash: 'synthetic-no-login' } }, userRoles: { create: { roleId: role.id } } } });
    actor = { id: user.id, username, name: user.name, email: null, departmentId: null, departmentName: null,
      isSystemAdmin: false, teamAccessApproved: true, authSource: 'local', authVersion: user.authVersion, roleCodes: ['quality_engineer'] };
  });
  afterAll(async () => { await db.$disconnect(); });
  async function fixture() {
    const project = await db.project.create({ data: { code: `A12-STAGE-${randomUUID()}`, name: '合成无日历义务阶段', status: 'IN_PROGRESS', currentNodeCode: 'VISUAL_COLOR_DIFFERENCE_REVIEW' } });
    const instance = await db.workflowInstance.create({ data: { projectId: project.id, instanceNo: randomUUID(), status: 'RUNNING', currentNodeCode: 'VISUAL_COLOR_DIFFERENCE_REVIEW' } });
    await db.workflowTask.create({ data: { projectId: project.id, workflowInstanceId: instance.id, taskNo: randomUUID(), nodeCode: 'MASS_PRODUCTION', nodeName: '合成已完成前置', status: 'COMPLETED', isActive: false } });
    const task = await db.workflowTask.create({ data: { projectId: project.id, workflowInstanceId: instance.id, taskNo: randomUUID(), nodeCode: 'VISUAL_COLOR_DIFFERENCE_REVIEW', nodeName: '实际目视评审', status: 'IN_PROGRESS', isActive: true, isPrimary: true } });
    return { project, instance, task };
  }
  const input = () => ({ reviewerId: actor.id, reviewDate: '2026-10-19', reviewConclusion: 'APPROVED', comment: '合成实际抽检意见，保存不代表确认或阶段完成' });
  const stage = (f: Awaited<ReturnType<typeof fixture>>) => ({ taskId: f.task.id, taskVersion: f.task.updatedAt.toISOString() });
  const file = { originalname: 'synthetic-review.pdf', mimetype: 'application/pdf', size: 16, buffer: Buffer.from('%PDF-1.7\n') };
  async function create(f: Awaited<ReturnType<typeof fixture>>, changes = {}) {
    const result = await reviews.createVisualDeltaReview(f.project.id, { ...input(), ...changes }, actor);
    return result.items.find(item => !item.submittedAt)!;
  }
  async function confirmRecord(f: Awaited<ReturnType<typeof fixture>>, id: string) {
    await reviews.submitVisualDeltaReview(f.project.id, id, actor);
    await reviews.approveVisualDeltaReview(f.project.id, id, actor);
  }
  async function legacy(f: Awaited<ReturnType<typeof fixture>>) {
    const plan = await db.$transaction(tx => new WorkflowRecurringService().ensureMonthlyReviewPlan(tx, {
      projectId: f.project.id, sourceWorkflowTaskId: f.task.id, startAt: new Date('2025-01-01Z'),
    }));
    const months = await db.recurringTask.findMany({ where: { recurringPlanId: plan.plan.id }, orderBy: { periodIndex: 'asc' } });
    return { plan: plan.plan, months };
  }
  async function standard(f: Awaited<ReturnType<typeof fixture>>) {
    const base = await db.productionBase.create({ data: { code: randomUUID(), name: '合成阶段基地' } });
    const color = await db.color.create({ data: { projectId: f.project.id, productionBaseId: base.id, name: '合成准确颜色' } });
    await db.project.update({ where: { id: f.project.id }, data: { primaryColorId: color.id } });
    const version = await db.colorVersion.create({ data: { colorId: color.id, versionNo: 1, boardCode: '合成标准' } });
    const board = await db.standardBoard.create({ data: { projectId: f.project.id, colorId: color.id, colorVersionId: version.id, boardCode: randomUUID(), status: 'ISSUED' } });
    const previous = await db.workflowTask.create({ data: { projectId: f.project.id, workflowInstanceId: f.instance.id,
      taskNo: randomUUID(), nodeCode: 'STANDARD_BOARD_PRODUCTION', nodeName: '合成标准前置', status: 'COMPLETED', isActive: false } });
    await db.auditLog.create({ data: { projectId: f.project.id, actorUserId: actor.id, targetType: 'STANDARD_BOARD',
      targetId: board.id, nodeCode: 'STANDARD_BOARD_PRODUCTION', action: 'STANDARD_BOARD_CREATED',
      metadata: { workflowTaskId: previous.id, evidenceKind: 'TASK_CREATED_RECORD' } } });
    f.task = await db.workflowTask.update({ where: { id: f.task.id }, data: { payload: { fromTaskId: previous.id } } });
    return { base, color, version, board };
  }
  async function anotherReviewer() {
    const username = `a12-stage-${randomUUID()}`;
    const role = await db.role.findUniqueOrThrow({ where: { code: 'quality_engineer' } });
    const user = await db.user.create({ data: { username, name: '合成同月第二评审员', teamAccessApproved: true,
      localCredential: { create: { loginName: username, passwordHash: 'synthetic-no-login' } },
      userRoles: { create: { roleId: role.id } } } });
    return { ...actor, id: user.id, username, name: user.name, authVersion: user.authVersion };
  }

  it('saves TASK review without inventing months, confirms record separately, then explicitly completes stage', async () => {
    const f = await fixture();
    const created = await reviews.createVisualDeltaReview(f.project.id, input(), actor);
    expect(created.items[0]?.reviewPeriod).toBe('TASK');
    const id = created.items[0]!.id;
    expect(await db.recurringTask.count({ where: { projectId: f.project.id } })).toBe(0);
    const stage = { taskId: f.task.id, taskVersion: f.task.updatedAt.toISOString() };
    await expect(reviews.confirmVisualDeltaStage(f.project.id, stage, actor, true)).rejects.toThrow();
    await reviews.submitVisualDeltaReview(f.project.id, id, actor);
    await expect(reviews.confirmVisualDeltaStage(f.project.id, stage, actor, true)).rejects.toThrow();
    await reviews.approveVisualDeltaReview(f.project.id, id, actor);
    expect(await db.workflowTask.count({ where: { projectId: f.project.id, nodeCode: 'PROJECT_CLOSED' } })).toBe(0);
    await reviews.confirmVisualDeltaStage(f.project.id, stage, actor, true);
    expect(await db.workflowTask.findFirst({ where: { projectId: f.project.id, nodeCode: 'PROJECT_CLOSED', isActive: true } })).toMatchObject({ status: 'READY' });
    expect(await db.reviewRecord.findUnique({ where: { id } })).toMatchObject({ reviewPeriod: 'TASK', reviewerId: actor.id });
    await expect(reviews.confirmVisualDeltaStage(f.project.id, stage, actor, true)).rejects.toThrow();
  });

  it('reports missing actual work in preview and blocks internal COMPLETE/APPROVE as well as stale and unapproved requests', async () => {
    const f = await fixture();
    expect(await reviews.confirmVisualDeltaStage(f.project.id, stage(f), actor)).toMatchObject({ canComplete: false, blockingReasons: expect.arrayContaining(['请先保存、提交并明确确认本阶段的实际评审记录。']) });
    for (const action of ['COMPLETE', 'APPROVE'] as const) {
      await expect(db.$transaction(tx => workflow.transitionTaskWithExecutor(tx, f.task.id, action, actor, {}, 'designated-review'))).rejects.toThrow('实际评审');
    }
    await expect(reviews.confirmVisualDeltaStage(f.project.id, { ...stage(f), taskVersion: '2020-01-01T00:00:00.000Z' }, actor, true)).rejects.toThrow();
    await expect(reviews.confirmVisualDeltaStage(f.project.id, stage(f), { ...actor, teamAccessApproved: false }, true)).rejects.toThrow();
    expect(await db.workflowTask.count({ where: { projectId: f.project.id, nodeCode: 'PROJECT_CLOSED' } })).toBe(0);
  });

  it('preserves twelve legacy rows but ignores unsampled blank periods when explicitly completing the stage', async () => {
    const f = await fixture(); const old = await legacy(f);
    const record = await create(f, { reviewDate: old.months[0]!.plannedDate.toISOString() });
    await confirmRecord(f, record.id);
    const before = await db.recurringTask.findMany({ where: { recurringPlanId: old.plan.id }, orderBy: { id: 'asc' } });
    expect(before.filter(row => row.status === 'COMPLETED')).toHaveLength(1);
    expect(await db.workflowTask.count({ where: { projectId: f.project.id, nodeCode: 'PROJECT_CLOSED' } })).toBe(0);
    await reviews.confirmVisualDeltaStage(f.project.id, stage(f), actor, true);
    expect(await db.recurringTask.findMany({ where: { recurringPlanId: old.plan.id }, orderBy: { id: 'asc' } })).toEqual(before);
  });

  it('blocks completion for another explicitly recorded legacy period, then allows it after its own confirmation', async () => {
    const f = await fixture(); const old = await legacy(f);
    const first = await create(f, { reviewDate: old.months[0]!.plannedDate.toISOString() });
    const second = await create(f, { reviewDate: old.months[1]!.plannedDate.toISOString() });
    await confirmRecord(f, first.id);
    const preview = await reviews.confirmVisualDeltaStage(f.project.id, stage(f), actor);
    expect(preview).toMatchObject({ canComplete: false, blockingReasons: expect.arrayContaining([expect.stringContaining('实际抽检的历史期次')]) });
    await expect(reviews.confirmVisualDeltaStage(f.project.id, stage(f), actor, true)).rejects.toThrow('实际抽检');
    await confirmRecord(f, second.id);
    await reviews.confirmVisualDeltaStage(f.project.id, stage(f), actor, true);
  });

  it('recognizes an unchanged legacy confirmation without rewriting its audit or twelve historical periods', async () => {
    const f = await fixture(); const old = await legacy(f);
    const record = await create(f, { reviewDate: old.months[0]!.plannedDate.toISOString() });
    await reviews.submitVisualDeltaReview(f.project.id, record.id, actor);
    // Exact synthetic snapshot of the former service's persisted approval shape.
    await db.recurringTask.update({ where: { id: old.months[0]!.id }, data: { status: 'COMPLETED', result: 'APPROVED', reviewerId: actor.id, completedAt: new Date() } });
    await db.auditLog.create({ data: { projectId: f.project.id, actorUserId: actor.id, targetType: 'REVIEW_RECORD',
      targetId: record.id, action: 'VISUAL_DELTA_REVIEW_APPROVED', nodeCode: 'VISUAL_COLOR_DIFFERENCE_REVIEW',
      afterData: { reviewRecordId: record.id, result: 'APPROVED', recurringTaskId: old.months[0]!.id, completedPeriods: 1, totalPeriods: 12 } } });
    const originalAudit = await db.auditLog.findMany({ where: { targetId: record.id }, orderBy: { id: 'asc' } });
    const originalPeriods = await db.recurringTask.findMany({ where: { recurringPlanId: old.plan.id }, orderBy: { id: 'asc' } });
    await reviews.confirmVisualDeltaStage(f.project.id, stage(f), actor, true);
    expect(await db.auditLog.findMany({ where: { targetId: record.id }, orderBy: { id: 'asc' } })).toEqual(originalAudit);
    expect(await db.recurringTask.findMany({ where: { recurringPlanId: old.plan.id }, orderBy: { id: 'asc' } })).toEqual(originalPeriods);
  });

  it('allows explicit confirmation from the normal READY stage and still enforces required project materials', async () => {
    const f = await fixture();
    f.task = await db.workflowTask.update({ where: { id: f.task.id }, data: { status: 'READY' } });
    const record = await create(f); await confirmRecord(f, record.id);
    await db.project.update({ where: { id: f.project.id }, data: { requiresApprovedReport: true } });
    await expect(reviews.confirmVisualDeltaStage(f.project.id, stage(f), actor, true)).rejects.toThrow('获批开发报告');
    expect(await db.workflowTask.count({ where: { projectId: f.project.id, nodeCode: 'PROJECT_CLOSED' } })).toBe(0);
    // Restore this synthetic fixture's original contract, not a business bypass.
    await db.project.update({ where: { id: f.project.id }, data: { requiresApprovedReport: false } });
    await reviews.confirmVisualDeltaStage(f.project.id, stage(f), actor, true);
    expect(await db.workflowTask.findUnique({ where: { id: f.task.id } })).toMatchObject({ isActive: false });
  });

  it('does not reuse an approval for an edited version or transfer an old task approval', async () => {
    const f = await fixture(); const record = await create(f); await confirmRecord(f, record.id);
    const before = await db.auditLog.findMany({ where: { targetId: record.id, action: 'VISUAL_DELTA_REVIEW_APPROVED' } });
    await db.reviewRecord.update({ where: { id: record.id }, data: { comment: '合成数据库篡改负向，不是普通业务写入' } });
    await expect(reviews.confirmVisualDeltaStage(f.project.id, stage(f), actor, true)).rejects.toThrow('未提交或未确认');
    expect(await db.auditLog.findMany({ where: { targetId: record.id, action: 'VISUAL_DELTA_REVIEW_APPROVED' } })).toEqual(before);
    const other = await fixture();
    await expect(reviews.confirmVisualDeltaStage(other.project.id, stage(other), actor, true)).rejects.toThrow('实际评审');
  });

  it('keeps no-plan attachment preflight/finalize working, locks submitted writes, and enforces CLEAN at completion', async () => {
    const f = await fixture(); const record = await create(f);
    await reviews.uploadVisualDeltaReviewAttachment(f.project.id, record.id, file, actor);
    const attached = await db.reviewRecord.findUniqueOrThrow({ where: { id: record.id } }); expect(attached.attachmentId).toBeTruthy();
    await confirmRecord(f, record.id);
    await expect(reviews.uploadVisualDeltaReviewAttachment(f.project.id, record.id, file, actor)).rejects.toThrow();
    await db.attachment.update({ where: { id: attached.attachmentId! }, data: { scanStatus: 'REJECTED' } });
    await expect(reviews.confirmVisualDeltaStage(f.project.id, stage(f), actor, true)).rejects.toThrow('附件');
  });

  it('rejects a plan appearing between upload preflight and finalize without rewriting TASK identity', async () => {
    const f = await fixture(); const record = await create(f);
    beforeAttachmentFinalize = async () => { await legacy(f); };
    try { await expect(reviews.uploadVisualDeltaReviewAttachment(f.project.id, record.id, file, actor)).rejects.toThrow(); }
    finally { beforeAttachmentFinalize = undefined; }
    expect(await db.reviewRecord.findUnique({ where: { id: record.id } })).toMatchObject({ reviewPeriod: 'TASK', attachmentId: null });
    expect(await db.attachment.count({ where: { projectId: f.project.id } })).toBe(0);
    await expect(reviews.updateVisualDeltaReview(f.project.id, record.id, input(), actor)).rejects.toThrow('模式');
  });

  it('supports explicit same-day actual inspection links and keeps exact color/standard/date protection', async () => {
    const f = await fixture(); const basis = await standard(f);
    await expect(create(f)).rejects.toThrow('标准版本');
    const record = await create(f, { standardVersionId: basis.version.id });
    const activity = await inspections.createActivity({ operationId: randomUUID(), date: '2026-10-19', baseId: basis.base.id, personIds: [] }, actor);
    const object = await inspections.createObject({ operationId: randomUUID(), objectKind: 'VEHICLE', objectCode: randomUUID(), sampleId: null }, actor);
    await inspections.saveBatch(activity.id, { operationId: randomUUID(), expectedRevision: 1,
      items: [{ entity: 'occurrence', kind: 'create', clientId: 'vehicle', objectId: object.id, colorId: basis.color.id, values: { overallConclusion: 'PASS' } }] }, actor);
    await inspections.linkReview(activity.id, { operationId: randomUUID(), expectedRevision: 2, projectId: f.project.id, recurringTaskId: null, reviewRecordId: record.id }, actor);
    await expect(reviews.updateVisualDeltaReview(f.project.id, record.id, { ...input(), reviewDate: '2026-10-18', standardVersionId: basis.version.id }, actor)).rejects.toThrow('日期');
    await confirmRecord(f, record.id);
    expect((await inspections.detail(activity.id, actor)).editable).toBe(false);
    await db.standardBoard.update({ where: { id: basis.board.id }, data: { status: 'DRAFT' } });
    await expect(reviews.confirmVisualDeltaStage(f.project.id, stage(f), actor, true)).rejects.toThrow('标准');
  });

  it('keeps malformed legacy plans fail-closed rather than silently switching them to TASK mode', async () => {
    const f = await fixture(); const old = await legacy(f);
    await db.recurringTask.delete({ where: { id: old.months[11]!.id } }); // Explicit synthetic corruption fixture only.
    await expect(create(f)).rejects.toThrow('历史计划异常');
    await expect(reviews.confirmVisualDeltaStage(f.project.id, stage(f), actor, true)).rejects.toThrow('历史计划异常');
    expect(await db.recurringTask.count({ where: { recurringPlanId: old.plan.id } })).toBe(11);
  });

  it('rejects a historical plan whose project identity no longer matches its explicit source or periods', async () => {
    const f = await fixture(); const old = await legacy(f); const foreign = await fixture();
    await db.recurringPlan.update({ where: { id: old.plan.id }, data: { projectId: foreign.project.id } }); // Synthetic corruption only.
    await expect(create(f)).rejects.toThrow('历史计划异常');
    await expect(reviews.confirmVisualDeltaStage(f.project.id, stage(f), actor, true)).rejects.toThrow('历史计划异常');
    expect(await db.recurringPlan.findUnique({ where: { id: old.plan.id } })).toMatchObject({ projectId: foreign.project.id });
    expect(await db.recurringTask.count({ where: { recurringPlanId: old.plan.id, projectId: f.project.id } })).toBe(12);
  });

  it('finishes two existing same-month reviewers separately without rewriting the first period signature', async () => {
    const f = await fixture(); const old = await legacy(f); const basis = await standard(f); const secondActor = await anotherReviewer();
    const day = old.months[0]!.plannedDate.toISOString().slice(0, 10);
    const first = await create(f, { reviewDate: day, standardVersionId: basis.version.id });
    const secondInput = { ...input(), reviewerId: secondActor.id, reviewDate: day, standardVersionId: basis.version.id };
    const created = await reviews.createVisualDeltaReview(f.project.id, secondInput, secondActor);
    const second = created.items.find(item => item.reviewerId === secondActor.id)!;
    await confirmRecord(f, first.id);
    const periodBefore = await db.recurringTask.findUniqueOrThrow({ where: { id: old.months[0]!.id } });
    const firstBefore = await db.reviewRecord.findUniqueOrThrow({ where: { id: first.id } });
    const firstAudits = await db.auditLog.findMany({ where: { targetId: first.id }, orderBy: { id: 'asc' } });
    const workspace = await reviews.getVisualDeltaReviewWorkspace(f.project.id, secondActor);
    expect(workspace.items.find(item => item.id === second.id)).toMatchObject({ canContinueCompletedPeriod: true, isPeriodCompleted: false });
    const thirdActor = await anotherReviewer();
    await expect(reviews.createVisualDeltaReview(f.project.id, { ...secondInput, reviewerId: thirdActor.id }, thirdActor)).rejects.toThrow('已结束');
    await expect(reviews.updateVisualDeltaReview(f.project.id, first.id, { ...input(), reviewDate: day, standardVersionId: basis.version.id }, actor)).rejects.toThrow('已确认');
    await expect(reviews.confirmVisualDeltaStage(f.project.id, stage(f), actor, true)).rejects.toThrow('未提交或未确认');
    await reviews.updateVisualDeltaReview(f.project.id, second.id, { ...secondInput, comment: '合成第二人补充本人意见' }, secondActor);
    await reviews.uploadVisualDeltaReviewAttachment(f.project.id, second.id, file, secondActor);
    const activity = await inspections.createActivity({ operationId: randomUUID(), date: day, baseId: basis.base.id, personIds: [] }, secondActor);
    const object = await inspections.createObject({ operationId: randomUUID(), objectKind: 'VEHICLE', objectCode: randomUUID(), sampleId: null }, secondActor);
    await inspections.saveBatch(activity.id, { operationId: randomUUID(), expectedRevision: 1,
      items: [{ entity: 'occurrence', kind: 'create', clientId: 'same-month-vehicle', objectId: object.id, colorId: basis.color.id, values: { overallConclusion: 'PASS' } }] }, secondActor);
    await inspections.linkReview(activity.id, { operationId: randomUUID(), expectedRevision: 2, projectId: f.project.id, recurringTaskId: old.months[0]!.id, reviewRecordId: second.id }, secondActor);
    await reviews.submitVisualDeltaReview(f.project.id, second.id, secondActor);
    await reviews.approveVisualDeltaReview(f.project.id, second.id, secondActor);
    expect(await db.recurringTask.findUnique({ where: { id: old.months[0]!.id } })).toEqual(periodBefore);
    expect(await db.reviewRecord.findUnique({ where: { id: first.id } })).toEqual(firstBefore);
    expect(await db.auditLog.findMany({ where: { targetId: first.id }, orderBy: { id: 'asc' } })).toEqual(firstAudits);
    await reviews.confirmVisualDeltaStage(f.project.id, stage(f), actor, true);
  });

  it('continues exact legacy CREATE audit drafts but cannot move them into another completed month', async () => {
    const f = await fixture(); const old = await legacy(f); const secondActor = await anotherReviewer();
    const date = old.months[0]!.plannedDate;
    const first = await create(f, { reviewDate: date.toISOString() });
    // Synthetic pre-A12 persisted shape, without rewriting any actual audit.
    const second = await db.reviewRecord.create({ data: { projectId: f.project.id, workflowTaskId: f.task.id,
      reviewerId: secondActor.id, reviewType: 'VISUAL_COLOR_DIFFERENCE_REVIEW', reviewPeriod: date.toISOString().slice(0, 7),
      reviewedAt: date, result: 'APPROVED', comment: '合成旧服务本人草稿' } });
    await db.auditLog.create({ data: { projectId: f.project.id, actorUserId: secondActor.id, targetId: second.id,
      targetType: 'REVIEW_RECORD', action: 'VISUAL_DELTA_REVIEW_CREATED', afterData: {
        id: second.id, workflowTaskId: f.task.id, reviewerId: secondActor.id,
        reviewType: 'VISUAL_COLOR_DIFFERENCE_REVIEW', reviewDate: date.toISOString(),
        standardVersionId: null, reviewConclusion: 'APPROVED', submittedAt: null,
        reviewerName: secondActor.name, comment: second.comment, conditionNote: null,
        rejectReason: null, returnToNodeCode: null, attachmentId: null, trialProductionId: null, trialVehicleNo: null,
      } } });
    await confirmRecord(f, first.id);
    const secondInput = { ...input(), reviewerId: secondActor.id, reviewDate: date.toISOString() };
    const recordBefore = await db.reviewRecord.findUniqueOrThrow({ where: { id: second.id } });
    const auditBefore = await db.auditLog.findMany({ where: { targetId: second.id }, orderBy: { id: 'asc' } });
    await expect(reviews.updateVisualDeltaReview(f.project.id, second.id, { ...secondInput, reviewDate: old.months[1]!.plannedDate.toISOString() }, secondActor)).rejects.toThrow('原月份');
    expect(await db.reviewRecord.findUnique({ where: { id: second.id } })).toEqual(recordBefore);
    expect(await db.auditLog.findMany({ where: { targetId: second.id }, orderBy: { id: 'asc' } })).toEqual(auditBefore);
    const next = await create(f, { reviewDate: old.months[1]!.plannedDate.toISOString() }); await confirmRecord(f, next.id);
    await expect(reviews.updateVisualDeltaReview(f.project.id, second.id, { ...secondInput, reviewDate: old.months[1]!.plannedDate.toISOString() }, secondActor)).rejects.toThrow('已结束');
    const correctedDate = new Date(date); correctedDate.setUTCDate(2);
    await reviews.updateVisualDeltaReview(f.project.id, second.id, { ...secondInput, reviewDate: correctedDate.toISOString() }, secondActor);
    await reviews.submitVisualDeltaReview(f.project.id, second.id, secondActor);
    await reviews.approveVisualDeltaReview(f.project.id, second.id, secondActor);
    await reviews.confirmVisualDeltaStage(f.project.id, stage(f), actor, true);
    expect(await db.recurringTask.findUnique({ where: { id: old.months[0]!.id } })).toMatchObject({ reviewerId: actor.id });
  });

  it('does not infer confirmation or continuation from a completed month without an exact prior audit identity', async () => {
    const f = await fixture(); const old = await legacy(f); const secondActor = await anotherReviewer();
    const day = old.months[0]!.plannedDate;
    const first = await create(f, { reviewDate: day.toISOString() });
    const unrelated = await db.reviewRecord.create({ data: { projectId: f.project.id, workflowTaskId: f.task.id,
      reviewerId: secondActor.id, reviewType: 'VISUAL_COLOR_DIFFERENCE_REVIEW', reviewPeriod: day.toISOString().slice(0, 7),
      reviewedAt: day, result: 'APPROVED', comment: '合成归属证据缺失负向' } });
    await db.auditLog.create({ data: { projectId: f.project.id, targetType: 'REVIEW_RECORD', targetId: unrelated.id,
      action: 'VISUAL_DELTA_REVIEW_CREATED', afterData: { id: unrelated.id, workflowTaskId: 'another-task',
        reviewerId: secondActor.id, reviewType: 'VISUAL_COLOR_DIFFERENCE_REVIEW', reviewDate: day.toISOString() } } });
    await confirmRecord(f, first.id);
    const before = await db.recurringTask.findUniqueOrThrow({ where: { id: old.months[0]!.id } });
    const current = await reviews.getVisualDeltaReviewWorkspace(f.project.id, secondActor);
    expect(current.items.find(row => row.id === unrelated.id)).toMatchObject({ canContinueCompletedPeriod: false, isPeriodCompleted: false });
    await expect(reviews.updateVisualDeltaReview(f.project.id, unrelated.id,
      { ...input(), reviewerId: secondActor.id, reviewDate: day.toISOString() }, secondActor)).rejects.toThrow('已结束');
    await expect(reviews.confirmVisualDeltaStage(f.project.id, stage(f), actor, true)).rejects.toThrow('未提交或未确认');
    const thirdActor = await anotherReviewer();
    const late = await db.reviewRecord.create({ data: { projectId: f.project.id, workflowTaskId: f.task.id,
      reviewerId: thirdActor.id, reviewType: 'VISUAL_COLOR_DIFFERENCE_REVIEW', reviewPeriod: day.toISOString().slice(0, 7),
      reviewedAt: day, result: 'APPROVED', comment: '合成期次完成后插入负向' } });
    await db.auditLog.create({ data: { projectId: f.project.id, targetType: 'REVIEW_RECORD', targetId: late.id,
      action: 'VISUAL_DELTA_REVIEW_CREATED', metadata: { recurringTaskId: before.id, reviewPeriod: late.reviewPeriod } } });
    await expect(reviews.submitVisualDeltaReview(f.project.id, late.id, thirdActor)).rejects.toThrow('已结束');
    expect(await db.recurringTask.findUnique({ where: { id: before.id } })).toEqual(before);
  });

  it('keeps ordinary open-period date corrections available without creating or completing periods', async () => {
    const f = await fixture(); const old = await legacy(f);
    const record = await create(f, { reviewDate: old.months[0]!.plannedDate.toISOString() });
    const periods = await db.recurringTask.findMany({ where: { recurringPlanId: old.plan.id }, orderBy: { id: 'asc' } });
    const priorAudit = await db.auditLog.findMany({ where: { targetId: record.id }, orderBy: { id: 'asc' } });
    await reviews.updateVisualDeltaReview(f.project.id, record.id, { ...input(), reviewDate: old.months[1]!.plannedDate.toISOString() }, actor);
    expect(await db.reviewRecord.findUnique({ where: { id: record.id } })).toMatchObject({ reviewPeriod: old.months[1]!.plannedDate.toISOString().slice(0, 7) });
    expect(await db.recurringTask.findMany({ where: { recurringPlanId: old.plan.id }, orderBy: { id: 'asc' } })).toEqual(periods);
    expect(await db.auditLog.findMany({ where: { id: { in: priorAudit.map(row => row.id) } }, orderBy: { id: 'asc' } })).toEqual(priorAudit);
  });
});
