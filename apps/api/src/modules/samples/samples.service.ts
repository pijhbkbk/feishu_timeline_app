import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AttachmentTargetType,
  AuditTargetType,
  SampleConfirmationDecision,
  SampleStatus,
  SampleType,
  WorkflowAction,
  WorkflowNodeCode,
  type Prisma,
} from '@prisma/client';

import { PrismaService } from '../../infra/prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { AttachmentsService } from '../attachments/attachments.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  getAllowedWorkflowActions,
  getCurrentNodeName,
  isWorkflowActionCurrentlyAvailable,
} from '../workflows/workflow-node.constants';
import { WorkflowsService } from '../workflows/workflows.service';

type SamplesDbClient = Prisma.TransactionClient | PrismaService;

type UploadedBinaryFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

type SampleWriteInput = {
  sampleNo: string;
  sampleName: string;
  sampleType: SampleType;
  location: string | null;
  remark: string | null;
  producedAt: Date | null;
  createNewVersion: boolean;
};

type SampleUpdateInput = {
  sampleName?: string;
  sampleType?: SampleType;
  location?: string | null;
  remark?: string | null;
  producedAt?: Date | null;
};

type SampleConfirmationInput = {
  sampleId: string;
  decision: SampleConfirmationDecision;
  colorAssessment: string | null;
  appearanceAssessment: string | null;
  comment: string | null;
};

type ActiveTaskRecord = Prisma.WorkflowTaskGetPayload<{
  include: {
    assigneeUser: true;
    assigneeDepartment: true;
    workflowInstance: true;
  };
}>;

type SampleRecord = Prisma.SampleGetPayload<Record<string, never>>;

