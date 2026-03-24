'use client';

import {
  apiRequest,
  type FrontendRoleCode,
  type SessionUser,
} from './auth-client';
import {
  formatDate,
  getProjectPriorityLabel,
  getWorkflowNodeLabel,
  type ProjectPriority,
  type WorkflowNodeCode,
} from './projects-client';
import {
  canUserOperateWorkflowTask,
  getWorkflowTaskStatusLabel,
  type WorkflowTaskSummary,
} from './workflows-client';

export type ColorSummary = {
  id: string;
  code: string | null;
  name: string;
  status: string;
  exitFlag?: boolean;
  exitDate?: string | null;
  isPrimary?: boolean;
};

export type ColorExitRecord = {
  id: string;
  workflowTaskId: string;
  colorId: string | null;
  colorName: string | null;
  colorCode: string | null;
  replacementColorId: string | null;
  replacementColorName: string | null;
  replacementColorCode: string | null;
  operatorId: string | null;
  operatorName: string | null;
  exitDate: string;
  exitReason: string;
  description: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ColorExitWorkspaceResponse = {
  project: {
    id: string;
    code: string;
    name: string;
    currentNodeCode: WorkflowNodeCode | null;
    currentNodeName: string | null;
    targetDate: string | null;
    riskLevel: ProjectPriority;
    status: string;
    actualEndDate: string | null;
  };
  visualDeltaApproved: boolean;
  activeTask: WorkflowTaskSummary | null;
  currentColor: ColorSummary | null;
  replacementOptions: ColorSummary[];
  canCompleteTask: boolean;
  completionIssue: string | null;
  items: ColorExitRecord[];
};

export type ColorExitFormInput = {
  exitDate: string;
  exitReason: string;
  description: string;
  replacementColorId: string;
};

const COLOR_EXIT_ROLE_CODES: FrontendRoleCode[] = [
  'admin',
  'project_manager',
  'process_engineer',
];

export function fetchColorExitWorkspace(projectId: string) {
  return apiRequest<ColorExitWorkspaceResponse>(`/projects/${projectId}/color-exit`);
}

export function createColorExitRecord(
  projectId: string,
  input: ColorExitFormInput,
) {
  return apiRequest<ColorExitWorkspaceResponse>(`/projects/${projectId}/color-exit`, {
    method: 'POST',
    body: toColorExitPayload(input),
  });
}

export function updateColorExitRecord(
  projectId: string,
  exitId: string,
  input: ColorExitFormInput,
) {
  return apiRequest<ColorExitWorkspaceResponse>(`/projects/${projectId}/color-exit/${exitId}`, {
    method: 'PATCH',
    body: toColorExitPayload(input),
  });
}

export function completeColorExitRecord(projectId: string, exitId: string) {
  return apiRequest<ColorExitWorkspaceResponse>(
    `/projects/${projectId}/color-exit/${exitId}/complete`,
    {
      method: 'POST',
    },
  );
}

export function validateColorExitForm(input: ColorExitFormInput) {
  if (!input.exitDate.trim()) {
    return '退出日期不能为空。';
  }

  if (!input.exitReason.trim()) {
    return '退出原因不能为空。';
  }

  return null;
}

export function canManageColorExit(user: SessionUser | null) {
  if (!user) {
    return false;
  }

  if (user.isSystemAdmin || user.roleCodes.includes('admin')) {
    return true;
  }

  return COLOR_EXIT_ROLE_CODES.some((roleCode) => user.roleCodes.includes(roleCode));
}

export function canShowCompleteColorExitButton(
  user: SessionUser | null,
  workspace: ColorExitWorkspaceResponse,
  record: ColorExitRecord | null,
) {
  if (!record || record.completedAt || !workspace.activeTask || !workspace.canCompleteTask) {
    return false;
  }

  return canUserOperateWorkflowTask(user, workspace.activeTask);
}

export function getColorExitWorkspaceHighlights(workspace: ColorExitWorkspaceResponse) {
  return {
    currentNodeLabel: getWorkflowNodeLabel(workspace.project.currentNodeCode),
    targetDateLabel: formatDate(workspace.project.targetDate),
    riskLevelLabel: getProjectPriorityLabel(workspace.project.riskLevel),
    activeTaskStatusLabel: workspace.activeTask
      ? getWorkflowTaskStatusLabel(workspace.activeTask.status)
      : '当前无颜色退出任务',
  };
}

export function toColorExitFormInput(record: ColorExitRecord): ColorExitFormInput {
  return {
    exitDate: record.exitDate.slice(0, 10),
    exitReason: record.exitReason,
    description: record.description ?? '',
    replacementColorId: record.replacementColorId ?? '',
  };
}

function toColorExitPayload(input: ColorExitFormInput) {
  return {
    exitDate: input.exitDate,
    exitReason: input.exitReason,
    description: input.description || null,
    replacementColorId: input.replacementColorId || null,
  };
}
