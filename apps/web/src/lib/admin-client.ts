'use client';

import { API_BASE_URL, apiRequest } from './auth-client';

export type AdminOverviewResponse = {
  generatedAt: string;
  summary: {
    activeUsers: number;
    activeDepartments: number;
    activeTemplates: number;
    anomalyCount: number;
    projects?: {
      active: number;
      overdue: number;
      waitingReview: number;
      completed: number;
    };
    tasks?: {
      unassigned: number;
      dueSoon: number;
      overdue: number;
      blocked: number;
    };
  };
  modules: Array<{
    key: string;
    title: string;
    description: string;
    href: string;
    metric: string;
  }>;
  anomalies: Array<{
    id: string;
    action: string;
    summary: string;
    actorName: string;
    projectId: string | null;
    createdAt: string;
  }>;
};

export function fetchAdminOverview() {
  return apiRequest<AdminOverviewResponse>('/admin/overview');
}

export type AdminAuditListItem = {
  id: string;
  createdAt: string;
  actorId: string | null;
  actorName: string;
  actorRole: string | null;
  action: string;
  entityType: string;
  entityId: string;
  projectId: string | null;
  projectName: string | null;
  result: string | null;
  requestId: string | null;
  summary: string;
};

export type AdminAuditListResponse = {
  items: AdminAuditListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  sort: 'createdAt:asc' | 'createdAt:desc';
  summary: {
    todayCount: number;
    failureCount: number;
    filteredCount: number;
  };
};

export type AdminAuditDetailResponse = AdminAuditListItem & {
  nodeCode: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  reason: string | null;
  beforeSummary: unknown;
  afterSummary: unknown;
  metadata: unknown;
};

export type AdminAuditQuery = {
  page?: number;
  pageSize?: number;
  from?: string;
  to?: string;
  actorUserId?: string;
  actorName?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  projectId?: string;
  result?: string;
  requestId?: string;
  keyword?: string;
  sort?: 'createdAt:asc' | 'createdAt:desc';
};

export function fetchAdminAuditLogs(query: AdminAuditQuery = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const suffix = search.size ? `?${search.toString()}` : '';
  return apiRequest<AdminAuditListResponse>(`/admin/audit-logs${suffix}`);
}

export function fetchAdminAuditLogDetail(auditLogId: string) {
  return apiRequest<AdminAuditDetailResponse>(
    `/admin/audit-logs/${encodeURIComponent(auditLogId)}`,
  );
}

export type AdminListResponse<T> = {
  dataSource?: 'database';
  generatedAt?: string;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: T[];
};

export type AdminProjectRow = {
  id: string;
  code: string;
  name: string;
  vehicleModel: string | null;
  color: { id: string; name: string; code: string; status: string } | null;
  owner: { id: string; name: string } | null;
  owningDepartment: { id: string; name: string } | null;
  status: string;
  currentNodeCode: string | null;
  currentTask: {
    id: string;
    stepCode: string;
    nodeName: string;
    status: string;
    assignee: { id: string; name: string } | null;
    dueAt: string | null;
  } | null;
  progress: { completed: number; total: number };
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  actualStartDate: string | null;
  actualEndDate: string | null;
  riskLevel: string;
  overdueCount: number;
  blockerCount: number;
  memberCount: number;
  materialCount: number;
  taskCount: number;
  dataVersion: string;
  availableActions: string[];
};

export type AdminTaskRow = {
  id: string;
  project: {
    id: string;
    code: string;
    name: string;
    colorName: string | null;
    status: string;
  };
  stepNumber: number | null;
  nodeCode: string;
  nodeName: string;
  branchType: 'MAIN' | 'NON_BLOCKING';
  workContent: string | null;
  requiredOutput: string | null;
  requiredMaterials: string[];
  materialProgress: { completed: number; required: number };
  predecessor: string[];
  autoTransitionRule: string | null;
  plannedStartAt: string | null;
  plannedDueAt: string | null;
  actualStartAt: string | null;
  actualCompletedAt: string | null;
  durationDays: number | null;
  overdueDays: number;
  pauseDays: number;
  updatedAt: string;
  primaryDepartment: { id: string; name: string } | null;
  assignee: {
    id: string;
    name: string;
    departmentId: string | null;
    departmentName: string | null;
  } | null;
  collaboratorUserIds: string[];
  reviewerUserIds: string[];
  assignmentSource: string;
  status: string;
  riskLevel: string;
  blockers: Array<{ id: string; description: string; expectedResolvedAt: string | null }>;
  taskVersion: string;
  parameterSource: {
    schedule: string;
    assignment: string;
    history: string | null;
  };
  availableActions: string[];
};

