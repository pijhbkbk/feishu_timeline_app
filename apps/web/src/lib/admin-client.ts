'use client';

import { apiRequest } from './auth-client';

export type AdminOverviewResponse = {
  generatedAt: string;
  summary: {
    activeUsers: number;
    activeDepartments: number;
    activeTemplates: number;
    anomalyCount: number;
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
