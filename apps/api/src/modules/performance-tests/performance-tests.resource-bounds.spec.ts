import {
  AttachmentScanStatus,
  AttachmentTargetType,
  PerformanceTestResult,
  PerformanceTestStatus,
  PerformanceTestType,
  WorkflowNodeCode,
  WorkflowTaskStatus,
} from '@prisma/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { installTeamAuthorizationFixture } from '../../test-support/team-authorization.fixture';

import { PerformanceTestsService } from './performance-tests.service';

const actor = {
  id: 'quality-engineer-1', authSource: 'local', authVersion: 1,
  roleCodes: ['quality_engineer'],
  permissionCodes: ['project.read', 'workflow.transition'],
  isSystemAdmin: false,
} as never;

const validInput = {
  testCode: 'PT-001',
  sampleId: null,
  relatedObjectName: '涂料批次 A',
  testItem: PerformanceTestType.GLOSS,
  standardValue: '80±5',
  actualValue: '82',
  result: PerformanceTestResult.PASS,
  conclusion: '符合验收标准',
  testedById: 'quality-engineer-1',
  testedAt: '2026-08-11T02:00:00.000Z',
};

const project = {
  id: 'project-1',
  code: 'PRJ-001',
  name: '项目 A',
  priority: 'MEDIUM',
  currentNodeCode: WorkflowNodeCode.PERFORMANCE_TEST,
  plannedEndDate: null,
};

const activeTask = {
  id: 'performance-task-1',
  taskNo: 'TASK-PERF-1',
  nodeCode: WorkflowNodeCode.PERFORMANCE_TEST,
  nodeName: '涂料性能试验',
  taskRound: 1,
  status: WorkflowTaskStatus.IN_PROGRESS,
  isPrimary: true,
  isActive: true,
  assigneeUserId: 'quality-engineer-1',
  assigneeDepartmentId: null,
  assigneeUser: null,
  assigneeDepartment: null,
  dueAt: null,
  startedAt: new Date('2026-08-11T00:00:00.000Z'),
  completedAt: null,
  returnedAt: null,
  payload: null,
  createdAt: new Date('2026-08-11T00:00:00.000Z'),
  updatedAt: new Date('2026-08-11T00:00:00.000Z'),
};

function performanceRecord(id = 'performance-test-1') {
  return {
    id,
    projectId: 'project-1',
    sampleId: null,
    paintProcurementId: null,
    testedById: 'quality-engineer-1',
    reportAttachmentId: null,
    testCode: `PT-${id}`,
    relatedObjectName: '涂料批次 A',
    testItem: PerformanceTestType.GLOSS,
    status: PerformanceTestStatus.SUBMITTED,
    standardValue: '80±5',
    actualValue: '82',
    result: PerformanceTestResult.PASS,
    conclusion: '符合验收标准',
    metadata: null,
    testedAt: new Date('2026-08-11T02:00:00.000Z'),
    submittedAt: new Date('2026-08-11T03:00:00.000Z'),
    sample: null,
    testedBy: { id: 'quality-engineer-1', name: '质量工程师' },
    reportAttachment: null,
    createdAt: new Date('2026-08-11T00:00:00.000Z'),
    updatedAt: new Date('2026-08-11T03:00:00.000Z'),
  };
}

function createService(input?: {
  prisma?: Record<string, unknown>;
  activityLogs?: Record<string, unknown>;
  attachments?: Record<string, unknown>;
  workflows?: Record<string, unknown>;
}) {
  const db = input?.prisma as Record<string, any> | undefined;
  if (db?.$transaction) {
    const transaction = db.$transaction;
    const configured = new WeakSet<object>();
    db.$transaction = vi.fn((operation: (tx: any) => unknown, options?: unknown) => transaction((tx: Record<string, any>) => {
      if (!configured.has(tx)) { installTeamAuthorizationFixture(tx, [actor], () => activeTask); configured.add(tx); }
      return operation(tx);
    }, options));
  }
  return new PerformanceTestsService(
    (input?.prisma ?? {}) as never,
    (input?.activityLogs ?? {}) as never,
    (input?.attachments ?? { toAttachmentSummary: vi.fn() }) as never,
    (input?.workflows ?? {}) as never,
    {
      assertProjectAccessWithDefaultClient: vi
        .fn()
        .mockResolvedValue({ id: 'project-1' }),
    } as never,
  );
}