export type AdminOrganizationRow = Record<string, unknown> & {
  id: string;
  name?: string;
  code?: string;
  status?: string;
  dataVersion?: string;
};

export type AdminOrganizationResponse = AdminListResponse<AdminOrganizationRow> & {
  tab: 'users' | 'departments' | 'members';
};

export type AdminAssignmentResponse = {
  projects: Array<{ id: string; code: string; name: string }>;
  selectedProjectId: string | null;
  projectVersion: number | null;
  items: Array<Record<string, unknown>>;
};

export type AdminPermissionResponse = {
  actions: Array<{ code: string; label: string }>;
  roles: Array<{
    id: string;
    code: string;
    name: string;
    description: string | null;
    status: string;
    isSystem: boolean;
    userCount: number;
    permissions: Array<{ code: string; label: string; granted: boolean; scope: string }>;
    locked: boolean;
  }>;
  enforcement: { backendRequired: boolean; frontendOnlyDenied: boolean };
};

export type AdminWorkflowResponse = {
  templates: Array<Record<string, unknown> & { id: string; code: string; version: string; name: string }>;
  nodes: Array<Record<string, unknown> & { id: string; step: number; nodeCode: string; name: string }>;
};

export type AdminDictionaryResponse = {
  categories: Array<{
    category: string;
    items: Array<{
      id: string;
      code: string;
      name: string;
      sortOrder: number;
      isActive: boolean;
      locked: boolean;
      dataVersion: string;
    }>;
  }>;
  parameters: Array<Record<string, unknown> & { id: string; category: string; code: string; locked: boolean }>;
};

export type AdminSavedView = {
  id: string;
  pageKey: string;
  name: string;
  config: Record<string, unknown>;
  version: number;
};

export type AdminLedgerQuery = {
  page?: number;
  pageSize?: number;
  search?: string;
  projectId?: string;
  projectStatus?: string;
  taskStatus?: string;
  nodeCode?: string;
  departmentId?: string;
  ownerUserId?: string;
  view?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
};

function buildQuery(query: Record<string, unknown>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  }
  return search.size ? `?${search.toString()}` : '';
}

export function fetchAdminProjects(query: AdminLedgerQuery = {}) {
  return apiRequest<AdminListResponse<AdminProjectRow>>(
    `/admin/projects${buildQuery(query)}`,
  );
}

export function fetchAdminTasks(query: AdminLedgerQuery = {}) {
  return apiRequest<AdminListResponse<AdminTaskRow>>(
    `/admin/tasks${buildQuery(query)}`,
  );
}

export function getAdminTaskExportUrl(query: AdminLedgerQuery = {}) {
  return `${API_BASE_URL}/admin/tasks/export${buildQuery(query)}`;
}

export function getAdminTaskImportTemplateUrl() {
  return `${API_BASE_URL}/admin/tasks/import-template`;
}

export function previewAdminTaskImport(body: { csv: string; reason: string }) {
  return apiRequest<Record<string, unknown>>('/admin/tasks/import-preview', {
    method: 'POST',
    body,
  });
}

export function applyAdminTaskImport(
  body: { csv: string; reason: string; idempotencyKey: string; acknowledgedConsequences: boolean },
) {
  return apiRequest('/admin/tasks/import', {
    method: 'POST',
    headers: commandHeaders(body.idempotencyKey),
    body,
  });
}

export function fetchAdminOrganization(
  query: AdminLedgerQuery & { tab?: 'users' | 'departments' | 'members' } = {},
) {
  return apiRequest<AdminOrganizationResponse>(
    `/admin/organization${buildQuery(query)}`,
  );
}

