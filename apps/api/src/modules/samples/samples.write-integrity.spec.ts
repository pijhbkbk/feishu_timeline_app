import { SampleStatus, WorkflowNodeCode } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { SamplesService } from './samples.service';

const actor = {
  id: 'quality-member',
  roleCodes: ['quality_engineer'],
  permissionCodes: ['project.read', 'workflow.transition', 'attachment.manage'],
  isSystemAdmin: false,
} as never;

const imageFile = {
  originalname: 'sample.png',
  mimetype: 'image/png',
  size: 8,
  buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
};

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

function sampleRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sample-1',
    projectId: 'project-1',
    sampleNo: 'S-001',
    sampleName: '样板 A',
    versionNo: 1,
    isCurrent: true,
    sampleType: 'PANEL',
    status: SampleStatus.DRAFT,
    confirmedAt: null,
    producedAt: null,
    location: null,
    remark: null,
    createdAt: new Date('2026-08-11T04:00:00.000Z'),
    updatedAt: new Date('2026-08-11T04:00:00.000Z'),
    ...overrides,
  };
}

function activeConfirmationTask() {
  return {
    id: 'sample-task-1',
    projectId: 'project-1',
    workflowInstanceId: 'workflow-1',
    nodeCode: WorkflowNodeCode.SAMPLE_COLOR_CONFIRMATION,
    isActive: true,
  };
}

function createHarness() {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: 'locked' }]),
    project: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'project-1',
        code: 'PRJ-001',
        name: '项目 A',
        currentNodeCode: WorkflowNodeCode.SAMPLE_COLOR_CONFIRMATION,
        plannedEndDate: null,
      }),
    },
    sample: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    workflowTask: {
      findFirst: vi.fn(),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (executor: (client: typeof tx) => Promise<unknown>) =>
      executor(tx),
    ),
    sample: {
      findFirst: vi.fn(),
    },
    workflowTask: {
      findFirst: vi.fn(),
    },
  };
  const attachments = {
    createStoredAttachment: vi.fn().mockResolvedValue({ id: 'attachment-1' }),
  };
  const service = new SamplesService(
    prisma as never,
    { createWithExecutor: vi.fn().mockResolvedValue(undefined) } as never,
    attachments as never,
    {} as never,
    {
      assertProjectAccessWithDefaultClient: vi
        .fn()
        .mockResolvedValue({ id: 'project-1' }),
    } as never,
  );
  vi.spyOn(service as never, 'buildSampleDetail' as never).mockResolvedValue({} as never);

  return { service, prisma, tx, attachments };
}

