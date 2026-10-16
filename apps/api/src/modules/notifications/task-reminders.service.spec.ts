import 'reflect-metadata';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TaskRemindersService } from './task-reminders.service';
import type { ReminderTarget } from './task-reminder.rules';

function fixture(kind: 'ordinary' | 'monthly' = 'ordinary', taskCount = 1, userCount = 1) {
  let cursor = ''; let lease: string | null = null;
  const users = Array.from({ length: userCount }, (_, i) => ({ id: `u${String(i).padStart(4, '0')}` }));
  const tasks = Array.from({ length: taskCount }, (_, i) => ({ id: `t${String(i).padStart(4, '0')}`, projectId: `p${i}` }));
  const findFirst = vi.fn(async ({ where }) => tasks.find(t => where.id === t.id || typeof where.id === 'object' && t.id > where.id.gt) ?? null);
  const db = {
    $transaction: vi.fn(async (fn) => fn(db)), $executeRaw: vi.fn().mockResolvedValue(0),
    reminderScanState: {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: vi.fn(async () => ({ cursor })),
      updateMany: vi.fn(async ({ where, data }) => {
        if (where.OR && lease !== null || where.leaseToken && lease !== where.leaseToken) return { count: 0 };
        if (data.cursor !== undefined) cursor = data.cursor;
        if (data.leaseToken !== undefined) lease = data.leaseToken;
        return { count: 1 };
      }),
    },
    workflowTask: { findFirst }, recurringTask: { findFirst, updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    user: { findMany: vi.fn(async ({ where, take }) => users.filter(u => u.id > where.AND[0].id.gt).slice(0, take)), findFirst: vi.fn().mockResolvedValue({ id: 'qualified' }) },
    notification: { createMany: vi.fn().mockResolvedValue({ count: 1 }), findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'card' }), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    notificationDigestItem: { upsert: vi.fn().mockResolvedValue({}) },
  };
  const service = new TaskRemindersService(db as never);
  const target = (id: string): ReminderTarget => ({ kind, id, projectId: tasks.find(t => t.id === id)!.projectId, stageTaskId: id,
    epoch: 7, roleCode: 'quality_engineer', ownerId: null, title: '合成工作', dueAt: new Date('2026-09-28T01:00:00Z') });
  vi.spyOn(service, 'target').mockImplementation(async (_tx, _kind, id) => target(id));
  return { service, db, target, getCursor: () => JSON.parse(cursor), getLease: () => lease };
}
const now = new Date('2026-09-28T02:00:00Z');
afterEach(() => vi.restoreAllMocks());
describe('durable bounded role reminder scanning', () => {
  it('keeps task pages bounded and persists progress across successive ticks', async () => {
    const { service, db, getCursor } = fixture('ordinary', 52);
    expect(await service.scan('ordinary', now)).toMatchObject({ scanned: 50, hasMore: true });
    expect(getCursor()).toEqual({ afterTask: 't0049', currentTask: null, afterUser: '' });
    expect(await service.scan('ordinary', now)).toMatchObject({ scanned: 2, hasMore: false });
    expect(db.workflowTask.findFirst).toHaveBeenCalledTimes(53);
    for (const [args] of db.user.findMany.mock.calls) expect(args.take).toBeLessThanOrEqual(101);
  });
  it('bounds a large shared role pool to 500 recipients and resumes within the same task', async () => {
    const { service, db, getCursor } = fixture('ordinary', 1, 503);
    expect(await service.scan('ordinary', now)).toMatchObject({ scanned: 0, enqueued: 500, hasMore: true });
    expect(getCursor()).toEqual({ afterTask: '', currentTask: 't0000', afterUser: 'u0499' });
    expect(await service.scan('ordinary', now)).toMatchObject({ scanned: 1, enqueued: 3, hasMore: false });
    expect(db.notificationDigestItem.upsert).toHaveBeenCalledTimes(503);
    for (const [args] of db.user.findMany.mock.calls) expect(args.take).toBeLessThanOrEqual(101);
  });
  it('does not allow a second scanner to use an occupied durable lease', async () => {
    const { service, db } = fixture();
    db.reminderScanState.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await service.scan('ordinary', now)).toMatchObject({ skipped: true });
    expect(db.workflowTask.findFirst).not.toHaveBeenCalled();
  });
  it('releases its own lease on an error and leaves the cursor replayable', async () => {
    const { service, db, getLease } = fixture();
    db.notification.createMany.mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(service.scan('ordinary', now)).rejects.toThrow('storage unavailable');
    expect(getLease()).toBeNull();
    expect(await service.scan('ordinary', now)).toMatchObject({ scanned: 1 });
  });
  it('rechecks recipient qualification before each write', async () => {
    const { service, db } = fixture();
    db.user.findFirst.mockResolvedValueOnce(null as never);
    await service.scan('ordinary', now);
    expect(db.notification.createMany).not.toHaveBeenCalled();
  });
  it('creates only activation and due-soon for a task due later in the Shanghai day', async () => {
    const { service, db, target } = fixture();
    vi.mocked(service.target).mockResolvedValue({ ...target('t0000'), dueAt: new Date('2026-09-28T15:59:59Z') });
    await service.scan('ordinary', now);
    expect(db.notification.createMany.mock.calls.map(([q]) => q.data[0].reminderKind)).toEqual(['ACTIVATE', 'DUE_SOON']);
    expect(db.notificationDigestItem.upsert).not.toHaveBeenCalled();
  });
  it('marks an eligible monthly task overdue with a bounded status and epoch CAS', async () => {
    const { service, db } = fixture('monthly');
    expect(await service.scan('monthly', now)).toMatchObject({ markedOverdue: 1 });
    expect(db.recurringTask.updateMany).toHaveBeenCalledWith({ where: { id: 't0000', assignmentEpoch: 7,
      status: { in: ['PENDING', 'IN_PROGRESS'] }, dueAt: { lt: now } }, data: { status: 'OVERDUE' } });
  });
  it('never changes completed or invalid monthly tasks observed after taking the project lock', async () => {
    const { service, db } = fixture('monthly');
    vi.mocked(service.target).mockResolvedValue(null);
    expect(await service.scan('monthly', now)).toMatchObject({ markedOverdue: 0, enqueued: 0 });
    expect(db.recurringTask.updateMany).not.toHaveBeenCalled();
    expect(db.notification.createMany).not.toHaveBeenCalled();
  });
  it('keeps monthly status maintenance bounded even when a role has no eligible people', async () => {
    const { service, db } = fixture('monthly', 52, 0);
    expect(await service.scan('monthly', now)).toMatchObject({ scanned: 50, markedOverdue: 50, enqueued: 0, hasMore: true });
    expect(db.recurringTask.updateMany).toHaveBeenCalledTimes(50);
    expect(db.notification.createMany).not.toHaveBeenCalled();
  });
});
