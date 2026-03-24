import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AttachmentTargetType,
  AuditTargetType,
  PerformanceTestType,
  Prisma,
  ReviewType,
  type WorkflowNodeCode,
} from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { extname } from 'node:path';

import { PrismaService } from '../../infra/prisma/prisma.service';
import { ObjectStorageService } from '../../infra/storage/object-storage.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { getCurrentNodeName } from '../workflows/workflow-node.constants';
import {
  ATTACHMENT_MANAGEMENT_ROLE_CODES,
  ATTACHMENT_MAX_FILE_SIZE_BYTES,
  canPreviewAttachmentMimeType,
  getAttachmentFileValidationIssue,
  parseAttachmentEntityType,
  parseBooleanFlag,
} from './attachments.rules';

type AttachmentDbClient = Prisma.TransactionClient | PrismaService;

type UploadedBinaryFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

type CreateStoredAttachmentInput = {
  projectId: string;
  targetType: AttachmentTargetType;
  targetId: string;
  file: UploadedBinaryFile;
  uploadedById: string;
  nodeCode?: WorkflowNodeCode | null;
  summary?: string;
};

type AttachmentListFilters = {
  entityType: AttachmentTargetType | null;
  entityId: string | null;
  includeDeleted: boolean;
};

type AttachmentRecordLike = {
  id: string;
  projectId: string;
  entityType: AttachmentTargetType;
  entityId: string;
  bucket: string;
  storageKey: string;
  fileName: string;
  originalFileName: string | null;
  fileExtension: string | null;
  mimeType: string;
  fileSize: number;
  checksum: string | null;
  fileUrl: string | null;
  uploadedById: string | null;
  uploadedAt: Date;
  isDeleted: boolean;
  deletedAt: Date | null;
  deletedById: string | null;
  createdAt: Date;
  updatedAt: Date;
  uploadedBy?: {
    name: string;
  } | null;
  deletedBy?: {
    name: string;
  } | null;
};

type AttachmentEntityOptionItem = {
  id: string;
  label: string;
  subtitle: string | null;
};

const ATTACHMENT_DETAIL_INCLUDE = {
  uploadedBy: true,
  deletedBy: true,
} satisfies Prisma.AttachmentInclude;

