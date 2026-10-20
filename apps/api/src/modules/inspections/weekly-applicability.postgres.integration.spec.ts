import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ProjectAccessService } from '../auth/project-access.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { BusinessClock } from '../../common/business-clock';
import { WorkflowsService } from '../workflows/workflows.service';
import { WorkflowDeadlineService } from '../workflows/workflow-deadline.service';
import { WorkflowRecurringService } from '../workflows/workflow-recurring.service';
import { MassProductionsService } from '../mass-productions/mass-productions.service';
import { TaskRemindersService } from '../notifications/task-reminders.service';
import { NotificationsService } from '../notifications/notifications.service';
import { persistTaskReminder } from '../notifications/task-reminder.rules';
import { TeamTasksService } from '../personnel/team-tasks.service';
import { PersonsService } from '../persons/persons.service';
import { ProjectsService } from '../projects/projects.service';
import { InspectionsService } from './inspections.service';
import { hasRecordedMonthlyReview } from '../../common/monthly-review-applicability';

const url = process.env.PERFORMANCE_ARRIVAL_TEST_DATABASE_URL;
describe.skipIf(!url).sequential('A12 actual sampling on exclusive synthetic PostgreSQL', () => {
  const db = new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
  const access = new ProjectAccessService(db as never);
  const audit = new ActivityLogsService(db as never, access);
  const recurring = new WorkflowRecurringService();
  const workflow = new WorkflowsService(db as never, audit, {} as never, new WorkflowDeadlineService(), recurring, access);
  const production = new MassProductionsService(db as never, audit, workflow, access);
  const reminders = new TaskRemindersService(db as never);
  const notices = new NotificationsService(db as never, {} as never, {} as never);
  const team = new TeamTasksService(db as never);
  const inspections = new InspectionsService(db as never, access, new BusinessClock());
  const persons = new PersonsService(db as never);
  const projects = new ProjectsService(db as never, workflow, audit, access);
  const now = new Date('2026-10-20T04:00:00Z');
  let actor: AuthenticatedUser;
  let baseId: string;
  let colorA: string;
  let colorB: string;

  beforeAll(async () => {
    const target = new URL(url!);
    if (target.hostname !== '127.0.0.1' || target.port !== '55461' || target.pathname !== '/v1_performance_20261020') throw new Error('Only the task-owned synthetic PostgreSQL is allowed.');
    const role = await db.role.upsert({ where: { code: 'quality_engineer' }, create: { code: 'quality_engineer', name: '合成质量' }, update: {} });
    const username = `a12-${randomUUID()}`;
    const user = await db.user.create({ data: { username, name: '合成A12维护员', teamAccessApproved: true,
      localCredential: { create: { loginName: username, passwordHash: 'synthetic-no-login' } }, userRoles: { create: { roleId: role.id } } } });
    actor = { id: user.id, username, name: user.name, email: null, departmentId: null, departmentName: null,
      isSystemAdmin: false, teamAccessApproved: true, authSource: 'local', authVersion: user.authVersion, roleCodes: ['quality_engineer'] };
    baseId = (await db.productionBase.create({ data: { code: `A12-${randomUUID()}`, name: '合成周评基地' } })).id;
    colorA = (await db.color.create({ data: { code: `A12A-${randomUUID()}`, name: '合成周评颜色甲', productionBaseId: baseId } })).id;
    colorB = (await db.color.create({ data: { code: `A12B-${randomUUID()}`, name: '合成周评颜色乙', productionBaseId: baseId } })).id;
  });
  afterAll(async () => { await db.$disconnect(); });
  async function project(node: 'MASS_PRODUCTION' | 'VISUAL_COLOR_DIFFERENCE_REVIEW') {
    const p = await db.project.create({ data: { code: `A12-${randomUUID()}`, name: '合成A12项目', status: 'IN_PROGRESS', currentNodeCode: node } });
    const instance = await db.workflowInstance.create({ data: { projectId: p.id, instanceNo: randomUUID(), status: 'RUNNING', currentNodeCode: node } });
    const task = await db.workflowTask.create({ data: { projectId: p.id, workflowInstanceId: instance.id, taskNo: randomUUID(), nodeCode: node, nodeName: '合成工序', status: 'READY', isActive: true, isPrimary: true } });
    return { p, instance, task };
  }
  async function legacy() {
    const f = await project('VISUAL_COLOR_DIFFERENCE_REVIEW');
    // Seed an explicit legacy fixture. The production transition must never do this in V1.
    const plan = await db.$transaction(tx => recurring.ensureMonthlyReviewPlan(tx, { projectId: f.p.id, sourceWorkflowTaskId: f.task.id, startAt: new Date('2025-01-01Z') }));
    const months = await db.recurringTask.findMany({ where: { recurringPlanId: plan.plan.id }, orderBy: { periodIndex: 'asc' } });
    return { ...f, plan: plan.plan, months };
  }
  const activity = () => inspections.createActivity({ operationId: randomUUID(), date: '2026-10-19', baseId, personIds: [], batchLabel: '合成多颜色周评', note: null }, actor);

  it('completes actual mass production without manufacturing twelve monthly obligations', async () => {
    const f = await project('MASS_PRODUCTION');
    await db.workflowTask.create({ data: { projectId: f.p.id, workflowInstanceId: f.instance.id, taskNo: randomUUID(), nodeCode: 'MASS_PRODUCTION_PLAN', nodeName: '合成已完成排产', status: 'COMPLETED', isActive: false } });
    const workspace = await production.createRecord(f.p.id, { productionDate: '2026-10-19', plannedQuantity: 1, actualQuantity: 1,
      workshop: '合成车间', lineName: '合成产线', ownerId: actor.id, batchNo: 'SYNTH-A12', exceptionNote: null }, actor);
    await production.startRecord(f.p.id, workspace.items[0]!.id, actor);
    await production.completeRecord(f.p.id, workspace.items[0]!.id, actor);
    await production.completeTask(f.p.id, actor);
    expect(await db.recurringPlan.count({ where: { projectId: f.p.id } })).toBe(0);
    expect(await db.recurringTask.count({ where: { projectId: f.p.id } })).toBe(0);
    expect(await db.workflowTask.findFirst({ where: { projectId: f.p.id, nodeCode: 'VISUAL_COLOR_DIFFERENCE_REVIEW', isActive: true } })).toMatchObject({ status: 'READY', dueAt: null });
    expect(await db.workflowTask.count({ where: { projectId: f.p.id, nodeCode: 'PROJECT_CLOSED' } })).toBe(0);
    expect((await workflow.getMonthlyReviewWorkspace(f.p.id, actor)).summary).toMatchObject({ totalPeriods: 0, overduePeriods: 0, pendingPeriods: 0 });
  });

  it('excludes unsampled legacy periods from current reminders and shared work while preserving rows and notifications', async () => {
    const f = await legacy();
    const month = f.months[0]!;
    const before = await db.recurringTask.findMany({ where: { recurringPlanId: f.plan.id }, orderBy: { id: 'asc' } });
    expect(await reminders.target(db as never, 'monthly', month.id, now)).toBeNull();
    const notice = await db.$transaction(tx => persistTaskReminder(tx, { kind: 'monthly', id: month.id, projectId: f.p.id, stageTaskId: f.task.id, epoch: month.assignmentEpoch, roleCode: 'quality_engineer', ownerId: actor.id, title: '合成旧日历提醒', dueAt: month.dueAt }, actor.id, 'ACTIVATE', now));
    expect((await notices.getMyNotifications({}, actor)).items.some(item => item.id === notice)).toBe(false);
    expect((await team.listMonthly(actor, { view: 'mine', projectId: f.p.id })).items).toEqual([]);
    await expect(team.claimMonthly(actor, month.id, { requestId: randomUUID(), assignmentEpoch: month.assignmentEpoch })).rejects.toThrow('实际抽检');
    expect(await db.notification.findUnique({ where: { id: notice } })).not.toBeNull();
    expect(await db.recurringTask.findMany({ where: { recurringPlanId: f.plan.id }, orderBy: { id: 'asc' } })).toEqual(before);
    expect((await workflow.getMonthlyReviewWorkspace(f.p.id, actor)).summary).toMatchObject({ totalPeriods: 12, overduePeriods: 0, pendingPeriods: 0 });
    expect((await projects.listProjects({ keyword: f.p.code }, actor)).items[0]?.earliestDueAt).toBeNull();
  });

  it('does not infer a monthly obligation from the same color/date or an empty explicit activity', async () => {
    const f = await legacy();
    const a = await activity();
    await db.inspectionActivity.update({ where: { id: a.id }, data: { projectId: f.p.id, recurringTaskId: f.months[0]!.id } });
    expect(await hasRecordedMonthlyReview(db, f.months[0]!.id, f.p.id)).toBe(false);
    const object = await inspections.createObject({ operationId: randomUUID(), objectKind: 'VEHICLE', objectCode: randomUUID(), vin: null, vehicleModel: null, vehicleClass: null, sampleId: null }, actor);
    await inspections.saveBatch(a.id, { operationId: randomUUID(), expectedRevision: 1, items: [{ entity: 'occurrence', kind: 'create', clientId: 'vehicle', objectId: object.id, colorId: colorA, values: { overallConclusion: 'PASS' } }] }, actor);
    expect(await hasRecordedMonthlyReview(db, f.months[0]!.id, f.p.id)).toBe(true);
    expect(await hasRecordedMonthlyReview(db, f.months[1]!.id, f.p.id)).toBe(false);
    expect(await reminders.target(db as never, 'monthly', f.months[0]!.id, now)).toMatchObject({ id: f.months[0]!.id });
    expect(await reminders.target(db as never, 'monthly', f.months[1]!.id, now)).toBeNull();
    await expect(team.claimMonthly(actor, f.months[0]!.id, { requestId: randomUUID(), assignmentEpoch: f.months[0]!.assignmentEpoch })).resolves.toMatchObject({ taskId: f.months[0]!.id });
  });

  it('keeps multiple colors/vehicles in one activity and recalculates statistics after editing the same occurrence', async () => {
    const a = await activity();
    const objects = await Promise.all([0, 1].map(() => inspections.createObject({ operationId: randomUUID(), objectKind: 'VEHICLE', objectCode: randomUUID(), vin: null, vehicleModel: '合成车型', vehicleClass: null, sampleId: null }, actor)));
    await inspections.saveBatch(a.id, { operationId: randomUUID(), expectedRevision: 1, items: objects.map((o, index) => ({ entity: 'occurrence', kind: 'create', clientId: `v${index}`, objectId: o.id, colorId: index ? colorB : colorA, values: { overallConclusion: index ? 'FAIL' : 'PASS' } })) }, actor);
    const stats = await inspections.statistics({ baseId }, actor);
    expect(stats.uniqueVehicles).toBeGreaterThanOrEqual(2);
    const rows = await inspections.rows(a.id, {}, actor);
    expect(rows.items).toHaveLength(2);
    const row = rows.items.find(item => 'colorId' in item && item.colorId === colorB)!;
    await inspections.saveBatch(a.id, { operationId: randomUUID(), expectedRevision: 2, items: [{ entity: 'occurrence', kind: 'update', id: row.id, expectedRevision: 1, values: { overallConclusion: 'PASS' } }] }, actor);
    expect(await inspections.statistics({ colorId: colorB }, actor)).toMatchObject({ uniqueVehicles: 1, occurrences: 1, passed: 1, failed: 0 });
    expect((await inspections.rows(a.id, {}, actor)).items.map(item => item.id).sort()).toEqual(rows.items.map(item => item.id).sort());
    expect((await inspections.list({ colorId: colorA }, actor)).items.some(item => item.id === a.id)).toBe(true);
    expect((await inspections.list({ colorId: colorB }, actor)).items.some(item => item.id === a.id)).toBe(true);
  });

  it('requires an explicit matching review/task audit link, not just a review in the same month', async () => {
    const f = await legacy(); const month = f.months[0]!;
    const review = await db.reviewRecord.create({ data: { projectId: f.p.id, workflowTaskId: f.task.id, reviewerId: actor.id,
      reviewType: 'VISUAL_COLOR_DIFFERENCE_REVIEW', reviewPeriod: '2025-02', reviewedAt: month.plannedDate, result: 'APPROVED' } });
    expect(await hasRecordedMonthlyReview(db, month.id, f.p.id)).toBe(false);
    const evidence = { projectId: f.p.id, actorUserId: actor.id, targetType: 'REVIEW_RECORD' as const, targetId: review.id, action: 'VISUAL_DELTA_REVIEW_CREATED' };
    await db.auditLog.create({ data: { ...evidence, metadata: { recurringTaskId: month.id, reviewPeriod: '2025-03' } } });
    expect(await hasRecordedMonthlyReview(db, month.id, f.p.id)).toBe(false);
    await db.auditLog.create({ data: { ...evidence, metadata: { recurringTaskId: month.id, reviewPeriod: review.reviewPeriod } } });
    expect(await hasRecordedMonthlyReview(db, month.id, f.p.id)).toBe(true);
    expect(await hasRecordedMonthlyReview(db, f.months[1]!.id, f.p.id)).toBe(false);
    expect(await hasRecordedMonthlyReview(db, month.id, 'different-project')).toBe(false);
    expect((await workflow.getMonthlyReviewWorkspace(f.p.id, actor)).summary).toMatchObject({ totalPeriods: 12, overduePeriods: 0, pendingPeriods: 1 });
    expect((await projects.listProjects({ keyword: f.p.code }, actor)).items[0]?.earliestDueAt).toBe(month.dueAt?.toISOString());
    // Historical fixture transition: a completed old row is retained in history
    // regardless of whether the historical source has a reconstructible link.
    await db.recurringTask.update({ where: { id: f.months[1]!.id }, data: { status: 'COMPLETED', reviewerId: actor.id, completedAt: now } });
    expect((await team.listMonthly(actor, { view: 'completed', projectId: f.p.id })).items.some(item => item.id === f.months[1]!.id)).toBe(true);
  });

  it('retains disabled/archived participants and audits, while rejecting them as new selections', async () => {
    let person: Awaited<ReturnType<PersonsService['detail']>> = (await persons.create({ operationId: randomUUID(), items: [{ clientId: 'p', fields: { name: `合成周评历史参与人-${randomUUID()}`, isActive: true } }] }, actor)).items[0]!;
    const a = await inspections.createActivity({ operationId: randomUUID(), date: '2026-10-19', baseId, personIds: [person.id], batchLabel: null, note: null }, actor);
    const original = await db.inspectionParticipant.findMany({ where: { activityId: a.id } });
    const author = a.createdById;
    person = (await persons.saveSheet({ operationId: randomUUID(), items: [{ id: person.id, expectedRevision: person.revision, changes: { isActive: false } }] }, actor)).items[0]!;
    person = (await persons.archive(person.id, { operationId: randomUUID(), expectedRevision: person.revision, archived: true, reason: '合成归档验证' }, actor)).items[0]!;
    expect((await persons.list({ q: person.name, active: 'true' }, actor)).items).toEqual([]);
    await expect(inspections.createActivity({ operationId: randomUUID(), date: '2026-10-19', baseId, personIds: [person.id], batchLabel: null, note: null }, actor)).rejects.toThrow('已启用');
    await inspections.updateActivity(a.id, { operationId: randomUUID(), expectedRevision: 1, date: '2026-10-20', personIds: [person.id], batchLabel: null, note: '仅编辑旧活动备注' }, actor);
    expect(await db.inspectionParticipant.findMany({ where: { activityId: a.id } })).toEqual(original);
    expect((await inspections.detail(a.id, actor)).participants[0]!.person).toMatchObject({ id: person.id, isActive: false });
    expect((await inspections.detail(a.id, actor)).createdById).toBe(author);
    expect(await db.auditLog.count({ where: { targetId: person.id, action: { in: ['PERSON_PROFILE_UPDATED', 'PERSON_PROFILE_ARCHIVED'] } } })).toBe(2);
    person = (await persons.archive(person.id, { operationId: randomUUID(), expectedRevision: person.revision, archived: false, reason: '合成恢复验证' }, actor)).items[0]!;
    expect(person).toMatchObject({ isActive: false, archivedAt: null, userId: null });
    expect(await db.inspectionParticipant.findMany({ where: { activityId: a.id } })).toEqual(original);
  });
});
