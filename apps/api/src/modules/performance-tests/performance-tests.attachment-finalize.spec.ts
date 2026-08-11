import { PerformanceTestStatus, WorkflowNodeCode } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { PerformanceTestsService } from './performance-tests.service';

const actor = {
  id: 'quality-1',
  roleCodes: ['quality_engineer'],
  permissionCodes: ['project.read', 'workflow.transition', 'attachment.manage'],
  isSystemAdmin: false,
} as never;

const file = {
  originalname: 'performance.pdf',
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

function createTestRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'performance-1',
    projectId: 'project-1',
    testCode: 'PT-001',
    status: PerformanceTestStatus.DRAFT,
    reportAttachmentId: 'attachment-old',
    ...overrides,
  };
}

function createHarness(deferred = false) {
  const scanStarted = createDeferred<void>();
  const releaseScan = createDeferred<void>();
  let currentTest = createTestRecord();
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: 'locked' }]),
    performanceTest: {
      findFirst: vi.fn(async () => currentTest),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn(),
    },
    workflowTask: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'task-1',
        projectId: 'project-1',
        nodeCode: WorkflowNodeCode.PERFORMANCE_TEST,
        isActive: true,
      }),
    },
    attachment: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'attachment-old',
        projectId: 'project-1',
        entityType: 'PERFORMANCE_TEST',
        entityId: 'performance-1',
        isDeleted: false,
        scanStatus: 'CLEAN',
      }),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (executor: (client: typeof tx) => Promise<unknown>) =>
      executor(tx),
    ),
  };
  const activityLogs = {
    createWithExecutor: vi.fn().mockResolvedValue({ id: 'audit-1' }),
  };
  const attachments = {
    createStoredAttachment: vi.fn(async (input: any) => {
      if (deferred) {
        scanStarted.resolve();
        await releaseScan.promise;
      }
      await input.finalizeDomainAttachment(tx, {
        attachmentId: 'attachment-new',
        replacement: {
          id: 'attachment-old',
          projectId: 'project-1',
          entityType: 'PERFORMANCE_TEST',
          entityId: 'performance-1',
          scanStatus: 'CLEAN',
          isDeleted: false,
        },
      });
      return { id: 'attachment-new', fileName: 'performance.pdf' };
    }),
  };
  const service = new PerformanceTestsService(
    prisma as never,
    activityLogs as never,
    attachments as never,
    {} as never,
    {
      assertProjectAccessWithDefaultClient: vi.fn().mockResolvedValue({
        id: 'project-1',
      }),
    } as never,
  );
  const internals = service as any;
  vi.spyOn(internals, 'getPerformanceContext').mockResolvedValue({
    procurementCompleted: true,
    activeTask: { id: 'task-1' },
    records: [],
    project: { id: 'project-1' },
  });
  vi.spyOn(internals, 'getTestOrThrow').mockImplementation(async () => currentTest);
  vi.spyOn(internals, 'buildDetail').mockResolvedValue({ id: 'performance-1' });

  return {
    service,
    prisma,
    tx,
    attachments,
    activityLogs,
    scanStarted,
    releaseScan,
    setCurrentTest(next: Record<string, unknown>) {
      currentTest = createTestRecord(next);
    },
  };
}

describe('PerformanceTestsService attachment scan-finalize integrity', () => {
  it('rejects a report when the performance test is submitted while scanning', async () => {
    const harness = createHarness(true);
    const upload = harness.service.uploadReport(
      'project-1',
      'performance-1',
      file,
      actor,
    );
    await harness.scanStarted.promise;
    harness.setCurrentTest({ status: PerformanceTestStatus.SUBMITTED });
    harness.releaseScan.resolve();

    await expect(upload).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'ATTACHMENT_TARGET_STATE_CHANGED',
      }),
    });
    expect(harness.tx.performanceTest.updateMany).not.toHaveBeenCalled();
    expect(harness.tx.performanceTest.update).not.toHaveBeenCalled();
    expect(harness.activityLogs.createWithExecutor).not.toHaveBeenCalled();
  });

  it('binds the report inside the locked finalize transaction on the happy path', async () => {
    const harness = createHarness();

    await expect(
      harness.service.uploadReport(
        'project-1',
        'performance-1',
        file,
        actor,
      ),
    ).resolves.toEqual({ id: 'performance-1' });

    expect(harness.attachments.createStoredAttachment).toHaveBeenCalledWith(
      expect.objectContaining({
        replacesAttachmentId: 'attachment-old',
        finalizeDomainAttachment: expect.any(Function),
      }),
    );
    expect(harness.tx.performanceTest.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'performance-1',
        projectId: 'project-1',
        status: PerformanceTestStatus.DRAFT,
        reportAttachmentId: 'attachment-old',
      }),
      data: { reportAttachmentId: 'attachment-new' },
    });
    expect(harness.tx.performanceTest.update).not.toHaveBeenCalled();
    const lockSql = harness.tx.$queryRaw.mock.calls.map(
      ([query]) => (query as { strings?: string[] }).strings?.join('') ?? '',
    );
    expect(lockSql[0]).toContain('performance_tests');
    expect(lockSql[0]).toContain('FOR UPDATE');
    expect(lockSql[1]).toContain('workflow_tasks');
    expect(lockSql[1]).toContain('FOR UPDATE');
    expect(lockSql[2]).toContain('attachments');
    expect(lockSql[2]).toContain('FOR UPDATE');
  });
});
