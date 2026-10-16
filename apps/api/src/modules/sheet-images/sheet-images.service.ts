import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { withTeamWrite } from '../../common/team-authorization';
import { assertApprovedTeamMember } from '../../common/team-membership';
import { closeDownloadStream } from '../../common/secure-download-streamable-file';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ProjectAccessService } from '../auth/project-access.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { authorizeSheetAttachmentTarget, lockSheetAttachmentTarget } from '../attachments/sheet-attachment-policy';
import { fields, identifier, imageIdentifier, IMAGE_MAX_BYTES, IMAGE_MAX_PER_RECORD, IMAGE_MAX_PIXELS, parseLayout, parseUpload, target } from './sheet-images.rules';

type Binary = { originalname: string; mimetype: string; size: number; buffer: Buffer };
const SELECT = { id: true, attachmentId: true, targetType: true, recordId: true, fieldKey: true, mode: true,
  offsetX: true, offsetY: true, width: true, height: true, pixelWidth: true, pixelHeight: true, revision: true, isDeleted: true,
  attachment: { select: { mimeType: true } } } satisfies Prisma.SheetImageSelect;
type Image = Prisma.SheetImageGetPayload<{ select: typeof SELECT }>;
function view(image: Image) { const { attachment, ...fields } = image; return { ...fields, mimeType: attachment.mimeType, thumbnailUrl: `/sheet-images/${image.id}/thumbnail`, contentUrl: `/attachments/${image.attachmentId}/content` }; }
function digest(value: unknown) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }

@Injectable()
export class SheetImagesService {
  constructor(private readonly prisma: PrismaService, private readonly attachments: AttachmentsService, private readonly access: ProjectAccessService) {}

  async list(raw: Record<string, unknown>, actor: AuthenticatedUser) {
    assertApprovedTeamMember(actor); fields(raw, ['targetType', 'recordIds', 'after', 'take']);
    const type = target(raw.targetType);
    if (typeof raw.recordIds !== 'string' || raw.recordIds.length > 12900) throw new BadRequestException('请提供当前可见业务记录。');
    const ids = raw.recordIds.split(',').map(identifier);
    if (ids.length > 100 || new Set(ids).size !== ids.length) throw new BadRequestException('一次读取最多 100 个不同业务记录。');
    for (const id of ids) await authorizeSheetAttachmentTarget(this.prisma, type, id, actor, this.access);
    const take = raw.take === undefined ? 100 : typeof raw.take === 'string' && /^[1-9]\d{0,2}$/.test(raw.take) ? Number(raw.take) : 0;
    if (take < 1 || take > 100) throw new BadRequestException('图片分页最大 100 条。');
    const rows = await this.prisma.sheetImage.findMany({ where: { targetType: type, recordId: { in: ids }, isDeleted: false,
      ...(raw.after ? { id: { gt: imageIdentifier(raw.after) } } : {}), attachment: { isDeleted: false, scanStatus: 'CLEAN' } }, select: SELECT, orderBy: { id: 'asc' }, take: take + 1 });
    return { items: rows.slice(0, take).map(view), nextCursor: rows.length > take ? rows[take - 1]!.id : null };
  }

