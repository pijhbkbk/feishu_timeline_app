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
