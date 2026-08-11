import {
  AttachmentScanStatus,
  AttachmentTargetType,
  WorkflowNodeCode,
  WorkflowTaskStatus,
} from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { R26ProgressMaterialService } from './r26-progress-material.service';

const actor = {
  id: 'assignee-1',
  roleCodes: ['purchaser'],
  permissionCodes: ['project.read'],
  isSystemAdmin: false,
} as never;

const initialTaskVersion = new Date('2026-08-11T05:00:00.000Z');
const file = {
  originalname: 'material.pdf',
  mimetype: 'application/pdf',
  size: 16,
  buffer: Buffer.from('%PDF-1.7\n'),
};

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

function createTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-1',
    projectId: 'project-1',
    nodeCode: WorkflowNodeCode.PAINT_PROCUREMENT,
    status: WorkflowTaskStatus.IN_PROGRESS,
    isActive: true,
    updatedAt: initialTaskVersion,
    ...overrides,
  };
}

function createMutex() {
  let tail = Promise.resolve();
  return async <T>(operation: () => Promise<T>) => {
    const previous = tail;
    let release!: () => void;
    tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  };
}

function createHarness(expectedScanCount = 1) {
  const scansStarted = createDeferred<void>();
  const releaseScans = createDeferred<void>();
  const runExclusive = createMutex();
  let scanCount = 0;
  let currentTask = createTask();
  let activeMaterial: Record<string, unknown> | null = null;
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: 'locked' }]),
    workflowTask: {
      findUnique: vi.fn(async () => currentTask),
      findFirst: vi.fn(async () => currentTask),
      updateMany: vi.fn(async (args: any) => {
        const expected = args.where.updatedAt as Date;
        if (
          currentTask.updatedAt.getTime() !== expected.getTime() ||
          !currentTask.isActive ||
          !args.where.status.in.includes(currentTask.status)
        ) {
          return { count: 0 };
        }
        currentTask = createTask({
          ...currentTask,
          updatedAt: args.data.updatedAt,
        });
        return { count: 1 };
      }),
    },
    attachment: {
      findFirst: vi.fn(async () => activeMaterial),
    },
  };
  const prisma = {
    attachment: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    r26CommandRequest: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'command-1' }),
      update: vi.fn().mockResolvedValue({ id: 'command-1' }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const attachments = {
    createStoredAttachment: vi.fn(async (input: any) => {
      scanCount += 1;
      if (scanCount === expectedScanCount) {
        scansStarted.resolve();
      }
      await releaseScans.promise;
      return runExclusive(async () => {
        const attachmentId = `attachment-${input.summary.includes('V') ? 'replacement' : scanCount}`;
        await input.finalizeDomainAttachment(tx, {
          attachmentId,
          replacement: null,
        });
        activeMaterial = {
          id: attachmentId,
          projectId: 'project-1',
          entityType: AttachmentTargetType.WORKFLOW_TASK,
          entityId: 'task-1',
          materialType: input.materialType,
          isDeleted: false,
          scanStatus: AttachmentScanStatus.CLEAN,
        };
        return { id: attachmentId, fileName: file.originalname, versionNo: 1 };
      });
    }),
  };
  const service = new R26ProgressMaterialService(
    prisma as never,
    {} as never,
    {} as never,
    attachments as never,
  );
  vi.spyOn(service as any, 'loadWritableTaskOrThrow').mockResolvedValue(
    createTask(),
  );

  return {
    service,
    prisma,
    tx,
    attachments,
    scansStarted,
    releaseScans,
    setCurrentTask(next: Record<string, unknown>) {
      currentTask = createTask(next);
    },
    setActiveMaterial(next: Record<string, unknown> | null) {
      activeMaterial = next;
    },
  };
}

function uploadInput(idempotencyKey: string) {
  return {
    materialType: 'WORK_EVIDENCE',
    taskVersion: initialTaskVersion.toISOString(),
    idempotencyKey,
  };
}

describe('R26 material attachment scan-finalize integrity', () => {
  it('rejects a material when the workflow task becomes terminal while scanning', async () => {
    const harness = createHarness();
    const upload = harness.service.uploadMaterial(
      'task-1',
      uploadInput('r26:material:terminal'),
      file,
      actor,
      'request-terminal',
    );
    await harness.scansStarted.promise;
    harness.setCurrentTask({
      status: WorkflowTaskStatus.COMPLETED,
      isActive: false,
    });
    harness.releaseScans.resolve();

    await expect(upload).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'ATTACHMENT_TARGET_STATE_CHANGED',
      }),
    });
    expect(harness.tx.workflowTask.updateMany).not.toHaveBeenCalled();
    expect(harness.prisma.r26CommandRequest.update).not.toHaveBeenCalled();
    expect(harness.prisma.r26CommandRequest.deleteMany).toHaveBeenCalled();
  });

  it('allows exactly one of two material uploads that share the same taskVersion', async () => {
    const harness = createHarness(2);
    const uploads = [
      harness.service.uploadMaterial(
        'task-1',
        uploadInput('r26:material:concurrent:a'),
        file,
        actor,
        'request-a',
      ),
      harness.service.uploadMaterial(
        'task-1',
        uploadInput('r26:material:concurrent:b'),
        file,
        actor,
        'request-b',
      ),
    ];
    await harness.scansStarted.promise;
    harness.releaseScans.resolve();

    const outcomes = await Promise.allSettled(uploads);
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = outcomes.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    expect(rejected?.reason).toMatchObject({
      response: expect.objectContaining({
        code: 'ATTACHMENT_TARGET_STATE_CHANGED',
      }),
    });
    expect(harness.tx.workflowTask.updateMany).toHaveBeenCalledTimes(1);
    expect(harness.prisma.r26CommandRequest.update).toHaveBeenCalledTimes(1);
    expect(harness.prisma.r26CommandRequest.deleteMany).toHaveBeenCalledTimes(1);
    expect(harness.attachments.createStoredAttachment).toHaveBeenCalledTimes(2);
    const lockSql = harness.tx.$queryRaw.mock.calls
      .map(([query]) => (query as { strings?: string[] }).strings?.join('') ?? '')
      .join('\n');
    expect(lockSql).toContain('workflow_tasks');
    expect(lockSql).toContain('FOR UPDATE');
  });

  it('locks the workflow task before validating the active replacement material', async () => {
    const harness = createHarness();
    harness.setActiveMaterial({
      id: 'attachment-old',
      projectId: 'project-1',
      entityType: AttachmentTargetType.WORKFLOW_TASK,
      entityId: 'task-1',
      materialType: 'WORK_EVIDENCE',
      versionNo: 2,
      isDeleted: false,
      scanStatus: AttachmentScanStatus.CLEAN,
    });
    const finalize = (harness.service as any).createMaterialAttachmentFinalizeHook({
      projectId: 'project-1',
      taskId: 'task-1',
      nodeCode: WorkflowNodeCode.PAINT_PROCUREMENT,
      materialType: 'WORK_EVIDENCE',
      taskVersion: initialTaskVersion.toISOString(),
      replacementId: 'attachment-old',
      replacementVersion: 2,
    });

    await expect(finalize(harness.tx)).resolves.toBeUndefined();
    const lockSql = harness.tx.$queryRaw.mock.calls.map(
      ([query]) => (query as { strings?: string[] }).strings?.join('') ?? '',
    );
    expect(lockSql[0]).toContain('workflow_tasks');
    expect(lockSql[0]).toContain('FOR UPDATE');
    expect(lockSql[1]).toContain('attachments');
    expect(lockSql[1]).toContain('FOR UPDATE');
  });
});
