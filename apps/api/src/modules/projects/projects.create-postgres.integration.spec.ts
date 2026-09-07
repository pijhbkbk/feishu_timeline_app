import 'reflect-metadata';

import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient, UserStatus } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ProjectAccessService } from '../auth/project-access.service';
import { WorkflowDeadlineService } from '../workflows/workflow-deadline.service';
import { WorkflowsService } from '../workflows/workflows.service';
import { ProjectsService } from './projects.service';

const databaseUrl = process.env.PROJECTS_POSTGRES_TEST_DATABASE_URL;

describe.skipIf(!databaseUrl).sequential('project creation with real workflow and audit transactions', () => {
  let db: PrismaClient;
  let waiter: PrismaClient;
  let actor: AuthenticatedUser;
  const runId = randomUUID();
  const waiterName = `rc2-waiter-${runId}`;

  function services(client = db) {
    const access = new ProjectAccessService(client as never);
    const audit = new ActivityLogsService(client as never, access);
    const workflow = new WorkflowsService(
      client as never,
      audit,
      { enqueueTaskNotification: vi.fn().mockResolvedValue(undefined) } as never,
      new WorkflowDeadlineService(),
      {} as never,
      access,
    );
    return { workflow, audit, projects: new ProjectsService(client as never, workflow, audit, access) };
  }

  function input(label: string) {
    return { name: `RC2 ${label} ${runId}`, ownerUserId: actor.id, members: [] };
  }

  function resultId(result: unknown): string {
    expect(result).toMatchObject({ id: expect.any(String) });
    return (result as { id: string }).id;
  }

  async function assertPersisted(projectId: string, key: string) {
    expect(await db.project.findUnique({ where: { id: projectId } })).toMatchObject({ ownerUserId: actor.id });
    expect(await db.projectCreateCommandRequest.count({ where: { actorUserId: actor.id, idempotencyKey: key } })).toBe(1);
    expect(await db.workflowInstance.count({ where: { projectId } })).toBe(1);
    expect(await db.workflowTask.count({ where: { projectId } })).toBe(1);
    expect(await db.workflowTransition.count({ where: { projectId } })).toBe(1);
    const audit = await db.auditLog.findMany({ where: { projectId }, orderBy: { action: 'asc' } });
    expect(audit.map((row) => row.action)).toEqual(['PROJECT_CREATED', 'WORKFLOW_INITIALIZED']);
  }

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
    const secondUrl = new URL(databaseUrl!);
    secondUrl.searchParams.set('application_name', waiterName);
    waiter = new PrismaClient({ datasources: { db: { url: secondUrl.toString() } } });
    await Promise.all([db.$connect(), waiter.$connect()]);
    const user = await db.user.create({ data: { username: `rc2_${runId}`, name: 'RC2 local fixture', status: UserStatus.ACTIVE } });
    actor = { id: user.id, username: user.username, name: user.name, email: null, departmentId: null, departmentName: null, isSystemAdmin: false, authSource: 'mock', roleCodes: ['project_manager'], permissionCodes: ['project.write', 'project.read'] };
  });

  afterAll(async () => {
    await Promise.all([db?.$disconnect(), waiter?.$disconnect()]);
  });

  it('persists project, workflow, task, transition and both audit records', async () => {
    const key = randomUUID();
    const result = await services().projects.createProject(input('complete path'), actor, key);
    expect(result.idempotentReplay).toBe(false);
    await assertPersisted(resultId(result), key);
  });

  it('waits for the same key in PostgreSQL and replays without duplicate business rows', async () => {
    const key = randomUUID();
    const request = input('concurrent');
    const firstServices = services();
    const initialize = firstServices.workflow.initializeProjectWorkflow.bind(firstServices.workflow);
    let initialized = false;
    let signalReady!: () => void;
    let release!: () => void;
    const ready = new Promise<void>((resolve) => { signalReady = resolve; });
    const held = new Promise<void>((resolve) => { release = resolve; });
    vi.spyOn(firstServices.workflow, 'initializeProjectWorkflow').mockImplementationOnce(async (...args) => {
      const result = await initialize(...args);
      initialized = true;
      signalReady();
      await held;
      return result;
    });
    const first = firstServices.projects.createProject(request, actor, key);
    const firstOutcome = Promise.allSettled([first]);
    void first.catch(() => signalReady());
    await ready;
    if (!initialized) {
      await firstOutcome;
      await first;
      throw new Error('workflow initialization did not complete');
    }
    const second = services(waiter).projects.createProject(request, actor, key);
    const outcomes = Promise.allSettled([first, second]);
    try {
      await expect.poll(async () => {
        const rows = await db.$queryRaw<Array<{ blocked: boolean }>>(Prisma.sql`
          SELECT EXISTS (
            SELECT 1 FROM pg_stat_activity
            WHERE application_name = ${waiterName}
              AND wait_event_type = 'Lock' AND wait_event = 'advisory'
          ) AS blocked
        `);
        return rows[0]?.blocked;
      }, { timeout: 2000, interval: 20 }).toBe(true);
    } finally {
      release();
      await outcomes;
    }
    const [created, replay] = await Promise.all([first, second]);
    expect(created.idempotentReplay).toBe(false);
    expect(replay).toMatchObject({ id: resultId(created), idempotentReplay: true });
    await assertPersisted(resultId(created), key);
    expect(await db.project.count({ where: { name: request.name } })).toBe(1);
  });

  it('rejects conflicting replay and allows different keys to create distinct projects', async () => {
    const { projects } = services();
    const key = randomUUID();
    const request = input('independent keys');
    const first = await projects.createProject(request, actor, key);
    await expect(projects.createProject({ ...request, name: 'different payload' }, actor, key)).rejects.toMatchObject({ response: { statusCode: 409, code: 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST' } });
    const secondKey = randomUUID();
    const second = await projects.createProject(request, actor, secondKey);
    expect(resultId(second)).not.toBe(resultId(first));
    await assertPersisted(resultId(first), key);
    await assertPersisted(resultId(second), secondKey);
  });

  it('rolls back workflow and audit writes, releases the lock and permits a clean retry', async () => {
    const key = randomUUID();
    const request = input('rollback');
    const failing = services();
    const writeAudit = failing.audit.createWithExecutor.bind(failing.audit);
    const auditBefore = await db.auditLog.count({ where: { actorUserId: actor.id } });
    vi.spyOn(failing.audit, 'createWithExecutor').mockImplementation((...args) => {
      if (args[1].action === 'WORKFLOW_INITIALIZED') {
        throw new Error('intentional rollback after audit insert');
      }
      return writeAudit(...args);
    });
    await expect(failing.projects.createProject(request, actor, key)).rejects.toThrow('intentional rollback after audit insert');
    expect(await db.project.count({ where: { name: request.name } })).toBe(0);
    expect(await db.projectCreateCommandRequest.count({ where: { actorUserId: actor.id, idempotencyKey: key } })).toBe(0);
    expect(await db.auditLog.count({ where: { actorUserId: actor.id } })).toBe(auditBefore);
    const result = await services(waiter).projects.createProject(request, actor, key);
    await assertPersisted(resultId(result), key);
  });

  it('rejects an inactive owner without creating project or command rows', async () => {
    const key = randomUUID();
    const request = input('inactive owner');
    await db.user.update({ where: { id: actor.id }, data: { status: UserStatus.INACTIVE } });
    try {
      await expect(services().projects.createProject(request, actor, key)).rejects.toThrow();
      expect(await db.project.count({ where: { name: request.name } })).toBe(0);
      expect(await db.projectCreateCommandRequest.count({ where: { actorUserId: actor.id, idempotencyKey: key } })).toBe(0);
    } finally {
      await db.user.update({ where: { id: actor.id }, data: { status: UserStatus.ACTIVE } });
    }
  });
});
