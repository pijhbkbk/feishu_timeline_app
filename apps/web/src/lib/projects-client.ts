'use client';

import { apiRequest, type FrontendRoleCode } from './auth-client';
import {
  COLOR_EXIT_SUGGESTION_LABELS,
  PROJECT_MEMBER_TYPE_LABELS,
  PROJECT_PRIORITY_LABELS,
  PROJECT_STATUS_LABELS,
  type TimelineNodeStatus,
} from './status-labels';
import type { RecurringTaskStatus, ReviewResult } from './workflows-client';

export type ProjectStatus =
  | 'DRAFT'
  | 'IN_PROGRESS'
  | 'ON_HOLD'
  | 'COMPLETED'
  | 'CANCELLED';

export type ProjectPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type ProjectMemberType =
  | 'OWNER'
  | 'MANAGER'
  | 'MEMBER'
  | 'REVIEWER'
  | 'OBSERVER';

export type WorkflowNodeCode =
  | 'PROJECT_INITIATION'
  | 'DEVELOPMENT_REPORT'
  | 'PAINT_DEVELOPMENT'
  | 'SAMPLE_COLOR_CONFIRMATION'
  | 'COLOR_NUMBERING'
  | 'PAINT_PROCUREMENT'
  | 'PERFORMANCE_TEST'
  | 'STANDARD_BOARD_PRODUCTION'
  | 'BOARD_DETAIL_UPDATE'
  | 'FIRST_UNIT_PRODUCTION_PLAN'
  | 'TRIAL_PRODUCTION'
  | 'CAB_REVIEW'
  | 'DEVELOPMENT_ACCEPTANCE'
  | 'COLOR_CONSISTENCY_REVIEW'
  | 'MASS_PRODUCTION_PLAN'
  | 'MASS_PRODUCTION'
  | 'VISUAL_COLOR_DIFFERENCE_REVIEW'
  | 'PROJECT_CLOSED';

export type DirectoryUser = {
  id: string;
  username: string;
  name: string;
  email: string | null;
  departmentId: string | null;
  departmentName: string | null;
  roleCodes: FrontendRoleCode[];
};

export type ProjectListItem = {
  id: string;
  code: string;
  name: string;
  status: ProjectStatus;
  priority: ProjectPriority;
  currentNodeCode: WorkflowNodeCode | null;
  currentNodeName: string | null;
  ownerUserId: string | null;
  ownerName: string | null;
  ownerDepartmentName: string | null;
  colorName: string | null;
  colorCode: string | null;
  marketRegion: string | null;
  vehicleModel: string | null;
  targetDate: string | null;
  riskLevel: ProjectPriority;
  isOverdue: boolean;
  progressPercent: number;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  memberCount: number;
  updatedAt: string;
  createdAt: string;
};

export type ProjectListResponse = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  filters: {
    keyword: string | null;
    status: ProjectStatus | null;
    currentNodeCode: WorkflowNodeCode | null;
    ownerUserId: string | null;
    ownerDepartmentId: string | null;
    priority: ProjectPriority | null;
    isOverdue: boolean | null;
    dateFrom: string | null;
    dateTo: string | null;
  };
  nodeOptions: Array<{
    code: WorkflowNodeCode;
    name: string;
    sequence: number;
  }>;
  items: ProjectListItem[];
};

export type ProjectMember = {
  id: string;
  userId: string;
  name: string;
  email: string | null;
  departmentName: string | null;
  memberType: ProjectMemberType;
  title: string | null;
  isPrimary: boolean;
  roleCodes: string[];
  createdAt: string;
};

export type ProjectDetail = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  priority: ProjectPriority;
  riskLevel: ProjectPriority;
  currentNodeCode: WorkflowNodeCode | null;
  currentNodeName: string | null;
  targetDate: string | null;
  marketRegion: string | null;
  vehicleModel: string | null;
  ownerUserId: string | null;
  ownerName: string | null;
  owningDepartmentId: string | null;
  owningDepartmentName: string | null;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  actualStartDate: string | null;
  actualEndDate: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  memberCount: number;
  currentWorkflowInstance: {
    id: string;
    instanceNo: string;
    status: string;
    versionNo: number;
    currentNodeCode: WorkflowNodeCode | null;
    currentNodeName: string | null;
    startedAt: string | null;
  } | null;
  members: ProjectMember[];
};

