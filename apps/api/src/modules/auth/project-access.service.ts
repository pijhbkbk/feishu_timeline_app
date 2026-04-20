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

    if (actor.isSystemAdmin || actor.roleCodes.includes('admin')) {
      return project;
    }

    const permissionCodes = new Set(actor.permissionCodes ?? []);
    if (!permissionCodes.has(requiredPermission)) {
      throw new ForbiddenException('当前用户缺少项目权限。');
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
