import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { PrismaClient, type RecurringTask } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withSystemProjectWrite } from '../../common/team-authorization';
import type { BusinessClock } from '../../common/business-clock';
import type { AuthenticatedUser } from '../auth/auth.types';
import { notifyTeamTask } from '../personnel/team-assignment';
import { NotificationsService } from './notifications.service';
import { TaskRemindersService } from './task-reminders.service';

const url = process.env.TEAM_REMINDERS_TEST_DATABASE_URL;
describe.skipIf(!url).sequential('A01/A13 approved-member reminders on owned PostgreSQL', () => {
  const db = new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
  const run = randomUUID().slice(0, 16);
  const prefix = `zzzzzz-team-reminder-${run}`;
  let now = new Date('2026-10-20T04:00:00Z');
  const clock = { now: () => now } as BusinessClock;
  // Other suites' retained fixtures share this owned database. These additional
  // AND predicates restrict traversal to this run, while PostgreSQL still
  // evaluates the complete production qualification/owner/cursor predicates.
  const scopedDb = db.$extends({ query: {
    user: { findMany: ({ args, query }) => query({ ...args, where: { AND: [args.where ?? {}, { id: { in: [...members, ...excluded] } }] } }) },
    workflowTask: { findFirst: ({ args, query }) => query({ ...args, where: { AND: [args.where ?? {}, { id: { startsWith: prefix } }] } }) },
    recurringTask: { findFirst: ({ args, query }) => query({ ...args, where: { AND: [args.where ?? {}, { id: { startsWith: prefix } }] } }) },
  } });
  const scanner = new TaskRemindersService(scopedDb as never, clock);
  const notices = new NotificationsService(db as never, { create: async () => ({}) } as never, {} as never, clock);
  const due = new Date('2027-02-28T15:59:59.999Z');
  let projectId: string; let instanceId: string; let taskId: string;
  let members: string[]; let excluded: string[];
  const actor = (id: string) => ({ id } as AuthenticatedUser);
  const visible = async (id: string) => (await notices.getMyNotifications({ pageSize: '100' }, actor(id))).items;
  const cards = (id: string) => db.notification.findMany({ where: { userId: id, taskId }, orderBy: { id: 'asc' } });
  const scan = async (kind: 'ordinary' | 'monthly' = 'ordinary') => {
    // The dedicated database also retains previous A13/A12 fixtures. Start at
    // this test's exact prefix; never reset or delete their tasks or history.
    await db.reminderScanState.upsert({ where: { name: `team-reminders:${kind}` },
      create: { name: `team-reminders:${kind}`, cursor: JSON.stringify({ afterTask: prefix, currentTask: null, afterUser: '' }) },
      update: { cursor: JSON.stringify({ afterTask: prefix, currentTask: null, afterUser: '' }), leaseToken: null, leaseUntil: null } });
    for (let page = 0; page < 20; page++) {
      const result = await scanner.scan(kind);
      if (!result.hasMore) return;
    }
    throw new Error('Synthetic reminder scan exceeded its bounded page budget.');
  };
  beforeAll(async () => {
    const target = new URL(url!);
    if (target.hostname !== '127.0.0.1' || target.port !== '55461' || target.pathname !== '/v1_performance_20261020') {
      throw new Error('Only the owned A13 synthetic database is allowed.');
    }
    const role = await db.role.findUniqueOrThrow({ where: { code: 'quality_engineer' } });
    members = []; excluded = [];
    for (const kind of ['member-a', 'member-b', 'unapproved-role', 'inactive', 'no-account']) {
      const name = `team-reminder-${run}-${kind}`;
      const user = await db.user.create({ data: {
        username: name, name: `合成提醒 ${kind}`, teamAccessApproved: kind !== 'unapproved-role',
        status: kind === 'inactive' ? 'INACTIVE' : 'ACTIVE',
        ...(kind === 'no-account' ? {} : { localCredential: { create: { loginName: name, passwordHash: 'synthetic-not-a-login-hash' } } }),
        ...(kind === 'unapproved-role' ? { userRoles: { create: { roleId: role.id } } } : {}),
      } });
      (kind.startsWith('member-') ? members : excluded).push(user.id);
    }
    expect(await db.userRole.count({ where: { userId: { in: members } } })).toBe(0);
    projectId = (await db.project.create({ data: { code: `TEAM-REM-${run}`, name: '合成共同维护提醒' } })).id;
    instanceId = (await db.workflowInstance.create({ data: { projectId, instanceNo: `TEAM-REM-${run}` } })).id;
    taskId = (await db.workflowTask.create({ data: {
      id: `${prefix}-ordinary`, projectId, workflowInstanceId: instanceId, taskNo: `TEAM-REM-${run}`,
      nodeCode: 'PERFORMANCE_TEST', nodeName: '合成首到货半年性能反馈', requiredRoleCode: 'quality_engineer',
      status: 'READY', dueAt: due, assigneeUserId: null,
    } })).id;
  });
  afterAll(async () => { await db.$disconnect(); });

  it('immediately notifies both approved roles-empty members, not a role-only or inactive/contact identity', async () => {
    await withSystemProjectWrite(db as never, projectId, tx => notifyTeamTask(tx, taskId));
    const recipients = await db.notification.findMany({ where: { taskId, userId: { in: [...members, ...excluded] } }, select: { userId: true, title: true, content: true } });
    expect(recipients.map(row => row.userId).sort()).toEqual([...members].sort());
    for (const row of recipients) {
      expect(row.title).not.toContain('领取');
      expect(row.content).not.toContain('领取');
    }
    for (const id of members) expect((await visible(id)).some(item => item.taskId === taskId)).toBe(true);
    for (const id of excluded) expect((await visible(id)).some(item => item.taskId === taskId)).toBe(false);
  });

  it('replays future activation without a due/overdue card or resetting read history', async () => {
    const original = await db.notification.findFirstOrThrow({ where: { userId: members[0]!, taskId, reminderKind: 'ACTIVATE' } });
    await db.notification.update({ where: { id: original.id }, data: { isRead: true, readAt: now } });
    await scan(); await scan();
    for (const id of members) expect((await cards(id)).map(item => item.reminderKind)).toEqual(['ACTIVATE']);
    const reloaded = await db.notification.findUniqueOrThrow({ where: { id: original.id } });
    expect(reloaded).toMatchObject({ isRead: true, readAt: now, createdAt: original.createdAt });
    expect(await db.notification.count({ where: { userId: { in: excluded }, taskId } })).toBe(0);
  });

  it('uses the stored Shanghai deadline exactly and deduplicates daily overdue items', async () => {
    now = due;
    await scan(); await scan();
    for (const id of members) {
      expect((await cards(id)).map(item => item.reminderKind).sort()).toEqual(['ACTIVATE', 'DUE_SOON']);
      expect(await db.notification.count({ where: { userId: id, reminderKind: 'OVERDUE_DAY' } })).toBe(0);
    }
    now = new Date(due.getTime() + 1);
    await scan(); await scan();
    for (const id of members) {
      const digest = await db.notification.findMany({ where: { userId: id, reminderKind: 'OVERDUE_DAY' } });
      expect(digest).toHaveLength(1);
      expect(digest[0]!.businessDate).toBe('2027-03-01');
      const items = (await notices.getDigestItems(digest[0]!.id, undefined, actor(id))).items;
      expect(items.filter(item => item.taskId === taskId)).toHaveLength(1);
      expect((await visible(id)).filter(item => item.taskId === taskId).map(item => item.reminderKind)).toEqual(['ACTIVATE']);
      await expect(notices.getDigestItems(digest[0]!.id, undefined, actor(excluded[0]!))).rejects.toMatchObject({ status: 404 });
    }
    now = new Date('2027-03-01T16:00:00Z');
    await scan(); await scan();
    for (const id of members) expect((await db.notification.findMany({ where: { userId: id, reminderKind: 'OVERDUE_DAY' }, orderBy: { businessDate: 'asc' } })).map(item => item.businessDate)).toEqual(['2027-03-01', '2027-03-02']);
    expect(await db.notification.count({ where: { userId: { in: excluded }, reminderKind: { not: null } } })).toBe(0);
  }, 30000);

  it('preserves current-owner and epoch visibility, qualification revocation, and raw history', async () => {
    const before = await cards(members[1]!);
    await db.workflowTask.update({ where: { id: taskId }, data: { assigneeUserId: members[0]!, assignmentEpoch: { increment: 1 } } });
    for (const id of members) expect((await visible(id)).some(item => item.taskId === taskId)).toBe(false);
    await scan();
    expect((await visible(members[0]!)).some(item => item.taskId === taskId)).toBe(true);
    expect((await visible(members[1]!)).some(item => item.taskId === taskId)).toBe(false);
    expect(await cards(members[1]!)).toEqual(before);
    for (const data of [{ teamAccessApproved: false }, { teamAccessApproved: true, status: 'INACTIVE' as const }]) {
      await db.user.update({ where: { id: members[0]! }, data });
      const retained = await cards(members[0]!);
      await scan();
      expect((await visible(members[0]!)).some(item => item.taskId === taskId)).toBe(false);
      expect((await notices.getUnreadCount(actor(members[0]!))).unreadCount).toBe(0);
      expect(await cards(members[0]!)).toEqual(retained);
      const digest = await db.notification.findFirstOrThrow({ where: { userId: members[0]!, reminderKind: 'OVERDUE_DAY' } });
      expect((await notices.getDigestItems(digest.id, undefined, actor(members[0]!))).items).toEqual([]);
    }
    await db.user.update({ where: { id: members[0]! }, data: { teamAccessApproved: true, status: 'ACTIVE' } });
    await db.workflowTask.update({ where: { id: taskId }, data: { status: 'COMPLETED', isActive: false } });
    await scan();
    expect((await visible(members[0]!)).some(item => item.taskId === taskId)).toBe(false);
    expect(await db.notification.count({ where: { userId: members[0]!, taskId } })).toBe(2);
  });

  it('applies the same qualification to explicit historical monthly facts without inventing empty-month reminders', async () => {
    const parent = await db.workflowTask.create({ data: { id: `${prefix}-parent`, projectId, workflowInstanceId: instanceId,
      taskNo: `TEAM-PARENT-${run}`, nodeCode: 'VISUAL_COLOR_DIFFERENCE_REVIEW', nodeName: '合成历史评审', status: 'READY' } });
    const plan = await db.recurringPlan.create({ data: { projectId, sourceNodeCode: 'VISUAL_COLOR_DIFFERENCE_REVIEW',
      planCode: `TEAM-PLAN-${run}`, startDate: new Date('2026-01-01'), endDate: new Date('2027-01-01'),
      frequency: 'MONTHLY', totalCount: 12, generatedCount: 12, status: 'ACTIVE' } });
    const months: RecurringTask[] = [];
    for (let i = 0; i < 12; i++) months.push(await db.recurringTask.create({ data: {
      id: `${prefix}-month-${String(i).padStart(2, '0')}`, recurringPlanId: plan.id, projectId, taskCode: `TEAM-MONTH-${run}-${i}`,
      periodIndex: i + 1, periodLabel: `${i + 1}`, plannedDate: new Date(Date.UTC(2026, i, 1)),
      dueAt: new Date(Date.UTC(2026, i + 1, 1)), requiredRoleCode: 'quality_engineer',
    } }));
    const review = await db.reviewRecord.create({ data: { projectId, workflowTaskId: parent.id, reviewType: 'VISUAL_COLOR_DIFFERENCE_REVIEW',
      reviewedAt: months[0]!.plannedDate, reviewPeriod: months[0]!.plannedDate.toISOString().slice(0, 7) } });
    await db.auditLog.create({ data: { projectId, targetType: 'REVIEW_RECORD', targetId: review.id, action: 'VISUAL_DELTA_REVIEW_CREATED',
      metadata: { recurringTaskId: months[0]!.id, reviewPeriod: months[0]!.plannedDate.toISOString().slice(0, 7) } } });
    await scan('monthly'); await scan('monthly');
    for (const id of members) {
      const monthly = (await visible(id)).filter(item => item.linkPath?.includes(`recurringTaskId=${months[0]!.id}`));
      expect(monthly).toHaveLength(1);
      expect(monthly[0]!.reminderKind).toBe('ACTIVATE');
    }
    expect(await db.notification.count({ where: { recurringTaskId: { in: months.slice(1).map(month => month.id) } } })).toBe(0);
    expect(await db.notification.count({ where: { userId: { in: excluded }, recurringTaskId: months[0]!.id } })).toBe(0);
    await db.recurringTask.update({ where: { id: months[0]!.id }, data: { reviewerId: members[0]!, assignmentEpoch: { increment: 1 } } });
    await scan('monthly');
    expect((await visible(members[1]!)).some(item => item.linkPath?.includes(`recurringTaskId=${months[0]!.id}`))).toBe(false);
    await db.recurringPlan.update({ where: { id: plan.id }, data: { totalCount: 11 } });
    expect((await visible(members[0]!)).some(item => item.linkPath?.includes(`recurringTaskId=${months[0]!.id}`))).toBe(false);
    expect(await db.notification.count({ where: { recurringTaskId: months[0]!.id, userId: { in: members } } })).toBe(2);
  }, 30000);
});
