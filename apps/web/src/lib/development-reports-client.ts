'use client';

import { apiRequest } from './auth-client';
import { type WorkflowAction, type WorkflowTaskStatus } from './workflows-client';
import { type WorkflowNodeCode } from './projects-client';

export type DevelopmentReportStatus = 'DRAFT' | 'SUBMITTED';

export type DevelopmentReportTaskSummary = {
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

export type DevelopmentReportRecord = {
  id: string;
  projectId: string;
  workflowInstanceId: string;
  workflowTaskId: string;
  workflowTaskNo: string;
  taskStatus: WorkflowTaskStatus;
  taskRound: number;
  status: DevelopmentReportStatus;
  reportTitle: string;
  demandSource: string;
  targetMarket: string | null;
  targetVehicleModel: string | null;
  targetColorName: string;
  benchmarkColorRef: string | null;
  developmentReason: string;
  expectedLaunchDate: string | null;
  estimatedAnnualVolume: number | null;
  technicalRequirements: string | null;
  qualityRequirements: string | null;
  costTarget: string | null;
  riskSummary: string | null;
  remark: string | null;
  createdByName: string | null;
  updatedByName: string | null;
  submittedByName: string | null;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DevelopmentReportWorkspaceResponse = {
  project: {
    id: string;
    code: string;
    name: string;
    currentNodeCode: WorkflowNodeCode | null;
    currentNodeName: string | null;
    targetDate: string | null;
  };
  activeTask: DevelopmentReportTaskSummary | null;
  currentReport: DevelopmentReportRecord | null;
  latestReport: DevelopmentReportRecord | null;
  editable: boolean;
  submitAllowed: boolean;
};

export type DevelopmentReportWritePayload = {
  reportTitle?: string;
  demandSource: string;
  targetMarket?: string | null;
  targetVehicleModel?: string | null;
  targetColorName: string;
  benchmarkColorRef?: string | null;
  developmentReason: string;
  expectedLaunchDate?: string | null;
  estimatedAnnualVolume?: number | null;
  technicalRequirements?: string | null;
  qualityRequirements?: string | null;
  costTarget?: string | null;
  riskSummary?: string | null;
  remark?: string | null;
  submitComment?: string | null;
};

export function fetchDevelopmentReportWorkspace(projectId: string) {
  return apiRequest<DevelopmentReportWorkspaceResponse>(
    `/projects/${projectId}/development-report`,
  );
}

export function saveDevelopmentReport(
  projectId: string,
  payload: DevelopmentReportWritePayload,
) {
  return apiRequest<DevelopmentReportWorkspaceResponse>(
    `/projects/${projectId}/development-report`,
    {
      method: 'PUT',
      body: payload,
    },
  );
}

export function submitDevelopmentReport(
  projectId: string,
  payload: DevelopmentReportWritePayload,
) {
  return apiRequest<DevelopmentReportWorkspaceResponse>(
    `/projects/${projectId}/development-report/submit`,
    {
      method: 'POST',
      body: payload,
    },
  );
}
