import {
  AttachmentScanStatus,
  SampleConfirmationDecision,
  SampleStatus,
  WorkflowNodeCode,
  WorkflowTaskStatus,
} from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { installTeamAuthorizationFixture } from '../../test-support/team-authorization.fixture';

import { SamplesService } from './samples.service';

const actor = {
  id: 'process-member',
  authSource: 'local', authVersion: 1,
  roleCodes: ['process_engineer'],
  permissionCodes: ['project.read', 'workflow.transition', 'attachment.manage'],
  isSystemAdmin: false,
} as never;
const reviewer = { id: 'reviewer-member', authSource: 'local', authVersion: 1, roleCodes: ['reviewer'], permissionCodes: ['project.read', 'workflow.transition'], isSystemAdmin: false } as never;

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

function activeDevelopmentTask() {
  return {
    id: 'sample-task-1',
    projectId: 'project-1',
    workflowInstanceId: 'workflow-1',
    nodeCode: WorkflowNodeCode.PAINT_DEVELOPMENT,
    status: WorkflowTaskStatus.IN_PROGRESS, assigneeUserId: 'process-member',
    isActive: true,
  };
}

type ConcurrentSampleRecord = Omit<
  ReturnType<typeof sampleRecord>,
  'status' | 'confirmedAt' | 'producedAt' | 'location' | 'remark'
> & {
  status: SampleStatus;
  confirmedAt: Date | null;
  producedAt: Date | null;
  location: string | null;
  remark: string | null;
};

type ConcurrentTaskRecord = Omit<
  ReturnType<typeof activeDevelopmentTask>,
  'isActive' | 'status' | 'nodeCode'
> & {
  nodeCode: WorkflowNodeCode;
  isActive: boolean;
  status: WorkflowTaskStatus;
};

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
  installTeamAuthorizationFixture(tx, [actor], () => activeDevelopmentTask());
  const prisma = {
    $transaction: vi.fn(async (executor: (client: typeof tx) => Promise<unknown>) =>
      executor(tx),
    ),
    sample: tx.sample,
    workflowTask: tx.workflowTask,
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
  vi.spyOn(service as unknown as { buildSampleDetail: (...args: unknown[]) => Promise<unknown> }, 'buildSampleDetail').mockResolvedValue({} as never);

  return { service, prisma, tx, attachments };
}

function createRowLock() {
  let holder: symbol | null = null;
  const waiters: Array<{ owner: symbol; resolve: () => void }> = [];

  return {
    async acquire(owner: symbol) {
      if (holder === owner) {
        return;
      }
      if (holder === null) {
        holder = owner;
        return;
      }

      await new Promise<void>((resolve) => {
        waiters.push({ owner, resolve });
      });
    },
    release(owner: symbol) {
      if (holder !== owner) {
        return;
      }

      const next = waiters.shift();
      if (!next) {
        holder = null;
        return;
      }

      holder = next.owner;
      next.resolve();
    },
  };
}

