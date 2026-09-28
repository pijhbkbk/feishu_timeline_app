import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { installTeamAuthorizationFixture } from '../../test-support/team-authorization.fixture';
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
  authSource: 'local',
  authVersion: 1,
  roleCodes: ['project_manager'],
  permissionCodes: ['workflow.transition'],
};

describe('ColorExitsService write integrity', () => {
  it.each(['EXIT', 'RETAIN', 'OBSERVE'] as const)('preserves the actual %s decision when closing the project', async finalDecision => {
    const date = new Date('2026-09-28T00:00:00Z');
    const record = { id: 'exit-1', workflowTaskId: 'task-exit', colorId: 'color-1', replacementColorId: null, operatorId: actor.id, exitDate: date, exitReason: '合成判断', statisticYear: 2026, annualOutput: 20, exitThreshold: 100, systemSuggestion: 'EXIT', finalDecision, effectiveDate: date, description: null, completedAt: null, createdAt: date, updatedAt: date };
    const color = { id: 'color-1', code: 'C-01', name: '合成颜色', status: 'APPROVED', exitFlag: false, exitDate: null };
    const task = { id: 'task-exit', projectId: 'project-1', nodeCode: 'PROJECT_CLOSED', assigneeUserId: actor.id, status: 'IN_PROGRESS', isActive: true };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: task.id }]),
      colorExit: { update: vi.fn().mockResolvedValue({ ...record, completedAt: date }) },
      project: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'project-1', status: 'COMPLETED', currentNodeCode: 'PROJECT_CLOSED', actualEndDate: date, closedAt: date }) },
      color: { findUnique: vi.fn().mockResolvedValue(color), update: vi.fn().mockImplementation(async ({ data }) => ({ ...color, ...data })) },
    };
    installTeamAuthorizationFixture(tx, [{ ...actor, authVersion: 1 }], () => task);
    const audit = { createWithExecutor: vi.fn() }, workflow = { transitionTaskWithExecutor: vi.fn() };
    const service = new ColorExitsService({ $transaction: async (callback: (tx: unknown) => unknown) => callback(tx) } as never, audit as never, workflow as never, { assertProjectAccess: vi.fn() } as never);
    vi.spyOn(service as any, 'getContext').mockResolvedValue({ activeTask: task, visualDeltaApproved: true });
    vi.spyOn(service as any, 'getExitRecordOrThrow').mockResolvedValue(record);
    vi.spyOn(service as any, 'buildWorkspace').mockResolvedValue({});
    await service.completeExitRecord('project-1', record.id, actor);
    expect(workflow.transitionTaskWithExecutor).toHaveBeenCalledOnce();
    expect(tx.colorExit.update).toHaveBeenCalledOnce();
    if (finalDecision === 'EXIT') expect(tx.color.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'EXITED', exitFlag: true, exitDate: date } }));
    else expect(tx.color.update).not.toHaveBeenCalled();
    const statusAudits = audit.createWithExecutor.mock.calls.filter(([, row]) => row.action === 'COLOR_EXIT_STATUS_UPDATED');
    expect(statusAudits).toHaveLength(finalDecision === 'EXIT' ? 1 : 0);
    expect(audit.createWithExecutor).toHaveBeenCalledWith(tx, expect.objectContaining({ action: 'COLOR_EXIT_COMPLETED', afterData: expect.objectContaining({ finalDecision }) }));
  });

  it('does not overwrite a completed exit record after the workflow task became terminal', async () => {
    const unsafeUpdate = vi
      .fn()
      .mockRejectedValue(new Error('unsafe color-exit write reached'));
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      colorExit: { update: unsafeUpdate },
    };
    installTeamAuthorizationFixture(tx, [{ ...actor, authVersion: 1 }], () => ({ id: 'task-current', projectId: 'project-1', nodeCode: 'PROJECT_CLOSED', assigneeUserId: actor.id, status: 'IN_PROGRESS', isActive: true }));
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
    installTeamAuthorizationFixture(tx, [{ ...actor, authVersion: 1 }], () => ({ id: 'task-current', projectId: 'project-1', nodeCode: 'PROJECT_CLOSED', assigneeUserId: actor.id, status: 'IN_PROGRESS', isActive: true }));
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
