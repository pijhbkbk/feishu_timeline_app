import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { PrismaClient, type WorkflowNodeCode, type WorkflowTaskStatus } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withProjectWrite } from '../../common/team-authorization';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { ProjectAccessService } from '../auth/project-access.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { StandardBoardsService } from '../standard-boards/standard-boards.service';
import { ReviewsService } from './reviews.service';

const url = process.env.REVIEW_PARALLEL_TEST_DATABASE_URL;
if (url) {
  const parsed = new URL(url);
  if (parsed.hostname !== '127.0.0.1' || parsed.port !== '55462' || parsed.pathname !== '/v1_production_model_final_20261020') throw new Error('Only the owned isolated synthetic database is allowed.');
}
// Explicit synthetic stage/transition fixtures reproduce the real 12 <- 11 <-
// 10 <- 06 plus parallel 07 <- 06 topology. Publication, issuance, creation
// audits, review writes and locks are real services/PG; no HTTP or GUI claim.
describe.skipIf(!url).sequential('same-round parallel standard evidence on PostgreSQL', () => {
  const db = new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
  let actor: AuthenticatedUser, boards: StandardBoardsService, reviews: ReviewsService;
  beforeAll(async () => {
    const user = await db.user.create({ data: { username: `parallel-${randomUUID()}`, name: '合成并行标准评审', teamAccessApproved: true } });
    actor = { id: user.id, username: user.username, name: user.name, email: null, departmentId: null, departmentName: null,
      isSystemAdmin: false, teamAccessApproved: true, authSource: 'local', roleCodes: [], permissionCodes: [], authVersion: user.authVersion };
    const access = new ProjectAccessService(db as never), logs = new ActivityLogsService(db as never, access);
    const unused = new Proxy({} as never, { get() { throw new Error('Unexpected workflow or attachment side effect'); } });
    boards = new StandardBoardsService(db as never, logs, unused, access);
    reviews = new ReviewsService(db as never, logs, unused, unused, access);
  });
  afterAll(async () => { await db.$disconnect(); }); // Preserve all synthetic facts/audits.
  async function fixture(options: { direct?: boolean; transition?: boolean } = {}) {
    const project = await db.project.create({ data: { code: randomUUID(), name: '合成A11并行标准', ownerUserId: actor.id, status: 'IN_PROGRESS' } });
    const base = await db.productionBase.create({ data: { code: randomUUID(), name: '合成A11准确基地' } });
    const color = await db.color.create({ data: { projectId: project.id, productionBaseId: base.id, name: '合成A11颜色', registerStatus: 'CANDIDATE', isPrimary: true } });
    await db.project.update({ where: { id: project.id }, data: { primaryColorId: color.id } });
    const instance = await db.workflowInstance.create({ data: { projectId: project.id, instanceNo: randomUUID(), status: 'RUNNING' } });
    const task = (nodeCode: WorkflowNodeCode, fromTaskId?: string, done = false) => db.workflowTask.create({ data: {
      projectId: project.id, workflowInstanceId: instance.id, taskNo: randomUUID(), nodeCode, nodeName: nodeCode,
      status: done ? 'COMPLETED' : 'IN_PROGRESS', isActive: !done, assigneeUserId: actor.id,
      ...(done ? { completedAt: new Date('2026-09-01T00:00:00Z') } : {}), payload: fromTaskId ? { fromTaskId } : {},
    } });
    const procurement = await task('PAINT_PROCUREMENT', undefined, true);
    const standardTask = await task('STANDARD_BOARD_PRODUCTION', procurement.id);
    const transition = async (toTaskId: string) => db.workflowTransition.create({ data: {
      projectId: project.id, workflowInstanceId: instance.id, fromTaskId: procurement.id, toTaskId,
      fromNodeCode: 'PAINT_PROCUREMENT', toNodeCode: 'STANDARD_BOARD_PRODUCTION', action: 'COMPLETE', operatorUserId: actor.id,
    } });
    if (options.transition !== false) await transition(standardTask.id);
    const publication = await boards.saveAndPublish(project.id, { taskId: standardTask.id, taskVersion: standardTask.updatedAt.toISOString(),
      expectedColorRevision: color.registerRevision, idempotencyKey: randomUUID(), boardCode: '合成A11标准', producedAt: '2026-09-01',
      technicalData: { measurements: [], changeSummary: '合成测试，无实际测量' } }, actor);
    const ids = publication as unknown as { boardId: string; colorVersionId: string };
    await boards.issueBoard(project.id, ids.boardId, { recipientDept: '合成A11评审', issuedAt: '2026-09-01' }, actor);
    await db.workflowTask.update({ where: { id: standardTask.id }, data: { status: 'COMPLETED', isActive: false } });
    const plan = await task('FIRST_UNIT_PRODUCTION_PLAN', procurement.id, true);
    const trialTask = await task('TRIAL_PRODUCTION', plan.id, true);
    await db.trialProduction.create({ data: { projectId: project.id, trialNo: randomUUID(), colorId: color.id,
      status: 'PASSED', result: 'PASS', completedAt: new Date('2026-09-02T00:00:00Z') } });
    const reviewTask = await task('CAB_REVIEW', options.direct ? standardTask.id : trialTask.id);
    return { project: { ...project, primaryColorId: color.id }, base, color, instance, procurement, standardTask, plan, trialTask, reviewTask,
      boardId: ids.boardId, versionId: ids.colorVersionId, task, transition };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  const input = (f: Fixture, versionId = f.versionId) => ({ standardVersionId: versionId, reviewerId: actor.id,
    reviewDate: '2026-10-20', reviewConclusion: 'APPROVED', comment: '仅合成A11原失败定向回归' });
  const options = async (f: Fixture) => (await reviews.getCabinReviewWorkspace(f.project.id, actor)).eligibleStandardVersions.map(x => x.id);
  const count = (f: Fixture) => db.reviewRecord.count({ where: { projectId: f.project.id } });
  async function denied(f: Fixture, versionId = f.versionId) {
    const before = await count(f);
    await expect(reviews.createCabinReview(f.project.id, input(f, versionId), actor)).rejects.toMatchObject({ status: 409 });
    expect(await count(f)).toBe(before);
  }
  it('fixes the actual normal sibling topology and pins the published/issued version through real review creation', async () => {
    const f = await fixture();
    expect(await options(f)).toEqual([f.versionId]);
    await reviews.createCabinReview(f.project.id, input(f), actor);
    expect(await db.reviewRecord.findFirstOrThrow({ where: { projectId: f.project.id } })).toMatchObject({ standardVersionId: f.versionId, workflowTaskId: f.reviewTask.id });
  });
  it('preserves direct technical ancestry and an exterior self-return without starting another procurement round', async () => {
    const direct = await fixture({ direct: true }); expect(await options(direct)).toEqual([direct.versionId]);
    const f = await fixture();
    await db.workflowTask.update({ where: { id: f.reviewTask.id }, data: { status: 'APPROVED', isActive: false } });
    const previous = await f.task('COLOR_CONSISTENCY_REVIEW', f.reviewTask.id, true);
    const current = await f.task('COLOR_CONSISTENCY_REVIEW', previous.id);
    const result = await reviews.createConsistencyReview(f.project.id, input(f), actor);
    expect(result.items).toEqual(expect.arrayContaining([expect.objectContaining({ standardVersionId: f.versionId, workflowTaskId: current.id })]));
  });
  it('does not borrow a prior procurement round or merely the same numeric taskRound', async () => {
    const f = await fixture(), second = await f.task('PAINT_PROCUREMENT', undefined, true);
    await db.workflowTask.update({ where: { id: f.plan.id }, data: { payload: { fromTaskId: second.id } } });
    expect(await options(f)).toEqual([]); await denied(f);
  });
  it('does not use another color/base/project or a later version without a board creation audit', async () => {
    const f = await fixture(), foreign = await fixture();
    await denied(f, foreign.versionId);
    const unbound = await db.colorVersion.create({ data: { colorId: f.color.id, versionNo: 2, publishedAt: new Date(), createdById: actor.id } });
    await db.standardBoard.create({ data: { projectId: f.project.id, colorId: f.color.id, colorVersionId: unbound.id,
      boardCode: '合成无创建审计板', isCurrent: false, status: 'ISSUED', issuedAt: new Date() } });
    expect(await options(f)).toEqual([f.versionId]); await denied(f, unbound.id);
  });
  it('requires both matching payload and immutable fanout transition', async () => {
    const f = await fixture({ transition: false }); expect(await options(f)).toEqual([]); await denied(f);
    const wrong = await fixture();
    await db.workflowTask.update({ where: { id: wrong.standardTask.id }, data: { payload: { fromTaskId: wrong.plan.id } } });
    expect(await options(wrong)).toEqual([]); await denied(wrong);
  });
  it('rejects a different workflow instance and mismatched technical development ancestry', async () => {
    const f = await fixture();
    const other = await db.workflowInstance.create({ data: { projectId: f.project.id, instanceNo: randomUUID(), versionNo: 2, status: 'DRAFT' } });
    await db.workflowTask.update({ where: { id: f.standardTask.id }, data: { workflowInstanceId: other.id } });
    expect(await options(f)).toEqual([]); await denied(f);
    const wrong = await fixture();
    await db.workflowTask.update({ where: { id: wrong.standardTask.id }, data: { payload: { fromTaskId: wrong.procurement.id, technicalReworkSourceTaskId: wrong.trialTask.id } } });
    expect(await options(wrong)).toEqual([]); await denied(wrong);
  });
  it('refuses ambiguous parallel 07 tasks instead of picking the newest', async () => {
    const f = await fixture(), second = await f.task('STANDARD_BOARD_PRODUCTION', f.procurement.id, true); await f.transition(second.id);
    await expect(options(f)).rejects.toMatchObject({ status: 409 }); await denied(f);
  });
  it.each(['CANCELLED', 'REJECTED', 'RETURNED'] as WorkflowTaskStatus[])('rejects invalidated 07 status %s in sibling and direct paths', async status => {
    for (const direct of [false, true]) {
      const f = await fixture({ direct });
      await db.workflowTask.update({ where: { id: f.standardTask.id }, data: { status } });
      expect(await options(f)).toEqual([]); await denied(f);
    }
  });
  it('requires published version, actual issuance date and a resolved production base', async () => {
    const f = await fixture();
    await db.colorVersion.update({ where: { id: f.versionId }, data: { publishedAt: null } }); expect(await options(f)).toEqual([]); await denied(f);
    const unissued = await fixture();
    await db.standardBoard.update({ where: { id: unissued.boardId }, data: { issuedAt: null } }); expect(await options(unissued)).toEqual([]); await denied(unissued);
    const noBase = await fixture();
    await db.color.update({ where: { id: noBase.color.id }, data: { productionBaseId: null } }); expect(await options(noBase)).toEqual([]); await denied(noBase);
  });
  it('revalidates the selected version after a concurrent project-locked invalidation, without creating a stale review', async () => {
    const f = await fixture(); expect(await options(f)).toEqual([f.versionId]);
    let release!: () => void, entered!: () => void;
    const ready = new Promise<void>(resolve => { entered = resolve; }), unlock = new Promise<void>(resolve => { release = resolve; });
    const invalidation = withProjectWrite(db as never, actor, { projectId: f.project.id }, async tx => {
      await tx.standardBoard.update({ where: { id: f.boardId }, data: { status: 'ARCHIVED' } }); entered(); await unlock;
    });
    await ready;
    let settled = false;
    const pending = reviews.createCabinReview(f.project.id, input(f), actor).then(() => { settled = true; return null; }, error => { settled = true; return error; });
    try { await new Promise(resolve => setTimeout(resolve, 100)); expect(settled).toBe(false); }
    finally { release(); }
    await invalidation; expect(await pending).toMatchObject({ status: 409 }); expect(await count(f)).toBe(0);
  });
});
