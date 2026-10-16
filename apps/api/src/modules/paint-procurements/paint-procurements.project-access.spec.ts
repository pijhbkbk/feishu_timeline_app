import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { PaintProcurementsService } from './paint-procurements.service';

const actor = {
  id: 'purchaser-user',
  roleCodes: ['purchaser'],
  permissionCodes: ['project.read', 'workflow.transition'],
  isSystemAdmin: false,
} as never;

describe('PaintProcurementsService project scope', () => {
  function createService(accessResult: 'allow' | 'deny') {
    const prisma = { $transaction: vi.fn() };
    const projectAccess = {
      assertProjectAccessWithDefaultClient:
        accessResult === 'deny'
          ? vi.fn().mockRejectedValue(new ForbiddenException('当前用户无权访问该项目。'))
          : vi.fn().mockResolvedValue({ id: 'project-1' }),
    };
    const service = new PaintProcurementsService(
      prisma as never,
      { createWithExecutor: vi.fn() } as never,
      { transitionTaskWithExecutor: vi.fn() } as never,
      projectAccess as never,
    );
    const buildWorkspace = vi
      .spyOn(service as unknown as { buildWorkspace: () => Promise<unknown> }, 'buildWorkspace')
      .mockResolvedValue({ project: { id: 'project-1' } });

    return { service, prisma, projectAccess, buildWorkspace };
  }

  it('rejects a non-member read before any business query', async () => {
    const { service, prisma, projectAccess, buildWorkspace } = createService('deny');

    await expect(service.getWorkspace('project-out-of-scope', actor)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(projectAccess.assertProjectAccessWithDefaultClient).toHaveBeenCalledWith(
      'project-out-of-scope',
      actor,
      'project.read',
    );
    expect(buildWorkspace).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a non-member write before any transaction or workflow call', async () => {
    const { service, prisma, projectAccess, buildWorkspace } = createService('deny');

    await expect(
      service.orderProcurement('project-out-of-scope', 'procurement-1', actor),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(projectAccess.assertProjectAccessWithDefaultClient).toHaveBeenCalledWith(
      'project-out-of-scope',
      actor,
      'workflow.transition',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(buildWorkspace).not.toHaveBeenCalled();
  });

  it('keeps an in-scope member read working after the scope check', async () => {
    const { service, buildWorkspace } = createService('allow');

    await expect(service.getWorkspace('project-1', actor)).resolves.toEqual({
      project: { id: 'project-1' },
    });
    expect(buildWorkspace).toHaveBeenCalledWith(expect.anything(), 'project-1');
  });
});
