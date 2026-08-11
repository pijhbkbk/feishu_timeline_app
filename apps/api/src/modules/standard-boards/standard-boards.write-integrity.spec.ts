import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { AuthenticatedUser } from '../auth/auth.types';
import { StandardBoardsService } from './standard-boards.service';

const actor: AuthenticatedUser = {
  id: 'quality-1',
  username: 'quality-1',
  name: '质量工程师',
  email: null,
  departmentId: 'dept-1',
  departmentName: '质量部',
  isSystemAdmin: false,
  authSource: 'mock',
  roleCodes: ['quality_engineer'],
  permissionCodes: ['workflow.transition'],
};

function createHarness() {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    standardBoard: {
      create: vi.fn().mockRejectedValue(new Error('unsafe board write reached')),
    },
    colorBoardDetailUpdate: {
      create: vi.fn().mockRejectedValue(new Error('unsafe detail write reached')),
    },
  };
  const prisma = {
    $transaction: vi.fn(
      async (callback: (executor: typeof tx) => Promise<unknown>) => callback(tx),
    ),
  };
  const activityLogsService = {
    createWithExecutor: vi.fn(),
  };
  const service = new StandardBoardsService(
    prisma as never,
    activityLogsService as never,
    {} as never,
    {
      assertProjectAccessWithDefaultClient: vi.fn().mockResolvedValue(undefined),
    } as never,
  );

  return { service, tx, activityLogsService };
}

describe('StandardBoardsService write integrity', () => {
  it('does not create a standard board after the production task became terminal', async () => {
    const { service, tx, activityLogsService } = createHarness();
    const getContext = vi
      .spyOn(service as any, 'getStandardBoardContext')
      .mockResolvedValue({
        project: { id: 'project-1' },
        activeTask: { id: 'task-standard-board' },
        procurementCompleted: true,
        boards: [],
      });
    vi.spyOn(service as any, 'assertSampleReference').mockResolvedValue(undefined);
    vi.spyOn(service as any, 'assertUniqueBoardVersion').mockResolvedValue(undefined);

    await expect(
      service.createStandardBoard(
        'project-1',
        {
          boardCode: 'SB-001',
          versionNo: 1,
          basedOnSampleId: null,
          remark: 'must not be created after completion',
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(getContext).not.toHaveBeenCalled();
    expect(tx.standardBoard.create).not.toHaveBeenCalled();
    expect(activityLogsService.createWithExecutor).not.toHaveBeenCalled();
  });

  it('does not create a detail-update record after its workflow task became terminal', async () => {
    const { service, tx, activityLogsService } = createHarness();
    const getContext = vi
      .spyOn(service as any, 'getColorBoardDetailUpdateContext')
      .mockResolvedValue({
        project: { id: 'project-1' },
        activeTask: { id: 'task-board-detail' },
        procurementCompleted: true,
        updates: [],
      });
    vi.spyOn(service as any, 'getBoardOrThrow').mockResolvedValue({ id: 'board-1' });

    await expect(
      service.createColorBoardDetailUpdate(
        'project-1',
        {
          standardBoardId: 'board-1',
          updateStatus: 'UPDATED',
          detailUpdatedAt: '2026-08-11T06:00:00.000Z',
          note: 'must not be created after completion',
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(getContext).not.toHaveBeenCalled();
    expect(tx.colorBoardDetailUpdate.create).not.toHaveBeenCalled();
    expect(activityLogsService.createWithExecutor).not.toHaveBeenCalled();
  });

  it('rejects a stale standard-board context that no longer matches the locked task', async () => {
    const { service, tx, activityLogsService } = createHarness();
    tx.$queryRaw.mockResolvedValue([{ id: 'task-current' }]);
    const getContext = vi
      .spyOn(service as any, 'getStandardBoardContext')
      .mockResolvedValue({
        project: { id: 'project-1' },
        activeTask: { id: 'task-stale' },
        procurementCompleted: true,
        boards: [],
      });
    vi.spyOn(service as any, 'assertSampleReference').mockResolvedValue(undefined);
    vi.spyOn(service as any, 'assertUniqueBoardVersion').mockResolvedValue(undefined);

    await expect(
      service.createStandardBoard(
        'project-1',
        {
          boardCode: 'SB-002',
          versionNo: 1,
          basedOnSampleId: null,
          remark: 'stale task context',
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(getContext).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      getContext.mock.invocationCallOrder[0]!,
    );
    expect(tx.standardBoard.create).not.toHaveBeenCalled();
    expect(activityLogsService.createWithExecutor).not.toHaveBeenCalled();
  });
});
