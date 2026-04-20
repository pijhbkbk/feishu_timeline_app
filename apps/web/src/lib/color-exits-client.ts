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

export type ColorExitSuggestion = 'EXIT' | 'RETAIN' | 'OBSERVE';

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
  statisticYear: number | null;
  annualOutput: number | null;
  exitThreshold: number | null;
  systemSuggestion: ColorExitSuggestion | null;
  finalDecision: ColorExitSuggestion | null;
  effectiveDate: string | null;
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
  defaultExitThreshold: number;
  canCompleteTask: boolean;
  completionIssue: string | null;
  items: ColorExitRecord[];
};

export type ColorExitFormInput = {
  exitDate: string;
  statisticYear: string;
  annualOutput: string;
  finalDecision: ColorExitSuggestion | '';
  effectiveDate: string;
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

  if (input.statisticYear.trim() && !/^\d{4}$/.test(input.statisticYear.trim())) {
    return '统计年度必须为四位年份。';
  }

  if (input.annualOutput.trim() && !/^\d+$/.test(input.annualOutput.trim())) {
    return '年产量必须为非负整数。';
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
    defaultExitThresholdLabel: `${workspace.defaultExitThreshold} 台`,
  };
}

export function toColorExitFormInput(record: ColorExitRecord): ColorExitFormInput {
  return {
    exitDate: record.exitDate.slice(0, 10),
    statisticYear: record.statisticYear ? String(record.statisticYear) : '',
    annualOutput: record.annualOutput != null ? String(record.annualOutput) : '',
    finalDecision: record.finalDecision ?? '',
    effectiveDate: record.effectiveDate?.slice(0, 10) ?? '',
    exitReason: record.exitReason,
    description: record.description ?? '',
    replacementColorId: record.replacementColorId ?? '',
  };
}

function toColorExitPayload(input: ColorExitFormInput) {
  return {
    exitDate: input.exitDate,
    statisticYear: input.statisticYear ? Number(input.statisticYear) : null,
    annualOutput: input.annualOutput ? Number(input.annualOutput) : null,
    finalDecision: input.finalDecision || null,
    effectiveDate: input.effectiveDate || null,
    exitReason: input.exitReason,
    description: input.description || null,
    replacementColorId: input.replacementColorId || null,
  };
}

export function getColorExitSuggestionLabel(value: ColorExitSuggestion | null | undefined) {
  if (value === 'EXIT') {
    return '建议退出';
  }

  if (value === 'RETAIN') {
    return '建议保留';
  }

  if (value === 'OBSERVE') {
    return '延期观察';
  }

  return '待计算';
}