export type ProjectTimelineNode = {
  stepNumber: number;
  nodeCode: WorkflowNodeCode;
  nodeName: string;
  status: TimelineNodeStatus;
  taskId: string | null;
  taskRound: number | null;
  startTime: string | null;
  triggerTime: string | null;
  dueAt: string | null;
  completedAt: string | null;
  responsibleDepartment: string | null;
  ownerName: string | null;
  output: string;
  attachmentCount: number;
  isOverdue: boolean;
  overdueDays: number;
  reviewGate: {
    reviewConclusion: ReviewResult | null;
    reviewPassAt: string | null;
    returnRounds: number;
  } | null;
  monthlyReview: {
    totalPeriods: number;
    completedPeriods: number;
    overduePeriods: number;
    progressText: string;
    currentMonthTask: {
      id: string;
      periodLabel: string;
      status: RecurringTaskStatus;
      plannedDate: string;
    } | null;
  } | null;
  colorExit: {
    annualOutput: number | null;
    exitThreshold: number | null;
    systemSuggestion: keyof typeof COLOR_EXIT_SUGGESTION_LABELS | null;
    finalDecision: keyof typeof COLOR_EXIT_SUGGESTION_LABELS | null;
    completedAt: string | null;
  } | null;
};

export type ProjectTimelineResponse = {
  lastUpdatedAt: string;
  project: {
    id: string;
    code: string;
    name: string;
    status: ProjectStatus;
    priority: ProjectPriority;
    currentNodeCode: WorkflowNodeCode | null;
    currentNodeName: string | null;
    colorName: string;
    ownerName: string;
    ownerDepartmentName: string | null;
    plannedEndDate: string | null;
    progressPercent: number;
  };
  nodes: ProjectTimelineNode[];
};

export type FlowMapNodeStatus =
  | 'NOT_STARTED'
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'PENDING_REVIEW'
  | 'COMPLETED'
  | 'COMPLETED_LATE'
  | 'OVERDUE'
  | 'RETURNED'
  | 'MONTHLY_TRACKING'
  | 'EXIT_PENDING';

export type FlowMapEdgeType = 'mainline' | 'parallel' | 'nonBlocking' | 'return';

export type FlowMapEdgeStatus = 'completed' | 'active' | 'pending' | 'rejected';

export type ProjectFlowMapNode = {
  taskId: string | null;
  stepCode: string;
  stepNumber: number;
  stepName: string;
  nodeCode: WorkflowNodeCode;
  status: FlowMapNodeStatus | string;
  statusLabel: string;
  ownerName: string | null;
  departmentName: string | null;
  dueAt: string | null;
  overdueDays: number;
  isOverdue: boolean;
  isBlocking: boolean;
  isMainline: boolean;
  nodeType: 'MAINLINE' | 'PARALLEL' | 'DECISION' | 'TERMINAL';
  materialProgress: {
    submitted: number;
    required: number;
    total: number;
    missing: number;
    text: string;
  };
  roundNo: number;
  reviewGate: ProjectTimelineNode['reviewGate'];
  monthlyReview: ProjectTimelineNode['monthlyReview'];
  colorExit: ProjectTimelineNode['colorExit'];
};

export type ProjectFlowMapEdge = {
  fromStepCode: WorkflowNodeCode;
  toStepCode: WorkflowNodeCode;
  fromNodeCode: WorkflowNodeCode;
  toNodeCode: WorkflowNodeCode;
  edgeType: FlowMapEdgeType;
  status: FlowMapEdgeStatus;
  label: string | null;
};

export type ProjectFlowMapActivity = {
  id: string;
  action: string;
  actionLabel: string;
  summary: string;
  operatorName: string;
  fromNodeCode: WorkflowNodeCode | null;
  fromNodeName: string | null;
  toNodeCode: WorkflowNodeCode | null;
  toNodeName: string | null;
  createdAt: string;
};

