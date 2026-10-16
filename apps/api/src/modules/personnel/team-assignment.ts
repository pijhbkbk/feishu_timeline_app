import { PERSON_PRESENTATION_SELECT, personPresentation } from '../persons/person-profile-read';
import { ConflictException } from '@nestjs/common';
import { Prisma, type WorkflowNodeCode, type WorkflowTask } from '@prisma/client';
import { BUSINESS_ROLE_CODES, NODE_BUSINESS_ROLES, type BusinessRoleCode } from './personnel.constants';

export const OPEN_MONTHLY_TASK_STATUSES = ['PENDING', 'IN_PROGRESS', 'OVERDUE'] as const;

export const OPEN_TEAM_TASK_STATUSES = ['PENDING', 'READY', 'IN_PROGRESS', 'RETURNED'] as const;

export function eligibleTeamUserWhere(roleCode: string): Prisma.UserWhereInput {
  return { status: 'ACTIVE', localCredential: { isNot: null },
    userRoles: { some: { role: { code: roleCode, status: 'ACTIVE' } } } };
}

export async function resolveTeamAssignment(tx: Prisma.TransactionClient, nodeCode: WorkflowNodeCode) {
  const requiredRoleCode = NODE_BUSINESS_ROLES[nodeCode];
  const candidates = await tx.user.findMany({ where: eligibleTeamUserWhere(requiredRoleCode),
    take: 2, orderBy: { id: 'asc' }, select: { id: true, name: true, departmentId: true, personProfile: { select: PERSON_PRESENTATION_SELECT } } });
  return { requiredRoleCode, assigneeUserId: candidates.length === 1 ? candidates[0]!.id : null,
    assigneeDepartmentId: candidates.length === 1 ? personPresentation(candidates[0]!).departmentId : null };
}

export async function notifyTeamTask(tx: Prisma.TransactionClient, taskId: string) {
  const task = await tx.workflowTask.findUniqueOrThrow({ where: { id: taskId }, select: {
    id: true, projectId: true, nodeCode: true, nodeName: true, assigneeUserId: true, assignmentEpoch: true,
  } });
  // The 17 parent is an aggregate, not an early reminder for twelve future months.
  if (task.nodeCode === 'VISUAL_COLOR_DIFFERENCE_REVIEW') return;
  const roleCode = NODE_BUSINESS_ROLES[task.nodeCode];
  const eligibleWhere = eligibleTeamUserWhere(roleCode);
  const where: Prisma.UserWhereInput = task.assigneeUserId ? { ...eligibleWhere, id: task.assigneeUserId } : eligibleWhere;
  if (await tx.user.count({ where }) > 1000) throw new ConflictException('此角色通知人数超过 1000 人，请核对团队目录后重试。');
  let cursor = '';
  while (true) {
    const recipients = await tx.user.findMany({ where: { AND: [where, { id: { gt: cursor } }] }, take: 100, orderBy: { id: 'asc' }, select: { id: true } });
    if (!recipients.length) break;
    await tx.notification.createMany({ data: recipients.map(user => ({
      userId: user.id, projectId: task.projectId, taskId: task.id, notificationType: 'TASK_ASSIGNED', reminderKind: 'ACTIVATE', assignmentEpoch: task.assignmentEpoch, stageTaskId: task.id,
      title: `${task.assigneeUserId ? '待办' : '可领取'}：${task.nodeName}`,
      content: task.assigneeUserId ? '任务已分配给你，请在我的工作中处理。' : '角色队列有新任务，领取后即可办理。',
      linkPath: `/projects/${task.projectId}/tasks/${task.id}`, sendChannel: 'IN_APP', sendStatus: 'SENT',
      dedupeKey: `ACTIVATE:ordinary:${task.id}:${user.id}`,
    })), skipDuplicates: true });
    await tx.notification.updateMany({ where: { sendChannel: 'IN_APP', dedupeKey: { in: recipients.map(user => `ACTIVATE:ordinary:${task.id}:${user.id}`) } },
      data: { assignmentEpoch: task.assignmentEpoch, stageTaskId: task.id } });
    cursor = recipients.at(-1)!.id;
  }
}

export async function recordTeamAssignment(tx: Prisma.TransactionClient, input: {
  task: Pick<WorkflowTask, 'id' | 'projectId' | 'nodeCode' | 'nodeName' | 'assigneeUserId' | 'assignmentEpoch'>;
  assigneeUserId: string | null; actorUserId: string | null; action: string; reason: string;
}) {
  const { task } = input;
  await tx.auditLog.create({ data: { actorUserId: input.actorUserId, projectId: task.projectId,
    targetType: 'WORKFLOW_TASK', targetId: task.id, action: input.action, nodeCode: task.nodeCode,
    beforeData: { assigneeUserId: task.assigneeUserId, assignmentEpoch: task.assignmentEpoch },
    afterData: { assigneeUserId: input.assigneeUserId, assignmentEpoch: task.assignmentEpoch + 1 },
    metadata: { reason: input.reason },
  } });
  await notifyTeamTask(tx, task.id);
}

/** Caller holds the exclusive authorization fence before changing qualifications.
 * Completed tasks and records are never touched. Valid existing claims stay put.
 * The finite limit fails the complete personnel transaction, never a partial revoke.
 */
