import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Prisma, ProcurementStatus, WorkflowNodeCode } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import type { AuthenticatedUser } from '../auth/auth.types';
import { PaintProcurementsService } from './paint-procurements.service';

const actor: AuthenticatedUser = {
  id: 'synthetic-buyer', username: 'synthetic-buyer', name: '合成采购维护员',
  email: null, departmentId: null, departmentName: null, authSource: 'local',
  isSystemAdmin: false, teamAccessApproved: true, authVersion: 1, roleCodes: [],
};
const form = {
  supplierId: 'supplier-1', procurementCode: 'SYNTHETIC-PO-1', materialName: '合成涂料',
  batchNo: 'BATCH-1', quantity: '10', unit: 'KG', note: '',
};
const actualArrival = new Date('2026-09-23T00:00:00.000Z');

// These are service contract tests. The real authorization, stage, lifecycle and
// completion checks run against a synthetic transaction double, not PostgreSQL.
function setup(status: ProcurementStatus = ProcurementStatus.DRAFT, arrivalDate: Date | null = null) {
  let record = {
    ...form, id: 'procurement-1', projectId: 'project-1', quantity: new Prisma.Decimal(10),
    arrivalDate, status, orderedAt: null as Date | null, cancelledAt: null as Date | null,
    createdAt: new Date('2026-09-01T00:00:00Z'), updatedAt: new Date('2026-09-02T00:00:00Z'),
    supplier: { id: 'supplier-1', supplierName: '合成供应商' },
  };
  const task = { id: 'task-1', nodeCode: WorkflowNodeCode.PAINT_PROCUREMENT,
    assigneeUserId: actor.id, isActive: true, status: 'IN_PROGRESS' };
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    $queryRaw: vi.fn(async (query: Prisma.Sql) => [{
      id: query.strings.join('').includes('paint_procurements') ? record.id : task.id,
    }]),
    user: { findUnique: vi.fn().mockResolvedValue({ status: 'ACTIVE', authVersion: 1,
      isSystemAdmin: false, teamAccessApproved: true, userRoles: [] }) },
    project: { findUnique: vi.fn().mockResolvedValue({ id: 'project-1', currentNodeCode: WorkflowNodeCode.PAINT_PROCUREMENT }) },
    workflowTask: { findFirst: vi.fn().mockResolvedValue(task), findUnique: vi.fn().mockResolvedValue(task) },
    supplier: { findUnique: vi.fn().mockResolvedValue(record.supplier) },
    paintProcurement: {
      findFirst: vi.fn(async ({ where }: { where: { id?: string } }) => where.id ? record : null),
      findMany: vi.fn(async () => [record]),
      create: vi.fn(async ({ data }: { data: Partial<typeof record> }) => (record = { ...record, ...data })),
      updateMany: vi.fn(async ({ data }: { data: Partial<typeof record> }) => {
        record = { ...record, ...data };
        return { count: 1 };
      }),
      findUniqueOrThrow: vi.fn(async () => record),
    },
  };
  const prisma = { $transaction: vi.fn(async (operation: (client: typeof tx) => Promise<unknown>) => operation(tx)) };
  const audit = { createWithExecutor: vi.fn() };
  const workflow = { transitionTaskWithExecutor: vi.fn() };
  const access = { assertProjectAccessWithDefaultClient: vi.fn().mockResolvedValue({ id: 'project-1' }) };
  const service = new PaintProcurementsService(prisma as never, audit as never, workflow as never, access as never);
  vi.spyOn(service as unknown as { buildWorkspace: () => Promise<unknown> }, 'buildWorkspace')
    .mockImplementation(async () => ({ items: [record] }));
  return { service, tx, prisma, audit, workflow, access };
}

