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

export type ConsistencyReviewConclusion =
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

export type ConsistencyReviewRecord = {
  id: string;
  workflowTaskId: string;
  reviewType: 'COLOR_CONSISTENCY_REVIEW';
  reviewConclusion: ConsistencyReviewConclusion;
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

export type ConsistencyReviewWorkspaceResponse = {
  project: {
    id: string;
    code: string;
    name: string;
    currentNodeCode: WorkflowNodeCode | null;
    currentNodeName: string | null;
    targetDate: string | null;
    riskLevel: ProjectPriority;
  };
  cabinReviewCompleted: boolean;
  activeTask: WorkflowTaskSummary | null;
  downstreamTask: WorkflowTaskSummary | null;
  items: ConsistencyReviewRecord[];
};

export type ConsistencyReviewFormInput = {
  reviewDate: string;
  reviewerId: string;
  reviewConclusion: ConsistencyReviewConclusion;
  comment: string;
  conditionNote: string;
  rejectReason: string;
};

const CONSISTENCY_REVIEW_ROLE_CODES: FrontendRoleCode[] = [
  'admin',
  'project_manager',
  'quality_engineer',
  'reviewer',
];

const CONSISTENCY_REVIEW_CONCLUSION_LABELS: Record<
  ConsistencyReviewConclusion,
  string
> = {
  APPROVED: '通过',
  CONDITIONAL_APPROVED: '条件通过',
  REJECTED: '驳回',
};

export function fetchConsistencyReviewWorkspace(projectId: string) {
  return apiRequest<ConsistencyReviewWorkspaceResponse>(
    `/projects/${projectId}/reviews/consistency`,
  );
}

export function createConsistencyReview(
  projectId: string,
  input: ConsistencyReviewFormInput,
) {
  return apiRequest<ConsistencyReviewWorkspaceResponse>(
    `/projects/${projectId}/reviews/consistency`,
    {
      method: 'POST',
      body: toConsistencyReviewPayload(input),
    },
  );
}

export function updateConsistencyReview(
  projectId: string,
  reviewId: string,
  input: ConsistencyReviewFormInput,
) {
  return apiRequest<ConsistencyReviewWorkspaceResponse>(
    `/projects/${projectId}/reviews/consistency/${reviewId}`,
    {
      method: 'PATCH',
      body: toConsistencyReviewPayload(input),
    },
  );
}

export function uploadConsistencyReviewAttachment(
  projectId: string,
  reviewId: string,
  file: File,
) {
  const formData = new FormData();
  formData.set('file', file);

  return apiRequest<ConsistencyReviewWorkspaceResponse>(
    `/projects/${projectId}/reviews/consistency/${reviewId}/attachment`,
    {
      method: 'POST',
      body: formData,
    },
  );
}

export function submitConsistencyReview(projectId: string, reviewId: string) {
  return apiRequest<ConsistencyReviewWorkspaceResponse>(
    `/projects/${projectId}/reviews/consistency/${reviewId}/submit`,
    {
      method: 'POST',
    },
  );
}

export function approveConsistencyReview(projectId: string, reviewId: string) {
  return apiRequest<ConsistencyReviewWorkspaceResponse>(
    `/projects/${projectId}/reviews/consistency/${reviewId}/approve`,
    {
      method: 'POST',
    },
  );
}

export function rejectConsistencyReview(projectId: string, reviewId: string) {
  return apiRequest<ConsistencyReviewWorkspaceResponse>(
    `/projects/${projectId}/reviews/consistency/${reviewId}/reject`,
    {
      method: 'POST',
    },
  );
}

export function fetchConsistencyReviewPageOptions() {
  return fetchUserDirectory();
}

export function validateConsistencyReviewForm(input: ConsistencyReviewFormInput) {
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

export function canManageConsistencyReviews(user: SessionUser | null) {
  if (!user) {
    return false;
  }

  if (user.isSystemAdmin || user.roleCodes.includes('admin')) {
    return true;
  }

  return CONSISTENCY_REVIEW_ROLE_CODES.some((roleCode) =>
    user.roleCodes.includes(roleCode),
  );
}

export function canShowConsistencyReviewSubmitButton(
  user: SessionUser | null,
  workspace: ConsistencyReviewWorkspaceResponse,
  review: ConsistencyReviewRecord,
) {
  if (!workspace.activeTask || review.submittedAt) {
    return false;
  }

  return canUserOperateWorkflowTask(user, workspace.activeTask);
}

export function canShowConsistencyReviewApproveButton(
  user: SessionUser | null,
  workspace: ConsistencyReviewWorkspaceResponse,
  review: ConsistencyReviewRecord,
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

export function canShowConsistencyReviewRejectButton(
  user: SessionUser | null,
  workspace: ConsistencyReviewWorkspaceResponse,
  review: ConsistencyReviewRecord,
) {
  if (!workspace.activeTask || !review.submittedAt) {
    return false;
  }

  if (review.reviewConclusion !== 'REJECTED') {
    return false;
  }

  return canUserOperateWorkflowTask(user, workspace.activeTask);
}

export function getConsistencyReviewConclusionLabel(
  conclusion: ConsistencyReviewConclusion,
) {
  return CONSISTENCY_REVIEW_CONCLUSION_LABELS[conclusion];
}

export function getConsistencyReviewWorkspaceHighlights(
  workspace: ConsistencyReviewWorkspaceResponse,
) {
  return {
    currentNodeLabel: getWorkflowNodeLabel(workspace.project.currentNodeCode),
    targetDateLabel: formatDate(workspace.project.targetDate),
    riskLevelLabel: getProjectPriorityLabel(workspace.project.riskLevel),
    activeTaskStatusLabel: workspace.activeTask
      ? getWorkflowTaskStatusLabel(workspace.activeTask.status)
      : '当前无一致性评审任务',
    downstreamTaskStatusLabel: workspace.downstreamTask
      ? getWorkflowTaskStatusLabel(workspace.downstreamTask.status)
      : '未激活',
  };
}

export function toConsistencyReviewFormInput(
  review: ConsistencyReviewRecord,
): ConsistencyReviewFormInput {
  return {
    reviewDate: review.reviewDate ? review.reviewDate.slice(0, 10) : '',
    reviewerId: review.reviewerId,
    reviewConclusion: review.reviewConclusion,
    comment: review.comment ?? '',
    conditionNote: review.conditionNote ?? '',
    rejectReason: review.rejectReason ?? '',
  };
}

export function getDefaultConsistencyReviewerId(
  users: DirectoryUser[],
  currentUserId: string | null,
) {
  if (currentUserId && users.some((user) => user.id === currentUserId)) {
    return currentUserId;
  }

  return users[0]?.id ?? '';
}

function toConsistencyReviewPayload(input: ConsistencyReviewFormInput) {
  return {
    reviewDate: input.reviewDate,
    reviewerId: input.reviewerId,
    reviewConclusion: input.reviewConclusion,
    comment: input.comment,
    conditionNote: input.conditionNote || null,
    rejectReason: input.rejectReason || null,
  };
}
