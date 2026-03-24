import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  CabinReviewForm,
  CabinReviewHistory,
  ReviewConclusionBadge,
} from './cabin-review-workspace';
import {
  canShowCabinReviewApproveButton,
  validateCabinReviewForm,
  type CabinReviewWorkspaceResponse,
} from '../lib/reviews-client';
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

const workspace: CabinReviewWorkspaceResponse = {
  project: {
    id: 'project-1',
    code: 'PRJ-001',
    name: '示例项目',
    currentNodeCode: 'CAB_REVIEW',
    currentNodeName: '样车驾驶室评审',
    targetDate: '2026-03-30T00:00:00.000Z',
    riskLevel: 'HIGH',
  },
  trialProductionCompleted: true,
  activeTask: {
    id: 'task-1',
    taskNo: 'TASK-001',
    nodeCode: 'CAB_REVIEW',
    nodeName: '样车驾驶室评审',
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
  downstreamTasks: {
    developmentFee: null,
    consistencyReview: null,
  },
  latestTrialProduction: {
    id: 'trial-1',
    vehicleNo: 'CAR-001',
    completedAt: '2026-03-23T00:00:00.000Z',
    result: 'PASS',
    issueSummary: '无重大问题',
  },
  items: [
    {
      id: 'review-1',
      workflowTaskId: 'task-1',
      reviewType: 'CAB_REVIEW',
      reviewConclusion: 'CONDITIONAL_APPROVED',
      reviewDate: '2026-03-24T00:00:00.000Z',
      submittedAt: '2026-03-24T01:00:00.000Z',
      reviewerId: 'user-1',
      reviewerName: '评审员',
      comment: '建议补充说明',
      conditionNote: '批量前复核内饰对色',
      rejectReason: null,
      returnToNodeCode: null,
      returnToNodeName: null,
      createdAt: '2026-03-24T00:00:00.000Z',
      updatedAt: '2026-03-24T01:00:00.000Z',
      trialProduction: {
        id: 'trial-1',
        vehicleNo: 'CAR-001',
        result: 'PASS',
        completedAt: '2026-03-23T00:00:00.000Z',
      },
      attachment: {
        id: 'attachment-1',
        targetType: 'REVIEW_RECORD',
        targetId: 'review-1',
        fileName: '评审照片.png',
        fileExtension: 'png',
        contentType: 'image/png',
        fileSize: 1024,
        objectKey: 'review/1.png',
        createdAt: '2026-03-24T01:00:00.000Z',
        contentUrl: '/api/attachments/attachment-1/content',
      },
      attachmentHistory: [],
    },
  ],
};

describe('CabinReviewWorkspace', () => {
  it('renders cabin review form fields', () => {
    const html = renderToStaticMarkup(
      <CabinReviewForm
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
    expect(html).toContain('驳回原因');
  });

  it('renders review history rows', () => {
    const html = renderToStaticMarkup(
      <CabinReviewHistory
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
    expect(html).toContain('评审照片.png');
    expect(html).toContain('条件通过');
  });

  it('controls approve button logic and validation', () => {
    expect(canShowCabinReviewApproveButton(reviewerUser, workspace, workspace.items[0]!)).toBe(
      true,
    );
    expect(
      validateCabinReviewForm({
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
