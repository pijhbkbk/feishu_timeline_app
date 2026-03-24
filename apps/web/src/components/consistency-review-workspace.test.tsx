import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  ConsistencyReviewForm,
  ConsistencyReviewHistory,
  ReviewConclusionBadge,
} from './consistency-review-workspace';
import {
  canShowConsistencyReviewSubmitButton,
  validateConsistencyReviewForm,
  type ConsistencyReviewWorkspaceResponse,
} from '../lib/consistency-reviews-client';
import type { SessionUser } from '../lib/auth-client';

const reviewerUser: SessionUser = {
  id: 'user-1',
  username: 'reviewer',
  name: '评审员',
  email: null,
  departmentId: null,
  departmentName: null,
  isSystemAdmin: false,
  authSource: 'mock',
  roleCodes: ['reviewer'],
};

const workspace: ConsistencyReviewWorkspaceResponse = {
  project: {
    id: 'project-1',
    code: 'PRJ-001',
    name: '示例项目',
    currentNodeCode: 'COLOR_CONSISTENCY_REVIEW',
    currentNodeName: '颜色一致性评审',
    targetDate: '2026-03-30T00:00:00.000Z',
    riskLevel: 'HIGH',
  },
  cabinReviewCompleted: true,
  activeTask: {
    id: 'task-1',
    taskNo: 'TASK-001',
    nodeCode: 'COLOR_CONSISTENCY_REVIEW',
    nodeName: '颜色一致性评审',
    taskRound: 1,
    status: 'IN_PROGRESS',
    isPrimary: true,
    isActive: true,
    assigneeUserId: 'user-1',
    assigneeUserName: '评审员',
    assigneeDepartmentId: null,
    assigneeDepartmentName: null,
    dueAt: '2026-03-25T00:00:00.000Z',
    startedAt: '2026-03-24T00:00:00.000Z',
    completedAt: null,
    returnedAt: null,
    payload: null,
    availableActions: ['APPROVE', 'REJECT'],
    createdAt: '2026-03-24T00:00:00.000Z',
    updatedAt: '2026-03-24T00:00:00.000Z',
  },
  downstreamTask: null,
  items: [
    {
      id: 'review-1',
      workflowTaskId: 'task-1',
      reviewType: 'COLOR_CONSISTENCY_REVIEW',
      reviewConclusion: 'APPROVED',
      reviewDate: '2026-03-24T00:00:00.000Z',
      submittedAt: null,
      reviewerId: 'user-1',
      reviewerName: '评审员',
      comment: '颜色一致性满足要求',
      conditionNote: null,
      rejectReason: null,
      returnToNodeCode: null,
      returnToNodeName: null,
      createdAt: '2026-03-24T00:00:00.000Z',
      updatedAt: '2026-03-24T00:00:00.000Z',
      attachment: null,
      attachmentHistory: [],
    },
  ],
};

describe('ConsistencyReviewWorkspace', () => {
  it('renders consistency review form fields', () => {
    const html = renderToStaticMarkup(
      <ConsistencyReviewForm
        value={{
          reviewDate: '2026-03-24',
          reviewerId: 'user-1',
          reviewConclusion: 'APPROVED',
          comment: '评审意见',
          conditionNote: '',
          rejectReason: '',
        }}
        reviewerOptions={[
          {
            id: 'user-1',
            username: 'reviewer',
            name: '评审员',
            email: null,
            departmentId: null,
            departmentName: null,
            roleCodes: ['reviewer'],
          },
        ]}
        disabled={false}
        submitLabel="保存"
        onChange={() => undefined}
        onSubmit={() => undefined}
      />,
    );

    expect(html).toContain('评审日期');
    expect(html).toContain('评审结论');
    expect(html).toContain('条件通过说明');
  });

  it('renders consistency review history rows', () => {
    const html = renderToStaticMarkup(
      <ConsistencyReviewHistory
        user={reviewerUser}
        items={workspace.items}
        selectedReviewId="review-1"
        canManage
        isReadOnly={false}
        workspace={workspace}
        actingKey={null}
        isUploading={false}
        onSelect={() => undefined}
        onEdit={() => undefined}
        onSubmitReview={() => undefined}
        onApproveReview={() => undefined}
        onRejectReview={() => undefined}
        onUploadAttachment={() => undefined}
      />,
    );

    expect(html).toContain('评审员');
    expect(html).toContain('未退回');
    expect(html).toContain('提交');
  });

  it('controls submit button logic and validation', () => {
    expect(canShowConsistencyReviewSubmitButton(reviewerUser, workspace, workspace.items[0]!)).toBe(
      true,
    );
    expect(
      validateConsistencyReviewForm({
        reviewDate: '',
        reviewerId: '',
        reviewConclusion: 'REJECTED',
        comment: '',
        conditionNote: '',
        rejectReason: '',
      }),
    ).toBe('评审日期不能为空。');

    const html = renderToStaticMarkup(
      <ReviewConclusionBadge conclusion="REJECTED" />,
    );

    expect(html).toContain('驳回');
  });
});
