import { Prisma, type TaskReminderKind } from '@prisma/client';

export function shanghaiBusinessDay(now: Date) {
  const date = new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10);
  return { date, start: new Date(`${date}T00:00:00+08:00`), end: new Date(new Date(`${date}T00:00:00+08:00`).getTime() + 86400000) };
}

// All identifiers are fixed SQL fragments supplied by this module, never client strings.
export function reminderTaskEligibleSql(userId: Prisma.Sql, ordinaryId: Prisma.Sql, monthlyId: Prisma.Sql, epoch: Prisma.Sql, stage: Prisma.Sql, now: Date) {
  return Prisma.sql`(
    EXISTS (SELECT 1 FROM workflow_tasks t JOIN users u ON u.id = ${userId}
      JOIN local_credentials lc ON lc."userId" = u.id
      JOIN user_roles ur ON ur."userId" = u.id JOIN roles r ON r.id = ur."roleId"
      WHERE t.id = ${ordinaryId} AND t.id = ${stage} AND t."assignmentEpoch" = ${epoch}
      AND t."isActive" AND t.status IN ('PENDING','READY','IN_PROGRESS','RETURNED')
      AND t."nodeCode" <> 'VISUAL_COLOR_DIFFERENCE_REVIEW'
      AND (t."assigneeUserId" IS NULL OR t."assigneeUserId" = u.id)
      AND u.status = 'ACTIVE' AND r.status = 'ACTIVE' AND r.code = t."requiredRoleCode")
    OR EXISTS (SELECT 1 FROM recurring_tasks t JOIN recurring_plans p ON p.id = t."recurringPlanId"
      JOIN workflow_tasks parent ON parent.id = ${stage} AND parent."projectId" = t."projectId"
      JOIN users u ON u.id = ${userId} JOIN local_credentials lc ON lc."userId" = u.id
      JOIN user_roles ur ON ur."userId" = u.id JOIN roles r ON r.id = ur."roleId"
      WHERE t.id = ${monthlyId} AND t."assignmentEpoch" = ${epoch} AND t."plannedDate" <= ${now}
      AND t.status IN ('PENDING','IN_PROGRESS','OVERDUE') AND (t."reviewerId" IS NULL OR t."reviewerId" = u.id)
      AND u.status = 'ACTIVE' AND r.status = 'ACTIVE' AND r.code = 'quality_engineer'
      AND p.status = 'ACTIVE' AND p.frequency = 'MONTHLY' AND p."totalCount" = 12 AND p."projectId" = t."projectId" AND p."sourceNodeCode" = 'VISUAL_COLOR_DIFFERENCE_REVIEW'
      AND parent."isActive" AND parent.status IN ('PENDING','READY','IN_PROGRESS','RETURNED') AND parent."nodeCode" = 'VISUAL_COLOR_DIFFERENCE_REVIEW'
      AND (SELECT count(*) FROM workflow_tasks active_parent WHERE active_parent."projectId" = t."projectId" AND active_parent."isActive" AND active_parent.status IN ('PENDING','READY','IN_PROGRESS','RETURNED') AND active_parent."nodeCode" = 'VISUAL_COLOR_DIFFERENCE_REVIEW') = 1
      AND (SELECT count(*) FROM recurring_plans other WHERE other."projectId" = t."projectId" AND other."sourceNodeCode" = 'VISUAL_COLOR_DIFFERENCE_REVIEW') = 1
      AND (SELECT count(*) FROM recurring_tasks months WHERE months."recurringPlanId" = p.id) = 12
      AND NOT EXISTS (SELECT 1 FROM recurring_tasks bad WHERE bad."recurringPlanId" = p.id AND (bad."projectId" <> p."projectId" OR bad."periodIndex" NOT BETWEEN 1 AND 12))))`;
}

export function visibleNotificationSql(now = new Date()) {
  const direct = reminderTaskEligibleSql(Prisma.sql`n."userId"`, Prisma.sql`n."taskId"`, Prisma.sql`n."recurringTaskId"`, Prisma.sql`n."assignmentEpoch"`, Prisma.sql`n."stageTaskId"`, now);
  const digest = visibleDigestItemSql(now);
  const due = taskDueSql(Prisma.sql`n."taskId"`, Prisma.sql`n."recurringTaskId"`);
  return Prisma.sql`(n."reminderKind" IS NULL OR (n."reminderKind" IN ('ACTIVATE','DUE_SOON') AND ${direct} AND (n."reminderKind" = 'ACTIVATE' OR (${due} >= ${now} AND ${due} < ${shanghaiBusinessDay(now).end})))
    OR (n."reminderKind" = 'OVERDUE_DAY' AND EXISTS (SELECT 1 FROM notification_digest_items d WHERE d."notificationId" = n.id AND ${digest})))`;
}

