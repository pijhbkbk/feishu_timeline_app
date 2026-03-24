'use client';

import { API_BASE_URL, apiRequest, type FrontendRoleCode, type SessionUser } from './auth-client';
import { formatDate, type WorkflowNodeCode } from './projects-client';

export type AttachmentEntityType =
  | 'PROJECT'
  | 'SAMPLE'
  | 'STANDARD_BOARD'
  | 'PERFORMANCE_TEST'
  | 'REVIEW_RECORD'
  | 'NEW_COLOR_REPORT'
  | 'TRIAL_PRODUCTION';

export type ProjectAttachmentSummary = {
  id: string;
  projectId: string;
  entityType: AttachmentEntityType;
  entityId: string;
  entityLabel: string;
  targetType: AttachmentEntityType;
  targetId: string;
  fileName: string;
  originalFileName: string;
  fileExtension: string | null;
  mimeType: string;
  contentType: string;
  fileSize: number;
  bucket: string;
  storageKey: string;
  objectKey: string;
  fileUrl: string;
  contentUrl: string;
  downloadUrl: string;
  previewUrl: string | null;
  canPreview: boolean;
  uploadedById: string | null;
  uploadedByName: string | null;
  uploadedAt: string;
  isDeleted: boolean;
  deletedAt: string | null;
  deletedById: string | null;
  deletedByName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AttachmentWorkspaceResponse = {
  project: {
    id: string;
    code: string;
    name: string;
    currentNodeCode: WorkflowNodeCode | null;
    currentNodeName: string | null;
    targetDate: string | null;
  };
  filters: {
    entityType: AttachmentEntityType | null;
    entityId: string | null;
    includeDeleted: boolean;
  };
  limits: {
    maxFileSizeBytes: number;
  };
  statistics: {
    totalCount: number;
    activeCount: number;
    deletedCount: number;
  };
  entityOptions: Array<{
    entityType: AttachmentEntityType;
    label: string;
    items: Array<{
      id: string;
      label: string;
      subtitle: string | null;
    }>;
  }>;
  items: ProjectAttachmentSummary[];
};

export type AttachmentWorkspaceFilters = {
  entityType?: AttachmentEntityType | '';
  entityId?: string;
  includeDeleted?: boolean;
};

export type AttachmentBindInput = {
  entityType: AttachmentEntityType;
  entityId: string;
};

const ATTACHMENT_MANAGEMENT_ROLE_CODES: FrontendRoleCode[] = [
  'admin',
  'project_manager',
  'process_engineer',
  'quality_engineer',
  'purchaser',
  'reviewer',
  'finance',
];

const ATTACHMENT_ENTITY_TYPE_LABELS: Record<AttachmentEntityType, string> = {
  PROJECT: '项目',
  SAMPLE: '样板',
  STANDARD_BOARD: '标准板',
  PERFORMANCE_TEST: '性能试验',
  REVIEW_RECORD: '评审记录',
  NEW_COLOR_REPORT: '开发报告',
  TRIAL_PRODUCTION: '样车试制',
};

export function fetchAttachmentsWorkspace(
  projectId: string,
  filters: AttachmentWorkspaceFilters = {},
) {
  return apiRequest<AttachmentWorkspaceResponse>(
    `/projects/${projectId}/attachments${buildQueryString(filters)}`,
  );
}

export function uploadProjectAttachment(
  projectId: string,
  file: File,
  binding: AttachmentBindInput,
) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('entityType', binding.entityType);
  formData.append('entityId', binding.entityId);

  return apiRequest<ProjectAttachmentSummary>(`/projects/${projectId}/attachments/upload`, {
    method: 'POST',
    body: formData,
  });
}

export function fetchProjectAttachmentDetail(projectId: string, attachmentId: string) {
  return apiRequest<ProjectAttachmentSummary>(`/projects/${projectId}/attachments/${attachmentId}`);
}

export function fetchAttachmentsByEntity(
  projectId: string,
  binding: AttachmentBindInput,
) {
  return apiRequest<{
    projectId: string;
    entityType: AttachmentEntityType;
    entityId: string;
    items: ProjectAttachmentSummary[];
  }>(
    `/projects/${projectId}/attachments/by-entity${buildQueryString({
      entityType: binding.entityType,
      entityId: binding.entityId,
    })}`,
  );
}

