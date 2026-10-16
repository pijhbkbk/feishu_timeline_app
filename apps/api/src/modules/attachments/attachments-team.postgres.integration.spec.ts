import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { PrismaClient, Prisma } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AttachmentsService } from './attachments.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { UsersService } from '../users/users.service';
import { ProjectAccessService } from '../auth/project-access.service';
import { R26ProgressMaterialService } from '../r26-read-model/r26-progress-material.service';
import { lockTeamAuthorization } from '../../common/team-authorization';

const url = process.env.R28_TEST_DATABASE_URL;
const run = randomUUID().slice(0, 8);
const buffer = Buffer.from('%PDF-1.4\n');
const file = { originalname: 'evidence.pdf', mimetype: 'application/pdf', size: buffer.length, buffer };
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

describe.skipIf(!url).sequential('R28 attachment commits on real PostgreSQL', () => {
  const db = new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
  beforeAll(async () => {
    const parsed = new URL(url!);
    if (parsed.hostname !== '127.0.0.1' || parsed.port !== '55449' || !/^\/r28_[a-z_]+$/.test(parsed.pathname)) throw new Error('Only the isolated R28 database is allowed.');
  });
  afterAll(async () => {
    await db.user.updateMany({ where: { username: { startsWith: `r28-upload-${run}-` } }, data: { status: 'INACTIVE' } });
    await db.$disconnect();
  });

  async function fixture() {
    const key = `${run}-${randomUUID().slice(0, 8)}`;
    const role = await db.role.upsert({ where: { code: 'purchaser' }, update: {}, create: { code: 'purchaser', name: '采购' } });
    await db.rolePermission.createMany({ data: ['project.read', 'attachment.manage'].map(permissionCode => ({ roleId: role.id, permissionCode })), skipDuplicates: true });
    const user = await db.user.create({ data: { username: `r28-upload-${key}`, name: '合成材料操作员',
      localCredential: { create: { loginName: `r28-upload-${key}`, passwordHash: 'synthetic-not-a-login-hash' } },
      userRoles: { create: { roleId: role.id } } } });
    const actor = (await new UsersService(db as never).getAuthenticatedUser(user.id, 'local'))!;
    const project = await db.project.create({ data: { code: `R28-UPLOAD-${key}`, name: '合成材料事务项目' } });
    const instance = await db.workflowInstance.create({ data: { projectId: project.id, instanceNo: `R28-UPLOAD-${key}` } });
    const task = await db.workflowTask.create({ data: { projectId: project.id, workflowInstanceId: instance.id,
      taskNo: `R28-UPLOAD-${key}`, nodeCode: 'PAINT_PROCUREMENT', nodeName: '采购', status: 'IN_PROGRESS', assigneeUserId: actor.id, requiredRoleCode: 'purchaser' } });
    const access = new ProjectAccessService(db as never);
    const audit = new ActivityLogsService(db as never, access);
    const storage = { upload: vi.fn(), promote: vi.fn(), markDeleted: vi.fn() };
    // Binary transport and quota are outside this test's scope. All application
    // rows, command results, audit records and transaction boundaries are real.
    const quota = { reserve: vi.fn(async () => ({ id: randomUUID(), ownerToken: randomUUID() })), heartbeat: vi.fn(),
      attachPendingRecordWithExecutor: vi.fn(), markRetainedWithExecutor: vi.fn(), purgeAndRelease: vi.fn() };
    const scanner = { scan: vi.fn(async () => ({ verdict: 'CLEAN', engine: 'synthetic', engineVersion: '1', signatureVersion: '1', resultSummary: 'CLEAN', scannedAt: new Date() })) };
    let loseCommitReply = false;
    const facade = new Proxy(db, { get(target, key) {
      if (key === '$transaction') return async (operation: (tx: Prisma.TransactionClient) => Promise<unknown>, options: object) => {
        const result = await target.$transaction(operation, options);
        if (loseCommitReply) { loseCommitReply = false; throw new Error('Synthetic connection loss after COMMIT'); }
        return result;
      };
      const value = Reflect.get(target, key);
      return typeof value === 'function' ? value.bind(target) : value;
    } });
    const attachments = new AttachmentsService(facade as never, { get: () => 'synthetic' } as never, audit,
      storage as never, quota as never, access, scanner as never);
    const progress = new R26ProgressMaterialService(facade as never, access, audit, attachments);
    const upload = (input: Partial<Parameters<AttachmentsService['createStoredAttachment']>[0]> = {}) => attachments.createStoredAttachment({
      actor, projectId: project.id, targetType: 'WORKFLOW_TASK', targetId: task.id, file, uploadedById: actor.id,
      finalizeDomainAttachment: async tx => { await tx.workflowTask.update({ where: { id: task.id }, data: { payload: { marker: '合成已保存事实' } } }); }, ...input,
    });
    return { actor, project, task, attachments, progress, scanner, storage, quota, upload, loseReply: () => { loseCommitReply = true; } };
  }

  it('rolls back the task, command, archive and success audit when saving the upload result fails', async () => {
    const h = await fixture();
    const old = await h.upload();
    await db.workflowTask.update({ where: { id: h.task.id }, data: { payload: { marker: '变更前' } } });
    const key = `r28-upload-${randomUUID()}`;
    await db.r26CommandRequest.create({ data: { projectId: h.project.id, actorUserId: h.actor.id, idempotencyKey: key, action: 'SYNTHETIC', requestHash: 'synthetic', result: Prisma.JsonNull } });
    await expect(h.upload({ replacesAttachmentId: old.id, finalizeUploadResult: async tx => {
      await tx.r26CommandRequest.update({ where: { idempotencyKey: key }, data: { result: { uploaded: true } } });
      throw new Error('Synthetic result failure');
    } })).rejects.toThrow('附件安全状态保存失败');
    expect((await db.workflowTask.findUniqueOrThrow({ where: { id: h.task.id } })).payload).toEqual({ marker: '变更前' });
    expect((await db.r26CommandRequest.findUniqueOrThrow({ where: { idempotencyKey: key } })).result).toBeNull();
    expect((await db.attachment.findUniqueOrThrow({ where: { id: old.id } })).isDeleted).toBe(false);
    expect(await db.attachment.count({ where: { projectId: h.project.id, scanStatus: 'CLEAN' } })).toBe(1);
    expect(await db.auditLog.count({ where: { projectId: h.project.id, action: 'ATTACHMENT_UPLOADED' } })).toBe(1);
    expect(h.storage.markDeleted).not.toHaveBeenCalled();
    expect(h.quota.purgeAndRelease).toHaveBeenCalledOnce();
  });

  it('recovers a committed CLEAN attachment and command when the commit acknowledgement is lost', async () => {
    const h = await fixture();
    const old = await h.upload();
    const key = `r28-upload-${randomUUID()}`;
    await db.r26CommandRequest.create({ data: { projectId: h.project.id, actorUserId: h.actor.id, idempotencyKey: key, action: 'SYNTHETIC', requestHash: 'synthetic', result: Prisma.JsonNull } });
    const result = await h.upload({ replacesAttachmentId: old.id, finalizeUploadResult: async (tx, attachment) => {
      await tx.r26CommandRequest.update({ where: { idempotencyKey: key }, data: { result: { attachmentId: attachment.id } } });
      h.loseReply();
    } });
    expect((await db.attachment.findUniqueOrThrow({ where: { id: result.id } })).scanStatus).toBe('CLEAN');
    expect((await db.attachment.findUniqueOrThrow({ where: { id: old.id } })).isDeleted).toBe(true);
    expect((await db.r26CommandRequest.findUniqueOrThrow({ where: { idempotencyKey: key } })).result).toEqual({ attachmentId: result.id });
    expect(await db.auditLog.count({ where: { targetId: result.id, action: 'ATTACHMENT_UPLOADED' } })).toBe(1);
    expect(h.quota.purgeAndRelease).not.toHaveBeenCalled();
  });

  it('cleans up a revoked upload without changing the task or leaving a success result', async () => {
    const h = await fixture(); const started = deferred(); const release = deferred();
    const scan = h.scanner.scan.getMockImplementation()!;
    h.scanner.scan.mockImplementation(async () => { started.resolve(); await release.promise; return scan(); });
    const input = { materialType: 'WORK_EVIDENCE', taskVersion: h.task.updatedAt.toISOString(), idempotencyKey: `r28-upload-${randomUUID()}` };
    const promise = h.progress.uploadMaterial(h.task.id, input, file, h.actor, 'synthetic-request');
    const outcome = expect(promise).rejects.toThrow('授权已变化');
    await started.promise;
    await db.$transaction(async tx => { await lockTeamAuthorization(tx, true); await tx.user.update({ where: { id: h.actor.id }, data: { authVersion: { increment: 1 } } }); });
    release.resolve(); await outcome;
    expect((await db.workflowTask.findUniqueOrThrow({ where: { id: h.task.id } })).updatedAt).toEqual(h.task.updatedAt);
    expect(await db.attachment.count({ where: { projectId: h.project.id, scanStatus: 'SCAN_ERROR' } })).toBe(1);
    expect(await db.attachment.count({ where: { projectId: h.project.id, scanStatus: 'CLEAN' } })).toBe(0);
    expect(await db.r26CommandRequest.count({ where: { idempotencyKey: input.idempotencyKey } })).toBe(0);
    expect(await db.auditLog.count({ where: { projectId: h.project.id, action: 'ATTACHMENT_UPLOADED' } })).toBe(0);
    expect(h.quota.purgeAndRelease).toHaveBeenCalledOnce();
  });

  it('replays success after a competing request commits between the initial lookup and project lock', async () => {
    const h = await fixture(); const secondRead = deferred(); const resume = deferred();
    const key = `r28-upload-${randomUUID()}`;
    const input = { materialType: 'WORK_EVIDENCE', taskVersion: h.task.updatedAt.toISOString(), idempotencyKey: key };
    // Pause one request immediately after its initial miss. Another request then
    // commits, so the paused one must re-read under the lock before version checks.
    const initialLookup = vi.spyOn(h.progress as any, 'findCommandReplay').mockImplementationOnce(async () => {
      secondRead.resolve(); await resume.promise; return null;
    });
    const delayed = h.progress.uploadMaterial(h.task.id, input, file, h.actor, 'delayed');
    await secondRead.promise; initialLookup.mockRestore();
    const first = await h.progress.uploadMaterial(h.task.id, input, file, h.actor, 'first');
    resume.resolve(); const replay = await delayed;
    expect(replay).toMatchObject({ idempotentReplay: true, attachment: (first as any).attachment });
    expect(h.storage.upload).toHaveBeenCalledOnce();
    expect(await db.auditLog.count({ where: { projectId: h.project.id, action: 'ATTACHMENT_UPLOADED' } })).toBe(1);
  });

  it('permits exactly one of two scanned replacements of the same version', async () => {
    const h = await fixture();
    const old = await h.upload();
    const started = deferred(); const release = deferred(); let scanned = 0;
    const scan = h.scanner.scan.getMockImplementation()!;
    h.scanner.scan.mockImplementation(async () => { if (++scanned === 2) started.resolve(); await release.promise; return scan(); });
    const uploads = [h.upload({ replacesAttachmentId: old.id }), h.upload({ replacesAttachmentId: old.id })];
    const outcomes = Promise.allSettled(uploads);
    await started.promise; release.resolve();
    const result = await outcomes;
    expect(result.filter(item => item.status === 'fulfilled')).toHaveLength(1);
    expect(await db.attachment.count({ where: { projectId: h.project.id, scanStatus: 'CLEAN', isDeleted: false } })).toBe(1);
    expect(await db.auditLog.count({ where: { projectId: h.project.id, action: 'ATTACHMENT_REPLACED' } })).toBe(1);
    expect(h.storage.markDeleted).toHaveBeenCalledOnce();
    expect(h.quota.purgeAndRelease).toHaveBeenCalledOnce();
  });
});
