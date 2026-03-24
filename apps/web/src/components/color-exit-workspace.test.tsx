import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  ColorExitForm,
  ColorExitSummaryCard,
  ExitStatusBadge,
} from './color-exit-workspace';
import {
  canShowCompleteColorExitButton,
  validateColorExitForm,
  type ColorExitWorkspaceResponse,
} from '../lib/color-exits-client';
import type { SessionUser } from '../lib/auth-client';

const processEngineerUser: SessionUser = {
  id: 'user-1',
  username: 'pe',
  name: '工艺工程师',
  email: null,
  departmentId: null,
  departmentName: null,
  isSystemAdmin: false,
  authSource: 'mock',
  roleCodes: ['process_engineer'],
};

const workspace: ColorExitWorkspaceResponse = {
  project: {
    id: 'project-1',
    code: 'PRJ-001',
    name: '示例项目',
    currentNodeCode: 'PROJECT_CLOSED',
    currentNodeName: '颜色退出',
    targetDate: '2026-03-30T00:00:00.000Z',
    riskLevel: 'HIGH',
    status: 'IN_PROGRESS',
    actualEndDate: null,
  },
  visualDeltaApproved: true,
  activeTask: {
    id: 'task-1',
    taskNo: 'TASK-001',
    nodeCode: 'PROJECT_CLOSED',
    nodeName: '颜色退出',
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
  currentColor: {
    id: 'color-1',
    code: 'C-001',
    name: '星雾灰',
    status: 'APPROVED',
    exitFlag: false,
    exitDate: null,
  },
  replacementOptions: [
    {
      id: 'color-2',
      code: 'C-002',
      name: '玄夜黑',
      status: 'ACTIVE',
      isPrimary: false,
    },
  ],
  canCompleteTask: true,
  completionIssue: null,
  items: [
    {
      id: 'exit-1',
      workflowTaskId: 'task-1',
      colorId: 'color-1',
      colorName: '星雾灰',
      colorCode: 'C-001',
      replacementColorId: 'color-2',
      replacementColorName: '玄夜黑',
      replacementColorCode: 'C-002',
      operatorId: 'user-1',
      operatorName: '工艺工程师',
      exitDate: '2026-03-25T00:00:00.000Z',
      exitReason: '颜色淘汰',
      description: '市场策略调整',
      completedAt: null,
      createdAt: '2026-03-24T00:00:00.000Z',
      updatedAt: '2026-03-24T00:00:00.000Z',
    },
  ],
};

describe('ColorExitWorkspace', () => {
  it('renders color exit form fields', () => {
    const html = renderToStaticMarkup(
      <ColorExitForm
        value={{
          exitDate: '2026-03-25',
          exitReason: '颜色淘汰',
          description: '市场策略调整',
          replacementColorId: 'color-2',
        }}
        replacementOptions={workspace.replacementOptions}
        disabled={false}
        submitLabel="保存"
        onChange={() => undefined}
        onSubmit={() => undefined}
      />,
    );

    expect(html).toContain('退出日期');
    expect(html).toContain('退出原因');
    expect(html).toContain('替代颜色');
  });

  it('controls complete button visibility and validation', () => {
    expect(
      canShowCompleteColorExitButton(processEngineerUser, workspace, workspace.items[0]!),
    ).toBe(true);
    expect(
      validateColorExitForm({
        exitDate: '',
        exitReason: '',
        description: '',
        replacementColorId: '',
      }),
    ).toBe('退出日期不能为空。');
  });

  it('renders summary and completion status', () => {
    const summaryHtml = renderToStaticMarkup(
      <ColorExitSummaryCard
        workspace={workspace}
        record={workspace.items[0]!}
        canManage
        canComplete
        actingKey={null}
        onEdit={() => undefined}
        onComplete={() => undefined}
      />,
    );

    expect(summaryHtml).toContain('星雾灰');
    expect(summaryHtml).toContain('玄夜黑');
    expect(summaryHtml).toContain('完成颜色退出');

    const badgeHtml = renderToStaticMarkup(<ExitStatusBadge completed />);
    expect(badgeHtml).toContain('已完成');
  });
});
