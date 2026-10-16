import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { PrismaClient, type WorkflowNodeCode } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readEvidenceTask, taskEvidenceIds, ancestorEvidenceIds } from '../../common/workflow-evidence';
import { withProjectWrite, assertTeamTaskById } from '../../common/team-authorization';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { ProjectAccessService } from '../auth/project-access.service';
import { UsersService } from '../users/users.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { WorkflowsService } from './workflows.service';
import { WorkflowDeadlineService } from './workflow-deadline.service';
import { WorkflowRecurringService } from './workflow-recurring.service';
import { getWorkflowNextTaskTemplates } from './workflow-node.constants';

const url = process.env.R28_TEST_DATABASE_URL;
describe.skipIf(!url).sequential('14 rework on isolated PostgreSQL', () => {
  const db = new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
  const access = new ProjectAccessService(db as never);
  const service = new WorkflowsService(db as never, new ActivityLogsService(db as never, access), {} as never,
    new WorkflowDeadlineService(), new WorkflowRecurringService(), access);
  let actor: AuthenticatedUser;
  beforeAll(async () => {
    const target = new URL(url!);
    if (target.hostname !== '127.0.0.1' || target.port !== '55449' || target.pathname !== '/r28_recovered') throw new Error('Only isolated r28_recovered is allowed.');
    const role = await db.role.findUniqueOrThrow({ where: { code: 'reviewer' } });
    await db.rolePermission.upsert({ where: { roleId_permissionCode: { roleId: role.id, permissionCode: 'workflow.transition' } },
      create: { roleId: role.id, permissionCode: 'workflow.transition' }, update: {} });
    const name = `r28-rework-${randomUUID()}`;
    const user = await db.user.create({ data: { username: name, name: '合成返工评审人', userRoles: { create: { roleId: role.id } },
      localCredential: { create: { loginName: name, passwordHash: 'synthetic-not-a-login-hash' } } } });
    actor = (await new UsersService(db as never).getAuthenticatedUser(user.id, 'local'))!;
  });
  afterAll(async () => { if (actor) await db.user.update({ where: { id: actor.id }, data: { status: 'INACTIVE' } }); await db.$disconnect(); });
  async function fixture(feeCompleted = false) {
    const project = await db.project.create({ data: { code: randomUUID(), name: '合成14返工', status: 'IN_PROGRESS' } });
    const instance = await db.workflowInstance.create({ data: { projectId: project.id, instanceNo: randomUUID(), status: 'RUNNING' } });
    const task = async (nodeCode: WorkflowNodeCode, done = false) => db.workflowTask.create({ data: {
      projectId: project.id, workflowInstanceId: instance.id, taskNo: randomUUID(), nodeCode, nodeName: nodeCode,
      status: done ? 'COMPLETED' : 'READY', isActive: !done, isPrimary: nodeCode === 'COLOR_CONSISTENCY_REVIEW', assigneeUserId: actor.id,
      ...(done ? { completedAt: new Date('2026-09-01T00:00:00Z') } : {}),
    } });
    const source = await task('COLOR_CONSISTENCY_REVIEW');
    const old03 = await task('PAINT_DEVELOPMENT', true), old07 = await task('STANDARD_BOARD_PRODUCTION', true);
    const old08 = await task('BOARD_DETAIL_UPDATE'), old09 = await task('PERFORMANCE_TEST');
    const number = await task('COLOR_NUMBERING', true), fee = await task('DEVELOPMENT_ACCEPTANCE', feeCompleted);
    return { project, instance, source, old03, old07, old08, old09, number, fee };
  }
  const reject = (f: Awaited<ReturnType<typeof fixture>>) => withProjectWrite(db as never, actor, { projectId: f.project.id }, tx =>
    service.transitionTaskWithExecutor(tx, f.source.id, 'REJECT', actor, { comment: '合成配方返工' }, 'designated-review'));
  it.each([false, true])('cancels stale technical branches but preserves number and fee (completed=%s)', async completed => {
    const f = await fixture(completed);
    await reject(f);
    for (const old of [f.old08, f.old09]) expect(await db.workflowTask.findUniqueOrThrow({ where: { id: old.id } })).toMatchObject({ isActive: false, status: 'CANCELLED', assignmentEpoch: 1 });
    for (const old of [f.old03, f.old07]) {
      const result = await db.workflowTask.findUniqueOrThrow({ where: { id: old.id } });
      expect(result.status).toBe('COMPLETED'); expect(result.completedAt).toEqual(old.completedAt);
      expect(result.payload).toMatchObject({ rework: { invalidatedByTaskId: f.source.id, applicability: 'REQUIRES_REVIEW' } });
    }
    for (const old of [f.number, f.fee]) expect(await db.workflowTask.findUniqueOrThrow({ where: { id: old.id } })).toEqual(old);
    expect(await db.workflowTask.count({ where: { projectId: f.project.id, nodeCode: 'PAINT_DEVELOPMENT', isActive: true } })).toBe(1);
    await expect(reject(f)).rejects.toMatchObject({ status: 409 });
    await expect(withProjectWrite(db as never, actor, { taskId: f.old09.id }, tx => assertTeamTaskById(tx, f.old09.id, actor))).rejects.toMatchObject({ status: 409 });
  });
  it.each([false, true])('reuses the same 05 and 13 on repeat spawning, without resetting task or notifications (%s)', async completed => {
    const f = await fixture(completed);
    await reject(f);
    for (const [node, action, preserved] of [['SAMPLE_COLOR_CONFIRMATION', 'APPROVE', f.number], ['CAB_REVIEW', 'APPROVE', f.fee]] as const) {
      const source = { ...f.source, nodeCode: node };
      await db.$transaction(tx => (service as any).createNextTasks(tx, source, actor, action, {}, getWorkflowNextTaskTemplates(node, action).filter(t => t.nodeCode === preserved.nodeCode)));
      expect(await db.workflowTask.count({ where: { projectId: f.project.id, nodeCode: preserved.nodeCode } })).toBe(1);
      expect(await db.workflowTask.findUniqueOrThrow({ where: { id: preserved.id } })).toEqual(preserved);
      expect(await db.workflowTransition.count({ where: { fromTaskId: source.id, toTaskId: preserved.id } })).toBe(1);
    }
  });
  it('rolls back cancellation, metadata, new03, transitions and audit together', async () => {
    const f = await fixture();
    await expect(withProjectWrite(db as never, actor, { projectId: f.project.id }, async tx => {
      await service.transitionTaskWithExecutor(tx, f.source.id, 'REJECT', actor, { comment: '合成回滚' }, 'designated-review');
      throw new Error('injected-before-commit');
    })).rejects.toThrow('injected-before-commit');
    for (const row of [f.source, f.old03, f.old08, f.old09, f.number, f.fee]) expect(await db.workflowTask.findUniqueOrThrow({ where: { id: row.id } })).toEqual(row);
    expect(await db.workflowTask.count({ where: { projectId: f.project.id } })).toBe(7);
    expect(await db.auditLog.count({ where: { projectId: f.project.id } })).toBe(0);
    expect(await db.workflowTransition.count({ where: { projectId: f.project.id } })).toBe(0);
    await reject(f);
  });
  it('serializes duplicate rejections into one return and one new03', async () => {
    const f = await fixture();
    const results = await Promise.allSettled([reject(f), reject(f)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
    expect(await db.workflowTask.count({ where: { projectId: f.project.id, nodeCode: 'PAINT_DEVELOPMENT', isActive: true } })).toBe(1);
    expect(await db.auditLog.count({ where: { targetId: f.source.id, action: 'WORKFLOW_REJECT' } })).toBe(1);
  });
  it('bounds JSON chain identifiers and keeps project and workflow ancestry isolated', async () => {
    const f = await fixture();
    await db.workflowTask.update({ where: { id: f.source.id }, data: { payload: { fromTaskId: f.old07.id, supersedesTaskId: 'x'.repeat(128), unrelatedLegacyText: 'z'.repeat(300_000) } } });
    const source = await readEvidenceTask(db, f.project.id, f.source.id);
    expect(source?.payload).toEqual({ fromTaskId: f.old07.id, supersedesTaskId: 'x'.repeat(128) });
    expect(await readEvidenceTask(db, 'different-project', f.source.id)).toBeNull();
    expect(await readEvidenceTask(db, f.project.id, f.source.id, 'different-workflow')).toBeNull();
    await db.auditLog.create({ data: { projectId: f.project.id, targetType: 'STANDARD_BOARD', targetId: 'new-board', action: 'STANDARD_BOARD_CREATED', nodeCode: 'STANDARD_BOARD_PRODUCTION', metadata: { workflowTaskId: f.old07.id, evidenceKind: 'TASK_CREATED_RECORD' } } });
    expect(await ancestorEvidenceIds(db, source!, 'STANDARD_BOARD_PRODUCTION')).toEqual(['new-board']);
    for (const invalid of ['x'.repeat(129), 123, false]) {
      await db.workflowTask.update({ where: { id: f.source.id }, data: { payload: { fromTaskId: f.old07.id, supersedesTaskId: invalid } } });
      await expect(readEvidenceTask(db, f.project.id, f.source.id)).rejects.toMatchObject({ status: 409 });
    }
    await db.workflowTask.update({ where: { id: f.old07.id }, data: { payload: { fromTaskId: f.old07.id } } });
    await expect(ancestorEvidenceIds(db, source!, 'PAINT_PROCUREMENT')).rejects.toMatchObject({ status: 409 });
    expect(await ancestorEvidenceIds(db, { ...source!, workflowInstanceId: 'different-workflow' }, 'STANDARD_BOARD_PRODUCTION')).toEqual([]);
  });
  it('reads bounded exact-task audit IDs, rejects invalid JSON types and 1001 records', async () => {
    const f = await fixture();
    const data = { projectId: f.project.id, targetType: 'STANDARD_BOARD' as const, targetId: 'board-parent', action: 'COLOR_BOARD_DETAIL_UPDATE_CREATED', nodeCode: 'BOARD_DETAIL_UPDATE' as const };
    const metadata = { workflowTaskId: f.old08.id, evidenceKind: 'TASK_CREATED_RECORD', evidenceRecordId: 'd'.repeat(128) };
    const audit = await db.auditLog.create({ data: { ...data, metadata: { ...metadata, unrelatedLegacyText: 'z'.repeat(300_000) } } });
    expect(await taskEvidenceIds(db, f.project.id, f.old08.id)).toEqual(['d'.repeat(128)]);
    // Only synthetic fixtures are altered here; production audit facts are immutable.
    for (const value of ['d'.repeat(129), 123, false]) {
      await db.auditLog.update({ where: { id: audit.id }, data: { metadata: { ...metadata, evidenceRecordId: value } } });
      await expect(taskEvidenceIds(db, f.project.id, f.old08.id)).rejects.toMatchObject({ status: 409 });
    }
    await db.auditLog.update({ where: { id: audit.id }, data: { metadata: { ...metadata, evidenceRecordId: null } } });
    expect(await taskEvidenceIds(db, f.project.id, f.old08.id)).toEqual(['board-parent']);
    await db.auditLog.createMany({ data: [
      { ...data, nodeCode: 'STANDARD_BOARD_PRODUCTION', metadata },
      { ...data, action: 'STANDARD_BOARD_UPDATED', metadata },
      { ...data, metadata: { ...metadata, workflowTaskId: f.old07.id } },
      { ...data, projectId: null, metadata },
    ] });
    expect(await taskEvidenceIds(db, f.project.id, f.old08.id)).toEqual(['board-parent']);
    await db.auditLog.createMany({ data: Array.from({ length: 999 }, (_, i) => ({ ...data, targetId: `detail-${i}`, metadata: { workflowTaskId: f.old08.id, evidenceKind: 'TASK_CREATED_RECORD' } })) });
    expect(await taskEvidenceIds(db, f.project.id, f.old08.id)).toHaveLength(1000);
    await db.auditLog.create({ data: { ...data, metadata } });
    await expect(taskEvidenceIds(db, f.project.id, f.old08.id)).rejects.toMatchObject({ status: 409 });
  });
  it('does not admit a submitted old performance result as evidence for a new technical round', async () => {
    const f = await fixture();
    const old = await db.performanceTest.create({ data: { projectId: f.project.id, testCode: randomUUID(), testItem: 'GLOSS', status: 'SUBMITTED', result: 'PASS', createdAt: new Date('2026-09-01T00:00:00Z') } });
    await reject(f);
    const new03 = await db.workflowTask.findFirstOrThrow({ where: { projectId: f.project.id, nodeCode: 'PAINT_DEVELOPMENT', isActive: true } });
    const task = await db.workflowTask.create({ data: { projectId: f.project.id, workflowInstanceId: f.instance.id, taskNo: randomUUID(), nodeCode: 'PERFORMANCE_TEST', nodeName: '性能试验', payload: new03.payload! } });
    expect(await (service as any).getTechnicalReworkCompletionIssues(db, task)).toHaveLength(1);
    const fresh = await db.performanceTest.create({ data: { projectId: f.project.id, testCode: randomUUID(), testItem: 'GLOSS', status: 'SUBMITTED', result: 'PASS' } });
    await db.auditLog.create({ data: { projectId: f.project.id, targetType: 'PERFORMANCE_TEST', targetId: fresh.id, action: 'PERFORMANCE_TEST_CREATED', nodeCode: 'PERFORMANCE_TEST', metadata: { workflowTaskId: task.id, evidenceKind: 'TASK_CREATED_RECORD' } } });
    expect(await (service as any).getTechnicalReworkCompletionIssues(db, task)).toEqual([]);
    expect((await db.performanceTest.findUniqueOrThrow({ where: { id: old.id } })).createdAt).toEqual(old.createdAt);
    expect(fresh.id).not.toBe(old.id);
  });
});
