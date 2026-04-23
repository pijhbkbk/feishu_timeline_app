'use client';

import { apiRequest, type FrontendRoleCode, type SessionUser } from './auth-client';
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

export type DevelopmentFeeType =
  | 'PAINT_DEVELOPMENT'
  | 'SAMPLE_MAKING'
  | 'TESTING'
  | 'STANDARD_BOARD'
  | 'PROCUREMENT'
  | 'OTHER';

export type DevelopmentFeeStatus = 'PENDING' | 'RECORDED' | 'PAID' | 'CANCELLED';

export type FeeRecord = {
  id: string;
  feeType: DevelopmentFeeType;
  amount: string;
  currency: string;
  payer: string | null;
  payStatus: DevelopmentFeeStatus;
  recordedById: string | null;
  recordedByName: string | null;
  createdById: string | null;
  createdByName: string | null;
  recordedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FeesWorkspaceResponse = {
  project: {
    id: string;
    code: string;
    name: string;
    currentNodeCode: WorkflowNodeCode | null;
    currentNodeName: string | null;
    targetDate: string | null;
    riskLevel: ProjectPriority;
  };
  cabinReviewApproved: boolean;
  activeTask: WorkflowTaskSummary | null;
  canCompleteTask: boolean;
  completionIssue: string | null;
  statistics: {
    totalCount: number;
    pendingCount: number;
    recordedCount: number;
    paidCount: number;
    cancelledCount: number;
  };
  items: FeeRecord[];
};

export type FeeFormInput = {
  feeType: DevelopmentFeeType;
  amount: string;
  currency: string;
  payer: string;
  payStatus: DevelopmentFeeStatus;
  recordedAt: string;
  note: string;
};

export const FIXED_DEVELOPMENT_FEE_TYPE: DevelopmentFeeType = 'PAINT_DEVELOPMENT';
export const FIXED_DEVELOPMENT_FEE_AMOUNT = '10000';

export const DEVELOPMENT_FEE_TYPE_OPTIONS: Array<{
  value: DevelopmentFeeType;
  label: string;
}> = [
  { value: 'PAINT_DEVELOPMENT', label: '涂料开发' },
  { value: 'SAMPLE_MAKING', label: '样板制作' },
  { value: 'TESTING', label: '测试验证' },
  { value: 'STANDARD_BOARD', label: '标准板' },
  { value: 'PROCUREMENT', label: '采购相关' },
  { value: 'OTHER', label: '其他' },
];

export const DEVELOPMENT_FEE_STATUS_OPTIONS: Array<{
  value: DevelopmentFeeStatus;
  label: string;
}> = [
  { value: 'PENDING', label: '待处理' },
  { value: 'RECORDED', label: '已记账' },
  { value: 'PAID', label: '已支付' },
  { value: 'CANCELLED', label: '已取消' },
];

const FEE_ROLE_CODES: FrontendRoleCode[] = ['admin', 'project_manager', 'finance'];

const DEVELOPMENT_FEE_TYPE_LABELS = Object.fromEntries(
  DEVELOPMENT_FEE_TYPE_OPTIONS.map((item) => [item.value, item.label]),
) as Record<DevelopmentFeeType, string>;

const DEVELOPMENT_FEE_STATUS_LABELS = Object.fromEntries(
  DEVELOPMENT_FEE_STATUS_OPTIONS.map((item) => [item.value, item.label]),
) as Record<DevelopmentFeeStatus, string>;

export function fetchFeesWorkspace(projectId: string) {
  return apiRequest<FeesWorkspaceResponse>(`/projects/${projectId}/fees`);
}

export function createFee(projectId: string, input: FeeFormInput) {
  return apiRequest<FeesWorkspaceResponse>(`/projects/${projectId}/fees`, {
    method: 'POST',
    body: toFeePayload(input),
  });
}

export function updateFee(projectId: string, feeId: string, input: FeeFormInput) {
  return apiRequest<FeesWorkspaceResponse>(`/projects/${projectId}/fees/${feeId}`, {
    method: 'PATCH',
    body: toFeePayload(input),
  });
}

export function markRecordedFee(projectId: string, feeId: string) {
  return apiRequest<FeesWorkspaceResponse>(`/projects/${projectId}/fees/${feeId}/mark-recorded`, {
    method: 'POST',
  });
}

export function markPaidFee(projectId: string, feeId: string) {
  return apiRequest<FeesWorkspaceResponse>(`/projects/${projectId}/fees/${feeId}/mark-paid`, {
    method: 'POST',
  });
}

export function cancelFee(projectId: string, feeId: string) {
  return apiRequest<FeesWorkspaceResponse>(`/projects/${projectId}/fees/${feeId}/cancel`, {
    method: 'POST',
  });
}

export function completeFeeTask(projectId: string) {
  return apiRequest<FeesWorkspaceResponse>(`/projects/${projectId}/fees/complete-task`, {
    method: 'POST',
  });
}

export function validateFeeForm(input: FeeFormInput) {
  if (!input.feeType) {
    return '费用类型不能为空。';
  }

  if (!input.amount.trim()) {
    return '金额不能为空。';
  }

  if (!Number.isFinite(Number(input.amount)) || Number(input.amount) <= 0) {
    return '金额必须大于 0。';
  }

  if (Number(input.amount) !== Number(FIXED_DEVELOPMENT_FEE_AMOUNT)) {
    return '颜色开发收费固定金额为 10000。';
  }

  if (!input.currency.trim()) {
    return '币种不能为空。';
  }

  if (!input.payer.trim()) {
    return '付款方不能为空。';
  }

  if (!input.recordedAt.trim()) {
    return '记录时间不能为空。';
  }

  return null;
}

export function canManageFees(user: SessionUser | null) {
  if (!user) {
    return false;
  }

  if (user.isSystemAdmin || user.roleCodes.includes('admin')) {
    return true;
  }

  return FEE_ROLE_CODES.some((roleCode) => user.roleCodes.includes(roleCode));
}

export function canShowCompleteFeeTaskButton(
  user: SessionUser | null,
  workspace: FeesWorkspaceResponse,
) {
  if (!workspace.activeTask || !workspace.canCompleteTask) {
    return false;
  }

  return canUserOperateWorkflowTask(user, workspace.activeTask);
}

export function getFeeTypeLabel(value: DevelopmentFeeType) {
  return DEVELOPMENT_FEE_TYPE_LABELS[value];
}

export function getFeeStatusLabel(value: DevelopmentFeeStatus) {
  return DEVELOPMENT_FEE_STATUS_LABELS[value];
}

export function getFeesWorkspaceHighlights(workspace: FeesWorkspaceResponse) {
  return {
    currentNodeLabel: getWorkflowNodeLabel(workspace.project.currentNodeCode),
    targetDateLabel: formatDate(workspace.project.targetDate),
    riskLevelLabel: getProjectPriorityLabel(workspace.project.riskLevel),
    activeTaskStatusLabel: workspace.activeTask
      ? getWorkflowTaskStatusLabel(workspace.activeTask.status)
      : '当前无收费任务',
  };
}

export function toFeeFormInput(record: FeeRecord): FeeFormInput {
  return {
    feeType: FIXED_DEVELOPMENT_FEE_TYPE,
    amount: FIXED_DEVELOPMENT_FEE_AMOUNT,
    currency: record.currency,
    payer: record.payer ?? '',
    payStatus: record.payStatus,
    recordedAt: toDateTimeLocalValue(record.recordedAt ?? record.createdAt),
    note: record.note ?? '',
  };
}

function toFeePayload(input: FeeFormInput) {
  return {
    feeType: FIXED_DEVELOPMENT_FEE_TYPE,
    amount: Number(FIXED_DEVELOPMENT_FEE_AMOUNT),
    currency: input.currency,
    payer: input.payer,
    recordedAt: input.recordedAt,
    note: input.note || null,
  };
}

function toDateTimeLocalValue(value: string | null | undefined) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}
