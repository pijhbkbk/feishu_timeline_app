import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditTargetType,
  DevelopmentReportStatus,
  Prisma,
  WorkflowAction,
  WorkflowNodeCode,
} from '@prisma/client';

import { PrismaService } from '../../infra/prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ProjectAccessService } from '../auth/project-access.service';
import {
  getAllowedWorkflowActions,
  getCurrentNodeName,
  isWorkflowActionCurrentlyAvailable,
} from '../workflows/workflow-node.constants';
import { WorkflowsService } from '../workflows/workflows.service';

type DevelopmentReportDbClient = Prisma.TransactionClient | PrismaService;

const DEVELOPMENT_REPORT_MAX_PAYLOAD_BYTES = 16 * 1024;
const DEVELOPMENT_REPORT_MAX_POSTGRES_INT = 2_147_483_647;
const DEVELOPMENT_REPORT_NAME_MAX_CHARS = 200;
const DEVELOPMENT_REPORT_SHORT_TEXT_MAX_CHARS = 500;
const DEVELOPMENT_REPORT_LONG_TEXT_MAX_CHARS = 4_000;
const DEVELOPMENT_REPORT_COMMENT_MAX_CHARS = 2_000;

type DevelopmentReportWriteInput = {
  reportTitle?: string;
  demandSource: string;
  targetMarket: string | null;
  targetVehicleModel: string | null;
  targetColorName: string;
  benchmarkColorRef: string | null;
  developmentReason: string;
  expectedLaunchDate: Date | null;
  estimatedAnnualVolume: number | null;
  technicalRequirements: string | null;
  qualityRequirements: string | null;
  costTarget: string | null;
  riskSummary: string | null;
  remark: string | null;
  submitComment: string | null;
};

type DevelopmentReportTaskRecord = Prisma.WorkflowTaskGetPayload<{
  include: {
    assigneeUser: true;
    assigneeDepartment: true;
    workflowInstance: true;
  };
}>;

type DevelopmentReportRecord = Prisma.DevelopmentReportGetPayload<{
  include: {
    workflowTask: true;
    createdBy: true;
    updatedBy: true;
    submittedBy: true;
  };
}>;

