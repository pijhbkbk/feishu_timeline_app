import {
  AttachmentScanStatus,
  AttachmentTargetType,
  SampleConfirmationDecision,
  SampleStatus,
  SampleType,
  WorkflowNodeCode,
} from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { SamplesService } from './samples.service';

const actorId = 'quality-engineer-1';
const actor = {
  id: actorId,
  roleCodes: ['quality_engineer'],
  permissionCodes: ['project.read', 'workflow.transition'],
  isSystemAdmin: false,
} as never;

const project = {
  id: 'project-1',
  code: 'PRJ-001',
  name: '项目 A',
  currentNodeCode: WorkflowNodeCode.SAMPLE_COLOR_CONFIRMATION,
  plannedEndDate: null,
};

const activeTask = {
  id: 'sample-task-1',
  projectId: project.id,
  workflowInstanceId: 'workflow-1',
  taskNo: 'TASK-SAMPLE-1',
  nodeCode: WorkflowNodeCode.SAMPLE_COLOR_CONFIRMATION,
  nodeName: '样板颜色确认',
  status: 'IN_PROGRESS',
  taskRound: 1,
  isActive: true,
  assigneeUserId: null,
  assigneeDepartmentId: null,
  assigneeUser: null,
  assigneeDepartment: null,
  workflowInstance: { id: 'workflow-1' },
  dueAt: null,
  startedAt: null,
  returnedAt: null,
  createdAt: new Date('2026-08-11T00:00:00.000Z'),
};

const validCreateInput = {
  sampleNo: 'S-001',
  sampleName: '样板 A',
  sampleType: SampleType.PANEL,
  location: '一号库位',
  remark: '正常样板',
  producedAt: '2026-08-11T01:00:00.000Z',
  createNewVersion: false,
};

const validConfirmationInput = {
  sampleId: 'sample-1',
  decision: SampleConfirmationDecision.APPROVE,
  colorAssessment: '颜色符合要求',
  appearanceAssessment: '外观符合要求',
  comment: '同意通过',
};

