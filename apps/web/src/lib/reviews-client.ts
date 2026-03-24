'use client';

import {
  apiRequest,
  type FrontendRoleCode,
  type SessionUser,
} from './auth-client';
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

export type CabinReviewConclusion =
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

export type CabinReviewRecord = {
  id: string;
  workflowTaskId: string;
  reviewType: 'CAB_REVIEW';
  reviewConclusion: CabinReviewConclusion;
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
  trialProduction: {
    id: string;
    vehicleNo: string | null;
    result: string | null;
    completedAt: string | null;
  } | null;
  attachment: AttachmentSummary | null;
  attachmentHistory: AttachmentSummary[];
};

export type CabinReviewWorkspaceResponse = {
  project: {
    id: string;
    code: string;
    name: string;
    currentNodeCode: WorkflowNodeCode | null;
    currentNodeName: string | null;
    targetDate: string | null;
    riskLevel: ProjectPriority;
  };
  trialProductionCompleted: boolean;
  activeTask: WorkflowTaskSummary | null;
  downstreamTasks: {
    developmentFee: WorkflowTaskSummary | null;
    consistencyReview: WorkflowTaskSummary | null;
  };
  latestTrialProduction: {
    id: string;
    vehicleNo: string | null;
    completedAt: string | null;
    result: string | null;
    issueSummary: string | null;
  } | null;
  items: CabinReviewRecord[];
};

export type CabinReviewFormInput = {
  reviewDate: string;
  reviewerId: string;
  reviewConclusion: CabinReviewConclusion;
  comment: string;
  conditionNote: string;
  rejectReason: string;
};

const CABIN_REVIEW_CONCLUSION_OPTIONS: Array<{
  value: CabinReviewConclusion;
  label: string;
}> = [
  { value: 'APPROVED', label: '通过' },
  { value: 'CONDITIONAL_APPROVED', label: '条件通过' },
  { value: 'REJECTED', label: '驳回' },
];

const CABIN_REVIEW_ROLE_CODES: FrontendRoleCode[] = [
  'admin',
  'project_manager',
  'quality_engineer',
  'reviewer',
];

const CABIN_REVIEW_CONCLUSION_LABELS = Object.fromEntries(
  CABIN_REVIEW_CONCLUSION_OPTIONS.map((item) => [item.value, item.label]),
) as Record<CabinReviewConclusion, string>;

export function fetchCabinReviewWorkspace(projectId: string) {
  return apiRequest<CabinReviewWorkspaceResponse>(`/projects/${projectId}/reviews/cabin`);
}

export function createCabinReview(projectId: string, input: CabinReviewFormInput) {
  return apiRequest<CabinReviewWorkspaceResponse>(`/projects/${projectId}/reviews/cabin`, {
    method: 'POST',
    body: toCabinReviewPayload(input),
  });
}

export function updateCabinReview(
  projectId: string,
  reviewId: string,
  input: CabinReviewFormInput,
) {
  return apiRequest<CabinReviewWorkspaceResponse>(
    `/projects/${projectId}/reviews/cabin/${reviewId}`,
    {
      method: 'PATCH',
      body: toCabinReviewPayload(input),
    },
  );
}

export function uploadCabinReviewAttachment(
  projectId: string,
  reviewId: string,
  file: File,
) {
  const formData = new FormData();
  formData.set('file', file);

  return apiRequest<CabinReviewWorkspaceResponse>(
    `/projects/${projectId}/reviews/cabin/${reviewId}/attachment`,
    {
      method: 'POST',
      body: formData,
    },
  );
}

export function submitCabinReview(projectId: string, reviewId: string) {
  return apiRequest<CabinReviewWorkspaceResponse>(
    `/projects/${projectId}/reviews/cabin/${reviewId}/submit`,
    {
      method: 'POST',
    },
  );
}

export function approveCabinReview(projectId: string, reviewId: string) {
  return apiRequest<CabinReviewWorkspaceResponse>(
    `/projects/${projectId}/reviews/cabin/${reviewId}/approve`,
    {
      method: 'POST',
    },
  );
}

