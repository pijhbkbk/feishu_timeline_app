import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  SchedulePlanForm,
  SchedulePlanTable,
  ScheduleStatusBadge,
} from './schedule-plans-workspace';
import {
  canShowCompleteSchedulePlanTaskButton,
  validateSchedulePlanForm,
  type SchedulePlansWorkspaceResponse,
} from '../lib/production-plans-client';
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

const workspace: SchedulePlansWorkspaceResponse = {
  project: {
    id: 'project-1',
    code: 'PRJ-001',
    name: '示例项目',
    currentNodeCode: 'MASS_PRODUCTION_PLAN',
    currentNodeName: '排产计划',
    targetDate: '2026-03-30T00:00:00.000Z',
    riskLevel: 'HIGH',
  },
  consistencyReviewApproved: true,
  activeTask: {
    id: 'task-1',
    taskNo: 'TASK-001',
    nodeCode: 'MASS_PRODUCTION_PLAN',
    nodeName: '排产计划',
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
  downstreamMassProductionTask: null,
  canCompleteTask: true,
  completionIssue: null,
  items: [
    {
      id: 'plan-1',
      planNo: 'SP-001',
      status: 'CONFIRMED',
      planDate: '2026-03-26T00:00:00.000Z',
      plannedQuantity: 20,
      actualQuantity: null,
      workshop: '总装车间',
      lineName: '轻卡一线',
      ownerId: 'user-1',
      ownerName: '工艺工程师',
      batchNo: 'BATCH-01',
      note: '首轮排产',
      confirmedAt: '2026-03-25T00:00:00.000Z',
      confirmedById: 'user-1',
      confirmedByName: '工艺工程师',
      createdAt: '2026-03-24T00:00:00.000Z',
      updatedAt: '2026-03-25T00:00:00.000Z',
    },
  ],
};

describe('SchedulePlansWorkspace', () => {
  it('renders schedule plan form fields', () => {
    const html = renderToStaticMarkup(
      <SchedulePlanForm
        value={{
          planDate: '2026-03-26',
          plannedQuantity: '20',
          workshop: '总装车间',
          lineName: '轻卡一线',
          ownerId: 'user-1',
          batchNo: 'BATCH-01',
          note: '',
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

    expect(html).toContain('计划日期');
    expect(html).toContain('计划数量');
    expect(html).toContain('责任人');
  });

  it('renders schedule plan table rows', () => {
    const html = renderToStaticMarkup(
      <SchedulePlanTable
        items={workspace.items}
        canManage
        isReadOnly={false}
        actingKey={null}
        onEdit={() => undefined}
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );

    expect(html).toContain('SP-001');
    expect(html).toContain('总装车间');
    expect(html).toContain('已确认');
  });

  it('controls completion button logic and exposes status badge labels', () => {
    expect(canShowCompleteSchedulePlanTaskButton(processEngineerUser, workspace)).toBe(true);
    expect(
      canShowCompleteSchedulePlanTaskButton(processEngineerUser, {
        ...workspace,
        canCompleteTask: false,
        completionIssue: '没有已确认的排产计划，不能完成排产节点。',
      }),
    ).toBe(false);
    expect(
      validateSchedulePlanForm({
        planDate: '',
        plannedQuantity: '',
        workshop: '',
        lineName: '',
        ownerId: '',
        batchNo: '',
        note: '',
      }),
    ).toBe('计划日期不能为空。');

    const html = renderToStaticMarkup(<ScheduleStatusBadge status="CANCELLED" />);
    expect(html).toContain('已取消');
  });
});
