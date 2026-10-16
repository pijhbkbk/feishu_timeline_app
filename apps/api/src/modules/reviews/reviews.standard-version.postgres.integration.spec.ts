import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaService } from '../../infra/prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import type { AttachmentsService } from '../attachments/attachments.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ProjectAccessService } from '../auth/project-access.service';
import { ColorRegisterService } from '../color-register/color-register.service';
import { StandardBoardsService } from '../standard-boards/standard-boards.service';
import type { WorkflowsService } from '../workflows/workflows.service';
import { ReviewsService } from './reviews.service';

const databaseUrl = process.env.COLOR_REGISTER_TEST_DATABASE_URL;

// Synthetic stage fixtures reuse the node07 PG test shape. Publication, issue,
// review, correction, authorization, evidence traversal, SQL and audits below
// use real services. Upload/scanner/HTTP and whole-workflow tests are separate.
describe.skipIf(!databaseUrl).sequential('review standard version persistence on PostgreSQL', () => {
  const run = randomUUID();
  let db: PrismaClient;
  let boards: StandardBoardsService;
  let reviews: ReviewsService;
  let register: ColorRegisterService;
  let memberA: AuthenticatedUser;
  let memberB: AuthenticatedUser;
  let baseId: string;
  let hueId: string;
  const prisma = () => db as unknown as PrismaService;
  function resultText(value: unknown, field: string): string {
    if (!value || typeof value !== 'object' || !(field in value)) throw new Error(`Response missing ${field}`);
    const text = (value as Record<string, unknown>)[field];
    if (typeof text !== 'string' || !text) throw new Error(`Response has invalid ${field}`);
    return text;
  }
  async function boardFixture(label: string, existingColorId?: string) {
    const project = await db.project.create({ data: {
      code: `SYNTHETIC-RV-${label}-${run}`, name: `合成制板标定 ${label}`,
      status: 'IN_PROGRESS', currentNodeCode: 'STANDARD_BOARD_PRODUCTION', ownerUserId: memberA.id,
    } });
    const color = existingColorId
      ? await db.color.findUniqueOrThrow({ where: { id: existingColorId } })
      : await db.color.create({ data: { projectId: project.id, name: `合成候选 ${label} ${run}`,
        productionBaseId: baseId, hueStandardId: hueId, registerStatus: 'CANDIDATE', isPrimary: true } });
    await db.project.update({ where: { id: project.id }, data: { primaryColorId: color.id } });
    const instance = await db.workflowInstance.create({ data: {
      projectId: project.id, instanceNo: `SYNTHETIC-RVINSTANCE-${label}-${run}`,
      status: 'RUNNING', currentNodeCode: 'STANDARD_BOARD_PRODUCTION', initiatedById: memberA.id,
    } });
    const procurement = await db.workflowTask.create({ data: {
      workflowInstanceId: instance.id, projectId: project.id, taskNo: `SYNTHETIC-RV06-${label}-${run}`,
      nodeCode: 'PAINT_PROCUREMENT', nodeName: '合成已完成采购前置',
      status: 'COMPLETED', isActive: false, assigneeUserId: memberA.id,
      completedAt: new Date('2025-01-01T00:00:00.000Z'), payload: { syntheticPrecondition: true },
    } });
    const task = await db.workflowTask.create({ data: {
      workflowInstanceId: instance.id, projectId: project.id, taskNo: `SYNTHETIC-RV-${label}-${run}`,
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
  type Fixture = Awaited<ReturnType<typeof boardFixture>>;
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


  async function reviewFixture(label: string) {
    const value = await boardFixture(label);
    const publication = await boards.saveAndPublish(value.project.id, command(value), memberA);
    const boardId = resultText(publication, 'boardId');
    const versionId = resultText(publication, 'colorVersionId');
    await boards.issueBoard(value.project.id, boardId, {
      recipientName: '合成评审接收人', recipientDept: '合成部门', issuedAt: '2025-01-03T00:00:00.000Z',
    }, memberA);
    // Explicit synthetic pre-reached stage, not a claim that the production
    // workflow can skip intervening business gates. No historical actor/audit
    // is fabricated: node07 creation evidence above came from its real service.
    await db.workflowTask.update({ where: { id: value.task.id }, data: { status: 'COMPLETED', isActive: false } });
    const cabin = await db.workflowTask.create({ data: {
      projectId: value.project.id, workflowInstanceId: value.instance.id,
      taskNo: `SYNTHETIC-RV12-${label}-${run}`, nodeCode: 'CAB_REVIEW', nodeName: '合成已获准驾驶室评审前置',
      status: 'APPROVED', isActive: false, assigneeUserId: memberA.id, payload: { fromTaskId: value.task.id },
    } });
    const reviewTask = await db.workflowTask.create({ data: {
      projectId: value.project.id, workflowInstanceId: value.instance.id,
      taskNo: `SYNTHETIC-RV14-${label}-${run}`, nodeCode: 'COLOR_CONSISTENCY_REVIEW', nodeName: '合成一致性评审',
      status: 'IN_PROGRESS', isActive: true, assigneeUserId: memberB.id, payload: { fromTaskId: cabin.id },
    } });
    await db.project.update({ where: { id: value.project.id }, data: { currentNodeCode: 'COLOR_CONSISTENCY_REVIEW' } });
    await db.workflowInstance.update({ where: { id: value.instance.id }, data: { currentNodeCode: 'COLOR_CONSISTENCY_REVIEW' } });
    return { ...value, boardId, versionId, reviewTask };
  }
  type ReviewFixture = Awaited<ReturnType<typeof reviewFixture>>;
  const reviewInput = (value: ReviewFixture, standardVersionId = value.versionId) => ({
    standardVersionId, reviewerId: memberB.id, reviewDate: '2025-01-04T00:00:00.000Z',
    reviewConclusion: 'APPROVED', comment: '合成评审固定本次实际标准版本',
  });
  async function correction(value: ReviewFixture) {
    const color = await db.color.findUniqueOrThrow({ where: { id: value.color.id } });
    return register.correctStandard(value.color.id, {
      operationId: randomUUID(), expectedRevision: color.registerRevision, boardCode: '合成更正色板 V2',
      technicalData: { ...command(value).technicalData, changeSummary: '合成更正，只新增标准不改变已签评审',
        measurements: [{ angle: 45, l: 83.2, a: null, b: 0, originalControlLimits: '更正控制限原文' }] },
    }, memberA);
  }
  async function reviewEvidence(value: ReviewFixture) {
    const records = await db.reviewRecord.findMany({ where: { projectId: value.project.id }, orderBy: { id: 'asc' }, take: 10 });
    const audits = await db.auditLog.findMany({ where: { projectId: value.project.id, targetType: 'REVIEW_RECORD' }, orderBy: { id: 'asc' }, take: 20 });
    return { records, audits };
  }

  beforeAll(async () => {
    const parsed = new URL(databaseUrl!);
    const databaseName = decodeURIComponent(parsed.pathname.slice(1));
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol) ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) ||
      !databaseName.includes('color_register_test')) {
      throw new Error('COLOR_REGISTER_TEST_DATABASE_URL must be a dedicated loopback color_register_test database.');
    }
    db = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
    await db.$connect();
    const actor = async (label: string): Promise<AuthenticatedUser> => {
      const user = await db.user.create({ data: { username: `review-version-${label}-${run}`, name: `合成评审成员 ${label}`, teamAccessApproved: true } });
      return { id: user.id, username: user.username, name: user.name, email: null, departmentId: null, departmentName: null,
        isSystemAdmin: false, teamAccessApproved: true, authSource: 'local', roleCodes: [], permissionCodes: [], authVersion: user.authVersion };
    };
    memberA = await actor('A'); memberB = await actor('B');
    baseId = (await db.productionBase.create({ data: { code: `REVIEW-VERSION-${run}`, name: '合成评审版本测试基地' } })).id;
    hueId = (await db.hueStandard.create({ data: { name: '合成评审版本测试色相', basis: 'synthetic fixture' } })).id;
    const access = new ProjectAccessService(prisma());
    const activity = new ActivityLogsService(prisma(), access);
    const workflows = new Proxy({} as WorkflowsService, {
      get() { throw new Error('UNEXPECTED_WORKFLOW_TRANSITION_DURING_REVIEW_DRAFT'); },
    });
    const attachments = new Proxy({} as AttachmentsService, {
      get() { throw new Error('UNEXPECTED_ATTACHMENT_IO_DURING_REVIEW_DRAFT'); },
    });
    boards = new StandardBoardsService(prisma(), activity, workflows, access);
    reviews = new ReviewsService(prisma(), activity, attachments, workflows, access);
    register = new ColorRegisterService(prisma());
  }, 30000);

  afterAll(async () => {
    // Preserve synthetic records and append-only audit evidence. No cleanup,
    // trigger bypass, source-import data changes, or DATABASE_URL fallback.
    if (db) await db.$disconnect();
  }, 30000);

  it('persists the issued V1 through the real review service and keeps its author and audit after V2 correction', async () => {
    const value = await reviewFixture('preserve');
    const versionBefore = await db.colorVersion.findUniqueOrThrow({ where: { id: value.versionId } });
    const boardBefore = await db.standardBoard.findUniqueOrThrow({ where: { id: value.boardId } });
    const workspace = await reviews.createConsistencyReview(value.project.id, reviewInput(value), memberB);
    const before = await reviewEvidence(value);
    expect(before.records).toHaveLength(1); expect(before.audits).toHaveLength(1);
    const original = before.records[0]!;
    expect(original).toMatchObject({ standardVersionId: value.versionId, reviewerId: memberB.id,
      workflowTaskId: value.reviewTask.id, reviewType: 'COLOR_CONSISTENCY_REVIEW', result: 'APPROVED', submittedAt: null });
    expect(before.audits[0]).toMatchObject({ actorUserId: memberB.id, targetId: original.id, action: 'CONSISTENCY_REVIEW_CREATED' });
    expect(workspace.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: original.id, standardVersionId: value.versionId })]));
    const updated = await correction(value);
    expect(updated).toMatchObject({ colorId: value.color.id, versionNo: 2 });
    expect(await reviewEvidence(value)).toEqual(before);
    expect(await db.colorVersion.findUniqueOrThrow({ where: { id: value.versionId } })).toEqual(versionBefore);
    expect(await db.standardBoard.findUniqueOrThrow({ where: { id: value.boardId } })).toEqual(boardBefore);
    const reread = await new ReviewsService(prisma(), new ActivityLogsService(prisma(), new ProjectAccessService(prisma())),
      {} as AttachmentsService, {} as WorkflowsService, new ProjectAccessService(prisma())).getConsistencyReviewWorkspace(value.project.id, memberA);
    expect(reread.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: original.id, standardVersionId: value.versionId })]));
    expect(reread.eligibleStandardVersions.map(version => version.id)).toContain(value.versionId);
    expect(reread.eligibleStandardVersions.map(version => version.id)).not.toContain(resultText(updated, 'versionId'));
    expect(await db.colorVersion.findUniqueOrThrow({ where: { id: resultText(updated, 'versionId') } })).toMatchObject({ createdById: memberA.id });
  });

  it('rejects another color and an unissued corrected version before creating any review or audit', async () => {
    const value = await reviewFixture('reject');
    const foreign = await reviewFixture('foreign');
    const updated = await correction(value);
    const before = await reviewEvidence(value);
    for (const versionId of [foreign.versionId, resultText(updated, 'versionId')]) {
      await expect(reviews.createConsistencyReview(value.project.id, reviewInput(value, versionId), memberB)).rejects.toMatchObject({ status: 409 });
      expect(await reviewEvidence(value)).toEqual(before);
    }
    await reviews.createConsistencyReview(value.project.id, reviewInput(value), memberB);
    expect((await reviewEvidence(value)).records).toEqual([expect.objectContaining({ standardVersionId: value.versionId, reviewerId: memberB.id })]);
  });

  it('refuses replacing a pinned version or signing over another member’s existing review', async () => {
    const value = await reviewFixture('immutable');
    await reviews.createConsistencyReview(value.project.id, reviewInput(value), memberB);
    const updated = await correction(value);
    const before = await reviewEvidence(value);
    const record = before.records[0]!;
    await expect(reviews.updateConsistencyReview(value.project.id, record.id,
      reviewInput(value, resultText(updated, 'versionId')), memberB)).rejects.toMatchObject({ status: 409 });
    expect(await reviewEvidence(value)).toEqual(before);
    await expect(reviews.updateConsistencyReview(value.project.id, record.id,
      { ...reviewInput(value), reviewerId: memberA.id }, memberA)).rejects.toMatchObject({ status: 403 });
    expect(await reviewEvidence(value)).toEqual(before);
  });
});
