'use client';

import { API_BASE_URL, apiRequest } from './auth-client';
import { type WorkflowAction, type WorkflowTaskStatus } from './workflows-client';
import { type WorkflowNodeCode } from './projects-client';

export type SampleType = 'PANEL' | 'CAB' | 'VEHICLE' | 'OTHER';
export type SampleStatus = 'DRAFT' | 'IN_PREPARATION' | 'CONFIRMED' | 'ARCHIVED';
export type SampleConfirmationDecision = 'APPROVE' | 'REJECT' | 'RETURN';

export type SampleTaskSummary = {
  id: string;
  taskNo: string;
  nodeCode: WorkflowNodeCode;
  nodeName: string;
  status: WorkflowTaskStatus;
  assigneeUserId: string | null;
  assigneeUserName: string | null;
  assigneeDepartmentId: string | null;
  assigneeDepartmentName: string | null;
  dueAt: string | null;
  startedAt: string | null;
  returnedAt: string | null;
  availableActions: WorkflowAction[];
};

export type SampleListItem = {
  id: string;
  sampleNo: string;
  sampleName: string;
  versionNo: number;
  isCurrent: boolean;
  sampleType: SampleType;
  status: SampleStatus;
  location: string | null;
  remark: string | null;
  producedAt: string | null;
  confirmedAt: string | null;
  imageCount: number;
  latestImageAttachmentId: string | null;
  versionCount: number;
  createdAt: string;
  updatedAt: string;
};

export type SampleAttachment = {
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

export type SampleConfirmationSummary = {
  id: string;
  sampleId: string;
  sampleNo: string;
  sampleName: string;
  sampleVersionNo: number;
  decision: SampleConfirmationDecision;
  colorAssessment: string | null;
  appearanceAssessment: string | null;
  comment: string | null;
  confirmedByName: string | null;
  confirmedAt: string;
  createdAt: string;
};

export type SamplesWorkspaceResponse = {
  project: {
    id: string;
    code: string;
    name: string;
    currentNodeCode: WorkflowNodeCode | null;
    currentNodeName: string | null;
    targetDate: string | null;
  };
  activeConfirmationTask: SampleTaskSummary | null;
  latestConfirmation: SampleConfirmationSummary | null;
  items: SampleListItem[];
};

export type SampleDetailResponse = {
  project: SamplesWorkspaceResponse['project'];
  sample: {
    id: string;
    sampleNo: string;
    sampleName: string;
    versionNo: number;
    isCurrent: boolean;
    sampleType: SampleType;
    status: SampleStatus;
    location: string | null;
    remark: string | null;
    producedAt: string | null;
    confirmedAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
  versions: Array<{
    id: string;
    sampleNo: string;
    sampleName: string;
    versionNo: number;
    isCurrent: boolean;
    sampleType: SampleType;
    status: SampleStatus;
    producedAt: string | null;
    confirmedAt: string | null;
    imageCount: number;
    createdAt: string;
  }>;
  attachments: SampleAttachment[];
  confirmations: SampleConfirmationSummary[];
};

export type SampleWritePayload = {
  sampleNo: string;
  sampleName: string;
  sampleType: SampleType;
  location?: string | null;
  remark?: string | null;
  producedAt?: string | null;
  createNewVersion?: boolean;
};

export type SampleConfirmationPayload = {
  sampleId: string;
  decision: SampleConfirmationDecision;
  colorAssessment?: string | null;
  appearanceAssessment?: string | null;
  comment?: string | null;
};

export const SAMPLE_TYPE_OPTIONS: Array<{ value: SampleType; label: string }> = [
  { value: 'PANEL', label: '色板' },
  { value: 'CAB', label: '驾驶室' },
  { value: 'VEHICLE', label: '整车' },
  { value: 'OTHER', label: '其他' },
];

export const SAMPLE_STATUS_OPTIONS: Array<{ value: SampleStatus; label: string }> = [
  { value: 'DRAFT', label: '草稿' },
  { value: 'IN_PREPARATION', label: '准备中' },
  { value: 'CONFIRMED', label: '已确认' },
  { value: 'ARCHIVED', label: '已归档' },
];

const SAMPLE_TYPE_LABELS = Object.fromEntries(
  SAMPLE_TYPE_OPTIONS.map((item) => [item.value, item.label]),
) as Record<SampleType, string>;

const SAMPLE_STATUS_LABELS = Object.fromEntries(
  SAMPLE_STATUS_OPTIONS.map((item) => [item.value, item.label]),
) as Record<SampleStatus, string>;

const SAMPLE_CONFIRMATION_DECISION_LABELS: Record<SampleConfirmationDecision, string> = {
  APPROVE: '通过',
  REJECT: '驳回',
  RETURN: '退回',
};

export function fetchSamplesWorkspace(projectId: string) {
  return apiRequest<SamplesWorkspaceResponse>(`/projects/${projectId}/samples`);
}

export function fetchSampleDetail(projectId: string, sampleId: string) {
  return apiRequest<SampleDetailResponse>(`/projects/${projectId}/samples/${sampleId}`);
}

export function createSample(projectId: string, payload: SampleWritePayload) {
  return apiRequest<SampleDetailResponse>(`/projects/${projectId}/samples`, {
    method: 'POST',
    body: payload,
  });
}

export function updateSample(
  projectId: string,
  sampleId: string,
  payload: Partial<SampleWritePayload>,
) {
  return apiRequest<SampleDetailResponse>(`/projects/${projectId}/samples/${sampleId}`, {
    method: 'PATCH',
    body: payload,
  });
}

export function submitSampleConfirmation(
  projectId: string,
  payload: SampleConfirmationPayload,
) {
  return apiRequest<SamplesWorkspaceResponse>(`/projects/${projectId}/samples/confirm`, {
    method: 'POST',
    body: payload,
  });
}

export function uploadSampleImage(
  projectId: string,
  sampleId: string,
  file: File,
) {
  const formData = new FormData();
  formData.append('file', file);

  return apiRequest<{
    sampleId: string;
    attachment: SampleAttachment;
  }>(`/projects/${projectId}/samples/${sampleId}/images`, {
    method: 'POST',
    body: formData,
  });
}

export function getSampleTypeLabel(sampleType: SampleType) {
  return SAMPLE_TYPE_LABELS[sampleType];
}

export function getSampleStatusLabel(status: SampleStatus) {
  return SAMPLE_STATUS_LABELS[status];
}

export function getSampleConfirmationDecisionLabel(decision: SampleConfirmationDecision) {
  return SAMPLE_CONFIRMATION_DECISION_LABELS[decision];
}

export function getAttachmentContentUrl(contentUrl: string) {
  return `${API_BASE_URL}${contentUrl}`;
}

export function formatFileSize(fileSize: number) {
  if (fileSize < 1024) {
    return `${fileSize} B`;
  }

  if (fileSize < 1024 * 1024) {
    return `${(fileSize / 1024).toFixed(1)} KB`;
  }

  return `${(fileSize / (1024 * 1024)).toFixed(1)} MB`;
}
