import { Injectable } from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';

import { PrismaService } from '../../infra/prisma/prisma.service';
import {
  ROLE_PERMISSION_CODE_MAP,
  ROLE_LABELS,
  type AuthSource,
  type RoleCode,
} from '../auth/auth.constants';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { FeishuIdentityProfile } from '../feishu/feishu.types';

type UserWithRelations = Prisma.UserGetPayload<{
  include: {
    department: true;
    userRoles: {
      include: {
        role: {
          include: {
            rolePermissions: true;
          };
        };
      };
    };
  };
}>;

type UpsertMockUserInput = {
  username?: string;
  name?: string;
  roleCodes: RoleCode[];
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getAuthenticatedUser(userId: string, authSource: AuthSource): Promise<AuthenticatedUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        department: true,
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: true,
              },
            },
          },
        },
      },
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      return null;
    }

    return this.toAuthenticatedUser(user, authSource);
  }

  async upsertMockUser(input: UpsertMockUserInput) {
    return this.prisma.$transaction(async (tx) => {
      const roleRecords = await Promise.all(
        input.roleCodes.map((roleCode) =>
          tx.role.upsert({
            where: { code: roleCode },
            create: {
              code: roleCode,
              name: ROLE_LABELS[roleCode],
              description: `Mock login role: ${ROLE_LABELS[roleCode]}`,
              isSystem: true,
            },
            update: {
              name: ROLE_LABELS[roleCode],
              description: `Mock login role: ${ROLE_LABELS[roleCode]}`,
            },
          }),
        ),
      );

      const department = await tx.department.upsert({
        where: { code: 'LOCAL_DEV' },
        create: {
          code: 'LOCAL_DEV',
          name: '本地开发',
          path: '/LOCAL_DEV',
          level: 1,
          sortOrder: 999,
          isActive: true,
        },
        update: {
          name: '本地开发',
          path: '/LOCAL_DEV',
          isActive: true,
        },
      });

      const username = input.username?.trim() || `mock_${input.roleCodes.join('_')}`;
      const user = await tx.user.upsert({
        where: { username },
        create: {
          username,
          name: input.name?.trim() || `Mock ${input.roleCodes.map((role) => ROLE_LABELS[role]).join('/')}`,
          email: `${username}@local.dev`,
          departmentId: department.id,
          status: UserStatus.ACTIVE,
          isSystemAdmin: input.roleCodes.includes('admin'),
        },
        update: {
          name: input.name?.trim() || `Mock ${input.roleCodes.map((role) => ROLE_LABELS[role]).join('/')}`,
          email: `${username}@local.dev`,
          departmentId: department.id,
          status: UserStatus.ACTIVE,
          isSystemAdmin: input.roleCodes.includes('admin'),
        },
      });

      await tx.userRole.deleteMany({
        where: { userId: user.id },
      });

      if (roleRecords.length > 0) {
        await Promise.all(
          roleRecords.map(async (role) => {
            const permissionCodes = ROLE_PERMISSION_CODE_MAP[role.code as RoleCode] ?? [];

            await tx.rolePermission.deleteMany({
              where: { roleId: role.id },
            });

            if (permissionCodes.length > 0) {
              await tx.rolePermission.createMany({
                data: permissionCodes.map((permissionCode) => ({
                  roleId: role.id,
                  permissionCode,
                })),
              });
            }
          }),
        );

        await tx.userRole.createMany({
          data: roleRecords.map((role) => ({
            userId: user.id,
            roleId: role.id,
          })),
        });
      }

      return user;
    });
  }

  async upsertFeishuUser(profile: FeishuIdentityProfile) {
    return this.prisma.$transaction(async (tx) => {
      const username = profile.userId?.trim() || `feishu_${profile.openId}`;
      const existingUser = await tx.user.findFirst({
        where: {
          OR: [
            { feishuOpenId: profile.openId },
            ...(profile.userId ? [{ feishuUserId: profile.userId }] : []),
          ],
        },
      });

      if (existingUser) {
        return tx.user.update({
          where: { id: existingUser.id },
          data: {
            username,
            name: profile.name,
            email: profile.email ?? existingUser.email,
            mobile: profile.mobile ?? existingUser.mobile,
            feishuOpenId: profile.openId,
            feishuUserId: profile.userId ?? null,
            feishuUnionId: profile.unionId ?? null,
            status: UserStatus.ACTIVE,
          },
        });
      }

      return tx.user.create({
        data: {
          username,
          name: profile.name,
          email: profile.email ?? null,
          mobile: profile.mobile ?? null,
          feishuOpenId: profile.openId,
          feishuUserId: profile.userId ?? null,
          feishuUnionId: profile.unionId ?? null,
          status: UserStatus.ACTIVE,
        },
      });
    });
  }

  async getRoleSummaries() {
    const roles = await this.prisma.role.findMany({
      orderBy: { code: 'asc' },
      select: {
        code: true,
        name: true,
        description: true,
      },
    });

    return roles;
  }

  async getDirectory(search?: string) {
    const normalizedSearch = search?.trim();
    const users = await this.prisma.user.findMany({
      where: {
        status: UserStatus.ACTIVE,
        ...(normalizedSearch
          ? {
              OR: [
                {
                  username: {
                    contains: normalizedSearch,
                    mode: 'insensitive',
                  },
                },
                {
                  name: {
                    contains: normalizedSearch,
                    mode: 'insensitive',
                  },
                },
                {
                  email: {
                    contains: normalizedSearch,
                    mode: 'insensitive',
                  },
                },
              ],
            }
          : {}),
      },
      include: {
        department: true,
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: true,
              },
            },
          },
        },
      },
      orderBy: [{ name: 'asc' }],
      take: 100,
    });

    return users.map((user) => ({
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      departmentId: user.departmentId,
      departmentName: user.department?.name ?? null,
      roleCodes: user.userRoles
        .map((userRole) => userRole.role.code)
        .filter((roleCode): roleCode is RoleCode => roleCode in ROLE_LABELS),
    }));
  }

  private toAuthenticatedUser(user: UserWithRelations, authSource: AuthSource): AuthenticatedUser {
    return {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      departmentId: user.departmentId,
      departmentName: user.department?.name ?? null,
      isSystemAdmin: user.isSystemAdmin,
      authSource,
      roleCodes: user.userRoles
        .map((userRole) => userRole.role.code)
        .filter((roleCode): roleCode is RoleCode => roleCode in ROLE_LABELS),
      permissionCodes: [
        ...new Set(
          user.userRoles.flatMap((userRole) =>
            userRole.role.rolePermissions.map((permission) => permission.permissionCode),
          ),
        ),
      ],
    };
  }
}
