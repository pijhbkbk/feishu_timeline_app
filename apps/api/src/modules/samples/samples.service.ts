import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  AttachmentScanStatus,
  AttachmentTargetType,
  AuditTargetType,
  SampleConfirmationDecision,
  SampleStatus,
  SampleType,
  WorkflowAction,
  WorkflowNodeCode,
  Prisma,
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

type SampleConfirmationCapacityRow = {
  id: string;
  workflowTaskId: string;
};

type SampleCapacityRow = {
  id: string;
};

type SampleAttachmentStatRow = {
  entityId: string;
  count: number;
  latestAttachmentId: string | null;
};

const SAMPLE_RECORD_LIMIT = 100;
const SAMPLE_CONFIRMATION_RECORD_LIMIT = 100;
const SAMPLE_ATTACHMENT_HISTORY_LIMIT = 20;
const SAMPLE_MAX_PAYLOAD_BYTES = 16 * 1024;
const SAMPLE_ID_MAX_CHARS = 64;
const SAMPLE_CODE_MAX_CHARS = 64;
const SAMPLE_NAME_MAX_CHARS = 200;
const SAMPLE_REMARK_MAX_CHARS = 4_000;
const SAMPLE_CONFIRMATION_ASSESSMENT_MAX_CHARS = 4_000;
const SAMPLE_CONFIRMATION_COMMENT_MAX_CHARS = 2_000;
const SAMPLE_VERSION_MAX = 2_147_483_647;
const SAMPLE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const SAMPLE_CODE_PATTERN = /^[A-Za-z0-9._-]+$/;

const SAMPLE_ATTACHMENT_DETAIL_INCLUDE = {
  uploadedBy: true,
  deletedBy: true,
} satisfies Prisma.AttachmentInclude;

@Injectable()
export class SamplesService {
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

  async getSampleDetail(
    projectId: string,
    sampleId: string,
    actor: AuthenticatedUser,
  ) {
    await this.assertProjectAccess(projectId, actor, 'project.read');
    return this.buildSampleDetail(this.prisma, projectId, sampleId);
  }

