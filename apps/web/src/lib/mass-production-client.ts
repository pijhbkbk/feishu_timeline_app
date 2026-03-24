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

export type MassProductionStatus =
  | 'DRAFT'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

export type MassProductionRecord = {
  id: string;
  planNo: string;
  status: MassProductionStatus;
  productionDate: string | null;
  plannedQuantity: number | null;
  actualQuantity: number | null;
  workshop: string | null;
  lineName: string | null;
  ownerId: string | null;
  ownerName: string | null;
  batchNo: string | null;
  exceptionNote: string | null;
  actualStartAt: string | null;
  actualEndAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MassProductionWorkspaceResponse = {
  project: {
    id: string;
    code: string;
    name: string;
    currentNodeCode: WorkflowNodeCode | null;
    currentNodeName: string | null;
    targetDate: string | null;
    riskLevel: ProjectPriority;
  };
  schedulePlanCompleted: boolean;
  activeTask: WorkflowTaskSummary | null;
  downstreamVisualReviewTask: WorkflowTaskSummary | null;
  canCompleteTask: boolean;
  completionIssue: string | null;
  items: MassProductionRecord[];
};

export type MassProductionFormInput = {
  productionDate: string;
  batchNo: string;
  plannedQuantity: string;
  actualQuantity: string;
  workshop: string;
  lineName: string;
  ownerId: string;
  exceptionNote: string;
  status: MassProductionStatus;
};

const MASS_PRODUCTION_ROLE_CODES: FrontendRoleCode[] = [
  'admin',
  'project_manager',
  'process_engineer',
];

const MASS_PRODUCTION_STATUS_LABELS: Record<MassProductionStatus, string> = {
  DRAFT: '草稿',
  IN_PROGRESS: '进行中',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
};

export function fetchMassProductionWorkspace(projectId: string) {
  return apiRequest<MassProductionWorkspaceResponse>(
    `/projects/${projectId}/mass-production`,
  );
}

export function createMassProductionRecord(
  projectId: string,
  input: MassProductionFormInput,
) {
  return apiRequest<MassProductionWorkspaceResponse>(
    `/projects/${projectId}/mass-production`,
    {
      method: 'POST',
      body: toMassProductionPayload(input),
    },
  );
}

export function updateMassProductionRecord(
  projectId: string,
  recordId: string,
  input: MassProductionFormInput,
) {
  return apiRequest<MassProductionWorkspaceResponse>(
    `/projects/${projectId}/mass-production/${recordId}`,
    {
      method: 'PATCH',
      body: toMassProductionPayload(input),
    },
  );
}

export function startMassProductionRecord(projectId: string, recordId: string) {
  return apiRequest<MassProductionWorkspaceResponse>(
    `/projects/${projectId}/mass-production/${recordId}/start`,
    {
      method: 'POST',
    },
  );
}

export function completeMassProductionRecord(projectId: string, recordId: string) {
  return apiRequest<MassProductionWorkspaceResponse>(
    `/projects/${projectId}/mass-production/${recordId}/complete`,
    {
      method: 'POST',
    },
  );
}

export function cancelMassProductionRecord(projectId: string, recordId: string) {
  return apiRequest<MassProductionWorkspaceResponse>(
    `/projects/${projectId}/mass-production/${recordId}/cancel`,
    {
      method: 'POST',
    },
  );
}

export function completeMassProductionTask(projectId: string) {
  return apiRequest<MassProductionWorkspaceResponse>(
    `/projects/${projectId}/mass-production/complete-task`,
    {
      method: 'POST',
    },
  );
}

export function fetchMassProductionPageOptions() {
  return fetchUserDirectory();
}

export function getDefaultMassProductionOwnerId(
  users: DirectoryUser[],
  currentUserId: string | null,
) {
  if (currentUserId && users.some((user) => user.id === currentUserId)) {
    return currentUserId;
  }

  return users[0]?.id ?? '';
}

export function validateMassProductionForm(input: MassProductionFormInput) {
  if (!input.productionDate.trim()) {
    return '生产日期不能为空。';
  }

  if (!input.batchNo.trim()) {
    return '生产批次不能为空。';
  }

  if (!input.plannedQuantity.trim()) {
    return '计划数量不能为空。';
  }

  if (!Number.isInteger(Number(input.plannedQuantity)) || Number(input.plannedQuantity) <= 0) {
    return '计划数量必须是大于 0 的整数。';
  }

  if (
    input.actualQuantity.trim() &&
    (!Number.isInteger(Number(input.actualQuantity)) || Number(input.actualQuantity) < 0)
  ) {
    return '实际数量必须是大于等于 0 的整数。';
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

  return null;
}

export function canManageMassProductions(user: SessionUser | null) {
  if (!user) {
    return false;
  }

  if (user.isSystemAdmin || user.roleCodes.includes('admin')) {
    return true;
  }

  return MASS_PRODUCTION_ROLE_CODES.some((roleCode) => user.roleCodes.includes(roleCode));
}

export function canShowCompleteMassProductionTaskButton(
  user: SessionUser | null,
  workspace: MassProductionWorkspaceResponse,
) {
  if (!workspace.activeTask || !workspace.canCompleteTask) {
    return false;
  }

  return canUserOperateWorkflowTask(user, workspace.activeTask);
}

export function getMassProductionStatusLabel(value: MassProductionStatus) {
  return MASS_PRODUCTION_STATUS_LABELS[value];
}

export function getMassProductionWorkspaceHighlights(
  workspace: MassProductionWorkspaceResponse,
) {
  return {
    currentNodeLabel: getWorkflowNodeLabel(workspace.project.currentNodeCode),
    targetDateLabel: formatDate(workspace.project.targetDate),
    riskLevelLabel: getProjectPriorityLabel(workspace.project.riskLevel),
    activeTaskStatusLabel: workspace.activeTask
      ? getWorkflowTaskStatusLabel(workspace.activeTask.status)
      : '当前无批量生产任务',
    downstreamTaskStatusLabel: workspace.downstreamVisualReviewTask
      ? getWorkflowTaskStatusLabel(workspace.downstreamVisualReviewTask.status)
      : '未激活',
  };
}

export function toMassProductionFormInput(
  record: MassProductionRecord,
): MassProductionFormInput {
  return {
    productionDate: toDateInputValue(record.productionDate),
    batchNo: record.batchNo ?? '',
    plannedQuantity:
      typeof record.plannedQuantity === 'number' ? String(record.plannedQuantity) : '',
    actualQuantity:
      typeof record.actualQuantity === 'number' ? String(record.actualQuantity) : '',
    workshop: record.workshop ?? '',
    lineName: record.lineName ?? '',
    ownerId: record.ownerId ?? '',
    exceptionNote: record.exceptionNote ?? '',
    status: record.status,
  };
}

function toMassProductionPayload(input: MassProductionFormInput) {
  return {
    productionDate: input.productionDate,
    batchNo: input.batchNo,
    plannedQuantity: Number(input.plannedQuantity),
    actualQuantity: input.actualQuantity.trim() ? Number(input.actualQuantity) : null,
    workshop: input.workshop,
    lineName: input.lineName,
    ownerId: input.ownerId,
    exceptionNote: input.exceptionNote || null,
  };
}

function toDateInputValue(value: string | null | undefined) {
  if (!value) {
    return '';
  }

  return new Date(value).toISOString().slice(0, 10);
}