export function rejectCabinReview(projectId: string, reviewId: string) {
  return apiRequest<CabinReviewWorkspaceResponse>(
    `/projects/${projectId}/reviews/cabin/${reviewId}/reject`,
    {
      method: 'POST',
    },
  );
}

export function fetchCabinReviewPageOptions() {
  return fetchUserDirectory();
}

export function validateCabinReviewForm(input: CabinReviewFormInput) {
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

export function canManageCabinReviews(user: SessionUser | null) {
  if (!user) {
    return false;
  }

  if (user.isSystemAdmin || user.roleCodes.includes('admin')) {
    return true;
  }

  return CABIN_REVIEW_ROLE_CODES.some((roleCode) => user.roleCodes.includes(roleCode));
}

export function canShowCabinReviewSubmitButton(
  user: SessionUser | null,
  workspace: CabinReviewWorkspaceResponse,
  review: CabinReviewRecord,
) {
  if (!workspace.activeTask || review.submittedAt) {
    return false;
  }

  return canManageCabinReviewTask(user, workspace.activeTask);
}

export function canShowCabinReviewApproveButton(
  user: SessionUser | null,
  workspace: CabinReviewWorkspaceResponse,
  review: CabinReviewRecord,
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

  return canManageCabinReviewTask(user, workspace.activeTask);
}

export function canShowCabinReviewRejectButton(
  user: SessionUser | null,
  workspace: CabinReviewWorkspaceResponse,
  review: CabinReviewRecord,
) {
  if (!workspace.activeTask || !review.submittedAt) {
    return false;
  }

  if (review.reviewConclusion !== 'REJECTED') {
    return false;
  }

  return canManageCabinReviewTask(user, workspace.activeTask);
}

export function getCabinReviewConclusionLabel(conclusion: CabinReviewConclusion) {
  return CABIN_REVIEW_CONCLUSION_LABELS[conclusion];
}

export function getCabinReviewWorkspaceHighlights(
  workspace: CabinReviewWorkspaceResponse,
) {
  return {
    currentNodeLabel: getWorkflowNodeLabel(workspace.project.currentNodeCode),
    targetDateLabel: formatDate(workspace.project.targetDate),
    riskLevelLabel: getProjectPriorityLabel(workspace.project.riskLevel),
    activeTaskStatusLabel: workspace.activeTask
      ? getWorkflowTaskStatusLabel(workspace.activeTask.status)
      : '当前无驾驶室评审任务',
    developmentFeeStatusLabel: workspace.downstreamTasks.developmentFee
      ? getWorkflowTaskStatusLabel(workspace.downstreamTasks.developmentFee.status)
      : '未激活',
    consistencyReviewStatusLabel: workspace.downstreamTasks.consistencyReview
      ? getWorkflowTaskStatusLabel(workspace.downstreamTasks.consistencyReview.status)
      : '未激活',
  };
}

export function toCabinReviewFormInput(
  review: CabinReviewRecord,
): CabinReviewFormInput {
  return {
    reviewDate: review.reviewDate ? review.reviewDate.slice(0, 10) : '',
    reviewerId: review.reviewerId,
    reviewConclusion: review.reviewConclusion,
    comment: review.comment ?? '',
    conditionNote: review.conditionNote ?? '',
    rejectReason: review.rejectReason ?? '',
  };
}

export function getDefaultCabinReviewerId(
  users: DirectoryUser[],
  currentUserId: string | null,
) {
  if (currentUserId && users.some((user) => user.id === currentUserId)) {
    return currentUserId;
  }

  return users[0]?.id ?? '';
}

function canManageCabinReviewTask(
  user: SessionUser | null,
  task: WorkflowTaskSummary,
) {
  return canUserOperateWorkflowTask(user, task);
}

function toCabinReviewPayload(input: CabinReviewFormInput) {
  return {
    reviewDate: input.reviewDate,
    reviewerId: input.reviewerId,
    reviewConclusion: input.reviewConclusion,
    comment: input.comment,
    conditionNote: input.conditionNote || null,
    rejectReason: input.rejectReason || null,
  };
}
