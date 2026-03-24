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

export type SchedulePlanStatus = 'DRAFT' | 'CONFIRMED' | 'CANCELLED';

export type SchedulePlanRecord = {
  id: string;
  planNo: string;
  status: SchedulePlanStatus;
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

export type SchedulePlansWorkspaceResponse = {
  project: {
    id: string;
    code: string;
    name: string;
    currentNodeCode: WorkflowNodeCode | null;
    currentNodeName: string | null;
    targetDate: string | null;
    riskLevel: ProjectPriority;
  };
  consistencyReviewApproved: boolean;
  activeTask: WorkflowTaskSummary | null;
  downstreamMassProductionTask: WorkflowTaskSummary | null;
  canCompleteTask: boolean;
  completionIssue: string | null;
  items: SchedulePlanRecord[];
};

export type SchedulePlanFormInput = {
  planDate: string;
  plannedQuantity: string;
  workshop: string;
  lineName: string;
  ownerId: string;
  batchNo: string;
  note: string;
};

const SCHEDULE_PLAN_ROLE_CODES: FrontendRoleCode[] = [
  'admin',
  'project_manager',
  'process_engineer',
];

const SCHEDULE_PLAN_STATUS_LABELS: Record<SchedulePlanStatus, string> = {
  DRAFT: '草稿',
  CONFIRMED: '已确认',
  CANCELLED: '已取消',
};

export function fetchSchedulePlansWorkspace(projectId: string) {
  return apiRequest<SchedulePlansWorkspaceResponse>(
    `/projects/${projectId}/production-plans/schedule`,
  );
}

export function createSchedulePlan(
  projectId: string,
  input: SchedulePlanFormInput,
) {
  return apiRequest<SchedulePlansWorkspaceResponse>(
    `/projects/${projectId}/production-plans/schedule`,
    {
      method: 'POST',
      body: toSchedulePlanPayload(input),
    },
  );
}

export function updateSchedulePlan(
  projectId: string,
  planId: string,
  input: SchedulePlanFormInput,
) {
  return apiRequest<SchedulePlansWorkspaceResponse>(
    `/projects/${projectId}/production-plans/schedule/${planId}`,
    {
      method: 'PATCH',
      body: toSchedulePlanPayload(input),
    },
  );
}

export function confirmSchedulePlan(projectId: string, planId: string) {
  return apiRequest<SchedulePlansWorkspaceResponse>(
    `/projects/${projectId}/production-plans/schedule/${planId}/confirm`,
    {
      method: 'POST',
    },
  );
}

export function cancelSchedulePlan(projectId: string, planId: string) {
  return apiRequest<SchedulePlansWorkspaceResponse>(
    `/projects/${projectId}/production-plans/schedule/${planId}/cancel`,
    {
      method: 'POST',
    },
  );
}

export function completeSchedulePlanTask(projectId: string) {
  return apiRequest<SchedulePlansWorkspaceResponse>(
    `/projects/${projectId}/production-plans/schedule/complete-task`,
    {
      method: 'POST',
    },
  );
}

export function fetchSchedulePlanPageOptions() {
  return fetchUserDirectory();
}

export function getDefaultSchedulePlanOwnerId(
  users: DirectoryUser[],
  currentUserId: string | null,
) {
  if (currentUserId && users.some((user) => user.id === currentUserId)) {
    return currentUserId;
  }

  return users[0]?.id ?? '';
}

export function validateSchedulePlanForm(input: SchedulePlanFormInput) {
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
    return '计划批次不能为空。';
  }

  return null;
}

export function canManageSchedulePlans(user: SessionUser | null) {
  if (!user) {
    return false;
  }

  if (user.isSystemAdmin || user.roleCodes.includes('admin')) {
    return true;
  }

  return SCHEDULE_PLAN_ROLE_CODES.some((roleCode) => user.roleCodes.includes(roleCode));
}

export function canShowCompleteSchedulePlanTaskButton(
  user: SessionUser | null,
  workspace: SchedulePlansWorkspaceResponse,
) {
  if (!workspace.activeTask || !workspace.canCompleteTask) {
    return false;
  }

  return canUserOperateWorkflowTask(user, workspace.activeTask);
}

export function getSchedulePlanStatusLabel(value: SchedulePlanStatus) {
  return SCHEDULE_PLAN_STATUS_LABELS[value];
}

export function getSchedulePlansWorkspaceHighlights(
  workspace: SchedulePlansWorkspaceResponse,
) {
  return {
    currentNodeLabel: getWorkflowNodeLabel(workspace.project.currentNodeCode),
    targetDateLabel: formatDate(workspace.project.targetDate),
    riskLevelLabel: getProjectPriorityLabel(workspace.project.riskLevel),
    activeTaskStatusLabel: workspace.activeTask
      ? getWorkflowTaskStatusLabel(workspace.activeTask.status)
      : '当前无排产任务',
    downstreamTaskStatusLabel: workspace.downstreamMassProductionTask
      ? getWorkflowTaskStatusLabel(workspace.downstreamMassProductionTask.status)
      : '未激活',
  };
}

export function toSchedulePlanFormInput(
  record: SchedulePlanRecord,
): SchedulePlanFormInput {
  return {
    planDate: toDateInputValue(record.planDate),
    plannedQuantity:
      typeof record.plannedQuantity === 'number' ? String(record.plannedQuantity) : '',
    workshop: record.workshop ?? '',
    lineName: record.lineName ?? '',
    ownerId: record.ownerId ?? '',
    batchNo: record.batchNo ?? '',
    note: record.note ?? '',
  };
}

function toSchedulePlanPayload(input: SchedulePlanFormInput) {
  return {
    planDate: input.planDate,
    plannedQuantity: Number(input.plannedQuantity),
    workshop: input.workshop,
    lineName: input.lineName,
    ownerId: input.ownerId,
    batchNo: input.batchNo,
    note: input.note || null,
  };
}

function toDateInputValue(value: string | null | undefined) {
  if (!value) {
    return '';
  }

  return new Date(value).toISOString().slice(0, 10);
}
