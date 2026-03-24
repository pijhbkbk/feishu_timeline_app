'use client';

import { apiRequest, type FrontendRoleCode, type SessionUser } from './auth-client';
import {
  fetchUserDirectory,
  formatDate,
  getProjectPriorityLabel,
  getWorkflowNodeLabel,
  type DirectoryUser,
  type ProjectPriority,
  type WorkflowNodeCode,
} from './projects-client';
import {
  canUserOperateWorkflowTask,
  getWorkflowTaskStatusLabel,
  type WorkflowTaskSummary,
} from './workflows-client';

export type VisualDeltaReviewConclusion =
  | 'APPROVED'
  | 'CONDITIONAL_APPROVED'
  | 'REJECTED';

export type AttachmentSummary = {
  id: string;
  targetType: string;
  targetId: string;
  fileName: string;
  fileExtension: string | null;
  contentType: string;
  fileSize: number;
  objectKey: string;
  createdAt: string;
  contentUrl: string;
};

export type VisualDeltaReviewRecord = {
  id: string;
  workflowTaskId: string;
  reviewType: 'VISUAL_COLOR_DIFFERENCE_REVIEW';
  reviewConclusion: VisualDeltaReviewConclusion;
  reviewDate: string | null;
  submittedAt: string | null;
  reviewerId: string;
  reviewerName: string | null;
  comment: string | null;
  conditionNote: string | null;
  rejectReason: string | null;
  returnToNodeCode: WorkflowNodeCode | null;
  returnToNodeName: string | null;
  createdAt: string;
  updatedAt: string;
  attachment: AttachmentSummary | null;
  attachmentHistory: AttachmentSummary[];
};

export type VisualDeltaReviewWorkspaceResponse = {
  project: {
    id: string;
    code: string;
    name: string;
    currentNodeCode: WorkflowNodeCode | null;
    currentNodeName: string | null;
    targetDate: string | null;
    riskLevel: ProjectPriority;
  };
  massProductionCompleted: boolean;
  activeTask: WorkflowTaskSummary | null;
  downstreamTask: WorkflowTaskSummary | null;
  items: VisualDeltaReviewRecord[];
};

export type VisualDeltaReviewFormInput = {
  reviewDate: string;
  reviewerId: string;
  reviewConclusion: VisualDeltaReviewConclusion;
  comment: string;
  conditionNote: string;
  rejectReason: string;
};

const VISUAL_DELTA_REVIEW_ROLE_CODES: FrontendRoleCode[] = [
  'admin',
  'project_manager',
  'quality_engineer',
  'reviewer',
];

const VISUAL_DELTA_REVIEW_CONCLUSION_LABELS: Record<
  VisualDeltaReviewConclusion,
  string
> = {
  APPROVED: '通过',
  CONDITIONAL_APPROVED: '条件通过',
  REJECTED: '驳回',
};

export function fetchVisualDeltaReviewWorkspace(projectId: string) {
  return apiRequest<VisualDeltaReviewWorkspaceResponse>(
    `/projects/${projectId}/reviews/visual-delta`,
  );
}

export function createVisualDeltaReview(
  projectId: string,
  input: VisualDeltaReviewFormInput,
) {
  return apiRequest<VisualDeltaReviewWorkspaceResponse>(
    `/projects/${projectId}/reviews/visual-delta`,
    {
      method: 'POST',
      body: toVisualDeltaReviewPayload(input),
    },
  );
}

export function updateVisualDeltaReview(
  projectId: string,
  reviewId: string,
  input: VisualDeltaReviewFormInput,
) {
  return apiRequest<VisualDeltaReviewWorkspaceResponse>(
    `/projects/${projectId}/reviews/visual-delta/${reviewId}`,
    {
      method: 'PATCH',
      body: toVisualDeltaReviewPayload(input),
    },
  );
}

export function uploadVisualDeltaReviewAttachment(
  projectId: string,
  reviewId: string,
  file: File,
) {
  const formData = new FormData();
  formData.set('file', file);

  return apiRequest<VisualDeltaReviewWorkspaceResponse>(
    `/projects/${projectId}/reviews/visual-delta/${reviewId}/attachment`,
    {
      method: 'POST',
      body: formData,
    },
  );
}

export function submitVisualDeltaReview(projectId: string, reviewId: string) {
  return apiRequest<VisualDeltaReviewWorkspaceResponse>(
    `/projects/${projectId}/reviews/visual-delta/${reviewId}/submit`,
    {
      method: 'POST',
    },
  );
}

export function approveVisualDeltaReview(projectId: string, reviewId: string) {
  return apiRequest<VisualDeltaReviewWorkspaceResponse>(
    `/projects/${projectId}/reviews/visual-delta/${reviewId}/approve`,
    {
      method: 'POST',
    },
  );
}

