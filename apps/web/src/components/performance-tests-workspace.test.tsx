import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  CompletePerformanceTestTaskButton,
  TestItemTable,
  TestResultForm,
} from './performance-tests-workspace';
import {
  canShowCompletePerformanceTestTaskButton,
  validatePerformanceTestForm,
  type PerformanceTestsWorkspaceResponse,
} from '../lib/performance-tests-client';
import type { SessionUser } from '../lib/auth-client';

const testerUser: SessionUser = {
  id: 'user-1',
  username: 'qa',
  name: '质量工程师',
  email: null,
  departmentId: null,
  departmentName: null,
  isSystemAdmin: false,
  authSource: 'mock',
  roleCodes: ['quality_engineer'],
};

const workspace: PerformanceTestsWorkspaceResponse = {
  project: {
    id: 'project-1',
    code: 'PRJ-001',
    name: '示例项目',
    currentNodeCode: 'FIRST_UNIT_PRODUCTION_PLAN',
    currentNodeName: '首台生产计划',
    targetDate: '2026-03-28T00:00:00.000Z',
    riskLevel: 'HIGH',
  },
  procurementCompleted: true,
  activeTask: {
    id: 'task-1',
    taskNo: 'TASK-1',
    nodeCode: 'PERFORMANCE_TEST',
    nodeName: '涂料性能试验',
    taskRound: 1,
    status: 'READY',
    isPrimary: false,
    isActive: true,
    assigneeUserId: 'user-1',
    assigneeUserName: '质量工程师',
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
  sampleOptions: [
    {
      id: 'sample-1',
      sampleNo: 'SP-001',
      sampleName: '左翼子板',
      versionNo: 2,
    },
  ],
  statistics: {
    totalCount: 1,
    submittedCount: 1,
  },
  items: [
    {
      id: 'test-1',
      testCode: 'PT-001',
      sampleId: 'sample-1',
      relatedObjectName: null,
      testItem: 'ADHESION',
      standardValue: '>= 90',
      actualValue: '93',
      result: 'PASS',
      conclusion: '满足要求',
      testedById: 'user-1',
      testedByName: '质量工程师',
      testedAt: '2026-03-21T08:00:00.000Z',
      status: 'SUBMITTED',
      submittedAt: '2026-03-21T09:00:00.000Z',
      createdAt: '2026-03-20T08:00:00.000Z',
      updatedAt: '2026-03-21T09:00:00.000Z',
      sample: {
        id: 'sample-1',
        sampleNo: 'SP-001',
        sampleName: '左翼子板',
        versionNo: 2,
      },
      reportAttachment: null,
    },
  ],
};

describe('PerformanceTestsWorkspace', () => {
  it('renders test form fields', () => {
    const html = renderToStaticMarkup(
      <TestResultForm
        value={{
          testCode: 'PT-001',
          sampleId: 'sample-1',
          relatedObjectName: '',
          testItem: 'ADHESION',
          standardValue: '>= 90',
          actualValue: '93',
          result: 'PASS',
          conclusion: '满足要求',
          testedById: 'user-1',
          testedAt: '2026-03-21T08:00',
        }}
        sampleOptions={workspace.sampleOptions}
        testerOptions={[
          {
            id: 'user-1',
            username: 'qa',
            name: '质量工程师',
            email: null,
            departmentId: null,
            departmentName: null,
            roleCodes: ['quality_engineer'],
          },
        ]}
        disabled={false}
        submitLabel="保存"
        onChange={() => undefined}
        onSubmit={() => undefined}
      />,
    );

    expect(html).toContain('试验编码');
    expect(html).toContain('试验项目');
    expect(html).toContain('试验结论');
  });

  it('renders performance test record list rows', () => {
    const html = renderToStaticMarkup(
      <TestItemTable
        items={workspace.items}
        selectedTestId="test-1"
        canManage
        isReadOnly={false}
        actingKey={null}
        onSelect={() => undefined}
        onEdit={() => undefined}
        onSubmitRecord={() => undefined}
      />,
    );

    expect(html).toContain('PT-001');
    expect(html).toContain('附着力');
    expect(html).toContain('满足要求');
    expect(html).toContain('已提交');
  });

  it('disables complete button when no valid submitted conclusion exists', () => {
    expect(canShowCompletePerformanceTestTaskButton(testerUser, workspace)).toBe(true);
    expect(
      canShowCompletePerformanceTestTaskButton(testerUser, {
        ...workspace,
        canCompleteTask: false,
        completionIssue: '没有有效试验结论时不能完成性能试验节点。',
      }),
    ).toBe(false);

    const html = renderToStaticMarkup(
      <CompletePerformanceTestTaskButton disabled onClick={() => undefined} />,
    );

    expect(validatePerformanceTestForm({
      testCode: '',
      sampleId: '',
      relatedObjectName: '',
      testItem: 'ADHESION',
      standardValue: '',
      actualValue: '',
      result: 'PASS',
      conclusion: '',
      testedById: '',
      testedAt: '',
    })).toBe('试验编码不能为空。');
    expect(html).toContain('完成性能试验节点');
  });
});
