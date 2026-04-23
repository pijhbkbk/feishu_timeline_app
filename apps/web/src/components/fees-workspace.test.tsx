import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { FeeRecordTable } from './fees-workspace';
import {
  FIXED_DEVELOPMENT_FEE_AMOUNT,
  canShowCompleteFeeTaskButton,
  validateFeeForm,
  type FeesWorkspaceResponse,
} from '../lib/fees-client';
import type { SessionUser } from '../lib/auth-client';

const financeUser: SessionUser = {
  id: 'user-1',
  username: 'finance',
  name: '财务',
  email: null,
  departmentId: null,
  departmentName: null,
  isSystemAdmin: false,
  authSource: 'mock',
  roleCodes: ['finance'],
};

const workspace: FeesWorkspaceResponse = {
  project: {
    id: 'project-1',
    code: 'PRJ-001',
    name: '示例项目',
    currentNodeCode: 'COLOR_CONSISTENCY_REVIEW',
    currentNodeName: '颜色一致性评审',
    targetDate: '2026-03-30T00:00:00.000Z',
    riskLevel: 'HIGH',
  },
  cabinReviewApproved: true,
  activeTask: {
    id: 'task-1',
    taskNo: 'TASK-001',
    nodeCode: 'DEVELOPMENT_ACCEPTANCE',
    nodeName: '颜色开发收费',
    taskRound: 1,
    status: 'IN_PROGRESS',
    isPrimary: false,
    isActive: true,
    assigneeUserId: 'user-1',
    assigneeUserName: '财务',
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
  canCompleteTask: true,
  completionIssue: null,
  statistics: {
    totalCount: 1,
    pendingCount: 0,
    recordedCount: 0,
    paidCount: 1,
    cancelledCount: 0,
  },
  items: [
    {
      id: 'fee-1',
      feeType: 'PAINT_DEVELOPMENT',
      amount: '1000',
      currency: 'CNY',
      payer: '市场部',
      payStatus: 'PAID',
      recordedById: 'user-1',
      recordedByName: '财务',
      createdById: 'user-1',
      createdByName: '财务',
      recordedAt: '2026-03-24T00:00:00.000Z',
      completedAt: '2026-03-25T00:00:00.000Z',
      cancelledAt: null,
      note: '首批开发收费',
      createdAt: '2026-03-24T00:00:00.000Z',
      updatedAt: '2026-03-25T00:00:00.000Z',
    },
  ],
};

describe('FeesWorkspace', () => {
  it('renders fee record list rows', () => {
    const html = renderToStaticMarkup(
      <FeeRecordTable
        items={workspace.items}
        canManage
        isReadOnly={false}
        actingKey={null}
        onEdit={() => undefined}
        onMarkRecorded={() => undefined}
        onMarkPaid={() => undefined}
        onCancel={() => undefined}
      />,
    );

    expect(html).toContain('市场部');
    expect(html).toContain('1000');
    expect(html).toContain('已支付');
  });

  it('validates fee form input before submit', () => {
    expect(
      validateFeeForm({
        feeType: 'PAINT_DEVELOPMENT',
        amount: '',
        currency: '',
        payer: '',
        payStatus: 'PENDING',
        recordedAt: '',
        note: '',
      }),
    ).toBe('金额不能为空。');
  });

  it('locks fee amount to the fixed 10000 rule', () => {
    expect(
      validateFeeForm({
        feeType: 'PAINT_DEVELOPMENT',
        amount: '9000',
        currency: 'CNY',
        payer: '市场部',
        payStatus: 'PENDING',
        recordedAt: '2026-03-24T00:00:00.000Z',
        note: '',
      }),
    ).toBe('颜色开发收费固定金额为 10000。');

    expect(
      validateFeeForm({
        feeType: 'PAINT_DEVELOPMENT',
        amount: FIXED_DEVELOPMENT_FEE_AMOUNT,
        currency: 'CNY',
        payer: '市场部',
        payStatus: 'PENDING',
        recordedAt: '2026-03-24T00:00:00.000Z',
        note: '',
      }),
    ).toBeNull();
  });

  it('shows complete button only when permission and completion conditions are both satisfied', () => {
    expect(canShowCompleteFeeTaskButton(financeUser, workspace)).toBe(true);
    expect(
      canShowCompleteFeeTaskButton(financeUser, {
        ...workspace,
        canCompleteTask: false,
        completionIssue: '没有已支付的收费记录，不能完成收费节点。',
      }),
    ).toBe(false);
  });
});