export function bindProjectAttachment(
  projectId: string,
  attachmentId: string,
  binding: AttachmentBindInput,
) {
  return apiRequest<ProjectAttachmentSummary>(
    `/projects/${projectId}/attachments/${attachmentId}/bind`,
    {
      method: 'POST',
      body: binding,
    },
  );
}

export function unbindProjectAttachment(projectId: string, attachmentId: string) {
  return apiRequest<ProjectAttachmentSummary>(
    `/projects/${projectId}/attachments/${attachmentId}/unbind`,
    {
      method: 'POST',
    },
  );
}

export function deleteProjectAttachment(projectId: string, attachmentId: string) {
  return apiRequest<ProjectAttachmentSummary>(
    `/projects/${projectId}/attachments/${attachmentId}`,
    {
      method: 'DELETE',
    },
  );
}

export function canManageProjectAttachments(user: SessionUser | null) {
  if (!user) {
    return false;
  }

  if (user.isSystemAdmin || user.roleCodes.includes('admin')) {
    return true;
  }

  return ATTACHMENT_MANAGEMENT_ROLE_CODES.some((roleCode) => user.roleCodes.includes(roleCode));
}

export function getAttachmentEntityTypeLabel(entityType: AttachmentEntityType) {
  return ATTACHMENT_ENTITY_TYPE_LABELS[entityType];
}

export function getAttachmentPreviewUrl(attachment: Pick<ProjectAttachmentSummary, 'previewUrl'>) {
  return attachment.previewUrl ? `${API_BASE_URL}${attachment.previewUrl}` : null;
}

export function getAttachmentDownloadUrl(attachment: Pick<ProjectAttachmentSummary, 'downloadUrl'>) {
  return `${API_BASE_URL}${attachment.downloadUrl}`;
}

export function getAttachmentContentUrl(attachment: Pick<ProjectAttachmentSummary, 'contentUrl'>) {
  return `${API_BASE_URL}${attachment.contentUrl}`;
}

export function getAttachmentPreviewKind(
  attachment: Pick<ProjectAttachmentSummary, 'mimeType' | 'canPreview'>,
) {
  if (!attachment.canPreview) {
    return 'none' as const;
  }

  if (attachment.mimeType === 'application/pdf') {
    return 'pdf' as const;
  }

  if (attachment.mimeType.startsWith('image/')) {
    return 'image' as const;
  }

  return 'none' as const;
}

export function formatAttachmentSize(fileSize: number) {
  if (fileSize < 1024) {
    return `${fileSize} B`;
  }

  if (fileSize < 1024 * 1024) {
    return `${(fileSize / 1024).toFixed(1)} KB`;
  }

  return `${(fileSize / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatAttachmentTime(value: string | null | undefined) {
  return formatDate(value);
}

export function validateAttachmentUploadInput(input: {
  file: File | null;
  entityType: AttachmentEntityType | '';
  entityId: string;
}) {
  if (!input.file) {
    return '请选择要上传的附件。';
  }

  if (!input.entityType) {
    return '请选择附件归属类型。';
  }

  if (!input.entityId.trim()) {
    return '请选择附件归属实体。';
  }

  return null;
}

export function validateAttachmentBindInput(input: {
  entityType: AttachmentEntityType | '';
  entityId: string;
}) {
  if (!input.entityType) {
    return '请选择绑定实体类型。';
  }

  if (!input.entityId.trim()) {
    return '请选择绑定实体。';
  }

  return null;
}

export function getEntityItemsForType(
  workspace: Pick<AttachmentWorkspaceResponse, 'entityOptions'>,
  entityType: AttachmentEntityType | '',
) {
  if (!entityType) {
    return [];
  }

  return workspace.entityOptions.find((item) => item.entityType === entityType)?.items ?? [];
}

function buildQueryString(filters: AttachmentWorkspaceFilters) {
  const searchParams = new URLSearchParams();

  if (filters.entityType) {
    searchParams.set('entityType', filters.entityType);
  }

  if (filters.entityId) {
    searchParams.set('entityId', filters.entityId);
  }

  if (filters.includeDeleted) {
    searchParams.set('includeDeleted', 'true');
  }

  const serialized = searchParams.toString();
  return serialized ? `?${serialized}` : '';
}
