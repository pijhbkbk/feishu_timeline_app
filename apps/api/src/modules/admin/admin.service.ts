import { Injectable } from '@nestjs/common';
import { RoleStatus, UserStatus } from '@prisma/client';

import { PrismaService } from '../../infra/prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview() {
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const anomalyWhere = {
      createdAt: { gte: since },
      OR: [
        { action: { contains: 'FAILED', mode: 'insensitive' as const } },
        { action: { contains: 'REJECT', mode: 'insensitive' as const } },
        { action: { contains: 'DELETE', mode: 'insensitive' as const } },
        { action: { contains: 'LOCK', mode: 'insensitive' as const } },
      ],
    };
    const [
      activeUsers,
      activeDepartments,
      activeRoles,
      activeTemplates,
      activeNodes,
      activeParameters,
      anomalyCount,
      anomalies,
    ] = await Promise.all([
      this.prisma.user.count({ where: { status: UserStatus.ACTIVE } }),
      this.prisma.department.count({ where: { isActive: true } }),
      this.prisma.role.count({ where: { status: RoleStatus.ACTIVE } }),
      this.prisma.processTemplate.count({ where: { status: 'ACTIVE' } }),
      this.prisma.workflowNodeDefinition.count({ where: { isActive: true } }),
      this.prisma.systemParameter.count({ where: { isActive: true } }),
      this.prisma.auditLog.count({ where: anomalyWhere }),
      this.prisma.auditLog.findMany({
        where: anomalyWhere,
        include: { actorUser: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 6,
      }),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      summary: {
        activeUsers,
        activeDepartments,
        activeTemplates,
        anomalyCount,
      },
      modules: [
        {
          key: 'organization',
          title: '组织与用户',
          description: '维护组织架构、人员状态与飞书身份映射。',
          href: '/admin/users',
          metric: `${activeUsers} 人 · ${activeDepartments} 个部门`,
        },
        {
          key: 'roles',
          title: '角色与权限',
          description: '查看角色覆盖范围与系统权限边界。',
          href: '/admin/roles',
          metric: `${activeRoles} 个启用角色`,
        },
        {
          key: 'workflow',
          title: '流程与参数',
          description: '管理流程模板、节点定义和系统参数。',
          href: '/admin/workflow-nodes',
          metric: `${activeTemplates} 套模板 · ${activeNodes} 个节点 · ${activeParameters} 项参数`,
        },
        {
          key: 'audit',
          title: '审计与异常',
          description: '检查关键写操作、拒绝、删除和失败事件。',
          href: '/admin/audit-logs',
          metric: `近 30 天 ${anomalyCount} 条需关注`,
        },
      ],
      anomalies: anomalies.map((item) => ({
        id: item.id,
        action: item.action,
        summary: item.summary ?? item.action,
        actorName: item.actorUser?.name ?? '系统',
        projectId: item.projectId,
        createdAt: item.createdAt.toISOString(),
      })),
    };
  }
}