describe('Paint procurement actual arrival contract', () => {
  it.each([undefined, null, '', '   '])('saves a draft without an arrival date (%s) and does not advance workflow', async arrivalDate => {
    const { service, tx, audit, workflow } = setup();
    await service.createProcurement('project-1', { ...form, arrivalDate }, actor);
    expect(tx.paintProcurement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'DRAFT', arrivalDate: null }),
    }));
    expect(audit.createWithExecutor).toHaveBeenCalledWith(tx, expect.objectContaining({
      action: 'PAINT_PROCUREMENT_CREATED', afterData: expect.objectContaining({ arrivalDate: null }),
    }));
    expect(workflow.transitionTaskWithExecutor).not.toHaveBeenCalled();
  });

  it.each([ProcurementStatus.DRAFT, ProcurementStatus.ORDERED])('saves %s without inventing an arrival date', async status => {
    const { service, tx, workflow } = setup(status);
    await service.updateProcurement('project-1', 'procurement-1', { ...form, arrivalDate: '' }, actor);
    expect(tx.paintProcurement.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'procurement-1', projectId: 'project-1', status, updatedAt: expect.any(Date) }),
      data: expect.objectContaining({ arrivalDate: null }),
    }));
    expect(workflow.transitionTaskWithExecutor).not.toHaveBeenCalled();
  });

  it.each([null, ''])('explicitly clears an editable date (%s), retaining the old value in audit', async arrivalDate => {
    const { service, tx, audit } = setup(ProcurementStatus.ORDERED, actualArrival);
    await service.updateProcurement('project-1', 'procurement-1', { arrivalDate }, actor);
    expect(tx.paintProcurement.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { arrivalDate: null } }));
    expect(audit.createWithExecutor).toHaveBeenCalledWith(tx, expect.objectContaining({
      beforeData: expect.objectContaining({ arrivalDate: actualArrival.toISOString() }),
      afterData: expect.objectContaining({ arrivalDate: null }),
    }));
  });

  it('keeps the saved date when an update omits it', async () => {
    const { service, tx } = setup(ProcurementStatus.ORDERED, actualArrival);
    await service.updateProcurement('project-1', 'procurement-1', { note: '合成说明' }, actor);
    expect(tx.paintProcurement.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { note: '合成说明' } }));
  });

  it.each(['not-a-date', 42, {}])('rejects an invalid provided date (%s)', async arrivalDate => {
    const { service, prisma } = setup();
    await expect(service.createProcurement('project-1', { ...form, arrivalDate }, actor)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.updateProcurement('project-1', 'procurement-1', { arrivalDate }, actor)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('orders an undated draft without marking it arrived or activating downstream tasks', async () => {
    const { service, tx, workflow } = setup();
    await service.orderProcurement('project-1', 'procurement-1', actor);
    expect(tx.paintProcurement.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: 'ORDERED', orderedAt: expect.any(Date) },
    }));
    expect(workflow.transitionTaskWithExecutor).not.toHaveBeenCalled();
  });

  it('rejects MARK_ARRIVED without a saved actual date, without mutation or audit', async () => {
    const { service, tx, audit, workflow } = setup(ProcurementStatus.ORDERED);
    await expect(service.markArrived('project-1', 'procurement-1', actor)).rejects.toThrow('实际到货日期');
    expect(tx.paintProcurement.updateMany).not.toHaveBeenCalled();
    expect(audit.createWithExecutor).not.toHaveBeenCalled();
    expect(workflow.transitionTaskWithExecutor).not.toHaveBeenCalled();
  });

  it('marks arrived using the saved actual date and leaves node completion explicit', async () => {
    const { service, tx, audit, workflow } = setup(ProcurementStatus.ORDERED);
    await service.updateProcurement('project-1', 'procurement-1', { arrivalDate: '2026-09-23' }, actor);
    await service.markArrived('project-1', 'procurement-1', actor);
    expect(tx.paintProcurement.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      data: { status: 'ARRIVED', arrivalDate: actualArrival, cancelledAt: null },
    }));
    expect(audit.createWithExecutor).toHaveBeenLastCalledWith(tx, expect.objectContaining({
      afterData: expect.objectContaining({ status: 'ARRIVED', arrivalDate: actualArrival.toISOString() }),
    }));
    expect(workflow.transitionTaskWithExecutor).not.toHaveBeenCalled();
  });

  it.each([ProcurementStatus.ARRIVED, ProcurementStatus.CANCELLED])('does not edit historical %s records', async status => {
    const { service, tx } = setup(status, actualArrival);
    await expect(service.updateProcurement('project-1', 'procurement-1', { arrivalDate: null }, actor)).rejects.toThrow('不允许编辑');
    expect(tx.paintProcurement.updateMany).not.toHaveBeenCalled();
  });

  it.each([ProcurementStatus.DRAFT, ProcurementStatus.ORDERED])('cannot complete procurement while only %s exists, even with a date', async status => {
    const { service, workflow } = setup(status, actualArrival);
    await expect(service.completeTask('project-1', actor)).rejects.toThrow('没有已到货');
    expect(workflow.transitionTaskWithExecutor).not.toHaveBeenCalled();
  });

  it('retains explicit completion after arrival', async () => {
    const { service, workflow } = setup(ProcurementStatus.ARRIVED, actualArrival);
    await service.completeTask('project-1', actor);
    expect(workflow.transitionTaskWithExecutor).toHaveBeenCalledExactlyOnceWith(
      expect.anything(), 'task-1', 'COMPLETE', actor, expect.objectContaining({
        metadata: { procurementCount: 1, arrivedCount: 1 },
      }),
    );
  });

  it('keeps team admission and concurrent state checks on undated writes', async () => {
    const { service, prisma, tx, audit } = setup();
    await expect(service.createProcurement('project-1', { ...form, arrivalDate: '' }, { ...actor, teamAccessApproved: false })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    tx.paintProcurement.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.updateProcurement('project-1', 'procurement-1', { arrivalDate: '' }, actor)).rejects.toThrow('采购记录或流程状态已变更');
    expect(audit.createWithExecutor).not.toHaveBeenCalled();
  });
});
