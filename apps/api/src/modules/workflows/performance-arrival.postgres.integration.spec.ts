import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ProjectAccessService } from '../auth/project-access.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { PaintProcurementsService } from '../paint-procurements/paint-procurements.service';
import { PerformanceTestsService } from '../performance-tests/performance-tests.service';
import { TaskRemindersService } from '../notifications/task-reminders.service';
import { WorkflowsService } from './workflows.service';
import { WorkflowDeadlineService } from './workflow-deadline.service';
import { WorkflowRecurringService } from './workflow-recurring.service';
import { readPerformanceArrivalAnchor } from './performance-arrival-anchor';

const url = process.env.PERFORMANCE_ARRIVAL_TEST_DATABASE_URL;
describe.skipIf(!url).sequential('A13 arrival anchor on dedicated synthetic PostgreSQL', () => {
  const db = new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
  const access = new ProjectAccessService(db as never);
  const audit = new ActivityLogsService(db as never, access);
  const deadlines = new WorkflowDeadlineService();
  const workflow = new WorkflowsService(db as never, audit, {} as never, deadlines, new WorkflowRecurringService(), access);
  const procurement = new PaintProcurementsService(db as never, audit, workflow, access);
  const performance = new PerformanceTestsService(db as never, audit, {} as never, workflow, access);
  let actor: AuthenticatedUser;
  let supplierId: string;

  beforeAll(async () => {
    const target = new URL(url!);
    if (target.hostname !== '127.0.0.1' || target.port !== '55461' || target.pathname !== '/v1_performance_20261020') {
      throw new Error('Only the dedicated A13 synthetic database is allowed.');
    }
    for (const code of ['quality_engineer', 'process_engineer', 'production_operator']) {
      await db.role.upsert({ where: { code }, create: { code, name: `合成${code}` }, update: {} });
    }
    // Deliberately retain an installed legacy definition to prove new task dates
    // come from the new frozen rule, without rewriting existing catalog rows.
    await db.workflowNodeDefinition.upsert({ where: { nodeCode: 'PERFORMANCE_TEST' },
      create: { nodeCode: 'PERFORMANCE_TEST', name: '合成性能反馈', sequence: 90, durationType: 'MONTH_OFFSET', durationValue: 4, isBlocking: false }, update: {} });
    const user = await db.user.create({ data: { username: `a13-${randomUUID()}`, name: '合成A13维护员', teamAccessApproved: true } });
    actor = { id: user.id, username: user.username!, name: user.name, email: null, departmentId: null, departmentName: null,
      isSystemAdmin: false, teamAccessApproved: true, authSource: 'local', authVersion: user.authVersion, roleCodes: [] };
    supplierId = (await db.supplier.create({ data: { supplierCode: `SYNTH-${randomUUID()}`, supplierName: '合成A13供应商' } })).id;
  });
  afterAll(async () => { await db.$disconnect(); });

  async function fixture(taskRound = 1) {
    const project = await db.project.create({ data: { code: `A13-${randomUUID()}`, name: '合成A13到货试验', status: 'IN_PROGRESS', currentNodeCode: 'PAINT_PROCUREMENT' } });
    const instance = await db.workflowInstance.create({ data: { projectId: project.id, instanceNo: randomUUID(), status: 'RUNNING', currentNodeCode: 'PAINT_PROCUREMENT' } });
    const task = await db.workflowTask.create({ data: { projectId: project.id, workflowInstanceId: instance.id, taskNo: randomUUID(),
      nodeCode: 'PAINT_PROCUREMENT', nodeName: '合成采购', taskRound, status: 'READY', isActive: true, isPrimary: true,
      payload: { formData: { syntheticNote: '保留原采购表单' } } } });
    return { project, instance, task };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  async function ordered(f: Fixture, date: string | null) {
    const code = `PO-${randomUUID()}`;
    await procurement.createProcurement(f.project.id, { supplierId, procurementCode: code, materialName: '合成涂料', batchNo: 'SYNTH-BATCH', quantity: '10', unit: 'KG', arrivalDate: date }, actor);
    const record = await db.paintProcurement.findUniqueOrThrow({ where: { projectId_procurementCode: { projectId: f.project.id, procurementCode: code } } });
    await procurement.orderProcurement(f.project.id, record.id, actor);
    return record;
  }
  const taskRead = (id: string) => db.workflowTask.findUniqueOrThrow({ where: { id } });

  it('persists undated DRAFT/ORDERED and rejects arrival and completion without inventing facts', async () => {
    const f = await fixture();
    const record = await ordered(f, null);
    expect(await db.paintProcurement.findUniqueOrThrow({ where: { id: record.id } })).toMatchObject({ status: 'ORDERED', arrivalDate: null });
    await expect(procurement.markArrived(f.project.id, record.id, actor)).rejects.toThrow('实际到货日期');
    await expect(procurement.completeTask(f.project.id, actor)).rejects.toThrow('没有已到货');
    expect(await db.workflowTask.count({ where: { projectId: f.project.id } })).toBe(1);
    expect(readPerformanceArrivalAnchor((await taskRead(f.task.id)).payload)).toBeNull();
  });

  it.each([
    ['2026-08-31', '2027-02-28'], ['2027-08-31', '2028-02-29'],
    ['2026-03-31', '2026-09-30'], ['2026-09-23', '2027-03-23'],
  ])('freezes actual %s + six calendar months as %s and keeps three parallel branches', async (arrival, expectedDay) => {
    const f = await fixture();
    const record = await ordered(f, arrival);
    await procurement.markArrived(f.project.id, record.id, actor);
    const anchor = readPerformanceArrivalAnchor((await taskRead(f.task.id)).payload)!;
    expect((await taskRead(f.task.id)).payload).toMatchObject({ formData: { syntheticNote: '保留原采购表单' } });
    expect(anchor).toMatchObject({ procurementTaskId: f.task.id, procurementId: record.id, arrivalDate: `${arrival}T00:00:00.000Z`, dueAt: `${expectedDay}T15:59:59.999Z` });
    expect(await db.workflowTask.count({ where: { projectId: f.project.id } })).toBe(1);
    await procurement.completeTask(f.project.id, actor);
    const tasks = await db.workflowTask.findMany({ where: { projectId: f.project.id, isActive: true } });
    expect(tasks.map(task => task.nodeCode).sort()).toEqual(['FIRST_UNIT_PRODUCTION_PLAN', 'PERFORMANCE_TEST', 'STANDARD_BOARD_PRODUCTION'].sort());
    const feedback = tasks.find(task => task.nodeCode === 'PERFORMANCE_TEST')!;
    expect(feedback).toMatchObject({ isPrimary: false, dueAt: new Date(anchor.dueAt), effectiveDueAt: new Date(anchor.dueAt) });
    expect(readPerformanceArrivalAnchor(feedback.payload)).toEqual(anchor);
    const firstUnit = tasks.find(task => task.nodeCode === 'FIRST_UNIT_PRODUCTION_PLAN')!;
    await workflow.transitionTask(firstUnit.id, 'START', actor, {});
    expect((await taskRead(firstUnit.id)).status).toBe('IN_PROGRESS');
    expect((await taskRead(feedback.id)).status).toBe('READY');
  });

  it('does not reset the first arrival on subsequent or backdated deliveries', async () => {
    const f = await fixture();
    const first = await ordered(f, '2026-08-31');
    await procurement.markArrived(f.project.id, first.id, actor);
    const initialTask = await taskRead(f.task.id);
    for (const date of ['2026-09-30', '2026-08-01']) {
      const next = await ordered(f, date);
      await procurement.markArrived(f.project.id, next.id, actor);
      expect(await taskRead(f.task.id)).toEqual(initialTask);
    }
    expect(await db.auditLog.count({ where: { targetId: f.task.id, action: 'PERFORMANCE_ARRIVAL_ANCHOR_RECORDED' } })).toBe(1);
  });

  it('serializes concurrent deliveries into exactly one immutable anchor', async () => {
    const f = await fixture();
    const records = [await ordered(f, '2026-08-31'), await ordered(f, '2026-09-30')];
    await Promise.all(records.map(record => procurement.markArrived(f.project.id, record.id, actor)));
    const anchor = readPerformanceArrivalAnchor((await taskRead(f.task.id)).payload)!;
    expect(records.map(record => record.id)).toContain(anchor.procurementId);
    expect(await db.auditLog.count({ where: { targetId: f.task.id, action: 'PERFORMANCE_ARRIVAL_ANCHOR_RECORDED' } })).toBe(1);
    expect(await db.paintProcurement.count({ where: { projectId: f.project.id, status: 'ARRIVED' } })).toBe(2);
  });

  it('rolls back an arrival and its audit when no current-round creation evidence exists', async () => {
    const f = await fixture();
    const record = await db.paintProcurement.create({ data: { projectId: f.project.id, procurementCode: randomUUID(), status: 'ORDERED', arrivalDate: new Date('2026-09-01T00:00:00Z') } });
    await expect(procurement.markArrived(f.project.id, record.id, actor)).rejects.toThrow('创建与实际到货依据');
    expect(await db.paintProcurement.findUniqueOrThrow({ where: { id: record.id } })).toEqual(record);
    expect(await taskRead(f.task.id)).toEqual(f.task);
    expect(await db.auditLog.count({ where: { projectId: f.project.id } })).toBe(0);
  });

  it('reconstructs an active legacy anchor only from explicit current-round creation and arrival audit, preserving source rows', async () => {
    const f = await fixture();
    const record = await ordered(f, '2026-09-23');
    const arrived = await db.paintProcurement.update({ where: { id: record.id }, data: { status: 'ARRIVED' } });
    await db.auditLog.create({ data: { projectId: f.project.id, targetType: 'PAINT_PROCUREMENT', targetId: record.id,
      action: 'PAINT_PROCUREMENT_ARRIVED', beforeData: { status: 'ORDERED' }, afterData: { id: record.id, status: 'ARRIVED', arrivalDate: arrived.arrivalDate!.toISOString() } } });
    const history = await db.auditLog.findMany({ where: { projectId: f.project.id }, orderBy: { id: 'asc' } });
    await procurement.completeTask(f.project.id, actor);
    expect(await db.paintProcurement.findUniqueOrThrow({ where: { id: record.id } })).toEqual(arrived);
    expect(await db.auditLog.findMany({ where: { id: { in: history.map(row => row.id) } }, orderBy: { id: 'asc' } })).toEqual(history);
    expect(readPerformanceArrivalAnchor((await taskRead(f.task.id)).payload)?.procurementId).toBe(record.id);
  });

  it('does not reuse older-round arrival or rewrite completed tasks and performance history', async () => {
    const f = await fixture(2);
    const oldTask = await db.workflowTask.create({ data: { projectId: f.project.id, workflowInstanceId: f.instance.id, taskNo: randomUUID(),
      nodeCode: 'PAINT_PROCUREMENT', nodeName: '合成旧轮次', taskRound: 1, status: 'COMPLETED', isActive: false,
      completedAt: new Date('2025-01-02T00:00:00Z') } });
    const oldRecord = await db.paintProcurement.create({ data: { projectId: f.project.id, procurementCode: randomUUID(), status: 'ARRIVED', arrivalDate: new Date('2025-01-01T00:00:00Z') } });
    const oldTest = await db.performanceTest.create({ data: { projectId: f.project.id, testCode: randomUUID(), testItem: 'GLOSS', status: 'SUBMITTED', conclusion: '合成旧结论', paintProcurementId: oldRecord.id } });
    await db.auditLog.create({ data: { projectId: f.project.id, targetType: 'PAINT_PROCUREMENT', targetId: oldRecord.id, action: 'PAINT_PROCUREMENT_CREATED', metadata: { workflowTaskId: oldTask.id }, afterData: { id: oldRecord.id } } });
    await db.auditLog.create({ data: { projectId: f.project.id, targetType: 'PAINT_PROCUREMENT', targetId: oldRecord.id, action: 'PAINT_PROCUREMENT_ARRIVED', beforeData: { status: 'ORDERED' }, afterData: { id: oldRecord.id, status: 'ARRIVED', arrivalDate: oldRecord.arrivalDate!.toISOString() } } });
    await expect(procurement.completeTask(f.project.id, actor)).rejects.toThrow('创建与实际到货依据');
    expect(await taskRead(f.task.id)).toEqual(f.task);
    const current = await ordered(f, '2026-09-23');
    await procurement.markArrived(f.project.id, current.id, actor);
    await procurement.completeTask(f.project.id, actor);
    expect(readPerformanceArrivalAnchor((await taskRead(f.task.id)).payload)?.procurementId).toBe(current.id);
    expect(await taskRead(oldTask.id)).toEqual(oldTask);
    expect(await db.paintProcurement.findUniqueOrThrow({ where: { id: oldRecord.id } })).toEqual(oldRecord);
    expect(await db.performanceTest.findUniqueOrThrow({ where: { id: oldTest.id } })).toEqual(oldTest);
  });

  it('links new performance evidence to the anchored purchase and reminder reads the persisted due date', async () => {
    const f = await fixture();
    const record = await ordered(f, '2026-09-23');
    await procurement.markArrived(f.project.id, record.id, actor);
    await procurement.completeTask(f.project.id, actor);
    const feedback = await db.workflowTask.findFirstOrThrow({ where: { projectId: f.project.id, nodeCode: 'PERFORMANCE_TEST', isActive: true } });
    await performance.createTest(f.project.id, { testCode: `PERF-${randomUUID()}`, sampleId: null, relatedObjectName: '合成批次', testItem: 'GLOSS',
      standardValue: '80', actualValue: '81', result: 'PASS', conclusion: '合成结论', testedById: actor.id, testedAt: '2027-03-23' }, actor);
    expect(await db.performanceTest.findFirstOrThrow({ where: { projectId: f.project.id } })).toMatchObject({ paintProcurementId: record.id });
    const reminders = new TaskRemindersService(db as never);
    expect(await reminders.target(db as never, 'ordinary', feedback.id, new Date('2027-03-23T00:00:00Z')))
      .toMatchObject({ dueAt: new Date('2027-03-23T15:59:59.999Z') });
    await deadlines.refreshWorkflowInstanceTaskDeadlines(db as never, f.instance.id, new Date('2028-01-01T00:00:00Z'));
    expect((await taskRead(feedback.id)).dueAt).toEqual(feedback.dueAt);
    await db.workflowTask.update({ where: { id: feedback.id }, data: { isActive: false, status: 'COMPLETED' } });
    expect(await reminders.target(db as never, 'ordinary', feedback.id, new Date('2028-01-01T00:00:00Z'))).toBeNull();
    expect((await taskRead(feedback.id)).payload).toEqual(feedback.payload);
  });
});