function sampleRecord(
  id = 'sample-1',
  overrides: Record<string, unknown> = {},
) {
  const timestamp = new Date('2026-08-11T01:00:00.000Z');
  return {
    id,
    projectId: project.id,
    colorId: null,
    colorVersionId: null,
    trialProductionId: null,
    sampleNo: 'S-001',
    sampleName: '样板 A',
    versionNo: 1,
    isCurrent: true,
    sampleType: SampleType.PANEL,
    status: SampleStatus.DRAFT,
    location: null,
    remark: null,
    producedAt: null,
    confirmedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function confirmationRecord(id = 'confirmation-1') {
  const timestamp = new Date('2026-08-11T02:00:00.000Z');
  return {
    id,
    projectId: project.id,
    sampleId: 'sample-1',
    workflowInstanceId: 'workflow-1',
    workflowTaskId: `task-${id}`,
    decision: SampleConfirmationDecision.APPROVE,
    colorAssessment: '颜色符合要求',
    appearanceAssessment: '外观符合要求',
    comment: '同意通过',
    confirmedById: actorId,
    confirmedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
    sample: sampleRecord(),
    confirmedBy: { id: actorId, name: '质量工程师' },
  };
}

function attachmentRecord(index: number) {
  const suffix = index.toString().padStart(2, '0');
  const timestamp = new Date(`2026-08-11T03:${suffix}:00.000Z`);
  return {
    id: `attachment-${suffix}`,
    projectId: project.id,
    entityType: AttachmentTargetType.SAMPLE,
    entityId: 'sample-1',
    bucket: 'bucket',
    storageKey: `samples/${suffix}.png`,
    fileName: `sample-${suffix}.png`,
    originalFileName: null,
    fileExtension: 'png',
    mimeType: 'image/png',
    fileSize: 100,
    checksum: null,
    fileUrl: null,
    scanStatus: AttachmentScanStatus.CLEAN,
    scannerEngine: null,
    scannerVersion: null,
    scannerSignatureVersion: null,
    scanResultSummary: null,
    scannedAt: timestamp,
    materialType: null,
    versionNo: 1,
    replacesAttachmentId: null,
    uploadedById: actorId,
    uploadedAt: timestamp,
    isDeleted: false,
    deletedAt: null,
    deletedById: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    uploadedBy: { id: actorId, name: '质量工程师' },
    deletedBy: null,
  };
}

function createService(input?: {
  prisma?: Record<string, unknown>;
  activityLogs?: Record<string, unknown>;
  attachments?: Record<string, unknown>;
  workflows?: Record<string, unknown>;
}) {
  const listTargetAttachments = vi.fn();
  const toAttachmentSummary = vi.fn((attachment: { id: string }) => ({
    id: attachment.id,
  }));
  const service = new SamplesService(
    (input?.prisma ?? {}) as never,
    (input?.activityLogs ?? { createWithExecutor: vi.fn() }) as never,
    (input?.attachments ?? {
      listTargetAttachments,
      toAttachmentSummary,
    }) as never,
    (input?.workflows ?? { transitionTaskWithExecutor: vi.fn() }) as never,
    {
      assertProjectAccessWithDefaultClient: vi
        .fn()
        .mockResolvedValue({ id: project.id }),
    } as never,
  );

  return { service, listTargetAttachments, toAttachmentSummary };
}

function parseCreate(service: SamplesService, input: Record<string, unknown>) {
  return Reflect.get(service, 'parseSampleWriteInput').call(service, input);
}

function parseUpdate(service: SamplesService, input: Record<string, unknown>) {
  return Reflect.get(service, 'parseSampleUpdateInput').call(service, input);
}

function parseConfirmation(
  service: SamplesService,
  input: Record<string, unknown>,
) {
  return Reflect.get(service, 'parseConfirmationInput').call(service, input);
}

function workspaceDb(input?: {
  samples?: unknown[];
  confirmations?: unknown[];
  attachmentStats?: unknown[];
}) {
  const sampleFindMany = vi.fn().mockResolvedValue(input?.samples ?? []);
  const confirmationFindMany = vi
    .fn()
    .mockResolvedValue(input?.confirmations ?? []);
  const attachmentGroupBy = vi
    .fn()
    .mockResolvedValue([]);
  const attachmentFindMany = vi.fn().mockResolvedValue([]);
  const queryRaw = vi.fn().mockResolvedValue(input?.attachmentStats ?? []);

  return {
    db: {
      $queryRaw: queryRaw,
      project: { findUnique: vi.fn().mockResolvedValue(project) },
      workflowTask: { findFirst: vi.fn().mockResolvedValue(null) },
      sample: { findMany: sampleFindMany },
      sampleConfirmation: { findMany: confirmationFindMany },
      attachment: {
        groupBy: attachmentGroupBy,
        findMany: attachmentFindMany,
      },
    },
    attachmentFindMany,
    attachmentGroupBy,
    confirmationFindMany,
    queryRaw,
    sampleFindMany,
  };
}

describe('SamplesService resource bounds', () => {
  it('accepts exact scalar boundaries for create, update, and confirmation payloads', () => {
    const { service } = createService();

    expect(() =>
      parseCreate(service, {
        ...validCreateInput,
        sampleNo: 'S'.repeat(64),
        sampleName: 'N'.repeat(200),
        location: 'L'.repeat(200),
        remark: 'R'.repeat(4_000),
      }),
    ).not.toThrow();
    expect(() =>
      parseUpdate(service, {
        sampleName: 'N'.repeat(200),
        location: 'L'.repeat(200),
        remark: 'R'.repeat(4_000),
      }),
    ).not.toThrow();
    expect(() =>
      parseConfirmation(service, {
        ...validConfirmationInput,
        sampleId: 's'.repeat(64),
        colorAssessment: 'C'.repeat(4_000),
        appearanceAssessment: 'A'.repeat(4_000),
        comment: 'M'.repeat(2_000),
      }),
    ).not.toThrow();
  });

  it.each([
    ['sampleNo', 'S'.repeat(65)],
    ['sampleNo', 'SAMPLE / 001'],
    ['sampleName', 'N'.repeat(201)],
    ['location', 'L'.repeat(201)],
    ['remark', 'R'.repeat(4_001)],
  ])('rejects an unsafe create %s before opening a transaction', (field, value) => {
    const { service } = createService();

    expect(() =>
      parseCreate(service, { ...validCreateInput, [field]: value }),
    ).toThrowError(
      expect.objectContaining({
        response: expect.objectContaining({ code: 'SAMPLE_INPUT_OUT_OF_BOUNDS' }),
      }),
    );
  });

  it.each([
    ['sampleId', 's'.repeat(65)],
    ['sampleId', 'sample / 1'],
    ['colorAssessment', 'C'.repeat(4_001)],
    ['appearanceAssessment', 'A'.repeat(4_001)],
    ['comment', 'M'.repeat(2_001)],
  ])('rejects an unsafe confirmation %s', (field, value) => {
    const { service } = createService();

    expect(() =>
      parseConfirmation(service, { ...validConfirmationInput, [field]: value }),
    ).toThrowError(
      expect.objectContaining({
        response: expect.objectContaining({ code: 'SAMPLE_INPUT_OUT_OF_BOUNDS' }),
      }),
    );
  });

  it('measures normalized create, update, and confirmation payloads against 16 KiB of UTF-8', () => {
    const { service } = createService();

    for (const parse of [
      () =>
        parseCreate(service, {
          ...validCreateInput,
          remark: '\ud800'.repeat(4_000),
        }),
      () => parseUpdate(service, { remark: '\ud800'.repeat(4_000) }),
      () =>
        parseConfirmation(service, {
          ...validConfirmationInput,
          colorAssessment: '\ud800'.repeat(4_000),
        }),
    ]) {
      expect(parse).toThrowError(
        expect.objectContaining({
          response: expect.objectContaining({ code: 'SAMPLE_INPUT_OUT_OF_BOUNDS' }),
        }),
      );
    }
  });

  it('checks the 101st sample only after locking the active task and before persistence', async () => {
    const events: string[] = [];
    const records = Array.from({ length: 100 }, (_, index) =>
      sampleRecord(`sample-${index}`, {
        sampleNo: `S-${index.toString().padStart(3, '0')}`,
      }),
    );
    const sampleFindMany = vi.fn(async () => {
      events.push('capacity-and-versions');
      return records;
    });
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      project: { findUnique: vi.fn().mockResolvedValue(project) },
      sample: {
        findMany: sampleFindMany,
        create: vi.fn(),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (executor: (client: typeof tx) => unknown) =>
        executor(tx),
      ),
    };
    const activityLogs = { createWithExecutor: vi.fn() };
    const { service } = createService({ prisma, activityLogs });
    Reflect.set(
      service,
      'lockActiveConfirmationTaskOrThrow',
      vi.fn().mockImplementation(async () => {
        events.push('active-task-locked');
        return activeTask;
      }),
    );

    await expect(
      service.createSample(project.id, validCreateInput, actor),
    ).rejects.toMatchObject({
      response: { code: 'SAMPLE_RECORD_LIMIT_EXCEEDED' },
    });
    expect(events).toEqual(['active-task-locked', 'capacity-and-versions']);
    expect(sampleFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: project.id }, take: 101 }),
    );
    expect(tx.sample.create).not.toHaveBeenCalled();
    expect(activityLogs.createWithExecutor).not.toHaveBeenCalled();
  });

  it('turns a concurrent initial same-number sample into a controlled conflict after the task lock', async () => {
    const events: string[] = [];
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      project: { findUnique: vi.fn().mockResolvedValue(project) },
      sample: {
        findMany: vi.fn(async () => {
          events.push('requery');
          return [sampleRecord()];
        }),
        create: vi.fn().mockRejectedValue(new Error('P2002 leaked')),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (executor: (client: typeof tx) => unknown) =>
        executor(tx),
      ),
    };
    const { service } = createService({ prisma });
    Reflect.set(
      service,
      'lockActiveConfirmationTaskOrThrow',
      vi.fn().mockImplementation(async () => {
        events.push('lock');
        return activeTask;
      }),
    );

    await expect(
      service.createSample(project.id, validCreateInput, actor),
    ).rejects.toThrow('样板编号已存在');
    expect(events).toEqual(['lock', 'requery']);
    expect(tx.sample.create).not.toHaveBeenCalled();
  });

  it('rejects create when the project confirmation sentinel is already overflowed', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue(
        Array.from({ length: 101 }, (_, index) => ({
          id: `confirmation-${index}`,
          workflowTaskId: `old-task-${index}`,
        })),
      ),
      project: { findUnique: vi.fn().mockResolvedValue(project) },
      sample: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue(sampleRecord()),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (executor: (client: typeof tx) => unknown) =>
        executor(tx),
      ),
    };
    const activityLogs = { createWithExecutor: vi.fn() };
    const { service } = createService({ prisma, activityLogs });
    Reflect.set(
      service,
      'lockActiveConfirmationTaskOrThrow',
      vi.fn().mockResolvedValue(activeTask),
    );

    await expect(
      service.createSample(project.id, validCreateInput, actor),
    ).rejects.toMatchObject({
      response: { code: 'SAMPLE_CONFIRMATION_RECORD_LIMIT_EXCEEDED' },
    });
    expect(tx.sample.create).not.toHaveBeenCalled();
    expect(activityLogs.createWithExecutor).not.toHaveBeenCalled();
  });

  it.each([
    ['sample', 101, 0, 'SAMPLE_RECORD_LIMIT_EXCEEDED'],
    [
      'confirmation',
      100,
      101,
      'SAMPLE_CONFIRMATION_RECORD_LIMIT_EXCEEDED',
    ],
  ])(
    'rejects update on project %s overflow after both domain locks and before mutation',
    async (_label, sampleCount, confirmationCount, code) => {
      const events: string[] = [];
      const current = sampleRecord();
      const tx = {
        $queryRaw: vi.fn(async (query: { strings: readonly string[] }) => {
          const sql = query.strings.join('');
          if (sql.includes('FROM "samples"')) {
            events.push('sample-capacity');
            return Array.from({ length: sampleCount }, (_, index) => ({
              id: `sample-${index}`,
            }));
          }
          if (sql.includes('FROM "sample_confirmations"')) {
            events.push('confirmation-capacity');
            return Array.from({ length: confirmationCount }, (_, index) => ({
              id: `confirmation-${index}`,
              workflowTaskId: `old-task-${index}`,
            }));
          }
          return [];
        }),
        sample: {
          findFirst: vi.fn().mockResolvedValue(current),
          update: vi.fn().mockResolvedValue({ ...current, remark: 'updated' }),
        },
      };
      const prisma = {
        $transaction: vi.fn(async (executor: (client: typeof tx) => unknown) =>
          executor(tx),
        ),
      };
      const activityLogs = { createWithExecutor: vi.fn() };
      const { service } = createService({ prisma, activityLogs });
      Reflect.set(
        service,
        'lockSampleRow',
        vi.fn().mockImplementation(async () => {
          events.push('sample-locked');
          return true;
        }),
      );
      Reflect.set(
        service,
        'lockActiveConfirmationTaskOrThrow',
        vi.fn().mockImplementation(async () => {
          events.push('task-locked');
          return activeTask;
        }),
      );
      Reflect.set(
        service,
        'buildSampleDetail',
        vi.fn().mockResolvedValue({ ok: true }),
      );

      await expect(
        service.updateSample(project.id, current.id, { remark: 'updated' }, actor),
      ).rejects.toMatchObject({ response: { code } });
      expect(events.slice(0, 2)).toEqual(['sample-locked', 'task-locked']);
      expect(tx.sample.update).not.toHaveBeenCalled();
      expect(activityLogs.createWithExecutor).not.toHaveBeenCalled();
    },
  );

  it('allows an existing update when both project record counts are exactly 100', async () => {
    const current = sampleRecord();
    const tx = {
      $queryRaw: vi.fn(async (query: { strings: readonly string[] }) => {
        const sql = query.strings.join('');
        if (sql.includes('FROM "samples"')) {
          return Array.from({ length: 100 }, (_, index) => ({
            id: `sample-${index}`,
          }));
        }
        return Array.from({ length: 100 }, (_, index) => ({
          id: `confirmation-${index}`,
          workflowTaskId: `old-task-${index}`,
        }));
      }),
      sample: {
        findFirst: vi.fn().mockResolvedValue(current),
        update: vi.fn().mockResolvedValue({ ...current, remark: 'updated' }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (executor: (client: typeof tx) => unknown) =>
        executor(tx),
      ),
    };
    const { service } = createService({ prisma });
    Reflect.set(service, 'lockSampleRow', vi.fn().mockResolvedValue(true));
    Reflect.set(
      service,
      'lockActiveConfirmationTaskOrThrow',
      vi.fn().mockResolvedValue(activeTask),
    );
    Reflect.set(
      service,
      'buildSampleDetail',
      vi.fn().mockResolvedValue({ ok: true }),
    );

    await expect(
      service.updateSample(project.id, current.id, { remark: 'updated' }, actor),
    ).resolves.toEqual({ ok: true });
    expect(tx.sample.update).toHaveBeenCalledOnce();
  });

  it('allows an existing confirmation upsert when both project counts are exactly 100', async () => {
    const current = sampleRecord();
    const tx = {
      $queryRaw: vi.fn(async (query: { strings: readonly string[] }) => {
        const sql = query.strings.join('');
        if (sql.includes('FROM "samples"')) {
          return Array.from({ length: 100 }, (_, index) => ({
            id: `sample-${index}`,
          }));
        }
        return Array.from({ length: 100 }, (_, index) => ({
          id: `confirmation-${index}`,
          workflowTaskId:
            index === 0 ? activeTask.id : `old-task-${index}`,
        }));
      }),
      sample: {
        findFirst: vi.fn().mockResolvedValue(current),
        update: vi.fn().mockResolvedValue({
          ...current,
          status: SampleStatus.CONFIRMED,
          confirmedAt: new Date('2026-08-11T04:00:00.000Z'),
        }),
      },
      sampleConfirmation: {
        upsert: vi.fn().mockResolvedValue({ id: 'confirmation-existing' }),
      },
      attachment: {
        findFirst: vi.fn().mockResolvedValue({ id: 'attachment-1' }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (executor: (client: typeof tx) => unknown) =>
        executor(tx),
      ),
    };
    const activityLogs = { createWithExecutor: vi.fn() };
    const workflows = { transitionTaskWithExecutor: vi.fn() };
    const { service } = createService({ prisma, activityLogs, workflows });
    Reflect.set(service, 'lockSampleRow', vi.fn().mockResolvedValue(true));
    Reflect.set(
      service,
      'lockActiveConfirmationTaskOrThrow',
      vi.fn().mockResolvedValue(activeTask),
    );
    Reflect.set(
      service,
      'buildWorkspace',
      vi.fn().mockResolvedValue({ ok: true }),
    );

    await expect(
      service.submitConfirmation(project.id, validConfirmationInput, actor),
    ).resolves.toEqual({ ok: true });
    expect(tx.sampleConfirmation.upsert).toHaveBeenCalledOnce();
    expect(tx.sample.update).toHaveBeenCalledOnce();
    expect(activityLogs.createWithExecutor).toHaveBeenCalledOnce();
    expect(workflows.transitionTaskWithExecutor).toHaveBeenCalledOnce();
  });

  it('rejects confirmation when the project sample sentinel is overflowed before upsert', async () => {
    const current = sampleRecord();
    const tx = {
      $queryRaw: vi.fn(async (query: { strings: readonly string[] }) => {
        const sql = query.strings.join('');
        if (sql.includes('FROM "samples"')) {
          return Array.from({ length: 101 }, (_, index) => ({
            id: `sample-${index}`,
          }));
        }
        return [];
      }),
      sample: {
        findFirst: vi.fn().mockResolvedValue(current),
        update: vi.fn(),
      },
      sampleConfirmation: { upsert: vi.fn() },
      attachment: { findFirst: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (executor: (client: typeof tx) => unknown) =>
        executor(tx),
      ),
    };
    const activityLogs = { createWithExecutor: vi.fn() };
    const workflows = { transitionTaskWithExecutor: vi.fn() };
    const { service } = createService({ prisma, activityLogs, workflows });
    Reflect.set(service, 'lockSampleRow', vi.fn().mockResolvedValue(true));
    Reflect.set(
      service,
      'lockActiveConfirmationTaskOrThrow',
      vi.fn().mockResolvedValue(activeTask),
    );

    await expect(
      service.submitConfirmation(project.id, validConfirmationInput, actor),
    ).rejects.toMatchObject({
      response: { code: 'SAMPLE_RECORD_LIMIT_EXCEEDED' },
    });
    expect(tx.sampleConfirmation.upsert).not.toHaveBeenCalled();
    expect(tx.sample.update).not.toHaveBeenCalled();
    expect(activityLogs.createWithExecutor).not.toHaveBeenCalled();
    expect(workflows.transitionTaskWithExecutor).not.toHaveBeenCalled();
  });

  it.each([
    ['sampleNo', { sampleNo: 'SAMPLE / LEGACY' }],
    ['sampleName', { sampleName: 'N'.repeat(201) }],
    ['location', { location: 'L'.repeat(201) }],
    ['remark', { remark: 'R'.repeat(4_001) }],
    ['versionNo', { versionNo: Number.MAX_SAFE_INTEGER }],
    ['sampleType', { sampleType: 'CORRUPTED_SAMPLE_TYPE' }],
    ['status', { status: 'CORRUPTED_SAMPLE_STATUS' }],
  ])(
    'rejects update of a persisted sample with invalid %s before mutation or audit',
    async (_field, overrides) => {
      const current = sampleRecord('sample-1', overrides);
      const tx = {
        $queryRaw: vi.fn().mockResolvedValue([]),
        sample: {
          findFirst: vi.fn().mockResolvedValue(current),
          update: vi.fn(),
        },
      };
      const prisma = {
        $transaction: vi.fn(async (executor: (client: typeof tx) => unknown) =>
          executor(tx),
        ),
      };
      const activityLogs = { createWithExecutor: vi.fn() };
      const { service } = createService({ prisma, activityLogs });
      Reflect.set(service, 'lockSampleRow', vi.fn().mockResolvedValue(true));
      Reflect.set(
        service,
        'lockActiveConfirmationTaskOrThrow',
        vi.fn().mockResolvedValue(activeTask),
      );

      await expect(
        service.updateSample(project.id, current.id, { remark: 'updated' }, actor),
      ).rejects.toMatchObject({
        response: { code: 'SAMPLE_PERSISTED_ROW_OUT_OF_BOUNDS' },
      });
      expect(tx.sample.update).not.toHaveBeenCalled();
      expect(activityLogs.createWithExecutor).not.toHaveBeenCalled();
    },
  );

  it('rejects confirmation of a legacy oversized sample before any state change', async () => {
    const current = sampleRecord('sample-1', { sampleName: 'N'.repeat(201) });
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      sample: {
        findFirst: vi.fn().mockResolvedValue(current),
        update: vi.fn(),
      },
      sampleConfirmation: { upsert: vi.fn() },
      attachment: { findFirst: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (executor: (client: typeof tx) => unknown) =>
        executor(tx),
      ),
    };
    const activityLogs = { createWithExecutor: vi.fn() };
    const workflows = { transitionTaskWithExecutor: vi.fn() };
    const { service } = createService({ prisma, activityLogs, workflows });
    Reflect.set(service, 'lockSampleRow', vi.fn().mockResolvedValue(true));
    Reflect.set(
      service,
      'lockActiveConfirmationTaskOrThrow',
      vi.fn().mockResolvedValue(activeTask),
    );

    await expect(
      service.submitConfirmation(project.id, validConfirmationInput, actor),
    ).rejects.toMatchObject({
      response: { code: 'SAMPLE_PERSISTED_ROW_OUT_OF_BOUNDS' },
    });
    expect(tx.sampleConfirmation.upsert).not.toHaveBeenCalled();
    expect(tx.sample.update).not.toHaveBeenCalled();
    expect(activityLogs.createWithExecutor).not.toHaveBeenCalled();
    expect(workflows.transitionTaskWithExecutor).not.toHaveBeenCalled();
  });

  it('rejects an upload preflight on sample overflow before storage or scan reservation', async () => {
    const events: string[] = [];
    const current = sampleRecord();
    const tx = {
      $queryRaw: vi.fn(async (query: { strings: readonly string[] }) => {
        const sql = query.strings.join('');
        if (sql.includes('FROM "samples"')) {
          events.push('sample-capacity');
          return Array.from({ length: 101 }, (_, index) => ({
            id: `sample-${index}`,
          }));
        }
        events.push('confirmation-capacity');
        return [];
      }),
      sample: { findFirst: vi.fn().mockResolvedValue(current) },
    };
    const prisma = {
      $transaction: vi.fn(async (executor: (client: typeof tx) => unknown) =>
        executor(tx),
      ),
      sample: { findFirst: vi.fn().mockResolvedValue(current) },
      workflowTask: { findFirst: vi.fn().mockResolvedValue(activeTask) },
    };
    const attachments = {
      createStoredAttachment: vi.fn().mockImplementation(async () => {
        events.push('scan-reservation');
        return { id: 'attachment-1' };
      }),
    };
    const { service } = createService({ prisma, attachments });
    Reflect.set(
      service,
      'lockSampleRow',
      vi.fn().mockImplementation(async () => {
        events.push('sample-locked');
        return true;
      }),
    );
    Reflect.set(
      service,
      'lockActiveConfirmationTaskOrThrow',
      vi.fn().mockImplementation(async () => {
        events.push('task-locked');
        return activeTask;
      }),
    );

    await expect(
      service.uploadSampleImage(
        project.id,
        current.id,
        {
          originalname: 'sample.png',
          mimetype: 'image/png',
          size: 8,
          buffer: Buffer.from('sample'),
        },
        actor,
      ),
    ).rejects.toMatchObject({
      response: { code: 'SAMPLE_RECORD_LIMIT_EXCEEDED' },
    });
    expect(events.slice(0, 3)).toEqual([
      'sample-locked',
      'task-locked',
      'sample-capacity',
    ]);
    expect(attachments.createStoredAttachment).not.toHaveBeenCalled();
  });

  it('rechecks both project sentinels in attachment finalization before binding', async () => {
    const events: string[] = [];
    const current = sampleRecord();
    const preflightTx = {
      $queryRaw: vi.fn(async (query: { strings: readonly string[] }) => {
        const sql = query.strings.join('');
        events.push(sql.includes('sample_confirmations') ? 'preflight-confirmations' : 'preflight-samples');
        return [];
      }),
      sample: { findFirst: vi.fn().mockResolvedValue(current) },
    };
    const finalTx = {
      $queryRaw: vi.fn(async (query: { strings: readonly string[] }) => {
        const sql = query.strings.join('');
        if (sql.includes('FROM "sample_confirmations"')) {
          events.push('final-confirmations');
          return Array.from({ length: 101 }, (_, index) => ({
            id: `confirmation-${index}`,
            workflowTaskId: `old-task-${index}`,
          }));
        }
        events.push('final-samples');
        return [];
      }),
      sample: { findFirst: vi.fn().mockResolvedValue(current) },
      workflowTask: {
        findFirst: vi.fn().mockResolvedValue({ id: activeTask.id }),
      },
    };
    const prisma = {
      $transaction: vi.fn(
        async (executor: (client: typeof preflightTx) => unknown) =>
          executor(preflightTx),
      ),
      sample: { findFirst: vi.fn().mockResolvedValue(current) },
      workflowTask: { findFirst: vi.fn().mockResolvedValue(activeTask) },
    };
    const attachments = {
      createStoredAttachment: vi.fn().mockImplementation(async (input: any) => {
        events.push('scan-complete');
        await input.finalizeDomainAttachment(finalTx);
        events.push('attachment-bound');
        return { id: 'attachment-1' };
      }),
    };
    const { service } = createService({ prisma, attachments });
    let lockCall = 0;
    Reflect.set(
      service,
      'lockSampleRow',
      vi.fn().mockImplementation(async () => {
        events.push(++lockCall === 1 ? 'preflight-sample-locked' : 'final-sample-locked');
        return true;
      }),
    );
    let taskLockCall = 0;
    Reflect.set(
      service,
      'lockActiveConfirmationTaskOrThrow',
      vi.fn().mockImplementation(async () => {
        events.push(++taskLockCall === 1 ? 'preflight-task-locked' : 'unexpected-task-lock');
        return activeTask;
      }),
    );
    Reflect.set(
      service,
      'lockWorkflowTaskRow',
      vi.fn().mockImplementation(async () => {
        events.push('final-task-locked');
        return true;
      }),
    );

    await expect(
      service.uploadSampleImage(
        project.id,
        current.id,
        {
          originalname: 'sample.png',
          mimetype: 'image/png',
          size: 8,
          buffer: Buffer.from('sample'),
        },
        actor,
      ),
    ).rejects.toMatchObject({
      response: { code: 'SAMPLE_CONFIRMATION_RECORD_LIMIT_EXCEEDED' },
    });
    expect(events).not.toContain('attachment-bound');
    expect(events.indexOf('final-task-locked')).toBeLessThan(
      events.indexOf('final-samples'),
    );
    expect(events.indexOf('final-samples')).toBeLessThan(
      events.indexOf('final-confirmations'),
    );
  });

  it('rejects an upload for an unsafe persisted version before scan reservation', async () => {
    const current = sampleRecord('sample-1', {
      versionNo: Number.MAX_SAFE_INTEGER,
    });
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      sample: { findFirst: vi.fn().mockResolvedValue(current) },
    };
    const prisma = {
      $transaction: vi.fn(async (executor: (client: typeof tx) => unknown) =>
        executor(tx),
      ),
      sample: { findFirst: vi.fn().mockResolvedValue(current) },
      workflowTask: { findFirst: vi.fn().mockResolvedValue(activeTask) },
    };
    const attachments = { createStoredAttachment: vi.fn() };
    const { service } = createService({ prisma, attachments });
    Reflect.set(service, 'lockSampleRow', vi.fn().mockResolvedValue(true));
    Reflect.set(
      service,
      'lockActiveConfirmationTaskOrThrow',
      vi.fn().mockResolvedValue(activeTask),
    );

    await expect(
      service.uploadSampleImage(
        project.id,
        current.id,
        {
          originalname: 'sample.png',
          mimetype: 'image/png',
          size: 8,
          buffer: Buffer.from('sample'),
        },
        actor,
      ),
    ).rejects.toMatchObject({
      response: { code: 'SAMPLE_PERSISTED_ROW_OUT_OF_BOUNDS' },
    });
    expect(attachments.createStoredAttachment).not.toHaveBeenCalled();
  });

  it('maps a real Prisma P2002 create rejection after an empty requery to a stable conflict without audit', async () => {
    const uniqueViolation = Object.assign(new Error('unique constraint'), {
      code: 'P2002',
      meta: { target: ['projectId', 'sampleNo', 'versionNo'] },
    });
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      project: { findUnique: vi.fn().mockResolvedValue(project) },
      sample: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockRejectedValue(uniqueViolation),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (executor: (client: typeof tx) => unknown) =>
        executor(tx),
      ),
    };
    const activityLogs = { createWithExecutor: vi.fn() };
    const { service } = createService({ prisma, activityLogs });
    Reflect.set(
      service,
      'lockActiveConfirmationTaskOrThrow',
      vi.fn().mockResolvedValue(activeTask),
    );

    await expect(
      service.createSample(project.id, validCreateInput, actor),
    ).rejects.toMatchObject({
      response: { code: 'SAMPLE_VERSION_CONFLICT' },
    });
    expect(tx.sample.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: project.id }, take: 101 }),
    );
    expect(tx.sample.create).toHaveBeenCalledOnce();
    expect(activityLogs.createWithExecutor).not.toHaveBeenCalled();
  });

  it('serializes two initial same-number creates from empty state at the exact task row lock', async () => {
    let releaseFirstLock!: () => void;
    const firstLockGate = new Promise<void>((resolve) => {
      releaseFirstLock = resolve;
    });
    let signalFirstLocked!: () => void;
    const firstLocked = new Promise<void>((resolve) => {
      signalFirstLocked = resolve;
    });
    let signalSecondAttempted!: () => void;
    const secondAttempted = new Promise<void>((resolve) => {
      signalSecondAttempted = resolve;
    });
    let lockTail = Promise.resolve();
    let transactionSequence = 0;
    const samples: ReturnType<typeof sampleRecord>[] = [];
    const lockSql: string[] = [];
    const activityLogs = { createWithExecutor: vi.fn() };

    const prisma = {
      $transaction: vi.fn(
        async (executor: (client: Record<string, any>) => Promise<unknown>) => {
          const transactionNumber = ++transactionSequence;
          let releaseTask!: () => void;
          const previousLock = lockTail;
          lockTail = new Promise<void>((resolve) => {
            releaseTask = resolve;
          });
          const tx = {
            $queryRaw: vi.fn(async (query: { strings: readonly string[] }) => {
              const sql = query.strings.join('');
              if (sql.includes('FROM "workflow_tasks"')) {
                lockSql.push(sql);
                if (transactionNumber === 2) {
                  signalSecondAttempted();
                }
                await previousLock;
                if (transactionNumber === 1) {
                  signalFirstLocked();
                  await firstLockGate;
                }
                return [{ id: activeTask.id }];
              }
              if (sql.includes('FROM "samples"')) {
                return samples.slice(0, 101).map((sample) => ({ id: sample.id }));
              }
              if (sql.includes('FROM "sample_confirmations"')) {
                return [];
              }
              return [];
            }),
            project: { findUnique: vi.fn().mockResolvedValue(project) },
            workflowTask: {
              findFirst: vi.fn().mockResolvedValue(activeTask),
            },
            sample: {
              findMany: vi.fn(async () => samples.map((sample) => ({ ...sample }))),
              create: vi.fn(async (args: { data: Record<string, unknown> }) => {
                if (
                  samples.some(
                    (sample) =>
                      sample.sampleNo === args.data.sampleNo &&
                      sample.versionNo === args.data.versionNo,
                  )
                ) {
                  throw Object.assign(new Error('unique constraint'), {
                    code: 'P2002',
                  });
                }
                const created = sampleRecord('sample-1', args.data);
                samples.push(created);
                return { ...created };
              }),
            },
          };

          try {
            return await executor(tx);
          } finally {
            releaseTask();
          }
        },
      ),
    };
    const { service } = createService({ prisma, activityLogs });
    Reflect.set(
      service,
      'buildSampleDetail',
      vi.fn().mockResolvedValue({ ok: true }),
    );

    const first = service.createSample(project.id, validCreateInput, actor);
    await firstLocked;
    const second = service.createSample(project.id, validCreateInput, actor);
    await secondAttempted;
    expect(samples).toHaveLength(0);
    releaseFirstLock();

    const outcomes = await Promise.allSettled([first, second]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
    expect(samples).toHaveLength(1);
    expect(samples[0]).toMatchObject({ sampleNo: validCreateInput.sampleNo, versionNo: 1 });
    expect(activityLogs.createWithExecutor).toHaveBeenCalledTimes(1);
    expect(lockSql).toHaveLength(2);
    expect(lockSql.every((sql) => sql.includes('FOR UPDATE'))).toBe(true);
  });

  it('rejects a new version when the next persisted version would not be a safe integer', async () => {
    const current = sampleRecord('sample-max', {
      versionNo: 2_147_483_647,
    });
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      project: { findUnique: vi.fn().mockResolvedValue(project) },
      sample: {
        findFirst: vi.fn().mockResolvedValue(current),
        findMany: vi.fn().mockResolvedValue([current]),
        create: vi.fn(),
        updateMany: vi.fn(),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (executor: (client: typeof tx) => unknown) =>
        executor(tx),
      ),
    };
    const { service } = createService({ prisma });
    Reflect.set(service, 'lockSampleRow', vi.fn().mockResolvedValue(true));
    Reflect.set(
      service,
      'lockActiveConfirmationTaskOrThrow',
      vi.fn().mockResolvedValue(activeTask),
    );

    await expect(
      service.createSample(
        project.id,
        { ...validCreateInput, createNewVersion: true },
        actor,
      ),
    ).rejects.toMatchObject({
      response: { code: 'SAMPLE_VERSION_OUT_OF_BOUNDS' },
    });
    expect(tx.sample.updateMany).not.toHaveBeenCalled();
    expect(tx.sample.create).not.toHaveBeenCalled();
  });

  it('checks confirmation capacity after the active-task lock and before attachment lookup', async () => {
    const events: string[] = [];
    const rawQuery = vi.fn(async (query: { strings: readonly string[] }) => {
      const sql = query.strings.join('');
      if (sql.includes('FROM "samples"')) {
        events.push('sample-capacity');
        return [];
      }
      events.push('confirmation-capacity');
      return Array.from({ length: 100 }, (_, index) => ({
        id: `confirmation-${index}`,
        workflowTaskId: `old-task-${index}`,
      }));
    });
    const tx = {
      $queryRaw: rawQuery,
      sample: {
        findFirst: vi.fn().mockResolvedValue(sampleRecord()),
        update: vi.fn(),
      },
      sampleConfirmation: { upsert: vi.fn() },
      attachment: { findFirst: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (executor: (client: typeof tx) => unknown) =>
        executor(tx),
      ),
    };
    const { service } = createService({ prisma });
    Reflect.set(service, 'lockSampleRow', vi.fn().mockResolvedValue(true));
    Reflect.set(
      service,
      'lockActiveConfirmationTaskOrThrow',
      vi.fn().mockImplementation(async () => {
        events.push('active-task-locked');
        return activeTask;
      }),
    );

    await expect(
      service.submitConfirmation(project.id, validConfirmationInput, actor),
    ).rejects.toMatchObject({
      response: { code: 'SAMPLE_CONFIRMATION_RECORD_LIMIT_EXCEEDED' },
    });
    expect(events).toEqual([
      'active-task-locked',
      'sample-capacity',
      'confirmation-capacity',
    ]);
    expect(rawQuery.mock.calls[0]?.[0]?.strings.join('')).toContain('LIMIT 101');
    expect(rawQuery.mock.calls[1]?.[0]?.strings.join('')).toContain('LIMIT 101');
    expect(tx.attachment.findFirst).not.toHaveBeenCalled();
    expect(tx.sampleConfirmation.upsert).not.toHaveBeenCalled();
  });

  it('checks approval image existence with a project-scoped CLEAN findFirst instead of loading history', async () => {
    const attachmentFindFirst = vi.fn().mockResolvedValue({ id: 'attachment-1' });
    const listTargetAttachments = vi.fn().mockRejectedValue(
      new Error('history query must not run'),
    );
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      sample: {
        findFirst: vi.fn().mockResolvedValue(sampleRecord()),
        update: vi.fn().mockResolvedValue(
          sampleRecord('sample-1', {
            status: SampleStatus.CONFIRMED,
            confirmedAt: new Date('2026-08-11T04:00:00.000Z'),
          }),
        ),
      },
      sampleConfirmation: {
        upsert: vi.fn().mockResolvedValue({ id: 'confirmation-1' }),
      },
      attachment: { findFirst: attachmentFindFirst },
    };
    const prisma = {
      $transaction: vi.fn(async (executor: (client: typeof tx) => unknown) =>
        executor(tx),
      ),
    };
    const { service } = createService({
      prisma,
      attachments: { listTargetAttachments, toAttachmentSummary: vi.fn() },
    });
    Reflect.set(service, 'lockSampleRow', vi.fn().mockResolvedValue(true));
    Reflect.set(
      service,
      'lockActiveConfirmationTaskOrThrow',
      vi.fn().mockResolvedValue(activeTask),
    );
    Reflect.set(service, 'buildWorkspace', vi.fn().mockResolvedValue({ ok: true }));

    await expect(
      service.submitConfirmation(project.id, validConfirmationInput, actor),
    ).resolves.toEqual({ ok: true });
    expect(attachmentFindFirst).toHaveBeenCalledWith({
      where: {
        projectId: project.id,
        entityType: AttachmentTargetType.SAMPLE,
        entityId: 'sample-1',
        isDeleted: false,
        scanStatus: AttachmentScanStatus.CLEAN,
      },
      select: { id: true },
    });
    expect(listTargetAttachments).not.toHaveBeenCalled();
  });

  it('uses a 101-row sample sentinel and fail-closes workspace overflow', async () => {
    const rows = Array.from({ length: 101 }, (_, index) =>
      sampleRecord(`sample-${index}`),
    );
    const harness = workspaceDb({ samples: rows });
    const { service } = createService();

    await expect(
      Reflect.get(service, 'buildWorkspace').call(
        service,
        harness.db,
        project.id,
      ),
    ).rejects.toMatchObject({
      response: { code: 'SAMPLE_RECORD_LIMIT_EXCEEDED' },
    });
    expect(harness.sampleFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: project.id }, take: 101 }),
    );
    expect(harness.confirmationFindMany).not.toHaveBeenCalled();
  });

  it('uses a 101-row confirmation sentinel and fail-closes workspace overflow', async () => {
    const confirmations = Array.from({ length: 101 }, (_, index) =>
      confirmationRecord(`confirmation-${index}`),
    );
    const harness = workspaceDb({ confirmations });
    const { service } = createService();

    await expect(
      Reflect.get(service, 'buildWorkspace').call(
        service,
        harness.db,
        project.id,
      ),
    ).rejects.toMatchObject({
      response: { code: 'SAMPLE_CONFIRMATION_RECORD_LIMIT_EXCEEDED' },
    });
    expect(harness.confirmationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: project.id }, take: 101 }),
    );
    expect(harness.attachmentGroupBy).not.toHaveBeenCalled();
  });

  it('computes workspace attachment counts in the database without materializing all attachment rows', async () => {
    const rows = [
      sampleRecord('sample-1'),
      sampleRecord('sample-2', { sampleNo: 'S-002' }),
    ];
    const harness = workspaceDb({
      samples: rows,
      attachmentStats: [
        {
          entityId: 'sample-1',
          count: 7,
          latestAttachmentId: 'attachment-latest-1',
        },
        {
          entityId: 'sample-2',
          count: 3,
          latestAttachmentId: 'attachment-latest-2',
        },
      ],
    });
    const { service } = createService();

    const workspace = await Reflect.get(service, 'buildWorkspace').call(
      service,
      harness.db,
      project.id,
    );

    expect(harness.queryRaw).toHaveBeenCalledTimes(1);
    const aggregateSql = (
      harness.queryRaw.mock.calls[0]?.[0] as { strings: readonly string[] }
    ).strings.join('');
    expect(aggregateSql).toContain('COUNT(*)::integer');
    expect(aggregateSql).toContain('ARRAY_AGG');
    expect(aggregateSql).toContain('GROUP BY attachment."targetId"');
    expect(harness.attachmentGroupBy).not.toHaveBeenCalled();
    expect(harness.attachmentFindMany).not.toHaveBeenCalled();
    expect(workspace.items).toEqual([
      expect.objectContaining({
        id: 'sample-1',
        imageCount: 7,
        latestImageAttachmentId: 'attachment-latest-1',
      }),
      expect.objectContaining({
        id: 'sample-2',
        imageCount: 3,
        latestImageAttachmentId: 'attachment-latest-2',
      }),
    ]);
  });

  it.each([
    ['versions', 101, 0, 'SAMPLE_RECORD_LIMIT_EXCEEDED'],
    ['confirmations', 1, 101, 'SAMPLE_CONFIRMATION_RECORD_LIMIT_EXCEEDED'],
  ])(
    'uses 101-row sentinels and fail-closes detail %s overflow',
    async (_label, versionCount, confirmationCount, code) => {
      const versions = Array.from({ length: versionCount }, (_, index) =>
        sampleRecord(`sample-${index}`, { versionNo: index + 1 }),
      );
      const confirmations = Array.from(
        { length: confirmationCount },
        (_, index) => confirmationRecord(`confirmation-${index}`),
      );
      const sampleFindMany = vi.fn().mockResolvedValue(versions);
      const confirmationFindMany = vi.fn().mockResolvedValue(confirmations);
      const db = {
        project: { findUnique: vi.fn().mockResolvedValue(project) },
        sample: {
          findFirst: vi.fn().mockResolvedValue(sampleRecord()),
          findMany: sampleFindMany,
        },
        sampleConfirmation: { findMany: confirmationFindMany },
        attachment: { groupBy: vi.fn(), findMany: vi.fn() },
      };
      const { service } = createService();

      await expect(
        Reflect.get(service, 'buildSampleDetail').call(
          service,
          db,
          project.id,
          'sample-1',
        ),
      ).rejects.toMatchObject({ response: { code } });
      expect(sampleFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 101 }),
      );
      if (versionCount === 1) {
        expect(confirmationFindMany).toHaveBeenCalledWith(
          expect.objectContaining({ take: 101 }),
        );
      }
    },
  );

  it('returns only 20 detail attachments plus hasMore and does not repeat the current attachment row query', async () => {
    const attachments = Array.from({ length: 21 }, (_, index) =>
      attachmentRecord(index),
    );
    const attachmentFindMany = vi.fn().mockResolvedValue(attachments);
    const attachmentGroupBy = vi.fn().mockResolvedValue([
      { entityId: 'sample-1', _count: { _all: 21 } },
    ]);
    const listTargetAttachments = vi.fn();
    const toAttachmentSummary = vi.fn((attachment: { id: string }) => ({
      id: attachment.id,
    }));
    const db = {
      project: { findUnique: vi.fn().mockResolvedValue(project) },
      sample: {
        findFirst: vi.fn().mockResolvedValue(sampleRecord()),
        findMany: vi.fn().mockResolvedValue([sampleRecord()]),
      },
      sampleConfirmation: { findMany: vi.fn().mockResolvedValue([]) },
      attachment: {
        groupBy: attachmentGroupBy,
        findMany: attachmentFindMany,
      },
    };
    const { service } = createService({
      attachments: { listTargetAttachments, toAttachmentSummary },
    });

    const detail = await Reflect.get(service, 'buildSampleDetail').call(
      service,
      db,
      project.id,
      'sample-1',
    );

    expect(listTargetAttachments).not.toHaveBeenCalled();
    expect(attachmentFindMany).toHaveBeenCalledTimes(1);
    expect(attachmentFindMany).toHaveBeenCalledWith({
      where: {
        projectId: project.id,
        entityType: AttachmentTargetType.SAMPLE,
        entityId: 'sample-1',
        isDeleted: false,
        scanStatus: AttachmentScanStatus.CLEAN,
      },
      include: { uploadedBy: true, deletedBy: true },
      orderBy: [{ uploadedAt: 'desc' }, { id: 'desc' }],
      take: 21,
    });
    expect(attachmentGroupBy).toHaveBeenCalledTimes(1);
    expect(detail.attachments).toHaveLength(20);
    expect(detail.attachmentsHasMore).toBe(true);
    expect(detail.versions[0]).toMatchObject({ imageCount: 21 });
  });
});
