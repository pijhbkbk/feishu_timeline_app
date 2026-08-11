import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { StandardBoardsService } from './standard-boards.service';

describe('StandardBoardsService project scope', () => {
  it('rejects an allowed-role non-member before any project data query', async () => {
    const prisma = { project: { findUnique: vi.fn() }, $transaction: vi.fn() };
    const projectAccess = {
      assertProjectAccessWithDefaultClient: vi
        .fn()
        .mockRejectedValue(new ForbiddenException('当前用户无权访问该项目。')),
    };
    const service = new StandardBoardsService(
      prisma as never,
      {} as never,
      {} as never,
      projectAccess as never,
    );

    await expect(
      service.getWorkspace('project-out-of-scope', {
        id: 'quality-user',
        roleCodes: ['quality_engineer'],
        permissionCodes: ['project.read', 'workflow.transition'],
        isSystemAdmin: false,
      } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.project.findUnique).not.toHaveBeenCalled();
  });

  it('rejects an allowed-role non-member write before parsing or starting a transaction', async () => {
    const prisma = { $transaction: vi.fn() };
    const projectAccess = {
      assertProjectAccessWithDefaultClient: vi
        .fn()
        .mockRejectedValue(new ForbiddenException('当前用户无权访问该项目。')),
    };
    const service = new StandardBoardsService(
      prisma as never,
      {} as never,
      {} as never,
      projectAccess as never,
    );

    await expect(
      service.createStandardBoard(
        'project-out-of-scope',
        {},
        {
          id: 'quality-user',
          roleCodes: ['quality_engineer'],
          permissionCodes: ['project.read', 'workflow.transition'],
          isSystemAdmin: false,
        } as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('keeps an in-scope member read path working', async () => {
    const projectAccess = {
      assertProjectAccessWithDefaultClient: vi.fn().mockResolvedValue({ id: 'project-1' }),
    };
    const service = new StandardBoardsService(
      {} as never,
      {} as never,
      {} as never,
      projectAccess as never,
    );
    const internals = service as unknown as { buildWorkspace: () => Promise<unknown> };
    vi.spyOn(internals, 'buildWorkspace').mockResolvedValue({ projectId: 'project-1' });

    await expect(
      service.getWorkspace('project-1', {
        id: 'quality-member',
        roleCodes: ['quality_engineer'],
        permissionCodes: ['project.read', 'workflow.transition'],
        isSystemAdmin: false,
      } as never),
    ).resolves.toEqual({ projectId: 'project-1' });
  });
});