function createConcurrentSampleWriteHarness() {
  const projectLock = createRowLock();
  const sampleLock = createRowLock();
  const taskLock = createRowLock();
  const submitReachedImageCheck = createDeferred<void>();
  const releaseSubmitImageCheck = createDeferred<void>();
  const competingSampleLockAttempted = createDeferred<void>();
  const lockSqlByTransaction = new Map<number, string[]>();
  const transactionOwners = new WeakMap<object, symbol>();
  let transactionSequence = 0;
  let imageCheckPaused = false;
  let samples: ConcurrentSampleRecord[] = [sampleRecord()];
  let activeTask: ConcurrentTaskRecord = {
    ...activeDevelopmentTask(),
    nodeCode: WorkflowNodeCode.SAMPLE_COLOR_CONFIRMATION, assigneeUserId: 'reviewer-member',
    status: WorkflowTaskStatus.IN_PROGRESS,
  };

  const prisma = {
    $transaction: vi.fn(
      async (executor: (client: Record<string, unknown>) => Promise<unknown>) => {
        const transactionNumber = ++transactionSequence;
        const owner = Symbol(`tx-${transactionNumber}`);
        const lockSql: string[] = [];
        lockSqlByTransaction.set(transactionNumber, lockSql);

        const tx = {
          $executeRaw: vi.fn(async (query: { strings: readonly string[]; values: unknown[] }) => {
            if (query.values.includes('team-project-write')) {
              if (transactionNumber === 2) competingSampleLockAttempted.resolve();
              await projectLock.acquire(owner);
            }
            return 0;
          }),
          $queryRaw: vi.fn(async (query: { strings?: readonly string[] }) => {
            const sql = query.strings?.join('') ?? '';
            lockSql.push(sql);
            if (sql.includes('FROM "samples"')) {
              if (transactionNumber === 2) {
                competingSampleLockAttempted.resolve();
              }
              await sampleLock.acquire(owner);
              return samples.some((sample) => sample.id === 'sample-1')
                ? [{ id: 'sample-1' }]
                : [];
            }
            if (sql.includes('FROM "workflow_tasks"')) {
              await taskLock.acquire(owner);
              return [{ id: activeTask.id }];
            }
            return [];
          }),
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
            findFirst: vi.fn(async (args: { where: { id?: string } }) => {
              const sample = samples.find(
                (candidate) => !args.where.id || candidate.id === args.where.id,
              );
              return sample ? { ...sample } : null;
            }),
            findMany: vi.fn(
              async (args: { where: { sampleNo?: string; isCurrent?: boolean } }) =>
                samples
                  .filter(
                    (sample) =>
                      (!args.where.sampleNo || sample.sampleNo === args.where.sampleNo) &&
                      (args.where.isCurrent === undefined ||
                        sample.isCurrent === args.where.isCurrent),
                  )
                  .sort((left, right) => right.versionNo - left.versionNo)
                  .map((sample) => ({ ...sample })),
            ),
            updateMany: vi.fn(
              async (args: {
                where: { sampleNo?: string; isCurrent?: boolean };
                data: { isCurrent?: boolean };
              }) => {
                await sampleLock.acquire(owner);
                let count = 0;
                samples = samples.map((sample) => {
                  if (
                    (!args.where.sampleNo || sample.sampleNo === args.where.sampleNo) &&
                    (args.where.isCurrent === undefined ||
                      sample.isCurrent === args.where.isCurrent)
                  ) {
                    count += 1;
                    return { ...sample, ...args.data };
                  }
                  return sample;
                });
                return { count };
              },
            ),
            create: vi.fn(async (args: { data: Record<string, unknown> }) => {
              const created = sampleRecord({
                ...args.data,
                id: `sample-${samples.length + 1}`,
                createdAt: new Date('2026-08-11T04:01:00.000Z'),
                updatedAt: new Date('2026-08-11T04:01:00.000Z'),
              }) as ConcurrentSampleRecord;
              samples.push(created);
              return { ...created };
            }),
            update: vi.fn(
              async (args: { where: { id: string }; data: Record<string, unknown> }) => {
                await sampleLock.acquire(owner);
                const index = samples.findIndex(
                  (sample) => sample.id === args.where.id,
                );
                if (index < 0) {
                  throw new Error('SAMPLE_NOT_FOUND');
                }
                samples[index] = {
                  ...samples[index],
                  ...args.data,
                  updatedAt: new Date('2026-08-11T04:02:00.000Z'),
                } as ConcurrentSampleRecord;
                return { ...samples[index] };
              },
            ),
          },
          workflowTask: {
            findFirst: vi.fn(
              async (args: {
                where: {
                  id?: string;
                  nodeCode?: WorkflowNodeCode;
                  isActive?: boolean;
                };
              }) => {
                if (
                  (args.where.id && args.where.id !== activeTask.id) ||
                  (args.where.nodeCode &&
                    args.where.nodeCode !== activeTask.nodeCode) ||
                  (args.where.isActive !== undefined &&
                    args.where.isActive !== activeTask.isActive)
                ) {
                  return null;
                }
                return { ...activeTask };
              },
            ),
          },
          sampleConfirmation: {
            upsert: vi.fn().mockResolvedValue({ id: 'confirmation-1' }),
          },
        };
        installTeamAuthorizationFixture(tx, [actor, reviewer], () => activeTask);
        transactionOwners.set(tx, owner);

        try {
          return await executor(tx);
        } finally {
          taskLock.release(owner);
          sampleLock.release(owner);
          projectLock.release(owner);
        }
      },
    ),
  };
  const activityLogs = {
    createWithExecutor: vi.fn().mockResolvedValue({ id: 'audit-1' }),
  };
  const attachments = {
    listTargetAttachments: vi.fn(async () => {
      if (!imageCheckPaused) {
        imageCheckPaused = true;
        submitReachedImageCheck.resolve();
        await releaseSubmitImageCheck.promise;
      }
      return [
        {
          id: 'sample-image-1',
          scanStatus: AttachmentScanStatus.CLEAN,
          isDeleted: false,
        },
      ];
    }),
  };
  const workflows = {
    transitionTaskWithExecutor: vi.fn(async (tx: Record<string, unknown>) => {
      const owner = transactionOwners.get(tx);
      if (!owner) {
        throw new Error('TRANSACTION_OWNER_NOT_FOUND');
      }
      await taskLock.acquire(owner);
      activeTask = {
        ...activeTask,
        status: WorkflowTaskStatus.COMPLETED,
        isActive: false,
      };
    }),
  };
  const service = new SamplesService(
    prisma as never,
    activityLogs as never,
    attachments as never,
    workflows as never,
    {
      assertProjectAccessWithDefaultClient: vi
        .fn()
        .mockResolvedValue({ id: 'project-1' }),
    } as never,
  );
  vi.spyOn(service as unknown as { buildSampleDetail: (...args: unknown[]) => Promise<unknown> }, 'buildSampleDetail').mockResolvedValue({} as never);
  vi.spyOn(service as unknown as { buildWorkspace: (...args: unknown[]) => Promise<unknown> }, 'buildWorkspace').mockResolvedValue({} as never);

  return {
    service,
    submitReachedImageCheck,
    releaseSubmitImageCheck,
    competingSampleLockAttempted,
    getLockSql(transactionNumber: number) {
      return lockSqlByTransaction.get(transactionNumber) ?? [];
    },
    getState() {
      return {
        samples: samples.map((sample) => ({ ...sample })),
        task: { ...activeTask },
      };
    },
  };
}

