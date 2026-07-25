import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AuditTargetType,
  Prisma,
  ProjectStatus,
  RoleStatus,
  UserStatus,
  WorkflowNodeCode,
  WorkflowTaskStatus,
} from '@prisma/client';

import { PrismaService } from '../../infra/prisma/prisma.service';
import type { AdminAuditQueryDto } from './dto/admin-audit-query.dto';

const SENSITIVE_KEY_PATTERN = /^(?:password|secret|token|authorization|cookie|set-cookie|session|access[-_]?token|refresh[-_]?token|app[-_]?secret|database[-_]?url|redis[-_]?url)$/i;
const IP_KEY_PATTERN = /^(?:ip|ipAddress|clientIp|remoteIp)$/i;
const USER_AGENT_KEY_PATTERN = /^(?:userAgent|user-agent)$/i;
const MAX_DETAIL_DEPTH = 4;
const MAX_OBJECT_KEYS = 30;
const MAX_ARRAY_ITEMS = 20;
const MAX_DETAIL_STRING_LENGTH = 500;

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
      activeProjects,
      completedProjects,
      overdueProjects,
      waitingReviewProjects,
      unassignedTasks,
      dueSoonTasks,
      overdueTasks,
      blockedTasks,
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
      this.prisma.project.count({
        where: {
          status: {
            in: [ProjectStatus.DRAFT, ProjectStatus.IN_PROGRESS, ProjectStatus.ON_HOLD],
          },
        },
      }),
      this.prisma.project.count({ where: { status: ProjectStatus.COMPLETED } }),
      this.prisma.project.count({
        where: {
          workflowTasks: {
            some: { isActive: true, overdueDays: { gt: 0 } },
          },
        },
      }),
      this.prisma.project.count({
        where: {
          workflowTasks: {
            some: {
              isActive: true,
              nodeCode: {
                in: [
                  WorkflowNodeCode.CAB_REVIEW,
                  WorkflowNodeCode.COLOR_CONSISTENCY_REVIEW,
                  WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW,
                ],
              },
              status: {
                in: [
                  WorkflowTaskStatus.PENDING,
                  WorkflowTaskStatus.READY,
                  WorkflowTaskStatus.IN_PROGRESS,
                ],
              },
            },
          },
        },
      }),
      this.prisma.workflowTask.count({
        where: {
          isActive: true,
          assigneeUserId: null,
          status: {
            in: [
              WorkflowTaskStatus.PENDING,
              WorkflowTaskStatus.READY,
              WorkflowTaskStatus.IN_PROGRESS,
            ],
          },
        },
      }),
      this.prisma.workflowTask.count({
        where: {
          isActive: true,
          effectiveDueAt: {
            gte: new Date(),
            lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
          status: {
            in: [
              WorkflowTaskStatus.PENDING,
              WorkflowTaskStatus.READY,
              WorkflowTaskStatus.IN_PROGRESS,
            ],
          },
        },
      }),
      this.prisma.workflowTask.count({
        where: { isActive: true, overdueDays: { gt: 0 } },
      }),
      this.prisma.workflowTask.count({
        where: {
          isActive: true,
          blockers: { some: { status: 'OPEN' } },
        },
      }),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      summary: {
        activeUsers,
        activeDepartments,
        activeTemplates,
        anomalyCount,
        projects: {
          active: activeProjects,
          overdue: overdueProjects,
          waitingReview: waitingReviewProjects,
          completed: completedProjects,
        },
        tasks: {
          unassigned: unassignedTasks,
          dueSoon: dueSoonTasks,
          overdue: overdueTasks,
          blocked: blockedTasks,
        },
      },
      modules: [
        {
          key: 'projects',
          title: '项目',
          description: '进入项目总台账，查看进度、期限、风险和成员。',
          href: '/admin/projects',
          metric: `${activeProjects} 个进行中 · ${overdueProjects} 个逾期`,
        },
        {
          key: 'tasks',
          title: '工序',
          description: '进入工序总台账，管理计划日期和人员分工。',
          href: '/admin/tasks',
          metric: `${unassignedTasks} 个待分配 · ${blockedTasks} 个阻塞`,
        },
        {
          key: 'organization',
          title: '组织与用户',
          description: '维护组织架构、人员状态与飞书身份映射。',
          href: '/admin/organization',
          metric: `${activeUsers} 人 · ${activeDepartments} 个部门`,
        },
        {
          key: 'assignments',
          title: '分工与权限',
          description: '查看 18 节点分工矩阵和真实 RBAC 权限边界。',
          href: '/admin/assignments',
          metric: `${activeRoles} 个启用角色 · ${unassignedTasks} 个待分配`,
        },
        {
          key: 'workflow',
          title: '流程模板',
          description: '查看模板版本、18 节点和锁定的特殊规则。',
          href: '/admin/workflow-templates',
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

  async getAuditLogs(query: AdminAuditQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const sortDirection = query.sort === 'createdAt:asc' ? 'asc' : 'desc';
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;

    if (from && to && from > to) {
      throw new BadRequestException('from 不能晚于 to。');
    }

    const where = this.buildAuditWhere(query, from, to);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const failureWhere: Prisma.AuditLogWhereInput = {
      ...where,
      AND: [
        ...(where.AND ? (Array.isArray(where.AND) ? where.AND : [where.AND]) : []),
        {
          OR: [
            { action: { contains: 'FAIL', mode: 'insensitive' } },
            { action: { contains: 'REJECT', mode: 'insensitive' } },
            { action: { contains: 'ERROR', mode: 'insensitive' } },
          ],
        },
      ],
    };

    const [total, rows, todayCount, failureCount] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ createdAt: sortDirection }, { id: sortDirection }],
        select: {
          id: true,
          createdAt: true,
          actorUserId: true,
          actorUser: {
            select: {
              name: true,
              userRoles: {
                select: { role: { select: { code: true } } },
                orderBy: { role: { code: 'asc' } },
              },
            },
          },
          action: true,
          targetType: true,
          targetId: true,
          projectId: true,
          project: { select: { name: true } },
          summary: true,
          metadata: true,
          afterData: true,
        },
      }),
      this.prisma.auditLog.count({ where: { createdAt: { gte: today } } }),
      this.prisma.auditLog.count({ where: failureWhere }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return {
      items: rows.map((row) => ({
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        actorId: row.actorUserId,
        actorName: row.actorUser?.name ?? '系统',
        actorRole:
          row.actorUser?.userRoles.map((item) => item.role.code).join('、') || null,
        action: row.action,
        entityType: row.targetType,
        entityId: row.targetId,
        projectId: row.projectId,
        projectName: row.project?.name ?? null,
        result: this.readAuditString([row.metadata, row.afterData], ['result', 'outcome', 'status']),
        requestId: this.readAuditString([row.metadata], ['requestId', 'traceId', 'correlationId']),
        summary: truncateString(sanitizeString(row.summary ?? row.action), 240),
      })),
      page,
      pageSize,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      sort: `createdAt:${sortDirection}`,
      summary: {
        todayCount,
        failureCount,
        filteredCount: total,
      },
    };
  }

  async getAuditLogDetail(auditLogId: string) {
    const row = await this.prisma.auditLog.findUnique({
      where: { id: auditLogId },
      select: {
        id: true,
        createdAt: true,
        actorUserId: true,
        actorUser: {
          select: {
            name: true,
            userRoles: {
              select: { role: { select: { code: true } } },
              orderBy: { role: { code: 'asc' } },
            },
          },
        },
        action: true,
        targetType: true,
        targetId: true,
        projectId: true,
        project: { select: { name: true } },
        nodeCode: true,
        summary: true,
        beforeData: true,
        afterData: true,
        metadata: true,
      },
    });

    if (!row) {
      throw new NotFoundException('审计日志不存在或已被删除。');
    }

    const ipAddress = this.readAuditString([row.metadata], [
      'ip',
      'ipAddress',
      'clientIp',
      'remoteIp',
    ]);
    const userAgent = this.readAuditString([row.metadata], ['userAgent', 'user-agent']);

    return {
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      actorId: row.actorUserId,
      actorName: row.actorUser?.name ?? '系统',
      actorRole: row.actorUser?.userRoles.map((item) => item.role.code).join('、') || null,
      action: row.action,
      entityType: row.targetType,
      entityId: row.targetId,
      projectId: row.projectId,
      projectName: row.project?.name ?? null,
      nodeCode: row.nodeCode,
      result: this.readAuditString([row.metadata, row.afterData], ['result', 'outcome', 'status']),
      requestId: this.readAuditString([row.metadata], ['requestId', 'traceId', 'correlationId']),
      ipAddress: ipAddress ? maskIpAddress(ipAddress) : null,
      userAgent: userAgent ? truncateString(sanitizeString(userAgent), 256) : null,
      summary: truncateString(sanitizeString(row.summary ?? row.action), 500),
      reason: this.readAuditString(
        [row.metadata, row.afterData, row.beforeData],
        ['reason', 'rejectReason', 'comment'],
      ),
      beforeSummary: sanitizeAuditValue(row.beforeData),
      afterSummary: sanitizeAuditValue(row.afterData),
      metadata: sanitizeAuditValue(row.metadata),
    };
  }

  private buildAuditWhere(
    query: AdminAuditQueryDto,
    from: Date | null,
    to: Date | null,
  ): Prisma.AuditLogWhereInput {
    const createdAt = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
    };
    const and: Prisma.AuditLogWhereInput[] = [];

    if (query.result) {
      and.push({
        OR: [
          { metadata: { path: ['result'], equals: query.result } },
          { metadata: { path: ['outcome'], equals: query.result } },
          { afterData: { path: ['result'], equals: query.result } },
          { afterData: { path: ['status'], equals: query.result } },
        ],
      });
    }
    if (query.requestId) {
      and.push({
        OR: [
          { metadata: { path: ['requestId'], equals: query.requestId } },
          { metadata: { path: ['traceId'], equals: query.requestId } },
          { metadata: { path: ['correlationId'], equals: query.requestId } },
        ],
      });
    }
    if (query.keyword) {
      and.push({
        OR: [
          { action: { contains: query.keyword, mode: 'insensitive' } },
          { summary: { contains: query.keyword, mode: 'insensitive' } },
          { targetId: { contains: query.keyword, mode: 'insensitive' } },
          { actorUser: { name: { contains: query.keyword, mode: 'insensitive' } } },
          { project: { name: { contains: query.keyword, mode: 'insensitive' } } },
          { project: { code: { contains: query.keyword, mode: 'insensitive' } } },
        ],
      });
    }

    return {
      ...(from || to ? { createdAt } : {}),
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
      ...(query.actorName
        ? { actorUser: { name: { contains: query.actorName, mode: 'insensitive' } } }
        : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.entityType ? { targetType: query.entityType as AuditTargetType } : {}),
      ...(query.entityId ? { targetId: query.entityId } : {}),
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(and.length ? { AND: and } : {}),
    };
  }

  private readAuditString(values: unknown[], keys: string[]) {
    for (const value of values) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        continue;
      }
      const record = value as Record<string, unknown>;
      for (const key of keys) {
        const candidate = record[key];
        if (typeof candidate === 'string' && candidate.trim()) {
          return truncateString(sanitizeString(candidate.trim()), 256);
        }
        if (typeof candidate === 'number' || typeof candidate === 'boolean') {
          return String(candidate);
        }
      }
    }
    return null;
  }
}