export function rejectVisualDeltaReview(projectId: string, reviewId: string) {
  return apiRequest<VisualDeltaReviewWorkspaceResponse>(
    `/projects/${projectId}/reviews/visual-delta/${reviewId}/reject`,
    {
      method: 'POST',
    },
  );
}

export function fetchVisualDeltaReviewPageOptions() {
  return fetchUserDirectory();
}

export function validateVisualDeltaReviewForm(input: VisualDeltaReviewFormInput) {
  if (!input.reviewDate.trim()) {
    return '评审日期不能为空。';
  }

  if (!input.reviewerId.trim()) {
    return '评审人不能为空。';
  }

  if (!input.comment.trim()) {
    return '评审意见不能为空。';
  }

  if (
    input.reviewConclusion === 'CONDITIONAL_APPROVED' &&
    !input.conditionNote.trim()
  ) {
    return '条件通过时必须填写说明。';
  }

  if (input.reviewConclusion === 'REJECTED' && !input.rejectReason.trim()) {
    return '驳回时必须填写原因。';
  }

  return null;
}

export function canManageVisualDeltaReviews(user: SessionUser | null) {
  if (!user) {
    return false;
  }

  if (user.isSystemAdmin || user.roleCodes.includes('admin')) {
    return true;
  }

  return VISUAL_DELTA_REVIEW_ROLE_CODES.some((roleCode) =>
    user.roleCodes.includes(roleCode),
  );
}

export function canShowVisualDeltaReviewSubmitButton(
  user: SessionUser | null,
  workspace: VisualDeltaReviewWorkspaceResponse,
  review: VisualDeltaReviewRecord,
) {
  if (!workspace.activeTask || review.submittedAt) {
    return false;
  }

  return canUserOperateWorkflowTask(user, workspace.activeTask);
}

export function canShowVisualDeltaReviewApproveButton(
  user: SessionUser | null,
  workspace: VisualDeltaReviewWorkspaceResponse,
  review: VisualDeltaReviewRecord,
) {
  if (!workspace.activeTask || !review.submittedAt) {
    return false;
  }

  if (
    review.reviewConclusion !== 'APPROVED' &&
    review.reviewConclusion !== 'CONDITIONAL_APPROVED'
  ) {
    return false;
  }

  return canUserOperateWorkflowTask(user, workspace.activeTask);
}

export function canShowVisualDeltaReviewRejectButton(
  user: SessionUser | null,
  workspace: VisualDeltaReviewWorkspaceResponse,
  review: VisualDeltaReviewRecord,
) {
  if (!workspace.activeTask || !review.submittedAt) {
    return false;
  }

  if (review.reviewConclusion !== 'REJECTED') {
    return false;
  }

  return canUserOperateWorkflowTask(user, workspace.activeTask);
}

export function getVisualDeltaReviewConclusionLabel(
  conclusion: VisualDeltaReviewConclusion,
) {
  return VISUAL_DELTA_REVIEW_CONCLUSION_LABELS[conclusion];
}

export function getVisualDeltaReviewWorkspaceHighlights(
  workspace: VisualDeltaReviewWorkspaceResponse,
) {
  return {
    currentNodeLabel: getWorkflowNodeLabel(workspace.project.currentNodeCode),
    targetDateLabel: formatDate(workspace.project.targetDate),
    riskLevelLabel: getProjectPriorityLabel(workspace.project.riskLevel),
    activeTaskStatusLabel: workspace.activeTask
      ? getWorkflowTaskStatusLabel(workspace.activeTask.status)
      : '当前无目视色差评审任务',
    downstreamTaskStatusLabel: workspace.downstreamTask
      ? getWorkflowTaskStatusLabel(workspace.downstreamTask.status)
      : '未激活',
  };
}

export function toVisualDeltaReviewFormInput(
  review: VisualDeltaReviewRecord,
): VisualDeltaReviewFormInput {
  return {
    reviewDate: review.reviewDate ? review.reviewDate.slice(0, 10) : '',
    reviewerId: review.reviewerId,
    reviewConclusion: review.reviewConclusion,
    comment: review.comment ?? '',
    conditionNote: review.conditionNote ?? '',
    rejectReason: review.rejectReason ?? '',
  };
}

export function getDefaultVisualDeltaReviewerId(
  users: DirectoryUser[],
  currentUserId: string | null,
) {
  if (currentUserId && users.some((user) => user.id === currentUserId)) {
    return currentUserId;
  }

  return users[0]?.id ?? '';
}

function toVisualDeltaReviewPayload(input: VisualDeltaReviewFormInput) {
  return {
    reviewDate: input.reviewDate,
    reviewerId: input.reviewerId,
    reviewConclusion: input.reviewConclusion,
    comment: input.comment,
    conditionNote: input.conditionNote || null,
    rejectReason: input.rejectReason || null,
  };
}
