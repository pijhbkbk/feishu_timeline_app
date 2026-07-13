'use client';

import { apiRequest } from './auth-client';
import type { ProjectStatus, WorkflowNodeCode } from './projects-client';

export type RetrospectiveForm = {
  status: 'DRAFT' | 'COMPLETED';
  conclusion: string;
  improvementMeasures: RetrospectiveImprovement[];
  strengths: string;
  problems: string;
  reusableExperience: string;
  workflowRuleUpdates: string;
  completedByName: string | null;
  completedAt: string | null;
  updatedAt: string | null;
};

export type RetrospectiveImprovement = {
  problem: string;
  rootCause: string;
  measure: string;
  responsibleDepartment: string;
  dueDate: string | null;
  isWorkflowRuleUpdate: boolean;
};

export type ProjectRetrospectiveResponse = {
  project: {
    id: string;
    code: string;
    name: string;
    colorName: string | null;
    colorCode: string | null;
    status: ProjectStatus;
    ownerName: string | null;
    currentNodeCode: WorkflowNodeCode | null;
  };
  eligibility: { canComplete: boolean; reason: string | null };
  summary: {
    conclusion: string;
    annualOutput: number | null;
    monthlyCompleted: number;
    monthlyTotal: number;
    plannedDurationDays: number;
    actualDurationDays: number;
    delayDays: number;
  };
  stages: Array<{
    key: string;
    name: string;
    plannedDays: number;
    actualDays: number;
    varianceDays: number;
    completedTasks: number;
    totalTasks: number;
  }>;
  bottlenecks: {
    maxDelay: { nodeName: string; days: number } | null;
    maxRework: { nodeName: string; rounds: number; reason: string | null } | null;
    maxMissingMaterial: { nodeName: string; count: number } | null;
    frequentBlocker: {
      type: string;
      count: number;
      description: string;
      helperName: string | null;
      open: boolean;
    } | null;
  };
  form: RetrospectiveForm;
};

export type SaveRetrospectiveInput = Pick<
  RetrospectiveForm,
  'conclusion' | 'improvementMeasures' | 'strengths' | 'problems' | 'reusableExperience' | 'workflowRuleUpdates'
>;

export function fetchProjectRetrospective(projectId: string) {
  return apiRequest<ProjectRetrospectiveResponse>(`/projects/${projectId}/retrospective`);
}

export function saveProjectRetrospective(projectId: string, input: SaveRetrospectiveInput) {
  return apiRequest<ProjectRetrospectiveResponse>(`/projects/${projectId}/retrospective`, {
    method: 'PUT',
    body: input,
  });
}

export function completeProjectRetrospective(projectId: string, input: SaveRetrospectiveInput) {
  return apiRequest<ProjectRetrospectiveResponse>(`/projects/${projectId}/retrospective/complete`, {
    method: 'POST',
    body: input,
  });
}
