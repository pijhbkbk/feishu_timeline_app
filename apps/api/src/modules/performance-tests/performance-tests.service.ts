import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AttachmentScanStatus,
  AttachmentTargetType,
  AuditTargetType,
  PerformanceTestResult,
  PerformanceTestStatus,
  PerformanceTestType,
  Prisma,
  UserStatus,
  WorkflowAction,
  WorkflowNodeCode,
  WorkflowTaskStatus,
} from '@prisma/client';

import { PrismaService } from '../../infra/prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { AttachmentsService } from '../attachments/attachments.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ProjectAccessService } from '../auth/project-access.service';
import {
  getAllowedWorkflowActions,
  getCurrentNodeName,
  isWorkflowActionCurrentlyAvailable,
} from '../workflows/workflow-node.constants';
import { WorkflowsService } from '../workflows/workflows.service';
import {
  canEditPerformanceTest,
  getPerformanceTestCompletionIssue,
  getPerformanceTestStageIssue,
  getPerformanceTestSubmitIssue,
} from './performance-tests.rules';

type PerformanceTestsDbClient = Prisma.TransactionClient | PrismaService;

type UploadedBinaryFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

type PerformanceTestWriteInput = {
  testCode: string;
  sampleId: string | null;
  relatedObjectName: string | null;
  testItem: PerformanceTestType;
  standardValue: string;
  actualValue: string;
  result: PerformanceTestResult;
  conclusion: string;
  testedById: string;
  testedAt: Date;
};

const PERFORMANCE_TEST_TYPE_VALUES = Object.values(PerformanceTestType);
const PERFORMANCE_TEST_RESULT_VALUES = Object.values(PerformanceTestResult);
const PERFORMANCE_TEST_DETAIL_INCLUDE = {
  sample: true,
  testedBy: true,
  reportAttachment: true,
} satisfies Prisma.PerformanceTestInclude;