export function fetchAdminAssignments(projectId?: string) {
  return apiRequest<AdminAssignmentResponse>(
    `/admin/assignments${buildQuery({ projectId })}`,
  );
}

export function fetchAdminPermissions() {
  return apiRequest<AdminPermissionResponse>('/admin/permissions');
}

export function fetchAdminWorkflowTemplates() {
  return apiRequest<AdminWorkflowResponse>('/admin/workflow-templates');
}

export function fetchAdminDictionaries() {
  return apiRequest<AdminDictionaryResponse>('/admin/dictionaries');
}

export function fetchAdminSavedViews(pageKey: string) {
  return apiRequest<AdminSavedView[]>(
    `/admin/saved-views${buildQuery({ pageKey })}`,
  );
}

export function saveAdminView(body: {
  pageKey: string;
  name: string;
  config: Record<string, unknown>;
  expectedVersion?: number;
}) {
  return apiRequest<AdminSavedView>('/admin/saved-views', {
    method: 'POST',
    body,
  });
}

function commandHeaders(idempotencyKey: string) {
  return {
    'Idempotency-Key': idempotencyKey,
    'X-Request-Id': idempotencyKey,
  };
}

export function updateAdminProject(
  projectId: string,
  body: Record<string, unknown> & { idempotencyKey: string },
) {
  return apiRequest(`/admin/projects/${encodeURIComponent(projectId)}/basic-info`, {
    method: 'PATCH',
    headers: commandHeaders(body.idempotencyKey),
    body,
  });
}

export function previewAdminSchedule(taskId: string, body: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>(
    `/admin/tasks/${encodeURIComponent(taskId)}/schedule-change-preview`,
    { method: 'POST', body },
  );
}

export function updateAdminSchedule(
  taskId: string,
  body: Record<string, unknown> & { idempotencyKey: string },
) {
  return apiRequest(`/admin/tasks/${encodeURIComponent(taskId)}/schedule-change`, {
    method: 'POST',
    headers: commandHeaders(body.idempotencyKey),
    body,
  });
}

export function previewAdminAssignment(taskId: string, body: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>(
    `/admin/tasks/${encodeURIComponent(taskId)}/assignment-change-preview`,
    { method: 'POST', body },
  );
}

export function updateAdminAssignment(
  taskId: string,
  body: Record<string, unknown> & { idempotencyKey: string },
) {
  return apiRequest(`/admin/tasks/${encodeURIComponent(taskId)}/assignment-change`, {
    method: 'POST',
    headers: commandHeaders(body.idempotencyKey),
    body,
  });
}

export function previewAdminBatchTasks(body: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>('/admin/tasks/batch-change-preview', {
    method: 'POST',
    body,
  });
}

export function updateAdminBatchTasks(
  body: Record<string, unknown> & { idempotencyKey: string },
) {
  return apiRequest('/admin/tasks/batch-change', {
    method: 'POST',
    headers: commandHeaders(body.idempotencyKey),
    body,
  });
}

export function updateAdminUserStatus(
  userId: string,
  body: Record<string, unknown> & { idempotencyKey: string },
) {
  return apiRequest(`/admin/users/${encodeURIComponent(userId)}/status-change`, {
    method: 'POST',
    headers: commandHeaders(body.idempotencyKey),
    body,
  });
}

export function updateAdminDictionary(
  itemId: string,
  body: Record<string, unknown> & { idempotencyKey: string },
) {
  return apiRequest(`/admin/dictionaries/${encodeURIComponent(itemId)}/change`, {
    method: 'POST',
    headers: commandHeaders(body.idempotencyKey),
    body,
  });
}

export function createAdminTemplateVersion(
  templateId: string,
  body: Record<string, unknown> & { idempotencyKey: string },
) {
  return apiRequest(`/admin/workflow-templates/${encodeURIComponent(templateId)}/versions`, {
    method: 'POST',
    headers: commandHeaders(body.idempotencyKey),
    body,
  });
}