@Injectable()
export class SamplesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLogsService: ActivityLogsService,
    private readonly attachmentsService: AttachmentsService,
    private readonly workflowsService: WorkflowsService,
  ) {}

  getWorkspace(projectId: string) {
    return this.buildWorkspace(this.prisma, projectId);
  }

  getSampleDetail(projectId: string, sampleId: string) {
    return this.buildSampleDetail(this.prisma, projectId, sampleId);
  }

  async createSample(
    projectId: string,
    rawInput: unknown,
    actor: AuthenticatedUser,
  ) {
    const input = this.parseSampleWriteInput(rawInput);

    return this.prisma.$transaction(async (tx) => {
      await this.getProjectOrThrow(tx, projectId);

      const existingVersions = await tx.sample.findMany({
        where: {
          projectId,
          sampleNo: input.sampleNo,
        },
        orderBy: {
          versionNo: 'desc',
        },
      });

      if (input.createNewVersion && existingVersions.length === 0) {
        throw new BadRequestException('未找到可创建新版本的样板编号。');
      }

      if (!input.createNewVersion && existingVersions.length > 0) {
        throw new BadRequestException('样板编号已存在，如需新增版本请勾选创建新版本。');
      }

      if (input.createNewVersion) {
        await tx.sample.updateMany({
          where: {
            projectId,
            sampleNo: input.sampleNo,
            isCurrent: true,
          },
          data: {
            isCurrent: false,
          },
        });
      }

      const createdSample = await tx.sample.create({
        data: {
          projectId,
          sampleNo: input.sampleNo,
          sampleName: input.sampleName,
          versionNo: input.createNewVersion ? (existingVersions[0]?.versionNo ?? 0) + 1 : 1,
          isCurrent: true,
          sampleType: input.sampleType,
          status: input.producedAt ? SampleStatus.IN_PREPARATION : SampleStatus.DRAFT,
          location: input.location,
          remark: input.remark,
          producedAt: input.producedAt,
        },
      });

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.SAMPLE,
        targetId: createdSample.id,
        action: input.createNewVersion ? 'SAMPLE_VERSION_CREATED' : 'SAMPLE_CREATED',
        nodeCode: WorkflowNodeCode.SAMPLE_COLOR_CONFIRMATION,
        summary: `${createdSample.sampleNo} ${input.createNewVersion ? '新版本' : '样板'}已创建。`,
        afterData: this.toSampleAuditSnapshot(createdSample),
      });

      return this.buildSampleDetail(tx, projectId, createdSample.id);
    });
  }

  async updateSample(
    projectId: string,
    sampleId: string,
    rawInput: unknown,
    actor: AuthenticatedUser,
  ) {
    const input = this.parseSampleUpdateInput(rawInput);

    return this.prisma.$transaction(async (tx) => {
      const sample = await this.getSampleOrThrow(tx, projectId, sampleId);

      const updatedSample = await tx.sample.update({
        where: { id: sampleId },
        data: {
          sampleName: input.sampleName ?? sample.sampleName,
          sampleType: input.sampleType ?? sample.sampleType,
          location: input.location === undefined ? sample.location : input.location,
          remark: input.remark === undefined ? sample.remark : input.remark,
          producedAt:
            input.producedAt === undefined ? sample.producedAt : input.producedAt,
          status:
            input.producedAt !== undefined
              ? input.producedAt
                ? SampleStatus.IN_PREPARATION
                : SampleStatus.DRAFT
              : sample.status,
        },
      });

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.SAMPLE,
        targetId: sampleId,
        action: 'SAMPLE_UPDATED',
        nodeCode: WorkflowNodeCode.SAMPLE_COLOR_CONFIRMATION,
        summary: `${updatedSample.sampleNo} V${updatedSample.versionNo} 样板信息已更新。`,
        beforeData: this.toSampleAuditSnapshot(sample),
        afterData: this.toSampleAuditSnapshot(updatedSample),
      });

      return this.buildSampleDetail(tx, projectId, sampleId);
    });
  }

  async uploadSampleImage(
    projectId: string,
    sampleId: string,
    file: UploadedBinaryFile | undefined,
    actor: AuthenticatedUser,
  ) {
    const sample = await this.getSampleOrThrow(this.prisma, projectId, sampleId);

    if (!file) {
      throw new BadRequestException('请选择要上传的样板图片。');
    }

    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('仅支持图片文件上传。');
    }

    const attachment = await this.attachmentsService.createStoredAttachment({
      projectId,
      targetType: AttachmentTargetType.SAMPLE,
      targetId: sampleId,
      file,
      uploadedById: actor.id,
      nodeCode: WorkflowNodeCode.SAMPLE_COLOR_CONFIRMATION,
      summary: `上传样板图片 ${sample.sampleNo} V${sample.versionNo}`,
    });

    return {
      sampleId,
      attachment,
    };
  }

  async submitConfirmation(
    projectId: string,
    rawInput: unknown,
    actor: AuthenticatedUser,
  ) {
    const input = this.parseConfirmationInput(rawInput);

    return this.prisma.$transaction(async (tx) => {
      const activeTask = await this.getActiveConfirmationTaskOrThrow(tx, projectId);
      const sample = await this.getSampleOrThrow(tx, projectId, input.sampleId);

      if (!sample.isCurrent) {
        throw new BadRequestException('只能确认当前版本样板。');
      }

      const sampleImages = await this.attachmentsService.listTargetAttachments(
        tx,
        AttachmentTargetType.SAMPLE,
        sample.id,
      );

      if (input.decision === SampleConfirmationDecision.APPROVE && sampleImages.length === 0) {
        throw new BadRequestException('样板确认通过前必须至少上传一张样板图片。');
      }

      const now = new Date();
      const confirmation = await tx.sampleConfirmation.upsert({
        where: {
          workflowTaskId: activeTask.id,
        },
        create: {
          projectId,
          sampleId: sample.id,
          workflowInstanceId: activeTask.workflowInstanceId,
          workflowTaskId: activeTask.id,
          decision: input.decision,
          colorAssessment: input.colorAssessment,
          appearanceAssessment: input.appearanceAssessment,
          comment: input.comment,
          confirmedById: actor.id,
          confirmedAt: now,
        },
        update: {
          sampleId: sample.id,
          decision: input.decision,
          colorAssessment: input.colorAssessment,
          appearanceAssessment: input.appearanceAssessment,
          comment: input.comment,
          confirmedById: actor.id,
          confirmedAt: now,
        },
      });

      const nextStatus =
        input.decision === SampleConfirmationDecision.APPROVE
          ? SampleStatus.CONFIRMED
          : SampleStatus.IN_PREPARATION;

      await tx.sample.update({
        where: { id: sample.id },
        data: {
          status: nextStatus,
          confirmedAt:
            input.decision === SampleConfirmationDecision.APPROVE ? now : null,
        },
      });

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.SAMPLE,
        targetId: sample.id,
        action: 'SAMPLE_CONFIRMATION_SUBMITTED',
        nodeCode: WorkflowNodeCode.SAMPLE_COLOR_CONFIRMATION,
        summary: `${sample.sampleNo} V${sample.versionNo} 已提交样板颜色确认。`,
        afterData: {
          confirmationId: confirmation.id,
          workflowTaskId: activeTask.id,
          decision: input.decision,
          sampleStatus: nextStatus,
        },
      });

      await this.workflowsService.transitionTaskWithExecutor(
        tx,
        activeTask.id,
        this.mapDecisionToAction(input.decision),
        actor,
        {
          comment: input.comment ?? '样板颜色确认已提交。',
          metadata: {
            source: 'sample-confirmation',
            sampleId: sample.id,
            confirmationId: confirmation.id,
            decision: input.decision,
          },
        },
      );

      return this.buildWorkspace(tx, projectId);
    });
  }

  private async buildWorkspace(db: SamplesDbClient, projectId: string) {
    const project = await this.getProjectOrThrow(db, projectId);
    const activeTask = await this.getActiveConfirmationTask(db, projectId);
    const currentSamples = await db.sample.findMany({
      where: {
        projectId,
        isCurrent: true,
      },
      orderBy: [
        { updatedAt: 'desc' },
        { createdAt: 'desc' },
      ],
    });
    const allVersions = await db.sample.findMany({
      where: { projectId },
      select: {
        id: true,
        sampleNo: true,
      },
    });
    const attachments = currentSamples.length
      ? await db.attachment.findMany({
          where: {
            entityType: AttachmentTargetType.SAMPLE,
            entityId: {
              in: currentSamples.map((sample) => sample.id),
            },
            isDeleted: false,
          },
          orderBy: {
            createdAt: 'desc',
          },
        })
      : [];
    const latestConfirmation = await db.sampleConfirmation.findFirst({
      where: { projectId },
      include: {
        sample: true,
        confirmedBy: true,
      },
      orderBy: {
        confirmedAt: 'desc',
      },
    });

    const versionCounts = new Map<string, number>();
    for (const version of allVersions) {
      versionCounts.set(
        version.sampleNo,
        (versionCounts.get(version.sampleNo) ?? 0) + 1,
      );
    }

    const attachmentByTarget = new Map<
      string,
      {
        count: number;
        latestAttachmentId: string | null;
      }
    >();

    for (const attachment of attachments) {
      const entry = attachmentByTarget.get(attachment.entityId) ?? {
        count: 0,
        latestAttachmentId: null,
      };
      entry.count += 1;
      entry.latestAttachmentId ||= attachment.id;
      attachmentByTarget.set(attachment.entityId, entry);
    }

    return {
      project: {
        id: project.id,
        code: project.code,
        name: project.name,
        currentNodeCode: project.currentNodeCode,
        currentNodeName: getCurrentNodeName(project.currentNodeCode),
        targetDate: project.plannedEndDate?.toISOString() ?? null,
      },
      activeConfirmationTask: activeTask ? this.toTaskSummary(activeTask) : null,
      latestConfirmation: latestConfirmation
        ? this.toConfirmationSummary(latestConfirmation)
        : null,
      items: currentSamples.map((sample) => {
        const attachmentMeta = attachmentByTarget.get(sample.id);

        return {
          id: sample.id,
          sampleNo: sample.sampleNo,
          sampleName: sample.sampleName,
          versionNo: sample.versionNo,
          isCurrent: sample.isCurrent,
          sampleType: sample.sampleType,
          status: sample.status,
          location: sample.location,
          remark: sample.remark,
          producedAt: sample.producedAt?.toISOString() ?? null,
          confirmedAt: sample.confirmedAt?.toISOString() ?? null,
          imageCount: attachmentMeta?.count ?? 0,
          latestImageAttachmentId: attachmentMeta?.latestAttachmentId ?? null,
          versionCount: versionCounts.get(sample.sampleNo) ?? 1,
          createdAt: sample.createdAt.toISOString(),
          updatedAt: sample.updatedAt.toISOString(),
        };
      }),
    };
  }

  private async buildSampleDetail(
    db: SamplesDbClient,
    projectId: string,
    sampleId: string,
  ) {
    const project = await this.getProjectOrThrow(db, projectId);
    const sample = await this.getSampleOrThrow(db, projectId, sampleId);
    const versions = await db.sample.findMany({
      where: {
        projectId,
        sampleNo: sample.sampleNo,
      },
      orderBy: {
        versionNo: 'desc',
      },
    });
    const attachments = await this.attachmentsService.listTargetAttachments(
      db,
      AttachmentTargetType.SAMPLE,
      sampleId,
    );
    const confirmations = await db.sampleConfirmation.findMany({
      where: {
        projectId,
        sampleId: {
          in: versions.map((version) => version.id),
        },
      },
      include: {
        sample: true,
        confirmedBy: true,
      },
      orderBy: {
        confirmedAt: 'desc',
      },
    });

    const attachmentCountByVersion = new Map<string, number>();
    for (const version of versions) {
      attachmentCountByVersion.set(version.id, 0);
    }
    for (const attachment of await db.attachment.findMany({
      where: {
        entityType: AttachmentTargetType.SAMPLE,
        entityId: {
          in: versions.map((version) => version.id),
        },
        isDeleted: false,
      },
    })) {
      attachmentCountByVersion.set(
        attachment.entityId,
        (attachmentCountByVersion.get(attachment.entityId) ?? 0) + 1,
      );
    }

    return {
      project: {
        id: project.id,
        code: project.code,
        name: project.name,
        currentNodeCode: project.currentNodeCode,
        currentNodeName: getCurrentNodeName(project.currentNodeCode),
        targetDate: project.plannedEndDate?.toISOString() ?? null,
      },
      sample: {
        id: sample.id,
        sampleNo: sample.sampleNo,
        sampleName: sample.sampleName,
        versionNo: sample.versionNo,
        isCurrent: sample.isCurrent,
        sampleType: sample.sampleType,
        status: sample.status,
        location: sample.location,
        remark: sample.remark,
        producedAt: sample.producedAt?.toISOString() ?? null,
        confirmedAt: sample.confirmedAt?.toISOString() ?? null,
        createdAt: sample.createdAt.toISOString(),
        updatedAt: sample.updatedAt.toISOString(),
      },
      versions: versions.map((version) => ({
        id: version.id,
        sampleNo: version.sampleNo,
        sampleName: version.sampleName,
        versionNo: version.versionNo,
        isCurrent: version.isCurrent,
        sampleType: version.sampleType,
        status: version.status,
        producedAt: version.producedAt?.toISOString() ?? null,
        confirmedAt: version.confirmedAt?.toISOString() ?? null,
        imageCount: attachmentCountByVersion.get(version.id) ?? 0,
        createdAt: version.createdAt.toISOString(),
      })),
      attachments: attachments.map((attachment) =>
        this.attachmentsService.toAttachmentSummary(attachment),
      ),
      confirmations: confirmations.map((confirmation) =>
        this.toConfirmationSummary(confirmation),
      ),
    };
  }

  private getProjectOrThrow(db: SamplesDbClient, projectId: string) {
    return db.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        code: true,
        name: true,
        currentNodeCode: true,
        plannedEndDate: true,
      },
    }).then((project) => {
      if (!project) {
        throw new NotFoundException('Project not found.');
      }

      return project;
    });
  }

  private getSampleOrThrow(db: SamplesDbClient, projectId: string, sampleId: string) {
    return db.sample.findFirst({
      where: {
        id: sampleId,
        projectId,
      },
    }).then((sample) => {
      if (!sample) {
        throw new NotFoundException('Sample not found.');
      }

      return sample;
    });
  }

  private getActiveConfirmationTask(db: SamplesDbClient, projectId: string) {
    return db.workflowTask.findFirst({
      where: {
        projectId,
        nodeCode: WorkflowNodeCode.SAMPLE_COLOR_CONFIRMATION,
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

  private async getActiveConfirmationTaskOrThrow(
    db: SamplesDbClient,
    projectId: string,
  ) {
    const activeTask = await this.getActiveConfirmationTask(db, projectId);

    if (!activeTask) {
      throw new BadRequestException('当前项目没有活跃的样板颜色确认节点。');
    }

    return activeTask;
  }

  private toTaskSummary(task: ActiveTaskRecord) {
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

  private toConfirmationSummary(
    confirmation: Prisma.SampleConfirmationGetPayload<{
      include: {
        sample: true;
        confirmedBy: true;
      };
    }>,
  ) {
    return {
      id: confirmation.id,
      sampleId: confirmation.sampleId,
      sampleNo: confirmation.sample.sampleNo,
      sampleName: confirmation.sample.sampleName,
      sampleVersionNo: confirmation.sample.versionNo,
      decision: confirmation.decision,
      colorAssessment: confirmation.colorAssessment,
      appearanceAssessment: confirmation.appearanceAssessment,
      comment: confirmation.comment,
      confirmedByName: confirmation.confirmedBy?.name ?? null,
      confirmedAt: confirmation.confirmedAt.toISOString(),
      createdAt: confirmation.createdAt.toISOString(),
    };
  }

  private parseSampleWriteInput(rawInput: unknown): SampleWriteInput {
    const input = this.asRecord(rawInput, 'Invalid sample payload.');
    const createNewVersion = input.createNewVersion === true;

    return {
      sampleNo: this.parseRequiredString(input.sampleNo, 'sampleNo'),
      sampleName: this.parseRequiredString(input.sampleName, 'sampleName'),
      sampleType:
        this.parseOptionalEnum(
          input.sampleType,
          Object.values(SampleType),
          'sampleType',
        ) ?? SampleType.PANEL,
      location: this.parseNullableString(input.location) ?? null,
      remark: this.parseNullableString(input.remark) ?? null,
      producedAt: this.parseNullableDate(input.producedAt, 'producedAt') ?? null,
      createNewVersion,
    };
  }

  private parseSampleUpdateInput(rawInput: unknown): SampleUpdateInput {
    const input = this.asRecord(rawInput, 'Invalid sample payload.');
    const sampleName = this.parseOptionalString(input.sampleName);
    const sampleType = this.parseOptionalEnum(
      input.sampleType,
      Object.values(SampleType),
      'sampleType',
    );
    const location = this.parseNullableString(input.location, true);
    const remark = this.parseNullableString(input.remark, true);
    const producedAt = this.parseNullableDate(input.producedAt, 'producedAt', true);

    return {
      ...(sampleName ? { sampleName } : {}),
      ...(sampleType ? { sampleType } : {}),
      ...(location !== undefined ? { location } : {}),
      ...(remark !== undefined ? { remark } : {}),
      ...(producedAt !== undefined ? { producedAt } : {}),
    };
  }

  private parseConfirmationInput(rawInput: unknown): SampleConfirmationInput {
    const input = this.asRecord(rawInput, 'Invalid sample confirmation payload.');
    const decision = this.parseOptionalEnum(
      input.decision,
      Object.values(SampleConfirmationDecision),
      'decision',
    );

    if (!decision) {
      throw new BadRequestException('decision is required.');
    }

    return {
      sampleId: this.parseRequiredString(input.sampleId, 'sampleId'),
      decision,
      colorAssessment: this.parseNullableString(input.colorAssessment) ?? null,
      appearanceAssessment: this.parseNullableString(input.appearanceAssessment) ?? null,
      comment: this.parseNullableString(input.comment) ?? null,
    };
  }

  private mapDecisionToAction(decision: SampleConfirmationDecision) {
    switch (decision) {
      case SampleConfirmationDecision.APPROVE:
        return WorkflowAction.APPROVE;
      case SampleConfirmationDecision.REJECT:
        return WorkflowAction.REJECT;
      case SampleConfirmationDecision.RETURN:
        return WorkflowAction.RETURN;
      default:
        throw new BadRequestException('Unsupported sample confirmation decision.');
    }
  }

  private toSampleAuditSnapshot(sample: SampleRecord) {
    return {
      id: sample.id,
      sampleNo: sample.sampleNo,
      sampleName: sample.sampleName,
      versionNo: sample.versionNo,
      isCurrent: sample.isCurrent,
      sampleType: sample.sampleType,
      status: sample.status,
      location: sample.location,
      remark: sample.remark,
      producedAt: sample.producedAt?.toISOString() ?? null,
      confirmedAt: sample.confirmedAt?.toISOString() ?? null,
    };
  }

  private asRecord(rawValue: unknown, message: string) {
    if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) {
      throw new BadRequestException(message);
    }

    return rawValue as Record<string, unknown>;
  }

  private parseRequiredString(rawValue: unknown, fieldName: string) {
    if (typeof rawValue !== 'string' || rawValue.trim().length === 0) {
      throw new BadRequestException(`${fieldName} is required.`);
    }

    return rawValue.trim();
  }

  private parseOptionalString(rawValue: unknown) {
    if (rawValue === undefined || rawValue === null || rawValue === '') {
      return undefined;
    }

    if (typeof rawValue !== 'string') {
      throw new BadRequestException('Expected string value.');
    }

    return rawValue.trim();
  }

  private parseNullableString(rawValue: unknown, allowUndefined = false) {
    if (rawValue === undefined) {
      return allowUndefined ? undefined : null;
    }

    if (rawValue === null || rawValue === '') {
      return null;
    }

    if (typeof rawValue !== 'string') {
      throw new BadRequestException('Expected string value.');
    }

    return rawValue.trim();
  }

  private parseOptionalEnum<T extends string>(
    rawValue: unknown,
    values: readonly T[],
    fieldName: string,
  ) {
    if (rawValue === undefined || rawValue === null || rawValue === '') {
      return undefined;
    }

    if (typeof rawValue !== 'string' || !values.includes(rawValue as T)) {
      throw new BadRequestException(`${fieldName} must be one of: ${values.join(', ')}.`);
    }

    return rawValue as T;
  }

  private parseNullableDate(
    rawValue: unknown,
    fieldName: string,
    allowUndefined = false,
  ) {
    if (rawValue === undefined) {
      return allowUndefined ? undefined : null;
    }

    if (rawValue === null || rawValue === '') {
      return null;
    }

    if (typeof rawValue !== 'string') {
      throw new BadRequestException(`${fieldName} must be a valid ISO date string.`);
    }

    const value = new Date(rawValue);

    if (Number.isNaN(value.getTime())) {
      throw new BadRequestException(`${fieldName} must be a valid ISO date string.`);
    }

    return value;
  }
}
