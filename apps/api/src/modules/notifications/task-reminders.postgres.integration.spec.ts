import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withSystemProjectWrite } from '../../common/team-authorization';
import { TaskRemindersService } from './task-reminders.service';
import { NotificationsService } from './notifications.service';
import { persistTaskReminder, shanghaiBusinessDay, type ReminderTarget } from './task-reminder.rules';
import type { AuthenticatedUser } from '../auth/auth.types';

const url = process.env.R28_TEST_DATABASE_URL;
const run = randomUUID().slice(0, 8);
describe.skipIf(!url).sequential('role reminders on real isolated PostgreSQL', () => {
  const db = new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
  const scanner = new TaskRemindersService(db as never);
  const notices = new NotificationsService(db as never, { create: async () => ({}) } as never, {} as never);
  const now = new Date();
  let userId: string; let otherId: string; let actor: AuthenticatedUser;
  let projectId: string; let project2: string; let instanceId: string; let instance2: string;
  let task1: ReminderTarget; let task2: ReminderTarget;
  const remind = (task: ReminderTarget, kind: 'ACTIVATE' | 'DUE_SOON' | 'OVERDUE_DAY', recipient = userId) => withSystemProjectWrite(db as never, task.projectId, tx => persistTaskReminder(tx, task, recipient, kind, now));
  const resolve = (kind: 'ordinary' | 'monthly', id: string, project: string) => withSystemProjectWrite(db as never, project, tx => scanner.target(tx, kind, id, now));
  beforeAll(async () => {
    const parsed = new URL(url!);
    if (parsed.hostname !== '127.0.0.1' || parsed.port !== '55449' || parsed.pathname !== '/r28_reminders') throw new Error('Only r28_reminders on isolated loopback is allowed.');
    const role = await db.role.upsert({ where: { code: 'quality_engineer' }, create: { code: 'quality_engineer', name: '质量试验' }, update: { status: 'ACTIVE' } });
    for (const name of ['one', 'two']) {
      const username = `r28-reminder-${run}-${name}`;
      const user = await db.user.create({ data: { username, name: '合成提醒人员', localCredential: { create: { loginName: username, passwordHash: 'synthetic-not-login' } }, userRoles: { create: { roleId: role.id } } } });
      if (name === 'one') userId = user.id; else otherId = user.id;
    }
    actor = { id: userId } as AuthenticatedUser;
    projectId = (await db.project.create({ data: { code: `REM-${run}-1`, name: '合成项目甲' } })).id;
    project2 = (await db.project.create({ data: { code: `REM-${run}-2`, name: '合成项目乙' } })).id;
    instanceId = (await db.workflowInstance.create({ data: { projectId, instanceNo: `REM-${run}-1` } })).id;
    instance2 = (await db.workflowInstance.create({ data: { projectId: project2, instanceNo: `REM-${run}-2` } })).id;
    for (const [project, instance, index] of [[projectId, instanceId, '1'], [project2, instance2, '2']]) {
      const task = await db.workflowTask.create({ data: { id: `zz-${run}-${index}`, projectId: project!, workflowInstanceId: instance!, taskNo: `REM-${run}-${index}`, nodeCode: 'PERFORMANCE_TEST', nodeName: '合成性能试验', requiredRoleCode: 'quality_engineer', assigneeUserId: userId, status: 'READY', dueAt: new Date(now.getTime() - 86400000) } });
      const target = (await resolve('ordinary', task.id, project!))!;
      if (index === '1') task1 = target; else task2 = target;
    }
  });
  afterAll(async () => { await db.$disconnect(); });

  it('serializes cross-project daily cards and keeps item uniqueness and read state', async () => {
    await Promise.all([remind(task1, 'OVERDUE_DAY'), remind(task2, 'OVERDUE_DAY'), remind(task1, 'OVERDUE_DAY')]);
    const cards = await db.notification.findMany({ where: { userId, reminderKind: 'OVERDUE_DAY' } });
    expect(cards).toHaveLength(1);
    expect(await db.notificationDigestItem.count({ where: { notificationId: cards[0]!.id } })).toBe(2);
    const readAt = new Date(); await db.notification.update({ where: { id: cards[0]!.id }, data: { isRead: true, readAt } });
    await remind(task1, 'OVERDUE_DAY');
    const reloaded = await db.notification.findUniqueOrThrow({ where: { id: cards[0]!.id } });
    expect(reloaded.readAt).toEqual(readAt); expect(reloaded.createdAt).toEqual(cards[0]!.createdAt);
    expect((await notices.getDigestItems(cards[0]!.id, undefined, actor)).items).toHaveLength(2);
    await expect(notices.getDigestItems(cards[0]!.id, undefined, { id: otherId } as AuthenticatedUser)).rejects.toMatchObject({ status: 404 });
  });

  it('deduplicates activation across assignment epochs and rejects stale ownership in reads', async () => {
    const original = await remind(task1, 'ACTIVATE');
    await db.notification.update({ where: { id: original }, data: { isRead: true, readAt: now } });
    await db.workflowTask.update({ where: { id: task1.id }, data: { assigneeUserId: otherId, assignmentEpoch: { increment: 1 } } });
    expect((await notices.getMyNotifications({}, actor)).items.some(item => item.id === original)).toBe(false);
    await db.workflowTask.update({ where: { id: task1.id }, data: { assigneeUserId: userId, assignmentEpoch: { increment: 1 } } });
    task1 = (await resolve('ordinary', task1.id, projectId))!;
    expect(await remind(task1, 'ACTIVATE')).toBe(original);
    const saved = await db.notification.findUniqueOrThrow({ where: { id: original } });
    expect(saved.readAt).toEqual(now); expect(saved.isRead).toBe(true);
    expect((await notices.getMyNotifications({}, actor)).items.some(item => item.id === original)).toBe(true);
  });

  it('hides only the affected digest item on deadline extension or role removal', async () => {
    const card = await db.notification.findFirstOrThrow({ where: { userId, reminderKind: 'OVERDUE_DAY' } });
    await remind(task1, 'OVERDUE_DAY');
    await db.workflowTask.update({ where: { id: task1.id }, data: { effectiveDueAt: new Date(now.getTime() + 86400000) } });
    const items = (await notices.getDigestItems(card.id, undefined, actor)).items;
    expect(items.map(item => item.taskId)).toEqual([task2.id]);
    await db.user.update({ where: { id: userId }, data: { status: 'INACTIVE' } });
    expect((await notices.getUnreadCount(actor)).unreadCount).toBe(0);
    expect((await notices.getMyNotifications({}, actor)).items).toEqual([]);
    await db.user.update({ where: { id: userId }, data: { status: 'ACTIVE' } });
  });

  it('retains earlier overdue months, excludes future months, and hides old parent bindings after rework', async () => {
    const parent = await db.workflowTask.create({ data: { projectId, workflowInstanceId: instanceId, taskNo: `PARENT-${run}`, nodeCode: 'VISUAL_COLOR_DIFFERENCE_REVIEW', nodeName: '月度评审', requiredRoleCode: 'quality_engineer', status: 'READY' } });
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
    const plan = await db.recurringPlan.create({ data: { projectId, sourceNodeCode: 'VISUAL_COLOR_DIFFERENCE_REVIEW', planCode: `PLAN-${run}`, startDate: start, endDate: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 12, 1)), frequency: 'MONTHLY', totalCount: 12, generatedCount: 12, status: 'ACTIVE' } });
    const months = [];
    for (let i = 0; i < 12; i++) months.push(await db.recurringTask.create({ data: { recurringPlanId: plan.id, projectId, taskCode: `MONTH-${run}-${i}`, periodIndex: i + 1, periodLabel: String(i + 1), plannedDate: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1)), dueAt: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i + 1, 1)), reviewerId: userId, requiredRoleCode: 'quality_engineer' } }));
    const earlier = (await resolve('monthly', months[0]!.id, projectId))!;
    expect(earlier).not.toBeNull(); expect(await resolve('monthly', months[11]!.id, projectId)).toBeNull();
    const activation = await remind(earlier, 'ACTIVATE'); await remind(earlier, 'OVERDUE_DAY');
    const before = await db.notification.findUniqueOrThrow({ where: { id: activation } });
    await db.workflowTask.update({ where: { id: parent.id }, data: { isActive: false, status: 'RETURNED' } });
    expect((await notices.getMyNotifications({}, actor)).items.some(item => item.id === activation)).toBe(false);
    const card = await db.notification.findFirstOrThrow({ where: { userId, reminderKind: 'OVERDUE_DAY' } });
    expect((await notices.getDigestItems(card.id, undefined, actor)).items.map(item => item.taskId)).toEqual([task2.id]);
    const nextParent = await db.workflowTask.create({ data: { projectId, workflowInstanceId: instanceId, taskNo: `PARENT-NEXT-${run}`, nodeCode: 'VISUAL_COLOR_DIFFERENCE_REVIEW', nodeName: '返工月度评审', taskRound: 2, status: 'READY' } });
    const rebound = (await resolve('monthly', months[0]!.id, projectId))!;
    expect(rebound.stageTaskId).toBe(nextParent.id); expect(await remind(rebound, 'ACTIVATE')).toBe(activation);
    expect((await db.notification.findUniqueOrThrow({ where: { id: activation } })).createdAt).toEqual(before.createdAt);
    await db.recurringPlan.update({ where: { id: plan.id }, data: { totalCount: 11 } });
    expect(await resolve('monthly', months[0]!.id, projectId)).toBeNull();
    expect((await notices.getMyNotifications({}, actor)).items.some(item => item.id === activation)).toBe(false);
  });

  it('continues past a full scan page and resumes after restart without duplicate cards', async () => {
    const prefix = `zzz-${run}-`;
    for (let i = 0; i < 52; i++) {
      const project = await db.project.create({ data: { code: `${prefix}${i}`, name: '合成分页项目' } });
      const instance = await db.workflowInstance.create({ data: { projectId: project.id, instanceNo: `${prefix}${i}` } });
      await db.workflowTask.create({ data: { id: `${prefix}${String(i).padStart(3, '0')}`, projectId: project.id,
        workflowInstanceId: instance.id, taskNo: `${prefix}${i}`, nodeCode: 'PERFORMANCE_TEST', nodeName: '合成分页任务',
        requiredRoleCode: 'quality_engineer', assigneeUserId: userId, status: 'READY', dueAt: new Date(now.getTime() - 1000) } });
    }
    await db.reminderScanState.upsert({ where: { name: 'team-reminders:ordinary' }, create: { name: 'team-reminders:ordinary' }, update: {} });
    await db.reminderScanState.update({ where: { name: 'team-reminders:ordinary' }, data: { cursor: JSON.stringify({ afterTask: prefix, currentTask: null, afterUser: '' }), leaseToken: null, leaseUntil: null } });
    const first = await scanner.scan('ordinary', now); expect(first.hasMore).toBe(true); expect(first.scanned).toBe(50);
    await new TaskRemindersService(db as never).scan('ordinary', now);
    expect(await db.notification.count({ where: { userId, reminderKind: 'ACTIVATE', taskId: { startsWith: prefix } } })).toBe(52);
    const card = await db.notification.findFirstOrThrow({ where: { userId, reminderKind: 'OVERDUE_DAY' } });
    const seen = new Set<string>(); let after: string | undefined;
    for (let i = 0; i < 10; i++) { const page = await notices.getDigestItems(card.id, after, actor); for (const item of page.items) { expect(seen.has(item.id)).toBe(false); seen.add(item.id); } if (!page.nextCursor) break; after = page.nextCursor; }
    expect(seen.size).toBeGreaterThanOrEqual(53);
    expect(await db.notification.count({ where: { userId, reminderKind: 'OVERDUE_DAY' } })).toBe(1);
  }, 60000);

  it('enforces due-soon visibility and deduplicates a task after deadline changes', async () => {
    const day = shanghaiBusinessDay(now);
    const due = new Date(now.getTime() + Math.min(60000, (day.end.getTime() - now.getTime()) / 2));
    await db.workflowTask.update({ where: { id: task1.id }, data: { dueAt: due, effectiveDueAt: null } });
    task1 = (await resolve('ordinary', task1.id, projectId))!;
    const noticeId = await remind(task1, 'DUE_SOON');
    expect((await notices.getMyNotifications({ pageSize: '100' }, actor)).items.some(item => item.id === noticeId)).toBe(true);
    await db.workflowTask.update({ where: { id: task1.id }, data: { effectiveDueAt: new Date(now.getTime() + 86400000) } });
    expect((await notices.getMyNotifications({ pageSize: '100' }, actor)).items.some(item => item.id === noticeId)).toBe(false);
    await db.workflowTask.update({ where: { id: task1.id }, data: { effectiveDueAt: due } });
    task1 = (await resolve('ordinary', task1.id, projectId))!;
    expect(await remind(task1, 'DUE_SOON')).toBe(noticeId);
  });

  it('takes over an expired durable lease with exactly one concurrent scanner winner', async () => {
    const name = 'team-reminders:ordinary';
    await db.reminderScanState.update({ where: { name }, data: { cursor: JSON.stringify({ afterTask: '', currentTask: task1.id, afterUser: '' }), leaseToken: 'crashed-worker', leaseUntil: new Date(Date.now() - 1000) } });
    const results = await Promise.all([new TaskRemindersService(db as never).scan('ordinary', now), new TaskRemindersService(db as never).scan('ordinary', now)]);
    expect(results.filter(r => r.skipped)).toHaveLength(1);
    const saved = await db.reminderScanState.findUniqueOrThrow({ where: { name } });
    expect(saved.leaseToken).toBeNull(); expect(saved.leaseUntil).toBeNull();
  }, 60000);

  it('replays a committed reminder after a failed checkpoint without duplicating or resetting read state', async () => {
    const name = 'team-reminders:ordinary';
    const id = await remind(task1, 'ACTIVATE');
    await db.notification.update({ where: { id }, data: { isRead: true, readAt: now } });
    const initial = { afterTask: '', currentTask: task1.id, afterUser: '' };
    await db.reminderScanState.update({ where: { name }, data: { cursor: JSON.stringify(initial), leaseToken: null, leaseUntil: null } });
    let failCheckpoint = true;
    const injected = new Proxy(db, { get(target, prop) {
      if (prop === 'reminderScanState') return new Proxy(target.reminderScanState, { get(delegate, operation) {
        if (operation === 'updateMany') return async (args: { data: { cursor?: string } }) => {
          if (args.data.cursor && failCheckpoint) { failCheckpoint = false; throw new Error('Synthetic checkpoint unavailable'); }
          return delegate.updateMany(args as never);
        };
        const value = Reflect.get(delegate, operation); return typeof value === 'function' ? value.bind(delegate) : value;
      } });
      const value = Reflect.get(target, prop); return typeof value === 'function' ? value.bind(target) : value;
    } });
    await expect(new TaskRemindersService(injected as never).scan('ordinary', now)).rejects.toThrow('Synthetic checkpoint unavailable');
    const interrupted = await db.reminderScanState.findUniqueOrThrow({ where: { name } });
    expect(JSON.parse(interrupted.cursor)).toEqual(initial); expect(interrupted.leaseToken).toBeNull();
    await scanner.scan('ordinary', now);
    const rows = await db.notification.findMany({ where: { userId, taskId: task1.id, reminderKind: 'ACTIVATE' } });
    expect(rows).toHaveLength(1); expect(rows[0]!.id).toBe(id); expect(rows[0]!.readAt).toEqual(now);
  }, 60000);

  it('uses Shanghai midnight independently of host timezone', () => {
    expect(shanghaiBusinessDay(new Date('2026-09-27T15:59:59Z')).date).toBe('2026-09-27');
    expect(shanghaiBusinessDay(new Date('2026-09-27T16:00:00Z')).date).toBe('2026-09-28');
  });
});