export function visibleDigestItemSql(now = new Date()) {
  const eligible = reminderTaskEligibleSql(Prisma.sql`n."userId"`, Prisma.sql`d."workflowTaskId"`, Prisma.sql`d."recurringTaskId"`, Prisma.sql`d."assignmentEpoch"`, Prisma.sql`d."stageTaskId"`, now);
  return Prisma.sql`(${eligible} AND ${taskDueSql(Prisma.sql`d."workflowTaskId"`, Prisma.sql`d."recurringTaskId"`)} < ${now})`;
}

function taskDueSql(ordinaryId: Prisma.Sql, monthlyId: Prisma.Sql) {
  return Prisma.sql`COALESCE((SELECT COALESCE(t."effectiveDueAt",t."dueAt") FROM workflow_tasks t WHERE t.id = ${ordinaryId}), (SELECT m."dueAt" FROM recurring_tasks m WHERE m.id = ${monthlyId}))`;
}

export type ReminderTarget = { kind: 'ordinary' | 'monthly'; id: string; projectId: string; stageTaskId: string; epoch: number; roleCode: string; ownerId: string | null; title: string; dueAt: Date | null };

export function reminderKey(kind: TaskReminderKind, target: ReminderTarget, userId: string, now: Date) {
  return kind === 'OVERDUE_DAY' ? `OVERDUE_DAY:${userId}:${shanghaiBusinessDay(now).date}` : `${kind}:${target.kind}:${target.id}:${userId}`;
}

/** Caller already holds the qualification fence and this target's project lock.
 * This operation never acquires another project lock; one daily header is locked at a time.
 */
export async function persistTaskReminder(tx: Prisma.TransactionClient, target: ReminderTarget, userId: string, kind: 'ACTIVATE' | 'DUE_SOON' | 'OVERDUE_DAY', now: Date) {
  const dedupeKey = reminderKey(kind, target, userId, now);
  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${'task-reminder-header'}), hashtext(${dedupeKey}))`);
  const shared = kind === 'OVERDUE_DAY';
  const binding = { assignmentEpoch: target.epoch, stageTaskId: target.stageTaskId, recurringTaskId: target.kind === 'monthly' ? target.id : null };
  await tx.notification.createMany({ data: [{
    userId, projectId: shared ? null : target.projectId, taskId: !shared && target.kind === 'ordinary' ? target.id : null,
    notificationType: shared ? 'TASK_OVERDUE' : kind === 'ACTIVATE' ? 'TASK_ASSIGNED' : 'SYSTEM_INFO',
    reminderKind: kind, businessDate: shared ? shanghaiBusinessDay(now).date : null,
    title: shared ? `${shanghaiBusinessDay(now).date} 逾期工作汇总` : `${kind === 'ACTIVATE' ? target.ownerId ? '待办' : '可领取' : '今日到期'}：${target.title}`,
    content: shared ? '查看仍需你处理的逾期工作。' : '打开工作单查看详情并办理。',
    linkPath: shared ? '/notifications' : target.kind === 'monthly' ? `/projects/${target.projectId}/color-evaluation?recurringTaskId=${target.id}` : `/projects/${target.projectId}/tasks/${target.id}`,
    dedupeKey, sendChannel: 'IN_APP', sendStatus: 'SENT', ...(!shared ? binding : {}),
  }], skipDuplicates: true });
  const notification = await tx.notification.findUniqueOrThrow({ where: { sendChannel_dedupeKey: { sendChannel: 'IN_APP', dedupeKey } }, select: { id: true } });
  if (!shared) {
    // Rebind when the same immutable task returns to this recipient, preserving its read state and creation time.
    await tx.notification.updateMany({ where: { id: notification.id }, data: binding });
  } else {
    await tx.notificationDigestItem.upsert({ where: { notificationId_taskKey: { notificationId: notification.id, taskKey: `${target.kind}:${target.id}` } },
      create: { notificationId: notification.id, taskKey: `${target.kind}:${target.id}`, projectId: target.projectId,
        workflowTaskId: target.kind === 'ordinary' ? target.id : null, recurringTaskId: target.kind === 'monthly' ? target.id : null,
        stageTaskId: target.stageTaskId, assignmentEpoch: target.epoch },
      update: { stageTaskId: target.stageTaskId, assignmentEpoch: target.epoch },
    });
  }
  return notification.id;
}