describe('SamplesService write-state integrity', () => {
  it.each([
    ['wrong role for development', 'create', 'quality-member', ['quality_engineer'], 'process-member'],
    ['unclaimed development', 'create', 'process-member', ['process_engineer'], null],
    ['another development owner', 'create', 'process-member', ['process_engineer'], 'other-member'],
    ['wrong role for confirmation', 'confirm', 'process-member', ['process_engineer'], 'process-member'],
    ['another confirmation owner', 'confirm', 'reviewer-member', ['reviewer'], 'other-reviewer'],
  ] as const)('rejects %s through the real task authorization helper', async (_label, operation, id, roleCodes, assigneeUserId) => {
    const { service, tx, attachments } = createHarness();
    const caller = { id, roleCodes: [...roleCodes], authSource: 'local' as const, authVersion: 1,
      isSystemAdmin: false, permissionCodes: ['project.read', 'workflow.transition'] };
    const task = { ...activeDevelopmentTask(), assigneeUserId,
      nodeCode: operation === 'create' ? WorkflowNodeCode.PAINT_DEVELOPMENT : WorkflowNodeCode.SAMPLE_COLOR_CONFIRMATION };
    tx.workflowTask.findFirst.mockResolvedValue(task);
    tx.sample.findFirst.mockResolvedValue(sampleRecord());
    installTeamAuthorizationFixture(tx, [caller], () => task);
    const write = operation === 'create'
      ? service.createSample('project-1', { sampleNo: 'S-001', sampleName: '样板', sampleType: 'PANEL', createNewVersion: false }, caller as never)
      : service.submitConfirmation('project-1', { sampleId: 'sample-1', decision: SampleConfirmationDecision.APPROVE }, caller as never);
    await expect(write).rejects.toMatchObject({ status: 403 });
    expect(tx.sample.create).not.toHaveBeenCalled();
    expect(tx.sample.update).not.toHaveBeenCalled();
    expect(attachments.createStoredAttachment).not.toHaveBeenCalled();
  });

  it('rejects initial sample creation when no paint-development task is active', async () => {
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
    ).rejects.toThrow('对应的活跃样板工序');

    expect(tx.sample.create).not.toHaveBeenCalled();
  });

  it('allows a fresh development task to create V2 while retaining confirmed V1 facts', async () => {
    const { service, tx } = createHarness();
    tx.workflowTask.findFirst.mockResolvedValue(activeDevelopmentTask());
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
    ).resolves.toEqual({});

    expect(tx.sample.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { isCurrent: false } }));
    expect(tx.sample.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ versionNo: 2, status: SampleStatus.DRAFT }) }));
    expect(confirmedSample.status).toBe(SampleStatus.CONFIRMED);
    expect(confirmedSample.confirmedAt).toEqual(expect.any(Date));
  });

  it.each([
    ['confirmed', { status: SampleStatus.CONFIRMED, confirmedAt: new Date() }],
    ['archived', { status: SampleStatus.ARCHIVED }],
    ['non-current', { isCurrent: false }],
  ])('rejects update of a %s sample', async (_label, overrides) => {
    const { service, tx } = createHarness();
    tx.workflowTask.findFirst.mockResolvedValue(activeDevelopmentTask());
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

  it('rejects update when the paint-development task is no longer active', async () => {
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
    ).rejects.toThrow('对应的活跃样板工序');

    expect(tx.sample.update).not.toHaveBeenCalled();
  });

  it.each([
    ['confirmed', { status: SampleStatus.CONFIRMED, confirmedAt: new Date() }],
    ['archived', { status: SampleStatus.ARCHIVED }],
    ['non-current', { isCurrent: false }],
  ])('rejects image upload for a %s sample', async (_label, overrides) => {
    const { service, prisma, attachments } = createHarness();
    prisma.workflowTask.findFirst.mockResolvedValue(activeDevelopmentTask());
    prisma.sample.findFirst.mockResolvedValue(sampleRecord(overrides));

    await expect(
      service.uploadSampleImage('project-1', 'sample-1', imageFile, actor),
    ).rejects.toThrow('当前样板版本不允许修改');

    expect(attachments.createStoredAttachment).not.toHaveBeenCalled();
  });

  it('rejects image upload when the paint-development task is no longer active', async () => {
    const { service, prisma, attachments } = createHarness();
    prisma.workflowTask.findFirst.mockResolvedValue(null);
    prisma.sample.findFirst.mockResolvedValue(sampleRecord());

    await expect(
      service.uploadSampleImage('project-1', 'sample-1', imageFile, actor),
    ).rejects.toThrow('对应的活跃样板工序');

    expect(attachments.createStoredAttachment).not.toHaveBeenCalled();
  });

  it('rejects an image when the sample is confirmed while scanning', async () => {
    const { service, prisma, tx, attachments } = createHarness();
    const scanStarted = createDeferred<void>();
    const releaseScan = createDeferred<void>();
    prisma.workflowTask.findFirst.mockResolvedValue(activeDevelopmentTask());
    prisma.sample.findFirst.mockResolvedValue(sampleRecord());
    tx.sample.findFirst.mockResolvedValue(sampleRecord());
    tx.workflowTask.findFirst.mockResolvedValue(activeDevelopmentTask());
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
    tx.sample.findFirst.mockResolvedValue(sampleRecord({ status: SampleStatus.CONFIRMED, confirmedAt: new Date() }));
    releaseScan.resolve();

    await expect(upload).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'ATTACHMENT_TARGET_STATE_CHANGED',
      }),
    });
  });

  it('locks the sample before the active task and finalizes a writable image', async () => {
    const { service, prisma, tx, attachments } = createHarness();
    prisma.workflowTask.findFirst.mockResolvedValue(activeDevelopmentTask());
    prisma.sample.findFirst.mockResolvedValue(sampleRecord());
    tx.sample.findFirst.mockResolvedValue(sampleRecord());
    tx.workflowTask.findFirst.mockResolvedValue(activeDevelopmentTask());
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

  it('serializes confirmation against createNewVersion without completing the task for an unconfirmed current version', async () => {
    const harness = createConcurrentSampleWriteHarness();
    const confirmation = harness.service.submitConfirmation(
      'project-1',
      {
        sampleId: 'sample-1',
        decision: SampleConfirmationDecision.APPROVE,
        comment: '确认当前样板',
      },
      reviewer,
    );
    await harness.submitReachedImageCheck.promise;

    const newVersion = harness.service.createSample(
      'project-1',
      {
        sampleNo: 'S-001',
        sampleName: '样板 A V2',
        sampleType: 'PANEL',
        createNewVersion: true,
      },
      actor,
    );
    await harness.competingSampleLockAttempted.promise;
    harness.releaseSubmitImageCheck.resolve();

    const outcomes = await Promise.allSettled([confirmation, newVersion]);
    expect(
      outcomes.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const state = harness.getState();
    const currentSample = state.samples.find((sample) => sample.isCurrent);
    expect(state.samples).toHaveLength(1);
    expect(currentSample).toMatchObject({
      id: 'sample-1',
      status: SampleStatus.CONFIRMED,
    });
    expect(state.task).toMatchObject({
      status: WorkflowTaskStatus.COMPLETED,
      isActive: false,
    });
    expect(
      state.task.status === WorkflowTaskStatus.COMPLETED &&
        currentSample?.status !== SampleStatus.CONFIRMED,
    ).toBe(false);

    const confirmationLockSql = harness.getLockSql(1);
    expect(confirmationLockSql[0]).toContain('FROM "samples"');
    expect(confirmationLockSql[0]).toContain('FOR UPDATE');
    expect(confirmationLockSql[1]).toContain('FROM "workflow_tasks"');
    expect(confirmationLockSql[1]).toContain('FOR UPDATE');
  });

  it('serializes confirmation against an update so only one write can commit', async () => {
    const harness = createConcurrentSampleWriteHarness();
    const confirmation = harness.service.submitConfirmation(
      'project-1',
      {
        sampleId: 'sample-1',
        decision: SampleConfirmationDecision.APPROVE,
        comment: '确认当前样板',
      },
      reviewer,
    );
    await harness.submitReachedImageCheck.promise;

    const update = harness.service.updateSample(
      'project-1',
      'sample-1',
      { remark: '并发修改不应写入' },
      actor,
    );
    await harness.competingSampleLockAttempted.promise;
    harness.releaseSubmitImageCheck.resolve();

    const outcomes = await Promise.allSettled([confirmation, update]);
    expect(
      outcomes.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(harness.getState().samples[0]).toMatchObject({
      status: SampleStatus.CONFIRMED,
      confirmedAt: expect.any(Date),
      remark: null,
    });
  });
});
