import { canManageVisualDeltaReviews } from '../lib/visual-delta-reviews-client';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  ReviewResultBadge,
  VisualDeltaReviewForm,
  VisualDeltaReviewHistory,
} from './visual-delta-review-workspace';
import {
  canWriteVisualDeltaMonth,
  canWriteVisualDeltaRecord,
  canShowVisualDeltaReviewApproveButton,
  canShowVisualDeltaReviewSubmitButton,
  getVisualDeltaReviewApprovalSuccessMessage,
  validateVisualDeltaReviewForm,
  type VisualDeltaReviewWorkspaceResponse,
} from '../lib/visual-delta-reviews-client';
import type { SessionUser } from '../lib/auth-client';

const reviewerUser: SessionUser = {
  id: 'user-1',
  username: 'reviewer',
  name: '评审员',
  email: null,
  departmentId: null,
  departmentName: null,
  isSystemAdmin: false,
  authSource: 'local',
  teamAccessApproved: true,
  roleCodes: ['quality_engineer'],
};

const workspace: VisualDeltaReviewWorkspaceResponse = {
  project: {
    id: 'project-1',
    code: 'PRJ-001',
    name: '示例项目',
    currentNodeCode: 'VISUAL_COLOR_DIFFERENCE_REVIEW',
    currentNodeName: '色差目视评审',
    targetDate: '2026-03-30T00:00:00.000Z',
    riskLevel: 'HIGH',
  },
  massProductionCompleted: true,
  monthlyPlanActive: true,
  recurringTasks: [{ id: 'month-1', periodIndex: 1, periodLabel: '2026-03', plannedDate: '2026-03-01T00:00:00Z', dueAt: null, reviewerId: 'user-1', status: 'PENDING' }],
  activeTask: {
    id: 'task-1',
    taskNo: 'TASK-001',
    nodeCode: 'VISUAL_COLOR_DIFFERENCE_REVIEW',
    nodeName: '色差目视评审',
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
      reviewType: 'VISUAL_COLOR_DIFFERENCE_REVIEW',
      reviewPeriod: '2026-03',
      isPeriodCompleted: false,
      reviewConclusion: 'APPROVED',
      reviewDate: '2026-03-24T00:00:00.000Z',
      submittedAt: null,
      reviewerId: 'user-1',
      reviewerName: '评审员',
      comment: '目视色差满足要求',
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

describe('VisualDeltaReviewWorkspace', () => {
  it('keeps prior-stage records read-only after monthly rework', () => {
    const old = { ...workspace.items[0]!, workflowTaskId: 'old-parent-17' };
    expect(canWriteVisualDeltaRecord(reviewerUser, workspace, old)).toBe(false);
    expect(canShowVisualDeltaReviewSubmitButton(reviewerUser, workspace, old)).toBe(false);
    expect(canShowVisualDeltaReviewApproveButton(reviewerUser, workspace, { ...old, submittedAt: '2026-03-24T00:00:00Z' })).toBe(false);
    expect(canWriteVisualDeltaRecord(reviewerUser, workspace, workspace.items[0]!)).toBe(true);
  });
  it('renders visual delta review form fields', () => {
    const html = renderToStaticMarkup(
      <VisualDeltaReviewForm
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
            name: '评审员',
            departmentId: null,
            departmentName: null,
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

  it('renders visual delta review history rows', () => {
    const html = renderToStaticMarkup(
      <VisualDeltaReviewHistory
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
    expect(canShowVisualDeltaReviewSubmitButton(reviewerUser, workspace, workspace.items[0]!)).toBe(
      true,
    );
    expect(
      validateVisualDeltaReviewForm({
        reviewDate: '',
        reviewerId: '',
        reviewConclusion: 'REJECTED',
        comment: '',
        conditionNote: '',
        rejectReason: '',
      }),
    ).toBe('评审日期不能为空。');

    const html = renderToStaticMarkup(<ReviewResultBadge conclusion="REJECTED" />);
    expect(html).toContain('驳回');
  });

  it('hides repeat approval for a completed month and keeps downstream copy accurate', () => {
    const completedReview = {
      ...workspace.items[0]!,
      submittedAt: '2026-03-24T01:00:00.000Z',
      isPeriodCompleted: true,
    };

    expect(
      canShowVisualDeltaReviewApproveButton(reviewerUser, workspace, completedReview),
    ).toBe(false);
    expect(getVisualDeltaReviewApprovalSuccessMessage(workspace)).toContain('完成 12/12 后');
    expect(
      getVisualDeltaReviewApprovalSuccessMessage({
        ...workspace,
        downstreamTask: workspace.activeTask,
      }),
    ).toContain('已激活');

    const html = renderToStaticMarkup(
      <VisualDeltaReviewHistory
        user={reviewerUser}
        items={[completedReview]}
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

    expect(html).toContain('已完成');
    expect(html).not.toContain('>通过</button>');
  });
});

describe('single-department review admission', () => {
  it('allows an approved member without a legacy review role, while retaining own-signature rules', () => {
    const member = { ...reviewerUser, roleCodes: [] };
    expect(canManageVisualDeltaReviews(member, member.id)).toBe(true);
    expect(canManageVisualDeltaReviews(member, 'another-author')).toBe(false);
  });
  it('does not admit an unapproved account through a legacy role', () => {
    expect(canManageVisualDeltaReviews({ ...reviewerUser, teamAccessApproved: false })).toBe(false);
    expect(canManageVisualDeltaReviews({ ...reviewerUser, authSource: 'mock' })).toBe(false);
  });
});


describe('M1 monthly admission matches current server rules', () => {
  const member: SessionUser = { ...reviewerUser, roleCodes: [] };
  const now = '2026-03-25T00:00:00.000Z';
  const withMonthOwner = (reviewerId: string | null): VisualDeltaReviewWorkspaceResponse => ({
    ...workspace, businessTime: now,
    recurringTasks: [{ ...workspace.recurringTasks[0]!, reviewerId }],
  });

  it.each([null, 'historical-other-owner'])('allows an admitted member’s own draft when the month owner is %s', owner => {
    const current = withMonthOwner(owner), month = current.recurringTasks[0]!, own = current.items[0]!;
    expect(canWriteVisualDeltaMonth(member, current, month)).toBe(true);
    expect(canWriteVisualDeltaRecord(member, current, own)).toBe(true);
    expect(canShowVisualDeltaReviewSubmitButton(member, current, own)).toBe(true);
    expect(canShowVisualDeltaReviewApproveButton(member, current, { ...own, submittedAt: now })).toBe(true);
    const html = renderToStaticMarkup(<VisualDeltaReviewHistory user={member} items={[own]}
      selectedReviewId={own.id} isReadOnly={!canWriteVisualDeltaMonth(member, current, month)}
      workspace={current} actingKey={null} isUploading={false} onSelect={() => undefined}
      onEdit={() => undefined} onSubmitReview={() => undefined} onApproveReview={() => undefined}
      onRejectReview={() => undefined} onUploadAttachment={() => undefined} />);
    expect(html).toContain('>提交</button>');
  });

  it('retains own-signature checks for ordinary members and administrators', () => {
    const current = withMonthOwner(null), other = { ...current.items[0]!, reviewerId: 'another-author' };
    for (const actor of [member, { ...member, isSystemAdmin: true }]) {
      expect(canWriteVisualDeltaRecord(actor, current, other)).toBe(false);
      expect(canShowVisualDeltaReviewSubmitButton(actor, current, other)).toBe(false);
      expect(canShowVisualDeltaReviewApproveButton(actor, current, { ...other, submittedAt: now })).toBe(false);
      const html = renderToStaticMarkup(<VisualDeltaReviewHistory user={actor} items={[other]}
        selectedReviewId={other.id} isReadOnly={false} workspace={current} actingKey={null}
        isUploading={false} onSelect={() => undefined} onEdit={() => undefined}
        onSubmitReview={() => undefined} onApproveReview={() => undefined}
        onRejectReview={() => undefined} onUploadAttachment={() => undefined} />);
      expect(html).not.toMatch(/<button\b[^>]*>(?:编辑|提交|通过|驳回)<\/button>|<input\b[^>]*type="file"/);
    }
  });

  it('retains admission, current stage, active plan, date and completed-period boundaries', () => {
    const current = withMonthOwner(null), month = current.recurringTasks[0]!, own = current.items[0]!;
    for (const actor of [null, { ...member, teamAccessApproved: false }, { ...member, authSource: 'mock' as const }]) {
      expect(canWriteVisualDeltaMonth(actor, current, month)).toBe(false);
    }
    expect(canWriteVisualDeltaMonth(member, { ...current, activeTask: null }, month)).toBe(false);
    expect(canWriteVisualDeltaMonth(member, { ...current, monthlyPlanActive: false }, month)).toBe(false);
    expect(canWriteVisualDeltaMonth(member, current, undefined)).toBe(false);
    expect(canWriteVisualDeltaMonth(member, current, { ...month, plannedDate: '2026-04-01T00:00:00Z' })).toBe(false);
    for (const status of ['COMPLETED', 'CANCELLED']) expect(canWriteVisualDeltaMonth(member, current, { ...month, status })).toBe(false);
    expect(canWriteVisualDeltaRecord(member, current, { ...own, workflowTaskId: 'previous-17-parent' })).toBe(false);
    expect(canWriteVisualDeltaRecord(member, current, { ...own, isPeriodCompleted: true })).toBe(false);
    expect(canShowVisualDeltaReviewSubmitButton(member, current, { ...own, submittedAt: now })).toBe(false);
    expect(canShowVisualDeltaReviewApproveButton(member, current, own)).toBe(false);
    expect(canShowVisualDeltaReviewApproveButton(member, current, { ...own, submittedAt: now, reviewConclusion: 'REJECTED' })).toBe(false);
  });
});
