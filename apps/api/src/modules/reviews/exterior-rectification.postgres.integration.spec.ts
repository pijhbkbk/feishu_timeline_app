import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { PrismaClient, type WorkflowNodeCode } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { withProjectWrite } from '../../common/team-authorization';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { ProjectAccessService } from '../auth/project-access.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { WorkflowsService } from '../workflows/workflows.service';
import { WorkflowDeadlineService } from '../workflows/workflow-deadline.service';
import { WorkflowRecurringService } from '../workflows/workflow-recurring.service';
import { ReviewsService } from './reviews.service';

const url = process.env.RECTIFICATION_TEST_DATABASE_URL;
// Explicit synthetic pre-reached stages/issued standard fixture. All tested review,
// correction, transition, CAS, permission and audit writes use real services/PG.
// No HTTP, scan, browser, production data or whole upstream workflow is claimed.
describe.skipIf(!url).sequential('exterior supplier correction and re-review on PostgreSQL', () => {
  const db = new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
  const access = new ProjectAccessService(db as never);
  const activity = new ActivityLogsService(db as never, access);
  const workflows = new WorkflowsService(db as never, activity, {} as never, new WorkflowDeadlineService(), new WorkflowRecurringService(), access);
  const reviews = new ReviewsService(db as never, activity, new Proxy({} as never, { get() { throw new Error('Unexpected attachment IO'); } }), workflows, access);
  let actor: AuthenticatedUser;
  async function makeActor(approved = true): Promise<AuthenticatedUser> {
    const user = await db.user.create({ data: { username: `synthetic-a11-${randomUUID()}`, name: '合成整改记录人', teamAccessApproved: approved } });
    return { id: user.id, username: user.username, name: user.name, email: null, departmentId: null, departmentName: null, isSystemAdmin: false, teamAccessApproved: approved, authSource: 'local', roleCodes: [], permissionCodes: [], authVersion: user.authVersion };
  }
  beforeAll(async () => {
    const target = new URL(url!);
    if (target.hostname !== '127.0.0.1' || target.port !== '55460' || !/^\/free_workbook_drafts_[a-f0-9]{10}$/.test(target.pathname)) throw new Error('Only the explicitly owned isolated synthetic database is allowed');
    await db.$connect(); actor = await makeActor();
  });
  afterAll(async () => { await db.$disconnect(); }); // Keep all synthetic evidence.

  async function fixture(cabin = false, paid = true) {
    const project = await db.project.create({ data: { code: randomUUID(), name: '合成 A11 整改', status: 'IN_PROGRESS', ownerUserId: actor.id } });
    const color = await db.color.create({ data: { projectId: project.id, name: '合成松柏绿', isPrimary: true } });
    await db.project.update({ where: { id: project.id }, data: { primaryColorId: color.id } });
    const version = await db.colorVersion.create({ data: { colorId: color.id, versionNo: 1, status: 'APPROVED', createdById: actor.id } });
    const instance = await db.workflowInstance.create({ data: { projectId: project.id, instanceNo: randomUUID(), status: 'RUNNING' } });
    const task = (nodeCode: WorkflowNodeCode, done = false, fromTaskId?: string) => db.workflowTask.create({ data: {
      projectId: project.id, workflowInstanceId: instance.id, taskNo: randomUUID(), nodeCode, nodeName: nodeCode,
      status: done ? 'COMPLETED' : 'READY', isActive: !done, isPrimary: nodeCode === (cabin ? 'CAB_REVIEW' : 'COLOR_CONSISTENCY_REVIEW'),
      assigneeUserId: actor.id, ...(done ? { completedAt: new Date('2026-09-01T00:00:00Z') } : {}), payload: fromTaskId ? { fromTaskId } : {},
    } });
    const paint = await task('PAINT_DEVELOPMENT', true), standard = await task('STANDARD_BOARD_PRODUCTION', true);
    const board = await db.standardBoard.create({ data: { projectId: project.id, colorId: color.id, colorVersionId: version.id, boardCode: '合成已下发标准', status: 'ISSUED', issuedAt: new Date('2026-09-01T00:00:00Z') } });
    await db.auditLog.create({ data: { projectId: project.id, actorUserId: actor.id, targetType: 'STANDARD_BOARD', targetId: board.id, action: 'STANDARD_BOARD_CREATED', nodeCode: 'STANDARD_BOARD_PRODUCTION', summary: 'explicit synthetic pre-reached fixture', metadata: { workflowTaskId: standard.id, evidenceKind: 'TASK_CREATED_RECORD' } } });
    const trial = await task('TRIAL_PRODUCTION', true, standard.id);
    const trialRecord = await db.trialProduction.create({ data: { projectId: project.id, trialNo: randomUUID(), colorId: color.id, colorVersionId: version.id, status: 'PASSED', result: 'PASS', completedAt: new Date('2026-09-01T00:00:00Z') } });
    const cab = await task('CAB_REVIEW', !cabin, trial.id);
    const priorCabReview = cabin ? null : await db.reviewRecord.create({ data: { projectId: project.id, workflowTaskId: cab.id, standardVersionId: version.id, trialProductionId: trialRecord.id, reviewerId: actor.id, reviewType: 'CAB_REVIEW', result: 'APPROVED', comment: 'explicit synthetic prior cabin approval', submittedAt: new Date('2026-09-02T00:00:00Z'), reviewedAt: new Date('2026-09-02T00:00:00Z') } });
    const source = cabin ? cab : await task('COLOR_CONSISTENCY_REVIEW', false, cab.id);
    const detail = await task('BOARD_DETAIL_UPDATE'), performance = await task('PERFORMANCE_TEST'), number = await task('COLOR_NUMBERING', true), feeTask = await task('DEVELOPMENT_ACCEPTANCE', paid);
    const fee = await db.developmentFee.create({ data: { projectId: project.id, feeType: 'PAINT_DEVELOPMENT', amount: '100.00', payStatus: paid ? 'PAID' : 'PENDING', occurredAt: new Date('2026-09-01T00:00:00Z'), recordedById: actor.id } });
    return { project, instance, color, version, board, source, fee, trialRecord, priorCabReview, kept: [paint, standard, trial, ...(cabin ? [] : [cab]), detail, performance, number, feeTask] };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  const reviewInput = (f: Fixture, result: 'REJECTED' | 'APPROVED' = 'REJECTED') => ({ standardVersionId: f.version.id, reviewerId: actor.id, reviewDate: '2026-10-20T00:00:00.000Z', reviewConclusion: result, comment: '合成评审意见', rejectReason: result === 'REJECTED' ? '外饰件色差需厂家整改' : '' });
  async function reject(f: Fixture) {
    await reviews.createConsistencyReview(f.project.id, reviewInput(f), actor);
    const record = await db.reviewRecord.findFirstOrThrow({ where: { workflowTaskId: f.source.id } });
    await reviews.submitConsistencyReview(f.project.id, record.id, actor);
    const workspace = await reviews.rejectConsistencyReview(f.project.id, record.id, actor);
    return { record: await db.reviewRecord.findUniqueOrThrow({ where: { id: record.id } }), correction: workspace.exteriorRectification!, task: workspace.activeTask! };
  }
  const command = (value: Awaited<ReturnType<typeof reject>>) => ({ taskId: value.task.id, expectedTaskVersion: value.correction.taskVersion, operationId: randomUUID(), supplierName: '合成外饰件厂家', completedOn: '2026-10-20', summary: '厂家已调整外饰件配色并完成自检，送整车复审' });
  async function expectKept(f: Fixture) {
    for (const row of f.kept) expect(await db.workflowTask.findUniqueOrThrow({ where: { id: row.id } })).toEqual(row);
    expect(await db.color.findUniqueOrThrow({ where: { id: f.color.id } })).toEqual(f.color);
    expect(await db.colorVersion.findUniqueOrThrow({ where: { id: f.version.id } })).toEqual(f.version);
    expect(await db.standardBoard.findUniqueOrThrow({ where: { id: f.board.id } })).toEqual(f.board);
    expect(await db.trialProduction.findUniqueOrThrow({ where: { id: f.trialRecord.id } })).toEqual(f.trialRecord);
    if (f.priorCabReview) expect(await db.reviewRecord.findUniqueOrThrow({ where: { id: f.priorCabReview.id } })).toEqual(f.priorCabReview);
    expect(await db.developmentFee.findUniqueOrThrow({ where: { id: f.fee.id } })).toEqual(f.fee);
    expect(await db.workflowTask.count({ where: { projectId: f.project.id, nodeCode: 'PAINT_DEVELOPMENT' } })).toBe(1);
  }

  it.each([false, true])('preserves valid facts and exact standard through reject → correction → real re-review → production plan (%s)', async paid => {
    const f = await fixture(false, paid), rejected = await reject(f), input = command(rejected);
    await expectKept(f);
    expect(rejected.record).toMatchObject({ returnToNodeCode: 'COLOR_CONSISTENCY_REVIEW', standardVersionId: f.version.id, result: 'REJECTED' });
    expect(rejected.task).toMatchObject({ nodeCode: 'COLOR_CONSISTENCY_REVIEW', taskRound: 2 });
    expect(rejected.correction.status).toBe('PENDING');
    const saved = await reviews.completeExteriorRectification(f.project.id, input, actor);
    expect(saved.workspace.exteriorRectification).toMatchObject({ status: 'COMPLETED', sourceTaskId: f.source.id, supplierName: input.supplierName });
    expect(await db.taskProgressUpdate.findUniqueOrThrow({ where: { id: saved.receipt.progressUpdateId } })).toMatchObject({ progressStatus: 'IN_PROGRESS', completionPercent: 50 });
    expect(saved.workspace.eligibleStandardVersions.map(x => x.id)).toContain(f.version.id);
    expect(saved.receipt).toEqual((await reviews.completeExteriorRectification(f.project.id, input, actor)).receipt);
    await reviews.createConsistencyReview(f.project.id, reviewInput(f, 'APPROVED'), actor);
    const nextReview = await db.reviewRecord.findFirstOrThrow({ where: { workflowTaskId: rejected.task.id } });
    expect(nextReview.standardVersionId).toBe(f.version.id);
    await reviews.submitConsistencyReview(f.project.id, nextReview.id, actor);
    await reviews.approveConsistencyReview(f.project.id, nextReview.id, actor);
    expect(await db.workflowTask.count({ where: { projectId: f.project.id, nodeCode: 'MASS_PRODUCTION_PLAN', isActive: true } })).toBe(1);
    expect(await db.reviewRecord.findUniqueOrThrow({ where: { id: rejected.record.id } })).toEqual(rejected.record);
    await expectKept(f);
    // Lost acknowledgement replay also works after the correction task is no longer active.
    expect((await reviews.completeExteriorRectification(f.project.id, input, actor)).receipt).toEqual(saved.receipt);
    expect(await db.taskProgressUpdate.count({ where: { workflowTaskId: rejected.task.id } })).toBe(1);
    expect(await db.auditLog.count({ where: { targetId: rejected.task.id, action: 'EXTERIOR_RECTIFICATION_COMPLETED' } })).toBe(1);
    await expect(reviews.updateConsistencyReview(f.project.id, rejected.record.id, reviewInput(f), actor)).rejects.toThrow();
  });
  it('a further failed re-review creates a fresh pending correction and cannot reuse the previous completion', async () => {
    const f = await fixture(), first = await reject(f), input = command(first);
    await reviews.completeExteriorRectification(f.project.id, input, actor);
    const second = await reject({ ...f, source: await db.workflowTask.findUniqueOrThrow({ where: { id: first.task.id } }) });
    expect(second.task.taskRound).toBe(3); expect(second.correction.status).toBe('PENDING');
    expect(second.correction.sourceTaskId).toBe(first.task.id);
    const replay = await reviews.completeExteriorRectification(f.project.id, input, actor);
    expect(replay.receipt.taskId).toBe(first.task.id);
    expect(replay.workspace.exteriorRectification).toMatchObject({ taskId: second.task.id, status: 'PENDING' });
    expect(await db.taskProgressUpdate.count({ where: { workflowTaskId: second.task.id } })).toBe(0);
    await expect(reviews.createConsistencyReview(f.project.id, reviewInput(f, 'APPROVED'), actor)).rejects.toThrow('先登记');
    await expectKept(f);
  });
  it('blocks review writes and terminal workflow commands while supplier correction is pending', async () => {
    const f = await fixture(), rejected = await reject(f);
    await expect(reviews.createConsistencyReview(f.project.id, reviewInput(f, 'APPROVED'), actor)).rejects.toThrow('先登记');
    for (const action of ['APPROVE', 'REJECT', 'RETURN'] as const) await expect(withProjectWrite(db as never, actor, { projectId: f.project.id }, tx => workflows.transitionTaskWithExecutor(tx, rejected.task.id, action, actor, { comment: '不得绕过整改' }, 'designated-review'))).rejects.toThrow('先登记');
    for (const method of ['submitConsistencyReview', 'approveConsistencyReview', 'rejectConsistencyReview'] as const) await expect(reviews[method](f.project.id, rejected.record.id, actor)).rejects.toThrow();
    expect(await db.reviewRecord.count({ where: { workflowTaskId: rejected.task.id } })).toBe(0);
    await expectKept(f);
  });
  it('uses CAS and exact immutable idempotency; foreign tasks and stale commands do not mutate', async () => {
    const f = await fixture(), rejected = await reject(f), input = command(rejected), other = await fixture();
    await expect(reviews.completeExteriorRectification(other.project.id, input, actor)).rejects.toThrow();
    await expect(reviews.completeExteriorRectification(f.project.id, { ...input, expectedTaskVersion: '2020-01-01T00:00:00.000Z' }, actor)).rejects.toMatchObject({ status: 409 });
    const results = await Promise.all([reviews.completeExteriorRectification(f.project.id, input, actor), reviews.completeExteriorRectification(f.project.id, input, actor)]);
    expect(results[0].receipt).toEqual(results[1].receipt);
    await expect(reviews.completeExteriorRectification(f.project.id, { ...input, summary: '不同正文' }, actor)).rejects.toMatchObject({ status: 409 });
    await expect(reviews.completeExteriorRectification(f.project.id, { ...input, operationId: randomUUID() }, actor)).rejects.toMatchObject({ status: 409 });
    expect(await db.taskProgressUpdate.count({ where: { workflowTaskId: rejected.task.id } })).toBe(1);
  });
  it('serializes competing operations and refuses current unapproved or revoked membership even on replay', async () => {
    const f = await fixture(), rejected = await reject(f), input = command(rejected);
    const outsider = await makeActor(false);
    await expect(reviews.completeExteriorRectification(f.project.id, input, outsider)).rejects.toThrow();
    const results = await Promise.allSettled([reviews.completeExteriorRectification(f.project.id, input, actor), reviews.completeExteriorRectification(f.project.id, { ...input, operationId: randomUUID() }, actor)]);
    expect(results.filter(x => x.status === 'fulfilled')).toHaveLength(1);
    expect(await db.taskProgressUpdate.count({ where: { workflowTaskId: rejected.task.id } })).toBe(1);
    const revoked = await makeActor();
    const f2 = await fixture(), second = await reject(f2), request = command(second);
    await reviews.completeExteriorRectification(f2.project.id, request, revoked);
    await db.user.update({ where: { id: revoked.id }, data: { teamAccessApproved: false, authVersion: { increment: 1 } } });
    await expect(reviews.completeExteriorRectification(f2.project.id, request, revoked)).rejects.toThrow();
  });
  it('does not complete a pending correction after its workflow is cancelled', async () => {
    const f = await fixture(), rejected = await reject(f), input = command(rejected);
    await db.workflowInstance.update({ where: { id: f.instance.id }, data: { status: 'CANCELLED' } });
    await expect(reviews.completeExteriorRectification(f.project.id, input, actor)).rejects.toMatchObject({ status: 409 });
    expect(await db.taskProgressUpdate.count({ where: { workflowTaskId: rejected.task.id } })).toBe(0);
    expect((await db.workflowTask.findUniqueOrThrow({ where: { id: rejected.task.id } })).payload).toMatchObject({ exteriorRectification: { status: 'PENDING' } });
  });
  it('rolls back phase, progress and audit together after an injected audit failure', async () => {
    const f = await fixture(), rejected = await reject(f), input = command(rejected);
    const before = await db.workflowTask.findUniqueOrThrow({ where: { id: rejected.task.id } });
    const original = activity.createWithExecutor.bind(activity);
    const failAfterAudit = async (...[tx, data]: Parameters<typeof activity.createWithExecutor>) => {
      const result = await original(tx, data);
      if (data.action === 'EXTERIOR_RECTIFICATION_COMPLETED') throw new Error('injected-audit-rollback');
      return result;
    };
    const spy = vi.spyOn(activity, 'createWithExecutor').mockImplementation(failAfterAudit as typeof activity.createWithExecutor);
    try { await expect(reviews.completeExteriorRectification(f.project.id, input, actor)).rejects.toThrow('injected-audit-rollback'); }
    finally { spy.mockRestore(); }
    expect(await db.workflowTask.findUniqueOrThrow({ where: { id: before.id } })).toEqual(before);
    expect(await db.taskProgressUpdate.count({ where: { workflowTaskId: before.id } })).toBe(0);
    expect(await db.auditLog.count({ where: { targetId: before.id, action: 'EXTERIOR_RECTIFICATION_COMPLETED' } })).toBe(0);
    await reviews.completeExteriorRectification(f.project.id, input, actor);
  });
  it('RETURN uses the same pending exterior path; cabin rejection remains a fresh painting/trial round', async () => {
    const f = await fixture();
    await withProjectWrite(db as never, actor, { projectId: f.project.id }, tx => workflows.transitionTaskWithExecutor(tx, f.source.id, 'RETURN', actor, { comment: '外饰厂家整改' }, 'designated-review'));
    const next = await db.workflowTask.findFirstOrThrow({ where: { projectId: f.project.id, nodeCode: 'COLOR_CONSISTENCY_REVIEW', isActive: true } });
    expect(next.payload).toMatchObject({ exteriorRectification: { status: 'PENDING', sourceTaskId: f.source.id } });
    await expectKept(f);
    const cabin = await fixture(true);
    await reviews.createCabinReview(cabin.project.id, reviewInput(cabin), actor);
    const review = await db.reviewRecord.findFirstOrThrow({ where: { workflowTaskId: cabin.source.id } });
    await reviews.submitCabinReview(cabin.project.id, review.id, actor);
    await reviews.rejectCabinReview(cabin.project.id, review.id, actor);
    const trial = await db.workflowTask.findFirstOrThrow({ where: { projectId: cabin.project.id, nodeCode: 'TRIAL_PRODUCTION', isActive: true } });
    expect(trial).toMatchObject({ taskRound: 2, returnedFromTaskId: cabin.source.id });
    expect(trial.payload).not.toHaveProperty('exteriorRectification');
    expect(await db.workflowTask.count({ where: { projectId: cabin.project.id, nodeCode: 'COLOR_CONSISTENCY_REVIEW' } })).toBe(0);
    await expectKept(cabin);
  });
});