export type ProjectFlowMapResponse = {
  projectId: string;
  projectName: string;
  projectCode: string;
  colorName: string;
  currentStepCode: WorkflowNodeCode | null;
  currentStepName: string;
  currentOwner: string | null;
  currentDepartment: string | null;
  progressPercent: number;
  overdueCount: number;
  monthlyReviewProgress: {
    completed: number;
    total: number;
    overdue: number;
    text: string;
  };
  lastUpdatedAt: string;
  nodes: ProjectFlowMapNode[];
  edges: ProjectFlowMapEdge[];
  recentActivities: ProjectFlowMapActivity[];
};

export type ProjectMemberInput = {
  userId: string;
  memberType: ProjectMemberType;
  title?: string | null;
  isPrimary?: boolean;
};

export type ProjectWritePayload = {
  code?: string;
  name: string;
  description?: string | null;
  priority: ProjectPriority;
  marketRegion?: string | null;
  vehicleModel?: string | null;
  ownerUserId?: string | null;
  plannedStartDate?: string | null;
  plannedEndDate?: string | null;
  members?: ProjectMemberInput[];
};

export const PROJECT_STATUS_OPTIONS: Array<{ value: ProjectStatus; label: string }> = [
  { value: 'DRAFT', label: PROJECT_STATUS_LABELS.DRAFT },
  { value: 'IN_PROGRESS', label: PROJECT_STATUS_LABELS.IN_PROGRESS },
  { value: 'ON_HOLD', label: PROJECT_STATUS_LABELS.ON_HOLD },
  { value: 'COMPLETED', label: PROJECT_STATUS_LABELS.COMPLETED },
  { value: 'CANCELLED', label: PROJECT_STATUS_LABELS.CANCELLED },
];

export const PROJECT_PRIORITY_OPTIONS: Array<{ value: ProjectPriority; label: string }> = [
  { value: 'LOW', label: PROJECT_PRIORITY_LABELS.LOW },
  { value: 'MEDIUM', label: PROJECT_PRIORITY_LABELS.MEDIUM },
  { value: 'HIGH', label: PROJECT_PRIORITY_LABELS.HIGH },
  { value: 'CRITICAL', label: PROJECT_PRIORITY_LABELS.CRITICAL },
];

export const PROJECT_MEMBER_TYPE_OPTIONS: Array<{ value: ProjectMemberType; label: string }> = [
  { value: 'OWNER', label: PROJECT_MEMBER_TYPE_LABELS.OWNER },
  { value: 'MANAGER', label: PROJECT_MEMBER_TYPE_LABELS.MANAGER },
  { value: 'MEMBER', label: PROJECT_MEMBER_TYPE_LABELS.MEMBER },
  { value: 'REVIEWER', label: PROJECT_MEMBER_TYPE_LABELS.REVIEWER },
  { value: 'OBSERVER', label: PROJECT_MEMBER_TYPE_LABELS.OBSERVER },
];

export const WORKFLOW_NODE_OPTIONS: Array<{ value: WorkflowNodeCode; label: string }> = [
  { value: 'PROJECT_INITIATION', label: '反映市场需求' },
  { value: 'DEVELOPMENT_REPORT', label: '新颜色开发报告' },
  { value: 'PAINT_DEVELOPMENT', label: '涂料开发' },
  { value: 'SAMPLE_COLOR_CONFIRMATION', label: '样板颜色确认' },
  { value: 'COLOR_NUMBERING', label: '新颜色取号' },
  { value: 'PAINT_PROCUREMENT', label: '涂料采购' },
  { value: 'STANDARD_BOARD_PRODUCTION', label: '标准板制作、下发' },
  { value: 'BOARD_DETAIL_UPDATE', label: '色板明细更新' },
  { value: 'PERFORMANCE_TEST', label: '涂料性能试验' },
  { value: 'FIRST_UNIT_PRODUCTION_PLAN', label: '首台生产计划' },
  { value: 'TRIAL_PRODUCTION', label: '样车试制' },
  { value: 'CAB_REVIEW', label: '样车驾驶室评审' },
  { value: 'DEVELOPMENT_ACCEPTANCE', label: '颜色开发收费' },
  { value: 'COLOR_CONSISTENCY_REVIEW', label: '颜色一致性评审' },
  { value: 'MASS_PRODUCTION_PLAN', label: '排产计划' },
  { value: 'MASS_PRODUCTION', label: '批量生产' },
  { value: 'VISUAL_COLOR_DIFFERENCE_REVIEW', label: '整车色差一致性评审' },
  { value: 'PROJECT_CLOSED', label: '颜色退出' },
];

