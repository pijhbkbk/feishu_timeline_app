import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AttachmentTargetType,
  AttachmentScanStatus,
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
import { ProjectAccessService } from '../auth/project-access.service';
import { getCurrentNodeName } from '../workflows/workflow-node.constants';
import {
  ATTACHMENT_MANAGEMENT_ROLE_CODES,
  ATTACHMENT_MAX_FILE_SIZE_BYTES,
  canPreviewAttachmentMimeType,
  getAttachmentFileValidationIssue,
  parseAttachmentEntityType,
  parseBooleanFlag,
} from './attachments.rules';
import {
  MalwareScanner,
  type MalwareScanResult,
} from './malware-scanner.service';

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
  materialType?: string | null;
  replacesAttachmentId?: string | null;
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
  scanStatus: AttachmentScanStatus;
  scannerEngine: string | null;
  scannerVersion: string | null;
  scannerSignatureVersion: string | null;
  scanResultSummary: string | null;
  scannedAt: Date | null;
  materialType: string | null;
  versionNo: number;
  replacesAttachmentId: string | null;
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
  private readonly logger = new Logger(AttachmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly activityLogsService: ActivityLogsService,
    private readonly objectStorageService: ObjectStorageService,
    private readonly projectAccessService: ProjectAccessService,
    private readonly malwareScanner: MalwareScanner,
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
    await this.projectAccessService.assertProjectAccessWithDefaultClient(
      projectId,
      actor,
      'project.read',
    );
    const filters = this.parseListFilters(rawFilters);
    return this.buildWorkspace(this.prisma, projectId, filters);
  }

  async getAttachmentDetail(
    projectId: string,
    attachmentId: string,
    actor: AuthenticatedUser,
  ) {
    this.assertActorCanView(actor);
    await this.projectAccessService.assertProjectAccessWithDefaultClient(
      projectId,
      actor,
      'project.read',
    );
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
    await this.projectAccessService.assertProjectAccessWithDefaultClient(
      projectId,
      actor,
      'project.read',
    );
    const filters = this.parseListFilters(rawQuery);

    if (!filters.entityType || !filters.entityId) {
      throw new BadRequestException('附件归属类型和归属对象不能为空。');
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
    await this.projectAccessService.assertProjectAccessWithDefaultClient(
      projectId,
      actor,
      'attachment.manage',
    );
    const binding = this.parseEntityBindingInput(rawInput, projectId);

    return this.createStoredAttachment({
      projectId,
      targetType: binding.entityType,
      targetId: binding.entityId,
      file: this.assertFile(file),
      uploadedById: actor.id,
      summary: '上传项目附件',
      materialType: binding.materialType,
      replacesAttachmentId: binding.replacesAttachmentId,
    });
  }

  async bindAttachment(
    projectId: string,
    attachmentId: string,
    rawInput: unknown,
    actor: AuthenticatedUser,
  ) {
    this.assertActorCanManage(actor);
    await this.projectAccessService.assertProjectAccessWithDefaultClient(
      projectId,
      actor,
      'attachment.manage',
    );
    const input = this.parseEntityBindingInput(rawInput, projectId);

    return this.prisma.$transaction(async (tx) => {
      const attachment = await this.getAttachmentOrThrow(tx, projectId, attachmentId, false);
      this.assertAttachmentClean(attachment);
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
    await this.projectAccessService.assertProjectAccessWithDefaultClient(
      projectId,
      actor,
      'attachment.manage',
    );

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
    await this.projectAccessService.assertProjectAccessWithDefaultClient(
      projectId,
      actor,
      'attachment.manage',
    );

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
    await this.projectAccessService.assertProjectAccessWithDefaultClient(
      projectId,
      actor,
      'project.read',
    );
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

    await this.projectAccessService.assertProjectAccessWithDefaultClient(
      attachment.projectId,
      actor,
      'project.read',
    );

    return this.readAttachmentBinary(attachment, actor, rawDisposition);
  }

  async getTaskMaterialVersionContent(
    projectId: string,
    taskId: string,
    attachmentId: string,
    actor: AuthenticatedUser,
    rawDisposition?: unknown,
  ) {
    this.assertActorCanView(actor);
    await this.projectAccessService.assertProjectAccessWithDefaultClient(
      projectId,
      actor,
      'project.read',
    );
    const attachment = await this.prisma.attachment.findFirst({
      where: {
        id: attachmentId,
        projectId,
        entityType: AttachmentTargetType.WORKFLOW_TASK,
        entityId: taskId,
      },
      include: ATTACHMENT_DETAIL_INCLUDE,
    });

    if (!attachment) {
      throw new NotFoundException('工序材料版本不存在。');
    }

    if (attachment.isDeleted) {
      const replacement = await this.prisma.attachment.findFirst({
        where: {
          projectId,
          entityType: AttachmentTargetType.WORKFLOW_TASK,
          entityId: taskId,
          replacesAttachmentId: attachment.id,
        },
        select: { id: true },
      });
      if (!replacement) {
        throw new NotFoundException('工序材料版本不存在。');
      }
    }

    return this.readAttachmentBinary(attachment, actor, rawDisposition);
  }

  async createStoredAttachment(input: CreateStoredAttachmentInput) {
    this.assertFile(input.file);
    await this.getProjectOrThrow(this.prisma, input.projectId);
    await this.assertEntityReference(this.prisma, input.projectId, input.targetType, input.targetId);
    const replacement = input.replacesAttachmentId
      ? await this.getAttachmentOrThrow(
          this.prisma,
          input.projectId,
          input.replacesAttachmentId,
          false,
        )
      : null;
    if (
      replacement &&
      (replacement.entityType !== input.targetType || replacement.entityId !== input.targetId)
    ) {
      throw new BadRequestException('只能替换同一工序下的材料。');
    }

    const extension = extname(input.file.originalname).toLowerCase();
    const safeName = this.sanitizeFileName(input.file.originalname);
    const cleanStorageKey = this.buildStorageKey(
      input.projectId,
      input.targetType,
      input.targetId,
      extension,
    );
    const quarantineStorageKey = `quarantine/${cleanStorageKey}`;
    const checksum = createHash('sha256').update(input.file.buffer).digest('hex');

    await this.objectStorageService.upload({
      bucket: this.bucket,
      storageKey: quarantineStorageKey,
      buffer: input.file.buffer,
    });

    const pendingAttachment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.attachment.create({
        data: {
          projectId: input.projectId,
          entityType: input.targetType,
          entityId: input.targetId,
          bucket: this.bucket,
          storageKey: quarantineStorageKey,
          fileName: safeName,
          originalFileName: input.file.originalname,
          fileExtension: extension || null,
          mimeType: input.file.mimetype,
          fileSize: input.file.size,
          checksum,
          fileUrl: null,
          scanStatus: AttachmentScanStatus.PENDING_SCAN,
          uploadedById: input.uploadedById,
          uploadedAt: new Date(),
          materialType: input.materialType ?? replacement?.materialType ?? null,
          versionNo: replacement ? replacement.versionNo + 1 : 1,
          replacesAttachmentId: replacement?.id ?? null,
        },
        include: ATTACHMENT_DETAIL_INCLUDE,
      });

      await this.activityLogsService.createWithExecutor(tx, {
        projectId: input.projectId,
        actorUserId: input.uploadedById,
        targetType: AuditTargetType.ATTACHMENT,
        targetId: created.id,
        action: 'ATTACHMENT_SCAN_PENDING',
        nodeCode: input.nodeCode ?? null,
        summary: '附件已进入隔离区，等待安全扫描。',
        afterData: this.toAttachmentAuditSnapshot(created),
      });

      return created;
    }).catch(async (error: unknown) => {
      await this.objectStorageService.purge({
        bucket: this.bucket,
        storageKey: quarantineStorageKey,
      });
      throw error;
    });

    let scanResult: MalwareScanResult;
    try {
      scanResult = await this.malwareScanner.scan({
        buffer: input.file.buffer,
        fileName: safeName,
        mimeType: input.file.mimetype,
        checksum,
      });
    } catch {
      await this.recordScanFailureAndPurgeQuarantine(
        pendingAttachment,
        input,
        AttachmentScanStatus.SCAN_ERROR,
        {
          engine: null,
          engineVersion: null,
          signatureVersion: null,
          resultSummary: 'SCANNER_UNAVAILABLE',
          scannedAt: new Date(),
        },
        quarantineStorageKey,
      );
      throw new ServiceUnavailableException(
        '附件安全扫描暂不可用，文件未进入业务存储且不能下载。',
      );
    }

    if (scanResult.verdict === 'REJECTED') {
      await this.recordScanFailureAndPurgeQuarantine(
        pendingAttachment,
        input,
        AttachmentScanStatus.REJECTED,
        scanResult,
        quarantineStorageKey,
      );
      throw new UnprocessableEntityException(
        '附件安全扫描未通过，文件未进入业务存储且不能下载。',
      );
    }

    if (scanResult.verdict !== 'CLEAN') {
      await this.recordScanFailureAndPurgeQuarantine(
        pendingAttachment,
        input,
        AttachmentScanStatus.SCAN_ERROR,
        {
          ...scanResult,
          resultSummary: 'SCANNER_INVALID_VERDICT',
        },
        quarantineStorageKey,
      );
      throw new ServiceUnavailableException(
        '附件安全扫描返回异常，文件未进入业务存储且不能下载。',
      );
    }

    try {
      await this.objectStorageService.promote({
        bucket: this.bucket,
        sourceStorageKey: quarantineStorageKey,
        destinationStorageKey: cleanStorageKey,
      });
    } catch {
      await this.recordScanFailureAndPurgeQuarantine(
        pendingAttachment,
        input,
        AttachmentScanStatus.SCAN_ERROR,
        {
          ...scanResult,
          resultSummary: 'QUARANTINE_PROMOTION_ERROR',
        },
        quarantineStorageKey,
      );
      throw new ServiceUnavailableException(
        '附件安全处理暂不可用，文件未进入业务存储且不能下载。',
      );
    }

    const attachment = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.attachment.update({
        where: { id: pendingAttachment.id },
        data: {
          storageKey: cleanStorageKey,
          fileUrl: `/attachments/${pendingAttachment.id}/content`,
          scanStatus: AttachmentScanStatus.CLEAN,
          scannerEngine: scanResult.engine,
          scannerVersion: scanResult.engineVersion,
          scannerSignatureVersion: scanResult.signatureVersion,
          scanResultSummary: scanResult.resultSummary,
          scannedAt: scanResult.scannedAt,
        },
        include: ATTACHMENT_DETAIL_INCLUDE,
      });

      if (replacement) {
        await this.clearDirectEntityReferenceIfNeeded(
          tx,
          replacement.id,
          replacement.entityType,
          replacement.entityId,
        );
      }

      await this.syncDirectEntityReferenceOnBind(
        tx,
        updated.id,
        updated.entityType,
        updated.entityId,
      );

      if (replacement) {
        await tx.attachment.update({
          where: { id: replacement.id },
          data: {
            isDeleted: true,
            deletedAt: new Date(),
            deletedById: input.uploadedById,
          },
        });
      }

      await this.activityLogsService.createWithExecutor(tx, {
        projectId: input.projectId,
        actorUserId: input.uploadedById,
        targetType: AuditTargetType.ATTACHMENT,
        targetId: updated.id,
        action: 'ATTACHMENT_SCAN_CLEAN',
        nodeCode: input.nodeCode ?? null,
        summary: '附件安全扫描通过。',
        beforeData: this.toAttachmentAuditSnapshot(pendingAttachment),
        afterData: this.toAttachmentAuditSnapshot(updated),
      });

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

      if (replacement) {
        await this.activityLogsService.createWithExecutor(tx, {
          projectId: input.projectId,
          actorUserId: input.uploadedById,
          targetType: AuditTargetType.ATTACHMENT,
          targetId: updated.id,
          action: 'ATTACHMENT_REPLACED',
          nodeCode: input.nodeCode ?? null,
          summary: `附件 ${replacement.fileName} 已由 V${updated.versionNo} 替换并归档。`,
          beforeData: this.toAttachmentAuditSnapshot(replacement),
          afterData: this.toAttachmentAuditSnapshot(updated),
        });
      }

      return updated;
    }).catch(async () => {
      let storageCompensationSummary = 'CLEAN_COMMIT_ERROR_QUARANTINE_RESTORED';

      try {
        await this.objectStorageService.promote({
          bucket: this.bucket,
          sourceStorageKey: cleanStorageKey,
          destinationStorageKey: quarantineStorageKey,
        });
      } catch {
        storageCompensationSummary = 'CLEAN_COMMIT_ERROR_BINARY_PURGED';
        try {
          await this.objectStorageService.purge({
            bucket: this.bucket,
            storageKey: cleanStorageKey,
          });
        } catch {
          storageCompensationSummary = 'CLEAN_COMMIT_ERROR_COMPENSATION_FAILED';
        }
      }

      try {
        await this.recordScanFailure(
          pendingAttachment,
          input,
          AttachmentScanStatus.SCAN_ERROR,
          {
            ...scanResult,
            resultSummary: storageCompensationSummary,
          },
        );
      } catch {
        // The original transaction remains rolled back and therefore never exposes
        // the attachment as CLEAN. A reconciliation job must handle this rare
        // storage/database double-failure window.
      }

      throw new ServiceUnavailableException(
        '附件安全状态保存失败，文件未进入可下载状态。',
      );
    });

    if (replacement) {
      await this.objectStorageService.markDeleted({
        bucket: replacement.bucket,
        storageKey: replacement.storageKey,
      });
    }

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
        scanStatus: AttachmentScanStatus.CLEAN,
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
    const canDownload =
      !attachment.isDeleted && attachment.scanStatus === AttachmentScanStatus.CLEAN;
    const fileUrl = canDownload
      ? attachment.fileUrl ?? `/attachments/${attachment.id}/content`
      : null;

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
      scanStatus: attachment.scanStatus,
      scannedAt: attachment.scannedAt?.toISOString() ?? null,
      canDownload,
      materialType: attachment.materialType,
      versionNo: attachment.versionNo,
      replacesAttachmentId: attachment.replacesAttachmentId,
      contentUrl: fileUrl,
      downloadUrl: canDownload
        ? `/projects/${attachment.projectId}/attachments/${attachment.id}/download`
        : null,
      previewUrl: canDownload && canPreviewAttachmentMimeType(attachment.mimeType)
        ? `/projects/${attachment.projectId}/attachments/${attachment.id}/download?disposition=inline`
        : null,
      canPreview: canDownload && canPreviewAttachmentMimeType(attachment.mimeType),
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
        materialType: null,
        replacesAttachmentId: null,
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

    const materialType =
      typeof input.materialType === 'string' && input.materialType.trim()
        ? input.materialType.trim().slice(0, 200)
        : null;
    const replacesAttachmentId =
      typeof input.replacesAttachmentId === 'string' && input.replacesAttachmentId.trim()
        ? input.replacesAttachmentId.trim()
        : null;

    return {
      entityType,
      entityId,
      materialType,
      replacesAttachmentId,
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
      originalName: file.originalname,
      mimeType: file.mimetype,
      fileSize: file.size,
      buffer: file.buffer,
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
        throw new BadRequestException('项目级附件必须关联到当前项目。');
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

    if (entityType === AttachmentTargetType.WORKFLOW_TASK) {
      const entity = await db.workflowTask.findFirst({
        where: { id: entityId, projectId },
        select: { id: true },
      });

      if (!entity) {
        throw new BadRequestException('工序任务不存在。');
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
    const [tasks, samples, boards, tests, reviews, reports, trials] = await Promise.all([
      db.workflowTask.findMany({
        where: { projectId },
        select: {
          id: true,
          stepCode: true,
          nodeName: true,
          status: true,
        },
        orderBy: [{ createdAt: 'asc' }, { taskRound: 'asc' }],
      }),
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
        entityType: AttachmentTargetType.WORKFLOW_TASK,
        label: '工序任务',
        items: tasks.map((item) => ({
          id: item.id,
          label: `${item.stepCode ?? '--'} / ${item.nodeName}`,
          subtitle: item.status,
        })),
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
    this.assertAttachmentClean(attachment);
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

  private assertAttachmentClean(
    attachment: Pick<AttachmentRecordLike, 'scanStatus'>,
  ) {
    if (attachment.scanStatus === AttachmentScanStatus.CLEAN) {
      return;
    }

    if (attachment.scanStatus === AttachmentScanStatus.REJECTED) {
      throw new ForbiddenException('附件安全扫描未通过，不能下载或绑定。');
    }

    throw new ForbiddenException('附件尚未通过安全扫描，不能下载或绑定。');
  }

  private async recordScanFailure(
    attachment: AttachmentRecordLike,
    input: CreateStoredAttachmentInput,
    scanStatus: 'REJECTED' | 'SCAN_ERROR',
    result: {
      engine: string | null;
      engineVersion: string | null;
      signatureVersion: string | null;
      resultSummary: string;
      scannedAt: Date;
    },
  ) {
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.attachment.update({
        where: { id: attachment.id },
        data: {
          fileUrl: null,
          scanStatus,
          scannerEngine: result.engine,
          scannerVersion: result.engineVersion,
          scannerSignatureVersion: result.signatureVersion,
          scanResultSummary: result.resultSummary,
          scannedAt: result.scannedAt,
        },
        include: ATTACHMENT_DETAIL_INCLUDE,
      });

      await this.activityLogsService.createWithExecutor(tx, {
        projectId: input.projectId,
        actorUserId: input.uploadedById,
        targetType: AuditTargetType.ATTACHMENT,
        targetId: attachment.id,
        action:
          scanStatus === AttachmentScanStatus.REJECTED
            ? 'ATTACHMENT_SCAN_REJECTED'
            : 'ATTACHMENT_SCAN_ERROR',
        nodeCode: input.nodeCode ?? null,
        summary:
          scanStatus === AttachmentScanStatus.REJECTED
            ? '附件安全扫描未通过，文件未进入业务存储。'
            : '附件安全扫描异常，文件未进入业务存储。',
        beforeData: this.toAttachmentAuditSnapshot(attachment),
        afterData: this.toAttachmentAuditSnapshot(updated),
      });
    });
  }

  private async recordScanFailureAndPurgeQuarantine(
    attachment: AttachmentRecordLike,
    input: CreateStoredAttachmentInput,
    scanStatus: 'REJECTED' | 'SCAN_ERROR',
    result: {
      engine: string | null;
      engineVersion: string | null;
      signatureVersion: string | null;
      resultSummary: string;
      scannedAt: Date;
    },
    quarantineStorageKey: string,
  ) {
    const [recordResult, purgeResult] = await Promise.allSettled([
      this.recordScanFailure(attachment, input, scanStatus, result),
      this.objectStorageService.purge({
        bucket: this.bucket,
        storageKey: quarantineStorageKey,
      }),
    ]);

    if (recordResult.status === 'rejected') {
      this.logger.error(
        'Attachment scan failure metadata could not be persisted; reconciliation is required.',
      );
    }

    if (purgeResult.status === 'rejected') {
      this.logger.error(
        'Attachment quarantine cleanup failed; reconciliation is required.',
      );
    }
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
      scanStatus: attachment.scanStatus,
      scannerEngine: attachment.scannerEngine,
      scannerVersion: attachment.scannerVersion,
      scannerSignatureVersion: attachment.scannerSignatureVersion,
      scanResultSummary: attachment.scanResultSummary,
      scannedAt: attachment.scannedAt?.toISOString() ?? null,
      materialType: attachment.materialType,
      versionNo: attachment.versionNo,
      replacesAttachmentId: attachment.replacesAttachmentId,
      uploadedById: attachment.uploadedById,
      uploadedAt: attachment.uploadedAt.toISOString(),
      isDeleted: attachment.isDeleted,
      deletedAt: attachment.deletedAt?.toISOString() ?? null,
      deletedById: attachment.deletedById,
    } satisfies Prisma.InputJsonValue;
  }
}
