'use client';
import { toBusinessDateInputValue } from './local-datetime';

import type { ReviewStandardOptions, ReviewStandardVersion } from './review-standard-version';

import { isApprovedTeamUser, apiRequest, type SessionUser } from './auth-client';
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
  standardVersionId?: string | null;
  standardVersion?: ReviewStandardVersion | null;
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

export type ConsistencyReviewWorkspaceResponse = ReviewStandardOptions & {
  exteriorRectification?: ExteriorRectificationSummary | null;
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
  displayTask?: WorkflowTaskSummary | null;
  displayDownstreamTask?: WorkflowTaskSummary | null;
  downstreamTask: WorkflowTaskSummary | null;
  items: ConsistencyReviewRecord[];
};

export interface ExteriorRectificationSummary {
  taskId: string; taskVersion: string; sourceTaskId: string; requirement: string | null; status: 'PENDING' | 'COMPLETED';
  supplierName?: string; completedOn?: string; summary?: string; recordedAt?: string; recordedById?: string; progressUpdateId?: string;
}
export interface ExteriorRectificationInput {
  taskId: string; expectedTaskVersion: string; operationId: string; supplierName: string; completedOn: string; summary: string;
}
export async function completeExteriorRectification(projectId: string, input: Readonly<ExteriorRectificationInput>) {
  const result = await apiRequest<{ receipt: { taskId: string; operationId: string; progressUpdateId: string }; workspace: ConsistencyReviewWorkspaceResponse }>(
    `/projects/${projectId}/reviews/consistency/rectification`, { method: 'POST', body: input, signal: AbortSignal.timeout(15000) });
  if (result.receipt?.taskId !== input.taskId || result.receipt.operationId !== input.operationId || (typeof result.receipt.progressUpdateId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(result.receipt.progressUpdateId)) || result.workspace?.project.id !== projectId) throw new Error('整改保存回执不匹配；请保留原请求并刷新核对。');
  return result;
}

export type ConsistencyReviewFormInput = {
  standardVersionId?: string;
  reviewDate: string;
  reviewerId: string;
  reviewConclusion: ConsistencyReviewConclusion;
  comment: string;
  conditionNote: string;
  rejectReason: string;
};

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

export function fetchConsistencyReviewPageOptions(projectId: string) {
  return fetchUserDirectory({ projectId });
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

export function canManageConsistencyReviews(
  user: SessionUser | null,
  reviewerId?: string | null,
) {
  return isApprovedTeamUser(user) && (reviewerId === undefined || reviewerId === user.id);
}

export function canShowConsistencyReviewSubmitButton(
  user: SessionUser | null,
  workspace: ConsistencyReviewWorkspaceResponse,
  review: ConsistencyReviewRecord,
) {
  if (!workspace.activeTask || workspace.exteriorRectification?.status === 'PENDING' || review.submittedAt) {
    return false;
  }

  return canManageConsistencyReviews(user, review.reviewerId) && canUserOperateWorkflowTask(user, workspace.activeTask) && review.workflowTaskId === workspace.activeTask.id;
}

export function canShowConsistencyReviewApproveButton(
  user: SessionUser | null,
  workspace: ConsistencyReviewWorkspaceResponse,
  review: ConsistencyReviewRecord,
) {
  if (!workspace.activeTask || workspace.exteriorRectification?.status === 'PENDING' || !review.submittedAt) {
    return false;
  }

  if (
    review.reviewConclusion !== 'APPROVED' &&
    review.reviewConclusion !== 'CONDITIONAL_APPROVED'
  ) {
    return false;
  }

  return canManageConsistencyReviews(user, review.reviewerId) && canUserOperateWorkflowTask(user, workspace.activeTask) && review.workflowTaskId === workspace.activeTask.id;
}

export function canShowConsistencyReviewRejectButton(
  user: SessionUser | null,
  workspace: ConsistencyReviewWorkspaceResponse,
  review: ConsistencyReviewRecord,
) {
  if (!workspace.activeTask || workspace.exteriorRectification?.status === 'PENDING' || !review.submittedAt) {
    return false;
  }

  if (review.reviewConclusion !== 'REJECTED') {
    return false;
  }

  return canManageConsistencyReviews(user, review.reviewerId) && canUserOperateWorkflowTask(user, workspace.activeTask) && review.workflowTaskId === workspace.activeTask.id;
}

export function getConsistencyReviewConclusionLabel(
  conclusion: ConsistencyReviewConclusion,
) {
  return CONSISTENCY_REVIEW_CONCLUSION_LABELS[conclusion];
}

export function getConsistencyReviewWorkspaceHighlights(
  workspace: ConsistencyReviewWorkspaceResponse,
) {
  const displayTask = workspace.displayTask === undefined ? workspace.activeTask : workspace.displayTask;
  const downstream = workspace.displayDownstreamTask === undefined
    ? workspace.downstreamTask : workspace.displayDownstreamTask;
  return {
    currentNodeLabel: getWorkflowNodeLabel(workspace.project.currentNodeCode),
    targetDateLabel: formatDate(workspace.project.targetDate),
    riskLevelLabel: getProjectPriorityLabel(workspace.project.riskLevel),
    activeTaskStatusLabel: displayTask
      ? getWorkflowTaskStatusLabel(displayTask.status)
      : '当前无一致性评审任务',
    downstreamTaskStatusLabel: downstream
      ? getWorkflowTaskStatusLabel(downstream.status)
      : '未激活',
  };
}

export function toConsistencyReviewFormInput(
  review: ConsistencyReviewRecord,
): ConsistencyReviewFormInput {
  return {
    standardVersionId: review.standardVersionId ?? '',
    reviewDate: toBusinessDateInputValue(review.reviewDate),
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
    standardVersionId: input.standardVersionId || null,
    reviewDate: input.reviewDate,
    reviewerId: input.reviewerId,
    reviewConclusion: input.reviewConclusion,
    comment: input.comment,
    conditionNote: input.conditionNote || null,
    rejectReason: input.rejectReason || null,
  };
}