@Injectable()
export class AttachmentsService {
  private readonly bucket: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly activityLogsService: ActivityLogsService,
    private readonly objectStorageService: ObjectStorageService,
  ) {
    this.bucket =
      this.configService.get<string>('objectStorageBucket') ?? 'feishu-timeline-local';
  }

  async getWorkspace(
    projectId: string,
    rawFilters: unknown,
    actor: AuthenticatedUser,
  ) {
    this.assertActorCanView(actor);
    const filters = this.parseListFilters(rawFilters);
    return this.buildWorkspace(this.prisma, projectId, filters);
  }

  async getAttachmentDetail(
    projectId: string,
    attachmentId: string,
    actor: AuthenticatedUser,
  ) {
    this.assertActorCanView(actor);
    const attachment = await this.getAttachmentOrThrow(this.prisma, projectId, attachmentId, true);
    const entityLabels = await this.buildEntityLabelMap(this.prisma, projectId);
    return this.toAttachmentSummary(attachment, entityLabels);
  }

  async getAttachmentsByEntity(
    projectId: string,
    rawQuery: unknown,
    actor: AuthenticatedUser,
  ) {
    this.assertActorCanView(actor);
    const filters = this.parseListFilters(rawQuery);

    if (!filters.entityType || !filters.entityId) {
      throw new BadRequestException('entityType 和 entityId 不能为空。');
    }

    const entityLabels = await this.buildEntityLabelMap(this.prisma, projectId);
    const items = await this.prisma.attachment.findMany({
      where: this.buildAttachmentWhere(projectId, filters),
      include: ATTACHMENT_DETAIL_INCLUDE,
      orderBy: [{ uploadedAt: 'desc' }, { createdAt: 'desc' }],
    });

    return {
      projectId,
      entityType: filters.entityType,
      entityId: filters.entityId,
      items: items.map((attachment) => this.toAttachmentSummary(attachment, entityLabels)),
    };
  }

  async uploadAttachment(
    projectId: string,
    rawInput: unknown,
    file: UploadedBinaryFile | undefined,
    actor: AuthenticatedUser,
  ) {
    this.assertActorCanManage(actor);
    const binding = this.parseEntityBindingInput(rawInput, projectId);

    return this.createStoredAttachment({
      projectId,
      targetType: binding.entityType,
      targetId: binding.entityId,
      file: this.assertFile(file),
      uploadedById: actor.id,
      summary: '上传项目附件',
    });
  }

  async bindAttachment(
    projectId: string,
    attachmentId: string,
    rawInput: unknown,
    actor: AuthenticatedUser,
  ) {
    this.assertActorCanManage(actor);
    const input = this.parseEntityBindingInput(rawInput, projectId);

    return this.prisma.$transaction(async (tx) => {
      const attachment = await this.getAttachmentOrThrow(tx, projectId, attachmentId, false);
      await this.assertEntityReference(tx, projectId, input.entityType, input.entityId);

      await this.clearDirectEntityReferenceIfNeeded(
        tx,
        attachment.id,
        attachment.entityType,
        attachment.entityId,
      );

      const updated = await tx.attachment.update({
        where: { id: attachmentId },
        data: {
          entityType: input.entityType,
          entityId: input.entityId,
        },
        include: ATTACHMENT_DETAIL_INCLUDE,
      });

      await this.syncDirectEntityReferenceOnBind(
        tx,
        updated.id,
        updated.entityType,
        updated.entityId,
      );

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.ATTACHMENT,
        targetId: updated.id,
        action: 'ATTACHMENT_BOUND',
        summary: `附件 ${updated.fileName} 已绑定到 ${updated.entityType}。`,
        beforeData: this.toAttachmentAuditSnapshot(attachment),
        afterData: this.toAttachmentAuditSnapshot(updated),
      });

      const entityLabels = await this.buildEntityLabelMap(tx, projectId);
      return this.toAttachmentSummary(updated, entityLabels);
    });
  }

  async unbindAttachment(
    projectId: string,
    attachmentId: string,
    actor: AuthenticatedUser,
  ) {
    this.assertActorCanManage(actor);

    return this.prisma.$transaction(async (tx) => {
      const attachment = await this.getAttachmentOrThrow(tx, projectId, attachmentId, false);

      await this.clearDirectEntityReferenceIfNeeded(
        tx,
        attachment.id,
        attachment.entityType,
        attachment.entityId,
      );

      const updated = await tx.attachment.update({
        where: { id: attachmentId },
        data: {
          entityType: AttachmentTargetType.PROJECT,
          entityId: projectId,
        },
        include: ATTACHMENT_DETAIL_INCLUDE,
      });

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.ATTACHMENT,
        targetId: updated.id,
        action: 'ATTACHMENT_UNBOUND',
        summary: `附件 ${updated.fileName} 已解绑为项目级附件。`,
        beforeData: this.toAttachmentAuditSnapshot(attachment),
        afterData: this.toAttachmentAuditSnapshot(updated),
      });

      const entityLabels = await this.buildEntityLabelMap(tx, projectId);
      return this.toAttachmentSummary(updated, entityLabels);
    });
  }

  async deleteAttachment(
    projectId: string,
    attachmentId: string,
    actor: AuthenticatedUser,
  ) {
    this.assertActorCanManage(actor);

    return this.prisma.$transaction(async (tx) => {
      const attachment = await this.getAttachmentOrThrow(tx, projectId, attachmentId, false);

      if (attachment.isDeleted) {
        throw new BadRequestException('附件已删除。');
      }

      await this.clearDirectEntityReferenceIfNeeded(
        tx,
        attachment.id,
        attachment.entityType,
        attachment.entityId,
      );

      const updated = await tx.attachment.update({
        where: { id: attachmentId },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
          deletedById: actor.id,
        },
        include: ATTACHMENT_DETAIL_INCLUDE,
      });

      await this.objectStorageService.markDeleted({
        bucket: updated.bucket,
        storageKey: updated.storageKey,
      });

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.ATTACHMENT,
        targetId: updated.id,
        action: 'ATTACHMENT_DELETED',
        summary: `附件 ${updated.fileName} 已逻辑删除。`,
        beforeData: this.toAttachmentAuditSnapshot(attachment),
        afterData: this.toAttachmentAuditSnapshot(updated),
      });

      const entityLabels = await this.buildEntityLabelMap(tx, projectId);
      return this.toAttachmentSummary(updated, entityLabels);
    });
  }

  async downloadAttachment(
    projectId: string,
    attachmentId: string,
    actor: AuthenticatedUser,
    rawDisposition?: unknown,
  ) {
    this.assertActorCanView(actor);
    const attachment = await this.getAttachmentOrThrow(this.prisma, projectId, attachmentId, false);
    return this.readAttachmentBinary(attachment, actor, rawDisposition);
  }

  async getAttachmentContent(
    attachmentId: string,
    actor: AuthenticatedUser,
    rawDisposition?: unknown,
  ) {
    this.assertActorCanView(actor);
    const attachment = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
      include: ATTACHMENT_DETAIL_INCLUDE,
    });

    if (!attachment || attachment.isDeleted) {
      throw new NotFoundException('附件不存在。');
    }

    return this.readAttachmentBinary(attachment, actor, rawDisposition);
  }

  async createStoredAttachment(input: CreateStoredAttachmentInput) {
    this.assertFile(input.file);
    await this.getProjectOrThrow(this.prisma, input.projectId);
    await this.assertEntityReference(this.prisma, input.projectId, input.targetType, input.targetId);

    const extension = extname(input.file.originalname).toLowerCase();
    const safeName = this.sanitizeFileName(input.file.originalname);
    const storageKey = this.buildStorageKey(
      input.projectId,
      input.targetType,
      input.targetId,
      extension,
    );
    const checksum = createHash('sha256').update(input.file.buffer).digest('hex');

    await this.objectStorageService.upload({
      bucket: this.bucket,
      storageKey,
      buffer: input.file.buffer,
    });

    const attachment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.attachment.create({
        data: {
          projectId: input.projectId,
          entityType: input.targetType,
          entityId: input.targetId,
          bucket: this.bucket,
          storageKey,
          fileName: safeName,
          originalFileName: input.file.originalname,
          fileExtension: extension || null,
          mimeType: input.file.mimetype,
          fileSize: input.file.size,
          checksum,
          uploadedById: input.uploadedById,
          uploadedAt: new Date(),
        },
        include: ATTACHMENT_DETAIL_INCLUDE,
      });

      const updated = await tx.attachment.update({
        where: { id: created.id },
        data: {
          fileUrl: `/attachments/${created.id}/content`,
        },
        include: ATTACHMENT_DETAIL_INCLUDE,
      });

      await this.syncDirectEntityReferenceOnBind(
        tx,
        updated.id,
        updated.entityType,
        updated.entityId,
      );

      await this.activityLogsService.createWithExecutor(tx, {
        projectId: input.projectId,
        actorUserId: input.uploadedById,
        targetType: AuditTargetType.ATTACHMENT,
        targetId: updated.id,
        action: 'ATTACHMENT_UPLOADED',
        nodeCode: input.nodeCode ?? null,
        summary: input.summary ?? `上传附件 ${updated.originalFileName ?? updated.fileName}`,
        afterData: this.toAttachmentAuditSnapshot(updated),
      });

      return updated;
    });

    const entityLabels = await this.buildEntityLabelMap(this.prisma, input.projectId);
    return this.toAttachmentSummary(attachment, entityLabels);
  }

  listTargetAttachments(
    db: AttachmentDbClient,
    targetType: AttachmentTargetType,
    targetId: string,
  ) {
    return db.attachment.findMany({
      where: {
        entityType: targetType,
        entityId: targetId,
        isDeleted: false,
      },
      include: ATTACHMENT_DETAIL_INCLUDE,
      orderBy: {
        uploadedAt: 'desc',
      },
    });
  }

  toAttachmentSummary(
    attachment: AttachmentRecordLike,
    entityLabels?: Map<string, string>,
  ) {
    const entityKey = `${attachment.entityType}:${attachment.entityId}`;
    const fileUrl = attachment.fileUrl ?? `/attachments/${attachment.id}/content`;

    return {
      id: attachment.id,
      projectId: attachment.projectId,
      entityType: attachment.entityType,
      entityId: attachment.entityId,
      entityLabel: entityLabels?.get(entityKey) ?? attachment.entityId,
      targetType: attachment.entityType,
      targetId: attachment.entityId,
      fileName: attachment.fileName,
      originalFileName: attachment.originalFileName ?? attachment.fileName,
      fileExtension: attachment.fileExtension,
      mimeType: attachment.mimeType,
      contentType: attachment.mimeType,
      fileSize: attachment.fileSize,
      bucket: attachment.bucket,
      storageKey: attachment.storageKey,
      objectKey: attachment.storageKey,
      fileUrl,
      contentUrl: fileUrl,
      downloadUrl: `/projects/${attachment.projectId}/attachments/${attachment.id}/download`,
      previewUrl: canPreviewAttachmentMimeType(attachment.mimeType)
        ? `/projects/${attachment.projectId}/attachments/${attachment.id}/download?disposition=inline`
        : null,
      canPreview: canPreviewAttachmentMimeType(attachment.mimeType),
      uploadedById: attachment.uploadedById,
      uploadedByName: attachment.uploadedBy?.name ?? null,
      uploadedAt: attachment.uploadedAt.toISOString(),
      isDeleted: attachment.isDeleted,
      deletedAt: attachment.deletedAt?.toISOString() ?? null,
      deletedById: attachment.deletedById,
      deletedByName: attachment.deletedBy?.name ?? null,
      createdAt: attachment.createdAt.toISOString(),
      updatedAt: attachment.updatedAt.toISOString(),
    };
  }

  private async buildWorkspace(
    db: AttachmentDbClient,
    projectId: string,
    filters: AttachmentListFilters,
  ) {
    const project = await this.getProjectOrThrow(db, projectId);
    const [items, totalCount, deletedCount, entityOptions, entityLabels] = await Promise.all([
      db.attachment.findMany({
        where: this.buildAttachmentWhere(projectId, filters),
        include: ATTACHMENT_DETAIL_INCLUDE,
        orderBy: [{ isDeleted: 'asc' }, { uploadedAt: 'desc' }, { createdAt: 'desc' }],
      }),
      db.attachment.count({
        where: {
          projectId,
        },
      }),
      db.attachment.count({
        where: {
          projectId,
          isDeleted: true,
        },
      }),
      this.buildEntityOptions(db, projectId, project),
      this.buildEntityLabelMap(db, projectId),
    ]);

    return {
      project: {
        id: project.id,
        code: project.code,
        name: project.name,
        currentNodeCode: project.currentNodeCode,
        currentNodeName: getCurrentNodeName(project.currentNodeCode),
        targetDate: project.plannedEndDate?.toISOString() ?? null,
      },
      filters: {
        entityType: filters.entityType,
        entityId: filters.entityId,
        includeDeleted: filters.includeDeleted,
      },
      limits: {
        maxFileSizeBytes: ATTACHMENT_MAX_FILE_SIZE_BYTES,
      },
      statistics: {
        totalCount,
        activeCount: totalCount - deletedCount,
        deletedCount,
      },
      entityOptions,
      items: items.map((attachment) => this.toAttachmentSummary(attachment, entityLabels)),
    };
  }

  private buildAttachmentWhere(projectId: string, filters: AttachmentListFilters): Prisma.AttachmentWhereInput {
    return {
      projectId,
      ...(filters.entityType ? { entityType: filters.entityType } : {}),
      ...(filters.entityId ? { entityId: filters.entityId } : {}),
      ...(filters.includeDeleted ? {} : { isDeleted: false }),
    };
  }

  private parseListFilters(rawFilters: unknown): AttachmentListFilters {
    const input =
      rawFilters && typeof rawFilters === 'object' && !Array.isArray(rawFilters)
        ? (rawFilters as Record<string, unknown>)
        : {};
    const entityType =
      input.entityType === undefined ? null : parseAttachmentEntityType(input.entityType);

    if (input.entityType !== undefined && entityType === null) {
      throw new BadRequestException('附件实体类型不合法。');
    }

    const entityId =
      typeof input.entityId === 'string' && input.entityId.trim().length > 0
        ? input.entityId.trim()
        : null;

    return {
      entityType,
      entityId,
      includeDeleted: parseBooleanFlag(input.includeDeleted),
    };
  }

  private parseEntityBindingInput(rawInput: unknown, projectId: string) {
    if (rawInput === undefined || rawInput === null) {
      return {
        entityType: AttachmentTargetType.PROJECT,
        entityId: projectId,
      };
    }

    if (typeof rawInput !== 'object' || Array.isArray(rawInput)) {
      throw new BadRequestException('附件绑定参数格式不正确。');
    }

    const input = rawInput as Record<string, unknown>;
    const entityType = parseAttachmentEntityType(input.entityType);

    if (!entityType) {
      throw new BadRequestException('附件实体类型不合法。');
    }

    const entityId =
      typeof input.entityId === 'string' && input.entityId.trim().length > 0
        ? input.entityId.trim()
        : entityType === AttachmentTargetType.PROJECT
          ? projectId
          : null;

    if (!entityId) {
      throw new BadRequestException('附件实体标识不能为空。');
    }

    return {
      entityType,
      entityId,
    };
  }

  private assertActorCanView(actor: AuthenticatedUser) {
    if (!actor?.id) {
      throw new BadRequestException('当前用户没有附件访问权限。');
    }
  }

  private assertActorCanManage(actor: AuthenticatedUser) {
    if (actor.isSystemAdmin) {
      return;
    }

    if (
      actor.roleCodes.some((roleCode) =>
        ATTACHMENT_MANAGEMENT_ROLE_CODES.includes(
          roleCode as (typeof ATTACHMENT_MANAGEMENT_ROLE_CODES)[number],
        ),
      )
    ) {
      return;
    }

    throw new BadRequestException('当前用户没有附件管理权限。');
  }

  private assertFile(file: UploadedBinaryFile | undefined) {
    if (!file) {
      throw new BadRequestException('请选择要上传的附件。');
    }

    if (!file.originalname || !file.mimetype || !file.buffer || file.size <= 0) {
      throw new BadRequestException('无效的附件文件。');
    }

    const issue = getAttachmentFileValidationIssue({
      mimeType: file.mimetype,
      fileSize: file.size,
    });

    if (issue) {
      throw new BadRequestException(issue);
    }

    return file;
  }

  private async getProjectOrThrow(db: AttachmentDbClient, projectId: string) {
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
      throw new NotFoundException('项目不存在。');
    }

    return project;
  }

  private async getAttachmentOrThrow(
    db: AttachmentDbClient,
    projectId: string,
    attachmentId: string,
    includeDeleted: boolean,
  ) {
    const attachment = await db.attachment.findFirst({
      where: {
        id: attachmentId,
        projectId,
        ...(includeDeleted ? {} : { isDeleted: false }),
      },
      include: ATTACHMENT_DETAIL_INCLUDE,
    });

    if (!attachment) {
      throw new NotFoundException('附件不存在。');
    }

    return attachment;
  }

  private async assertEntityReference(
    db: AttachmentDbClient,
    projectId: string,
    entityType: AttachmentTargetType,
    entityId: string,
  ) {
    if (entityType === AttachmentTargetType.PROJECT) {
      if (entityId !== projectId) {
        throw new BadRequestException('项目级附件的 entityId 必须等于 projectId。');
      }

      await this.getProjectOrThrow(db, projectId);
      return;
    }

    if (entityType === AttachmentTargetType.SAMPLE) {
      const entity = await db.sample.findFirst({
        where: { id: entityId, projectId },
        select: { id: true },
      });

      if (!entity) {
        throw new BadRequestException('样板实体不存在。');
      }

      return;
    }

    if (entityType === AttachmentTargetType.STANDARD_BOARD) {
      const entity = await db.standardBoard.findFirst({
        where: { id: entityId, projectId },
        select: { id: true },
      });

      if (!entity) {
        throw new BadRequestException('标准板实体不存在。');
      }

      return;
    }

    if (entityType === AttachmentTargetType.PERFORMANCE_TEST) {
      const entity = await db.performanceTest.findFirst({
        where: { id: entityId, projectId },
        select: { id: true },
      });

      if (!entity) {
        throw new BadRequestException('性能试验实体不存在。');
      }

      return;
    }

    if (entityType === AttachmentTargetType.REVIEW_RECORD) {
      const entity = await db.reviewRecord.findFirst({
        where: { id: entityId, projectId },
        select: { id: true },
      });

      if (!entity) {
        throw new BadRequestException('评审记录实体不存在。');
      }

      return;
    }

    if (entityType === AttachmentTargetType.NEW_COLOR_REPORT) {
      const entity = await db.developmentReport.findFirst({
        where: { id: entityId, projectId },
        select: { id: true },
      });

      if (!entity) {
        throw new BadRequestException('新颜色开发报告实体不存在。');
      }

      return;
    }

    if (entityType === AttachmentTargetType.TRIAL_PRODUCTION) {
      const entity = await db.trialProduction.findFirst({
        where: { id: entityId, projectId },
        select: { id: true },
      });

      if (!entity) {
        throw new BadRequestException('样车试制实体不存在。');
      }

      return;
    }

    throw new BadRequestException('当前附件实体类型暂不支持。');
  }

  private async buildEntityOptions(
    db: AttachmentDbClient,
    projectId: string,
    project: {
      id: string;
      code: string;
      name: string;
    },
  ) {
    const [samples, boards, tests, reviews, reports, trials] = await Promise.all([
      db.sample.findMany({
        where: { projectId },
        select: {
          id: true,
          sampleNo: true,
          sampleName: true,
          versionNo: true,
        },
        orderBy: [{ sampleNo: 'asc' }, { versionNo: 'desc' }],
      }),
      db.standardBoard.findMany({
        where: { projectId },
        select: {
          id: true,
          boardCode: true,
          versionNo: true,
        },
        orderBy: [{ boardCode: 'asc' }, { versionNo: 'desc' }],
      }),
      db.performanceTest.findMany({
        where: { projectId },
        select: {
          id: true,
          testCode: true,
          testItem: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      db.reviewRecord.findMany({
        where: { projectId },
        select: {
          id: true,
          reviewType: true,
          result: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      db.developmentReport.findMany({
        where: { projectId },
        select: {
          id: true,
          reportTitle: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      db.trialProduction.findMany({
        where: { projectId },
        select: {
          id: true,
          trialNo: true,
          status: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return [
      {
        entityType: AttachmentTargetType.PROJECT,
        label: '项目级附件',
        items: [
          {
            id: project.id,
            label: `${project.code} / ${project.name}`,
            subtitle: '项目附件中心',
          },
        ] satisfies AttachmentEntityOptionItem[],
      },
      {
        entityType: AttachmentTargetType.SAMPLE,
        label: '样板',
        items: samples.map((item) => ({
          id: item.id,
          label: `${item.sampleNo} / ${item.sampleName}`,
          subtitle: `V${item.versionNo}`,
        })),
      },
      {
        entityType: AttachmentTargetType.STANDARD_BOARD,
        label: '标准板',
        items: boards.map((item) => ({
          id: item.id,
          label: item.boardCode,
          subtitle: `V${item.versionNo}`,
        })),
      },
      {
        entityType: AttachmentTargetType.PERFORMANCE_TEST,
        label: '性能试验',
        items: tests.map((item) => ({
          id: item.id,
          label: item.testCode,
          subtitle: this.getPerformanceTestTypeLabel(item.testItem),
        })),
      },
      {
        entityType: AttachmentTargetType.REVIEW_RECORD,
        label: '评审记录',
        items: reviews.map((item) => ({
          id: item.id,
          label: this.getReviewTypeLabel(item.reviewType),
          subtitle: item.result,
        })),
      },
      {
        entityType: AttachmentTargetType.NEW_COLOR_REPORT,
        label: '新颜色开发报告',
        items: reports.map((item) => ({
          id: item.id,
          label: item.reportTitle,
          subtitle: '开发报告',
        })),
      },
      {
        entityType: AttachmentTargetType.TRIAL_PRODUCTION,
        label: '样车试制',
        items: trials.map((item) => ({
          id: item.id,
          label: item.trialNo,
          subtitle: item.status,
        })),
      },
    ];
  }

  private async buildEntityLabelMap(db: AttachmentDbClient, projectId: string) {
    const project = await this.getProjectOrThrow(db, projectId);
    const groups = await this.buildEntityOptions(db, projectId, project);
    const labels = new Map<string, string>();

    for (const group of groups) {
      for (const item of group.items) {
        labels.set(`${group.entityType}:${item.id}`, item.label);
      }
    }

    return labels;
  }

  private async syncDirectEntityReferenceOnBind(
    tx: Prisma.TransactionClient,
    attachmentId: string,
    entityType: AttachmentTargetType,
    entityId: string,
  ) {
    if (entityType === AttachmentTargetType.REVIEW_RECORD) {
      const reviewRecord = await tx.reviewRecord.findUnique({
        where: { id: entityId },
        select: { attachmentId: true },
      });

      if (reviewRecord && !reviewRecord.attachmentId) {
        await tx.reviewRecord.update({
          where: { id: entityId },
          data: { attachmentId },
        });
      }

      return;
    }

    if (entityType === AttachmentTargetType.PERFORMANCE_TEST) {
      const performanceTest = await tx.performanceTest.findUnique({
        where: { id: entityId },
        select: { reportAttachmentId: true },
      });

      if (performanceTest && !performanceTest.reportAttachmentId) {
        await tx.performanceTest.update({
          where: { id: entityId },
          data: { reportAttachmentId: attachmentId },
        });
      }
    }
  }

  private async clearDirectEntityReferenceIfNeeded(
    tx: Prisma.TransactionClient,
    attachmentId: string,
    entityType: AttachmentTargetType,
    entityId: string,
  ) {
    if (entityType === AttachmentTargetType.REVIEW_RECORD) {
      const reviewRecord = await tx.reviewRecord.findUnique({
        where: { id: entityId },
        select: { attachmentId: true },
      });

      if (reviewRecord?.attachmentId === attachmentId) {
        await tx.reviewRecord.update({
          where: { id: entityId },
          data: { attachmentId: null },
        });
      }

      return;
    }

    if (entityType === AttachmentTargetType.PERFORMANCE_TEST) {
      const performanceTest = await tx.performanceTest.findUnique({
        where: { id: entityId },
        select: { reportAttachmentId: true },
      });

      if (performanceTest?.reportAttachmentId === attachmentId) {
        await tx.performanceTest.update({
          where: { id: entityId },
          data: { reportAttachmentId: null },
        });
      }
    }
  }

  private async readAttachmentBinary(
    attachment: AttachmentRecordLike,
    actor: AuthenticatedUser,
    rawDisposition?: unknown,
  ) {
    const buffer = await this.objectStorageService.download({
      bucket: attachment.bucket,
      storageKey: attachment.storageKey,
    });
    const disposition = this.getDownloadDisposition(attachment.mimeType, rawDisposition);

    await this.activityLogsService.create({
      projectId: attachment.projectId,
      actorUserId: actor.id,
      targetType: AuditTargetType.ATTACHMENT,
      targetId: attachment.id,
      action: 'ATTACHMENT_DOWNLOADED',
      summary: `下载附件 ${attachment.originalFileName ?? attachment.fileName}`,
      metadata: {
        disposition,
        entityType: attachment.entityType,
        entityId: attachment.entityId,
      },
    });

    return {
      buffer,
      contentType: attachment.mimeType,
      fileName: attachment.originalFileName ?? attachment.fileName,
      disposition,
    };
  }

  private getDownloadDisposition(mimeType: string, rawDisposition?: unknown) {
    if (rawDisposition === 'inline' && canPreviewAttachmentMimeType(mimeType)) {
      return 'inline';
    }

    if (canPreviewAttachmentMimeType(mimeType)) {
      return 'inline';
    }

    return 'attachment';
  }

  private buildStorageKey(
    projectId: string,
    entityType: AttachmentTargetType,
    entityId: string,
    extension: string,
  ) {
    return `${projectId}/${entityType.toLowerCase()}/${entityId}/${Date.now()}-${randomUUID()}${extension}`;
  }

  private sanitizeFileName(fileName: string) {
    return fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  private getPerformanceTestTypeLabel(testType: PerformanceTestType) {
    const labels: Record<PerformanceTestType, string> = {
      ADHESION: '附着力',
      IMPACT: '冲击',
      SALT_SPRAY: '盐雾',
      HUMIDITY: '湿热',
      GLOSS: '光泽',
      HARDNESS: '硬度',
      DELTA_E: '色差',
      THICKNESS: '膜厚',
    };

    return labels[testType];
  }

  private getReviewTypeLabel(reviewType: ReviewType) {
    const labels: Record<ReviewType, string> = {
      CAB_REVIEW: '驾驶室评审',
      COLOR_CONSISTENCY_REVIEW: '一致性评审',
      VISUAL_COLOR_DIFFERENCE_REVIEW: '目视色差评审',
      DEVELOPMENT_ACCEPTANCE: '颜色开发收费',
      OTHER: '其他评审',
    };

    return labels[reviewType];
  }

  private toAttachmentAuditSnapshot(
    attachment: AttachmentRecordLike,
  ) {
    return {
      id: attachment.id,
      projectId: attachment.projectId,
      entityType: attachment.entityType,
      entityId: attachment.entityId,
      fileName: attachment.fileName,
      originalFileName: attachment.originalFileName,
      storageKey: attachment.storageKey,
      mimeType: attachment.mimeType,
      fileSize: attachment.fileSize,
      bucket: attachment.bucket,
      fileUrl: attachment.fileUrl,
      uploadedById: attachment.uploadedById,
      uploadedAt: attachment.uploadedAt.toISOString(),
      isDeleted: attachment.isDeleted,
      deletedAt: attachment.deletedAt?.toISOString() ?? null,
      deletedById: attachment.deletedById,
    } satisfies Prisma.InputJsonValue;
  }
}