const PRIORITY_LABEL_MAP = Object.fromEntries(
  PROJECT_PRIORITY_OPTIONS.map((item) => [item.value, item.label]),
) as Record<ProjectPriority, string>;

const STATUS_LABEL_MAP = Object.fromEntries(
  PROJECT_STATUS_OPTIONS.map((item) => [item.value, item.label]),
) as Record<ProjectStatus, string>;

const MEMBER_TYPE_LABEL_MAP = Object.fromEntries(
  PROJECT_MEMBER_TYPE_OPTIONS.map((item) => [item.value, item.label]),
) as Record<ProjectMemberType, string>;

const NODE_LABEL_MAP = Object.fromEntries(
  WORKFLOW_NODE_OPTIONS.map((item) => [item.value, item.label]),
) as Record<WorkflowNodeCode, string>;

type ListProjectFilters = {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: ProjectStatus | '';
  currentNodeCode?: WorkflowNodeCode | '';
  ownerUserId?: string;
  ownerDepartmentId?: string;
  priority?: ProjectPriority | '';
  isOverdue?: boolean | '';
  dateFrom?: string;
  dateTo?: string;
};

export async function fetchProjects(filters: ListProjectFilters = {}) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  }

  const suffix = params.toString() ? `?${params.toString()}` : '';
  return apiRequest<ProjectListResponse>(`/projects${suffix}`);
}

export function fetchProject(projectId: string) {
  return apiRequest<ProjectDetail>(`/projects/${projectId}`);
}

export function fetchProjectTimeline(projectId: string) {
  return apiRequest<ProjectTimelineResponse>(`/projects/${projectId}/timeline`);
}

export function fetchProjectFlowMap(projectId: string) {
  return apiRequest<ProjectFlowMapResponse>(`/projects/${projectId}/flow-map`);
}

export function createProject(payload: ProjectWritePayload) {
  return apiRequest<ProjectDetail>('/projects', {
    method: 'POST',
    body: payload,
  });
}

export function updateProject(projectId: string, payload: ProjectWritePayload) {
  return apiRequest<ProjectDetail>(`/projects/${projectId}`, {
    method: 'PATCH',
    body: payload,
  });
}

export function replaceProjectMembers(projectId: string, members: ProjectMemberInput[]) {
  return apiRequest<ProjectDetail>(`/projects/${projectId}/members`, {
    method: 'PUT',
    body: {
      members,
    },
  });
}

export function fetchUserDirectory() {
  return apiRequest<DirectoryUser[]>('/users/directory');
}

export function getProjectStatusLabel(status: ProjectStatus) {
  return STATUS_LABEL_MAP[status];
}

export function getProjectPriorityLabel(priority: ProjectPriority) {
  return PRIORITY_LABEL_MAP[priority];
}

export function getProjectMemberTypeLabel(memberType: ProjectMemberType) {
  return MEMBER_TYPE_LABEL_MAP[memberType];
}

export function getWorkflowNodeLabel(nodeCode: WorkflowNodeCode | null | undefined) {
  if (!nodeCode) {
    return '未开始';
  }

  return NODE_LABEL_MAP[nodeCode] ?? nodeCode;
}

export function formatDate(value: string | null | undefined) {
  if (!value) {
    return '未设置';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return '未设置';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

export function toDateInputValue(value: string | null | undefined) {
  if (!value) {
    return '';
  }

  return value.slice(0, 10);
}