export async function reconcileTeamAssignments(tx: Prisma.TransactionClient, input: {
  actorUserId: string | null; affectedUserId?: string; roleCodes: string[]; reason: string;
}) {
  const roleCodes = [...new Set(input.roleCodes.filter(code => BUSINESS_ROLE_CODES.includes(code)))];
  const workflowWhere: Prisma.WorkflowTaskWhereInput = {
    isActive: true, status: { in: [...OPEN_TEAM_TASK_STATUSES] },
    OR: [ { requiredRoleCode: { in: roleCodes }, assigneeUserId: null },
      ...(input.affectedUserId ? [{ assigneeUserId: input.affectedUserId }] : [{ OR: [{ requiredRoleCode: { in: roleCodes } }, { requiredRoleCode: null }] }]),
    ],
  };
  const recurringWhere: Prisma.RecurringTaskWhereInput = {
    status: { in: [...OPEN_MONTHLY_TASK_STATUSES] },
    OR: [ ...(roleCodes.includes('quality_engineer') ? [{ reviewerId: null }] : []),
      ...(input.affectedUserId ? [{ reviewerId: input.affectedUserId }] : [{ requiredRoleCode: 'quality_engineer' }]),
    ],
  };
  const count = await tx.workflowTask.count({ where: workflowWhere }) + await tx.recurringTask.count({ where: recurringWhere });
  if (count > 2000) throw new ConflictException('本次角色调整影响超过 2000 个未完成任务，请先安排受控的批量交接。');
  const candidateByRole = new Map<BusinessRoleCode, Awaited<ReturnType<typeof resolveTeamAssignment>>>();
  let workflowCount = 0;
  let cursor = '';
  while (true) {
    const tasks = await tx.workflowTask.findMany({ where: { AND: [workflowWhere, { id: { gt: cursor } }] },
      take: 100, orderBy: { id: 'asc' } });
    if (!tasks.length) break;
    for (const task of tasks) {
      const roleCode = NODE_BUSINESS_ROLES[task.nodeCode];
      const validOwner = task.assigneeUserId && await tx.user.findFirst({ where: { id: task.assigneeUserId, ...eligibleTeamUserWhere(roleCode) }, select: { id: true } });
      if (validOwner && task.requiredRoleCode === roleCode) continue;
      if (!candidateByRole.has(roleCode)) candidateByRole.set(roleCode, await resolveTeamAssignment(tx, task.nodeCode));
      const assignment = validOwner ? { requiredRoleCode: roleCode, assigneeUserId: task.assigneeUserId, assigneeDepartmentId: task.assigneeDepartmentId } : candidateByRole.get(roleCode)!;
      if (task.assigneeUserId === assignment.assigneeUserId && task.requiredRoleCode === roleCode) continue;
      await tx.workflowTask.update({ where: { id: task.id }, data: { ...assignment,
        assignmentEpoch: { increment: 1 }, ...(task.status === 'IN_PROGRESS' ? { status: 'READY' } : {}) } });
      await recordTeamAssignment(tx, { task, assigneeUserId: assignment.assigneeUserId, actorUserId: input.actorUserId,
        action: 'TEAM_TASK_REASSIGNED', reason: input.reason });
      workflowCount++;
    }
    cursor = tasks.at(-1)!.id;
  }
  let recurringCount = 0;
  cursor = '';
  while (true) {
    const tasks = await tx.recurringTask.findMany({ where: { AND: [recurringWhere, { id: { gt: cursor } }] },
      take: 100, orderBy: { id: 'asc' } });
    if (!tasks.length) break;
    for (const task of tasks) {
      const validOwner = task.reviewerId && await tx.user.findFirst({ where: { id: task.reviewerId, ...eligibleTeamUserWhere('quality_engineer') }, select: { id: true } });
      if (validOwner && task.requiredRoleCode === 'quality_engineer') continue;
      if (!candidateByRole.has('quality_engineer')) candidateByRole.set('quality_engineer', await resolveTeamAssignment(tx, 'VISUAL_COLOR_DIFFERENCE_REVIEW'));
      const reviewerId = validOwner ? task.reviewerId : candidateByRole.get('quality_engineer')!.assigneeUserId;
      if (task.reviewerId === reviewerId && task.requiredRoleCode === 'quality_engineer') continue;
      await tx.recurringTask.update({ where: { id: task.id }, data: { reviewerId, requiredRoleCode: 'quality_engineer',
        assignmentEpoch: { increment: 1 }, ...(task.status === 'IN_PROGRESS' ? { status: 'PENDING' } : {}) } });
      await tx.auditLog.create({ data: { actorUserId: input.actorUserId, projectId: task.projectId, targetType: 'WORKFLOW_TASK',
        targetId: task.id, nodeCode: 'VISUAL_COLOR_DIFFERENCE_REVIEW', action: 'TEAM_MONTHLY_TASK_REASSIGNED',
        beforeData: { reviewerId: task.reviewerId, assignmentEpoch: task.assignmentEpoch },
        afterData: { reviewerId, assignmentEpoch: task.assignmentEpoch + 1 }, metadata: { reason: input.reason, periodIndex: task.periodIndex } } });
      recurringCount++;
    }
    cursor = tasks.at(-1)!.id;
  }
  return { workflowCount, recurringCount };
}
