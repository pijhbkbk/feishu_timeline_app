import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createReminderScope, type ReminderScope } from '../../common/notification-reminder-scope';
import { withSystemProjectWrite } from '../../common/team-authorization';
import { TaskRemindersService } from './task-reminders.service';
import { NotificationsService } from './notifications.service';
import type { AuthenticatedUser } from '../auth/auth.types';

const url = process.env.SCOPED_REMINDERS_TEST_DATABASE_URL;
describe.skipIf(!url).sequential('scoped IN_APP scanner on dedicated PostgreSQL', () => {
  const db = new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
  const scanner = new TaskRemindersService(db as never);
  const run = randomUUID().slice(0, 8);
  const now = new Date('2026-10-24T04:00:00Z');
  const notices = new NotificationsService(db as never, { create: async () => ({}) } as never, {} as never, { now: () => now } as never);
  let scope: ReminderScope; let project: string; let otherProject: string; let task: string; let otherTask: string; let foreignTask: string;
  const users: string[] = [];
  const stateName = (s = scope) => `team-reminders:ordinary:scoped:${s.hash}`;
  const cards = () => db.notification.findMany({ where: { userId: { in: users } }, orderBy: { id: 'asc' } });
  beforeAll(async () => {
    const target = new URL(url!);
    if (target.hostname !== '127.0.0.1' || target.port !== '55439' || target.pathname !== '/v1_scoped_reminders_20261024_r01') {
      throw new Error('Only the dedicated v1_scoped_reminders_20261024_r01 database is allowed.');
    }
    for (const kind of ['a', 'b', 'outside', 'unapproved', 'inactive', 'contact']) {
      const username = `scoped-${run}-${kind}`;
      users.push((await db.user.create({ data: { username, name: `合成范围 ${kind}`,
        teamAccessApproved: kind !== 'unapproved', status: kind === 'inactive' ? 'INACTIVE' : 'ACTIVE',
        ...(kind === 'contact' ? {} : { localCredential: { create: { loginName: username, passwordHash: 'synthetic-not-a-login-hash' } } }),
      } })).id);
    }
    expect(await db.userRole.count({ where: { userId: { in: users } } })).toBe(0);
    for (let i = 0; i < 2; i++) {
      const p = await db.project.create({ data: { code: `SCOPED-${run}-${i}`, name: '合成隔离提醒项目' } });
      const instance = await db.workflowInstance.create({ data: { projectId: p.id, instanceNo: `SCOPED-${run}-${i}` } });
      if (i === 0) project = p.id; else otherProject = p.id;
      for (let j = 0; j < (i === 0 ? 2 : 1); j++) {
        const t = await db.workflowTask.create({ data: { projectId: p.id, workflowInstanceId: instance.id,
          taskNo: `SCOPED-${run}-${i}-${j}`, nodeCode: j === 0 ? 'PERFORMANCE_TEST' : 'PAINT_PROCUREMENT', nodeName: '合成性能提醒', status: 'READY',
          dueAt: new Date('2026-10-24T06:00:00Z'), assigneeUserId: null } });
        if (i === 1) foreignTask = t.id; else if (j === 1) otherTask = t.id; else task = t.id;
      }
    }
    // Includes a listed task in the wrong project and unqualified listed people.
    // The production query must intersect all three lists with current eligibility.
    scope = createReminderScope({ projectIds: [project], taskIds: [task, foreignTask], recipientIds: users.filter((_, i) => i !== 2) });
    await db.reminderScanState.create({ data: { name: `unrelated-scoped-test-${run}`, cursor: 'retained' } });
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => { await db.$disconnect(); });

  it('only delivers IN_APP to the two qualified listed members for the listed project and task', async () => {
    expect(await scanner.scan('ordinary', now, scope)).toMatchObject({ scanned: 1, enqueued: 2, hasMore: false });
    const rows = await cards(); expect(rows).toHaveLength(4);
    expect(new Set(rows.map(r => r.userId))).toEqual(new Set(users.slice(0, 2)));
    expect(new Set(rows.map(r => r.taskId))).toEqual(new Set([task]));
    expect(new Set(rows.map(r => r.reminderKind))).toEqual(new Set(['ACTIVATE', 'DUE_SOON']));
    expect(rows.every(r => r.sendChannel === 'IN_APP' && r.sendStatus === 'SENT')).toBe(true);
    expect(await db.notification.count({ where: { taskId: { in: [otherTask, foreignTask] } } })).toBe(0);
    expect(await db.reminderScanState.findUnique({ where: { name: 'team-reminders:ordinary' } })).toBeNull();
  });

  it('retains read history across replay and overlapping scopes without changing unrelated cursors', async () => {
    const first = (await cards())[0]!;
    await db.notification.update({ where: { id: first.id }, data: { isRead: true, readAt: now } });
    const before = await cards();
    const narrower = createReminderScope({ projectIds: [project], taskIds: [task], recipientIds: [users[0]!] });
    await scanner.scan('ordinary', now, narrower); await scanner.scan('ordinary', now, scope);
    expect(await cards()).toEqual(before);
    expect(await db.reminderScanState.count({ where: { name: { in: [stateName(), stateName(narrower)] } } })).toBe(2);
    expect(await db.reminderScanState.findUniqueOrThrow({ where: { name: `unrelated-scoped-test-${run}` } })).toMatchObject({ cursor: 'retained' });
  });

  it('allows only one scanner to own the same canonical scope lease', async () => {
    let entered!: () => void; let release!: () => void;
    const ready = new Promise<void>(resolve => { entered = resolve; }); const held = new Promise<void>(resolve => { release = resolve; });
    const original = scanner.target.bind(scanner); let first = true;
    vi.spyOn(scanner, 'target').mockImplementation(async (...args) => { if (first) { first = false; entered(); await held; } return original(...args); });
    const pending = scanner.scan('ordinary', now, scope);
    try { await ready; expect(await new TaskRemindersService(db as never).scan('ordinary', now, scope)).toMatchObject({ skipped: true }); }
    finally { release(); await pending; }
    expect(await db.reminderScanState.findUniqueOrThrow({ where: { name: stateName() } })).toMatchObject({ leaseToken: null, leaseUntil: null });
  });

  it('replays a failed checkpoint without duplicating notifications or resetting reads', async () => {
    const before = await cards(); let fail = true;
    const faulty = db.$extends({ query: { reminderScanState: { updateMany: async ({ args, query }) => {
      if (args.data.cursor !== undefined && fail) { fail = false; throw new Error('synthetic checkpoint failure'); }
      return query(args);
    } } } });
    await expect(new TaskRemindersService(faulty as never).scan('ordinary', now, scope)).rejects.toThrow('checkpoint');
    await scanner.scan('ordinary', now, scope); expect(await cards()).toEqual(before);
  });

  it('rejects a foreign resume cursor and retains it for diagnosis', async () => {
    const bad = JSON.stringify({ afterTask: '', currentTask: otherTask, afterUser: '', scopeHash: scope.hash });
    const previous = await db.reminderScanState.findUniqueOrThrow({ where: { name: stateName() } });
    await db.reminderScanState.update({ where: { name: stateName() }, data: { cursor: bad } });
    const before = await cards();
    await expect(scanner.scan('ordinary', now, scope)).rejects.toThrow('cursor');
    expect(await cards()).toEqual(before);
    expect(await db.reminderScanState.findUniqueOrThrow({ where: { name: stateName() } })).toMatchObject({ cursor: bad, leaseToken: null });
    // Restore only this deliberately corrupted test cursor, never a global cursor.
    await db.reminderScanState.update({ where: { name: stateName() }, data: { cursor: previous.cursor } });
  });

  it('rechecks current owner and revocation while preserving raw history and hiding ineligible cards', async () => {
    const before = await cards();
    await withSystemProjectWrite(db as never, project, tx => tx.workflowTask.update({ where: { id: task }, data: { assigneeUserId: users[2]!, assignmentEpoch: { increment: 1 } } }));
    await scanner.scan('ordinary', now, scope); expect(await cards()).toEqual(before);
    for (const userId of users.slice(0, 2)) expect((await notices.getMyNotifications({}, { id: userId } as AuthenticatedUser)).items).toHaveLength(0);
    await withSystemProjectWrite(db as never, project, tx => tx.workflowTask.update({ where: { id: task }, data: { assigneeUserId: users[0]!, assignmentEpoch: { increment: 1 } } }));
    await scanner.scan('ordinary', now, scope);
    const owned = await cards(); expect(owned).toHaveLength(4);
    expect((await notices.getMyNotifications({}, { id: users[0]! } as AuthenticatedUser)).items).toHaveLength(2);
    await db.user.update({ where: { id: users[0]! }, data: { teamAccessApproved: false } });
    await scanner.scan('ordinary', now, scope); expect(await cards()).toEqual(owned);
    expect((await notices.getMyNotifications({}, { id: users[0]! } as AuthenticatedUser)).items).toHaveLength(0);
    await db.user.update({ where: { id: users[0]! }, data: { teamAccessApproved: true } });
    await withSystemProjectWrite(db as never, project, tx => tx.workflowTask.update({ where: { id: task }, data: { status: 'COMPLETED', isActive: false } }));
    await scanner.scan('ordinary', now, scope); expect(await cards()).toEqual(owned);
    expect((await notices.getMyNotifications({}, { id: users[0]! } as AuthenticatedUser)).items).toHaveLength(0);
    expect(otherProject).not.toBe(project);
  });

  it('preserves daily overdue header and item timestamps on unchanged replay', async () => {
    await withSystemProjectWrite(db as never, project, tx => tx.workflowTask.update({ where: { id: task }, data: { status: 'READY', isActive: true, dueAt: new Date(now.getTime() - 3600000) } }));
    await scanner.scan('ordinary', now, scope);
    const header = await db.notification.findFirstOrThrow({ where: { userId: users[0]!, reminderKind: 'OVERDUE_DAY' } });
    await db.notification.update({ where: { id: header.id }, data: { isRead: true, readAt: now } });
    const before = await cards();
    const items = await db.notificationDigestItem.findMany({ where: { notificationId: header.id }, orderBy: { id: 'asc' } });
    expect(items).toHaveLength(1);
    await scanner.scan('ordinary', now, scope);
    expect(await cards()).toEqual(before);
    expect(await db.notificationDigestItem.findMany({ where: { notificationId: header.id }, orderBy: { id: 'asc' } })).toEqual(items);
    expect((await notices.getDigestItems(header.id, undefined, { id: users[0]! } as AuthenticatedUser)).items).toHaveLength(1);
  });
});
