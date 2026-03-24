import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  BoardVersionPanel,
  CompleteStandardBoardTaskButton,
  DistributionRecordTable,
  StandardBoardList,
} from './standard-boards-workspace';
import {
  canShowCompleteStandardBoardTaskButton,
  validateStandardBoardForm,
  type StandardBoardWorkspaceResponse,
} from '../lib/standard-boards-client';
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

const workspace: StandardBoardWorkspaceResponse = {
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
  activeStandardBoardTask: {
    id: 'task-1',
    taskNo: 'TASK-1',
    nodeCode: 'STANDARD_BOARD_PRODUCTION',
    nodeName: '标准板制作、下发',
    taskRound: 1,
    status: 'READY',
    isPrimary: false,
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
  activeColorBoardDetailUpdateTask: null,
  canCompleteStandardBoardTask: true,
  standardBoardCompletionIssue: null,
  canCompleteColorBoardDetailUpdateTask: false,
  colorBoardDetailUpdateCompletionIssue: '没有明细更新记录时不能完成色板明细更新节点。',
  sampleOptions: [],
  currentBoard: {
    id: 'board-2',
    boardCode: 'SB-001',
    versionNo: 2,
    basedOnSampleId: null,
    status: 'ISSUED',
    isCurrent: true,
    producedAt: '2026-03-20T00:00:00.000Z',
    issuedAt: '2026-03-21T00:00:00.000Z',
    issuedById: 'user-1',
    issuedByName: '工艺工程师',
    recipientName: '张三',
    recipientDept: '涂装部',
    remark: '当前有效版本',
    createdAt: '2026-03-19T00:00:00.000Z',
    updatedAt: '2026-03-21T00:00:00.000Z',
    basedOnSample: null,
    distributions: [
      {
        id: 'dist-1',
        receiverName: '张三',
        receiverDept: '涂装部',
        sentAt: '2026-03-21T01:00:00.000Z',
        signedAt: '2026-03-21T02:00:00.000Z',
        note: '已签收',
        createdAt: '2026-03-21T01:00:00.000Z',
        updatedAt: '2026-03-21T02:00:00.000Z',
      },
    ],
  },
  items: [
    {
      id: 'board-1',
      boardCode: 'SB-001',
      versionNo: 1,
      basedOnSampleId: null,
      status: 'CREATED',
      isCurrent: false,
      producedAt: '2026-03-19T00:00:00.000Z',
      issuedAt: null,
      issuedById: null,
      issuedByName: null,
      recipientName: null,
      recipientDept: null,
      remark: '历史版本',
      createdAt: '2026-03-18T00:00:00.000Z',
      updatedAt: '2026-03-19T00:00:00.000Z',
      basedOnSample: null,
      distributions: [],
    },
    {
      id: 'board-2',
      boardCode: 'SB-001',
      versionNo: 2,
      basedOnSampleId: null,
      status: 'ISSUED',
      isCurrent: true,
      producedAt: '2026-03-20T00:00:00.000Z',
      issuedAt: '2026-03-21T00:00:00.000Z',
      issuedById: 'user-1',
      issuedByName: '工艺工程师',
      recipientName: '张三',
      recipientDept: '涂装部',
      remark: '当前有效版本',
      createdAt: '2026-03-19T00:00:00.000Z',
      updatedAt: '2026-03-21T00:00:00.000Z',
      basedOnSample: null,
      distributions: [
        {
          id: 'dist-1',
          receiverName: '张三',
          receiverDept: '涂装部',
          sentAt: '2026-03-21T01:00:00.000Z',
          signedAt: '2026-03-21T02:00:00.000Z',
          note: '已签收',
          createdAt: '2026-03-21T01:00:00.000Z',
          updatedAt: '2026-03-21T02:00:00.000Z',
        },
      ],
    },
  ],
  detailUpdates: [],
};

describe('StandardBoardsWorkspace', () => {
  it('renders standard board list rows', () => {
    const html = renderToStaticMarkup(
      <StandardBoardList
        items={workspace.items}
        selectedBoardId="board-2"
        canManage
        isReadOnly={false}
        actingKey={null}
        onSelect={() => undefined}
        onEdit={() => undefined}
        onSetCurrent={() => undefined}
        onMarkCreated={() => undefined}
      />,
    );

    expect(html).toContain('SB-001');
    expect(html).toContain('当前有效');
    expect(html).toContain('已下发');
  });

  it('marks current version in version panel', () => {
    const html = renderToStaticMarkup(
      <BoardVersionPanel
        items={workspace.items}
        currentBoardId="board-2"
        selectedBoard={workspace.currentBoard}
        onSelect={() => undefined}
      />,
    );

    expect(html).toContain('当前有效');
    expect(html).toContain('V2');
  });

  it('renders distribution records', () => {
    const html = renderToStaticMarkup(
      <DistributionRecordTable items={workspace.currentBoard?.distributions ?? []} />,
    );

    expect(html).toContain('张三');
    expect(html).toContain('涂装部');
    expect(html).toContain('已签收');
  });

  it('controls complete button visibility and validation logic', () => {
    expect(canShowCompleteStandardBoardTaskButton(engineerUser, workspace)).toBe(true);
    expect(
      canShowCompleteStandardBoardTaskButton(engineerUser, {
        ...workspace,
        canCompleteStandardBoardTask: false,
        standardBoardCompletionIssue: '没有已下发的标准板时不能完成标准板节点。',
      }),
    ).toBe(false);

    const html = renderToStaticMarkup(
      <CompleteStandardBoardTaskButton disabled onClick={() => undefined} />,
    );

    expect(
      validateStandardBoardForm({
        boardCode: '',
        versionNo: '',
        basedOnSampleId: '',
        remark: '',
      }),
    ).toBe('标准板编号不能为空。');
    expect(html).toContain('完成标准板节点');
  });
});
