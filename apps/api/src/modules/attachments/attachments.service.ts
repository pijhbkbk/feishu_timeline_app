import { authorizeSheetAttachmentTarget, isSheetTarget, lockSheetAttachmentTarget } from './sheet-attachment-policy';
import { assertApprovedTeamMember } from '../../common/team-membership';
import { authorizeGenericAttachmentTarget, lockGenericAttachmentMutation } from './attachment-team-policy';
import { withProjectWrite, withSystemProjectWrite, withTeamWrite, lockTeamAuthorization } from '../../common/team-authorization';
import {
  BadRequestException,
  ConflictException,
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
import { finished } from 'node:stream/promises';

import { PrismaService } from '../../infra/prisma/prisma.service';
import { ObjectStorageService } from '../../infra/storage/object-storage.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ProjectAccessService } from '../auth/project-access.service';
import { getCurrentNodeName } from '../workflows/workflow-node.constants';
import {
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
import { AttachmentStorageQuotaService } from './attachment-storage-quota.service';

type AttachmentDbClient = Prisma.TransactionClient | PrismaService;

type UploadedBinaryFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

type CreateStoredAttachmentInput = {
  actor: AuthenticatedUser;
  projectId: string | null;
  targetType: AttachmentTargetType;
  targetId: string;
  file: UploadedBinaryFile;
  uploadedById: string;
  nodeCode?: WorkflowNodeCode | null;
  summary?: string;
  materialType?: string | null;
  replacesAttachmentId?: string | null;
  finalizeUploadResult?: (tx: Prisma.TransactionClient, attachment: ReturnType<AttachmentsService['toAttachmentSummary']>) => Promise<void>;
  finalizeDomainAttachment?: (
    tx: Prisma.TransactionClient,
    context: {
      attachmentId: string;
    },
  ) => Promise<void>;
};

type AttachmentListFilters = {
  entityType: AttachmentTargetType | null;
  entityId: string | null;
  includeDeleted: boolean;
  cursor: string | null;
  pageSize: number;
};

type AttachmentRecordLike = {
  id: string;
  projectId: string | null;
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

const DOMAIN_GOVERNED_ATTACHMENT_TARGET_TYPES = new Set<AttachmentTargetType>([
  AttachmentTargetType.SAMPLE,
  AttachmentTargetType.WORKFLOW_TASK,
  AttachmentTargetType.REVIEW_RECORD,
  AttachmentTargetType.PERFORMANCE_TEST,
]);
const ATTACHMENT_DEFAULT_PAGE_SIZE = 50;
const ATTACHMENT_MAX_PAGE_SIZE = 100;
const ATTACHMENT_ENTITY_OPTION_LIMIT = 100;
const ATTACHMENT_TARGET_HISTORY_LIMIT = 1_000;

@Injectable()
export class AttachmentsService {
  private readonly bucket: string;
  private readonly logger = new Logger(AttachmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly activityLogsService: ActivityLogsService,
    private readonly objectStorageService: ObjectStorageService,
    private readonly attachmentStorageQuotaService: AttachmentStorageQuotaService,
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
    const entityLabels = await this.buildEntityLabelMapForAttachments(
      this.prisma,
      projectId,
      [attachment],
    );
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

    const rawItems = await this.prisma.attachment.findMany({
      where: this.buildAttachmentWhere(projectId, filters),
      include: ATTACHMENT_DETAIL_INCLUDE,
      orderBy: [{ uploadedAt: 'desc' }, { id: 'desc' }],
      take: filters.pageSize + 1,
      ...(filters.cursor
        ? { cursor: { id: filters.cursor }, skip: 1 }
        : {}),
    });
    const hasMore = rawItems.length > filters.pageSize;
    const items = rawItems.slice(0, filters.pageSize);
    const entityLabels = await this.buildEntityLabelMapForAttachments(
      this.prisma,
      projectId,
      items,
    );

    return {
      projectId,
      entityType: filters.entityType,
      entityId: filters.entityId,
      items: items.map((attachment) => this.toAttachmentSummary(attachment, entityLabels)),
      pageInfo: {
        pageSize: filters.pageSize,
        hasMore,
        nextCursor: hasMore ? items.at(-1)?.id ?? null : null,
      },
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
    this.assertGenericMutationTargetAllowed(binding.entityType);

    if (binding.replacesAttachmentId) {
      const replacement = await this.getAttachmentOrThrow(
        this.prisma,
        projectId,
        binding.replacesAttachmentId,
        false,
      );
      this.assertGenericMutationTargetAllowed(replacement.entityType);
    }

    return this.createStoredAttachment({
      actor,
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
    this.assertGenericMutationTargetAllowed(input.entityType);

    return withProjectWrite(this.prisma, actor, { projectId }, async (tx) => {
      await lockGenericAttachmentMutation(tx, projectId);
      await tx.$queryRaw(Prisma.sql`SELECT id FROM attachments WHERE id = ${attachmentId} AND "projectId" = ${projectId} FOR UPDATE`);
      const attachment = await this.getAttachmentOrThrow(tx, projectId, attachmentId, false);
      this.assertGenericMutationTargetAllowed(attachment.entityType);
      await authorizeGenericAttachmentTarget(tx, projectId, attachment.entityType, attachment.entityId, actor);
      this.assertAttachmentClean(attachment);
      await authorizeGenericAttachmentTarget(tx, projectId, input.entityType, input.entityId, actor);

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

      const entityLabels = await this.buildEntityLabelMapForAttachments(
        tx,
        projectId,
        [updated],
      );
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

    return withProjectWrite(this.prisma, actor, { projectId }, async (tx) => {
      await lockGenericAttachmentMutation(tx, projectId);
      await tx.$queryRaw(Prisma.sql`SELECT id FROM attachments WHERE id = ${attachmentId} AND "projectId" = ${projectId} FOR UPDATE`);
      const attachment = await this.getAttachmentOrThrow(tx, projectId, attachmentId, false);
      this.assertGenericMutationTargetAllowed(attachment.entityType);
      await authorizeGenericAttachmentTarget(tx, projectId, attachment.entityType, attachment.entityId, actor);

      await authorizeGenericAttachmentTarget(tx, projectId, AttachmentTargetType.PROJECT, projectId, actor);

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

      const entityLabels = await this.buildEntityLabelMapForAttachments(
        tx,
        projectId,
        [updated],
      );
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

    const result = await withProjectWrite(this.prisma, actor, { projectId }, async (tx) => {
      await lockGenericAttachmentMutation(tx, projectId);
      await tx.$queryRaw(Prisma.sql`SELECT id FROM attachments WHERE id = ${attachmentId} AND "projectId" = ${projectId} FOR UPDATE`);
      const attachment = await this.getAttachmentOrThrow(tx, projectId, attachmentId, false);
      this.assertGenericMutationTargetAllowed(attachment.entityType);
      await authorizeGenericAttachmentTarget(tx, projectId, attachment.entityType, attachment.entityId, actor);

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

      const entityLabels = await this.buildEntityLabelMapForAttachments(
        tx,
        projectId,
        [updated],
      );
      return { summary: this.toAttachmentSummary(updated, entityLabels), bucket: updated.bucket, storageKey: updated.storageKey };
    });
    try {
      await this.objectStorageService.markDeleted({ bucket: result.bucket, storageKey: result.storageKey });
    } catch {
      this.logger.error('Logical attachment deletion committed; storage lifecycle marking needs retry.');
    }
    return result.summary;
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

    if (attachment.projectId === null) {
      await authorizeSheetAttachmentTarget(this.prisma, attachment.entityType, attachment.entityId, actor, this.projectAccessService);
      const image = await this.prisma.sheetImage.findFirst({ where: { attachmentId: attachment.id, isDeleted: false, targetType: attachment.entityType, recordId: attachment.entityId }, select: { id: true } });
      if (!image) throw new NotFoundException('图片业务关联不存在。');
    } else {
      await this.projectAccessService.assertProjectAccessWithDefaultClient(attachment.projectId, actor, 'project.read');
    }

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
    if (input.uploadedById !== input.actor.id) throw new ForbiddenException('上传身份不匹配。');
    this.assertFile(input.file);
    this.assertDomainFinalizeHookPresent(input);
    if (input.projectId === null) {
      if (!isSheetTarget(input.targetType) || !input.finalizeDomainAttachment || !input.finalizeUploadResult || input.replacesAttachmentId) throw new BadRequestException('无项目附件仅允许经过完整表格图片绑定流程创建。');
      await authorizeSheetAttachmentTarget(this.prisma, input.targetType, input.targetId, input.actor, this.projectAccessService);
    } else {
      if (isSheetTarget(input.targetType)) throw new BadRequestException('表格图片必须使用业务记录归属。');
      await this.getProjectOrThrow(this.prisma, input.projectId);
      await this.assertEntityReference(this.prisma, input.projectId, input.targetType, input.targetId);
    }
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

    const genericTargetVersion = input.projectId !== null && !DOMAIN_GOVERNED_ATTACHMENT_TARGET_TYPES.has(input.targetType)
      ? await withProjectWrite(this.prisma, input.actor, { projectId: input.projectId }, tx => authorizeGenericAttachmentTarget(tx, input.projectId!, input.targetType, input.targetId, input.actor))
      : undefined;

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

    const storageReservation = await this.attachmentStorageQuotaService.reserve({
      projectId: input.projectId,
      actorUserId: input.uploadedById,
      targetType: input.targetType,
      targetId: input.targetId,
      bucket: this.bucket,
      quarantineStorageKey,
      cleanStorageKey,
      bytes: input.file.buffer.length,
    });

    try {
      await this.objectStorageService.upload({
        bucket: this.bucket,
        storageKey: quarantineStorageKey,
        buffer: input.file.buffer,
      });
    } catch {
      await this.releaseReservedBinary(
        storageReservation.id,
        storageReservation.ownerToken,
        'QUARANTINE_UPLOAD_FAILED',
      );
      throw new ServiceUnavailableException(
        '附件隔离存储暂不可用，文件未进入业务存储。',
      );
    }

    const pendingAttachment = await this.withAttachmentWrite(input, async (tx) => {
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

      await this.attachmentStorageQuotaService.attachPendingRecordWithExecutor(
        tx,
        {
          reservationId: storageReservation.id,
          ownerToken: storageReservation.ownerToken,
          attachmentId: created.id,
        },
      );

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
      await this.releaseReservedBinary(
        storageReservation.id,
        storageReservation.ownerToken,
        'PENDING_ATTACHMENT_TRANSACTION_FAILED',
      );
      throw error;
    });

    await this.attachmentStorageQuotaService.heartbeat(
      storageReservation.id,
      storageReservation.ownerToken,
    );

    let scanResult: MalwareScanResult;
    try {
      scanResult = await this.malwareScanner.scan({
        buffer: input.file.buffer,
        fileName: safeName,
        mimeType: input.file.mimetype,
        checksum,
      });
    } catch {
      await this.recordScanFailureAndRelease(
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
        storageReservation,
      );
      throw new ServiceUnavailableException(
        '附件安全扫描暂不可用，文件未进入业务存储且不能下载。',
      );
    }

    if (scanResult.verdict === 'REJECTED') {
      await this.recordScanFailureAndRelease(
        pendingAttachment,
        input,
        AttachmentScanStatus.REJECTED,
        scanResult,
        storageReservation,
      );
      throw new UnprocessableEntityException(
        '附件安全扫描未通过，文件未进入业务存储且不能下载。',
      );
    }

    if (scanResult.verdict !== 'CLEAN') {
      await this.recordScanFailureAndRelease(
        pendingAttachment,
        input,
        AttachmentScanStatus.SCAN_ERROR,
        {
          ...scanResult,
          resultSummary: 'SCANNER_INVALID_VERDICT',
        },
        storageReservation,
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
      await this.recordScanFailureAndRelease(
        pendingAttachment,
        input,
        AttachmentScanStatus.SCAN_ERROR,
        {
          ...scanResult,
          resultSummary: 'QUARANTINE_PROMOTION_ERROR',
        },
        storageReservation,
      );
      throw new ServiceUnavailableException(
        '附件安全处理暂不可用，文件未进入业务存储且不能下载。',
      );
    }

    await this.attachmentStorageQuotaService.heartbeat(
      storageReservation.id,
      storageReservation.ownerToken,
    );

    const attachment = await this.withAttachmentWrite(input, async (tx) => {
      if (genericTargetVersion !== undefined && input.projectId !== null) {
        await authorizeGenericAttachmentTarget(tx, input.projectId, input.targetType, input.targetId, input.actor, genericTargetVersion);
      }
      await input.finalizeDomainAttachment?.(tx, {
        attachmentId: pendingAttachment.id,
      });

      if (replacement) {
        await tx.$queryRaw(Prisma.sql`SELECT id FROM attachments WHERE id = ${replacement.id} AND "projectId" = ${input.projectId} FOR UPDATE`);
        const currentReplacement = await this.getAttachmentOrThrow(tx, input.projectId, replacement.id, false);
        if (currentReplacement.entityType !== replacement.entityType || currentReplacement.entityId !== replacement.entityId ||
            currentReplacement.versionNo !== replacement.versionNo || currentReplacement.updatedAt.getTime() !== replacement.updatedAt.getTime()) {
          throw new ConflictException('被替换附件已变化，请刷新后重试。');
        }
        this.assertAttachmentClean(currentReplacement);
      }

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

      await this.attachmentStorageQuotaService.markRetainedWithExecutor(tx, {
        reservationId: storageReservation.id,
        ownerToken: storageReservation.ownerToken,
        attachmentId: updated.id,
      });

      if (!DOMAIN_GOVERNED_ATTACHMENT_TARGET_TYPES.has(input.targetType)) {
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
      }

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

      const labels = input.projectId === null ? undefined : await this.buildEntityLabelMapForAttachments(tx, input.projectId, [updated]);
      const summary = this.toAttachmentSummary(updated, labels);
      await input.finalizeUploadResult?.(tx, summary);
      return summary;
    }).catch(async (error: unknown) => {
      const domainStateChanged = error instanceof ForbiddenException || error instanceof ConflictException || error instanceof NotFoundException || error instanceof BadRequestException;
      const committed = await this.recordFinalCommitFailureAndRelease(
        pendingAttachment,
        input,
        scanResult,
        storageReservation,
        domainStateChanged
          ? 'DOMAIN_COMMIT_REJECTED'
          : 'CLEAN_COMMIT_ERROR',
      );

      if (committed) return committed;
      if (domainStateChanged) {
        throw error;
      }

      throw new ServiceUnavailableException(
        '附件安全状态保存失败，文件未进入可下载状态。',
      );
    });

    if (replacement) {
      try {
        await this.objectStorageService.markDeleted({ bucket: replacement.bucket, storageKey: replacement.storageKey });
      } catch {
        this.logger.error('Attachment replacement committed; storage lifecycle marking needs retry.');
      }
    }
    return attachment;
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
      take: ATTACHMENT_TARGET_HISTORY_LIMIT,
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
        ? attachment.projectId === null ? `/attachments/${attachment.id}/content?disposition=attachment` : `/projects/${attachment.projectId}/attachments/${attachment.id}/download`
        : null,
      previewUrl: canDownload && canPreviewAttachmentMimeType(attachment.mimeType)
        ? attachment.projectId === null ? `/attachments/${attachment.id}/content?disposition=inline` : `/projects/${attachment.projectId}/attachments/${attachment.id}/download?disposition=inline`
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
    const [rawItems, totalCount, deletedCount, entityOptionResult] = await Promise.all([
      db.attachment.findMany({
        where: this.buildAttachmentWhere(projectId, filters),
        include: ATTACHMENT_DETAIL_INCLUDE,
        orderBy: [{ isDeleted: 'asc' }, { uploadedAt: 'desc' }, { id: 'desc' }],
        take: filters.pageSize + 1,
        ...(filters.cursor
          ? { cursor: { id: filters.cursor }, skip: 1 }
          : {}),
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
    ]);
    const hasMore = rawItems.length > filters.pageSize;
    const items = rawItems.slice(0, filters.pageSize);
    const entityLabels = await this.buildEntityLabelMapForAttachments(
      db,
      projectId,
      items,
    );

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
        cursor: filters.cursor,
        pageSize: filters.pageSize,
      },
      limits: {
        maxFileSizeBytes: ATTACHMENT_MAX_FILE_SIZE_BYTES,
      },
      statistics: {
        totalCount,
        activeCount: totalCount - deletedCount,
        deletedCount,
      },
      entityOptions: entityOptionResult.groups,
      entityOptionsHasMore: entityOptionResult.hasMore,
      items: items.map((attachment) => this.toAttachmentSummary(attachment, entityLabels)),
      pageInfo: {
        pageSize: filters.pageSize,
        hasMore,
        nextCursor: hasMore ? items.at(-1)?.id ?? null : null,
      },
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
    const pageSize = this.parseAttachmentPageSize(input.pageSize);
    const cursor =
      typeof input.cursor === 'string' && input.cursor.trim().length > 0
        ? input.cursor.trim()
        : null;

    if (cursor && cursor.length > 200) {
      throw new BadRequestException({
        code: 'ATTACHMENT_CURSOR_INVALID',
        message: '附件分页游标不合法。',
      });
    }

    return {
      entityType,
      entityId,
      includeDeleted: parseBooleanFlag(input.includeDeleted),
      cursor,
      pageSize,
    };
  }

  private parseAttachmentPageSize(value: unknown) {
    if (value === undefined || value === null || value === '') {
      return ATTACHMENT_DEFAULT_PAGE_SIZE;
    }
    const normalized = typeof value === 'string' ? value.trim() : value;
    const parsed = Number(normalized);
    if (
      !Number.isSafeInteger(parsed) ||
      parsed < 1 ||
      parsed > ATTACHMENT_MAX_PAGE_SIZE ||
      (typeof normalized === 'string' && !/^\d+$/u.test(normalized))
    ) {
      throw new BadRequestException({
        code: 'ATTACHMENT_PAGE_SIZE_INVALID',
        message: `附件分页大小必须在 1-${ATTACHMENT_MAX_PAGE_SIZE} 之间。`,
      });
    }
    return parsed;
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
    assertApprovedTeamMember(actor);
  }

  private assertGenericMutationTargetAllowed(entityType: AttachmentTargetType) {
    if (!DOMAIN_GOVERNED_ATTACHMENT_TARGET_TYPES.has(entityType)) {
      return;
    }

    throw new ForbiddenException({
      code: 'GENERIC_ATTACHMENT_DOMAIN_OPERATION_DISABLED',
      message:
        '该类附件由对应业务流程管理，请前往对应领域工作区操作。',
    });
  }

  private assertDomainFinalizeHookPresent(input: CreateStoredAttachmentInput) {
    if (
      !DOMAIN_GOVERNED_ATTACHMENT_TARGET_TYPES.has(input.targetType) ||
      input.finalizeDomainAttachment
    ) {
      return;
    }

    throw new ServiceUnavailableException({
      code: 'ATTACHMENT_DOMAIN_FINALIZE_HOOK_REQUIRED',
      message: '正式业务附件缺少领域终态校验，已拒绝写入。',
    });
  }

  private assertFile(file: UploadedBinaryFile | undefined) {
    if (!file) {
      throw new BadRequestException('请选择要上传的附件。');
    }

    if (!file.originalname || !file.mimetype || !file.buffer || file.size <= 0) {
      throw new BadRequestException('无效的附件文件。');
    }

    if (file.size !== file.buffer.length) {
      throw new BadRequestException({
        code: 'ATTACHMENT_FILE_SIZE_MISMATCH',
        message: '附件大小元数据与实际内容不一致。',
      });
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
    projectId: string | null,
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
        take: ATTACHMENT_ENTITY_OPTION_LIMIT + 1,
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
        take: ATTACHMENT_ENTITY_OPTION_LIMIT + 1,
      }),
      db.standardBoard.findMany({
        where: { projectId },
        select: {
          id: true,
          boardCode: true,
          versionNo: true,
        },
        orderBy: [{ boardCode: 'asc' }, { versionNo: 'desc' }],
        take: ATTACHMENT_ENTITY_OPTION_LIMIT + 1,
      }),
      db.performanceTest.findMany({
        where: { projectId },
        select: {
          id: true,
          testCode: true,
          testItem: true,
        },
        orderBy: { createdAt: 'desc' },
        take: ATTACHMENT_ENTITY_OPTION_LIMIT + 1,
      }),
      db.reviewRecord.findMany({
        where: { projectId },
        select: {
          id: true,
          reviewType: true,
          result: true,
        },
        orderBy: { createdAt: 'desc' },
        take: ATTACHMENT_ENTITY_OPTION_LIMIT + 1,
      }),
      db.developmentReport.findMany({
        where: { projectId },
        select: {
          id: true,
          reportTitle: true,
        },
        orderBy: { createdAt: 'desc' },
        take: ATTACHMENT_ENTITY_OPTION_LIMIT + 1,
      }),
      db.trialProduction.findMany({
        where: { projectId },
        select: {
          id: true,
          trialNo: true,
          status: true,
        },
        orderBy: { createdAt: 'desc' },
        take: ATTACHMENT_ENTITY_OPTION_LIMIT + 1,
      }),
    ]);

    const hasMore = [tasks, samples, boards, tests, reviews, reports, trials].some(
      (items) => items.length > ATTACHMENT_ENTITY_OPTION_LIMIT,
    );
    const groups = [
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
        items: tasks.slice(0, ATTACHMENT_ENTITY_OPTION_LIMIT).map((item) => ({
          id: item.id,
          label: `${item.stepCode ?? '--'} / ${item.nodeName}`,
          subtitle: item.status,
        })),
      },
      {
        entityType: AttachmentTargetType.SAMPLE,
        label: '样板',
        items: samples.slice(0, ATTACHMENT_ENTITY_OPTION_LIMIT).map((item) => ({
          id: item.id,
          label: `${item.sampleNo} / ${item.sampleName}`,
          subtitle: `V${item.versionNo}`,
        })),
      },
      {
        entityType: AttachmentTargetType.STANDARD_BOARD,
        label: '标准板',
        items: boards.slice(0, ATTACHMENT_ENTITY_OPTION_LIMIT).map((item) => ({
          id: item.id,
          label: item.boardCode,
          subtitle: `V${item.versionNo}`,
        })),
      },
      {
        entityType: AttachmentTargetType.PERFORMANCE_TEST,
        label: '性能试验',
        items: tests.slice(0, ATTACHMENT_ENTITY_OPTION_LIMIT).map((item) => ({
          id: item.id,
          label: item.testCode,
          subtitle: this.getPerformanceTestTypeLabel(item.testItem),
        })),
      },
      {
        entityType: AttachmentTargetType.REVIEW_RECORD,
        label: '评审记录',
        items: reviews.slice(0, ATTACHMENT_ENTITY_OPTION_LIMIT).map((item) => ({
          id: item.id,
          label: this.getReviewTypeLabel(item.reviewType),
          subtitle: item.result,
        })),
      },
      {
        entityType: AttachmentTargetType.NEW_COLOR_REPORT,
        label: '新颜色开发报告',
        items: reports.slice(0, ATTACHMENT_ENTITY_OPTION_LIMIT).map((item) => ({
          id: item.id,
          label: item.reportTitle,
          subtitle: '开发报告',
        })),
      },
      {
        entityType: AttachmentTargetType.TRIAL_PRODUCTION,
        label: '样车试制',
        items: trials.slice(0, ATTACHMENT_ENTITY_OPTION_LIMIT).map((item) => ({
          id: item.id,
          label: item.trialNo,
          subtitle: item.status,
        })),
      },
    ];
    return { groups, hasMore };
  }

  private async buildEntityLabelMapForAttachments(
    db: AttachmentDbClient,
    projectId: string,
    attachments: AttachmentRecordLike[],
  ) {
    const labels = new Map<string, string>();
    const idsFor = (entityType: AttachmentTargetType) => [
      ...new Set(
        attachments
          .filter((attachment) => attachment.entityType === entityType)
          .map((attachment) => attachment.entityId),
      ),
    ];

    const projectIds = idsFor(AttachmentTargetType.PROJECT);
    if (projectIds.length > 0) {
      const project = await this.getProjectOrThrow(db, projectId);
      labels.set(
        `${AttachmentTargetType.PROJECT}:${project.id}`,
        `${project.code} / ${project.name}`,
      );
    }

    const taskIds = idsFor(AttachmentTargetType.WORKFLOW_TASK);
    if (taskIds.length > 0) {
      const tasks = await db.workflowTask.findMany({
        where: { projectId, id: { in: taskIds } },
        select: { id: true, stepCode: true, nodeName: true },
        take: ATTACHMENT_MAX_PAGE_SIZE,
      });
      for (const item of tasks) {
        labels.set(
          `${AttachmentTargetType.WORKFLOW_TASK}:${item.id}`,
          `${item.stepCode ?? '--'} / ${item.nodeName}`,
        );
      }
    }

    const sampleIds = idsFor(AttachmentTargetType.SAMPLE);
    if (sampleIds.length > 0) {
      const samples = await db.sample.findMany({
        where: { projectId, id: { in: sampleIds } },
        select: { id: true, sampleNo: true, sampleName: true },
        take: ATTACHMENT_MAX_PAGE_SIZE,
      });
      for (const item of samples) {
        labels.set(
          `${AttachmentTargetType.SAMPLE}:${item.id}`,
          `${item.sampleNo} / ${item.sampleName}`,
        );
      }
    }

    const boardIds = idsFor(AttachmentTargetType.STANDARD_BOARD);
    if (boardIds.length > 0) {
      const boards = await db.standardBoard.findMany({
        where: { projectId, id: { in: boardIds } },
        select: { id: true, boardCode: true },
        take: ATTACHMENT_MAX_PAGE_SIZE,
      });
      for (const item of boards) {
        labels.set(
          `${AttachmentTargetType.STANDARD_BOARD}:${item.id}`,
          item.boardCode,
        );
      }
    }

    const performanceTestIds = idsFor(AttachmentTargetType.PERFORMANCE_TEST);
    if (performanceTestIds.length > 0) {
      const tests = await db.performanceTest.findMany({
        where: { projectId, id: { in: performanceTestIds } },
        select: { id: true, testCode: true },
        take: ATTACHMENT_MAX_PAGE_SIZE,
      });
      for (const item of tests) {
        labels.set(
          `${AttachmentTargetType.PERFORMANCE_TEST}:${item.id}`,
          item.testCode,
        );
      }
    }

    const reviewIds = idsFor(AttachmentTargetType.REVIEW_RECORD);
    if (reviewIds.length > 0) {
      const reviews = await db.reviewRecord.findMany({
        where: { projectId, id: { in: reviewIds } },
        select: { id: true, reviewType: true },
        take: ATTACHMENT_MAX_PAGE_SIZE,
      });
      for (const item of reviews) {
        labels.set(
          `${AttachmentTargetType.REVIEW_RECORD}:${item.id}`,
          this.getReviewTypeLabel(item.reviewType),
        );
      }
    }

    const reportIds = idsFor(AttachmentTargetType.NEW_COLOR_REPORT);
    if (reportIds.length > 0) {
      const reports = await db.developmentReport.findMany({
        where: { projectId, id: { in: reportIds } },
        select: { id: true, reportTitle: true },
        take: ATTACHMENT_MAX_PAGE_SIZE,
      });
      for (const item of reports) {
        labels.set(
          `${AttachmentTargetType.NEW_COLOR_REPORT}:${item.id}`,
          item.reportTitle,
        );
      }
    }

    const trialIds = idsFor(AttachmentTargetType.TRIAL_PRODUCTION);
    if (trialIds.length > 0) {
      const trials = await db.trialProduction.findMany({
        where: { projectId, id: { in: trialIds } },
        select: { id: true, trialNo: true },
        take: ATTACHMENT_MAX_PAGE_SIZE,
      });
      for (const item of trials) {
        labels.set(
          `${AttachmentTargetType.TRIAL_PRODUCTION}:${item.id}`,
          item.trialNo,
        );
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
    let download: Awaited<ReturnType<ObjectStorageService['openDownload']>>;
    try {
      download = await this.objectStorageService.openDownload({
        bucket: attachment.bucket,
        storageKey: attachment.storageKey,
        expectedContentLength: attachment.fileSize,
      });
    } catch {
      this.logger.error(
        'eventType=attachment_download_storage_open result=failed',
      );
      throw new ServiceUnavailableException('附件内容暂不可用。');
    }
    const disposition = this.getDownloadDisposition(attachment.mimeType, rawDisposition);

    try {
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
    } catch {
      download.stream.destroy();
      await finished(download.stream).catch(() => undefined);
      this.logger.error(
        'eventType=attachment_download_audit_write result=failed',
      );
      throw new ServiceUnavailableException('附件内容暂不可用。');
    }

    return {
      stream: download.stream,
      contentLength: download.contentLength,
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
    await this.withSystemAttachmentWrite(input, async (tx) => {
      const updated = await tx.attachment.update({
        where: { id: attachment.id, scanStatus: AttachmentScanStatus.PENDING_SCAN },
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

  private async recordScanFailureAndRelease(
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
    reservation: { id: string; ownerToken: string },
  ) {
    const [recordResult, purgeResult] = await Promise.allSettled([
      this.recordScanFailure(attachment, input, scanStatus, result),
      this.attachmentStorageQuotaService.purgeAndRelease({
        reservationId: reservation.id,
        expectedOwnerToken: reservation.ownerToken,
        reason: result.resultSummary,
      }),
    ]);

    if (recordResult.status === 'rejected') {
      this.logger.error(
        'Attachment scan failure metadata could not be persisted; reconciliation is required.',
      );
    }

    if (purgeResult.status === 'rejected') {
      this.logger.error(
        'eventType=attachment_storage_release result=reconciliation_required',
      );
    }
  }

  private async recordFinalCommitFailureAndRelease(
    attachment: AttachmentRecordLike,
    input: CreateStoredAttachmentInput,
    scanResult: MalwareScanResult,
    reservation: { id: string; ownerToken: string },
    reason: 'DOMAIN_COMMIT_REJECTED' | 'CLEAN_COMMIT_ERROR',
  ) {
    // COMMIT may have succeeded even when its acknowledgement was lost. A new
    // transaction under the same project lock resolves that uncertainty before
    // changing metadata or attempting binary cleanup.
    let committed: ReturnType<AttachmentsService['toAttachmentSummary']> | null;
    try {
      committed = await this.withSystemAttachmentWrite(input, async tx => {
        const current = await tx.attachment.findUnique({ where: { id: attachment.id }, include: ATTACHMENT_DETAIL_INCLUDE });
        if (current?.scanStatus === AttachmentScanStatus.CLEAN) {
          const labels = input.projectId === null ? undefined : await this.buildEntityLabelMapForAttachments(tx, input.projectId, [current]);
          return this.toAttachmentSummary(current, labels);
        }
        if (current?.scanStatus === AttachmentScanStatus.PENDING_SCAN) {
          const updated = await tx.attachment.update({
            where: { id: attachment.id, scanStatus: AttachmentScanStatus.PENDING_SCAN },
            data: {
              fileUrl: null, scanStatus: AttachmentScanStatus.SCAN_ERROR,
              scannerEngine: scanResult.engine, scannerVersion: scanResult.engineVersion,
              scannerSignatureVersion: scanResult.signatureVersion, scanResultSummary: reason,
              scannedAt: scanResult.scannedAt,
            }, include: ATTACHMENT_DETAIL_INCLUDE,
          });
          await this.activityLogsService.createWithExecutor(tx, {
            projectId: input.projectId, actorUserId: input.uploadedById,
            targetType: AuditTargetType.ATTACHMENT, targetId: attachment.id,
            action: reason === 'DOMAIN_COMMIT_REJECTED' ? 'ATTACHMENT_DOMAIN_COMMIT_REJECTED' : 'ATTACHMENT_SCAN_ERROR',
            nodeCode: input.nodeCode ?? null,
            summary: reason === 'DOMAIN_COMMIT_REJECTED' ? '附件扫描期间业务状态已变更，正式绑定已拒绝。' : '附件安全状态保存失败，文件未进入业务存储。',
            beforeData: this.toAttachmentAuditSnapshot(current), afterData: this.toAttachmentAuditSnapshot(updated),
          });
        }
        return null;
      });
    } catch {
      // If the database cannot resolve the result, leave the counted reservation
      // to the existing reconciler; it checks retained state before removing bytes.
      this.logger.error('eventType=attachment_commit_failure_audit result=reconciliation_required');
      return null;
    }
    if (committed) return committed;
    await this.releaseReservedBinary(reservation.id, reservation.ownerToken, reason);
    return null;
  }

  private async releaseReservedBinary(
    reservationId: string,
    ownerToken: string,
    reason: string,
  ) {
    try {
      await this.attachmentStorageQuotaService.purgeAndRelease({
        reservationId,
        expectedOwnerToken: ownerToken,
        reason,
      });
    } catch {
      this.logger.error(
        'eventType=attachment_storage_release result=reconciliation_required',
      );
    }
  }

  private withAttachmentWrite<T>(input: CreateStoredAttachmentInput, execute: (tx: Prisma.TransactionClient) => Promise<T>) {
    if (input.projectId !== null) return withProjectWrite(this.prisma, input.actor, { projectId: input.projectId }, execute);
    return withTeamWrite(this.prisma, input.actor, async tx => {
      await authorizeSheetAttachmentTarget(tx, input.targetType, input.targetId, input.actor, this.projectAccessService, true);
      await lockSheetAttachmentTarget(tx, input.targetType, input.targetId);
      return execute(tx);
    });
  }

  // Internal failure/unknown-commit resolution must still work after actor
  // revocation or review submission; it cannot confer a new domain binding.
  private withSystemAttachmentWrite<T>(input: CreateStoredAttachmentInput, execute: (tx: Prisma.TransactionClient) => Promise<T>) {
    if (input.projectId !== null) return withSystemProjectWrite(this.prisma, input.projectId, execute);
    return this.prisma.$transaction(async tx => {
      await lockTeamAuthorization(tx);
      await lockSheetAttachmentTarget(tx, input.targetType, input.targetId);
      return execute(tx);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }

  private buildStorageKey(
    projectId: string | null,
    entityType: AttachmentTargetType,
    entityId: string,
    extension: string,
  ) {
    return `${projectId ?? "sheet-records"}/${entityType.toLowerCase()}/${entityId}/${Date.now()}-${randomUUID()}${extension}`;
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
