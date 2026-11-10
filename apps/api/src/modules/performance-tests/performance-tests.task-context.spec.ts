import { describe, expect, it, vi } from 'vitest';
import { PerformanceTestsService } from './performance-tests.service';

const date = new Date('2026-10-24T06:48:26.935Z');
const anchor = { rule: 'FIRST_VALID_ARRIVAL_PLUS_6_CALENDAR_MONTHS_V1', procurementTaskId: 'procurement-task',
  procurementId: 'procurement', creationAuditId: 'created', arrivalAuditId: 'arrived',
  arrivalDate: '2026-08-31T00:00:00.000Z', dueAt: '2027-02-28T15:59:59.999Z' };
const completed = { id: 'old-task', projectId: 'project-1', nodeCode: 'PERFORMANCE_TEST', status: 'COMPLETED',
  taskRound: 1, isActive: false, dueAt: new Date(anchor.dueAt), completedAt: date, assigneeUser: { name: '合成成员' } };

function fixture(options: { active?: boolean; missing?: boolean; invalidAnchor?: boolean } = {}) {
  const active = options.active ? { ...completed, id: 'new-task', status: 'READY', isActive: true,
    taskRound: 2, completedAt: null, payload: null, createdAt: date, updatedAt: date } : null;
  const access = { assertProjectAccessWithDefaultClient: vi.fn().mockResolvedValue(undefined) };
  const db = {
    project: { findUnique: vi.fn().mockResolvedValue({ id: 'project-1', code: 'P', name: '合成', priority: 'LOW', currentNodeCode: 'PERFORMANCE_TEST' }) },
    sample: { findMany: vi.fn().mockResolvedValue([]) },
    performanceTest: { findMany: vi.fn().mockResolvedValue([{ id: 'report', testCode: 'R', status: 'SUBMITTED',
      conclusion: '合成结论', createdAt: date, updatedAt: date }]) },
    workflowTask: { findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      if (where.nodeCode === 'PAINT_PROCUREMENT') return { id: 'procurement-task' };
      if (where.isActive === true) return active;
      return options.missing || (where.id && where.id !== completed.id) ? null : completed;
    }) },
    $queryRaw: vi.fn().mockResolvedValue([{ anchorType: 'object', anchor: options.invalidAnchor ? { ...anchor, dueAt: '2027-03-01' } : anchor }]),
    $transaction: vi.fn(),
  };
  const service = new PerformanceTestsService(db as never, {} as never, {} as never, {} as never, access as never);
  return { service, db, access };
}

describe('performance workspace read-only task context', () => {
  it('keeps the exact completed source task, dates and seven anchor fields without enabling a write', async () => {
    const { service, db, access } = fixture();
    const result = await service.getWorkspace('project-1', {} as never, 'old-task');
    expect(access.assertProjectAccessWithDefaultClient).toHaveBeenCalledWith('project-1', {}, 'project.read');
    expect(result).toMatchObject({ activeTask: null, canCompleteTask: false,
      taskContext: { id: 'old-task', taskRound: 1, status: 'COMPLETED', dueAt: anchor.dueAt,
        completedAt: date.toISOString(), payload: { performanceArrivalAnchor: anchor } } });
    expect(db.workflowTask.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { projectId: 'project-1', nodeCode: 'PERFORMANCE_TEST', id: 'old-task' },
      select: expect.not.objectContaining({ payload: true }),
    }));
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('does not offer completion of a new active round while viewing an old source round', async () => {
    const { service } = fixture({ active: true });
    expect(await service.getWorkspace('project-1', {} as never, 'old-task')).toMatchObject({
      activeTask: { id: 'new-task', isActive: true }, taskContext: { id: 'old-task', status: 'COMPLETED' }, canCompleteTask: false,
    });
  });

  it('keeps the active round editable by default without reading unrelated history', async () => {
    const { service, db } = fixture({ active: true });
    expect(await service.getWorkspace('project-1', {} as never)).toMatchObject({
      activeTask: { id: 'new-task' }, taskContext: { id: 'new-task', taskRound: 2 }, canCompleteTask: true,
    });
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it('defaults only to the latest completed round when no active task exists', async () => {
    const { service, db } = fixture();
    expect((await service.getWorkspace('project-1', {} as never)).taskContext?.id).toBe('old-task');
    expect(db.workflowTask.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { projectId: 'project-1', nodeCode: 'PERFORMANCE_TEST', status: 'COMPLETED', isActive: false },
      orderBy: [{ completedAt: { sort: 'desc', nulls: 'last' } }, { taskRound: 'desc' }, { id: 'desc' }],
    }));
  });

  it('rejects a foreign, missing or wrong-node source instead of falling back to the active round', async () => {
    const { service } = fixture({ active: true });
    await expect(service.getWorkspace('project-1', {} as never, 'foreign-task')).rejects.toThrow('不属于当前项目');
  });

  it.each(['', 'x'.repeat(65), ['old-task']])('rejects an invalid source task before business reads', async (input) => {
    const { service, db } = fixture();
    await expect(service.getWorkspace('project-1', {} as never, input)).rejects.toThrow('标识无效');
    expect(db.project.findUnique).not.toHaveBeenCalled();
  });

  it('does not invent a task when neither active nor completed history exists', async () => {
    const { service, db } = fixture({ missing: true });
    expect(await service.getWorkspace('project-1', {} as never)).toMatchObject({ activeTask: null, taskContext: null, canCompleteTask: false });
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it('fails closed on an inconsistent saved anchor instead of recalculating history', async () => {
    const { service } = fixture({ invalidAnchor: true });
    await expect(service.getWorkspace('project-1', {} as never, 'old-task')).rejects.toThrow('日期不一致');
  });
});
