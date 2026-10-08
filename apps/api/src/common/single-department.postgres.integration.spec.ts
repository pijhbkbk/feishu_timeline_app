import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { UsersService } from '../modules/users/users.service';
import { PersonnelService } from '../modules/personnel/personnel.service';
import { ProjectAccessService } from '../modules/auth/project-access.service';
import { ActivityLogsService } from '../modules/activity-logs/activity-logs.service';
import { WorkflowsService } from '../modules/workflows/workflows.service';
import { WorkflowDeadlineService } from '../modules/workflows/workflow-deadline.service';
import { ProjectsService } from '../modules/projects/projects.service';
import { ApprovedReportService } from '../modules/projects/approved-report.service';
import { R26OrdinaryCompletionService } from '../modules/r26-read-model/r26-ordinary-completion.service';
import { R26MemberAssignmentService } from '../modules/r26-read-model/r26-member-assignment.service';
import { SamplesService } from '../modules/samples/samples.service';
import type { AuthenticatedUser } from '../modules/auth/auth.types';

const url = process.env.SINGLE_DEPARTMENT_TEST_DATABASE_URL;
const run = randomUUID();

// Real database/service/transaction coverage. CLEAN metadata below is an explicit
// fixture; this suite does not claim an HTTP upload or real scanner acceptance.
describe.skipIf(!url).sequential('single department real PostgreSQL', () => {
  const db = new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
  const users = new UsersService(db as never);
  const personnel = new PersonnelService(db as never);
  const access = new ProjectAccessService(db as never);
  const logs = new ActivityLogsService(db as never, access);
  const workflows = new WorkflowsService(db as never, logs, {} as never, new WorkflowDeadlineService(), {} as never, access);
  const projects = new ProjectsService(db as never, workflows, logs, access);
  const completion = new R26OrdinaryCompletionService(db as never, access, new R26MemberAssignmentService(db as never, logs), workflows, logs);
  const reports = new ApprovedReportService(db as never, workflows);
  const samples = new SamplesService(db as never, logs, { toAttachmentSummary: (value: unknown) => value } as never, workflows, access);
  let administrator: AuthenticatedUser;
  let memberA: AuthenticatedUser;
  let memberB: AuthenticatedUser;
  let outsider: AuthenticatedUser;
  let projectId: string;
  let sampleId: string;
  let reportCommand: Parameters<ApprovedReportService['register']>[1];
  let confirmationCommand: Record<string, unknown>;
  const active = (nodeCode: 'PROJECT_INITIATION' | 'PAINT_DEVELOPMENT' | 'SAMPLE_COLOR_CONFIRMATION') => db.workflowTask.findFirstOrThrow({ where: { projectId, nodeCode, isActive: true } });
  const cleanFixture = (taskId: string, materialType: string) => db.attachment.create({ data: { projectId, entityType: 'WORKFLOW_TASK', entityId: taskId, bucket: 'm1-synthetic-fixture', storageKey: `synthetic/${randomUUID()}`, fileName: '合成测试.pdf', mimeType: 'application/pdf', fileSize: 20, checksum: 'a'.repeat(64), scanStatus: 'CLEAN', materialType, uploadedById: memberA.id, scannerEngine: 'TEST_FIXTURE_NOT_UPLOAD' } });

  beforeAll(async () => {
    const parsed = new URL(url!);
    if (parsed.hostname !== '127.0.0.1' || !/^\/(m1_|single_department_)/.test(parsed.pathname)) throw new Error('M1 requires a dedicated loopback synthetic database.');
    const admin = await db.user.create({ data: { username: `m1-admin-${run}`, name: '合成准入管理员', isSystemAdmin: true } });
    administrator = (await users.getAuthenticatedUser(admin.id, 'local'))!;
    const createMember = async (label: string) => {
      const user = await db.user.create({ data: { username: `m1-${label}-${run}`, name: `合成工艺成员${label}`, localCredential: { create: { loginName: `m1-${label}-${run}`, passwordHash: 'synthetic-service-test-not-a-login-password' } } } });
      await personnel.change(administrator, user.id, { teamAccessApproved: true, expectedVersion: user.updatedAt.toISOString(), requestId: randomUUID(), reason: 'M1合成准入回归' });
      return (await users.getAuthenticatedUser(user.id, 'local'))!;
    };
    memberA = await createMember('A'); memberB = await createMember('B');
    const user = await db.user.create({ data: { username: `m1-outside-${run}`, name: '未获准合成账号' } });
    outsider = (await users.getAuthenticatedUser(user.id, 'local'))!;
  });
  afterAll(async () => { await db.$disconnect(); });

  it('never grants admission to an account merely created in the existing directory', async () => {
    expect(outsider.teamAccessApproved).toBe(false);
    await expect(projects.createProject({ name: '未获准建项' }, outsider, randomUUID())).rejects.toThrow('尚未获准');
    expect(memberA.roleCodes).toEqual([]); expect(memberB.roleCodes).toEqual([]);
  });
  it('creates a draft with a real 01 task and blocks direct completion before approved report facts', async () => {
    const project = await projects.createProject({ name: `M1合成暖灰${run}` }, memberA, randomUUID()) as unknown as { id: string; status: string }; projectId = project.id;
    expect(project.status).toBe('DRAFT');
    const task = await active('PROJECT_INITIATION');
    await expect(workflows.transitionTask(task.id, 'COMPLETE', memberB, { comment: '不可绕过报告' })).rejects.toThrow('对应业务接口');
  });
  it('rejects stale versions and foreign attachment ids before any transition', async () => {
    const task = await active('PROJECT_INITIATION'); const file = await cleanFixture(task.id, 'approved-development-report');
    reportCommand = { taskId: task.id, taskVersion: task.updatedAt.toISOString(), reportAttachmentId: file.id, approvedReportDate: '2026-09-18', approvalReference: 'M1-合成已批准报告', demandSource: '实际录入的合成市场需求', idempotencyKey: randomUUID() };
    await expect(reports.register(projectId, { ...reportCommand, taskVersion: '2026-01-01T00:00:00.000Z' }, memberA)).rejects.toThrow('进度已变化');
    await expect(reports.register(projectId, { ...reportCommand, reportAttachmentId: 'foreign-file' }, memberA)).rejects.toThrow('安全扫描通过');
    expect(await db.developmentReport.count({ where: { projectId } })).toBe(0);
  });
  it('registers real report facts through 01 and 02 and replays without duplicated history', async () => {
    const result = await reports.register(projectId, reportCommand, memberA);
    const again = await reports.register(projectId, reportCommand, memberA);
    expect(again.idempotentReplay).toBe(true); expect((again as { taskId: string }).taskId).toBe((result as { taskId: string }).taskId);
    expect(await db.developmentReport.count({ where: { projectId } })).toBe(1);
    expect(await db.project.findUnique({ where: { id: projectId } })).toMatchObject({ currentNodeCode: 'PAINT_DEVELOPMENT', approvedReportDate: new Date('2026-09-18T00:00:00.000Z'), approvalReference: reportCommand.approvalReference });
    expect(await db.workflowTask.count({ where: { projectId, nodeCode: { in: ['PROJECT_INITIATION', 'DEVELOPMENT_REPORT'] }, status: 'COMPLETED' } })).toBe(2);
  });
  it('requires actual 03 sample facts and serializes duplicate sample creation', async () => {
    const task = await active('PAINT_DEVELOPMENT');
    const beforeFacts = await completion.previewCompletion(task.id, { taskVersion: task.updatedAt.toISOString() }, memberB);
    expect(beforeFacts.canComplete).toBe(false);
    expect(JSON.stringify(beforeFacts.blockingReasons)).toContain('本轮有效记录');
    const command = { taskId: task.id, taskVersion: task.updatedAt.toISOString(), idempotencyKey: randomUUID(), sampleNo: `M1-${run}`, sampleName: '实际合成样板', producedAt: '2026-09-19T00:00:00.000Z', remark: '合成实际开发记录' };
    const results = await Promise.all([samples.createSample(projectId, command, memberA), samples.createSample(projectId, command, memberA)]);
    expect(results.filter(result => result.idempotentReplay)).toHaveLength(1);
    const sample = await db.sample.findFirstOrThrow({ where: { projectId } }); sampleId = sample.id;
    expect(await db.sample.count({ where: { projectId } })).toBe(1);
    const facts = await samples.getWorkspace(projectId, memberB, task.id);
    expect(facts).toMatchObject({ taskFacts: { samples: [{ id: sampleId }] } });
    await expect(samples.getWorkspace(projectId, memberB, 'foreign-task')).rejects.toThrow('不存在');
    await completion.completeTask(task.id, { taskVersion: task.updatedAt.toISOString(), idempotencyKey: randomUUID(), completionReason: '样板实际开发事实已录入', acknowledgedConsequences: true }, memberB, randomUUID());
    expect((await active('SAMPLE_COLOR_CONFIRMATION')).assigneeUserId).not.toBe(memberB.id);
  });
  it('requires current clean confirmation material and preserves data on a stale write', async () => {
    const task = await active('SAMPLE_COLOR_CONFIRMATION'); const file = await cleanFixture(task.id, 'sample-confirmation-proof');
    confirmationCommand = { taskId: task.id, taskVersion: task.updatedAt.toISOString(), sampleId, idempotencyKey: randomUUID(), actualConfirmedAt: '2026-09-20', confirmationParty: '实际营销确认方', confirmationAttachmentId: file.id, decision: 'APPROVE', comment: '颜色确认通过' };
    await expect(samples.submitConfirmation(projectId, { ...confirmationCommand, confirmationAttachmentId: 'foreign-file' }, memberB)).rejects.toThrow('安全扫描通过');
    await expect(samples.submitConfirmation(projectId, { ...confirmationCommand, taskVersion: '2026-01-01T00:00:00.000Z' }, memberB)).rejects.toThrow('工序版本');
    expect(await db.sampleConfirmation.count({ where: { projectId } })).toBe(0);
  });
  it('records another admitted author, actual date and material, with no duplicate parallel tasks on replay', async () => {
    await samples.submitConfirmation(projectId, confirmationCommand, memberB);
    const facts = await samples.getWorkspace(projectId, memberA, confirmationCommand.taskId as string);
    expect(facts).toMatchObject({ taskFacts: { confirmations: [{ sampleId, taskId: confirmationCommand.taskId, confirmationParty: '实际营销确认方', confirmedById: memberB.id }] } });
    const again = await samples.submitConfirmation(projectId, confirmationCommand, memberB);
    expect(again.idempotentReplay).toBe(true);
    expect(await db.sampleConfirmation.findFirst({ where: { projectId } })).toMatchObject({ confirmedById: memberB.id, actualConfirmedAt: new Date('2026-09-20T00:00:00.000Z'), confirmationParty: '实际营销确认方', confirmationAttachmentId: confirmationCommand.confirmationAttachmentId });
    expect(await db.workflowTask.count({ where: { projectId, isActive: true, nodeCode: { in: ['COLOR_NUMBERING', 'PAINT_PROCUREMENT'] } } })).toBe(2);
    const detail = await samples.getSampleDetail(projectId, sampleId, memberA);
    expect(detail.confirmations[0]).toMatchObject({ taskId: confirmationCommand.taskId, actualConfirmedAt: '2026-09-20T00:00:00.000Z', confirmedById: memberB.id });
  });
  it('revokes admission without changing identity, historical authors or project foreign keys', async () => {
    const before = await db.user.findUniqueOrThrow({ where: { id: memberB.id } });
    await personnel.change(administrator, memberB.id, { teamAccessApproved: false, expectedVersion: before.updatedAt.toISOString(), requestId: randomUUID(), reason: '合成撤权负向' });
    const fresh = (await users.getAuthenticatedUser(memberB.id, 'local'))!;
    expect(fresh.id).toBe(memberB.id); expect(fresh.authVersion).toBe((memberB.authVersion ?? 0) + 1);
    await expect(projects.getProjectDetail(projectId, fresh)).rejects.toThrow('尚未获准');
    await expect(samples.submitConfirmation(projectId, confirmationCommand, memberB)).rejects.toThrow('授权已变化');
    expect((await db.sampleConfirmation.findFirstOrThrow({ where: { projectId } })).confirmedById).toBe(memberB.id);
  });
});
