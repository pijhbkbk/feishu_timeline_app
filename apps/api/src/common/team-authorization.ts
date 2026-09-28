import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma, type WorkflowNodeCode } from '@prisma/client';
import type { PrismaService } from '../infra/prisma/prisma.service';
import type { AuthenticatedUser } from '../modules/auth/auth.types';
import { NATIVE_ADMIN_LOCK } from '../modules/auth/native-auth.rules';
import { NODE_BUSINESS_ROLES } from '../modules/personnel/personnel.constants';

/** Acquire before project, assignment, task, idempotency or row locks. */
export async function lockTeamAuthorization(tx: Prisma.TransactionClient, exclusive = false) {
  if (exclusive) {
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${NATIVE_ADMIN_LOCK}))`);
  } else {
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock_shared(hashtext(${NATIVE_ADMIN_LOCK}))`);
  }
}

export async function assertCurrentTeamActor(tx: Prisma.TransactionClient, actor: AuthenticatedUser) {
  // A separate statement after the lock sees a revocation that committed while
  // this request was waiting. The caller uses READ COMMITTED, never a stale snapshot.
  const current = await tx.user.findUnique({ where: { id: actor.id }, select: {
    status: true, authVersion: true, isSystemAdmin: true,
    userRoles: { where: { role: { status: 'ACTIVE' } }, take: 32,
      select: { role: { select: { code: true, rolePermissions: { take: 64, select: { permissionCode: true } } } } } },
  } });
  if (!current || current.status !== 'ACTIVE' || current.authVersion !== actor.authVersion ||
      current.isSystemAdmin !== actor.isSystemAdmin) {
    throw new ForbiddenException('登录或人员授权已变化，请重新登录。');
  }
  const roles = new Set(current.userRoles.map(row => row.role.code));
  const permissions = new Set(current.userRoles.flatMap(row => row.role.rolePermissions.map(item => item.permissionCode)));
  if (actor.roleCodes.some(role => !roles.has(role)) || (actor.permissionCodes ?? []).some(permission => !permissions.has(permission))) {
    throw new ForbiddenException('角色权限已变化，请重新登录。');
  }
}

export function withTeamWrite<T>(
  prisma: PrismaService,
  actor: AuthenticatedUser,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel },
): Promise<T> {
  return prisma.$transaction(async tx => {
    await lockTeamAuthorization(tx);
    await assertCurrentTeamActor(tx, actor);
    return operation(tx);
  }, { ...options, isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

export function assertTeamTaskOperator(
  task: { nodeCode: WorkflowNodeCode; assigneeUserId: string | null },
  actor: AuthenticatedUser,
) {
  if (!actor.roleCodes.includes(NODE_BUSINESS_ROLES[task.nodeCode])) {
    throw new ForbiddenException('当前人员不具备此工序的业务角色。');
  }
  if (task.assigneeUserId !== actor.id) {
    throw new ForbiddenException(task.assigneeUserId ? '此任务已由其他人员负责。' : '请先领取此角色的待办任务。');
  }
}

export function canOperateTeamTask(task: { nodeCode: WorkflowNodeCode; assigneeUserId: string | null }, actor: AuthenticatedUser) {
  return actor.roleCodes.includes(NODE_BUSINESS_ROLES[task.nodeCode]) && task.assigneeUserId === actor.id;
}

export async function assertTeamTaskById(tx: Prisma.TransactionClient, taskId: string, actor: AuthenticatedUser) {
  await tx.$queryRaw(Prisma.sql`SELECT id FROM workflow_tasks WHERE id = ${taskId} FOR UPDATE`);
  const task = await tx.workflowTask.findUnique({ where: { id: taskId },
    select: { nodeCode: true, assigneeUserId: true, isActive: true, status: true } });
  if (!task || !task.isActive || !['PENDING', 'READY', 'IN_PROGRESS', 'RETURNED'].includes(task.status)) {
    throw new ConflictException('任务已结束或已被新轮次替代，请刷新后重试。');
  }
  assertTeamTaskOperator(task, actor);
}

export function teamProjectScope(actor: AuthenticatedUser): Prisma.ProjectWhereInput {
  if (!actor.isSystemAdmin && !(actor.permissionCodes ?? []).includes('project.read')) {
    throw new ForbiddenException('请等待管理员分配项目访问角色。');
  }
  return {};
}

export type ProjectWriteScope = { projectId: string } | { taskId: string } | { monthlyTaskId: string };

/** Same-project writes serialize before any command, domain, task or project row lock.
 * This covers parallel-node fanout/rework and attachment rebinding while preserving
 * independent project throughput. Scanning and object-storage IO stay outside it.
 */
export async function lockProjectWrite(tx: Prisma.TransactionClient, projectId: string) {
  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${'team-project-write'}), hashtext(${projectId}))`);
}

export function withProjectWrite<T>(
  prisma: PrismaService, actor: AuthenticatedUser, scope: ProjectWriteScope,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel },
): Promise<T> {
  return withTeamWrite(prisma, actor, async tx => {
    const identity = 'projectId' in scope ? scope
      : 'taskId' in scope ? await tx.workflowTask.findUnique({ where: { id: scope.taskId }, select: { projectId: true } })
        : await tx.recurringTask.findUnique({ where: { id: scope.monthlyTaskId }, select: { projectId: true } });
    if (!identity) throw new ConflictException('任务不存在或已变化，请刷新后重试。');
    await lockProjectWrite(tx, identity.projectId);
    return operation(tx);
  }, options);
}

/** Internal scheduled maintenance uses the same ordering without impersonating a user. */
export function withSystemProjectWrite<T>(prisma: PrismaService, projectId: string, operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(async tx => {
    await lockTeamAuthorization(tx);
    await lockProjectWrite(tx, projectId);
    return operation(tx);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}
