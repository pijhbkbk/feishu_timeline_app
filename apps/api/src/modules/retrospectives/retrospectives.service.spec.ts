import { installTeamAuthorizationFixture } from '../../test-support/team-authorization.fixture';
import { ProjectRetrospectiveStatus, ProjectStatus, WorkflowNodeCode } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import type { SaveRetrospectiveDto } from './dto/save-retrospective.dto';
import { RetrospectivesService } from './retrospectives.service';

const actor = {
  id: 'project-manager-1',
  authSource: 'local', authVersion: 1,
  roleCodes: ['project_manager'],
  permissionCodes: ['project.read', 'project.write'],
  isSystemAdmin: false,
} as never;

type StoredRetrospective = {
  id: string;
  projectId: string;
  status: ProjectRetrospectiveStatus;
  conclusion: string | null;
  improvementMeasures: unknown;
  strengths: string | null;
  problems: string | null;
  reusableExperience: string | null;
  workflowRuleUpdates: string | null;
  completedById: string | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function retrospectiveInput(conclusion: string): SaveRetrospectiveDto {
  return {
    conclusion,
    improvementMeasures: [
      {
        problem: '色差波动',
        rootCause: '参数窗口偏窄',
        measure: '扩大工艺验证窗口',
        responsibleDepartment: '工艺部',
        dueDate: '2026-08-31',
        isWorkflowRuleUpdate: true,
      },
    ],
    strengths: '协作及时',
    problems: '预警偏晚',
    reusableExperience: '保留周度复核',
    workflowRuleUpdates: '增加阶段预警',
  };
}

function draftRecord(): StoredRetrospective {
  return {
    id: 'retrospective-1',
    projectId: 'project-1',
    status: ProjectRetrospectiveStatus.DRAFT,
    conclusion: '原草稿',
    improvementMeasures: [],
    strengths: null,
    problems: null,
    reusableExperience: null,
    workflowRuleUpdates: null,
    completedById: null,
    completedAt: null,
    createdAt: new Date('2026-08-11T00:00:00.000Z'),
    updatedAt: new Date('2026-08-11T00:00:00.000Z'),
  };
}

function createHarness() {
  let stored: StoredRetrospective | null = draftRecord();
  let transactionIndex = 0;
  let transactionScheduler: ((index: number) => Promise<void>) | undefined;
  let transactionTail = Promise.resolve();
  const audits: Array<{ action: string }> = [];

  const cloneStored = () => (stored ? { ...stored } : null);
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: 'locked-row' }]),
    project: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'project-1',
        status: ProjectStatus.COMPLETED,
        currentNodeCode: WorkflowNodeCode.PROJECT_CLOSED,
      }),
    },
    projectRetrospective: {
      findUnique: vi.fn(async () => cloneStored()),
      create: vi.fn(async ({ data }: { data: Partial<StoredRetrospective> }) => {
        const now = new Date();
        stored = {
          ...draftRecord(),
          ...data,
          id: 'retrospective-1',
          projectId: 'project-1',
          status: data.status ?? ProjectRetrospectiveStatus.DRAFT,
          createdAt: now,
          updatedAt: now,
        };
        return cloneStored();
      }),
      updateMany: vi.fn(async ({ where, data }: {
        where: { id?: string; status?: ProjectRetrospectiveStatus };
        data: Partial<StoredRetrospective>;
      }) => {
        if (
          !stored ||
          (where.id !== undefined && stored.id !== where.id) ||
          (where.status !== undefined && stored.status !== where.status)
        ) {
          return { count: 0 };
        }
        stored = { ...stored, ...data, updatedAt: new Date() };
        return { count: 1 };
      }),
      upsert: vi.fn(async ({ create, update }: {
        create: Partial<StoredRetrospective>;
        update: Partial<StoredRetrospective>;
      }) => {
        const now = new Date();
        stored = stored
          ? { ...stored, ...update, updatedAt: now }
          : {
              ...draftRecord(),
              ...create,
              id: 'retrospective-1',
              projectId: 'project-1',
              status: create.status ?? ProjectRetrospectiveStatus.DRAFT,
              createdAt: now,
              updatedAt: now,
            };
        return cloneStored();
      }),
    },
  };

  installTeamAuthorizationFixture(tx, [actor]);
  const prisma = {
    project: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'project-1',
        status: ProjectStatus.COMPLETED,
        currentNodeCode: WorkflowNodeCode.PROJECT_CLOSED,
      }),
    },
    projectRetrospective: {
      findUnique: vi.fn(async () => cloneStored()),
    },
    $transaction: vi.fn(async (executor: (client: typeof tx) => Promise<unknown>) => {
      const index = ++transactionIndex;
      await transactionScheduler?.(index);

      let releaseTransaction!: () => void;
      const previousTransaction = transactionTail;
      transactionTail = new Promise<void>((resolve) => {
        releaseTransaction = resolve;
      });
      await previousTransaction;
      try {
        return await executor(tx);
      } finally {
        releaseTransaction();
      }
    }),
  };
  const activityLogs = {
    createWithExecutor: vi.fn(async (_client: unknown, input: { action: string }) => {
      audits.push({ action: input.action });
    }),
  };
  const service = new RetrospectivesService(
    prisma as never,
    {
      assertProjectAccessWithDefaultClient: vi.fn().mockResolvedValue({ id: 'project-1' }),
    } as never,
    activityLogs as never,
  );
  vi.spyOn(service, 'getRetrospective').mockResolvedValue({} as never);

  return {
    service,
    tx,
    audits,
    getStored: () => cloneStored(),
    setTransactionScheduler: (scheduler: (index: number) => Promise<void>) => {
      transactionScheduler = scheduler;
    },
  };
}