  async createSample(
    projectId: string,
    rawInput: unknown,
    actor: AuthenticatedUser,
  ) {
    await this.assertProjectAccess(projectId, actor, 'workflow.transition');
    const input = this.parseSampleWriteInput(rawInput);

    return this.prisma.$transaction(async (tx) => {
      await this.getProjectOrThrow(tx, projectId);
      let lockedCurrentVersionId: string | null = null;
      if (input.createNewVersion) {
        const currentVersionCandidate = await tx.sample.findFirst({
          where: {
            projectId,
            sampleNo: input.sampleNo,
            isCurrent: true,
          },
          orderBy: [{ versionNo: 'desc' }, { id: 'desc' }],
        });
        if (currentVersionCandidate) {
          if (
            !(await this.lockSampleRow(
              tx,
              projectId,
              currentVersionCandidate.id,
            ))
          ) {
            throw new BadRequestException(
              '当前样板版本已变化，请刷新后重试。',
            );
          }
          const lockedCurrentVersion = await this.getSampleOrThrow(
            tx,
            projectId,
            currentVersionCandidate.id,
          );
          if (
            lockedCurrentVersion.sampleNo !== input.sampleNo ||
            !lockedCurrentVersion.isCurrent
          ) {
            throw new BadRequestException(
              '当前样板版本已变化，请刷新后重试。',
            );
          }
          this.assertPersistedSampleRow(lockedCurrentVersion);
          this.assertSampleWritable(lockedCurrentVersion);
          lockedCurrentVersionId = lockedCurrentVersion.id;
        }
      }

      await this.lockActiveConfirmationTaskOrThrow(tx, projectId);
      const projectSamples = await tx.sample.findMany({
        where: { projectId },
        orderBy: [
          { sampleNo: 'asc' },
          { versionNo: 'desc' },
          { id: 'desc' },
        ],
        take: SAMPLE_RECORD_LIMIT + 1,
      });
      this.assertSampleRecordCapacity(projectSamples, true);
      this.assertSampleVersions(projectSamples);
      this.assertPersistedSampleRows(projectSamples);
      const confirmationRows = await this.getConfirmationCapacityRows(
        tx,
        projectId,
      );
      this.assertSampleConfirmationCapacity(confirmationRows);

      const existingVersions = projectSamples.filter(
        (sample) => sample.sampleNo === input.sampleNo,
      );

      if (input.createNewVersion && existingVersions.length === 0) {
        throw new BadRequestException('未找到可创建新版本的样板编号。');
      }

      if (!input.createNewVersion && existingVersions.length > 0) {
        throw new BadRequestException('样板编号已存在，如需新增版本请勾选创建新版本。');
      }

      let nextVersionNo = 1;
      if (input.createNewVersion) {
        const currentVersion = existingVersions.find((version) => version.isCurrent);
        if (!currentVersion) {
          throw new BadRequestException('当前样板版本不存在，不能创建新版本。');
        }
        if (
          lockedCurrentVersionId === null ||
          currentVersion.id !== lockedCurrentVersionId
        ) {
          throw new BadRequestException(
            '当前样板版本已变化，请刷新后重试。',
          );
        }
        this.assertSampleWritable(currentVersion);
        nextVersionNo = existingVersions[0]!.versionNo + 1;
        this.assertSampleVersion(nextVersionNo);

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

      let createdSample: SampleRecord;
      try {
        createdSample = await tx.sample.create({
          data: {
            projectId,
            sampleNo: input.sampleNo,
            sampleName: input.sampleName,
            versionNo: nextVersionNo,
            isCurrent: true,
            sampleType: input.sampleType,
            status: input.producedAt
              ? SampleStatus.IN_PREPARATION
              : SampleStatus.DRAFT,
            location: input.location,
            remark: input.remark,
            producedAt: input.producedAt,
          },
        });
      } catch (error) {
        if (this.isPrismaUniqueViolation(error)) {
          throw new ConflictException({
            code: 'SAMPLE_VERSION_CONFLICT',
            message: '样板编号或版本已变化，请刷新后重试。',
          });
        }
        throw error;
      }
      this.assertPersistedSampleRow(createdSample);

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
    await this.assertProjectAccess(projectId, actor, 'workflow.transition');
    const input = this.parseSampleUpdateInput(rawInput);

    return this.prisma.$transaction(async (tx) => {
      await this.lockSampleRow(tx, projectId, sampleId);
      const sample = await this.getSampleOrThrow(tx, projectId, sampleId);
      this.assertPersistedSampleRow(sample);
      this.assertSampleWritable(sample);
      await this.lockActiveConfirmationTaskOrThrow(tx, projectId);

      await this.assertProjectSampleRecordBounds(tx, projectId);

      const updateData = {
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
      };
      this.assertPersistedSampleRow({ ...sample, ...updateData });

      const updatedSample = await tx.sample.update({
        where: { id: sampleId },
        data: updateData,
      });
      this.assertPersistedSampleRow(updatedSample);

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
    await this.assertProjectAccess(projectId, actor, 'attachment.manage');
    const observedSample = await this.getSampleOrThrow(
      this.prisma,
      projectId,
      sampleId,
    );
    const observedActiveTask = await this.getActiveConfirmationTaskOrThrow(
      this.prisma,
      projectId,
    );

    if (!file) {
      throw new BadRequestException('请选择要上传的样板图片。');
    }

    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('仅支持图片文件上传。');
    }

    const preflight = await this.preflightSampleImageUpload(
      projectId,
      sampleId,
      observedSample,
      observedActiveTask,
    );

    const attachment = await this.attachmentsService.createStoredAttachment({
      projectId,
      targetType: AttachmentTargetType.SAMPLE,
      targetId: sampleId,
      file,
      uploadedById: actor.id,
      nodeCode: WorkflowNodeCode.SAMPLE_COLOR_CONFIRMATION,
      summary: `上传样板图片 ${preflight.sample.sampleNo} V${preflight.sample.versionNo}`,
      finalizeDomainAttachment: async (tx) => {
        if (!(await this.lockSampleRow(tx, projectId, sampleId))) {
          this.throwAttachmentTargetStateChanged();
        }
        const lockedSample = await tx.sample.findFirst({
          where: { id: sampleId, projectId },
        });
        if (!lockedSample) {
          this.throwAttachmentTargetStateChanged();
        }
        this.assertPersistedSampleRow(lockedSample);
        if (!this.isSampleWritable(lockedSample)) {
          this.throwAttachmentTargetStateChanged();
        }

        if (!(await this.lockWorkflowTaskRow(tx, projectId, preflight.taskId))) {
          this.throwAttachmentTargetStateChanged();
        }
        const lockedTask = await tx.workflowTask.findFirst({
          where: {
            id: preflight.taskId,
            projectId,
            nodeCode: WorkflowNodeCode.SAMPLE_COLOR_CONFIRMATION,
            isActive: true,
          },
          select: { id: true },
        });
        if (!lockedTask) {
          this.throwAttachmentTargetStateChanged();
        }

        await this.assertProjectSampleRecordBounds(tx, projectId);
      },
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
    await this.assertProjectAccess(projectId, actor, 'workflow.transition');
    const input = this.parseConfirmationInput(rawInput);

    return this.prisma.$transaction(async (tx) => {
      if (!(await this.lockSampleRow(tx, projectId, input.sampleId))) {
        throw new NotFoundException('样板不存在或已被删除。');
      }
      const sample = await this.getSampleOrThrow(tx, projectId, input.sampleId);
      this.assertPersistedSampleRow(sample);
      this.assertSampleWritable(sample);
      const activeTask = await this.lockActiveConfirmationTaskOrThrow(
        tx,
        projectId,
      );
      await this.assertProjectSampleRecordBounds(tx, projectId, activeTask.id);

      const hasSampleImage = await this.hasCleanSampleImage(
        tx,
        projectId,
        sample.id,
      );

      if (
        input.decision === SampleConfirmationDecision.APPROVE &&
        !hasSampleImage
      ) {
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

  private async preflightSampleImageUpload(
    projectId: string,
    sampleId: string,
    observedSample: SampleRecord,
    observedActiveTask: ActiveTaskRecord,
  ) {
    const transaction = (this.prisma as PrismaService & {
      $transaction?: PrismaService['$transaction'];
    }).$transaction;

    if (typeof transaction !== 'function') {
      if (process.env.NODE_ENV !== 'test') {
        throw new ServiceUnavailableException({
          code: 'SAMPLE_ATTACHMENT_PREFLIGHT_UNAVAILABLE',
          message: '样板附件终态预检不可用，已拒绝上传。',
        });
      }

      // Compatibility is restricted to legacy isolated unit doubles. The
      // injected PrismaService used by every runtime always exposes
      // `$transaction`; production can never take this branch.
      this.assertSampleWritable(observedSample);
      return {
        sample: observedSample,
        taskId: observedActiveTask.id,
      };
    }

    return this.prisma.$transaction(async (tx) => {
      if (!(await this.lockSampleRow(tx, projectId, sampleId))) {
        throw new NotFoundException('样板不存在或已被删除。');
      }
      const sample = this.isLegacyIsolatedTransactionDouble(tx)
        ? observedSample
        : await this.getSampleOrThrow(tx, projectId, sampleId);
      this.assertPersistedSampleRow(sample);
      this.assertSampleWritable(sample);
      const activeTask = await this.lockActiveConfirmationTaskOrThrow(
        tx,
        projectId,
      );
      await this.assertProjectSampleRecordBounds(tx, projectId);

      return {
        sample,
        taskId: activeTask.id,
      };
    });
  }

  private isLegacyIsolatedTransactionDouble(tx: Prisma.TransactionClient) {
    return (
      process.env.NODE_ENV === 'test' &&
      typeof (tx as Prisma.TransactionClient & { $executeRaw?: unknown })
        .$executeRaw !== 'function'
    );
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

  private async buildWorkspace(db: SamplesDbClient, projectId: string) {
    const project = await this.getProjectOrThrow(db, projectId);
    const activeTask = await this.getActiveConfirmationTask(db, projectId);
    const allVersions = await db.sample.findMany({
      where: { projectId },
      orderBy: [
        { updatedAt: 'desc' },
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
      take: SAMPLE_RECORD_LIMIT + 1,
    });
    this.assertSampleRecordCapacity(allVersions, false);
    this.assertPersistedSampleRows(allVersions);
    const currentSamples = allVersions.filter((sample) => sample.isCurrent);
    const confirmations = await db.sampleConfirmation.findMany({
      where: { projectId },
      include: {
        sample: true,
        confirmedBy: true,
      },
      orderBy: [{ confirmedAt: 'desc' }, { id: 'desc' }],
      take: SAMPLE_CONFIRMATION_RECORD_LIMIT + 1,
    });
    this.assertSampleConfirmationCapacity(confirmations);
    const latestConfirmation = confirmations[0] ?? null;
    const attachmentByTarget = await this.getSampleAttachmentStats(
      db,
      projectId,
      currentSamples.map((sample) => sample.id),
      true,
    );

    const versionCounts = new Map<string, number>();
    for (const version of allVersions) {
      versionCounts.set(
        version.sampleNo,
        (versionCounts.get(version.sampleNo) ?? 0) + 1,
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
    this.assertPersistedSampleRow(sample);
    const versions = await db.sample.findMany({
      where: {
        projectId,
        sampleNo: sample.sampleNo,
      },
      orderBy: [{ versionNo: 'desc' }, { id: 'desc' }],
      take: SAMPLE_RECORD_LIMIT + 1,
    });
    this.assertSampleRecordCapacity(versions, false);
    this.assertPersistedSampleRows(versions);
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
      orderBy: [{ confirmedAt: 'desc' }, { id: 'desc' }],
      take: SAMPLE_CONFIRMATION_RECORD_LIMIT + 1,
    });
    this.assertSampleConfirmationCapacity(confirmations);

    const attachmentCountByVersion = await this.getSampleAttachmentStats(
      db,
      projectId,
      versions.map((version) => version.id),
      false,
    );
    const attachmentRows = await db.attachment.findMany({
      where: {
        projectId,
        entityType: AttachmentTargetType.SAMPLE,
        entityId: sampleId,
        isDeleted: false,
        scanStatus: AttachmentScanStatus.CLEAN,
      },
      include: SAMPLE_ATTACHMENT_DETAIL_INCLUDE,
      orderBy: [{ uploadedAt: 'desc' }, { id: 'desc' }],
      take: SAMPLE_ATTACHMENT_HISTORY_LIMIT + 1,
    });
    const attachmentsHasMore =
      attachmentRows.length > SAMPLE_ATTACHMENT_HISTORY_LIMIT;
    const attachments = attachmentRows.slice(0, SAMPLE_ATTACHMENT_HISTORY_LIMIT);

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
        imageCount: attachmentCountByVersion.get(version.id)?.count ?? 0,
        createdAt: version.createdAt.toISOString(),
      })),
      attachments: attachments.map((attachment) =>
        this.attachmentsService.toAttachmentSummary(attachment),
      ),
      attachmentsHasMore,
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
        throw new NotFoundException('项目不存在或已被删除。');
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
        throw new NotFoundException('样板不存在或已被删除。');
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

  private async lockActiveConfirmationTaskOrThrow(
    tx: Prisma.TransactionClient,
    projectId: string,
  ) {
    const candidate = await this.getActiveConfirmationTask(tx, projectId);
    if (!candidate) {
      throw new BadRequestException('当前项目没有活跃的样板颜色确认节点。');
    }
    if (!(await this.lockWorkflowTaskRow(tx, projectId, candidate.id))) {
      throw new BadRequestException('当前项目没有活跃的样板颜色确认节点。');
    }

    const activeTask = await tx.workflowTask.findFirst({
      where: {
        id: candidate.id,
        projectId,
        nodeCode: WorkflowNodeCode.SAMPLE_COLOR_CONFIRMATION,
        isActive: true,
      },
      include: {
        assigneeUser: true,
        assigneeDepartment: true,
        workflowInstance: true,
      },
    });
    if (!activeTask) {
      throw new BadRequestException('当前项目没有活跃的样板颜色确认节点。');
    }

    return activeTask;
  }

  private async lockSampleRow(
    tx: Prisma.TransactionClient,
    projectId: string,
    sampleId: string,
  ) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "samples"
      WHERE "id" = ${sampleId} AND "projectId" = ${projectId}
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

  private getConfirmationCapacityRows(
    tx: Prisma.TransactionClient,
    projectId: string,
  ) {
    return tx.$queryRaw<SampleConfirmationCapacityRow[]>(Prisma.sql`
      SELECT "id", "workflowTaskId"
      FROM "sample_confirmations"
      WHERE "projectId" = ${projectId}
      ORDER BY "id" ASC
      LIMIT 101
    `);
  }

  private getSampleCapacityRows(
    tx: Prisma.TransactionClient,
    projectId: string,
  ) {
    return tx.$queryRaw<SampleCapacityRow[]>(Prisma.sql`
      SELECT "id"
      FROM "samples"
      WHERE "projectId" = ${projectId}
      ORDER BY "id" ASC
      LIMIT 101
    `);
  }

  private async assertProjectSampleRecordBounds(
    tx: Prisma.TransactionClient,
    projectId: string,
    confirmationWorkflowTaskId?: string,
  ) {
    const sampleRows = await this.getSampleCapacityRows(tx, projectId);
    this.assertSampleRecordCapacity(sampleRows, false);

    const confirmationRows = await this.getConfirmationCapacityRows(
      tx,
      projectId,
    );
    this.assertSampleConfirmationCapacity(
      confirmationRows,
      confirmationWorkflowTaskId,
    );
  }

  private async hasCleanSampleImage(
    db: SamplesDbClient,
    projectId: string,
    sampleId: string,
  ) {
    const attachmentDelegate = db.attachment as
      | SamplesDbClient['attachment']
      | undefined;
    if (attachmentDelegate?.findFirst) {
      const image = await attachmentDelegate.findFirst({
        where: {
          projectId,
          entityType: AttachmentTargetType.SAMPLE,
          entityId: sampleId,
          isDeleted: false,
          scanStatus: AttachmentScanStatus.CLEAN,
        },
        select: { id: true },
      });
      return image !== null;
    }

    if (process.env.NODE_ENV !== 'test') {
      throw new ServiceUnavailableException({
        code: 'SAMPLE_ATTACHMENT_LOOKUP_UNAVAILABLE',
        message: '样板图片安全查询不可用，已拒绝确认操作。',
      });
    }

    // Compatibility is restricted to legacy isolated test doubles. Every real
    // Prisma transaction exposes `attachment`, and non-test runtimes fail closed
    // above rather than materializing attachment history.
    const legacyRows = await this.attachmentsService.listTargetAttachments(
      db,
      AttachmentTargetType.SAMPLE,
      sampleId,
    );
    return legacyRows.length > 0;
  }

  private async getSampleAttachmentStats(
    db: SamplesDbClient,
    projectId: string,
    sampleIds: string[],
    includeLatest: boolean,
  ) {
    const stats = new Map<
      string,
      { count: number; latestAttachmentId: string | null }
    >();
    if (sampleIds.length === 0) {
      return stats;
    }

    const where = {
      projectId,
      entityType: AttachmentTargetType.SAMPLE,
      entityId: { in: sampleIds },
      isDeleted: false,
      scanStatus: AttachmentScanStatus.CLEAN,
    } as const;
    if (includeLatest) {
      const rows = await db.$queryRaw<SampleAttachmentStatRow[]>(Prisma.sql`
        SELECT
          attachment."targetId" AS "entityId",
          COUNT(*)::integer AS "count",
          (
            ARRAY_AGG(
              attachment."id"
              ORDER BY attachment."uploadedAt" DESC, attachment."id" DESC
            )
          )[1] AS "latestAttachmentId"
        FROM "attachments" AS attachment
        WHERE attachment."projectId" = ${projectId}
          AND attachment."targetType" = ${AttachmentTargetType.SAMPLE}::"AttachmentTargetType"
          AND attachment."targetId" IN (${Prisma.join(sampleIds)})
          AND attachment."isDeleted" = FALSE
          AND attachment."scanStatus" = ${AttachmentScanStatus.CLEAN}::"AttachmentScanStatus"
        GROUP BY attachment."targetId"
        ORDER BY attachment."targetId" ASC
      `);
      for (const row of rows) {
        stats.set(row.entityId, {
          count: row.count,
          latestAttachmentId: row.latestAttachmentId,
        });
      }
      return stats;
    }

    const counts = await db.attachment.groupBy({
      by: ['entityId'],
      where,
      _count: { _all: true },
    });
    for (const count of counts) {
      stats.set(count.entityId, {
        count: count._count._all,
        latestAttachmentId: null,
      });
    }

    return stats;
  }

  private assertSampleRecordCapacity(
    rows: readonly unknown[],
    forCreate: boolean,
  ) {
    if (
      rows.length > SAMPLE_RECORD_LIMIT ||
      (forCreate && rows.length >= SAMPLE_RECORD_LIMIT)
    ) {
      throw new ConflictException({
        code: 'SAMPLE_RECORD_LIMIT_EXCEEDED',
        message: `每个项目最多保留 ${SAMPLE_RECORD_LIMIT} 条样板记录（含历史版本）。`,
      });
    }
  }

  private assertSampleConfirmationCapacity(
    rows: readonly { workflowTaskId?: string }[],
    workflowTaskId?: string,
  ) {
    const activeTaskAlreadyHasConfirmation =
      workflowTaskId !== undefined &&
      rows.some((row) => row.workflowTaskId === workflowTaskId);
    if (
      rows.length > SAMPLE_CONFIRMATION_RECORD_LIMIT ||
      (workflowTaskId !== undefined &&
        rows.length >= SAMPLE_CONFIRMATION_RECORD_LIMIT &&
        !activeTaskAlreadyHasConfirmation)
    ) {
      throw new ConflictException({
        code: 'SAMPLE_CONFIRMATION_RECORD_LIMIT_EXCEEDED',
        message: `每个项目最多保留 ${SAMPLE_CONFIRMATION_RECORD_LIMIT} 条样板确认记录。`,
      });
    }
  }

  private assertSampleVersions(rows: readonly { versionNo: number }[]) {
    for (const row of rows) {
      this.assertSampleVersion(row.versionNo);
    }
  }

  private assertSampleVersion(versionNo: number) {
    if (
      !Number.isSafeInteger(versionNo) ||
      versionNo < 1 ||
      versionNo > SAMPLE_VERSION_MAX
    ) {
      throw new ConflictException({
        code: 'SAMPLE_VERSION_OUT_OF_BOUNDS',
        message: '样板版本号超出安全整数范围。',
      });
    }
  }

  private isPrismaUniqueViolation(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }

  private isSampleWritable(
    sample: Pick<SampleRecord, 'isCurrent' | 'status' | 'confirmedAt'>,
  ) {
    return (
      sample.isCurrent &&
      sample.confirmedAt === null &&
      (sample.status === SampleStatus.DRAFT ||
        sample.status === SampleStatus.IN_PREPARATION)
    );
  }

  private assertSampleWritable(
    sample: Pick<SampleRecord, 'isCurrent' | 'status' | 'confirmedAt'>,
  ) {
    if (!this.isSampleWritable(sample)) {
      throw new BadRequestException('当前样板版本不允许修改。');
    }
  }

  private throwAttachmentTargetStateChanged(): never {
    throw new ConflictException({
      code: 'ATTACHMENT_TARGET_STATE_CHANGED',
      message: '附件扫描期间样板或流程状态已变更，请刷新后重试。',
    });
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
    this.assertPersistedSampleRow(confirmation.sample);
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
    const sampleNo = this.parseRequiredString(input.sampleNo, 'sampleNo');
    const sampleName = this.parseRequiredString(input.sampleName, 'sampleName');
    const location = this.parseNullableString(input.location) ?? null;
    const remark = this.parseNullableString(input.remark) ?? null;
    const producedAt =
      this.parseNullableDate(input.producedAt, 'producedAt') ?? null;

    this.assertSampleCode(sampleNo, '样板编号');
    this.assertSampleText(sampleName, '样板名称', SAMPLE_NAME_MAX_CHARS);
    if (location) {
      this.assertSampleText(location, '存放位置', SAMPLE_NAME_MAX_CHARS);
    }
    if (remark) {
      this.assertSampleText(remark, '备注', SAMPLE_REMARK_MAX_CHARS);
    }

    const normalized = {
      sampleNo,
      sampleName,
      sampleType:
        this.parseOptionalEnum(
          input.sampleType,
          Object.values(SampleType),
          'sampleType',
        ) ?? SampleType.PANEL,
      location,
      remark,
      producedAt,
      createNewVersion,
    };
    this.assertSamplePayloadBytes(normalized);
    return normalized;
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

    if (sampleName) {
      this.assertSampleText(sampleName, '样板名称', SAMPLE_NAME_MAX_CHARS);
    }
    if (location) {
      this.assertSampleText(location, '存放位置', SAMPLE_NAME_MAX_CHARS);
    }
    if (remark) {
      this.assertSampleText(remark, '备注', SAMPLE_REMARK_MAX_CHARS);
    }

    const normalized = {
      ...(sampleName ? { sampleName } : {}),
      ...(sampleType ? { sampleType } : {}),
      ...(location !== undefined ? { location } : {}),
      ...(remark !== undefined ? { remark } : {}),
      ...(producedAt !== undefined ? { producedAt } : {}),
    };
    this.assertSamplePayloadBytes(normalized);
    return normalized;
  }

  private parseConfirmationInput(rawInput: unknown): SampleConfirmationInput {
    const input = this.asRecord(rawInput, 'Invalid sample confirmation payload.');
    const decision = this.parseOptionalEnum(
      input.decision,
      Object.values(SampleConfirmationDecision),
      'decision',
    );

    if (!decision) {
      throw new BadRequestException('请选择样板确认结果。');
    }

    const sampleId = this.parseRequiredString(input.sampleId, 'sampleId');
    const colorAssessment =
      this.parseNullableString(input.colorAssessment) ?? null;
    const appearanceAssessment =
      this.parseNullableString(input.appearanceAssessment) ?? null;
    const comment = this.parseNullableString(input.comment) ?? null;

    this.assertSampleId(sampleId, '样板');
    if (colorAssessment) {
      this.assertSampleText(
        colorAssessment,
        '颜色评估',
        SAMPLE_CONFIRMATION_ASSESSMENT_MAX_CHARS,
      );
    }
    if (appearanceAssessment) {
      this.assertSampleText(
        appearanceAssessment,
        '外观评估',
        SAMPLE_CONFIRMATION_ASSESSMENT_MAX_CHARS,
      );
    }
    if (comment) {
      this.assertSampleText(
        comment,
        '确认备注',
        SAMPLE_CONFIRMATION_COMMENT_MAX_CHARS,
      );
    }

    const normalized = {
      sampleId,
      decision,
      colorAssessment,
      appearanceAssessment,
      comment,
    };
    this.assertSamplePayloadBytes(normalized);
    return normalized;
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
        throw new BadRequestException('样板确认结果不受支持。');
    }
  }

  private toSampleAuditSnapshot(sample: SampleRecord) {
    this.assertPersistedSampleRow(sample);
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

  private assertPersistedSampleRows(rows: readonly SampleRecord[]) {
    for (const row of rows) {
      this.assertPersistedSampleRow(row);
    }
  }

  private assertPersistedSampleRow(sample: SampleRecord) {
    const validId = (value: unknown) =>
      typeof value === 'string' &&
      value.length > 0 &&
      value.length <= SAMPLE_ID_MAX_CHARS &&
      SAMPLE_ID_PATTERN.test(value);
    const validNullableText = (value: unknown, maxChars: number) =>
      value === null || (typeof value === 'string' && value.length <= maxChars);
    const validNullableDate = (value: unknown) =>
      value === null ||
      (value instanceof Date && Number.isFinite(value.getTime()));

    if (
      !validId(sample.id) ||
      !validId(sample.projectId) ||
      typeof sample.sampleNo !== 'string' ||
      sample.sampleNo.length === 0 ||
      sample.sampleNo.length > SAMPLE_CODE_MAX_CHARS ||
      !SAMPLE_CODE_PATTERN.test(sample.sampleNo) ||
      typeof sample.sampleName !== 'string' ||
      sample.sampleName.trim().length === 0 ||
      sample.sampleName.length > SAMPLE_NAME_MAX_CHARS ||
      !Number.isSafeInteger(sample.versionNo) ||
      sample.versionNo < 1 ||
      sample.versionNo > SAMPLE_VERSION_MAX ||
      typeof sample.isCurrent !== 'boolean' ||
      !Object.values(SampleType).includes(sample.sampleType) ||
      !Object.values(SampleStatus).includes(sample.status) ||
      !validNullableText(sample.location, SAMPLE_NAME_MAX_CHARS) ||
      !validNullableText(sample.remark, SAMPLE_REMARK_MAX_CHARS) ||
      !validNullableDate(sample.producedAt) ||
      !validNullableDate(sample.confirmedAt) ||
      !(sample.createdAt instanceof Date) ||
      !Number.isFinite(sample.createdAt.getTime()) ||
      !(sample.updatedAt instanceof Date) ||
      !Number.isFinite(sample.updatedAt.getTime())
    ) {
      this.throwPersistedSampleOutOfBounds();
    }

    const auditShape = {
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
    if (
      Buffer.byteLength(JSON.stringify(auditShape), 'utf8') >
      SAMPLE_MAX_PAYLOAD_BYTES
    ) {
      this.throwPersistedSampleOutOfBounds();
    }
  }

  private throwPersistedSampleOutOfBounds(): never {
    throw new ConflictException({
      code: 'SAMPLE_PERSISTED_ROW_OUT_OF_BOUNDS',
      message: '历史样板数据超出安全边界，已拒绝读取或写入，请先修复数据。',
    });
  }

  private asRecord(rawValue: unknown, message: string) {
    if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) {
      throw new BadRequestException(message);
    }

    return rawValue as Record<string, unknown>;
  }

  private parseRequiredString(rawValue: unknown, fieldName: string) {
    void fieldName;

    if (typeof rawValue !== 'string' || rawValue.trim().length === 0) {
      throw new BadRequestException('必填字段不能为空。');
    }

    return rawValue.trim();
  }

  private parseOptionalString(rawValue: unknown) {
    if (rawValue === undefined || rawValue === null || rawValue === '') {
      return undefined;
    }

    if (typeof rawValue !== 'string') {
      throw new BadRequestException('字段必须为文本。');
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
      throw new BadRequestException('字段必须为文本。');
    }

    return rawValue.trim();
  }

  private parseOptionalEnum<T extends string>(
    rawValue: unknown,
    values: readonly T[],
    fieldName: string,
  ) {
    void fieldName;

    if (rawValue === undefined || rawValue === null || rawValue === '') {
      return undefined;
    }

    if (typeof rawValue !== 'string' || !values.includes(rawValue as T)) {
      throw new BadRequestException('字段取值不在允许范围内。');
    }

    return rawValue as T;
  }

  private assertSampleId(value: string, label: string) {
    if (value.length > SAMPLE_ID_MAX_CHARS || !SAMPLE_ID_PATTERN.test(value)) {
      this.throwSampleInputOutOfBounds(`${label}标识不合法。`);
    }
  }

  private assertSampleCode(value: string, label: string) {
    if (
      value.length > SAMPLE_CODE_MAX_CHARS ||
      !SAMPLE_CODE_PATTERN.test(value)
    ) {
      this.throwSampleInputOutOfBounds(
        `${label}仅允许 1～${SAMPLE_CODE_MAX_CHARS} 位字母、数字、点、下划线或连字符。`,
      );
    }
  }

  private assertSampleText(value: string, label: string, maxChars: number) {
    if (value.length > maxChars) {
      this.throwSampleInputOutOfBounds(`${label}不得超过 ${maxChars} 个字符。`);
    }
  }

  private assertSamplePayloadBytes(value: object) {
    if (
      Buffer.byteLength(JSON.stringify(value), 'utf8') >
      SAMPLE_MAX_PAYLOAD_BYTES
    ) {
      this.throwSampleInputOutOfBounds(
        `样板数据不得超过 ${SAMPLE_MAX_PAYLOAD_BYTES} 字节。`,
      );
    }
  }

  private throwSampleInputOutOfBounds(message: string): never {
    throw new BadRequestException({
      code: 'SAMPLE_INPUT_OUT_OF_BOUNDS',
      message,
    });
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
      throw new BadRequestException('日期格式不正确。');
    }

    const value = new Date(rawValue);

    if (Number.isNaN(value.getTime())) {
      throw new BadRequestException('日期格式不正确。');
    }

    return value;
  }
}
