import 'reflect-metadata';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TaskRemindersService } from './task-reminders.service';
import type { ReminderTarget } from './task-reminder.rules';
import { createReminderScope } from '../../common/notification-reminder-scope';

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
    notificationDigestItem: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn().mockResolvedValue({}) },
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
  const scope = createReminderScope({ projectIds: ['p0'], taskIds: ['t0000'], recipientIds: ['u0000'] });
  it('binds scoped candidate, recipient, cursor and lease predicates while retaining eligibility', async () => {
    const { service, db, getCursor } = fixture();
    await service.scan('ordinary', now, scope);
    expect(db.workflowTask.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      projectId: { in: ['p0'] }, AND: [{ id: { in: ['t0000'] } }], isActive: true,
    }) }));
    expect(db.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      AND: [{ id: { gt: '' } }, { id: { in: ['u0000'] } }], status: 'ACTIVE', localCredential: { isNot: null },
    }) }));
    expect(db.reminderScanState.createMany).toHaveBeenCalledWith({ data: [{ name: `team-reminders:ordinary:scoped:${scope.hash}` }], skipDuplicates: true });
    expect(getCursor()).toEqual({ afterTask: '', currentTask: null, afterUser: '', scopeHash: scope.hash });
    expect(db.notification.createMany).toHaveBeenCalled();
  });
  it('applies scope and current activity predicates on a resumed task too', async () => {
    const { service, db } = fixture();
    db.reminderScanState.findUniqueOrThrow.mockResolvedValueOnce({ cursor: JSON.stringify({ afterTask: '', currentTask: 't0000', afterUser: '', scopeHash: scope.hash }) });
    await service.scan('ordinary', now, scope);
    expect(db.workflowTask.findFirst).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: expect.objectContaining({
      id: 't0000', projectId: { in: ['p0'] }, AND: [{ id: { in: ['t0000'] } }], isActive: true,
      status: { in: ['PENDING', 'READY', 'IN_PROGRESS', 'RETURNED'] },
    }) }));
  });
  it.each([{ scopeHash: 'foreign' }, { currentTask: 'outside' }, { afterTask: 'outside' }, { afterUser: 'outside' }])('rejects scope/cursor mismatch before traversing %#', async override => {
    const { service, db, getLease } = fixture();
    db.reminderScanState.findUniqueOrThrow.mockResolvedValueOnce({ cursor: JSON.stringify({ afterTask: '', currentTask: null, afterUser: '', scopeHash: scope.hash, ...override }) });
    await expect(service.scan('ordinary', now, scope)).rejects.toThrow('cursor');
    expect(db.workflowTask.findFirst).not.toHaveBeenCalled(); expect(getLease()).toBeNull();
  });
  it('fails closed for invalid/monthly scopes without acquiring a global scan state', async () => {
    const { service, db } = fixture();
    await expect(service.scan('monthly', now, scope)).rejects.toThrow('ordinary');
    await expect(service.scan('ordinary', now, null as never)).rejects.toThrow('Invalid reminder scope');
    expect(db.reminderScanState.createMany).not.toHaveBeenCalled();
  });
  it('rechecks locked target project, owner and recipient admission before persisting', async () => {
    for (const change of ['project', 'owner', 'admission'] as const) {
      const { service, db, target } = fixture();
      if (change === 'admission') db.user.findFirst.mockResolvedValueOnce(null as never);
      else vi.mocked(service.target).mockResolvedValueOnce(target('t0000')).mockResolvedValueOnce({ ...target('t0000'),
        ...(change === 'project' ? { projectId: 'outside' } : { ownerId: 'outside' }) });
      await service.scan('ordinary', now, scope);
      expect(db.notification.createMany).not.toHaveBeenCalled();
    }
  });
  it('does not trust an out-of-scope candidate or recipient returned by an adapter', async () => {
    const a = fixture();
    a.db.workflowTask.findFirst.mockResolvedValueOnce({ id: 'outside', projectId: 'p0' });
    await expect(a.service.scan('ordinary', now, scope)).rejects.toThrow('candidate');
    expect(a.db.notification.createMany).not.toHaveBeenCalled();
    const b = fixture(); b.db.user.findMany.mockResolvedValueOnce([{ id: 'outside' }]);
    await expect(b.service.scan('ordinary', now, scope)).rejects.toThrow('recipient');
    expect(b.db.notification.createMany).not.toHaveBeenCalled();
  });
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
  it('uses current admission for both recipient paging and the locked write recheck', async () => {
    const { service, db } = fixture();
    await service.scan('ordinary', now);
    const eligibility = { status: 'ACTIVE', localCredential: { isNot: null },
      OR: [{ teamAccessApproved: true }, { isSystemAdmin: true }] };
    expect(db.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
      ...eligibility, AND: [{ id: { gt: '' } }],
    } }));
    expect(db.user.findFirst).toHaveBeenCalledWith({ where: { id: 'u0000', ...eligibility }, select: { id: true } });
  });
  it('keeps assigned reminders restricted to their current owner even when the page is stale', async () => {
    const { service, db, target } = fixture();
    vi.mocked(service.target).mockResolvedValue({ ...target('t0000'), ownerId: 'other-owner' });
    await service.scan('ordinary', now);
    expect(db.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ AND: [{ id: { gt: '' } }, { id: 'other-owner' }] }),
    }));
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
