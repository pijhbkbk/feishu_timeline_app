import { requireActiveMonthlyPlan } from '../../common/monthly-review-plan';
import { persistTaskReminder } from '../notifications/task-reminder.rules';
import { ConflictException, ForbiddenException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { teamProjectScope, withProjectWrite } from '../../common/team-authorization';
import type { AuthenticatedUser } from '../auth/auth.types';
import { BUSINESS_ROLES, BUSINESS_ROLE_CODES, NODE_BUSINESS_ROLES } from './personnel.constants';
import { eligibleTeamUserWhere, OPEN_MONTHLY_TASK_STATUSES, OPEN_TEAM_TASK_STATUSES, recordTeamAssignment } from './team-assignment';
import type { TeamTaskCommandDto, TeamTaskQueryDto } from './team-task.dto';

@Injectable()
export class TeamTasksService {
  constructor(private readonly prisma: PrismaService) {}

  private assertQueryScope(actor: AuthenticatedUser, query: TeamTaskQueryDto) {
    teamProjectScope(actor);
    if ((query.view === 'exceptions' || query.view === 'overdue' || (query.assignee && query.assignee !== actor.id)) && !actor.isSystemAdmin) {
      throw new ForbiddenException('仅管理员可查看团队异常或他人待办。');
    }
  }

  async overview(actor: AuthenticatedUser) {
    teamProjectScope(actor);
    const [activeProjects, totalProjects, unassignedPeople] = await Promise.all([
      this.prisma.project.count({ where: { status: { in: ['DRAFT', 'IN_PROGRESS', 'ON_HOLD'] } } }),
      this.prisma.project.count(),
      actor.isSystemAdmin ? this.prisma.user.count({ where: { status: 'ACTIVE', isSystemAdmin: false,
        localCredential: { isNot: null }, userRoles: { none: { role: { status: 'ACTIVE', code: { in: BUSINESS_ROLE_CODES } } } } } }) : Promise.resolve(null),
    ]);
    return { activeProjects, totalProjects, unassignedPeople };
  }

  async list(actor: AuthenticatedUser, query: TeamTaskQueryDto) {
    const view = query.view ?? 'mine';
    const roleCodes = actor.roleCodes.filter(code => BUSINESS_ROLE_CODES.includes(code));
    this.assertQueryScope(actor, query);
    if (view === 'exceptions' && !actor.isSystemAdmin) throw new ForbiddenException('仅管理员可查看人员分配异常。');
    const exceptionScope: Prisma.WorkflowTaskWhereInput = { OR: [
      { requiredRoleCode: null },
      { requiredRole: { status: 'INACTIVE' } },
      ...BUSINESS_ROLE_CODES.map(roleCode => ({ requiredRoleCode: roleCode, OR: [
        { assigneeUserId: null, requiredRole: { userRoles: { none: { user: { status: 'ACTIVE' as const, localCredential: { isNot: null } } } } } },
        { assigneeUser: { is: { NOT: eligibleTeamUserWhere(roleCode) } } },
      ] })),
    ] };
    const where: Prisma.WorkflowTaskWhereInput = { nodeCode: { not: 'VISUAL_COLOR_DIFFERENCE_REVIEW' },
      ...(view === 'completed' ? { status: { in: ['COMPLETED', 'APPROVED'] } } : { isActive: true, status: { in: [...OPEN_TEAM_TASK_STATUSES] } }),
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...((view === 'overdue' || view === 'exceptions') && query.assignee ? { assigneeUserId: query.assignee } : {}),
      ...(query.after ? { id: { gt: query.after } } : {}),
      ...(view === 'mine' || view === 'completed' ? { assigneeUserId: query.assignee ?? actor.id,
        ...(view === 'mine' && !actor.isSystemAdmin ? { requiredRoleCode: { in: roleCodes } } : {}) }
        : view === 'available' ? { assigneeUserId: null, requiredRoleCode: { in: roleCodes }, requiredRole: { status: 'ACTIVE' } }
          : view === 'overdue' ? { OR: [{ effectiveDueAt: { lt: new Date() } }, { effectiveDueAt: null, dueAt: { lt: new Date() } }] } : exceptionScope),
    };
    const items = await this.prisma.workflowTask.findMany({ where, take: 31, orderBy: { id: 'asc' },
      select: { id: true, nodeCode: true, nodeName: true, status: true, taskRound: true, requiredRoleCode: true,
        assigneeUserId: true, assigneeUser: { select: { name: true } }, assignmentEpoch: true, updatedAt: true, effectiveDueAt: true, dueAt: true, completedAt: true,
        project: { select: { id: true, code: true, name: true } } } });
    return { roles: BUSINESS_ROLES, nextCursor: items.length > 30 ? items[29]!.id : null, items: items.slice(0, 30) };
  }

  async claim(actor: AuthenticatedUser, taskId: string, input: TeamTaskCommandDto, transfer = false) {
    if (taskId.length > 64) throw new NotFoundException('任务不存在。');
    if (transfer && !actor.isSystemAdmin) throw new ForbiddenException('仅管理员可转派。');
    if (transfer && (!input.assigneeUserId || !input.reason?.trim())) throw new ConflictException('转派需选择人员并填写原因。');
    if (!transfer && input.assigneeUserId !== undefined) throw new ConflictException('领取只能分配给当前人员。');
    const nextUserId = transfer ? input.assigneeUserId! : actor.id;
    const key = `team-task:${actor.id}:${input.requestId}`;
    const requestHash = createHash('sha256').update(JSON.stringify({ taskId, ...input, transfer })).digest('hex');
    return withProjectWrite(this.prisma, actor, { taskId }, async tx => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${'team-task-actor'}), hashtext(${actor.id}))`);
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${'team-task-command'}), hashtext(${key}))`);
      const previous = await tx.r26CommandRequest.findUnique({ where: { idempotencyKey: key } });
      if (previous) {
        if (previous.requestHash !== requestHash || previous.actorUserId !== actor.id) throw new ConflictException('请求编号已被其他操作使用。');
        return { ...(previous.result as Prisma.JsonObject), replayed: true };
      }
      if (await tx.r26CommandRequest.count({ where: { actorUserId: actor.id, action: { in: ['TEAM_TASK_CLAIMED', 'TEAM_TASK_TRANSFERRED', 'TEAM_MONTHLY_TASK_CLAIMED', 'TEAM_MONTHLY_TASK_TRANSFERRED'] }, createdAt: { gte: new Date(Date.now() - 3_600_000) } } }) >= 300) throw new HttpException('任务领取和转派过于频繁，请稍后重试。', 429);
      await tx.$queryRaw(Prisma.sql`SELECT id FROM workflow_tasks WHERE id = ${taskId} FOR UPDATE`);
      const task = await tx.workflowTask.findUnique({ where: { id: taskId } });
      if (!task) throw new NotFoundException('任务不存在。');
      if (task.nodeCode === 'VISUAL_COLOR_DIFFERENCE_REVIEW') throw new ConflictException('请领取已到期的具体月度任务。');
      const roleCode = NODE_BUSINESS_ROLES[task.nodeCode];
      if (!transfer && !actor.roleCodes.includes(roleCode)) throw new ForbiddenException('当前人员不具备此工序的业务角色。');
      if (!task.isActive || !OPEN_TEAM_TASK_STATUSES.includes(task.status as never)) throw new ConflictException('任务已结束，不能领取或转派。');
      if (task.assignmentEpoch !== input.assignmentEpoch) throw new ConflictException('任务归属已变化，请刷新后重试。');
      if (!transfer && task.assigneeUserId && task.assigneeUserId !== actor.id) throw new ConflictException('任务已被其他人员领取。');
      const assignee = await tx.user.findFirst({ where: { id: nextUserId, ...eligibleTeamUserWhere(roleCode) }, select: { id: true, departmentId: true } });
      if (!assignee) throw new ForbiddenException('接收人须已启用并具备对应业务角色和本地账号。');
      const changed = task.assigneeUserId !== nextUserId;
      if (changed) {
        await tx.workflowTask.update({ where: { id: task.id }, data: { assigneeUserId: nextUserId,
          assigneeDepartmentId: assignee.departmentId, requiredRoleCode: roleCode, assignmentEpoch: { increment: 1 } } });
        await recordTeamAssignment(tx, { task, assigneeUserId: nextUserId, actorUserId: actor.id,
          action: transfer ? 'TEAM_TASK_TRANSFERRED' : 'TEAM_TASK_CLAIMED', reason: input.reason?.trim() || '领取角色待办' });
      }
      const result = { taskId, assigneeUserId: nextUserId, assignmentEpoch: task.assignmentEpoch + Number(changed), changed, replayed: false };
      await tx.r26CommandRequest.create({ data: { projectId: task.projectId, actorUserId: actor.id,
        idempotencyKey: key, action: transfer ? 'TEAM_TASK_TRANSFERRED' : 'TEAM_TASK_CLAIMED', requestHash, result } });
      return result;
    });
  }

  async listMonthly(actor: AuthenticatedUser, query: TeamTaskQueryDto) {
    const view = query.view ?? 'mine';
    this.assertQueryScope(actor, query);
    if (view === 'exceptions' && !actor.isSystemAdmin) throw new ForbiddenException('仅管理员可查看分配异常。');
    if ((view === 'available' || (view === 'mine' && !actor.isSystemAdmin)) && !actor.roleCodes.includes('quality_engineer')) return { items: [], nextCursor: null };
    const eligible = Prisma.sql`EXISTS (SELECT 1 FROM users u
      INNER JOIN local_credentials lc ON lc."userId" = u.id
      INNER JOIN user_roles ur ON ur."userId" = u.id
      INNER JOIN roles r ON r.id = ur."roleId"
      WHERE u.status = 'ACTIVE' AND r.status = 'ACTIVE' AND r.code = 'quality_engineer')`;
    const ownerEligible = Prisma.sql`EXISTS (SELECT 1 FROM users u
      INNER JOIN local_credentials lc ON lc."userId" = u.id
      INNER JOIN user_roles ur ON ur."userId" = u.id
      INNER JOIN roles r ON r.id = ur."roleId"
      WHERE u.id = t."reviewerId" AND u.status = 'ACTIVE' AND r.status = 'ACTIVE' AND r.code = 'quality_engineer')`;
    const scope = view === 'mine' || view === 'completed' ? Prisma.sql`t."reviewerId" = ${query.assignee ?? actor.id}`
      : view === 'available' ? Prisma.sql`t."reviewerId" IS NULL`
        : view === 'overdue' ? Prisma.sql`t."dueAt" < ${new Date()}` : Prisma.sql`(t."reviewerId" IS NULL AND NOT ${eligible}) OR (t."reviewerId" IS NOT NULL AND NOT ${ownerEligible})`;
    const items = await this.prisma.$queryRaw<Array<{ id: string; projectId: string; projectName: string; projectCode: string;
      periodIndex: number; periodLabel: string; plannedDate: Date; dueAt: Date | null; status: string;
      reviewerId: string | null; assignmentEpoch: number }>>(Prisma.sql`
      SELECT t.id, t."projectId", p.name AS "projectName", p.code AS "projectCode", t."periodIndex", t."periodLabel",
        t."plannedDate", t."dueAt", t.status, t."reviewerId", t."assignmentEpoch"
      FROM recurring_tasks t INNER JOIN projects p ON p.id = t."projectId"
      INNER JOIN recurring_plans plan ON plan.id = t."recurringPlanId"
      WHERE ${view === 'completed' ? Prisma.sql`t.status = 'COMPLETED'` : Prisma.sql`t.status IN ('PENDING', 'IN_PROGRESS', 'OVERDUE') AND plan.status = 'ACTIVE' AND t."plannedDate" <= ${new Date()}`} AND (${scope})
        ${query.projectId ? Prisma.sql`AND t."projectId" = ${query.projectId}` : Prisma.empty}
        ${(view === 'overdue' || view === 'exceptions') && query.assignee ? Prisma.sql`AND t."reviewerId" = ${query.assignee}` : Prisma.empty}
        ${query.after ? Prisma.sql`AND t.id > ${query.after}` : Prisma.empty}
        ${view === 'completed' ? Prisma.empty : Prisma.sql`AND EXISTS (SELECT 1 FROM workflow_tasks wt WHERE wt."projectId" = t."projectId"
          AND wt."nodeCode" = 'VISUAL_COLOR_DIFFERENCE_REVIEW' AND wt."isActive" = true
          AND wt.status IN ('PENDING', 'READY', 'IN_PROGRESS', 'RETURNED'))`}
      ORDER BY t.id ASC LIMIT 31
    `);
    return { items: items.slice(0, 30), nextCursor: items.length > 30 ? items[29]!.id : null };
  }

  async claimMonthly(actor: AuthenticatedUser, taskId: string, input: TeamTaskCommandDto, transfer = false) {
    if (taskId.length > 64) throw new NotFoundException('月度任务不存在。');
    if (transfer && !actor.isSystemAdmin) throw new ForbiddenException('仅管理员可转派。');
    if (transfer && (!input.assigneeUserId || !input.reason?.trim())) throw new ConflictException('转派需选择人员并填写原因。');
    if (!transfer && (input.assigneeUserId !== undefined || !actor.roleCodes.includes('quality_engineer'))) throw new ForbiddenException('只能领取本人的质量试验角色任务。');
    const nextUserId = transfer ? input.assigneeUserId! : actor.id;
    const key = `team-monthly:${actor.id}:${input.requestId}`;
    const requestHash = createHash('sha256').update(JSON.stringify({ taskId, ...input, transfer })).digest('hex');
    return withProjectWrite(this.prisma, actor, { monthlyTaskId: taskId }, async tx => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${'team-task-actor'}), hashtext(${actor.id}))`);
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${'team-task-command'}), hashtext(${key}))`);
      const previous = await tx.r26CommandRequest.findUnique({ where: { idempotencyKey: key } });
      if (previous) {
        if (previous.requestHash !== requestHash || previous.actorUserId !== actor.id) throw new ConflictException('请求编号已被其他操作使用。');
        return { ...(previous.result as Prisma.JsonObject), replayed: true };
      }
      if (await tx.r26CommandRequest.count({ where: { actorUserId: actor.id, action: { in: ['TEAM_TASK_CLAIMED', 'TEAM_TASK_TRANSFERRED', 'TEAM_MONTHLY_TASK_CLAIMED', 'TEAM_MONTHLY_TASK_TRANSFERRED'] }, createdAt: { gte: new Date(Date.now() - 3_600_000) } } }) >= 300) throw new HttpException('任务领取和转派过于频繁，请稍后重试。', 429);
      const observed = await tx.recurringTask.findUnique({ where: { id: taskId }, select: { projectId: true } });
      if (!observed) throw new NotFoundException('月度任务不存在。');
      const parents = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT id FROM workflow_tasks
        WHERE "projectId" = ${observed.projectId} AND "nodeCode" = 'VISUAL_COLOR_DIFFERENCE_REVIEW'
          AND "isActive" = true AND status IN ('PENDING', 'READY', 'IN_PROGRESS', 'RETURNED') FOR UPDATE`);
      if (parents.length !== 1) throw new ConflictException('项目当前尚未进入月度评审。');
      await tx.$queryRaw(Prisma.sql`SELECT id FROM recurring_tasks WHERE id = ${taskId} FOR UPDATE`);
      const task = await tx.recurringTask.findUnique({ where: { id: taskId }, include: { recurringPlan: { select: { status: true } } } });
      if (!task) throw new NotFoundException('月度任务不存在。');
      await requireActiveMonthlyPlan(tx, task.projectId, task.recurringPlanId);
      if (!OPEN_MONTHLY_TASK_STATUSES.includes(task.status as never) || task.plannedDate > new Date() || task.recurringPlan.status !== 'ACTIVE') throw new ConflictException('此月份尚未到期或已经结束。');
      if (!await tx.workflowTask.findFirst({ where: { projectId: task.projectId, nodeCode: 'VISUAL_COLOR_DIFFERENCE_REVIEW', isActive: true }, select: { id: true } })) throw new ConflictException('项目当前尚未进入月度评审。');
      if (task.assignmentEpoch !== input.assignmentEpoch) throw new ConflictException('月度任务归属已变化，请刷新后重试。');
      if (!transfer && task.reviewerId && task.reviewerId !== actor.id) throw new ConflictException('此月份已由其他人员领取。');
      if (!await tx.user.findFirst({ where: { id: nextUserId, ...eligibleTeamUserWhere('quality_engineer') }, select: { id: true } })) throw new ForbiddenException('接收人须已启用并具备质量试验角色。');
      const changed = task.reviewerId !== nextUserId;
      if (changed) {
        await tx.recurringTask.update({ where: { id: task.id }, data: { reviewerId: nextUserId, requiredRoleCode: 'quality_engineer', assignmentEpoch: { increment: 1 } } });
        await tx.auditLog.create({ data: { actorUserId: actor.id, projectId: task.projectId, targetType: 'WORKFLOW_TASK', targetId: task.id,
          nodeCode: 'VISUAL_COLOR_DIFFERENCE_REVIEW', action: transfer ? 'TEAM_MONTHLY_TASK_TRANSFERRED' : 'TEAM_MONTHLY_TASK_CLAIMED',
          beforeData: { reviewerId: task.reviewerId, assignmentEpoch: task.assignmentEpoch },
          afterData: { reviewerId: nextUserId, assignmentEpoch: task.assignmentEpoch + 1 }, metadata: { reason: input.reason?.trim() || '领取月度角色待办', periodIndex: task.periodIndex } } });
      }
      await persistTaskReminder(tx, { kind: 'monthly', id: task.id, projectId: task.projectId,
        stageTaskId: parents[0]!.id, epoch: task.assignmentEpoch + Number(changed), roleCode: 'quality_engineer',
        ownerId: nextUserId, title: `第 ${task.periodIndex} 月目视色差评审`, dueAt: task.dueAt }, nextUserId, 'ACTIVATE', new Date());
      const result = { taskId, reviewerId: nextUserId, assignmentEpoch: task.assignmentEpoch + Number(changed), changed, replayed: false };
      await tx.r26CommandRequest.create({ data: { projectId: task.projectId, actorUserId: actor.id, idempotencyKey: key,
        action: transfer ? 'TEAM_MONTHLY_TASK_TRANSFERRED' : 'TEAM_MONTHLY_TASK_CLAIMED', requestHash, result } });
      return result;
    });
  }
}
