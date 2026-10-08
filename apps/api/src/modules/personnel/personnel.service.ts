import { BusinessClock } from '../../common/business-clock';
import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { reconcileTeamAssignments } from './team-assignment';
import { lockTeamAuthorization } from '../../common/team-authorization';
import { BUSINESS_ROLES, BUSINESS_ROLE_CODES } from './personnel.constants';
import type { PersonnelChangeDto, PersonnelQueryDto } from './personnel.dto';

const pendingStatuses = ['PENDING', 'READY', 'IN_PROGRESS', 'RETURNED'] as const;

@Injectable()
export class PersonnelService {
  constructor(private readonly prisma: PrismaService, private readonly businessClock: BusinessClock = new BusinessClock()) {}

  async list(actor: AuthenticatedUser, query: PersonnelQueryDto) {
    this.assertAdministrator(actor);
    const q = query.q?.trim();
    const where: Prisma.UserWhereInput = {
      ...(query.roleCode ? { AND: [{ status: 'ACTIVE', localCredential: { isNot: null }, userRoles: { some: { role: { code: query.roleCode, status: 'ACTIVE' } } } }] } : {}),
      ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { username: { contains: q, mode: 'insensitive' } }] } : {}),
      ...(query.after ? { id: { gt: query.after } } : {}),
      ...(query.filter === 'active' ? { status: 'ACTIVE' } : {}),
      ...(query.filter === 'inactive' ? { status: { not: 'ACTIVE' } } : {}),
      ...(query.filter === 'historical' ? { localCredential: { is: null } } : {}),
      ...(query.filter === 'unassigned' ? { isSystemAdmin: false, userRoles: { none: { role: { status: 'ACTIVE', code: { in: BUSINESS_ROLE_CODES } } } } } : {}),
    };
    const users = await this.prisma.user.findMany({
      where, take: 31, orderBy: { id: 'asc' },
      select: { id: true, username: true, name: true, status: true, isSystemAdmin: true, teamAccessApproved: true, updatedAt: true,
        localCredential: { select: { userId: true } },
        userRoles: { take: 16, select: { role: { select: { code: true, name: true, status: true } } } },
        _count: { select: { assignedWorkflowTasks: { where: { nodeCode: { not: 'VISUAL_COLOR_DIFFERENCE_REVIEW' }, isActive: true, status: { in: [...pendingStatuses] } } } } },
      },
    });
    const page = users.slice(0, 30);
    // Recurring tasks retain scalar historical user/project IDs. Aggregate only
    // the bounded visible directory page and only currently actionable periods.
    const monthlyCounts = page.length ? await this.prisma.$queryRaw<Array<{ reviewerId: string; count: number }>>(Prisma.sql`
      SELECT t."reviewerId", count(*)::int AS count
      FROM recurring_tasks t JOIN recurring_plans plan ON plan.id = t."recurringPlanId"
      WHERE t."reviewerId" IN (${Prisma.join(page.map(user => user.id))})
        AND t.status IN ('PENDING', 'IN_PROGRESS', 'OVERDUE') AND t."plannedDate" <= ${this.businessClock.now()}
        AND plan.status = 'ACTIVE' AND plan."projectId" = t."projectId"
        AND EXISTS (SELECT 1 FROM workflow_tasks wt WHERE wt."projectId" = t."projectId"
          AND wt."nodeCode" = 'VISUAL_COLOR_DIFFERENCE_REVIEW' AND wt."isActive" = true
          AND wt.status IN ('PENDING', 'READY', 'IN_PROGRESS', 'RETURNED'))
      GROUP BY t."reviewerId" LIMIT 30
    `) : [];
    const monthlyByUser = new Map(monthlyCounts.map(row => [row.reviewerId, row.count]));
    return {
      roles: BUSINESS_ROLES,
      nextCursor: users.length > 30 ? users[29]!.id : null,
      items: page.map(({ localCredential, userRoles, _count, ...user }) => ({
        ...user, hasCredential: Boolean(localCredential), version: user.updatedAt.toISOString(),
        pendingTaskCount: _count.assignedWorkflowTasks + (monthlyByUser.get(user.id) ?? 0),
        roles: userRoles.map(({ role }) => ({ ...role, name: BUSINESS_ROLES.find(option => option.code === role.code)?.name ?? role.name })),
      })),
    };
  }

  async change(actor: AuthenticatedUser, userId: string, input: PersonnelChangeDto) {
    this.assertAdministrator(actor);
    if (!userId || userId.length > 64 || !input.reason.trim() || (input.roleCodes === undefined && input.status === undefined && input.teamAccessApproved === undefined)) {
      throw new BadRequestException('请选择角色或账号状态，并填写操作原因。');
    }
    if (input.roleCodes === null || input.status === null) throw new BadRequestException('角色和状态不能为 null。');
    if (input.teamAccessApproved !== undefined && typeof input.teamAccessApproved !== 'boolean') throw new BadRequestException('人员准入必须是明确的布尔值。');
    const selected = input.roleCodes === undefined ? undefined : [...new Set(input.roleCodes)].sort();
    if (selected?.some(code => !BUSINESS_ROLE_CODES.includes(code))) throw new BadRequestException('只能分配预置业务角色。');
    const key = `personnel:${actor.id}:${input.requestId}`;
    const hash = createHash('sha256').update(JSON.stringify({ userId, ...input, roleCodes: selected })).digest('hex');
    return this.prisma.$transaction(async tx => {
      await lockTeamAuthorization(tx, true);
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${'feishu-timeline:admin-command'}), hashtext(${key}))`);
      await tx.$queryRaw(Prisma.sql`SELECT id FROM users WHERE id = ${actor.id} FOR SHARE`);
      const currentActor = await tx.user.findUnique({ where: { id: actor.id }, select: { status: true, isSystemAdmin: true, authVersion: true } });
      if (!currentActor || currentActor.status !== 'ACTIVE' || !currentActor.isSystemAdmin || currentActor.authVersion !== actor.authVersion) {
        throw new ForbiddenException('管理员授权已变化，请重新登录。');
      }
      const previous = await tx.adminCommandRequest.findUnique({ where: { idempotencyKey: key } });
      if (previous) {
        if (previous.actorUserId !== actor.id || previous.requestHash !== hash) throw new ConflictException('请求编号已被其他操作使用。');
        return { ...(previous.result as Prisma.JsonObject), replayed: true };
      }
      if (await tx.adminCommandRequest.count({ where: { actorUserId: actor.id, action: 'PERSONNEL_CHANGED', createdAt: { gte: new Date(Date.now() - 3_600_000) } } }) >= 120) {
        throw new HttpException('人员操作过于频繁，请稍后重试。', 429);
      }
      await tx.$queryRaw(Prisma.sql`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`);
      const target = await tx.user.findUnique({ where: { id: userId }, include: { userRoles: { include: { role: true } } } });
      if (!target) throw new NotFoundException('人员不存在。');
      if (target.updatedAt.toISOString() !== input.expectedVersion) throw new ConflictException('人员已被其他操作更新，请刷新后重试。');
      if (input.status === 'INACTIVE' && target.isSystemAdmin) {
        if (target.id === actor.id) throw new ConflictException('不能停用当前登录的管理员。');
        if (await tx.user.count({ where: { id: { not: target.id }, status: 'ACTIVE', isSystemAdmin: true, localCredential: { is: { passwordHash: { not: null } } } } }) === 0) {
          throw new ConflictException('至少保留一位可用密码登录的管理员。');
        }
      }
      const beforeRoles = target.userRoles.map(row => row.role.code).filter(code => BUSINESS_ROLE_CODES.includes(code)).sort();
      const roles = selected === undefined ? [] : await tx.role.findMany({ where: { code: { in: selected }, status: 'ACTIVE' }, take: 7, select: { id: true, code: true } });
      if (selected && roles.length !== selected.length) throw new ConflictException('所选业务角色尚未启用，请刷新后重试。');
      const changed = (input.teamAccessApproved !== undefined && input.teamAccessApproved !== target.teamAccessApproved) || (selected !== undefined && JSON.stringify(selected) !== JSON.stringify(beforeRoles)) || (input.status !== undefined && input.status !== target.status);
      if (changed) {
        if (selected !== undefined) {
          await tx.userRole.deleteMany({ where: { userId, role: { code: { in: BUSINESS_ROLE_CODES } } } });
          if (roles.length) await tx.userRole.createMany({ data: roles.map(role => ({ userId, roleId: role.id })) });
        }
        await tx.user.update({ where: { id: userId }, data: { ...(input.teamAccessApproved !== undefined ? { teamAccessApproved: input.teamAccessApproved } : {}), ...(input.status ? { status: input.status } : {}), authVersion: { increment: 1 }, onboardingCompleted: true } });
        await reconcileTeamAssignments(tx, { actorUserId: actor.id, affectedUserId: userId,
          roleCodes: [...beforeRoles, ...(selected ?? [])], reason: input.reason.trim() });
        await tx.auditLog.create({ data: {
          actorUserId: actor.id, targetType: 'USER', targetId: userId, action: 'PERSONNEL_CHANGED',
          beforeData: { roleCodes: beforeRoles, status: target.status, teamAccessApproved: target.teamAccessApproved },
          afterData: { roleCodes: selected ?? beforeRoles, status: input.status ?? target.status, teamAccessApproved: input.teamAccessApproved ?? target.teamAccessApproved },
          metadata: { reason: input.reason.trim(), requestId: input.requestId },
        } });
      }
      const result = { userId, changed, replayed: false };
      await tx.adminCommandRequest.create({ data: { actorUserId: actor.id, idempotencyKey: key, action: 'PERSONNEL_CHANGED', requestHash: hash, result } });
      return result;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15000 });
  }

  private assertAdministrator(actor: AuthenticatedUser) {
    if (!actor.isSystemAdmin || actor.authSource !== 'local') throw new ForbiddenException('仅系统管理员可管理人员。');
  }
}
