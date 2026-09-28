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

    // Authorized internal personnel share this team's projects. Membership and
    // department remain historical metadata and never grant business signing.
    const permissions = new Set(actor.permissionCodes ?? []);
    if (!actor.isSystemAdmin && !permissions.has(requiredPermission)) {
      throw new ForbiddenException('当前用户缺少项目权限，请联系管理员分配角色。');
    }
    if (requiredPermission === 'project.write' && !actor.isSystemAdmin && !actor.roleCodes.includes('project_manager')) {
      throw new ForbiddenException('仅项目协调人员可以维护项目。');
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
