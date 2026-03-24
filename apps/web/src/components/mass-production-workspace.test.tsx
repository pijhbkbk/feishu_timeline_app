import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  MassProductionForm,
  MassProductionTable,
  ProductionStatusBadge,
} from './mass-production-workspace';
import {
  canShowCompleteMassProductionTaskButton,
  validateMassProductionForm,
  type MassProductionWorkspaceResponse,
} from '../lib/mass-production-client';
import type { SessionUser } from '../lib/auth-client';

const processEngineerUser: SessionUser = {
  id: 'user-1',
  username: 'process',
  name: '工艺工程师',
  email: null,
  departmentId: null,
  departmentName: null,
  isSystemAdmin: false,
  authSource: 'mock',
  roleCodes: ['process_engineer'],
};

const workspace: MassProductionWorkspaceResponse = {
  project: {
    id: 'project-1',
    code: 'PRJ-001',
    name: '示例项目',
    currentNodeCode: 'MASS_PRODUCTION',
    currentNodeName: '批量生产',
    targetDate: '2026-03-30T00:00:00.000Z',
    riskLevel: 'HIGH',
  },
  schedulePlanCompleted: true,
  activeTask: {
    id: 'task-1',
    taskNo: 'TASK-001',
    nodeCode: 'MASS_PRODUCTION',
    nodeName: '批量生产',
    taskRound: 1,
    status: 'IN_PROGRESS',
    isPrimary: true,
    isActive: true,
    assigneeUserId: 'user-1',
    assigneeUserName: '工艺工程师',
    assigneeDepartmentId: null,
    assigneeDepartmentName: null,
    dueAt: '2026-03-25T00:00:00.000Z',
    startedAt: '2026-03-24T00:00:00.000Z',
    completedAt: null,
    returnedAt: null,
    payload: null,
    availableActions: ['COMPLETE'],
    createdAt: '2026-03-24T00:00:00.000Z',
    updatedAt: '2026-03-24T00:00:00.000Z',
  },
  downstreamVisualReviewTask: null,
  canCompleteTask: true,
  completionIssue: null,
  items: [
    {
      id: 'record-1',
      planNo: 'MP-001',
      status: 'COMPLETED',
      productionDate: '2026-03-26T00:00:00.000Z',
      plannedQuantity: 20,
      actualQuantity: 18,
      workshop: '总装车间',
      lineName: '轻卡一线',
      ownerId: 'user-1',
      ownerName: '工艺工程师',
      batchNo: 'BATCH-01',
      exceptionNote: '无',
      actualStartAt: '2026-03-26T08:00:00.000Z',
      actualEndAt: '2026-03-26T18:00:00.000Z',
      createdAt: '2026-03-24T00:00:00.000Z',
      updatedAt: '2026-03-26T18:00:00.000Z',
    },
  ],
};

describe('MassProductionWorkspace', () => {
  it('renders mass production form fields', () => {
    const html = renderToStaticMarkup(
      <MassProductionForm
        value={{
          productionDate: '2026-03-26',
          batchNo: 'BATCH-01',
          plannedQuantity: '20',
          actualQuantity: '18',
          workshop: '总装车间',
          lineName: '轻卡一线',
          ownerId: 'user-1',
          exceptionNote: '',
          status: 'DRAFT',
        }}
        ownerOptions={[
          {
            id: 'user-1',
            username: 'process',
            name: '工艺工程师',
            email: null,
            departmentId: null,
            departmentName: null,
            roleCodes: ['process_engineer'],
          },
        ]}
        disabled={false}
        submitLabel="保存"
        onChange={() => undefined}
        onSubmit={() => undefined}
      />,
    );

    expect(html).toContain('生产日期');
    expect(html).toContain('生产批次');
    expect(html).toContain('异常说明');
  });

  it('renders mass production table rows', () => {
    const html = renderToStaticMarkup(
      <MassProductionTable
        items={workspace.items}
        canManage
        isReadOnly={false}
        actingKey={null}
        onEdit={() => undefined}
        onStart={() => undefined}
        onComplete={() => undefined}
        onCancel={() => undefined}
      />,
    );

    expect(html).toContain('MP-001');
    expect(html).toContain('总装车间');
    expect(html).toContain('已完成');
  });

  it('controls completion button logic and status display', () => {
    expect(canShowCompleteMassProductionTaskButton(processEngineerUser, workspace)).toBe(true);
    expect(
      canShowCompleteMassProductionTaskButton(processEngineerUser, {
        ...workspace,
        canCompleteTask: false,
        completionIssue: '没有已完成的批量生产记录，不能完成批量生产节点。',
      }),
    ).toBe(false);
    expect(
      validateMassProductionForm({
        productionDate: '',
        batchNo: '',
        plannedQuantity: '',
        actualQuantity: '',
        workshop: '',
        lineName: '',
        ownerId: '',
        exceptionNote: '',
        status: 'DRAFT',
      }),
    ).toBe('生产日期不能为空。');

    const html = renderToStaticMarkup(<ProductionStatusBadge status="CANCELLED" />);
    expect(html).toContain('已取消');
  });
});
