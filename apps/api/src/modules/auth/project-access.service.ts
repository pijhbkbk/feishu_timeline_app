import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { type Prisma } from '@prisma/client';

import { PrismaService } from '../../infra/prisma/prisma.service';
import type { AuthenticatedUser } from './auth.types';

type ProjectAccessDbClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class ProjectAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async assertProjectAccess(
    db: ProjectAccessDbClient,
    projectId: string,
    actor: AuthenticatedUser,
    requiredPermission: string,
  ) {
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        ownerUserId: true,
        owningDepartmentId: true,
        members: {
          where: {
            userId: actor.id,
          },
          select: {
            id: true,
          },
          take: 1,
        },
      },
    });

    if (!project) {
      throw new NotFoundException('项目不存在。');
    }

    if (actor.isSystemAdmin) {
      return project;
    }

    const permissionCodes = new Set(actor.permissionCodes ?? []);
    if (!permissionCodes.has(requiredPermission)) {
      throw new ForbiddenException('当前用户缺少项目权限。');
    }

    // Ordinary administrator and auditor roles may have global data scope, but
    // they still obey the editable permission matrix. Only the explicit
    // isSystemAdmin flag is a permissionless safety override, matching
    // PermissionsGuard.
    if (actor.roleCodes.includes('admin')) {
      return project;
    }

    if (requiredPermission === 'audit.read' && actor.roleCodes.includes('auditor')) {
      return project;
    }

    const hasScope =
      project.ownerUserId === actor.id ||
      project.members.length > 0 ||
      (Boolean(actor.departmentId) && actor.departmentId === project.owningDepartmentId);

    if (!hasScope) {
      throw new ForbiddenException('当前用户无权访问该项目。');
    }

    return project;
  }

  assertProjectAccessWithDefaultClient(
    projectId: string,
    actor: AuthenticatedUser,
    requiredPermission: string,
  ) {
    return this.assertProjectAccess(this.prisma, projectId, actor, requiredPermission);
  }
}