describe('RetrospectivesService finalized-write integrity', () => {
  it('rejects a delayed save after complete commits and preserves the completed payload and audit', async () => {
    const { service, audits, getStored, setTransactionScheduler } = createHarness();
    const saveTransactionRequested = deferred();
    const releaseSaveTransaction = deferred();

    setTransactionScheduler(async (index) => {
      if (index === 1) {
        saveTransactionRequested.resolve();
        await releaseSaveTransaction.promise;
      }
    });

    const delayedSave = service
      .saveRetrospective('project-1', retrospectiveInput('延迟草稿'), actor)
      .then(
        () => ({ status: 'resolved' as const }),
        (error: unknown) => ({ status: 'rejected' as const, error }),
      );
    await saveTransactionRequested.promise;

    await service.completeRetrospective(
      'project-1',
      retrospectiveInput('最终结论'),
      actor,
    );
    const completedSnapshot = getStored();

    releaseSaveTransaction.resolve();
    const saveResult = await delayedSave;

    expect(saveResult.status).toBe('rejected');
    if (saveResult.status === 'rejected') {
      expect(saveResult.error).toMatchObject({ status: 409 });
    }
    expect(getStored()).toEqual(completedSnapshot);
    expect(getStored()).toMatchObject({
      status: ProjectRetrospectiveStatus.COMPLETED,
      conclusion: '最终结论',
    });
    expect(audits.map((item) => item.action)).toEqual([
      'PROJECT_RETROSPECTIVE_COMPLETED',
    ]);
  });

  it('allows exactly one of two different concurrent complete payloads to win', async () => {
    const { service, audits, getStored, setTransactionScheduler } = createHarness();
    const firstTransactionRequested = deferred();
    const secondTransactionRequested = deferred();
    const releaseFirstTransaction = deferred();
    const releaseSecondTransaction = deferred();

    setTransactionScheduler(async (index) => {
      if (index === 1) {
        firstTransactionRequested.resolve();
        await releaseFirstTransaction.promise;
      } else if (index === 2) {
        secondTransactionRequested.resolve();
        await releaseSecondTransaction.promise;
      }
    });

    const firstComplete = service.completeRetrospective(
      'project-1',
      retrospectiveInput('并发赢家'),
      actor,
    );
    await firstTransactionRequested.promise;

    const secondComplete = service
      .completeRetrospective('project-1', retrospectiveInput('并发输家'), actor)
      .then(
        () => ({ status: 'resolved' as const }),
        (error: unknown) => ({ status: 'rejected' as const, error }),
      );
    await secondTransactionRequested.promise;

    releaseFirstTransaction.resolve();
    await firstComplete;
    releaseSecondTransaction.resolve();
    const secondResult = await secondComplete;

    expect(secondResult.status).toBe('rejected');
    if (secondResult.status === 'rejected') {
      expect(secondResult.error).toMatchObject({ status: 409 });
    }
    expect(getStored()).toMatchObject({
      status: ProjectRetrospectiveStatus.COMPLETED,
      conclusion: '并发赢家',
    });
    expect(audits.map((item) => item.action)).toEqual([
      'PROJECT_RETROSPECTIVE_COMPLETED',
    ]);
  });

  it('treats an exact completed-payload replay as idempotent without a second audit', async () => {
    const { service, audits, getStored } = createHarness();
    const input = retrospectiveInput('稳定结论');

    await service.completeRetrospective('project-1', input, actor);
    const completedSnapshot = getStored();
    await service.completeRetrospective('project-1', input, actor);

    expect(getStored()).toEqual(completedSnapshot);
    expect(audits.map((item) => item.action)).toEqual([
      'PROJECT_RETROSPECTIVE_COMPLETED',
    ]);
  });

  it('locks the project row before the retrospective row', async () => {
    const { service, tx } = createHarness();

    await service.saveRetrospective(
      'project-1',
      retrospectiveInput('锁顺序验证'),
      actor,
    );

    const lockStatements = tx.$queryRaw.mock.calls.map(([statement]) =>
      (statement as { strings: string[] }).strings.join('?'),
    );
    expect(lockStatements).toHaveLength(2);
    expect(lockStatements[0]).toContain('FROM "projects"');
    expect(lockStatements[0]).toContain('FOR UPDATE');
    expect(lockStatements[1]).toContain('FROM "project_retrospectives"');
    expect(lockStatements[1]).toContain('FOR UPDATE');
  });
});
