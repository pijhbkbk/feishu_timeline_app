import { Injectable, ConflictException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { withSystemProjectWrite } from '../../common/team-authorization';
import { requireActiveMonthlyPlan } from '../../common/monthly-review-plan';
import { eligibleTeamUserWhere, OPEN_TEAM_TASK_STATUSES, OPEN_MONTHLY_TASK_STATUSES } from '../personnel/team-assignment';
import { NODE_BUSINESS_ROLES } from '../personnel/personnel.constants';
import { persistTaskReminder, shanghaiBusinessDay, type ReminderTarget } from './task-reminder.rules';

type Cursor = { afterTask: string; currentTask: string | null; afterUser: string };
const initialCursor = (): Cursor => ({ afterTask: '', currentTask: null, afterUser: '' });

@Injectable()
export class TaskRemindersService {
  constructor(private readonly prisma: PrismaService) {}

  /** A durable lease is acquired separately from business transactions. A crash replays
   * at most the last recipient; immutable keys and item uniqueness make that harmless.
   */
  async scan(kind: 'ordinary' | 'monthly', now = new Date()) {
    const name = `team-reminders:${kind}`; const token = randomUUID();
    await this.prisma.reminderScanState.createMany({ data: [{ name }], skipDuplicates: true });
    const lease = await this.prisma.reminderScanState.updateMany({ where: { name, OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }] }, data: { leaseToken: token, leaseUntil: new Date(Date.now() + 60000) } });
    if (!lease.count) return { scanned: 0, enqueued: 0, hasMore: false, skipped: true, markedOverdue: 0 };
    let cursor: Cursor = initialCursor();
    let scanned = 0; let recipients = 0; let markedOverdue = 0;
    const checkpoint = async () => {
      const result = await this.prisma.reminderScanState.updateMany({ where: { name, leaseToken: token }, data: { cursor: JSON.stringify(cursor), leaseUntil: new Date(Date.now() + 60000) } });
      return result.count === 1;
    };
    try {
      const saved = await this.prisma.reminderScanState.findUniqueOrThrow({ where: { name } });
      cursor = saved.cursor ? JSON.parse(saved.cursor) as Cursor : initialCursor();
      if (typeof cursor?.afterTask !== 'string' || typeof cursor?.afterUser !== 'string' ||
          !(cursor?.currentTask === null || typeof cursor?.currentTask === 'string')) throw new Error('Invalid reminder scan cursor');
      while (scanned < 50 && recipients < 500) {
        const candidate = kind === 'ordinary' ? await this.prisma.workflowTask.findFirst({
          where: cursor.currentTask ? { id: cursor.currentTask } : { id: { gt: cursor.afterTask }, isActive: true, status: { in: [...OPEN_TEAM_TASK_STATUSES] }, nodeCode: { not: 'VISUAL_COLOR_DIFFERENCE_REVIEW' } },
          select: { id: true, projectId: true }, orderBy: { id: 'asc' },
        }) : await this.prisma.recurringTask.findFirst({
          where: cursor.currentTask ? { id: cursor.currentTask } : { id: { gt: cursor.afterTask }, status: { in: [...OPEN_MONTHLY_TASK_STATUSES] }, plannedDate: { lte: now } },
          select: { id: true, projectId: true }, orderBy: { id: 'asc' },
        });
        if (!candidate) {
          if (cursor.currentTask) cursor = { afterTask: cursor.currentTask, currentTask: null, afterUser: '' };
          else { cursor = initialCursor(); await checkpoint(); return { scanned, enqueued: recipients, skipped: false, hasMore: false, markedOverdue }; }
          if (!await checkpoint()) break;
          continue;
        }
        cursor.currentTask = candidate.id;
        const take = Math.min(100, 500 - recipients);
        const page = await withSystemProjectWrite(this.prisma, candidate.projectId, async tx => {
          const target = await this.target(tx, kind, candidate.id, now);
          if (!target) return [];
          if (target.kind === 'monthly' && target.dueAt && target.dueAt < now) {
            const updated = await tx.recurringTask.updateMany({ where: { id: target.id, assignmentEpoch: target.epoch,
              status: { in: ['PENDING', 'IN_PROGRESS'] }, dueAt: { lt: now } }, data: { status: 'OVERDUE' } });
            markedOverdue += updated.count;
          }
          return tx.user.findMany({ where: { ...eligibleTeamUserWhere(target.roleCode), AND: [{ id: { gt: cursor.afterUser } }, ...(target.ownerId ? [{ id: target.ownerId }] : [])] }, select: { id: true }, orderBy: { id: 'asc' }, take: take + 1 });
        });
        for (const user of page.slice(0, take)) {
          await withSystemProjectWrite(this.prisma, candidate.projectId, async tx => {
            const target = await this.target(tx, kind, candidate.id, now);
            if (!target || (target.ownerId && target.ownerId !== user.id) || !await tx.user.findFirst({ where: { id: user.id, ...eligibleTeamUserWhere(target.roleCode) }, select: { id: true } })) return;
            await persistTaskReminder(tx, target, user.id, 'ACTIVATE', now);
            if (target.dueAt && target.dueAt < now) await persistTaskReminder(tx, target, user.id, 'OVERDUE_DAY', now);
            else if (target.dueAt && target.dueAt < shanghaiBusinessDay(now).end) await persistTaskReminder(tx, target, user.id, 'DUE_SOON', now);
          });
          recipients++; cursor.afterUser = user.id;
          if (!await checkpoint()) return { scanned, enqueued: recipients, skipped: false, hasMore: true, markedOverdue };
        }
        if (page.length <= take) { cursor = { afterTask: candidate.id, currentTask: null, afterUser: '' }; scanned++; if (!await checkpoint()) break; }
      }
      return { scanned, enqueued: recipients, skipped: false, hasMore: true, markedOverdue };
    } finally {
      await this.prisma.reminderScanState.updateMany({ where: { name, leaseToken: token }, data: { leaseToken: null, leaseUntil: null } });
    }
  }

  async target(tx: Prisma.TransactionClient, kind: 'ordinary' | 'monthly', id: string, now: Date): Promise<ReminderTarget | null> {
    if (kind === 'ordinary') {
      const task = await tx.workflowTask.findUnique({ where: { id } });
      if (!task || !task.isActive || !OPEN_TEAM_TASK_STATUSES.includes(task.status as typeof OPEN_TEAM_TASK_STATUSES[number]) || task.nodeCode === 'VISUAL_COLOR_DIFFERENCE_REVIEW') return null;
      return { kind, id, projectId: task.projectId, stageTaskId: task.id, epoch: task.assignmentEpoch, roleCode: NODE_BUSINESS_ROLES[task.nodeCode], ownerId: task.assigneeUserId, title: task.nodeName, dueAt: task.effectiveDueAt ?? task.dueAt };
    }
    const task = await tx.recurringTask.findUnique({ where: { id } });
    if (!task || task.plannedDate > now || !OPEN_MONTHLY_TASK_STATUSES.includes(task.status as typeof OPEN_MONTHLY_TASK_STATUSES[number])) return null;
    const parents = await tx.workflowTask.findMany({ where: { projectId: task.projectId, nodeCode: 'VISUAL_COLOR_DIFFERENCE_REVIEW', isActive: true, status: { in: [...OPEN_TEAM_TASK_STATUSES] } }, select: { id: true }, take: 2 });
    if (parents.length !== 1) return null;
    try { await requireActiveMonthlyPlan(tx, task.projectId, task.recurringPlanId); }
    catch (e) { if (e instanceof ConflictException) return null; throw e; }
    return { kind, id, projectId: task.projectId, stageTaskId: parents[0]!.id, epoch: task.assignmentEpoch, roleCode: 'quality_engineer', ownerId: task.reviewerId, title: `第 ${task.periodIndex} 月目视色差评审`, dueAt: task.dueAt };
  }
}
