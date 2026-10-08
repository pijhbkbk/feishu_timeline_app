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
  teamAccessApproved: true, authSource: 'local',
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

  it('allows authorized team readers without project membership', async () => {
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
    ).resolves.toMatchObject({ id: 'project-1' });
    await expect(service.assertProjectAccess(prisma as never, 'project-1', { ...actor, teamAccessApproved: false, roleCodes: [], permissionCodes: [] }, 'project.read')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows an auditor team reads when both read permissions are granted', async () => {
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
    const auditor: AuthenticatedUser = {
      ...actor,
      id: 'auditor-1',
      roleCodes: ['auditor'],
      permissionCodes: ['project.read', 'audit.read'],
    };

    await expect(
      service.assertProjectAccess(prisma as never, 'project-1', auditor, 'audit.read'),
    ).resolves.toMatchObject({ id: 'project-1' });
    await expect(
      service.assertProjectAccess(prisma as never, 'project-1', auditor, 'project.read'),
    ).resolves.toMatchObject({ id: 'project-1' });
  });

  it('does not admit a legacy admin role without explicit team approval', async () => {
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
    const ordinaryAdmin: AuthenticatedUser = {
      ...actor,
      id: 'ordinary-admin',
      roleCodes: ['admin'],
      teamAccessApproved: false, permissionCodes: ['project.read'],
    };

    await expect(
      service.assertProjectAccess(
        prisma as never,
        'project-1',
        ordinaryAdmin,
        'review.execute',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('keeps ordinary administrator global scope when the matrix grants the permission', async () => {
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
    const ordinaryAdmin: AuthenticatedUser = {
      ...actor,
      id: 'ordinary-admin',
      roleCodes: ['admin'],
      permissionCodes: ['review.execute'],
    };

    await expect(
      service.assertProjectAccess(
        prisma as never,
        'project-1',
        ordinaryAdmin,
        'review.execute',
      ),
    ).resolves.toMatchObject({ id: 'project-1' });
  });

  it('rejects an unapproved legacy auditor regardless of read role', async () => {
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
    const auditorWithoutPermission: AuthenticatedUser = {
      ...actor,
      id: 'auditor-without-permission',
      roleCodes: ['auditor'],
      teamAccessApproved: false, permissionCodes: ['project.read'],
    };

    await expect(
      service.assertProjectAccess(
        prisma as never,
        'project-1',
        auditorWithoutPermission,
        'audit.read',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('keeps the explicit system administrator as the only permissionless override', async () => {
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
    const systemAdmin: AuthenticatedUser = {
      ...actor,
      id: 'system-admin',
      isSystemAdmin: true,
      roleCodes: ['admin'],
      permissionCodes: [],
    };

    await expect(
      service.assertProjectAccess(
        prisma as never,
        'project-1',
        systemAdmin,
        'review.execute',
      ),
    ).resolves.toMatchObject({ id: 'project-1' });
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
