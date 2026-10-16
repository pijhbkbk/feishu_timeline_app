import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaService } from '../../infra/prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ProjectAccessService } from '../auth/project-access.service';
import { ColorRegisterService } from '../color-register/color-register.service';
import type { NotificationQueueService } from '../queue/notification-queue.service';
import { WorkflowsService } from '../workflows/workflows.service';
import { WorkflowDeadlineService } from '../workflows/workflow-deadline.service';
import { WorkflowRecurringService } from '../workflows/workflow-recurring.service';
import { StandardBoardsService } from './standard-boards.service';

const databaseUrl = process.env.COLOR_REGISTER_TEST_DATABASE_URL;

// This suite seeds a synthetic, already reached node07 stage. Approved-report
// project creation, uploads/scanning, HTTP authentication and browser behavior
// have separate tests. Authorization, SQL locks, transactions and audits here
// are the real services and PostgreSQL implementation, never mocked predicates.
describe.skipIf(!databaseUrl).sequential('node07 atomic color-register publication on PostgreSQL', () => {
  const run = randomUUID();
  let db: PrismaClient;
  let service: StandardBoardsService;
  let memberA: AuthenticatedUser;
  let memberB: AuthenticatedUser;
  let unapproved: AuthenticatedUser;
  let baseId: string;
  let hueId: string;
  const prisma = () => db as unknown as PrismaService;
  function resultText(value: unknown, field: string): string {
    if (!value || typeof value !== 'object' || !(field in value)) throw new Error(`Publication response missing ${field}`);
    const text = (value as Record<string, unknown>)[field];
    if (typeof text !== 'string' || !text) throw new Error(`Publication response has invalid ${field}`);
    return text;
  }

  function makeService(client = prisma()) {
    const access = new ProjectAccessService(client);
    const activity = new ActivityLogsService(client, access);
    // saveAndPublish must not advance the workflow. Fail if it starts calling
    // the unrelated workflow transition collaborator in this boundary test.
    const workflows = new Proxy({} as WorkflowsService, {
      get() { throw new Error('UNEXPECTED_WORKFLOW_TRANSITION_DURING_PUBLICATION'); },
    });
    return new StandardBoardsService(client, activity, workflows, access);
  }

  function makeWorkflowService() {
    const access = new ProjectAccessService(prisma());
    const notifications = new Proxy({} as NotificationQueueService, {
      get() { throw new Error('UNEXPECTED_NOTIFICATION_DURING_COMPLETION_INSPECTION'); },
    });
    return new WorkflowsService(prisma(), new ActivityLogsService(prisma(), access), notifications,
      new WorkflowDeadlineService(), new WorkflowRecurringService(), access);
  }

  async function fixture(label: string, existingColorId?: string) {
    const project = await db.project.create({ data: {
      code: `SYNTHETIC-07-${label}-${run}`, name: `合成制板标定 ${label}`,
      status: 'IN_PROGRESS', currentNodeCode: 'STANDARD_BOARD_PRODUCTION', ownerUserId: memberA.id,
    } });
    const color = existingColorId
      ? await db.color.findUniqueOrThrow({ where: { id: existingColorId } })
      : await db.color.create({ data: { projectId: project.id, name: `合成候选 ${label} ${run}`,
        productionBaseId: baseId, hueStandardId: hueId, registerStatus: 'CANDIDATE', isPrimary: true } });
    await db.project.update({ where: { id: project.id }, data: { primaryColorId: color.id } });
    const instance = await db.workflowInstance.create({ data: {
      projectId: project.id, instanceNo: `SYNTHETIC-INSTANCE-${label}-${run}`,
      status: 'RUNNING', currentNodeCode: 'STANDARD_BOARD_PRODUCTION', initiatedById: memberA.id,
    } });
    const procurement = await db.workflowTask.create({ data: {
      workflowInstanceId: instance.id, projectId: project.id, taskNo: `SYNTHETIC-06-${label}-${run}`,
      nodeCode: 'PAINT_PROCUREMENT', nodeName: '合成已完成采购前置',
      status: 'COMPLETED', isActive: false, assigneeUserId: memberA.id,
      completedAt: new Date('2025-01-01T00:00:00.000Z'), payload: { syntheticPrecondition: true },
    } });
    const task = await db.workflowTask.create({ data: {
      workflowInstanceId: instance.id, projectId: project.id, taskNo: `SYNTHETIC-07-${label}-${run}`,
      nodeCode: 'STANDARD_BOARD_PRODUCTION', nodeName: '合成制板标定',
      status: 'IN_PROGRESS', isActive: true, assigneeUserId: memberA.id,
      payload: { preservedNodeRecord: '不覆盖原有节点内容' },
    } });
    const sample = await db.sample.create({ data: {
      projectId: project.id, colorId: color.id, sampleNo: `SYNTHETIC-${label}`,
      sampleName: `合成样板 ${label}`, status: 'CONFIRMED', confirmedAt: new Date('2025-01-01T00:00:00.000Z'),
    } });
    return { project, color, instance, procurement, task, sample };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  const command = (value: Fixture) => ({
    taskId: value.task.id, taskVersion: value.task.updatedAt.toISOString(),
    expectedColorRevision: value.color.registerRevision, idempotencyKey: randomUUID(),
    boardCode: '合成色板 / 07', basedOnSampleId: value.sample.id, remark: '真实事务的合成制板记录',
    producedAt: '2025-01-02', registerMonth: null,
    technicalData: {
      measurements: [
        { angle: 15, l: 85.4, a: null, b: '', originalControlLimits: '原控制限 ±0.5' },
        { angle: 45, l: 82.1, a: 0, b: -0.4, originalControlLimits: null },
      ],
      conditions: '合成测量 D65 / 10°', originalControlLimits: '保留文本，不推算',
      measurementDate: null, issueDate: '', expiryDate: null,
      manufacturer: '合成制作单位', paintType: '合成漆种', changeSummary: null,
    },
  });

  async function snapshot(value: Fixture, client: Prisma.TransactionClient | PrismaClient = db) {
    const [project, color, instance, task, procurement, boards, versions, audits, commands, distributions] = await Promise.all([
      client.project.findUniqueOrThrow({ where: { id: value.project.id } }),
      client.color.findUniqueOrThrow({ where: { id: value.color.id } }),
      client.workflowInstance.findUniqueOrThrow({ where: { id: value.instance.id } }),
      client.workflowTask.findUniqueOrThrow({ where: { id: value.task.id } }),
      client.workflowTask.findUniqueOrThrow({ where: { id: value.procurement.id } }),
      client.standardBoard.findMany({ where: { projectId: value.project.id }, orderBy: { versionNo: 'asc' }, take: 10 }),
      client.colorVersion.findMany({ where: { colorId: value.color.id }, orderBy: { versionNo: 'asc' }, take: 10 }),
      client.auditLog.findMany({ where: { projectId: value.project.id }, orderBy: { id: 'asc' }, take: 20 }),
      client.r26CommandRequest.findMany({ where: { projectId: value.project.id }, orderBy: { id: 'asc' }, take: 10 }),
      client.boardDistributionRecord.findMany({ where: { projectId: value.project.id }, orderBy: { id: 'asc' }, take: 10 }),
    ]);
    return { project, color, instance, task, procurement, boards, versions, audits, commands, distributions };
  }

  function failAfterPublicationAudit(value: Fixture) {
    let reached = 0;
    let stateInsideTransaction: Awaited<ReturnType<typeof snapshot>> | undefined;
    const client = new Proxy(db, {
      get(target, property) {
        if (property === '$transaction') {
          return (execute: (tx: Prisma.TransactionClient) => Promise<unknown>, options?: { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel }) => target.$transaction(async tx => {
            const audit = new Proxy(tx.auditLog, {
              get(delegate, method) {
                if (method === 'create') return async (args: Prisma.AuditLogCreateArgs) => {
                  const result = await delegate.create(args);
                  if (args.data.action === 'COLOR_STANDARD_PUBLISHED') {
                    reached += 1;
                    stateInsideTransaction = await snapshot(value, tx);
                    throw new Error('SYNTHETIC_FAILURE_AFTER_PUBLICATION_AUDIT_INSERT');
                  }
                  return result;
                };
                const result = Reflect.get(delegate, method);
                return typeof result === 'function' ? result.bind(delegate) : result;
              },
            });
            const injected = new Proxy(tx, { get(transaction, key) {
              if (key === 'auditLog') return audit;
              const result = Reflect.get(transaction, key);
              return typeof result === 'function' ? result.bind(transaction) : result;
            } });
            return execute(injected);
          }, options);
        }
        const result = Reflect.get(target, property);
        return typeof result === 'function' ? result.bind(target) : result;
      },
    }) as unknown as PrismaService;
    return { client, reached: () => reached, state: () => stateInsideTransaction };
  }

  beforeAll(async () => {
    // Fail closed before connection; never use DATABASE_URL or the imported
    // workbook/application database. Root supplies an isolated test DB only.
    const parsed = new URL(databaseUrl!);
    const databaseName = decodeURIComponent(parsed.pathname.slice(1));
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol) ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) ||
      !databaseName.includes('color_register_test')) {
      throw new Error('COLOR_REGISTER_TEST_DATABASE_URL must be a dedicated loopback color_register_test database.');
    }
    db = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
    await db.$connect();
    const actor = async (label: string, approved: boolean): Promise<AuthenticatedUser> => {
      const user = await db.user.create({ data: { username: `atomic07-${label}-${run}`, name: `合成制板成员 ${label}`, teamAccessApproved: approved } });
      return { id: user.id, username: user.username, name: user.name, email: null, departmentId: null, departmentName: null,
        isSystemAdmin: false, teamAccessApproved: approved, authSource: 'local', roleCodes: [], permissionCodes: [], authVersion: user.authVersion };
    };
    memberA = await actor('A', true); memberB = await actor('B', true); unapproved = await actor('outside', false);
    baseId = (await db.productionBase.create({ data: { code: `ATOMIC07-${run}`, name: `合成生产基地 ${run}` } })).id;
    hueId = (await db.hueStandard.create({ data: { name: `合成色相 ${run}`, basis: '合成事务测试' } })).id;
    service = makeService();
  }, 30000);

  afterAll(async () => {
    // Preserve this run's synthetic business and append-only audit evidence in
    // the dedicated test database. Never delete audit rows or bypass triggers.
    if (db) await db.$disconnect();
  }, 30000);

  it('saves node, standard version, board and listing together without changing color identity or approving production', async () => {
    const value = await fixture('publish');
    const before = await snapshot(value);
    const input = command(value);
    expect(memberB.roleCodes).toEqual([]); expect(memberB.isSystemAdmin).toBe(false);
    expect(await db.projectMember.count({ where: { projectId: value.project.id, userId: memberB.id } })).toBe(0);
    const result = await service.saveAndPublish(value.project.id, input, memberB);
    const after = await snapshot(value);
    expect(result).toMatchObject({ colorId: value.color.id, standardVersionNo: 1, registerRevision: 2, idempotentReplay: false });
    expect(after.color).toMatchObject({ id: value.color.id, name: value.color.name, productionBaseId: baseId, hueStandardId: hueId,
      code: null, registerMonth: null, registerStatus: 'LISTED', registerRevision: 2, status: 'DRAFT', exitFlag: false,
      numberedById: null, numberedAt: null, manufacturer: '合成制作单位', paintType: '合成漆种' });
    expect(after.color.registeredAt).toBeInstanceOf(Date);
    expect(after.versions).toHaveLength(1);
    expect(after.versions[0]).toMatchObject({ id: resultText(result, 'colorVersionId'), colorId: value.color.id, versionNo: 1,
      createdById: memberB.id, status: 'DRAFT', confirmedAt: null, boardCode: input.boardCode,
      technicalData: input.technicalData,
      sourceReference: { projectId: value.project.id, workflowTaskId: value.task.id, origin: 'STANDARD_BOARD_PRODUCTION' } });
    expect(after.boards).toHaveLength(1);
    expect(after.boards[0]).toMatchObject({ id: resultText(result, 'boardId'), colorId: value.color.id, colorVersionId: resultText(result, 'colorVersionId'),
      boardCode: input.boardCode, versionNo: 1, status: 'CREATED', isCurrent: true, basedOnSampleId: value.sample.id,
      producedAt: new Date('2025-01-01T16:00:00.000Z') });
    expect(after.task.payload).toEqual({ preservedNodeRecord: '不覆盖原有节点内容', colorRegisterStandard: {
      boardId: resultText(result, 'boardId'), colorId: value.color.id, colorVersionId: resultText(result, 'colorVersionId'), standardVersionNo: 1,
    } });
    expect(after.task).toMatchObject({ isActive: true, status: 'IN_PROGRESS', assigneeUserId: memberA.id });
    expect(after.task.updatedAt.getTime()).toBeGreaterThan(before.task.updatedAt.getTime());
    expect(after.project).toEqual(before.project); expect(after.instance).toEqual(before.instance); expect(after.procurement).toEqual(before.procurement);
    expect(after.audits.map(row => row.action).sort()).toEqual(['COLOR_STANDARD_PUBLISHED', 'STANDARD_BOARD_CREATED']);
    expect(after.audits.every(row => row.actorUserId === memberB.id)).toBe(true);
    expect(after.commands).toHaveLength(1);
    expect(await new ColorRegisterService(prisma()).detail(value.color.id, {}, memberA)).toMatchObject({
      id: value.color.id, registerStatus: 'LISTED', productionApprovalStatus: 'NOT_APPROVED', formalCode: null, registerMonth: null,
      currentStandardVersionId: resultText(result, 'colorVersionId'), versionsTotal: 1,
    });
  });

  it('serializes identical concurrent submissions into one board/version/audit pair and replays the same identity', async () => {
    const value = await fixture('replay');
    const input = command(value);
    const results = await Promise.all([service.saveAndPublish(value.project.id, input, memberA), service.saveAndPublish(value.project.id, input, memberA)]);
    expect(results.map(result => result.idempotentReplay).sort()).toEqual([false, true]);
    expect(new Set(results.map(result => resultText(result, 'boardId'))).size).toBe(1);
    expect(new Set(results.map(result => resultText(result, 'colorVersionId'))).size).toBe(1);
    const after = await snapshot(value);
    expect([after.boards.length, after.versions.length, after.audits.length, after.commands.length]).toEqual([1, 1, 2, 1]);
    expect(after.color.registerRevision).toBe(2);
    const replay = await service.saveAndPublish(value.project.id, input, memberA);
    expect(replay).toMatchObject({ colorId: value.color.id, boardId: resultText(results[0], 'boardId'), idempotentReplay: true });
    expect(await snapshot(value)).toEqual(after);
    await expect(service.saveAndPublish(value.project.id, { ...input, remark: '变更正文不能复用原请求号' }, memberA)).rejects.toMatchObject({ status: 409 });
    expect(await snapshot(value)).toEqual(after);
  });

  it('rolls back every persisted component when the second audit INSERT fails, then retries the same command once', async () => {
    const value = await fixture('rollback');
    const input = command(value);
    const before = await snapshot(value);
    const failure = failAfterPublicationAudit(value);
    await expect(makeService(failure.client).saveAndPublish(value.project.id, input, memberA)).rejects.toThrow('SYNTHETIC_FAILURE_AFTER_PUBLICATION_AUDIT_INSERT');
    expect(failure.reached()).toBe(1);
    const inside = failure.state()!;
    expect(inside.color.registerStatus).toBe('LISTED'); expect(inside.color.registerRevision).toBe(2);
    expect([inside.versions.length, inside.boards.length, inside.audits.length]).toEqual([1, 1, 2]);
    expect(inside.task.payload).toHaveProperty('colorRegisterStandard');
    expect(inside.task.updatedAt.getTime()).toBeGreaterThan(before.task.updatedAt.getTime());
    expect(await snapshot(value)).toEqual(before);
    const result = await service.saveAndPublish(value.project.id, input, memberA);
    expect(result.idempotentReplay).toBe(false);
    const committed = await snapshot(value);
    expect([committed.versions.length, committed.boards.length, committed.audits.length, committed.commands.length]).toEqual([1, 1, 2, 1]);
  });

  it('allows only one concurrent stale-version writer and retains no partial command for the loser', async () => {
    const value = await fixture('cas');
    const input = command(value);
    const outcomes = await Promise.allSettled([
      service.saveAndPublish(value.project.id, input, memberA),
      service.saveAndPublish(value.project.id, { ...input, idempotencyKey: randomUUID(), remark: '另一位同权限成员' }, memberB),
    ]);
    expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1);
    const failures = outcomes.filter(outcome => outcome.status === 'rejected');
    expect(failures).toHaveLength(1); expect(failures[0]!.reason).toMatchObject({ status: 409 });
    const after = await snapshot(value);
    expect([after.versions.length, after.boards.length, after.audits.length, after.commands.length]).toEqual([1, 1, 2, 1]);
    expect(after.color.registerRevision).toBe(2);
  });

  it('preserves prior versions and authors when another exact project links the same existing color identity', async () => {
    const original = await fixture('original');
    const first = await service.saveAndPublish(original.project.id, command(original), memberA);
    const firstSnapshot = await snapshot(original);
    const linked = await fixture('linked', original.color.id);
    const result = await service.saveAndPublish(linked.project.id, {
      ...command(linked), registerMonth: '2025-04',
      technicalData: { ...command(linked).technicalData, manufacturer: '合成新制作单位', changeSummary: '合成标准第二版本' },
    }, memberB);
    expect(result).toMatchObject({ colorId: original.color.id, standardVersionNo: 2, registerRevision: 3 });
    expect(await db.color.count({ where: { id: original.color.id } })).toBe(1);
    expect(await db.color.count({ where: { projectId: linked.project.id } })).toBe(0);
    expect(await db.colorVersion.findUniqueOrThrow({ where: { id: resultText(first, 'colorVersionId') } })).toEqual(firstSnapshot.versions[0]);
    expect(await db.standardBoard.findUniqueOrThrow({ where: { id: resultText(first, 'boardId') } })).toEqual(firstSnapshot.boards[0]);
    expect(await db.workflowTask.findUniqueOrThrow({ where: { id: original.task.id } })).toEqual(firstSnapshot.task);
    const current = await db.color.findUniqueOrThrow({ where: { id: original.color.id } });
    expect(current).toMatchObject({ projectId: original.project.id, registerMonth: '2025-04', registerStatus: 'LISTED', registerRevision: 3 });
    expect(current.registeredAt).toEqual(firstSnapshot.color.registeredAt);
    expect(await db.colorVersion.count({ where: { colorId: original.color.id } })).toBe(2);
    expect(await db.project.findUniqueOrThrow({ where: { id: linked.project.id } })).toMatchObject({ primaryColorId: original.color.id, ownerUserId: memberA.id });
  });

  it('keeps publication, issuing and distribution pinned to the exact standard version', async () => {
    const value = await fixture('issued');
    const result = await service.saveAndPublish(value.project.id, command(value), memberB);
    const boardId = resultText(result, 'boardId');
    const versionId = resultText(result, 'colorVersionId');
    const versionBefore = await db.colorVersion.findUniqueOrThrow({ where: { id: versionId } });
    await service.issueBoard(value.project.id, boardId, {
      recipientName: '合成接收人', recipientDept: '合成生产基地', issuedAt: '2025-01-03T00:00:00.000Z',
    }, memberA);
    await service.addDistribution(value.project.id, boardId, {
      receiverName: '合成接收人', receiverDept: '合成生产基地', sentAt: '2025-01-03T00:00:00.000Z',
      signedAt: '2025-01-04T00:00:00.000Z', note: '按具体标准版本下发',
    }, memberB);
    const after = await snapshot(value);
    expect(after.boards).toHaveLength(1);
    expect(after.boards[0]).toMatchObject({ id: boardId, colorId: value.color.id, colorVersionId: versionId,
      status: 'ISSUED', issuedById: memberA.id });
    expect(after.distributions).toHaveLength(1);
    expect(after.distributions[0]).toMatchObject({ standardBoardId: boardId, status: 'RECEIVED', receiverName: '合成接收人' });
    expect(await db.colorVersion.findUniqueOrThrow({ where: { id: versionId } })).toEqual(versionBefore);
    expect(after.task).toMatchObject({ isActive: true, status: 'IN_PROGRESS' });
    const inspection = await makeWorkflowService().inspectTaskCompletionWithExecutor(prisma(), value.task.id);
    expect(inspection.domainBlockingReasons).not.toContain('请先保存并加入颜色清单，再下发引用本项目准确颜色标准版本的当前标准板。');
    expect(after.audits.map(row => row.action).sort()).toEqual([
      'COLOR_STANDARD_PUBLISHED', 'STANDARD_BOARD_CREATED', 'STANDARD_BOARD_DISTRIBUTION_ADDED', 'STANDARD_BOARD_ISSUED',
    ]);
  });

  it('rejects legacy create for exact-linked projects and blocks null or cross-color board/version identities at issue, distribution and completion', async () => {
    const legacy = await fixture('legacy');
    const legacyBefore = await snapshot(legacy);
    await expect(service.createStandardBoard(legacy.project.id, {
      boardCode: 'SYNTHETIC-LEGACY', versionNo: 1, basedOnSampleId: legacy.sample.id,
    }, memberA)).rejects.toMatchObject({ status: 400 });
    expect(await snapshot(legacy)).toEqual(legacyBefore);

    const foreign = await fixture('wrongcolor');
    const foreignResult = await service.saveAndPublish(foreign.project.id, command(foreign), memberA);
    for (const kind of ['missing', 'wrong-color', 'wrong-version'] as const) {
      const value = await fixture(`guard-${kind}`);
      const ownVersion = await db.colorVersion.create({ data: { colorId: value.color.id, versionNo: 1,
        status: 'DRAFT', boardCode: 'SYNTHETIC-GUARD', createdById: memberA.id } });
      // Explicitly synthetic persisted corruption/legacy fixture. The test must
      // prove application actions refuse it; it is never user-facing history.
      const board = await db.standardBoard.create({ data: {
        projectId: value.project.id, boardCode: 'SYNTHETIC-GUARD', versionNo: 1,
        status: 'CREATED', isCurrent: true,
        colorId: kind === 'missing' ? null : kind === 'wrong-color' ? foreign.color.id : value.color.id,
        colorVersionId: kind === 'missing' ? null : kind === 'wrong-color' ? ownVersion.id : resultText(foreignResult, 'colorVersionId'),
      } });
      const beforeIssue = await snapshot(value);
      await expect(service.issueBoard(value.project.id, board.id, {
        recipientName: '不可下发', issuedAt: '2025-01-03T00:00:00.000Z',
      }, memberA)).rejects.toMatchObject({ status: 400 });
      expect(await snapshot(value)).toEqual(beforeIssue);
      await db.standardBoard.update({ where: { id: board.id }, data: { status: 'ISSUED' } });
      const beforeDistribution = await snapshot(value);
      await expect(service.addDistribution(value.project.id, board.id, {
        receiverName: '不可发放', receiverDept: '合成基地', sentAt: '2025-01-03T00:00:00.000Z',
      }, memberA)).rejects.toMatchObject({ status: 400 });
      expect(await snapshot(value)).toEqual(beforeDistribution);
      await expect(service.completeStandardBoardTask(value.project.id, memberA)).rejects.toMatchObject({ status: 400 });
      expect(await snapshot(value)).toEqual(beforeDistribution);
      const workflows = makeWorkflowService();
      const expectedIssue = '请先保存并加入颜色清单，再下发引用本项目准确颜色标准版本的当前标准板。';
      const inspection = await workflows.inspectTaskCompletionWithExecutor(prisma(), value.task.id);
      expect(inspection.domainBlockingReasons).toContain(expectedIssue);
      // Test the exact PostgreSQL predicate shared by direct COMPLETE and
      // completion inspection. Other required-material guards remain intact.
      const issues = await db.$transaction(tx => workflows['getRegisterStandardCompletionIssues'](tx, {
        nodeCode: value.task.nodeCode, projectId: value.project.id, project: beforeDistribution.project,
      }));
      expect(issues).toEqual([expectedIssue]);
      expect(await snapshot(value)).toEqual(beforeDistribution);
    }
  });

  it('refuses unapproved membership and a stale actor after DB-side revocation without writing', async () => {
    const value = await fixture('permission');
    const input = command(value); const before = await snapshot(value);
    await expect(service.saveAndPublish(value.project.id, input, unapproved)).rejects.toMatchObject({ status: 403 });
    expect(await snapshot(value)).toEqual(before);
    await db.user.update({ where: { id: memberB.id }, data: { teamAccessApproved: false } });
    try {
      await expect(service.saveAndPublish(value.project.id, input, memberB)).rejects.toMatchObject({ status: 403 });
      expect(await snapshot(value)).toEqual(before);
    } finally {
      await db.user.update({ where: { id: memberB.id }, data: { teamAccessApproved: true } });
    }
  });

  it('refuses inactive or completed node07, missing procurement, stale revisions, and foreign samples without partial state', async () => {
    const value = await fixture('guards');
    const foreign = await fixture('foreign');
    const input = command(value);
    const unchanged = async (raw: unknown, status: number) => {
      const before = await snapshot(value);
      await expect(service.saveAndPublish(value.project.id, raw, memberA)).rejects.toMatchObject({ status });
      expect(await snapshot(value)).toEqual(before);
    };
    await unchanged({ ...input, taskVersion: new Date(0).toISOString() }, 409);
    await unchanged({ ...input, expectedColorRevision: 2 }, 409);
    await unchanged({ ...input, basedOnSampleId: foreign.sample.id }, 400);
    await db.workflowTask.update({ where: { id: value.procurement.id }, data: { status: 'IN_PROGRESS' } });
    await unchanged(input, 400);
    await db.workflowTask.update({ where: { id: value.procurement.id }, data: { status: 'COMPLETED' } });
    await db.workflowTask.update({ where: { id: value.task.id }, data: { isActive: false } });
    await unchanged(input, 409);
    await db.workflowTask.update({ where: { id: value.task.id }, data: { isActive: true, status: 'COMPLETED' } });
    await unchanged(input, 409);
  });
});