describe('SamplesService write-state integrity', () => {
  it('rejects initial sample creation when no sample-confirmation task is active', async () => {
    const { service, tx } = createHarness();
    tx.workflowTask.findFirst.mockResolvedValue(null);
    tx.sample.findMany.mockResolvedValue([]);
    tx.sample.create.mockResolvedValue(sampleRecord());

    await expect(
      service.createSample(
        'project-1',
        {
          sampleNo: 'S-001',
          sampleName: '样板 A',
          sampleType: 'PANEL',
          createNewVersion: false,
        },
        actor,
      ),
    ).rejects.toThrow('没有活跃的样板颜色确认节点');

    expect(tx.sample.create).not.toHaveBeenCalled();
  });

  it('rejects createNewVersion from a confirmed current version', async () => {
    const { service, tx } = createHarness();
    tx.workflowTask.findFirst.mockResolvedValue(activeConfirmationTask());
    const confirmedSample = sampleRecord({
      status: SampleStatus.CONFIRMED,
      confirmedAt: new Date(),
    });
    tx.sample.findMany.mockResolvedValue([confirmedSample]);
    tx.sample.findFirst.mockResolvedValue(confirmedSample);
    tx.sample.create.mockResolvedValue(sampleRecord({ versionNo: 2 }));

    await expect(
      service.createSample(
        'project-1',
        {
          sampleNo: 'S-001',
          sampleName: '样板 A V2',
          sampleType: 'PANEL',
          createNewVersion: true,
        },
        actor,
      ),
    ).rejects.toThrow('当前样板版本不允许修改');

    expect(tx.sample.updateMany).not.toHaveBeenCalled();
    expect(tx.sample.create).not.toHaveBeenCalled();
  });

  it.each([
    ['confirmed', { status: SampleStatus.CONFIRMED, confirmedAt: new Date() }],
    ['archived', { status: SampleStatus.ARCHIVED }],
    ['non-current', { isCurrent: false }],
  ])('rejects update of a %s sample', async (_label, overrides) => {
    const { service, tx } = createHarness();
    tx.workflowTask.findFirst.mockResolvedValue(activeConfirmationTask());
    tx.sample.findFirst.mockResolvedValue(sampleRecord(overrides));

    await expect(
      service.updateSample(
        'project-1',
        'sample-1',
        { remark: '不应写入' },
        actor,
      ),
    ).rejects.toThrow('当前样板版本不允许修改');

    expect(tx.sample.update).not.toHaveBeenCalled();
  });

  it('rejects update when the sample-confirmation task is no longer active', async () => {
    const { service, tx } = createHarness();
    tx.workflowTask.findFirst.mockResolvedValue(null);
    tx.sample.findFirst.mockResolvedValue(sampleRecord());

    await expect(
      service.updateSample(
        'project-1',
        'sample-1',
        { remark: '不应写入' },
        actor,
      ),
    ).rejects.toThrow('没有活跃的样板颜色确认节点');

    expect(tx.sample.update).not.toHaveBeenCalled();
  });

  it.each([
    ['confirmed', { status: SampleStatus.CONFIRMED, confirmedAt: new Date() }],
    ['archived', { status: SampleStatus.ARCHIVED }],
    ['non-current', { isCurrent: false }],
  ])('rejects image upload for a %s sample', async (_label, overrides) => {
    const { service, prisma, attachments } = createHarness();
    prisma.workflowTask.findFirst.mockResolvedValue(activeConfirmationTask());
    prisma.sample.findFirst.mockResolvedValue(sampleRecord(overrides));

    await expect(
      service.uploadSampleImage('project-1', 'sample-1', imageFile, actor),
    ).rejects.toThrow('当前样板版本不允许修改');

    expect(attachments.createStoredAttachment).not.toHaveBeenCalled();
  });

  it('rejects image upload when the sample-confirmation task is no longer active', async () => {
    const { service, prisma, attachments } = createHarness();
    prisma.workflowTask.findFirst.mockResolvedValue(null);
    prisma.sample.findFirst.mockResolvedValue(sampleRecord());

    await expect(
      service.uploadSampleImage('project-1', 'sample-1', imageFile, actor),
    ).rejects.toThrow('没有活跃的样板颜色确认节点');

    expect(attachments.createStoredAttachment).not.toHaveBeenCalled();
  });

  it('rejects an image when the sample is confirmed while scanning', async () => {
    const { service, prisma, tx, attachments } = createHarness();
    const scanStarted = createDeferred<void>();
    const releaseScan = createDeferred<void>();
    prisma.workflowTask.findFirst.mockResolvedValue(activeConfirmationTask());
    prisma.sample.findFirst.mockResolvedValue(sampleRecord());
    tx.sample.findFirst.mockResolvedValue(
      sampleRecord({ status: SampleStatus.CONFIRMED, confirmedAt: new Date() }),
    );
    tx.workflowTask.findFirst.mockResolvedValue(activeConfirmationTask());
    attachments.createStoredAttachment.mockImplementation(async (input: any) => {
      scanStarted.resolve();
      await releaseScan.promise;
      await input.finalizeDomainAttachment(tx, {
        attachmentId: 'attachment-1',
        replacement: null,
      });
      return { id: 'attachment-1' };
    });

    const upload = service.uploadSampleImage(
      'project-1',
      'sample-1',
      imageFile,
      actor,
    );
    await scanStarted.promise;
    releaseScan.resolve();

    await expect(upload).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'ATTACHMENT_TARGET_STATE_CHANGED',
      }),
    });
  });

  it('locks the sample before the active task and finalizes a writable image', async () => {
    const { service, prisma, tx, attachments } = createHarness();
    prisma.workflowTask.findFirst.mockResolvedValue(activeConfirmationTask());
    prisma.sample.findFirst.mockResolvedValue(sampleRecord());
    tx.sample.findFirst.mockResolvedValue(sampleRecord());
    tx.workflowTask.findFirst.mockResolvedValue(activeConfirmationTask());
    attachments.createStoredAttachment.mockImplementation(async (input: any) => {
      await input.finalizeDomainAttachment(tx, {
        attachmentId: 'attachment-1',
        replacement: null,
      });
      return { id: 'attachment-1' };
    });

    await expect(
      service.uploadSampleImage(
        'project-1',
        'sample-1',
        imageFile,
        actor,
      ),
    ).resolves.toEqual({
      sampleId: 'sample-1',
      attachment: { id: 'attachment-1' },
    });
    expect(attachments.createStoredAttachment).toHaveBeenCalledWith(
      expect.objectContaining({
        finalizeDomainAttachment: expect.any(Function),
      }),
    );
    const lockSql = tx.$queryRaw.mock.calls.map(
      ([query]) => (query as { strings?: string[] }).strings?.join('') ?? '',
    );
    expect(lockSql[0]).toContain('samples');
    expect(lockSql[0]).toContain('FOR UPDATE');
    expect(lockSql[1]).toContain('workflow_tasks');
    expect(lockSql[1]).toContain('FOR UPDATE');
  });
});