  async upload(raw: unknown, file: Binary | undefined, actor: AuthenticatedUser) {
    assertApprovedTeamMember(actor); const input = parseUpload(raw);
    if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0 || file.buffer.length > IMAGE_MAX_BYTES || file.size !== file.buffer.length || !['image/png', 'image/jpeg'].includes(file.mimetype)) throw new BadRequestException('图片仅支持 5 MiB 以内的 PNG/JPEG。');
    const metadata = await sharp(file.buffer, { limitInputPixels: IMAGE_MAX_PIXELS, failOn: 'error', animated: false }).metadata().catch(() => { throw new BadRequestException('图片无法解码或超过 4000 万像素。'); });
    if (!metadata.width || !metadata.height || metadata.width * metadata.height > IMAGE_MAX_PIXELS || (metadata.pages ?? 1) > 1 || (metadata.format !== 'png' && metadata.format !== 'jpeg') || file.mimetype !== `image/${metadata.format}`) throw new BadRequestException('图片格式、像素或动画内容不合法。');
    const uploadHash = digest({ input, mimeType: file.mimetype, fileName: file.originalname, bytes: file.buffer.length, checksum: createHash('sha256').update(file.buffer).digest('hex') });
    const operation = { actorUserId: actor.id, operationId: input.operationId };
    const existing = await withTeamWrite(this.prisma, actor, async tx => {
      await authorizeSheetAttachmentTarget(tx, input.targetType, input.recordId, actor, this.access);
      return tx.sheetImage.findUnique({ where: { actorUserId_operationId: operation }, select: { ...SELECT, uploadHash: true } });
    });
    if (existing) return this.replayUpload(existing, uploadHash);
    const imageId = randomUUID();
    try {
      await this.attachments.createStoredAttachment({ actor, uploadedById: actor.id, projectId: null,
        targetType: input.targetType, targetId: input.recordId, file,
        // Called after target authorization/serialization in the existing final
        // CLEAN transaction, so there is never a CLEAN orphan awaiting binding.
        finalizeDomainAttachment: async (tx, attachment) => {
          const duplicate = await tx.sheetImage.findUnique({ where: { actorUserId_operationId: operation }, select: { id: true, uploadHash: true } });
          if (duplicate) throw new ConflictException(duplicate.uploadHash === uploadHash ? '图片操作已提交，请读取原结果。' : '操作标识已用于其他图片。');
          if (await tx.sheetImage.count({ where: { targetType: input.targetType, recordId: input.recordId, isDeleted: false } }) >= IMAGE_MAX_PER_RECORD) throw new BadRequestException('每条业务记录最多 50 张图片。');
          await tx.sheetImage.create({ data: { id: imageId, attachmentId: attachment.attachmentId, ...operation,
            targetType: input.targetType, recordId: input.recordId, ...input.layout, pixelWidth: metadata.width!, pixelHeight: metadata.height!, uploadHash } });
        },
        finalizeUploadResult: async (tx, attachment) => {
          await tx.auditLog.create({ data: { actorUserId: actor.id, targetType: 'ATTACHMENT', targetId: attachment.id,
            action: 'SHEET_IMAGE_ADDED', afterData: json({ imageId, ...input }), metadata: { operationId: input.operationId } } });
        },
      });
    } catch (error) {
      // A parallel exact retry may commit while this binary is scanned. The
      // rejected second attachment is released by the original upload pipeline.
      // Also resolves a lost acknowledgement without creating a second image.
      const committed = await withTeamWrite(this.prisma, actor, async tx => {
        await authorizeSheetAttachmentTarget(tx, input.targetType, input.recordId, actor, this.access);
        return tx.sheetImage.findUnique({ where: { actorUserId_operationId: operation }, select: { ...SELECT, uploadHash: true } });
      });
      if (committed) return this.replayUpload(committed, uploadHash);
      throw error;
    }
    const saved = await this.prisma.sheetImage.findUniqueOrThrow({ where: { id: imageId }, select: SELECT });
    return { image: view(saved), replayed: false };
  }

  async mutate(idInput: string, raw: unknown, actor: AuthenticatedUser, deletion = false) {
    const id = imageIdentifier(idInput); const input = parseLayout(raw, deletion);
    const action = deletion ? 'SHEET_IMAGE_DELETED' : 'SHEET_IMAGE_LAYOUT_CHANGED';
    const key = `sheet-image:${actor.id}:${input.operationId}`; const requestHash = digest({ action, id, input });
    return withTeamWrite(this.prisma, actor, async tx => {
      const identity = await tx.sheetImage.findUnique({ where: { id }, select: { targetType: true, recordId: true } });
      if (!identity) throw new NotFoundException('图片不存在。');
      await authorizeSheetAttachmentTarget(tx, identity.targetType, identity.recordId, actor, this.access);
      const known = await tx.adminCommandRequest.findUnique({ where: { idempotencyKey: key } });
      if (known) {
        if (known.actorUserId !== actor.id || known.requestHash !== requestHash) throw new ConflictException('操作标识已用于其他内容。');
        return { ...(known.result as object), replayed: true };
      }
      await authorizeSheetAttachmentTarget(tx, identity.targetType, identity.recordId, actor, this.access, true);
      await lockSheetAttachmentTarget(tx, identity.targetType, identity.recordId);
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${'sheet-image-command'}), hashtext(${key}))`);
      const previous = await tx.adminCommandRequest.findUnique({ where: { idempotencyKey: key } });
      if (previous) {
        if (previous.actorUserId !== actor.id || previous.requestHash !== requestHash) throw new ConflictException('操作标识已用于其他内容。');
        return { ...(previous.result as object), replayed: true };
      }
      await tx.$queryRaw(Prisma.sql`SELECT id FROM sheet_images WHERE id = ${id}::uuid FOR UPDATE`);
      const current = await tx.sheetImage.findUniqueOrThrow({ where: { id }, select: SELECT });
      if (current.isDeleted || current.revision !== input.expectedRevision) throw new ConflictException({ code: 'STALE_SHEET_IMAGE_REVISION', imageId: id, currentRevision: current.revision, message: '图片已变化，请刷新后核对。' });
      const changed = deletion || Object.entries(input.layout!).some(([field, value]) => current[field as keyof Image] !== value);
      const updated = changed ? await tx.sheetImage.update({ where: { id }, data: deletion
        ? { isDeleted: true, deletedAt: new Date(), revision: { increment: 1 } }
        : { ...input.layout, revision: { increment: 1 } }, select: SELECT }) : current;
      if (changed) {
        if (deletion) await tx.attachment.update({ where: { id: current.attachmentId }, data: { isDeleted: true, deletedAt: new Date(), deletedById: actor.id } });
        await tx.auditLog.create({ data: { actorUserId: actor.id, targetType: 'ATTACHMENT', targetId: current.attachmentId, action,
          beforeData: json(current), afterData: json(updated), metadata: { operationId: input.operationId } } });
      }
      const result = { image: view(updated) };
      await tx.adminCommandRequest.create({ data: { actorUserId: actor.id, idempotencyKey: key, action, requestHash, result: json(result) } });
      // Binary retention follows existing soft-delete policy and remains charged.
      return { ...result, replayed: false };
    });
  }

  async thumbnail(idInput: string, actor: AuthenticatedUser) {
    const id = imageIdentifier(idInput); assertApprovedTeamMember(actor);
    const image = await this.prisma.sheetImage.findUnique({ where: { id }, select: SELECT });
    if (!image || image.isDeleted) throw new NotFoundException('图片不存在。');
    await authorizeSheetAttachmentTarget(this.prisma, image.targetType, image.recordId, actor, this.access);
    const content = await this.attachments.getAttachmentContent(image.attachmentId, actor, 'inline');
    let buffer: Buffer;
    try {
      if (content.contentLength > IMAGE_MAX_BYTES) throw new BadRequestException('图片内容超过上限。');
      const chunks: Buffer[] = []; let bytes = 0;
      for await (const rawChunk of content.stream) {
        const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk as Uint8Array);
        bytes += chunk.length;
        if (bytes > IMAGE_MAX_BYTES) throw new BadRequestException('图片内容超过上限。');
        chunks.push(chunk);
      }
      buffer = Buffer.concat(chunks, bytes);
    } finally { await closeDownloadStream(content.stream); }
    const output = await sharp(buffer, { limitInputPixels: IMAGE_MAX_PIXELS, animated: false, failOn: 'error' })
      .rotate().resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true }).webp({ quality: 75 }).toBuffer()
      .catch(() => { throw new BadRequestException('图片无法生成缩略图。'); });
    if (output.length > 512 * 1024) throw new BadRequestException('缩略图超过上限。');
    return output;
  }
  private replayUpload(image: Image & { uploadHash: string }, expected: string) {
    if (image.uploadHash !== expected) throw new ConflictException('同一操作标识不能上传不同图片或更改归属。');
    if (image.isDeleted) throw new ConflictException('此上传操作对应图片已删除，不能通过重放恢复。');
    return { image: view(image), replayed: true };
  }
}