export function sanitizeAuditValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string') {
    return truncateString(sanitizeString(value), MAX_DETAIL_STRING_LENGTH);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (depth >= MAX_DETAIL_DEPTH) {
    return '[TRUNCATED]';
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitizeAuditValue(item, depth + 1));
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, MAX_OBJECT_KEYS);
    return Object.fromEntries(
      entries.map(([key, item]) => {
        if (SENSITIVE_KEY_PATTERN.test(key)) {
          return [key, '[REDACTED]'];
        }
        if (IP_KEY_PATTERN.test(key) && typeof item === 'string') {
          return [key, maskIpAddress(item)];
        }
        if (USER_AGENT_KEY_PATTERN.test(key) && typeof item === 'string') {
          return [key, truncateString(sanitizeString(item), 256)];
        }
        return [key, sanitizeAuditValue(item, depth + 1)];
      }),
    );
  }
  return String(value);
}

function sanitizeString(value: string) {
  return value
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:postgres(?:ql)?|redis):\/\/[^\s]+/gi, '[REDACTED_URL]')
    .replace(
      /\b(?:authorization|cookie|set-cookie|password|token|secret)\s*[:=]\s*[^\s,;]+/gi,
      (match) => {
        const separatorIndex = match.search(/[:=]/);
        return separatorIndex < 0
          ? '[REDACTED]'
          : `${match.slice(0, separatorIndex + 1)} [REDACTED]`;
      },
    );
}

function truncateString(value: string, maxLength: number) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}…`;
}

function maskIpAddress(value: string) {
  const ipv4 = value.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    return `${ipv4[1]}.${ipv4[2]}.*.*`;
  }
  if (value.includes(':')) {
    const [first = '', second = ''] = value.split(':');
    return `${first}:${second}:*:*`;
  }
  return '[REDACTED_IP]';
}
