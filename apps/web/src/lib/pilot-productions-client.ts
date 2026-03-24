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

export type FirstProductionPlanStatus =
  | 'DRAFT'
  | 'PLANNED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

export type TrialProductionStatus =
  | 'PLANNED'
  | 'IN_PROGRESS'
  | 'PASSED'
  | 'FAILED'
  | 'CANCELLED';

export type TrialProductionResult = 'PASS' | 'FAIL' | 'PASS_WITH_ISSUES';
export type TrialProductionIssueSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type FirstProductionPlanRecord = {
  id: string;
  planNo: string;
  status: FirstProductionPlanStatus;
  planDate: string | null;
  plannedQuantity: number | null;
  actualQuantity: number | null;
  workshop: string | null;
  lineName: string | null;
  ownerId: string | null;
  ownerName: string | null;
  batchNo: string | null;
  note: string | null;
  confirmedAt: string | null;
  confirmedById: string | null;
  confirmedByName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TrialProductionIssueRecord = {
  id: string;
  issueType: string;
  description: string;
  severity: TrialProductionIssueSeverity;
  responsibleDept: string;
  createdAt: string;
  updatedAt: string;
};

export type TrialProductionRecord = {
  id: string;
  productionPlanId: string | null;
  productionPlanNo: string | null;
  vehicleNo: string;
  workshop: string | null;
  trialDate: string | null;
  paintBatchNo: string | null;
  issueSummary: string | null;
  result: TrialProductionResult | null;
  status: TrialProductionStatus;
  note: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  issues: TrialProductionIssueRecord[];
};

export type FirstProductionPlanWorkspaceResponse = {
  project: {
    id: string;
    code: string;
    name: string;
    currentNodeCode: WorkflowNodeCode | null;
    currentNodeName: string | null;
    targetDate: string | null;
    riskLevel: ProjectPriority;
  };
  procurementCompleted: boolean;
  activeTask: WorkflowTaskSummary | null;
  canCompleteTask: boolean;
  completionIssue: string | null;
  downstreamTrialProductionTask: WorkflowTaskSummary | null;
  items: FirstProductionPlanRecord[];
};

export type TrialProductionWorkspaceResponse = {
  project: {
    id: string;
    code: string;
    name: string;
    currentNodeCode: WorkflowNodeCode | null;
    currentNodeName: string | null;
    targetDate: string | null;
    riskLevel: ProjectPriority;
  };
  firstProductionPlanCompleted: boolean;
  activeTask: WorkflowTaskSummary | null;
  canCompleteTask: boolean;
  completionIssue: string | null;
  downstreamCabReviewTask: WorkflowTaskSummary | null;
  planOptions: Array<{
    id: string;
    planNo: string;
    planDate: string | null;
    status: FirstProductionPlanStatus;
    ownerName: string | null;
  }>;
  items: TrialProductionRecord[];
};

export type FirstProductionPlanFormInput = {
  planDate: string;
  plannedQuantity: string;
  workshop: string;
  lineName: string;
  ownerId: string;
  batchNo: string;
  note: string;
};

export type TrialProductionFormInput = {
  productionPlanId: string;
  vehicleNo: string;
  workshop: string;
  trialDate: string;
  paintBatchNo: string;
  result: TrialProductionResult | '';
  issueSummary: string;
  note: string;
};

export type TrialProductionIssueFormInput = {
  issueType: string;
  description: string;
  severity: TrialProductionIssueSeverity;
  responsibleDept: string;
};

const PILOT_PRODUCTION_MANAGEMENT_ROLE_CODES: FrontendRoleCode[] = [
  'admin',
  'project_manager',
  'process_engineer',
];

const FIRST_PRODUCTION_PLAN_STATUS_LABELS: Record<
  FirstProductionPlanStatus,
  string
> = {
  DRAFT: '草稿',
  PLANNED: '已确认',
  IN_PROGRESS: '执行中',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
};

const TRIAL_PRODUCTION_STATUS_LABELS: Record<TrialProductionStatus, string> = {
  PLANNED: '待试制',
  IN_PROGRESS: '进行中',
  PASSED: '已完成',
  FAILED: '试制失败',
  CANCELLED: '已取消',
};

export const TRIAL_PRODUCTION_RESULT_OPTIONS: Array<{
  value: TrialProductionResult;
  label: string;
}> = [
  { value: 'PASS', label: '通过' },
  { value: 'PASS_WITH_ISSUES', label: '通过但有问题' },
  { value: 'FAIL', label: '不通过' },
];

export const TRIAL_PRODUCTION_ISSUE_SEVERITY_OPTIONS: Array<{
  value: TrialProductionIssueSeverity;
  label: string;
}> = [
  { value: 'LOW', label: '低' },
  { value: 'MEDIUM', label: '中' },
  { value: 'HIGH', label: '高' },
  { value: 'CRITICAL', label: '紧急' },
];

const TRIAL_PRODUCTION_RESULT_LABELS = Object.fromEntries(
  TRIAL_PRODUCTION_RESULT_OPTIONS.map((item) => [item.value, item.label]),
) as Record<TrialProductionResult, string>;

const TRIAL_PRODUCTION_ISSUE_SEVERITY_LABELS = Object.fromEntries(
  TRIAL_PRODUCTION_ISSUE_SEVERITY_OPTIONS.map((item) => [item.value, item.label]),
) as Record<TrialProductionIssueSeverity, string>;

export async function fetchFirstProductionPlanWorkspace(projectId: string) {
  return apiRequest<FirstProductionPlanWorkspaceResponse>(
    `/projects/${projectId}/first-production-plans`,
  );
}

export async function createFirstProductionPlan(
  projectId: string,
  input: FirstProductionPlanFormInput,
) {
  return apiRequest<FirstProductionPlanWorkspaceResponse>(
    `/projects/${projectId}/first-production-plans`,
    {
      method: 'POST',
      body: {
        ...input,
        plannedQuantity: Number(input.plannedQuantity),
      },
    },
  );
}

export async function updateFirstProductionPlan(
  projectId: string,
  planId: string,
  input: FirstProductionPlanFormInput,
) {
  return apiRequest<FirstProductionPlanWorkspaceResponse>(
    `/projects/${projectId}/first-production-plans/${planId}`,
    {
      method: 'PATCH',
      body: {
        ...input,
        plannedQuantity: Number(input.plannedQuantity),
      },
    },
  );
}

export async function confirmFirstProductionPlan(projectId: string, planId: string) {
  return apiRequest<FirstProductionPlanWorkspaceResponse>(
    `/projects/${projectId}/first-production-plans/${planId}/confirm`,
    {
      method: 'POST',
    },
  );
}

export async function completeFirstProductionPlanTask(projectId: string) {
  return apiRequest<FirstProductionPlanWorkspaceResponse>(
    `/projects/${projectId}/first-production-plans/complete-task`,
    {
      method: 'POST',
    },
  );
}

export async function fetchTrialProductionWorkspace(projectId: string) {
  return apiRequest<TrialProductionWorkspaceResponse>(
    `/projects/${projectId}/trial-productions`,
  );
}

export async function fetchTrialProductionDetail(projectId: string, trialId: string) {
  return apiRequest<TrialProductionRecord>(
    `/projects/${projectId}/trial-productions/${trialId}`,
  );
}

export async function createTrialProduction(
  projectId: string,
  input: TrialProductionFormInput,
) {
  return apiRequest<TrialProductionWorkspaceResponse>(
    `/projects/${projectId}/trial-productions`,
    {
      method: 'POST',
      body: {
        ...input,
        productionPlanId: input.productionPlanId || null,
        result: input.result || null,
        issueSummary: input.issueSummary || null,
        note: input.note || null,
      },
    },
  );
}

export async function updateTrialProduction(
  projectId: string,
  trialId: string,
  input: TrialProductionFormInput,
) {
  return apiRequest<TrialProductionWorkspaceResponse>(
    `/projects/${projectId}/trial-productions/${trialId}`,
    {
      method: 'PATCH',
      body: {
        ...input,
        productionPlanId: input.productionPlanId || null,
        result: input.result || null,
        issueSummary: input.issueSummary || null,
        note: input.note || null,
      },
    },
  );
}

export async function addTrialProductionIssue(
  projectId: string,
  trialId: string,
  input: TrialProductionIssueFormInput,
) {
  return apiRequest<TrialProductionWorkspaceResponse>(
    `/projects/${projectId}/trial-productions/${trialId}/add-issue`,
    {
      method: 'POST',
      body: input,
    },
  );
}

export async function completeTrialProductionRecord(projectId: string, trialId: string) {
  return apiRequest<TrialProductionWorkspaceResponse>(
    `/projects/${projectId}/trial-productions/${trialId}/complete`,
    {
      method: 'POST',
    },
  );
}

export async function completeTrialProductionTask(projectId: string) {
  return apiRequest<TrialProductionWorkspaceResponse>(
    `/projects/${projectId}/trial-productions/complete-task`,
    {
      method: 'POST',
    },
  );
}

export async function fetchPilotProductionPageOptions() {
  return fetchUserDirectory();
}

export function getDefaultProductionOwnerId(
  users: DirectoryUser[],
  currentUserId: string | null,
) {
  if (currentUserId && users.some((user) => user.id === currentUserId)) {
    return currentUserId;
  }

  return users[0]?.id ?? '';
}

export function getDefaultTrialPlanId(workspace: TrialProductionWorkspaceResponse | null) {
  return workspace?.planOptions[0]?.id ?? '';
}

export function validateFirstProductionPlanForm(input: FirstProductionPlanFormInput) {
  if (!input.planDate.trim()) {
    return '计划日期不能为空。';
  }

  if (!input.plannedQuantity.trim()) {
    return '计划数量不能为空。';
  }

  if (!Number.isInteger(Number(input.plannedQuantity)) || Number(input.plannedQuantity) <= 0) {
    return '计划数量必须是大于 0 的整数。';
  }

  if (!input.workshop.trim()) {
    return '车间不能为空。';
  }

  if (!input.lineName.trim()) {
    return '生产线不能为空。';
  }

  if (!input.ownerId.trim()) {
    return '责任人不能为空。';
  }

  if (!input.batchNo.trim()) {
    return '批次号不能为空。';
  }

  return null;
}

export function validateTrialProductionForm(input: TrialProductionFormInput) {
  if (!input.trialDate.trim()) {
    return '试制日期不能为空。';
  }

  if (!input.vehicleNo.trim()) {
    return '样车编号不能为空。';
  }

  if (!input.workshop.trim()) {
    return '车间不能为空。';
  }

  if (!input.paintBatchNo.trim()) {
    return '涂料批次不能为空。';
  }

  return null;
}

export function validateTrialProductionIssueForm(
  input: TrialProductionIssueFormInput,
) {
  if (!input.issueType.trim()) {
    return '问题类型不能为空。';
  }

  if (!input.description.trim()) {
    return '问题描述不能为空。';
  }

  if (!input.responsibleDept.trim()) {
    return '责任部门不能为空。';
  }

  return null;
}

export function canManagePilotProductions(user: SessionUser | null) {
  if (!user) {
    return false;
  }

  if (user.isSystemAdmin) {
    return true;
  }

  return user.roleCodes.some((roleCode) =>
    PILOT_PRODUCTION_MANAGEMENT_ROLE_CODES.includes(roleCode),
  );
}

export function canShowCompleteFirstProductionPlanTaskButton(
  user: SessionUser | null,
  workspace: FirstProductionPlanWorkspaceResponse,
) {
  if (!workspace.activeTask || !workspace.canCompleteTask) {
    return false;
  }

  return (
    canManagePilotProductions(user) &&
    canUserOperateWorkflowTask(user, workspace.activeTask)
  );
}

export function canShowCompleteTrialProductionTaskButton(
  user: SessionUser | null,
  workspace: TrialProductionWorkspaceResponse,
) {
  if (!workspace.activeTask || !workspace.canCompleteTask) {
    return false;
  }

  return (
    canManagePilotProductions(user) &&
    canUserOperateWorkflowTask(user, workspace.activeTask)
  );
}

export function getFirstProductionPlanStatusLabel(status: FirstProductionPlanStatus) {
  return FIRST_PRODUCTION_PLAN_STATUS_LABELS[status];
}

export function getTrialProductionStatusLabel(status: TrialProductionStatus) {
  return TRIAL_PRODUCTION_STATUS_LABELS[status];
}

export function getTrialProductionResultLabel(result: TrialProductionResult | null) {
  if (!result) {
    return '未填写';
  }

  return TRIAL_PRODUCTION_RESULT_LABELS[result];
}

export function getTrialProductionIssueSeverityLabel(
  severity: TrialProductionIssueSeverity,
) {
  return TRIAL_PRODUCTION_ISSUE_SEVERITY_LABELS[severity];
}

export function getPilotProductionWorkspaceHighlights(input: {
  project: FirstProductionPlanWorkspaceResponse['project'];
  firstPlanTask: WorkflowTaskSummary | null;
  trialTask: WorkflowTaskSummary | null;
}) {
  return {
    currentNodeLabel: getWorkflowNodeLabel(input.project.currentNodeCode),
    targetDateLabel: formatDate(input.project.targetDate),
    riskLevelLabel: getProjectPriorityLabel(input.project.riskLevel),
    firstPlanTaskStatusLabel: input.firstPlanTask
      ? getWorkflowTaskStatusLabel(input.firstPlanTask.status)
      : '当前无首台计划任务',
    trialTaskStatusLabel: input.trialTask
      ? getWorkflowTaskStatusLabel(input.trialTask.status)
      : '当前无样车试制任务',
  };
}
