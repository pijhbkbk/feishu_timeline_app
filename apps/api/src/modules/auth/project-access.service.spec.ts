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

  it('allows auditors to read audit logs globally without granting global project access', async () => {
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
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not let an ordinary admin bypass the editable permission matrix', async () => {
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
      permissionCodes: ['project.read'],
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

  it('requires audit.read in the editable matrix before granting auditor global scope', async () => {
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
      permissionCodes: ['project.read'],
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
