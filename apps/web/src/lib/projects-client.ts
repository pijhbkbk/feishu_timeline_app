'use client';

import { apiRequest, type FrontendRoleCode } from './auth-client';

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
  marketRegion: string | null;
  vehicleModel: string | null;
  targetDate: string | null;
  riskLevel: ProjectPriority;
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
    status: ProjectStatus | null;
    currentNodeCode: WorkflowNodeCode | null;
    ownerUserId: string | null;
    priority: ProjectPriority | null;
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
  { value: 'DRAFT', label: '草稿' },
  { value: 'IN_PROGRESS', label: '进行中' },
  { value: 'ON_HOLD', label: '挂起' },
  { value: 'COMPLETED', label: '已完成' },
  { value: 'CANCELLED', label: '已取消' },
];

export const PROJECT_PRIORITY_OPTIONS: Array<{ value: ProjectPriority; label: string }> = [
  { value: 'LOW', label: '低' },
  { value: 'MEDIUM', label: '中' },
  { value: 'HIGH', label: '高' },
  { value: 'CRITICAL', label: '紧急' },
];

export const PROJECT_MEMBER_TYPE_OPTIONS: Array<{ value: ProjectMemberType; label: string }> = [
  { value: 'OWNER', label: '负责人' },
  { value: 'MANAGER', label: '项目经理' },
  { value: 'MEMBER', label: '成员' },
  { value: 'REVIEWER', label: '评审人' },
  { value: 'OBSERVER', label: '观察者' },
];

export const WORKFLOW_NODE_OPTIONS: Array<{ value: WorkflowNodeCode; label: string }> = [
  { value: 'PROJECT_INITIATION', label: '项目立项' },
  { value: 'DEVELOPMENT_REPORT', label: '新颜色开发报告' },
  { value: 'PAINT_DEVELOPMENT', label: '涂料开发' },
  { value: 'SAMPLE_COLOR_CONFIRMATION', label: '样板颜色确认' },
  { value: 'COLOR_NUMBERING', label: '新颜色取号' },
  { value: 'PAINT_PROCUREMENT', label: '涂料采购' },
  { value: 'PERFORMANCE_TEST', label: '涂料性能试验' },
  { value: 'STANDARD_BOARD_PRODUCTION', label: '标准板制作' },
  { value: 'BOARD_DETAIL_UPDATE', label: '色板明细更新' },
  { value: 'FIRST_UNIT_PRODUCTION_PLAN', label: '首台生产计划' },
  { value: 'TRIAL_PRODUCTION', label: '样车试制' },
  { value: 'CAB_REVIEW', label: '样车驾驶室评审' },
  { value: 'DEVELOPMENT_ACCEPTANCE', label: '颜色开发收费' },
  { value: 'COLOR_CONSISTENCY_REVIEW', label: '颜色一致性评审' },
  { value: 'MASS_PRODUCTION_PLAN', label: '排产计划' },
  { value: 'MASS_PRODUCTION', label: '批量生产' },
  { value: 'VISUAL_COLOR_DIFFERENCE_REVIEW', label: '色差目视评审' },
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
  status?: ProjectStatus | '';
  currentNodeCode?: WorkflowNodeCode | '';
  ownerUserId?: string;
  priority?: ProjectPriority | '';
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

export function toDateInputValue(value: string | null | undefined) {
  if (!value) {
    return '';
  }

  return value.slice(0, 10);
}
