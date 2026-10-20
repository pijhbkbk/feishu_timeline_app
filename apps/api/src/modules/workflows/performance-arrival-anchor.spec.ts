import { Prisma, type WorkflowTask } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { ensurePerformanceArrivalAnchor, PERFORMANCE_ARRIVAL_RULE, performanceDueAt, readPerformanceArrivalAnchor } from './performance-arrival-anchor';

const anchor = {
  rule: PERFORMANCE_ARRIVAL_RULE, procurementTaskId: 'round-2', procurementId: 'purchase-2',
  creationAuditId: 'created-2', arrivalAuditId: 'arrived-2',
  arrivalDate: '2026-08-31T00:00:00.000Z', dueAt: '2027-02-28T15:59:59.999Z',
};
function fixture() {
  const task: Pick<WorkflowTask, 'id' | 'projectId' | 'nodeCode' | 'isActive' | 'status' | 'payload' | 'updatedAt'> = {
    id: 'round-2', projectId: 'project-1', nodeCode: 'PAINT_PROCUREMENT', isActive: true, status: 'READY',
    payload: { formData: { untouched: true } }, updatedAt: new Date('2026-10-01T00:00:00Z'),
  };
  const creation = { id: 'created-2', targetId: 'purchase-2', recordId: 'purchase-2', createdAt: new Date('2026-09-01T00:00:00Z') };
  const arrival = { id: 'arrived-2', targetId: 'purchase-2', recordId: 'purchase-2', beforeStatus: 'ORDERED', afterStatus: 'ARRIVED',
    arrivalDate: anchor.arrivalDate, createdAt: new Date('2026-09-02T00:00:00Z') };
  const tx = {
    $queryRaw: vi.fn(async (sql: Prisma.Sql) => sql.strings.join('').includes('PAINT_PROCUREMENT_CREATED') ? [creation] : [arrival]),
    paintProcurement: { findMany: vi.fn().mockResolvedValue([{ id: 'purchase-2', arrivalDate: new Date(anchor.arrivalDate) }]) },
    workflowTask: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    auditLog: { create: vi.fn() },
  };
  return { task, tx, creation, arrival };
}

describe('First valid arrival evidence boundary', () => {
  it.each(['2026-08-31T00:00:00.000Z', '2026-08-30T16:00:00.000Z'])('uses the Shanghai arrival day and its six-month end-of-day boundary (%s)', value => {
    expect(performanceDueAt(new Date(value)).toISOString()).toBe('2027-02-28T15:59:59.999Z');
  });
  it('freezes only the bounded current-round evidence fields and preserves the existing form', async () => {
    const { tx, task } = fixture();
    expect(await ensurePerformanceArrivalAnchor(tx as never, task, 'actor')).toEqual(anchor);
    expect(tx.workflowTask.updateMany).toHaveBeenCalledWith({
      where: { id: task.id, projectId: task.projectId, isActive: true, status: task.status, updatedAt: task.updatedAt },
      data: { payload: { formData: { untouched: true }, performanceArrivalAnchor: anchor } },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      action: 'PERFORMANCE_ARRIVAL_ANCHOR_RECORDED', afterData: anchor,
    }) }));
    for (const [sql] of tx.$queryRaw.mock.calls) {
      expect(sql.values).toContain('project-1');
      expect(sql.values).toContain(101);
      expect(sql.strings.join('')).not.toContain('SELECT *');
    }
  });

  it('never re-queries or rewrites an already frozen source', async () => {
    const { tx, task } = fixture();
    task.payload = { performanceArrivalAnchor: anchor };
    expect(await ensurePerformanceArrivalAnchor(tx as never, task, 'actor')).toEqual(anchor);
    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(tx.workflowTask.updateMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it.each([
    { dueAt: '2027-03-01T15:59:59.999Z' }, { rule: 'unknown' }, { arrivalDate: 'not-a-date' },
    { procurementId: 'x'.repeat(129) }, { arrivalAuditId: null },
  ])('rejects invalid stored anchor data (%j)', delta => {
    expect(() => readPerformanceArrivalAnchor({ performanceArrivalAnchor: { ...anchor, ...delta } })).toThrow('起算依据');
  });

  it('does not copy unrelated anchor properties into new tasks', () => {
    expect(readPerformanceArrivalAnchor({ performanceArrivalAnchor: { ...anchor, unrelatedLegacyText: 'x'.repeat(10000) } })).toEqual(anchor);
  });

  it.each([false, true])('rejects inactive or completed historical tasks (inactive=%s)', inactive => {
    const { tx, task } = fixture();
    return expect(ensurePerformanceArrivalAnchor(tx as never, { ...task, isActive: !inactive, status: inactive ? 'READY' : 'COMPLETED' }, 'actor')).rejects.toThrow('当前活动采购任务');
  });

  it('does not accept a frozen anchor from another procurement round', async () => {
    const { tx, task } = fixture();
    task.payload = { performanceArrivalAnchor: { ...anchor, procurementTaskId: 'old-round' } };
    await expect(ensurePerformanceArrivalAnchor(tx as never, task, 'actor')).rejects.toThrow('不属于当前采购轮次');
    expect(tx.workflowTask.updateMany).not.toHaveBeenCalled();
  });

  it.each(['absent', 'mismatch', 'before-creation'])('requires an explicit matching creation-arrival chain (%s)', async kind => {
    const { tx, task, arrival } = fixture();
    if (kind === 'absent') tx.$queryRaw.mockResolvedValueOnce([]);
    if (kind === 'mismatch') arrival.arrivalDate = '2026-09-01T00:00:00.000Z';
    if (kind === 'before-creation') arrival.createdAt = new Date('2026-08-01T00:00:00Z');
    await expect(ensurePerformanceArrivalAnchor(tx as never, task, 'actor')).rejects.toThrow('创建与实际到货依据');
    expect(tx.workflowTask.updateMany).not.toHaveBeenCalled();
  });

  it.each([2, 101])('rejects duplicate or over-bound creation evidence (%s)', async count => {
    const { tx, task, creation } = fixture();
    tx.$queryRaw.mockResolvedValueOnce(Array.from({ length: count }, () => creation));
    await expect(ensurePerformanceArrivalAnchor(tx as never, task, 'actor')).rejects.toThrow(count === 101 ? '上限' : '重复');
    expect(tx.workflowTask.updateMany).not.toHaveBeenCalled();
  });

  it('fails the anchor CAS without appending a false audit', async () => {
    const { tx, task } = fixture();
    tx.workflowTask.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(ensurePerformanceArrivalAnchor(tx as never, task, 'actor')).rejects.toThrow('采购任务已变化');
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('does not guess the first delivery when legacy arrival audit timestamps tie', async () => {
    const { tx, task, creation, arrival } = fixture();
    tx.$queryRaw.mockResolvedValueOnce([creation, { ...creation, id: 'created-3', targetId: 'purchase-3', recordId: 'purchase-3' }])
      .mockResolvedValueOnce([arrival, { ...arrival, id: 'arrived-3', targetId: 'purchase-3', recordId: 'purchase-3' }]);
    tx.paintProcurement.findMany.mockResolvedValueOnce([
      { id: 'purchase-2', arrivalDate: new Date(anchor.arrivalDate) },
      { id: 'purchase-3', arrivalDate: new Date(anchor.arrivalDate) },
    ]);
    await expect(ensurePerformanceArrivalAnchor(tx as never, task, 'actor')).rejects.toThrow('审计顺序不明确');
    expect(tx.workflowTask.updateMany).not.toHaveBeenCalled();
  });
});
