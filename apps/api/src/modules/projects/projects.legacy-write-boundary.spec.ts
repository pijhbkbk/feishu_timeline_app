import { BadRequestException, GoneException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { AuthenticatedUser } from '../auth/auth.types';
import { ProjectsService } from './projects.service';

const actor: AuthenticatedUser = {
  id: 'project-manager-2',
  username: 'project-manager-2',
  name: '非项目负责人',
  email: null,
  departmentId: 'dept-1',
  departmentName: '项目部',
  isSystemAdmin: false,
  authSource: 'mock',
  roleCodes: ['project_manager'],
  permissionCodes: ['project.write'],
};

function createHarness() {
  const transaction = vi
    .fn()
    .mockRejectedValue(new Error('unsafe legacy project mutation reached'));
  const service = new ProjectsService(
    { $transaction: transaction } as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, transaction };
}

describe('ProjectsService legacy write boundary', () => {
  it('rejects owner transfer through the generic project patch before database access', async () => {
    const { service, transaction } = createHarness();

    const request = service.updateProject(
      'project-1',
      {
        name: '普通基础信息仍可编辑',
        ownerUserId: actor.id,
      },
      actor,
    );

    await expect(request).rejects.toBeInstanceOf(BadRequestException);
    await expect(request).rejects.toMatchObject({
      response: { code: 'PROJECT_OWNER_CHANGE_REQUIRES_VERSIONED_COMMAND' },
    });

    expect(transaction).not.toHaveBeenCalled();
  });

  it('retires the unversioned bulk-member replacement before database access', async () => {
    const { service, transaction } = createHarness();

    const request = service.replaceProjectMembers(
      'project-1',
      {
        members: [
          {
            userId: actor.id,
            memberType: 'OWNER',
            title: '越权负责人',
            isPrimary: true,
          },
        ],
      },
      actor,
    );

    await expect(request).rejects.toBeInstanceOf(GoneException);
    await expect(request).rejects.toMatchObject({
      response: { code: 'LEGACY_PROJECT_MEMBER_REPLACEMENT_DISABLED' },
    });

    expect(transaction).not.toHaveBeenCalled();
  });

  it('does not disable ordinary non-ownership project-field updates', async () => {
    const { service, transaction } = createHarness();

    await expect(
      service.updateProject(
        'project-1',
        {
          name: '允许更新的项目名称',
        },
        actor,
      ),
    ).rejects.toThrow('unsafe legacy project mutation reached');

    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('never writes a stale owner snapshot during an ordinary field update', async () => {
    const currentProject = {
      id: 'project-1',
      name: '更新前名称',
      ownerUserId: 'owner-before-r26-transfer',
      owningDepartmentId: 'dept-before-r26-transfer',
      description: null,
      priority: 'MEDIUM',
      marketRegion: null,
      colorMarketingUnit: null,
      paintSupplier: null,
      vehicleModel: null,
      plannedStartDate: null,
      plannedEndDate: null,
      currentNodeCode: 'PROJECT_INITIATION',
    };
    const update = vi.fn().mockResolvedValue({
      ...currentProject,
      name: '更新后名称',
      ownerUserId: 'owner-after-r26-transfer',
      owningDepartmentId: 'dept-after-r26-transfer',
    });
    const tx = {
      project: {
        findUnique: vi.fn().mockResolvedValue(currentProject),
        update,
      },
    };
    const prisma = {
      $transaction: vi.fn(
        async (callback: (executor: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    };
    const activityLogsService = { createWithExecutor: vi.fn() };
    const projectAccessService = { assertProjectAccess: vi.fn() };
    const service = new ProjectsService(
      prisma as never,
      {} as never,
      activityLogsService as never,
      projectAccessService as never,
    );
    vi.spyOn(service as any, 'toProjectAuditSnapshot').mockReturnValue({});
    vi.spyOn(service as any, 'findProjectDetailOrThrow').mockResolvedValue({ id: 'project-1' });
    vi.spyOn(service as any, 'toProjectDetail').mockReturnValue({ id: 'project-1' });

    await service.updateProject('project-1', { name: '更新后名称' }, actor);

    const data = update.mock.calls[0]![0].data;
    expect(data).not.toHaveProperty('ownerUserId');
    expect(data).not.toHaveProperty('owningDepartmentId');
    expect(data).toMatchObject({ name: '更新后名称' });
  });
});