@Injectable()
export class PerformanceTestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLogsService: ActivityLogsService,
    private readonly attachmentsService: AttachmentsService,
    private readonly workflowsService: WorkflowsService,
    private readonly projectAccessService: ProjectAccessService,
  ) {}

  async getWorkspace(projectId: string, actor: AuthenticatedUser) {
    await this.assertProjectAccess(projectId, actor, 'project.read');
    return this.buildWorkspace(this.prisma, projectId);
  }

  async getDetail(projectId: string, testId: string, actor: AuthenticatedUser) {
    await this.assertProjectAccess(projectId, actor, 'project.read');
    return this.buildDetail(this.prisma, projectId, testId);
  }

  async createTest(
    projectId: string,
    rawInput: unknown,
    actor: AuthenticatedUser,
  ) {
    await this.assertProjectAccess(projectId, actor, 'workflow.transition');
    this.assertActorCanManage(actor);
    const input = this.parseWriteInput(rawInput);

    await this.prisma.$transaction(async (tx) => {
      await this.lockPerformanceWriteContext(tx, projectId);

      await this.assertUniqueTestCode(tx, projectId, input.testCode);
      await this.assertSampleReference(tx, projectId, input.sampleId);
      await this.assertTesterReference(tx, input.testedById);

      const createdTest = await tx.performanceTest.create({
        data: {
          projectId,
          sampleId: input.sampleId,
          relatedObjectName: input.relatedObjectName,
          testCode: input.testCode,
          testItem: input.testItem,
          standardValue: input.standardValue,
          actualValue: input.actualValue,
          result: input.result,
          conclusion: input.conclusion,
          testedById: input.testedById,
          testedAt: input.testedAt,
          status: PerformanceTestStatus.DRAFT,
        },
        include: PERFORMANCE_TEST_DETAIL_INCLUDE,
      });

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.PERFORMANCE_TEST,
        targetId: createdTest.id,
        action: 'PERFORMANCE_TEST_CREATED',
        nodeCode: WorkflowNodeCode.PERFORMANCE_TEST,
        summary: `创建性能试验记录 ${createdTest.testCode}`,
        afterData: this.toPerformanceTestAuditSnapshot(createdTest),
      });
    });

    return this.buildWorkspace(this.prisma, projectId);
  }

  async updateTest(
    projectId: string,
    testId: string,
    rawInput: unknown,
    actor: AuthenticatedUser,
  ) {
    await this.assertProjectAccess(projectId, actor, 'workflow.transition');
    this.assertActorCanManage(actor);
    const input = this.parseWriteInput(rawInput);

    await this.prisma.$transaction(async (tx) => {
      const { testRecord } = await this.lockPerformanceWriteContext(
        tx,
        projectId,
        testId,
      );

      if (!testRecord || !canEditPerformanceTest(testRecord.status)) {
        this.throwPerformanceTestStateChanged();
      }

      if (testRecord.testCode !== input.testCode) {
        await this.assertUniqueTestCode(tx, projectId, input.testCode, testRecord.id);
      }

      await this.assertSampleReference(tx, projectId, input.sampleId);
      await this.assertTesterReference(tx, input.testedById);

      const updated = await tx.performanceTest.updateMany({
        where: {
          id: testId,
          projectId,
          status: PerformanceTestStatus.DRAFT,
          updatedAt: testRecord.updatedAt,
        },
        data: {
          sampleId: input.sampleId,
          relatedObjectName: input.relatedObjectName,
          testCode: input.testCode,
          testItem: input.testItem,
          standardValue: input.standardValue,
          actualValue: input.actualValue,
          result: input.result,
          conclusion: input.conclusion,
          testedById: input.testedById,
          testedAt: input.testedAt,
        },
      });
      if (updated.count !== 1) {
        this.throwPerformanceTestStateChanged();
      }
      const updatedTest = await this.getTestOrThrow(tx, projectId, testId);

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.PERFORMANCE_TEST,
        targetId: updatedTest.id,
        action: 'PERFORMANCE_TEST_UPDATED',
        nodeCode: WorkflowNodeCode.PERFORMANCE_TEST,
        summary: `更新性能试验记录 ${updatedTest.testCode}`,
        beforeData: this.toPerformanceTestAuditSnapshot(testRecord),
        afterData: this.toPerformanceTestAuditSnapshot(updatedTest),
      });
    });

    return this.buildWorkspace(this.prisma, projectId);
  }

  async uploadReport(
    projectId: string,
    testId: string,
    file: UploadedBinaryFile | undefined,
    actor: AuthenticatedUser,
  ) {
    await this.assertProjectAccess(projectId, actor, 'attachment.manage');
    this.assertActorCanManage(actor);

    if (!file) {
      throw new BadRequestException('请选择要上传的试验报告附件。');
    }

    const context = await this.getPerformanceContext(this.prisma, projectId);
    this.assertWritableStage(context);
    const testRecord = await this.getTestOrThrow(this.prisma, projectId, testId);

    if (!canEditPerformanceTest(testRecord.status)) {
      throw new BadRequestException('已提交的试验记录不允许再上传报告。');
    }

    const attachment = await this.attachmentsService.createStoredAttachment({
      projectId,
      targetType: AttachmentTargetType.PERFORMANCE_TEST,
      targetId: testId,
      file,
      uploadedById: actor.id,
      nodeCode: WorkflowNodeCode.PERFORMANCE_TEST,
      summary: `上传性能试验报告 ${testRecord.testCode}`,
      replacesAttachmentId: testRecord.reportAttachmentId,
      finalizeDomainAttachment: this.createReportAttachmentFinalizeHook({
        projectId,
        testId,
        workflowTaskId: context.activeTask!.id,
        expectedAttachmentId: testRecord.reportAttachmentId,
      }),
    });

    await this.prisma.$transaction(async (tx) => {
      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.PERFORMANCE_TEST,
        targetId: testId,
        action: 'PERFORMANCE_TEST_REPORT_ATTACHED',
        nodeCode: WorkflowNodeCode.PERFORMANCE_TEST,
        summary: `性能试验记录 ${testRecord.testCode} 已上传报告附件。`,
        afterData: {
          reportAttachmentId: attachment.id,
          fileName: attachment.fileName,
        },
      });
    });

    return this.buildDetail(this.prisma, projectId, testId);
  }

  async submitTest(
    projectId: string,
    testId: string,
    actor: AuthenticatedUser,
  ) {
    await this.assertProjectAccess(projectId, actor, 'workflow.transition');
    this.assertActorCanManage(actor);

    await this.prisma.$transaction(async (tx) => {
      const { testRecord } = await this.lockPerformanceWriteContext(
        tx,
        projectId,
        testId,
      );

      if (!testRecord || !canEditPerformanceTest(testRecord.status)) {
        this.throwPerformanceTestStateChanged();
      }

      const submitIssue = getPerformanceTestSubmitIssue({
        standardValue: testRecord.standardValue,
        actualValue: testRecord.actualValue,
        result: testRecord.result,
        conclusion: testRecord.conclusion,
        testedById: testRecord.testedById,
        testedAt: testRecord.testedAt,
        reportAttachmentId: testRecord.reportAttachmentId,
        reportAttachmentScanStatus:
          testRecord.reportAttachment?.scanStatus ?? null,
        reportAttachmentIsDeleted:
          testRecord.reportAttachment?.isDeleted ?? null,
        sampleId: testRecord.sampleId,
        relatedObjectName: testRecord.relatedObjectName,
      });

      if (submitIssue) {
        throw new BadRequestException(submitIssue);
      }

      const submitted = await tx.performanceTest.updateMany({
        where: {
          id: testId,
          projectId,
          status: PerformanceTestStatus.DRAFT,
          updatedAt: testRecord.updatedAt,
        },
        data: {
          status: PerformanceTestStatus.SUBMITTED,
          submittedAt: new Date(),
        },
      });
      if (submitted.count !== 1) {
        this.throwPerformanceTestStateChanged();
      }
      const submittedTest = await this.getTestOrThrow(tx, projectId, testId);

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.PERFORMANCE_TEST,
        targetId: testId,
        action: 'PERFORMANCE_TEST_SUBMITTED',
        nodeCode: WorkflowNodeCode.PERFORMANCE_TEST,
        summary: `提交性能试验记录 ${submittedTest.testCode}`,
        beforeData: this.toPerformanceTestAuditSnapshot(testRecord),
        afterData: this.toPerformanceTestAuditSnapshot(submittedTest),
      });
    });

    return this.buildWorkspace(this.prisma, projectId);
  }

  async completeTask(projectId: string, actor: AuthenticatedUser) {
    await this.assertProjectAccess(projectId, actor, 'workflow.transition');
    this.assertActorCanManage(actor);

    await this.prisma.$transaction(async (tx) => {
      const context = await this.lockPerformanceCompletionContext(tx, projectId);

      if (!context.activeTask) {
        this.throwPerformanceTestStateChanged();
      }

      const completionIssue = getPerformanceTestCompletionIssue(context.records);

      if (completionIssue) {
        throw new BadRequestException(completionIssue);
      }

      await this.workflowsService.transitionTaskWithExecutor(
        tx,
        context.activeTask.id,
        WorkflowAction.COMPLETE,
        actor,
        {
          comment: '涂料性能试验节点已完成。',
          metadata: {
            testCount: context.records.length,
            submittedCount: context.records.filter(
              (record) => record.status === PerformanceTestStatus.SUBMITTED,
            ).length,
          },
        },
      );

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.WORKFLOW_TASK,
        targetId: context.activeTask.id,
        action: 'PERFORMANCE_TEST_TASK_COMPLETED',
        nodeCode: WorkflowNodeCode.PERFORMANCE_TEST,
        summary: '涂料性能试验节点已完成。',
        afterData: {
          workflowTaskId: context.activeTask.id,
          submittedCount: context.records.filter(
            (record) => record.status === PerformanceTestStatus.SUBMITTED,
          ).length,
        },
      });
    });

    return this.buildWorkspace(this.prisma, projectId);
  }

  private assertProjectAccess(
    projectId: string,
    actor: AuthenticatedUser,
    requiredPermission: string,
  ) {
    return this.projectAccessService.assertProjectAccessWithDefaultClient(
      projectId,
      actor,
      requiredPermission,
    );
  }

  private async buildWorkspace(
    db: PerformanceTestsDbClient,
    projectId: string,
  ) {
    const project = await this.getProjectOrThrow(db, projectId);
    const [records, activeTask, procurementCompleted, samples] = await Promise.all([
      db.performanceTest.findMany({
        where: {
          projectId,
        },
        include: PERFORMANCE_TEST_DETAIL_INCLUDE,
        orderBy: [
          { updatedAt: 'desc' },
          { createdAt: 'desc' },
        ],
      }),
      this.getActiveTask(db, projectId),
      this.hasCompletedProcurementTask(db, projectId),
      db.sample.findMany({
        where: {
          projectId,
          isCurrent: true,
        },
        orderBy: [
          { sampleNo: 'asc' },
          { versionNo: 'desc' },
        ],
      }),
    ]);

    return {
      project: {
        id: project.id,
        code: project.code,
        name: project.name,
        currentNodeCode: project.currentNodeCode,
        currentNodeName: getCurrentNodeName(project.currentNodeCode),
        targetDate: project.plannedEndDate?.toISOString() ?? null,
        riskLevel: project.priority,
      },
      procurementCompleted,
      activeTask: activeTask ? this.toWorkflowTaskSummary(activeTask) : null,
      canCompleteTask:
        Boolean(activeTask) && getPerformanceTestCompletionIssue(records) === null,
      completionIssue: getPerformanceTestCompletionIssue(records),
      sampleOptions: samples.map((sample) => ({
        id: sample.id,
        sampleNo: sample.sampleNo,
        sampleName: sample.sampleName,
        versionNo: sample.versionNo,
      })),
      statistics: {
        totalCount: records.length,
        submittedCount: records.filter(
          (record) => record.status === PerformanceTestStatus.SUBMITTED,
        ).length,
      },
      items: records.map((record) => this.toPerformanceTestSummary(record)),
    };
  }

  private async buildDetail(
    db: PerformanceTestsDbClient,
    projectId: string,
    testId: string,
  ) {
    const testRecord = await this.getTestOrThrow(db, projectId, testId);
    const attachments = await this.attachmentsService.listTargetAttachments(
      db,
      AttachmentTargetType.PERFORMANCE_TEST,
      testId,
    );

    return {
      ...this.toPerformanceTestSummary(testRecord),
      attachmentHistory: attachments.map((attachment) =>
        this.attachmentsService.toAttachmentSummary(attachment),
      ),
    };
  }

  private async getPerformanceContext(
    db: PerformanceTestsDbClient,
    projectId: string,
  ) {
    const [project, activeTask, procurementCompleted, records] = await Promise.all([
      this.getProjectOrThrow(db, projectId),
      this.getActiveTask(db, projectId),
      this.hasCompletedProcurementTask(db, projectId),
      db.performanceTest.findMany({
        where: {
          projectId,
        },
      }),
    ]);

    return {
      project,
      activeTask,
      procurementCompleted,
      records,
    };
  }

  private assertWritableStage(context: {
    procurementCompleted: boolean;
    activeTask: {
      id: string;
    } | null;
  }) {
    const issue = getPerformanceTestStageIssue({
      procurementCompleted: context.procurementCompleted,
      hasActiveTask: Boolean(context.activeTask),
    });

    if (issue) {
      throw new BadRequestException(issue);
    }
  }

  private assertActorCanManage(actor: AuthenticatedUser) {
    if (
      actor.isSystemAdmin ||
      actor.roleCodes.some(
        (roleCode) =>
          roleCode === 'admin' ||
          roleCode === 'project_manager' ||
          roleCode === 'process_engineer' ||
          roleCode === 'quality_engineer',
      )
    ) {
      return;
    }

    throw new BadRequestException('当前用户没有性能试验管理权限。');
  }

  private async getProjectOrThrow(db: PerformanceTestsDbClient, projectId: string) {
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        code: true,
        name: true,
        priority: true,
        currentNodeCode: true,
        plannedEndDate: true,
      },
    });

    if (!project) {
      throw new NotFoundException('项目不存在。');
    }

    return project;
  }

  private async getTestOrThrow(
    db: PerformanceTestsDbClient,
    projectId: string,
    testId: string,
  ) {
    const testRecord = await db.performanceTest.findFirst({
      where: {
        id: testId,
        projectId,
      },
      include: PERFORMANCE_TEST_DETAIL_INCLUDE,
    });

    if (!testRecord) {
      throw new NotFoundException('性能试验记录不存在。');
    }

    return testRecord;
  }

  private async lockPerformanceWriteContext(
    tx: Prisma.TransactionClient,
    projectId: string,
    testId?: string,
  ) {
    let testRecord: Awaited<ReturnType<typeof this.getTestOrThrow>> | null = null;

    if (testId) {
      if (!(await this.lockPerformanceTestRow(tx, projectId, testId))) {
        this.throwPerformanceTestStateChanged();
      }
      testRecord = await this.getTestOrThrow(tx, projectId, testId);
      if (!canEditPerformanceTest(testRecord.status)) {
        this.throwPerformanceTestStateChanged();
      }
    }

    const candidateContext = await this.getPerformanceContext(tx, projectId);
    this.assertWritableStage(candidateContext);
    const candidateTask = candidateContext.activeTask;
    if (!candidateTask) {
      this.throwPerformanceTestStateChanged();
    }

    if (
      !(await this.lockWorkflowTaskRow(tx, projectId, candidateTask.id))
    ) {
      this.throwPerformanceTestStateChanged();
    }

    const context = await this.getPerformanceContext(tx, projectId);
    if (!context.activeTask || context.activeTask.id !== candidateTask.id) {
      this.throwPerformanceTestStateChanged();
    }
    try {
      this.assertWritableStage(context);
    } catch {
      this.throwPerformanceTestStateChanged();
    }

    if (testId) {
      testRecord = await this.getTestOrThrow(tx, projectId, testId);
      if (!canEditPerformanceTest(testRecord.status)) {
        this.throwPerformanceTestStateChanged();
      }
    }

    return { context, testRecord };
  }

  private async lockPerformanceCompletionContext(
    tx: Prisma.TransactionClient,
    projectId: string,
  ) {
    const candidateContext = await this.getPerformanceContext(tx, projectId);
    this.assertWritableStage(candidateContext);
    const candidateTask = candidateContext.activeTask;
    if (!candidateTask) {
      this.throwPerformanceTestStateChanged();
    }

    const recordIds = candidateContext.records
      .map((record) => record.id)
      .sort((left, right) => left.localeCompare(right));
    for (const recordId of recordIds) {
      if (!(await this.lockPerformanceTestRow(tx, projectId, recordId))) {
        this.throwPerformanceTestStateChanged();
      }
    }

    if (!(await this.lockWorkflowTaskRow(tx, projectId, candidateTask.id))) {
      this.throwPerformanceTestStateChanged();
    }

    const context = await this.getPerformanceContext(tx, projectId);
    if (!context.activeTask || context.activeTask.id !== candidateTask.id) {
      this.throwPerformanceTestStateChanged();
    }
    try {
      this.assertWritableStage(context);
    } catch {
      this.throwPerformanceTestStateChanged();
    }
    return context;
  }

  private createReportAttachmentFinalizeHook(input: {
    projectId: string;
    testId: string;
    workflowTaskId: string;
    expectedAttachmentId: string | null;
  }) {
    return async (
      tx: Prisma.TransactionClient,
      context: { attachmentId: string },
    ) => {
      if (
        !(await this.lockPerformanceTestRow(tx, input.projectId, input.testId))
      ) {
        this.throwAttachmentTargetStateChanged();
      }
      const lockedTest = await tx.performanceTest.findFirst({
        where: { id: input.testId, projectId: input.projectId },
        select: {
          id: true,
          status: true,
          reportAttachmentId: true,
        },
      });
      if (
        !lockedTest ||
        lockedTest.status !== PerformanceTestStatus.DRAFT ||
        lockedTest.reportAttachmentId !== input.expectedAttachmentId
      ) {
        this.throwAttachmentTargetStateChanged();
      }

      if (
        !(await this.lockWorkflowTaskRow(
          tx,
          input.projectId,
          input.workflowTaskId,
        ))
      ) {
        this.throwAttachmentTargetStateChanged();
      }
      const activeTask = await tx.workflowTask.findFirst({
        where: {
          id: input.workflowTaskId,
          projectId: input.projectId,
          nodeCode: WorkflowNodeCode.PERFORMANCE_TEST,
          isActive: true,
        },
        select: { id: true },
      });
      if (!activeTask) {
        this.throwAttachmentTargetStateChanged();
      }

      if (input.expectedAttachmentId) {
        if (
          !(await this.lockAttachmentRow(
            tx,
            input.projectId,
            input.expectedAttachmentId,
          ))
        ) {
          this.throwAttachmentTargetStateChanged();
        }
        const replacement = await tx.attachment.findFirst({
          where: {
            id: input.expectedAttachmentId,
            projectId: input.projectId,
            entityType: AttachmentTargetType.PERFORMANCE_TEST,
            entityId: input.testId,
            isDeleted: false,
            scanStatus: AttachmentScanStatus.CLEAN,
          },
          select: { id: true },
        });
        if (!replacement) {
          this.throwAttachmentTargetStateChanged();
        }
      }

      const updated = await tx.performanceTest.updateMany({
        where: {
          id: input.testId,
          projectId: input.projectId,
          status: PerformanceTestStatus.DRAFT,
          reportAttachmentId: input.expectedAttachmentId,
        },
        data: { reportAttachmentId: context.attachmentId },
      });
      if (updated.count !== 1) {
        this.throwAttachmentTargetStateChanged();
      }
    };
  }

  private async lockPerformanceTestRow(
    tx: Prisma.TransactionClient,
    projectId: string,
    testId: string,
  ) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "performance_tests"
      WHERE "id" = ${testId} AND "projectId" = ${projectId}
      FOR UPDATE
    `);
    return rows.length === 1;
  }

  private async lockWorkflowTaskRow(
    tx: Prisma.TransactionClient,
    projectId: string,
    taskId: string,
  ) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "workflow_tasks"
      WHERE "id" = ${taskId} AND "projectId" = ${projectId}
      FOR UPDATE
    `);
    return rows.length === 1;
  }

  private async lockAttachmentRow(
    tx: Prisma.TransactionClient,
    projectId: string,
    attachmentId: string,
  ) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "attachments"
      WHERE "id" = ${attachmentId} AND "projectId" = ${projectId}
      FOR UPDATE
    `);
    return rows.length === 1;
  }

  private throwAttachmentTargetStateChanged(): never {
    throw new ConflictException({
      code: 'ATTACHMENT_TARGET_STATE_CHANGED',
      message: '附件扫描期间性能试验或流程状态已变更，请刷新后重试。',
    });
  }

  private throwPerformanceTestStateChanged(): never {
    throw new ConflictException({
      code: 'PERFORMANCE_TEST_STATE_CHANGED',
      message: '性能试验记录或流程状态已变更，请刷新后重试。',
    });
  }

  private async getActiveTask(db: PerformanceTestsDbClient, projectId: string) {
    return db.workflowTask.findFirst({
      where: {
        projectId,
        nodeCode: WorkflowNodeCode.PERFORMANCE_TEST,
        isActive: true,
      },
      include: {
        assigneeUser: true,
        assigneeDepartment: true,
      },
      orderBy: [
        { createdAt: 'desc' },
        { taskRound: 'desc' },
      ],
    });
  }

  private async hasCompletedProcurementTask(
    db: PerformanceTestsDbClient,
    projectId: string,
  ) {
    const completedTask = await db.workflowTask.findFirst({
      where: {
        projectId,
        nodeCode: WorkflowNodeCode.PAINT_PROCUREMENT,
        status: {
          in: [WorkflowTaskStatus.COMPLETED],
        },
      },
      select: {
        id: true,
      },
    });

    return Boolean(completedTask);
  }

  private async assertUniqueTestCode(
    db: PerformanceTestsDbClient,
    projectId: string,
    testCode: string,
    excludedTestId?: string,
  ) {
    const duplicatedRecord = await db.performanceTest.findFirst({
      where: {
        projectId,
        testCode,
        ...(excludedTestId
          ? {
              NOT: {
                id: excludedTestId,
              },
            }
          : {}),
      },
      select: {
        id: true,
      },
    });

    if (duplicatedRecord) {
      throw new BadRequestException('试验编码已存在。');
    }
  }

  private async assertSampleReference(
    db: PerformanceTestsDbClient,
    projectId: string,
    sampleId: string | null,
  ) {
    if (!sampleId) {
      return;
    }

    const sample = await db.sample.findFirst({
      where: {
        id: sampleId,
        projectId,
      },
      select: {
        id: true,
      },
    });

    if (!sample) {
      throw new BadRequestException('关联样板不存在。');
    }
  }

  private async assertTesterReference(db: PerformanceTestsDbClient, testedById: string) {
    const tester = await db.user.findFirst({
      where: {
        id: testedById,
        status: UserStatus.ACTIVE,
      },
      select: {
        id: true,
      },
    });

    if (!tester) {
      throw new BadRequestException('试验人不存在。');
    }
  }

  private parseWriteInput(rawInput: unknown): PerformanceTestWriteInput {
    if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
      throw new BadRequestException('性能试验数据格式不正确。');
    }

    const input = rawInput as Record<string, unknown>;
    const testCode = typeof input.testCode === 'string' ? input.testCode.trim() : '';
    const sampleId =
      typeof input.sampleId === 'string' && input.sampleId.trim().length > 0
        ? input.sampleId.trim()
        : null;
    const relatedObjectName =
      typeof input.relatedObjectName === 'string' && input.relatedObjectName.trim().length > 0
        ? input.relatedObjectName.trim()
        : null;
    const testItem =
      typeof input.testItem === 'string' &&
      PERFORMANCE_TEST_TYPE_VALUES.includes(input.testItem as PerformanceTestType)
        ? (input.testItem as PerformanceTestType)
        : null;
    const standardValue =
      typeof input.standardValue === 'string' ? input.standardValue.trim() : '';
    const actualValue =
      typeof input.actualValue === 'string' ? input.actualValue.trim() : '';
    const result =
      typeof input.result === 'string' &&
      PERFORMANCE_TEST_RESULT_VALUES.includes(input.result as PerformanceTestResult)
        ? (input.result as PerformanceTestResult)
        : null;
    const conclusion =
      typeof input.conclusion === 'string' ? input.conclusion.trim() : '';
    const testedById =
      typeof input.testedById === 'string' ? input.testedById.trim() : '';
    const testedAt = this.parseDate(input.testedAt, '试验时间');

    if (!testCode) {
      throw new BadRequestException('试验编码不能为空。');
    }

    if (!sampleId && !relatedObjectName) {
      throw new BadRequestException('必须选择关联样板或填写关联对象。');
    }

    if (!testItem) {
      throw new BadRequestException('试验项目不能为空。');
    }

    if (!standardValue) {
      throw new BadRequestException('标准值不能为空。');
    }

    if (!actualValue) {
      throw new BadRequestException('实测值不能为空。');
    }

    if (!result) {
      throw new BadRequestException('试验结果不能为空。');
    }

    if (!conclusion) {
      throw new BadRequestException('试验结论不能为空。');
    }

    if (!testedById) {
      throw new BadRequestException('试验人不能为空。');
    }

    return {
      testCode,
      sampleId,
      relatedObjectName,
      testItem,
      standardValue,
      actualValue,
      result,
      conclusion,
      testedById,
      testedAt,
    };
  }

  private parseDate(value: unknown, label: string) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException(`${label}不能为空。`);
    }

    const parsedDate = new Date(value);

    if (Number.isNaN(parsedDate.getTime())) {
      throw new BadRequestException(`${label}格式不正确。`);
    }

    return parsedDate;
  }

  private toWorkflowTaskSummary(
    task: Prisma.WorkflowTaskGetPayload<{
      include: {
        assigneeUser: true;
        assigneeDepartment: true;
      };
    }>,
  ) {
    return {
      id: task.id,
      taskNo: task.taskNo,
      nodeCode: task.nodeCode,
      nodeName: task.nodeName,
      taskRound: task.taskRound,
      status: task.status,
      isPrimary: task.isPrimary,
      isActive: task.isActive,
      assigneeUserId: task.assigneeUserId,
      assigneeUserName: task.assigneeUser?.name ?? null,
      assigneeDepartmentId: task.assigneeDepartmentId,
      assigneeDepartmentName: task.assigneeDepartment?.name ?? null,
      dueAt: task.dueAt?.toISOString() ?? null,
      startedAt: task.startedAt?.toISOString() ?? null,
      completedAt: task.completedAt?.toISOString() ?? null,
      returnedAt: task.returnedAt?.toISOString() ?? null,
      payload: task.payload,
      availableActions: task.isActive
        ? getAllowedWorkflowActions(task.nodeCode).filter((action) =>
            isWorkflowActionCurrentlyAvailable(task.status, action),
          )
        : [],
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    };
  }

  private toPerformanceTestSummary(
    testRecord: Prisma.PerformanceTestGetPayload<{
      include: typeof PERFORMANCE_TEST_DETAIL_INCLUDE;
    }>,
  ) {
    return {
      id: testRecord.id,
      testCode: testRecord.testCode,
      sampleId: testRecord.sampleId,
      relatedObjectName: testRecord.relatedObjectName,
      testItem: testRecord.testItem,
      standardValue: testRecord.standardValue,
      actualValue: testRecord.actualValue,
      result: testRecord.result,
      conclusion: testRecord.conclusion,
      testedById: testRecord.testedById,
      testedByName: testRecord.testedBy?.name ?? null,
      testedAt: testRecord.testedAt?.toISOString() ?? null,
      status: testRecord.status,
      submittedAt: testRecord.submittedAt?.toISOString() ?? null,
      createdAt: testRecord.createdAt.toISOString(),
      updatedAt: testRecord.updatedAt.toISOString(),
      sample: testRecord.sample
        ? {
            id: testRecord.sample.id,
            sampleNo: testRecord.sample.sampleNo,
            sampleName: testRecord.sample.sampleName,
            versionNo: testRecord.sample.versionNo,
          }
        : null,
      reportAttachment:
        testRecord.reportAttachment &&
        !testRecord.reportAttachment.isDeleted &&
        testRecord.reportAttachment.scanStatus === AttachmentScanStatus.CLEAN
        ? this.attachmentsService.toAttachmentSummary(testRecord.reportAttachment)
        : null,
    };
  }

  private toPerformanceTestAuditSnapshot(
    testRecord: Prisma.PerformanceTestGetPayload<{
      include: typeof PERFORMANCE_TEST_DETAIL_INCLUDE;
    }>,
  ) {
    return {
      id: testRecord.id,
      testCode: testRecord.testCode,
      sampleId: testRecord.sampleId,
      relatedObjectName: testRecord.relatedObjectName,
      testItem: testRecord.testItem,
      standardValue: testRecord.standardValue,
      actualValue: testRecord.actualValue,
      result: testRecord.result,
      conclusion: testRecord.conclusion,
      testedById: testRecord.testedById,
      testedByName: testRecord.testedBy?.name ?? null,
      testedAt: testRecord.testedAt?.toISOString() ?? null,
      reportAttachmentId: testRecord.reportAttachmentId,
      status: testRecord.status,
    } satisfies Prisma.InputJsonValue;
  }
}
