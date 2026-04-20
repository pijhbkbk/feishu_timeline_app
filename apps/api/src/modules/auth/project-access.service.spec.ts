import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { AuthenticatedUser } from './auth.types';
import { ProjectAccessService } from './project-access.service';

const actor: AuthenticatedUser = {
  id: 'user-1',
  username: 'pm',
  name: '项目经理',
  email: null,
  departmentId: 'dept-pmo',
  departmentName: '项目管理部',
  isSystemAdmin: false,
  authSource: 'mock',
  roleCodes: ['project_manager'],
  permissionCodes: ['project.read', 'attachment.manage'],
};

describe('ProjectAccessService', () => {
  it('allows access for project owner with matching permission', async () => {
    const prisma = {
      project: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'project-1',
          ownerUserId: 'user-1',
          owningDepartmentId: 'dept-pmo',
          members: [],
        }),
      },
    };
    const service = new ProjectAccessService(prisma as never);

    await expect(
      service.assertProjectAccess(prisma as never, 'project-1', actor, 'project.read'),
    ).resolves.toMatchObject({
      id: 'project-1',
    });
  });

  it('rejects users without scope even if they have permission', async () => {
    const prisma = {
      project: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'project-1',
          ownerUserId: 'other-user',
          owningDepartmentId: 'other-dept',
          members: [],
        }),
      },
    };
    const service = new ProjectAccessService(prisma as never);

    await expect(
      service.assertProjectAccess(prisma as never, 'project-1', actor, 'project.read'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects missing projects', async () => {
    const prisma = {
      project: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };
    const service = new ProjectAccessService(prisma as never);

    await expect(
      service.assertProjectAccess(prisma as never, 'project-404', actor, 'project.read'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
