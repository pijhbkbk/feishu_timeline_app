import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  CompleteFirstPlanTaskButton,
  FirstProductionPlanForm,
  TrialIssueList,
} from './pilot-production-workspace';
import {
  canShowCompleteFirstProductionPlanTaskButton,
  validateFirstProductionPlanForm,
  type FirstProductionPlanWorkspaceResponse,
} from '../lib/pilot-productions-client';
import type { SessionUser } from '../lib/auth-client';

const engineerUser: SessionUser = {
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

const firstPlanWorkspace: FirstProductionPlanWorkspaceResponse = {
  project: {
    id: 'project-1',
    code: 'PRJ-001',
    name: '示例项目',
    currentNodeCode: 'TRIAL_PRODUCTION',
    currentNodeName: '样车试制',
    targetDate: '2026-03-28T00:00:00.000Z',
    riskLevel: 'HIGH',
  },
  procurementCompleted: true,
  activeTask: {
    id: 'task-1',
    taskNo: 'TASK-1',
    nodeCode: 'FIRST_UNIT_PRODUCTION_PLAN',
    nodeName: '首台生产计划',
    taskRound: 1,
    status: 'READY',
    isPrimary: true,
    isActive: true,
    assigneeUserId: 'user-1',
    assigneeUserName: '工艺工程师',
    assigneeDepartmentId: null,
    assigneeDepartmentName: null,
    dueAt: '2026-03-24T00:00:00.000Z',
    startedAt: null,
    completedAt: null,
    returnedAt: null,
    payload: null,
    availableActions: ['START', 'COMPLETE'],
    createdAt: '2026-03-20T00:00:00.000Z',
    updatedAt: '2026-03-20T00:00:00.000Z',
  },
  canCompleteTask: true,
  completionIssue: null,
  downstreamTrialProductionTask: null,
  items: [
    {
      id: 'plan-1',
      planNo: 'FPP-001',
      status: 'PLANNED',
      planDate: '2026-03-24T00:00:00.000Z',
      plannedQuantity: 2,
      actualQuantity: null,
      workshop: '涂装车间',
      lineName: '一线',
      ownerId: 'user-1',
      ownerName: '工艺工程师',
      batchNo: 'BATCH-001',
      note: '已确认',
      confirmedAt: '2026-03-23T00:00:00.000Z',
      confirmedById: 'user-1',
      confirmedByName: '工艺工程师',
      createdAt: '2026-03-22T00:00:00.000Z',
      updatedAt: '2026-03-23T00:00:00.000Z',
    },
  ],
};

describe('PilotProductionWorkspace', () => {
  it('renders first production plan form fields', () => {
    const html = renderToStaticMarkup(
      <FirstProductionPlanForm
        value={{
          planDate: '2026-03-24',
          plannedQuantity: '2',
          workshop: '涂装车间',
          lineName: '一线',
          ownerId: 'user-1',
          batchNo: 'BATCH-001',
          note: '备注',
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

  it('renders trial issue list rows', () => {
    const html = renderToStaticMarkup(
      <TrialIssueList
        items={[
          {
            id: 'issue-1',
            issueType: '外观',
            description: '局部流挂',
            severity: 'HIGH',
            responsibleDept: '涂装车间',
            createdAt: '2026-03-24T00:00:00.000Z',
            updatedAt: '2026-03-24T00:00:00.000Z',
          },
        ]}
      />,
    );

    expect(html).toContain('外观');
    expect(html).toContain('局部流挂');
    expect(html).toContain('涂装车间');
  });

  it('controls complete button visibility and validation logic', () => {
    expect(canShowCompleteFirstProductionPlanTaskButton(engineerUser, firstPlanWorkspace)).toBe(
      true,
    );
    expect(
      canShowCompleteFirstProductionPlanTaskButton(engineerUser, {
        ...firstPlanWorkspace,
        canCompleteTask: false,
        completionIssue: '首台计划未确认时不能完成首台节点。',
      }),
    ).toBe(false);

    const html = renderToStaticMarkup(
      <CompleteFirstPlanTaskButton disabled onClick={() => undefined} />,
    );

    expect(
      validateFirstProductionPlanForm({
        planDate: '',
        plannedQuantity: '',
        workshop: '',
        lineName: '',
        ownerId: '',
        batchNo: '',
        note: '',
      }),
    ).toBe('计划日期不能为空。');
    expect(html).toContain('完成首台计划节点');
  });
});
