import { Readable } from 'node:stream';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { SheetImagesService } from './sheet-images.service';
import { IMAGE_MAX_BYTES } from './sheet-images.rules';
import type { AuthenticatedUser } from '../auth/auth.types';

const actor = { id: 'approved-worker', authSource: 'local', authVersion: 1, teamAccessApproved: true, isSystemAdmin: false, roleCodes: [], permissionCodes: [] } as unknown as AuthenticatedUser;
const image = { id: '1e513b6f-e7c6-4e83-b6d0-b128d14f2a8a', attachmentId: 'attachment-a', targetType: 'SHEET_PERSON', recordId: 'person-a', fieldKey: 'photos', mode: 'CELL', offsetX: 0, offsetY: 0, width: 120, height: 80, pixelWidth: 16, pixelHeight: 16, attachment: { mimeType: 'image/png' }, revision: 1, isDeleted: false };
const input = { operationId: 'upload-a', targetType: 'SHEET_PERSON', recordId: 'person-a', layout: { fieldKey: 'photos', mode: 'CELL', offsetX: 0, offsetY: 0, width: 120, height: 80 } };
let png: Buffer;
beforeAll(async () => { png = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#abcdef' } }).png().toBuffer(); });
function fixture() {
  const saved: Record<string, unknown>[] = [];
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(undefined), $queryRaw: vi.fn().mockResolvedValue([]),
    user: { findUnique: vi.fn().mockResolvedValue({ status: 'ACTIVE', authVersion: 1, isSystemAdmin: false, teamAccessApproved: true, userRoles: [] }) },
    personProfile: { findUnique: vi.fn().mockResolvedValue({ id: 'person-a' }) },
    sheetImage: {
      findUnique: vi.fn().mockImplementation(async () => saved[0] ?? null),
      findUniqueOrThrow: vi.fn().mockImplementation(async () => saved[0]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockImplementation(async ({ data }) => { const result = { ...image, ...data }; saved.push(result); return result; }),
    }, auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-a' }) },
  };
  const prisma = { ...tx, $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(tx)) };
  const attachments = {
    createStoredAttachment: vi.fn().mockImplementation(async (args) => { await args.finalizeDomainAttachment(tx, { attachmentId: 'attachment-a' }); await args.finalizeUploadResult(tx, { id: 'attachment-a' }); return { id: 'attachment-a' }; }),
    getAttachmentContent: vi.fn(),
  };
  return { service: new SheetImagesService(prisma as never, attachments as never, {} as never), tx, attachments, saved };
}
describe('sheet images binary and persistence boundary', () => {
  it('replays exact upload bytes but rejects changed file bytes under the same operation ID', async () => {
    const { service, attachments, tx } = fixture();
    const file = { originalname: 'synthetic.png', mimetype: 'image/png', size: png.length, buffer: png };
    expect(await service.upload(input, file, actor)).toMatchObject({ replayed: false });
    expect(await service.upload(input, file, actor)).toMatchObject({ replayed: true });
    expect(attachments.createStoredAttachment).toHaveBeenCalledTimes(1); expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    const other = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#ff0000' } }).png().toBuffer();
    await expect(service.upload(input, { ...file, buffer: other, size: other.length }, actor)).rejects.toMatchObject({ status: 409 });
  });
  it('never invokes storage for non-image or oversized payloads', async () => {
    const { service, attachments } = fixture();
    await expect(service.upload(input, { originalname: 'a.png', mimetype: 'image/png', size: 4, buffer: Buffer.from('oops') }, actor)).rejects.toMatchObject({ status: 400 });
    const over = Buffer.alloc(IMAGE_MAX_BYTES + 1);
    await expect(service.upload(input, { originalname: 'a.png', mimetype: 'image/png', size: over.length, buffer: over }, actor)).rejects.toMatchObject({ status: 400 });
    expect(attachments.createStoredAttachment).not.toHaveBeenCalled();
  });
  it('resolves an upload response lost after the final transaction without uploading twice', async () => {
    const { service, attachments } = fixture();
    const original = attachments.createStoredAttachment.getMockImplementation()!;
    attachments.createStoredAttachment.mockImplementationOnce(async (...args) => { await original(...args); throw new Error('synthetic lost acknowledgement'); });
    expect(await service.upload(input, { originalname: 'a.png', mimetype: 'image/png', size: png.length, buffer: png }, actor)).toMatchObject({ replayed: true });
    expect(attachments.createStoredAttachment).toHaveBeenCalledTimes(1);
  });
  it('generates a bounded thumbnail through the authorized original content service', async () => {
    const { service, attachments, saved } = fixture(); saved.push(image);
    attachments.getAttachmentContent.mockResolvedValue({ stream: Readable.from(png), contentLength: png.length });
    const result = await service.thumbnail(image.id, actor);
    expect(attachments.getAttachmentContent).toHaveBeenCalledWith('attachment-a', actor, 'inline');
    expect((await sharp(result).metadata()).format).toBe('webp'); expect(result.length).toBeLessThan(512 * 1024);
  });
  it('bounds actual streamed bytes even if the declared length is false', async () => {
    const { service, attachments, saved } = fixture(); saved.push(image);
    const stream = Readable.from([Buffer.alloc(IMAGE_MAX_BYTES), Buffer.from('extra')]);
    attachments.getAttachmentContent.mockResolvedValue({ stream, contentLength: 10 });
    await expect(service.thumbnail(image.id, actor)).rejects.toMatchObject({ status: 400 }); expect(stream.destroyed).toBe(true);
  });
});
