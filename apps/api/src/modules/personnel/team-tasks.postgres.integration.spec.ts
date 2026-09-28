import { ReviewsService } from '../reviews/reviews.service';
import { WorkflowRecurringService } from '../workflows/workflow-recurring.service';
import { WorkflowsService } from '../workflows/workflows.service';
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { PrismaClient, Prisma, type WorkflowNodeCode } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { UsersService } from '../users/users.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PersonnelService } from './personnel.service';
import { TeamTasksService } from './team-tasks.service';
import { BUSINESS_ROLES } from './personnel.constants';
import { reconcileTeamAssignments, resolveTeamAssignment } from './team-assignment';
import { assertTeamTaskOperator, lockTeamAuthorization, withTeamWrite, withProjectWrite } from '../../common/team-authorization';
import { NATIVE_ADMIN_LOCK } from '../auth/native-auth.rules';

const url = process.env.R28_TEST_DATABASE_URL;
const run = randomUUID().slice(0, 8);
describe.skipIf(!url).sequential('R28 role queue and authorization fence on real PostgreSQL', () => {
  const db = new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
  const users = new UsersService(db as never);
  const personnel = new PersonnelService(db as never);
  const service = new TeamTasksService(db as never);
  let admin: AuthenticatedUser;
  let first: AuthenticatedUser;
  let second: AuthenticatedUser;
  let projectId: string;
  let instanceId: string;
  const fresh = async (id: string) => (await users.getAuthenticatedUser(id, 'local'))!;
  const body = (assignmentEpoch = 0) => ({ assignmentEpoch, requestId: randomUUID() });
  const exceptionIds = async () => {
    const ids: string[] = []; let after: string | undefined;
    // Exercise cursor pagination as retained synthetic evidence grows between runs.
    for (let page = 0; page < 100; page++) {
      const result = await service.list(admin, { view: 'exceptions', ...(after ? { after } : {}) });
      ids.push(...result.items.map(item => item.id));
      if (!result.nextCursor) return ids;
      after = result.nextCursor;
    }
    throw new Error('Synthetic exception list exceeded the test scan budget.');
  };

  const roles = async (id: string, roleCodes: string[]) => personnel.change(admin, id, {
    expectedVersion: (await db.user.findUniqueOrThrow({ where: { id } })).updatedAt.toISOString(),
    requestId: randomUUID(), roleCodes, reason: '合成角色并发验证',
  });
  let taskIndex = 0;
  const task = async (nodeCode: WorkflowNodeCode = 'PAINT_PROCUREMENT', assigneeUserId: string | null = null, completed = false) => {
    const index = taskIndex++;
    const taskProjectId = index === 0 ? projectId : (await db.project.create({ data: { code: `R28-TEAM-${run}-${index}`, name: '合成独立角色任务项目' } })).id;
    const taskInstanceId = index === 0 ? instanceId : (await db.workflowInstance.create({ data: { projectId: taskProjectId, instanceNo: `R28-TEAM-${run}-${index}` } })).id;
    return db.workflowTask.create({ data: {
    projectId: taskProjectId, workflowInstanceId: taskInstanceId, taskNo: `r28-team-${randomUUID()}`, nodeCode,
    nodeName: '合成采购待办', requiredRoleCode: nodeCode === 'PAINT_PROCUREMENT' ? 'purchaser' : 'quality_engineer',
    assigneeUserId, status: completed ? 'COMPLETED' : 'READY', isActive: !completed,
  } });
  };
  beforeAll(async () => {
    const parsed = new URL(url!);
    if (parsed.hostname !== '127.0.0.1' || parsed.port !== '55449' || !/^\/r28_[a-z_]+$/.test(parsed.pathname)) throw new Error('Only the isolated R28 database is allowed.');
    await db.user.updateMany({ where: { username: { startsWith: 'r28-team-' } }, data: { status: 'INACTIVE' } });
    for (const role of BUSINESS_ROLES) {
      const saved = await db.role.upsert({ where: { code: role.code }, create: { code: role.code, name: role.name }, update: {} });
      await db.rolePermission.upsert({ where: { roleId_permissionCode: { roleId: saved.id, permissionCode: 'project.read' } },
        create: { roleId: saved.id, permissionCode: 'project.read' }, update: {} });
    }
    for (const [key, name] of [['admin', '合成管理员'], ['one', '合成采购甲'], ['two', '合成采购乙']]) {
      const username = `r28-team-${run}-${key}`;
      const record = await db.user.create({ data: { username, name: name!, isSystemAdmin: key === 'admin',
        localCredential: { create: { loginName: username, passwordHash: 'synthetic-not-a-login-hash' } } } });
      if (key === 'admin') admin = await fresh(record.id);
      else if (key === 'one') first = await fresh(record.id);
      else second = await fresh(record.id);
    }
    const project = await db.project.create({ data: { code: `R28-TEAM-${run}`, name: '合成角色流转项目' } });
    projectId = project.id;
    instanceId = (await db.workflowInstance.create({ data: { projectId, instanceNo: `R28-TEAM-${run}` } })).id;
  });
  afterAll(async () => {
    await db.user.updateMany({ where: { username: { startsWith: `r28-team-${run}-` } }, data: { status: 'INACTIVE' } });
    await db.$disconnect();
  });

  it('keeps zero-candidate tasks as administrator exceptions without granting the administrator a business role', async () => {
    const created = await task();
    expect((await exceptionIds())).toContain(created.id);
    await expect(service.claim(admin, created.id, body())).rejects.toThrow('业务角色');
    await expect(service.list(first, {})).rejects.toMatchObject({ status: 403 });
    expect(await db.$transaction(tx => resolveTeamAssignment(tx, 'PAINT_PROCUREMENT'))).toMatchObject({ assigneeUserId: null });
  });
  it('autoassigns outstanding tasks to the sole eligible person and persists a notification', async () => {
    await roles(first.id, ['purchaser']); first = await fresh(first.id);
    const owned = await db.workflowTask.findFirstOrThrow({ where: { projectId, assigneeUserId: first.id } });
    expect(owned.assignmentEpoch).toBe(1);
    expect(await db.notification.count({ where: { taskId: owned.id, userId: first.id } })).toBe(1);
    expect(await db.$transaction(tx => resolveTeamAssignment(tx, 'PAINT_PROCUREMENT'))).toMatchObject({ assigneeUserId: first.id });
  });
  it('retains a valid owner when another candidate joins, and puts new work in the shared queue', async () => {
    await roles(second.id, ['purchaser']); second = await fresh(second.id);
    expect(await db.workflowTask.count({ where: { projectId, assigneeUserId: first.id } })).toBe(1);
    expect(await db.$transaction(tx => resolveTeamAssignment(tx, 'PAINT_PROCUREMENT'))).toMatchObject({ assigneeUserId: null });
    const queued = await task();
    for (const actor of [first, second]) expect((await service.list(actor, { view: 'available' })).items.map(item => item.id)).toContain(queued.id);
  });
  it('allows exactly one of two simultaneous claims and records exactly one assignment audit', async () => {
    const queued = await task();
    const outcomes = await Promise.allSettled([service.claim(first, queued.id, body()), service.claim(second, queued.id, body())]);
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const saved = await db.workflowTask.findUniqueOrThrow({ where: { id: queued.id } });
    expect([first.id, second.id]).toContain(saved.assigneeUserId);
    expect(saved.assignmentEpoch).toBe(1);
    expect(await db.auditLog.count({ where: { targetId: queued.id, action: 'TEAM_TASK_CLAIMED' } })).toBe(1);
  });
  it('replays the same claim without a second audit and rejects reuse for another task', async () => {
    const queued = await task(); const input = body();
    const outcomes = await Promise.all([service.claim(first, queued.id, input), service.claim(first, queued.id, input)]);
    expect(outcomes.filter(result => result.replayed)).toHaveLength(1);
    expect(await db.auditLog.count({ where: { targetId: queued.id, action: 'TEAM_TASK_CLAIMED' } })).toBe(1);
    await expect(service.claim(first, (await task()).id, input)).rejects.toThrow('请求编号');
  });
  it('requires a matching role and claim for business signing even for a system administrator', async () => {
    expect(() => assertTeamTaskOperator({ nodeCode: 'PAINT_PROCUREMENT', assigneeUserId: admin.id }, admin)).toThrow('业务角色');
    expect(() => assertTeamTaskOperator({ nodeCode: 'PAINT_PROCUREMENT', assigneeUserId: null }, first)).toThrow('领取');
    expect(() => assertTeamTaskOperator({ nodeCode: 'PAINT_PROCUREMENT', assigneeUserId: second.id }, first)).toThrow('其他人员');
    expect(() => assertTeamTaskOperator({ nodeCode: 'PAINT_PROCUREMENT', assigneeUserId: first.id }, first)).not.toThrow();
  });
  it('rejects ordinary-user transfers and administrator transfers to an unqualified account', async () => {
    const queued = await task();
    await expect(service.claim(first, queued.id, { ...body(), assigneeUserId: second.id, reason: '转派' }, true)).rejects.toThrow('仅管理员');
    await expect(service.claim(admin, queued.id, { ...body(), assigneeUserId: admin.id, reason: '转派' }, true)).rejects.toThrow('业务角色');
    await service.claim(admin, queued.id, { ...body(), assigneeUserId: first.id, reason: '有效转派' }, true);
    expect((await db.workflowTask.findUniqueOrThrow({ where: { id: queued.id } })).assigneeUserId).toBe(first.id);
  });
  it('revocation releases only affected unfinished work, preserves completed authors, and rejects the stale actor', async () => {
    const completed = await task('PAINT_PROCUREMENT', first.id, true);
    const pending = await task('PAINT_PROCUREMENT', first.id);
    const history = await db.auditLog.create({ data: { actorUserId: first.id, targetType: 'WORKFLOW_TASK', targetId: completed.id, action: 'R28_COMPLETED_HISTORY' } });
    await roles(first.id, []);
    const released = await db.workflowTask.findUniqueOrThrow({ where: { id: pending.id } });
    expect(released.assigneeUserId).toBe(second.id); expect(released.assignmentEpoch).toBe(1);
    expect((await db.workflowTask.findUniqueOrThrow({ where: { id: completed.id } })).assigneeUserId).toBe(first.id);
    expect((await db.auditLog.findUniqueOrThrow({ where: { id: history.id } })).actorUserId).toBe(first.id);
    await expect(service.claim(first, pending.id, body())).rejects.toThrow('授权已变化');
    await roles(first.id, ['purchaser']); first = await fresh(first.id);
    await expect(service.claim(first, pending.id, body())).rejects.toThrow('归属已变化');
  });
  it('waits for an already authorized write to commit before acknowledging revocation', async () => {
    let release!: () => void; let acquired!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const ready = new Promise<void>(resolve => { acquired = resolve; });
    const write = withTeamWrite(db as never, first, async tx => {
      acquired(); await gate;
      await tx.auditLog.create({ data: { actorUserId: first.id, targetType: 'SYSTEM', targetId: projectId, action: 'R28_AUTHORIZED_WRITE_BEFORE_REVOKE' } });
    });
    await ready;
    let revokeFinished = false;
    const revoke = roles(first.id, []).then(result => { revokeFinished = true; return result; });
    try {
      for (let attempt = 0; attempt < 100; attempt++) {
        const waiting = await db.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`SELECT count(*) FROM pg_locks WHERE locktype = 'advisory' AND NOT granted AND objid = (hashtext(${NATIVE_ADMIN_LOCK})::bigint & 4294967295)`);
        if (Number(waiting[0]!.count) > 0) break;
        if (attempt === 99) throw new Error('Revocation did not reach the authorization fence.');
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      expect(revokeFinished).toBe(false);
    } finally { release(); }
    await write; await revoke;
    await expect(withTeamWrite(db as never, first, async () => true)).rejects.toThrow('授权已变化');
  });
  it('rechecks a queued business write after revocation commits first', async () => {
    await roles(first.id, ['purchaser']); first = await fresh(first.id);
    let release!: () => void; let acquired!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const ready = new Promise<void>(resolve => { acquired = resolve; });
    const revoke = db.$transaction(async tx => {
      await lockTeamAuthorization(tx, true); acquired(); await gate;
      await tx.user.update({ where: { id: first.id }, data: { authVersion: { increment: 1 } } });
    });
    await ready;
    const pending = withTeamWrite(db as never, first, async tx => tx.auditLog.create({ data: { actorUserId: first.id, targetType: 'SYSTEM', action: 'R28_MUST_NOT_WRITE_AFTER_REVOKE', targetId: projectId } }));
    const check = expect(pending).rejects.toThrow('授权已变化');
    release(); await revoke; await check;
    expect(await db.auditLog.count({ where: { action: 'R28_MUST_NOT_WRITE_AFTER_REVOKE', targetId: projectId } })).toBe(0);
  });

  it('shows an unqualified legacy owner as an exception and reconciles only unfinished assignments', async () => {
    const legacy = await task('PAINT_PROCUREMENT', admin.id);
    const qualified = await task('PAINT_PROCUREMENT', second.id);
    const completed = await task('PAINT_PROCUREMENT', admin.id, true);
    expect((await exceptionIds())).toContain(legacy.id);
    await db.$transaction(async tx => {
      await lockTeamAuthorization(tx, true);
      await reconcileTeamAssignments(tx, { actorUserId: null, roleCodes: BUSINESS_ROLES.map(role => role.code), reason: '合成迁移演练' });
    });
    expect((await db.workflowTask.findUniqueOrThrow({ where: { id: legacy.id } })).assigneeUserId).not.toBe(admin.id);
    expect((await db.workflowTask.findUniqueOrThrow({ where: { id: qualified.id } }))).toMatchObject({ assigneeUserId: second.id, assignmentEpoch: 0 });
    expect((await db.workflowTask.findUniqueOrThrow({ where: { id: completed.id } }))).toMatchObject({ assigneeUserId: admin.id, assignmentEpoch: 0 });
    expect(await db.auditLog.count({ where: { targetId: legacy.id, action: 'TEAM_TASK_REASSIGNED' } })).toBe(1);
  });

  it('shows a disabled role as an exception even when it still has enabled users', async () => {
    const queued = await task();
    await db.role.update({ where: { code: 'purchaser' }, data: { status: 'INACTIVE' } });
    try { expect((await exceptionIds())).toContain(queued.id); }
    finally { await db.role.update({ where: { code: 'purchaser' }, data: { status: 'ACTIVE' } }); }
  });

  it('releases overdue monthly work while preserving overdue status and completed monthly authors', async () => {
    await roles(first.id, ['purchaser', 'quality_engineer']);
    await roles(second.id, ['purchaser', 'quality_engineer']);
    const plan = await db.recurringPlan.create({ data: { projectId, planCode: `R28-MONTH-${run}`, frequency: 'MONTHLY',
      sourceNodeCode: 'VISUAL_COLOR_DIFFERENCE_REVIEW', totalCount: 12, startDate: new Date('2025-01-01'), endDate: new Date('2026-01-01') } });
    const overdue = await db.recurringTask.create({ data: { projectId, recurringPlanId: plan.id, taskCode: `R28-OVERDUE-${run}`,
      periodIndex: 2, periodLabel: '2025-03', plannedDate: new Date('2025-03-01'), status: 'OVERDUE', reviewerId: first.id, requiredRoleCode: 'quality_engineer' } });
    const completed = await db.recurringTask.create({ data: { projectId, recurringPlanId: plan.id, taskCode: `R28-HISTORY-${run}`,
      periodIndex: 1, periodLabel: '2025-02', plannedDate: new Date('2025-02-01'), status: 'COMPLETED', reviewerId: first.id, requiredRoleCode: 'quality_engineer' } });
    await roles(first.id, ['purchaser']);
    expect(await db.recurringTask.findUniqueOrThrow({ where: { id: overdue.id } })).toMatchObject({ reviewerId: second.id, status: 'OVERDUE', assignmentEpoch: 1 });
    expect(await db.recurringTask.findUniqueOrThrow({ where: { id: completed.id } })).toMatchObject({ reviewerId: first.id, status: 'COMPLETED', assignmentEpoch: 0 });
    expect(await db.auditLog.count({ where: { targetId: overdue.id, action: 'TEAM_MONTHLY_TASK_REASSIGNED' } })).toBe(1);
  });
  it('exposes only due monthly work, permits one claimant, and keeps twelve months through rework', async () => {
    await roles(first.id, ['purchaser', 'quality_engineer']); first = await fresh(first.id);
    await roles(second.id, ['purchaser', 'quality_engineer']); second = await fresh(second.id);
    const parent = await task('VISUAL_COLOR_DIFFERENCE_REVIEW');
    const recurring = new WorkflowRecurringService();
    const plan = await db.$transaction(tx => recurring.ensureMonthlyReviewPlan(tx, {
      projectId: parent.projectId, sourceWorkflowTaskId: parent.id, startAt: new Date('2020-01-31T00:00:00Z'),
    }));
    let months = await db.recurringTask.findMany({ where: { recurringPlanId: plan.plan.id }, orderBy: { periodIndex: 'asc' } });
    expect(months).toHaveLength(12); expect(months[0]!.plannedDate.toISOString()).toBe('2020-02-29T00:00:00.000Z');
    const future = months[11]!;
    await db.recurringTask.update({ where: { id: future.id }, data: { plannedDate: new Date(Date.now() + 86400000 * 30) } });
    expect((await service.listMonthly(first, { view: 'available' })).items.map(item => item.id)).not.toContain(future.id);
    await expect(service.claimMonthly(first, future.id, body())).rejects.toThrow('尚未到期');
    await expect(service.claim(first, parent.id, body())).rejects.toThrow('具体月度');
    const month = months[0]!;
    const outcomes = await Promise.allSettled([service.claimMonthly(first, month.id, body()), service.claimMonthly(second, month.id, body())]);
    expect(outcomes.filter(item => item.status === 'fulfilled')).toHaveLength(1);
    const owned = await db.recurringTask.findUniqueOrThrow({ where: { id: month.id } });
    expect(owned.assignmentEpoch).toBe(1);
    expect(await db.auditLog.count({ where: { targetId: month.id, action: 'TEAM_MONTHLY_TASK_CLAIMED' } })).toBe(1);
    const winner = owned.reviewerId === first.id ? first : second;
    const replayBody = body(1);
    await service.claimMonthly(winner, month.id, replayBody);
    expect(await service.claimMonthly(winner, month.id, replayBody)).toMatchObject({ replayed: true, changed: false });
    await expect(service.claimMonthly(admin, month.id, { ...body(1), assigneeUserId: admin.id, reason: '错误转派' }, true)).rejects.toThrow('质量试验角色');
    await db.recurringTask.update({ where: { id: month.id }, data: { status: 'COMPLETED' } });
    await db.workflowTask.update({ where: { id: parent.id }, data: { status: 'REJECTED', isActive: false } });
    expect((await service.listMonthly(first, { view: 'available' })).items.every(item => item.projectId !== parent.projectId)).toBe(true);
    const newParent = await db.workflowTask.create({ data: {
      projectId: parent.projectId, workflowInstanceId: parent.workflowInstanceId, taskNo: `r28-rework-${randomUUID()}`,
      nodeCode: 'VISUAL_COLOR_DIFFERENCE_REVIEW', nodeName: '返工后的月度评审', taskRound: 2, status: 'READY', requiredRoleCode: 'quality_engineer',
    } });
    const reused = await db.$transaction(tx => recurring.ensureMonthlyReviewPlan(tx, { projectId: parent.projectId,
      sourceWorkflowTaskId: newParent.id, startAt: new Date() }));
    expect(reused.plan.id).toBe(plan.plan.id);
    expect(reused.plan.sourceWorkflowTaskId).toBe(parent.id);
    months = await db.recurringTask.findMany({ where: { recurringPlanId: plan.plan.id }, orderBy: { periodIndex: 'asc' } });
    expect(months).toHaveLength(12); expect(months[0]).toMatchObject({ status: 'COMPLETED', reviewerId: winner.id });
    const workflow = new WorkflowsService(db as never, null as never, null as never, null as never, recurring, null as never);
    const check = () => db.$transaction(tx => workflow['assertMonthlyReviewPeriodsCompleted'](tx, newParent));
    await expect(check()).rejects.toThrow('月度评审未完成');
    await db.recurringTask.updateMany({ where: { recurringPlanId: plan.plan.id }, data: { status: 'COMPLETED' } });
    await expect(check()).resolves.toBeUndefined();
    expect(await db.recurringPlan.count({ where: { projectId: parent.projectId } })).toBe(1);
  });

  it('serializes writes within a project before row locks while another project can commit', async () => {
    first = await fresh(first.id);
    const other = await db.project.create({ data: { code: `R28-PROJECT-LOCK-${run}`, name: '项目写锁隔离' } });
    let release!: () => void; let acquired!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const ready = new Promise<void>(resolve => { acquired = resolve; });
    const order: string[] = [];
    const holder = withProjectWrite(db as never, first, { projectId }, async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM projects WHERE id = ${projectId} FOR UPDATE`);
      order.push('first'); acquired(); await gate; order.push('first-commit');
    });
    await ready;
    const waiter = withProjectWrite(db as never, first, { projectId }, async () => { order.push('second'); });
    try {
      for (let attempt = 0; attempt < 100; attempt++) {
        const waiting = await db.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`SELECT count(*) FROM pg_locks
          WHERE locktype = 'advisory' AND NOT granted AND classid = (hashtext(${'team-project-write'})::bigint & 4294967295)
            AND objid = (hashtext(${projectId})::bigint & 4294967295)`);
        if (Number(waiting[0]!.count) > 0) break;
        if (attempt === 99) throw new Error('Same-project write did not reach the project lock.');
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      await withProjectWrite(db as never, first, { projectId: other.id }, async tx => {
        await tx.auditLog.create({ data: { actorUserId: first.id, projectId: other.id, targetId: other.id, targetType: 'PROJECT', action: 'R28_INDEPENDENT_PROJECT_WRITE' } });
        order.push('other-project');
      });
      expect(order).toEqual(['first', 'other-project']);
    } finally { release(); }
    await holder; await waiter;
    expect(order).toEqual(['first', 'other-project', 'first-commit', 'second']);
  });

  it.each(['CANCELLED', 'short-plan', 'missing-month', 'wrong-index'] as const)(
    'blocks signing and parent completion for an invalid historical monthly plan: %s', async defect => {
      const parent = await task('VISUAL_COLOR_DIFFERENCE_REVIEW', first.id);
      const recurring = new WorkflowRecurringService();
      const generated = await db.$transaction(tx => recurring.ensureMonthlyReviewPlan(tx, {
        projectId: parent.projectId, sourceWorkflowTaskId: parent.id, startAt: new Date('2020-01-01'),
      }));
      const planId = generated.plan.id;
      await db.recurringTask.updateMany({ where: { recurringPlanId: planId }, data: { status: 'COMPLETED' } });
      if (defect === 'CANCELLED') await db.recurringPlan.update({ where: { id: planId }, data: { status: 'CANCELLED' } });
      if (defect === 'short-plan') await db.recurringPlan.update({ where: { id: planId }, data: { totalCount: 1 } });
      // Synthetic corruption only, never edits an actual user's historical record.
      if (defect === 'missing-month') await db.recurringTask.deleteMany({ where: { recurringPlanId: planId, periodIndex: 12 } });
      if (defect === 'wrong-index') await db.recurringTask.updateMany({ where: { recurringPlanId: planId, periodIndex: 12 }, data: { periodIndex: 13 } });
      const before = await db.recurringPlan.findUniqueOrThrow({ where: { id: planId }, include: { tasks: { orderBy: { periodIndex: 'asc' } } } });
      const reviews = new ReviewsService(db as never, null as never, null as never, null as never, null as never);
      const workflow = new WorkflowsService(db as never, null as never, null as never, null as never, recurring, null as never);
      const checkSigning = () => withProjectWrite(db as never, first, { projectId: parent.projectId }, tx =>
        reviews['resolveVisualDeltaRecurringPlan'](tx, parent.projectId, parent.id));
      await expect(checkSigning()).rejects.toMatchObject({ status: 409 });
      await expect(withProjectWrite(db as never, first, { projectId: parent.projectId }, tx =>
        workflow['assertMonthlyReviewPeriodsCompleted'](tx, parent))).rejects.toMatchObject({ status: 409 });
      expect(await db.recurringPlan.findUniqueOrThrow({ where: { id: planId }, include: { tasks: { orderBy: { periodIndex: 'asc' } } } })).toEqual(before);
    },
  );

});
