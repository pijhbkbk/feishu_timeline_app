import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { ProductionPlansService } from './production-plans.service';

const actor = {
  id: 'process-user',
  roleCodes: ['process_engineer'],
  permissionCodes: ['project.read', 'workflow.transition'],
  isSystemAdmin: false,
} as never;

describe('ProductionPlansService project scope', () => {
  function createService(accessResult: 'allow' | 'deny') {
    const prisma = { $transaction: vi.fn() };
    const projectAccess = {
      assertProjectAccessWithDefaultClient:
        accessResult === 'deny'
          ? vi.fn().mockRejectedValue(new ForbiddenException('当前用户无权访问该项目。'))
          : vi.fn().mockResolvedValue({ id: 'project-1' }),
    };
    const service = new ProductionPlansService(
      prisma as never,
      { createWithExecutor: vi.fn() } as never,
      { transitionTaskWithExecutor: vi.fn() } as never,
      projectAccess as never,
    );
    const buildScheduleWorkspace = vi
      .spyOn(
        service as unknown as { buildScheduleWorkspace: () => Promise<unknown> },
        'buildScheduleWorkspace',
      )
      .mockResolvedValue({ project: { id: 'project-1' } });

    return { service, prisma, projectAccess, buildScheduleWorkspace };
  }

  it('rejects a non-member read before any business query', async () => {
    const { service, prisma, projectAccess, buildScheduleWorkspace } = createService('deny');

    await expect(
      service.getScheduleWorkspace('project-out-of-scope', actor),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(projectAccess.assertProjectAccessWithDefaultClient).toHaveBeenCalledWith(
      'project-out-of-scope',
      actor,
      'project.read',
    );
    expect(buildScheduleWorkspace).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a non-member write before any transaction or workflow call', async () => {
    const { service, prisma, projectAccess, buildScheduleWorkspace } = createService('deny');

    await expect(
      service.confirmSchedulePlan('project-out-of-scope', 'plan-1', actor),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(projectAccess.assertProjectAccessWithDefaultClient).toHaveBeenCalledWith(
      'project-out-of-scope',
      actor,
      'workflow.transition',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(buildScheduleWorkspace).not.toHaveBeenCalled();
  });

  it('keeps an in-scope member read working after the scope check', async () => {
    const { service, buildScheduleWorkspace } = createService('allow');

    await expect(service.getScheduleWorkspace('project-1', actor)).resolves.toEqual({
      project: { id: 'project-1' },
    });
    expect(buildScheduleWorkspace).toHaveBeenCalledWith(expect.anything(), 'project-1');
  });
});
