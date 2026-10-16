import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { SheetImagesService } from './sheet-images.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { AttachmentStorageQuotaService } from '../attachments/attachment-storage-quota.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { ProjectAccessService } from '../auth/project-access.service';
import { TEAM_BUSINESS_PERMISSIONS } from '../../common/team-membership';
import type { AuthenticatedUser } from '../auth/auth.types';

const connection = process.env.SHEET_IMAGES_TEST_DATABASE_URL;
if (connection) {
  const url = new URL(connection);
  if (url.hostname !== '127.0.0.1' || url.port !== '55438' || !/^\/sheet_images_[a-z0-9_]+$/.test(url.pathname)) throw new Error('Only isolated loopback:55438/sheet_images_* PostgreSQL is allowed.');
}
describe.runIf(Boolean(connection)).sequential('sheet image relational concurrency', () => {
  const db = new PrismaClient({ datasources: { db: { url: connection ?? 'postgresql://synthetic:synthetic@127.0.0.1:55438/sheet_images_not_running' } } });
  let actor: AuthenticatedUser; let personId: string; let service: SheetImagesService;
  let originalContent: AttachmentsService;
  let file: { originalname: string; mimetype: string; size: number; buffer: Buffer };
  const operationId = randomUUID(); let imageId: string; let attachmentId: string;
  const layout = { fieldKey: 'photos', mode: 'CELL', offsetX: 0, offsetY: 0, width: 120, height: 80 };
  beforeAll(async () => {
    const username = `sheet-images-${randomUUID()}`;
    const user = await db.user.create({ data: { username, name: '合成图片操作员', teamAccessApproved: true,
      localCredential: { create: { loginName: username, passwordHash: 'synthetic-service-test-not-login' } } } });
    actor = { id: user.id, username, name: user.name, email: null, departmentId: null, departmentName: null,
      authSource: 'local', authVersion: user.authVersion, isSystemAdmin: false, teamAccessApproved: true, roleCodes: [], permissionCodes: [...TEAM_BUSINESS_PERMISSIONS] };
    personId = (await db.personProfile.create({ data: { name: '合成被拍摄档案' } })).id;
    const access = new ProjectAccessService(db as never); const audit = new ActivityLogsService(db as never, access);
    const binaries = new Map<string, Buffer>();
    // Transport/AV engine are synthetic. Quota, reservation, scan lifecycle,
    // final domain binding, audit and all transaction/lock behavior are real DB.
    const storage = {
      assertWriteCapacity: async () => undefined, readAvailableBytes: async () => 100_000_000_000n,
      upload: async ({ storageKey, buffer }: { storageKey: string; buffer: Buffer }) => { binaries.set(storageKey, buffer); },
      promote: async ({ sourceStorageKey, destinationStorageKey }: { sourceStorageKey: string; destinationStorageKey: string }) => { binaries.set(destinationStorageKey, binaries.get(sourceStorageKey)!); binaries.delete(sourceStorageKey); },
      purge: async ({ storageKey }: { storageKey: string }) => { binaries.delete(storageKey); },
      inspect: async ({ storageKey }: { storageKey: string }) => ({ exists: binaries.has(storageKey), size: binaries.get(storageKey)?.length ?? null }),
    };
    const config = { get: (key: string) => key === 'objectStorageBucket' ? 'synthetic-images' : undefined };
    const quota = new AttachmentStorageQuotaService(db as never, config as never, storage as never, audit);
    const scanner = { scan: async () => ({ verdict: 'CLEAN', engine: 'synthetic', engineVersion: '1', signatureVersion: '1', resultSummary: 'CLEAN', scannedAt: new Date() }) };
    originalContent = new AttachmentsService(db as never, config as never, audit, storage as never, quota, access, scanner as never);
    service = new SheetImagesService(db as never, originalContent, access);
    const buffer = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#aabbcc' } }).png().toBuffer();
    file = { originalname: 'synthetic.png', mimetype: 'image/png', size: buffer.length, buffer };
  });
  afterAll(async () => { await db.$disconnect(); });
  it('commits only one image and CLEAN binding for concurrent exact uploads', async () => {
    const input = { operationId, targetType: 'SHEET_PERSON', recordId: personId, layout };
    const outcomes = await Promise.all([service.upload(input, file, actor), service.upload(input, file, actor)]);
    expect(outcomes[0]!.image.id).toBe(outcomes[1]!.image.id);
    imageId = outcomes[0]!.image.id; attachmentId = outcomes[0]!.image.attachmentId;
    expect(await db.sheetImage.count({ where: { actorUserId: actor.id, operationId } })).toBe(1);
    expect(await db.attachment.count({ where: { entityId: personId, scanStatus: 'CLEAN' } })).toBe(1);
    expect(await db.auditLog.count({ where: { targetId: attachmentId, action: 'SHEET_IMAGE_ADDED' } })).toBe(1);
    expect(await db.attachmentStorageReservation.count({ where: { attachmentId, projectId: null, state: 'RETAINED' } })).toBe(1);
  });
  it('changes layout by CAS without changing record ownership', async () => {
    const outcomes = await Promise.allSettled([
      service.mutate(imageId, { operationId: randomUUID(), expectedRevision: 1, layout: { ...layout, mode: 'FLOATING', offsetX: -20 } }, actor),
      service.mutate(imageId, { operationId: randomUUID(), expectedRevision: 1, layout: { ...layout, mode: 'FLOATING', offsetX: 80 } }, actor),
    ]);
    expect(outcomes.filter(item => item.status === 'fulfilled')).toHaveLength(1);
    expect(await db.sheetImage.findUniqueOrThrow({ where: { id: imageId } })).toMatchObject({ recordId: personId, attachmentId, revision: 2 });
  });
  it('soft deletes the image and attachment, retains quota/history, and does not resurrect by upload replay', async () => {
    const input = { operationId: randomUUID(), expectedRevision: 2 };
    await service.mutate(imageId, input, actor, true);
    expect(await service.mutate(imageId, input, actor, true)).toMatchObject({ replayed: true });
    expect(await db.attachment.findUniqueOrThrow({ where: { id: attachmentId } })).toMatchObject({ isDeleted: true, scanStatus: 'CLEAN' });
    expect(await db.attachmentStorageReservation.findUniqueOrThrow({ where: { attachmentId } })).toMatchObject({ state: 'RETAINED' });
    await expect(originalContent.getAttachmentContent(attachmentId, actor)).rejects.toMatchObject({ status: 404 });
    await expect(service.upload({ operationId, targetType: 'SHEET_PERSON', recordId: personId, layout }, file, actor)).rejects.toMatchObject({ status: 409 });
  });
});