@Injectable()
export class DevelopmentReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowsService: WorkflowsService,
    private readonly activityLogsService: ActivityLogsService,
    private readonly projectAccessService: ProjectAccessService,
  ) {}

  async getWorkspace(projectId: string, actor: AuthenticatedUser) {
    await this.assertProjectAccess(projectId, actor, 'project.read');
    return this.buildWorkspaceResponse(this.prisma, projectId, actor);
  }

  async saveReport(
    projectId: string,
    rawInput: unknown,
    actor: AuthenticatedUser,
  ) {
    await this.assertProjectAccess(projectId, actor, 'workflow.transition');
    const input = this.parseWriteInput(rawInput);

    return this.prisma.$transaction(async (tx) => {
      const project = await this.getProjectOrThrow(tx, projectId);
      const { activeTask, existingReport } =
        await this.lockDevelopmentReportWriteState(tx, projectId);

      this.assertActorCanOperateTask(activeTask, actor);
      const savedReport = await this.upsertReportForTask(tx, {
        project,
        activeTask,
        actor,
        input,
        existingReport,
        submit: false,
      });

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.DEVELOPMENT_REPORT,
        targetId: savedReport.id,
        action: existingReport ? 'DEVELOPMENT_REPORT_UPDATED' : 'DEVELOPMENT_REPORT_CREATED',
        nodeCode: WorkflowNodeCode.DEVELOPMENT_REPORT,
        summary: `${project.name} 的新颜色开发报告已保存。`,
        ...(existingReport
          ? { beforeData: this.toAuditSnapshot(existingReport) }
          : {}),
        afterData: this.toAuditSnapshot(savedReport),
        metadata: {
          workflowTaskId: activeTask.id,
          workflowInstanceId: activeTask.workflowInstanceId,
          savedAs: 'draft',
        },
      });

      return this.buildWorkspaceResponse(tx, projectId, actor);
    });
  }

  async submitReport(
    projectId: string,
    rawInput: unknown,
    actor: AuthenticatedUser,
  ) {
    await this.assertProjectAccess(projectId, actor, 'workflow.transition');
    const input = this.parseWriteInput(rawInput);

    return this.prisma.$transaction(async (tx) => {
      const project = await this.getProjectOrThrow(tx, projectId);
      const { activeTask, existingReport } =
        await this.lockDevelopmentReportWriteState(tx, projectId);

      this.assertActorCanOperateTask(activeTask, actor);
      this.assertTaskCanSubmit(activeTask);
      const submittedReport = await this.upsertReportForTask(tx, {
        project,
        activeTask,
        actor,
        input,
        existingReport,
        submit: true,
      });

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.DEVELOPMENT_REPORT,
        targetId: submittedReport.id,
        action: 'DEVELOPMENT_REPORT_SUBMITTED',
        nodeCode: WorkflowNodeCode.DEVELOPMENT_REPORT,
        summary: `${project.name} 的新颜色开发报告已提交。`,
        ...(existingReport
          ? { beforeData: this.toAuditSnapshot(existingReport) }
          : {}),
        afterData: this.toAuditSnapshot(submittedReport),
        metadata: {
          workflowTaskId: activeTask.id,
          workflowInstanceId: activeTask.workflowInstanceId,
          submitComment: input.submitComment,
        },
      });

      await this.workflowsService.transitionTaskWithExecutor(
        tx,
        activeTask.id,
        WorkflowAction.SUBMIT,
        actor,
        {
          comment: input.submitComment ?? '新颜色开发报告已提交。',
          metadata: {
            source: 'development-report',
            reportId: submittedReport.id,
          },
        },
      );

      return this.buildWorkspaceResponse(tx, projectId, actor);
    });
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

  private async buildWorkspaceResponse(
    db: DevelopmentReportDbClient,
    projectId: string,
    actor: AuthenticatedUser,
  ) {
    const project = await this.getProjectOrThrow(db, projectId);
    const activeTask = await this.getActiveTask(db, projectId);
    const currentReport = activeTask ? await this.getReportByTaskId(db, activeTask.id) : null;
    const latestReport = await db.developmentReport.findFirst({
      where: { projectId },
      include: {
        workflowTask: true,
        createdBy: true,
        updatedBy: true,
        submittedBy: true,
      },
      orderBy: [
        { submittedAt: 'desc' },
        { updatedAt: 'desc' },
      ],
    });

    const editable =
      activeTask !== null && this.canActorOperateTask(activeTask, actor);

    const submitAllowed =
      activeTask !== null &&
      this.canActorOperateTask(activeTask, actor) &&
      this.canSubmitTask(activeTask);

    return {
      project: {
        id: project.id,
        code: project.code,
        name: project.name,
        currentNodeCode: project.currentNodeCode,
        currentNodeName: getCurrentNodeName(project.currentNodeCode),
        targetDate: project.plannedEndDate?.toISOString() ?? null,
      },
      activeTask: activeTask ? this.toTaskSummary(activeTask) : null,
      currentReport: currentReport ? this.toReportSummary(currentReport) : null,
      latestReport: latestReport ? this.toReportSummary(latestReport) : null,
      editable,
      submitAllowed,
    };
  }

  private async upsertReportForTask(
    tx: Prisma.TransactionClient,
    input: {
      project: {
        id: string;
        name: string;
      };
      activeTask: DevelopmentReportTaskRecord;
      actor: AuthenticatedUser;
      existingReport: DevelopmentReportRecord | null;
      input: DevelopmentReportWriteInput;
      submit: boolean;
    },
  ) {
    const now = new Date();
    const resolvedTitle = this.assertBoundedString(
      input.input.reportTitle?.trim() ||
      input.existingReport?.reportTitle ||
        `${input.project.name} 新颜色开发报告`,
      'reportTitle',
      DEVELOPMENT_REPORT_NAME_MAX_CHARS,
    );
    const status = input.submit
      ? DevelopmentReportStatus.SUBMITTED
      : DevelopmentReportStatus.DRAFT;
    const reportData = {
      reportTitle: resolvedTitle,
      demandSource: input.input.demandSource,
      targetMarket: input.input.targetMarket,
      targetVehicleModel: input.input.targetVehicleModel,
      targetColorName: input.input.targetColorName,
      benchmarkColorRef: input.input.benchmarkColorRef,
      developmentReason: input.input.developmentReason,
      expectedLaunchDate: input.input.expectedLaunchDate,
      estimatedAnnualVolume: input.input.estimatedAnnualVolume,
      technicalRequirements: input.input.technicalRequirements,
      qualityRequirements: input.input.qualityRequirements,
      costTarget: input.input.costTarget,
      riskSummary: input.input.riskSummary,
      remark: input.input.remark,
      status,
      updatedById: input.actor.id,
      submittedById: input.submit ? input.actor.id : null,
      submittedAt: input.submit ? now : null,
    };

    if (input.existingReport) {
      const updated = await tx.developmentReport.updateMany({
        where: {
          id: input.existingReport.id,
          workflowTaskId: input.activeTask.id,
          status: DevelopmentReportStatus.DRAFT,
          submittedAt: null,
          updatedAt: input.existingReport.updatedAt,
        },
        data: reportData,
      });
      if (updated.count !== 1) {
        this.throwDevelopmentReportStateChanged();
      }
    } else {
      await tx.developmentReport.create({
        data: {
          projectId: input.project.id,
          workflowInstanceId: input.activeTask.workflowInstanceId,
          workflowTaskId: input.activeTask.id,
          createdById: input.actor.id,
          ...reportData,
        },
      });
    }

    const savedReport = await this.getReportByTaskId(tx, input.activeTask.id);

    if (!savedReport) {
      throw new NotFoundException('开发报告不存在或已被删除。');
    }

    return savedReport;
  }

  private async getProjectOrThrow(db: DevelopmentReportDbClient, projectId: string) {
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        code: true,
        name: true,
        currentNodeCode: true,
        plannedEndDate: true,
      },
    });

    if (!project) {
      throw new NotFoundException('项目不存在或已被删除。');
    }

    return project;
  }

  private getActiveTask(db: DevelopmentReportDbClient, projectId: string) {
    return db.workflowTask.findFirst({
      where: {
        projectId,
        nodeCode: WorkflowNodeCode.DEVELOPMENT_REPORT,
        isActive: true,
      },
      include: {
        assigneeUser: true,
        assigneeDepartment: true,
        workflowInstance: true,
      },
      orderBy: [
        { createdAt: 'desc' },
        { taskRound: 'desc' },
      ],
    });
  }

  private async getActiveTaskOrThrow(
    db: DevelopmentReportDbClient,
    projectId: string,
  ) {
    const activeTask = await this.getActiveTask(db, projectId);

    if (!activeTask) {
      throw new BadRequestException('当前项目没有可编辑的新颜色开发报告节点。');
    }

    return activeTask;
  }

  private getReportByTaskId(
    db: DevelopmentReportDbClient,
    workflowTaskId: string,
  ) {
    return db.developmentReport.findUnique({
      where: { workflowTaskId },
      include: {
        workflowTask: true,
        createdBy: true,
        updatedBy: true,
        submittedBy: true,
      },
    });
  }

  private async lockDevelopmentReportWriteState(
    tx: Prisma.TransactionClient,
    projectId: string,
  ) {
    const candidateTask = await this.getActiveTaskOrThrow(tx, projectId);
    const candidateReport = await this.getReportByTaskId(tx, candidateTask.id);

    if (
      candidateReport &&
      !(await this.lockDevelopmentReportRow(
        tx,
        projectId,
        candidateReport.id,
      ))
    ) {
      this.throwDevelopmentReportStateChanged();
    }

    if (
      !(await this.lockDevelopmentReportTaskRow(
        tx,
        projectId,
        candidateTask.id,
      ))
    ) {
      this.throwDevelopmentReportStateChanged();
    }

    const activeTask = await this.getExactActiveTask(
      tx,
      projectId,
      candidateTask.id,
    );
    if (!activeTask) {
      this.throwDevelopmentReportStateChanged();
    }

    const existingReport = await this.getReportByTaskId(tx, activeTask.id);
    if (
      (candidateReport && existingReport?.id !== candidateReport.id) ||
      existingReport?.status === DevelopmentReportStatus.SUBMITTED ||
      existingReport?.submittedAt
    ) {
      this.throwDevelopmentReportStateChanged();
    }

    return { activeTask, existingReport };
  }

  private getExactActiveTask(
    db: DevelopmentReportDbClient,
    projectId: string,
    taskId: string,
  ) {
    return db.workflowTask.findFirst({
      where: {
        id: taskId,
        projectId,
        nodeCode: WorkflowNodeCode.DEVELOPMENT_REPORT,
        isActive: true,
      },
      include: {
        assigneeUser: true,
        assigneeDepartment: true,
        workflowInstance: true,
      },
    });
  }

  private async lockDevelopmentReportRow(
    tx: Prisma.TransactionClient,
    projectId: string,
    reportId: string,
  ) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "development_reports"
      WHERE "id" = ${reportId} AND "projectId" = ${projectId}
      FOR UPDATE
    `);
    return rows.length === 1;
  }

  private async lockDevelopmentReportTaskRow(
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

  private throwDevelopmentReportStateChanged(): never {
    throw new ConflictException({
      code: 'DEVELOPMENT_REPORT_STATE_CHANGED',
      message: '开发报告或流程状态已变更，请刷新后重试。',
    });
  }

  private assertTaskCanSubmit(task: DevelopmentReportTaskRecord) {
    if (!this.canSubmitTask(task)) {
      throw new BadRequestException('当前开发报告节点状态不允许提交。');
    }
  }

  private canSubmitTask(task: DevelopmentReportTaskRecord) {
    return getAllowedWorkflowActions(task.nodeCode).includes(WorkflowAction.SUBMIT) &&
      isWorkflowActionCurrentlyAvailable(task.status, WorkflowAction.SUBMIT);
  }

  private assertActorCanOperateTask(
    task: DevelopmentReportTaskRecord,
    actor: AuthenticatedUser,
  ) {
    if (this.canActorOperateTask(task, actor)) {
      return;
    }

    throw new BadRequestException('当前登录用户不是该开发报告节点负责人。');
  }

  private canActorOperateTask(
    task: DevelopmentReportTaskRecord,
    actor: AuthenticatedUser,
  ) {
    if (actor.isSystemAdmin || actor.roleCodes.includes('admin') || actor.roleCodes.includes('project_manager')) {
      return true;
    }

    if (!task.assigneeUserId) {
      return true;
    }

    return task.assigneeUserId === actor.id;
  }

  private toTaskSummary(task: DevelopmentReportTaskRecord) {
    return {
      id: task.id,
      taskNo: task.taskNo,
      nodeCode: task.nodeCode,
      nodeName: task.nodeName,
      status: task.status,
      assigneeUserId: task.assigneeUserId,
      assigneeUserName: task.assigneeUser?.name ?? null,
      assigneeDepartmentId: task.assigneeDepartmentId,
      assigneeDepartmentName: task.assigneeDepartment?.name ?? null,
      dueAt: task.dueAt?.toISOString() ?? null,
      startedAt: task.startedAt?.toISOString() ?? null,
      returnedAt: task.returnedAt?.toISOString() ?? null,
      availableActions: getAllowedWorkflowActions(task.nodeCode).filter((action) =>
        isWorkflowActionCurrentlyAvailable(task.status, action),
      ),
    };
  }

  private toReportSummary(report: DevelopmentReportRecord) {
    return {
      id: report.id,
      projectId: report.projectId,
      workflowInstanceId: report.workflowInstanceId,
      workflowTaskId: report.workflowTaskId,
      workflowTaskNo: report.workflowTask.taskNo,
      taskStatus: report.workflowTask.status,
      taskRound: report.workflowTask.taskRound,
      status: report.status,
      reportTitle: report.reportTitle,
      demandSource: report.demandSource,
      targetMarket: report.targetMarket,
      targetVehicleModel: report.targetVehicleModel,
      targetColorName: report.targetColorName,
      benchmarkColorRef: report.benchmarkColorRef,
      developmentReason: report.developmentReason,
      expectedLaunchDate: report.expectedLaunchDate?.toISOString() ?? null,
      estimatedAnnualVolume: report.estimatedAnnualVolume,
      technicalRequirements: report.technicalRequirements,
      qualityRequirements: report.qualityRequirements,
      costTarget: report.costTarget,
      riskSummary: report.riskSummary,
      remark: report.remark,
      createdByName: report.createdBy?.name ?? null,
      updatedByName: report.updatedBy?.name ?? null,
      submittedByName: report.submittedBy?.name ?? null,
      submittedAt: report.submittedAt?.toISOString() ?? null,
      createdAt: report.createdAt.toISOString(),
      updatedAt: report.updatedAt.toISOString(),
    };
  }

  private parseWriteInput(rawInput: unknown): DevelopmentReportWriteInput {
    const input = this.asRecord(rawInput, 'Invalid development report payload.');
    const reportTitle = this.parseOptionalString(
      input.reportTitle,
      'reportTitle',
      DEVELOPMENT_REPORT_NAME_MAX_CHARS,
    );

    const normalized: DevelopmentReportWriteInput = {
      demandSource: this.parseRequiredString(
        input.demandSource,
        'demandSource',
        DEVELOPMENT_REPORT_SHORT_TEXT_MAX_CHARS,
      ),
      targetMarket: this.parseNullableString(
        input.targetMarket,
        'targetMarket',
        DEVELOPMENT_REPORT_NAME_MAX_CHARS,
      ),
      targetVehicleModel: this.parseNullableString(
        input.targetVehicleModel,
        'targetVehicleModel',
        DEVELOPMENT_REPORT_NAME_MAX_CHARS,
      ),
      targetColorName: this.parseRequiredString(
        input.targetColorName,
        'targetColorName',
        DEVELOPMENT_REPORT_NAME_MAX_CHARS,
      ),
      benchmarkColorRef: this.parseNullableString(
        input.benchmarkColorRef,
        'benchmarkColorRef',
        DEVELOPMENT_REPORT_NAME_MAX_CHARS,
      ),
      developmentReason: this.parseRequiredString(
        input.developmentReason,
        'developmentReason',
        DEVELOPMENT_REPORT_LONG_TEXT_MAX_CHARS,
      ),
      expectedLaunchDate: this.parseOptionalDate(input.expectedLaunchDate, 'expectedLaunchDate'),
      estimatedAnnualVolume: this.parseOptionalInt(
        input.estimatedAnnualVolume,
        'estimatedAnnualVolume',
      ),
      technicalRequirements: this.parseNullableString(
        input.technicalRequirements,
        'technicalRequirements',
        DEVELOPMENT_REPORT_LONG_TEXT_MAX_CHARS,
      ),
      qualityRequirements: this.parseNullableString(
        input.qualityRequirements,
        'qualityRequirements',
        DEVELOPMENT_REPORT_LONG_TEXT_MAX_CHARS,
      ),
      costTarget: this.parseNullableString(
        input.costTarget,
        'costTarget',
        DEVELOPMENT_REPORT_SHORT_TEXT_MAX_CHARS,
      ),
      riskSummary: this.parseNullableString(
        input.riskSummary,
        'riskSummary',
        DEVELOPMENT_REPORT_LONG_TEXT_MAX_CHARS,
      ),
      remark: this.parseNullableString(
        input.remark,
        'remark',
        DEVELOPMENT_REPORT_LONG_TEXT_MAX_CHARS,
      ),
      submitComment: this.parseNullableString(
        input.submitComment,
        'submitComment',
        DEVELOPMENT_REPORT_COMMENT_MAX_CHARS,
      ),
      ...(reportTitle ? { reportTitle } : {}),
    };

    if (
      Buffer.byteLength(JSON.stringify(normalized), 'utf8') >
      DEVELOPMENT_REPORT_MAX_PAYLOAD_BYTES
    ) {
      this.throwInputOutOfBounds(
        `新颜色开发报告不得超过 ${DEVELOPMENT_REPORT_MAX_PAYLOAD_BYTES} 字节。`,
      );
    }

    return normalized;
  }

  private toAuditSnapshot(report: DevelopmentReportRecord) {
    return {
      id: report.id,
      workflowTaskId: report.workflowTaskId,
      status: report.status,
      reportTitle: report.reportTitle,
      demandSource: report.demandSource,
      targetColorName: report.targetColorName,
      developmentReason: report.developmentReason,
      expectedLaunchDate: report.expectedLaunchDate?.toISOString() ?? null,
      estimatedAnnualVolume: report.estimatedAnnualVolume,
      updatedAt: report.updatedAt.toISOString(),
      submittedAt: report.submittedAt?.toISOString() ?? null,
    };
  }

  private asRecord(rawValue: unknown, message: string) {
    if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) {
      throw new BadRequestException(message);
    }

    return rawValue as Record<string, unknown>;
  }

  private parseRequiredString(rawValue: unknown, fieldName: string, maxChars: number) {
    if (typeof rawValue !== 'string' || rawValue.trim().length === 0) {
      throw new BadRequestException('必填字段不能为空。');
    }

    return this.assertBoundedString(rawValue.trim(), fieldName, maxChars);
  }

  private parseOptionalString(rawValue: unknown, fieldName: string, maxChars: number) {
    if (rawValue === undefined || rawValue === null || rawValue === '') {
      return undefined;
    }

    if (typeof rawValue !== 'string') {
      throw new BadRequestException('字段必须为文本。');
    }

    return this.assertBoundedString(rawValue.trim(), fieldName, maxChars);
  }

  private parseNullableString(rawValue: unknown, fieldName: string, maxChars: number) {
    if (rawValue === undefined || rawValue === null || rawValue === '') {
      return null;
    }

    if (typeof rawValue !== 'string') {
      throw new BadRequestException('字段必须为文本。');
    }

    return this.assertBoundedString(rawValue.trim(), fieldName, maxChars);
  }

  private parseOptionalDate(rawValue: unknown, fieldName: string) {
    void fieldName;

    if (rawValue === undefined || rawValue === null || rawValue === '') {
      return null;
    }

    if (typeof rawValue !== 'string') {
      throw new BadRequestException('日期格式不正确。');
    }

    const value = new Date(rawValue);

    if (Number.isNaN(value.getTime())) {
      throw new BadRequestException('日期格式不正确。');
    }

    return value;
  }

  private parseOptionalInt(rawValue: unknown, fieldName: string) {
    void fieldName;

    if (rawValue === undefined || rawValue === null || rawValue === '') {
      return null;
    }

    if (
      typeof rawValue === 'number' &&
      Number.isInteger(rawValue) &&
      rawValue >= 0 &&
      rawValue <= DEVELOPMENT_REPORT_MAX_POSTGRES_INT
    ) {
      return rawValue;
    }

    if (typeof rawValue === 'string' && /^\d{1,10}$/.test(rawValue)) {
      const parsed = Number(rawValue);
      if (parsed <= DEVELOPMENT_REPORT_MAX_POSTGRES_INT) {
        return parsed;
      }
    }

    this.throwInputOutOfBounds('数值参数超出允许范围。');
  }

  private assertBoundedString(value: string, fieldName: string, maxChars: number) {
    if (value.length > maxChars) {
      this.throwInputOutOfBounds(`${fieldName} 不得超过 ${maxChars} 个字符。`);
    }

    return value;
  }

  private throwInputOutOfBounds(message: string): never {
    throw new BadRequestException({
      code: 'DEVELOPMENT_REPORT_INPUT_OUT_OF_BOUNDS',
      message,
    });
  }
}
