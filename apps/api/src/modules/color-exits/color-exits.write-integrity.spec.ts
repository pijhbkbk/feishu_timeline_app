import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { AuthenticatedUser } from '../auth/auth.types';
import { ColorExitsService } from './color-exits.service';

const actor: AuthenticatedUser = {
  id: 'manager-1',
  username: 'manager-1',
  name: '项目经理',
  email: null,
  departmentId: 'dept-1',
  departmentName: '项目部',
  isSystemAdmin: false,
  authSource: 'mock',
  roleCodes: ['project_manager'],
  permissionCodes: ['workflow.transition'],
};

describe('ColorExitsService write integrity', () => {
  it('does not overwrite a completed exit record after the workflow task became terminal', async () => {
    const unsafeUpdate = vi
      .fn()
      .mockRejectedValue(new Error('unsafe color-exit write reached'));
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      colorExit: { update: unsafeUpdate },
    };
    const prisma = {
      $transaction: vi.fn(
        async (callback: (executor: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    };
    const activityLogsService = {
      createWithExecutor: vi.fn(),
    };
    const service = new ColorExitsService(
      prisma as never,
      activityLogsService as never,
      {} as never,
      {
        assertProjectAccess: vi.fn().mockResolvedValue(undefined),
      } as never,
    );
    const getContext = vi.spyOn(service as any, 'getContext').mockResolvedValue({
      project: { id: 'project-1' },
      activeTask: { id: 'task-exit' },
      visualDeltaApproved: true,
      activeRecord: { id: 'exit-1' },
    });
    vi.spyOn(service as any, 'getExitRecordOrThrow').mockResolvedValue({
      id: 'exit-1',
      workflowTaskId: 'task-exit',
      colorId: 'color-1',
      completedAt: null,
    });
    vi.spyOn(service as any, 'resolveExitPolicy').mockResolvedValue({
      exitThreshold: 100,
      systemSuggestion: 'RETAIN',
    });
    vi.spyOn(service as any, 'assertReplacementColor').mockResolvedValue(undefined);

    await expect(
      service.updateExitRecord(
        'project-1',
        'exit-1',
        {
          exitDate: '2026-08-11T00:00:00.000Z',
          exitReason: 'stale overwrite',
          annualOutput: 10,
          statisticYear: 2026,
          finalDecision: 'RETAIN',
          effectiveDate: '2026-08-12T00:00:00.000Z',
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(getContext).not.toHaveBeenCalled();
    expect(unsafeUpdate).not.toHaveBeenCalled();
    expect(activityLogsService.createWithExecutor).not.toHaveBeenCalled();
  });

  it('rejects a stale exit context that no longer matches the locked task', async () => {
    const unsafeUpdate = vi
      .fn()
      .mockRejectedValue(new Error('unsafe color-exit write reached'));
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'task-current' }]),
      colorExit: { update: unsafeUpdate },
    };
    const prisma = {
      $transaction: vi.fn(
        async (callback: (executor: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    };
    const activityLogsService = {
      createWithExecutor: vi.fn(),
    };
    const service = new ColorExitsService(
      prisma as never,
      activityLogsService as never,
      {} as never,
      {
        assertProjectAccess: vi.fn().mockResolvedValue(undefined),
      } as never,
    );
    const getContext = vi.spyOn(service as any, 'getContext').mockResolvedValue({
      project: { id: 'project-1' },
      activeTask: { id: 'task-stale' },
      visualDeltaApproved: true,
      activeRecord: { id: 'exit-1' },
    });

    await expect(
      service.updateExitRecord(
        'project-1',
        'exit-1',
        {
          exitDate: '2026-08-11T00:00:00.000Z',
          exitReason: 'stale context',
          annualOutput: 10,
          statisticYear: 2026,
          finalDecision: 'RETAIN',
          effectiveDate: '2026-08-12T00:00:00.000Z',
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(getContext).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      getContext.mock.invocationCallOrder[0]!,
    );
    expect(unsafeUpdate).not.toHaveBeenCalled();
    expect(activityLogsService.createWithExecutor).not.toHaveBeenCalled();
  });
});