async function expectCreateRejectedBeforeTransaction(
  input: Record<string, unknown>,
) {
  const transaction = vi.fn();
  const service = createService({ prisma: { $transaction: transaction } });

  await expect(
    service.createTest('project-1', input, actor),
  ).rejects.toMatchObject({
    response: { code: 'PERFORMANCE_TEST_INPUT_OUT_OF_BOUNDS' },
  });
  expect(transaction).not.toHaveBeenCalled();
}

function contextDb(records: unknown[], samples: unknown[] = []) {
  const performanceFindMany = vi.fn().mockResolvedValue(records);
  const sampleFindMany = vi.fn().mockResolvedValue(samples);
  const workflowFindFirst = vi.fn(async (args: {
    where: { nodeCode?: WorkflowNodeCode };
  }) =>
    args.where.nodeCode === WorkflowNodeCode.PAINT_PROCUREMENT
      ? { id: 'procurement-task-1' }
      : activeTask,
  );
  return {
    db: {
      project: { findUnique: vi.fn().mockResolvedValue(project) },
      performanceTest: { findMany: performanceFindMany },
      workflowTask: { findFirst: workflowFindFirst },
      sample: { findMany: sampleFindMany },
    },
    performanceFindMany,
    sampleFindMany,
  };
}

describe('PerformanceTestsService resource bounds', () => {
  it('records the mapped physical columns required by the later database-bound migration', () => {
    const schema = readFileSync(
      resolve(process.cwd(), 'prisma/schema.prisma'),
      'utf8',
    );
    const model = schema.slice(
      schema.indexOf('model PerformanceTest {'),
      schema.indexOf('model TrialProduction {'),
    );

    expect(model).toContain('@@map("performance_tests")');
    expect(model).toMatch(/testCode\s+String\s+@map\("testNo"\)/u);
    expect(model).toMatch(/testItem\s+PerformanceTestType\s+@map\("testType"\)/u);
    expect(model).toMatch(/conclusion\s+String\?\s+@map\("resultSummary"\)/u);
    expect(model).toMatch(/metadata\s+Json\?\s+@map\("resultData"\)/u);
    expect(model).toMatch(/submittedAt\s+DateTime\?\s+@map\("completedAt"\)/u);
  });

  it('defines fail-closed database bounds on the mapped performance-test columns', () => {
    const schema = readFileSync(
      resolve(process.cwd(), 'prisma/schema.prisma'),
      'utf8',
    );
    const model = schema.slice(
      schema.indexOf('model PerformanceTest {'),
      schema.indexOf('model TrialProduction {'),
    );
    const migration = readFileSync(
      resolve(
        process.cwd(),
        'prisma/migrations/20260811233000_bound_performance_test_records/migration.sql',
      ),
      'utf8',
    );

    expect(model).toMatch(
      /testCode\s+String\s+@map\("testNo"\)\s+@db\.VarChar\(64\)/u,
    );
    expect(model).toMatch(
      /relatedObjectName\s+String\?\s+@db\.VarChar\(200\)/u,
    );
    expect(model).toMatch(/standardValue\s+String\?\s+@db\.VarChar\(500\)/u);
    expect(model).toMatch(/actualValue\s+String\?\s+@db\.VarChar\(500\)/u);
    expect(model).toMatch(
      /conclusion\s+String\?\s+@map\("resultSummary"\)\s+@db\.VarChar\(4000\)/u,
    );

    expect(migration).toContain('ALTER COLUMN "testNo" TYPE VARCHAR(64)');
    expect(migration).toContain(
      'ALTER COLUMN "relatedObjectName" TYPE VARCHAR(200)',
    );
    expect(migration).toContain(
      'ALTER COLUMN "standardValue" TYPE VARCHAR(500)',
    );
    expect(migration).toContain(
      'ALTER COLUMN "actualValue" TYPE VARCHAR(500)',
    );
    expect(migration).toContain(
      'ALTER COLUMN "resultSummary" TYPE VARCHAR(4000)',
    );
    expect(migration).toContain('"testNo" ~ \'^[A-Za-z0-9._-]{1,64}$\'');
    expect(migration).toContain('"sampleId" ~ \'^[A-Za-z0-9_-]{1,64}$\'');
    expect(migration).toContain('"testedById" ~ \'^[A-Za-z0-9_-]{1,64}$\'');
    expect(migration).toContain('octet_length(');
    expect(migration).toContain('<= 16384');
    expect(migration).not.toMatch(/\bUSING\b|\bleft\s*\(|\bsubstring\s*\(/iu);
    expect(migration).not.toMatch(/\bUPDATE\b|\bDELETE\b/iu);
    expect(migration).not.toMatch(
      /ALTER\s+COLUMN\s+"(?:testType|status|result|resultData|completedAt)"/iu,
    );
  });

  it('accepts exact scalar boundaries before opening the write transaction', async () => {
    const transaction = vi.fn().mockRejectedValue(new Error('transaction reached'));
    const service = createService({ prisma: { $transaction: transaction } });

    await expect(
      service.createTest(
        'project-1',
        {
          ...validInput,
          testCode: 'T'.repeat(64),
          sampleId: 's'.repeat(64),
          relatedObjectName: 'R'.repeat(200),
          standardValue: 'S'.repeat(500),
          actualValue: 'A'.repeat(500),
          conclusion: 'C'.repeat(4_000),
          testedById: 'u'.repeat(64),
        },
        actor,
      ),
    ).rejects.toThrow('transaction reached');
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['testCode', 'T'.repeat(65)],
    ['testCode', 'PT / 001'],
    ['sampleId', 's'.repeat(65)],
    ['sampleId', 'sample / 1'],
    ['relatedObjectName', 'R'.repeat(201)],
    ['standardValue', 'S'.repeat(501)],
    ['actualValue', 'A'.repeat(501)],
    ['conclusion', 'C'.repeat(4_001)],
    ['testedById', 'u'.repeat(65)],
    ['testedById', 'user / 1'],
  ])('rejects an unsafe %s before opening a transaction', async (field, value) => {
    await expectCreateRejectedBeforeTransaction({
      ...validInput,
      [field]: value,
    });
  });

  it('rejects a normalized payload above the 16 KiB UTF-8 budget', async () => {
    await expectCreateRejectedBeforeTransaction({
      ...validInput,
      conclusion: '\ud800'.repeat(4_000),
    });
  });

  it('checks the 101st create only after the active-task lock and before persistence', async () => {
    const events: string[] = [];
    const tx = {
      performanceTest: { create: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (executor: (client: typeof tx) => unknown) => {
        events.push('transaction');
        return executor(tx);
      }),
    };
    const activityLogs = { createWithExecutor: vi.fn() };
    const service = createService({ prisma, activityLogs });
    Reflect.set(
      service,
      'lockPerformanceWriteContext',
      vi.fn().mockImplementation(async () => {
        events.push('active-task-locked');
        return {
          context: {
            activeTask,
            records: Array.from({ length: 100 }, (_, index) =>
              performanceRecord(`performance-test-${index}`),
            ),
          },
          testRecord: null,
        };
      }),
    );

    await expect(
      service.createTest('project-1', validInput, actor),
    ).rejects.toMatchObject({
      response: { code: 'PERFORMANCE_TEST_RECORD_LIMIT_EXCEEDED' },
    });
    expect(events).toEqual(['transaction', 'active-task-locked']);
    expect(tx.performanceTest.create).not.toHaveBeenCalled();
    expect(activityLogs.createWithExecutor).not.toHaveBeenCalled();
  });

  it.each(['getPerformanceContext', 'buildWorkspace'])(
    'bounds %s reads to a 101-row sentinel and fail-closes',
    async (method) => {
      const records = Array.from({ length: 101 }, (_, index) =>
        performanceRecord(`performance-test-${index}`),
      );
      const harness = contextDb(records);
      const service = createService();

      await expect(
        Reflect.get(service, method).call(
          service,
          harness.db,
          'project-1',
        ),
      ).rejects.toMatchObject({
        response: { code: 'PERFORMANCE_TEST_RECORD_LIMIT_EXCEEDED' },
      });
      expect(harness.performanceFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 101 }),
      );
    },
  );

  it('returns at most 100 sample selector rows plus a has-more sentinel', async () => {
    const samples = Array.from({ length: 101 }, (_, index) => ({
      id: `sample-${index.toString().padStart(3, '0')}`,
      sampleNo: `S-${index.toString().padStart(3, '0')}`,
      sampleName: `样板 ${index}`,
      versionNo: 1,
    }));
    const harness = contextDb([], samples);
    const service = createService();

    const workspace = await Reflect.get(service, 'buildWorkspace').call(
      service,
      harness.db,
      'project-1',
    );

    expect(harness.sampleFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 101 }),
    );
    expect(workspace.sampleOptions).toHaveLength(100);
    expect(workspace.sampleOptionsHasMore).toBe(true);
  });

  it('returns only the first 20 detail attachments plus a has-more sentinel', async () => {
    const attachments = Array.from({ length: 21 }, (_, index) => ({
      id: `attachment-${index.toString().padStart(2, '0')}`,
      projectId: 'project-1',
      entityType: AttachmentTargetType.PERFORMANCE_TEST,
      entityId: 'performance-test-1',
      bucket: 'bucket',
      storageKey: `reports/${index}`,
      fileName: `report-${index}.pdf`,
      originalFileName: null,
      fileExtension: 'pdf',
      mimeType: 'application/pdf',
      fileSize: 100,
      checksum: null,
      fileUrl: null,
      scanStatus: AttachmentScanStatus.CLEAN,
      scannerEngine: null,
      scannerVersion: null,
      scannerSignatureVersion: null,
      scanResultSummary: null,
      scannedAt: new Date('2026-08-11T04:00:00.000Z'),
      materialType: null,
      versionNo: 1,
      replacesAttachmentId: null,
      uploadedById: 'quality-engineer-1',
      uploadedAt: new Date(`2026-08-11T04:${index.toString().padStart(2, '0')}:00.000Z`),
      isDeleted: false,
      deletedAt: null,
      deletedById: null,
      createdAt: new Date('2026-08-11T04:00:00.000Z'),
      updatedAt: new Date('2026-08-11T04:00:00.000Z'),
      uploadedBy: { name: '质量工程师' },
      deletedBy: null,
    }));
    const attachmentFindMany = vi.fn().mockResolvedValue(attachments);
    const listTargetAttachments = vi.fn();
    const attachmentsService = {
      listTargetAttachments,
      toAttachmentSummary: vi.fn((attachment: { id: string }) => ({
        id: attachment.id,
      })),
    };
    const service = createService({ attachments: attachmentsService });
    Reflect.set(
      service,
      'getTestOrThrow',
      vi.fn().mockResolvedValue(performanceRecord()),
    );

    const detail = await Reflect.get(service, 'buildDetail').call(
      service,
      { attachment: { findMany: attachmentFindMany } },
      'project-1',
      'performance-test-1',
    );

    expect(listTargetAttachments).not.toHaveBeenCalled();
    expect(attachmentFindMany).toHaveBeenCalledWith({
      where: {
        projectId: 'project-1',
        entityType: AttachmentTargetType.PERFORMANCE_TEST,
        entityId: 'performance-test-1',
        isDeleted: false,
        scanStatus: AttachmentScanStatus.CLEAN,
      },
      include: { uploadedBy: true, deletedBy: true },
      orderBy: [{ uploadedAt: 'desc' }, { id: 'desc' }],
      take: 21,
    });
    expect(detail.attachmentHistory).toHaveLength(20);
    expect(detail.attachmentHistoryHasMore).toBe(true);
  });

  it('locks a legacy 100-record completion set with one stable parameterized query', async () => {
    const records = Array.from({ length: 100 }, (_, index) =>
      performanceRecord(`performance-test-${index.toString().padStart(3, '0')}`),
    );
    const rawQueries: Array<{ strings?: readonly string[]; values?: unknown[] }> = [];
    const tx = {
      $queryRaw: vi.fn(
        async (query: { strings?: readonly string[]; values?: unknown[] }) => {
          rawQueries.push(query);
          const sql = query.strings?.join('') ?? '';
          if (sql.includes('performance_tests')) {
            return records.map(({ id }) => ({ id }));
          }
          return [{ id: activeTask.id }];
        },
      ),
    };
    installTeamAuthorizationFixture(tx, [actor], () => activeTask);
    const service = createService();
    Reflect.set(
      service,
      'getPerformanceContext',
      vi.fn().mockResolvedValue({
        project,
        activeTask,
        procurementCompleted: true,
        records,
      }),
    );

    const context = await Reflect.get(
      service,
      'lockPerformanceCompletionContext',
    ).call(service, tx, actor, 'project-1');

    expect(context.records).toHaveLength(100);
    const performanceQueries = rawQueries.filter((query) =>
      query.strings?.join('').includes('performance_tests'),
    );
    expect(performanceQueries).toHaveLength(1);
    const sql = performanceQueries[0]?.strings?.join('') ?? '';
    expect(sql).toContain('FROM "performance_tests"');
    expect(sql).toContain('WHERE "projectId" = ');
    expect(sql).toContain('ORDER BY "id" ASC');
    expect(sql).toContain('LIMIT 101');
    expect(sql).toContain('FOR UPDATE');
    expect(performanceQueries[0]?.values).toContain('project-1');
  });

  it('preserves the database id order instead of re-sorting it with ICU collation', async () => {
    const records = [
      performanceRecord('record-A'),
      performanceRecord('record_a'),
    ];
    expect(records.map(({ id }) => id).sort((left, right) => left.localeCompare(right)))
      .not.toEqual(records.map(({ id }) => id));
    const tx = {
      $queryRaw: vi.fn(async (query: { strings?: readonly string[] }) => {
        const sql = query.strings?.join('') ?? '';
        return sql.includes('performance_tests')
          ? records.map(({ id }) => ({ id }))
          : [{ id: activeTask.id }];
      }),
    };
    installTeamAuthorizationFixture(tx, [actor], () => activeTask);
    const service = createService();
    Reflect.set(
      service,
      'getPerformanceContext',
      vi.fn().mockResolvedValue({
        project,
        activeTask,
        procurementCompleted: true,
        records,
      }),
    );

    await expect(
      Reflect.get(service, 'lockPerformanceCompletionContext').call(
        service,
        tx,
        actor,
        'project-1',
      ),
    ).resolves.toMatchObject({ records });
  });

  it('rejects a 101-row completion lock before workflow transition or audit', async () => {
    const records = Array.from({ length: 100 }, (_, index) =>
      performanceRecord(`performance-test-${index.toString().padStart(3, '0')}`),
    );
    const tx = {
      $queryRaw: vi.fn(async (query: { strings?: readonly string[] }) => {
        const sql = query.strings?.join('') ?? '';
        if (sql.includes('performance_tests')) {
          return Array.from({ length: 101 }, (_, index) => ({
            id: `performance-test-${index.toString().padStart(3, '0')}`,
          }));
        }
        return [{ id: activeTask.id }];
      }),
    };
    const prisma = {
      $transaction: vi.fn(async (executor: (client: typeof tx) => unknown) =>
        executor(tx),
      ),
    };
    const workflows = { transitionTaskWithExecutor: vi.fn() };
    const activityLogs = { createWithExecutor: vi.fn() };
    const service = createService({ prisma, workflows, activityLogs });
    Reflect.set(
      service,
      'getPerformanceContext',
      vi.fn().mockResolvedValue({
        project,
        activeTask,
        procurementCompleted: true,
        records,
      }),
    );
    Reflect.set(service, 'buildWorkspace', vi.fn().mockResolvedValue({}));

    await expect(
      service.completeTask('project-1', actor),
    ).rejects.toMatchObject({
      response: { code: 'PERFORMANCE_TEST_RECORD_LIMIT_EXCEEDED' },
    });
    expect(workflows.transitionTaskWithExecutor).not.toHaveBeenCalled();
    expect(activityLogs.createWithExecutor).not.toHaveBeenCalled();
  });
});
