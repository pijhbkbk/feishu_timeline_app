'use client';

import { apiRequest, type SessionUser } from './auth-client';
import { fetchUserDirectory, formatDate, getProjectPriorityLabel, getWorkflowNodeLabel, type DirectoryUser, type ProjectPriority, type WorkflowNodeCode } from './projects-client';
import { canUserOperateWorkflowTask, getWorkflowTaskStatusLabel, type WorkflowTaskSummary } from './workflows-client';

export type PerformanceTestItem =
  | 'ADHESION'
  | 'IMPACT'
  | 'SALT_SPRAY'
  | 'HUMIDITY'
  | 'GLOSS'
  | 'HARDNESS'
  | 'DELTA_E'
  | 'THICKNESS';

export type PerformanceTestStatus = 'DRAFT' | 'SUBMITTED' | 'CANCELLED';
export type PerformanceTestResult = 'PASS' | 'FAIL' | 'OBSERVE';

export type AttachmentSummary = {
  id: string;
  targetType: string;
  targetId: string;
  fileName: string;
  fileExtension: string | null;
  contentType: string;
  fileSize: number;
  objectKey: string;
  createdAt: string;
  contentUrl: string;
};

export type PerformanceTestRecord = {
  id: string;
  testCode: string;
  sampleId: string | null;
  relatedObjectName: string | null;
  testItem: PerformanceTestItem;
  standardValue: string | null;
  actualValue: string | null;
  result: PerformanceTestResult | null;
  conclusion: string | null;
  testedById: string | null;
  testedByName: string | null;
  testedAt: string | null;
  status: PerformanceTestStatus;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  sample: {
    id: string;
    sampleNo: string;
    sampleName: string;
    versionNo: number;
  } | null;
  reportAttachment: AttachmentSummary | null;
};

export type PerformanceTestDetail = PerformanceTestRecord & {
  attachmentHistory: AttachmentSummary[];
};

export type PerformanceTestsWorkspaceResponse = {
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
  sampleOptions: Array<{
    id: string;
    sampleNo: string;
    sampleName: string;
    versionNo: number;
  }>;
  statistics: {
    totalCount: number;
    submittedCount: number;
  };
  items: PerformanceTestRecord[];
};

export type PerformanceTestFormInput = {
  testCode: string;
  sampleId: string;
  relatedObjectName: string;
  testItem: PerformanceTestItem;
  standardValue: string;
  actualValue: string;
  result: PerformanceTestResult;
  conclusion: string;
  testedById: string;
  testedAt: string;
};

export const PERFORMANCE_TEST_ITEM_OPTIONS: Array<{
  value: PerformanceTestItem;
  label: string;
}> = [
  { value: 'ADHESION', label: '附着力' },
  { value: 'IMPACT', label: '冲击' },
  { value: 'SALT_SPRAY', label: '盐雾' },
  { value: 'HUMIDITY', label: '耐湿热' },
  { value: 'GLOSS', label: '光泽' },
  { value: 'HARDNESS', label: '硬度' },
  { value: 'DELTA_E', label: '色差 Delta E' },
  { value: 'THICKNESS', label: '膜厚' },
];

export const PERFORMANCE_TEST_RESULT_OPTIONS: Array<{
  value: PerformanceTestResult;
  label: string;
}> = [
  { value: 'PASS', label: '通过' },
  { value: 'FAIL', label: '不通过' },
  { value: 'OBSERVE', label: '观察' },
];

const PERFORMANCE_TEST_STATUS_LABELS: Record<PerformanceTestStatus, string> = {
  DRAFT: '草稿',
  SUBMITTED: '已提交',
  CANCELLED: '已取消',
};

const PERFORMANCE_TEST_ITEM_LABELS = Object.fromEntries(
  PERFORMANCE_TEST_ITEM_OPTIONS.map((item) => [item.value, item.label]),
) as Record<PerformanceTestItem, string>;

const PERFORMANCE_TEST_RESULT_LABELS = Object.fromEntries(
  PERFORMANCE_TEST_RESULT_OPTIONS.map((item) => [item.value, item.label]),
) as Record<PerformanceTestResult, string>;

export async function fetchPerformanceTestsWorkspace(projectId: string) {
  return apiRequest<PerformanceTestsWorkspaceResponse>(`/projects/${projectId}/performance-tests`);
}

export async function fetchPerformanceTestDetail(projectId: string, testId: string) {
  return apiRequest<PerformanceTestDetail>(`/projects/${projectId}/performance-tests/${testId}`);
}

export async function createPerformanceTest(projectId: string, input: PerformanceTestFormInput) {
  return apiRequest<PerformanceTestsWorkspaceResponse>(`/projects/${projectId}/performance-tests`, {
    method: 'POST',
    body: {
      ...input,
      sampleId: input.sampleId || null,
      relatedObjectName: input.relatedObjectName || null,
    },
  });
}

export async function updatePerformanceTest(
  projectId: string,
  testId: string,
  input: PerformanceTestFormInput,
) {
  return apiRequest<PerformanceTestsWorkspaceResponse>(
    `/projects/${projectId}/performance-tests/${testId}`,
    {
      method: 'PATCH',
      body: {
        ...input,
        sampleId: input.sampleId || null,
        relatedObjectName: input.relatedObjectName || null,
      },
    },
  );
}

export async function submitPerformanceTest(projectId: string, testId: string) {
  return apiRequest<PerformanceTestsWorkspaceResponse>(
    `/projects/${projectId}/performance-tests/${testId}/submit`,
    {
      method: 'POST',
    },
  );
}

export async function uploadPerformanceTestReport(
  projectId: string,
  testId: string,
  file: File,
) {
  const formData = new FormData();
  formData.set('file', file);

  return apiRequest<PerformanceTestDetail>(
    `/projects/${projectId}/performance-tests/${testId}/report`,
    {
      method: 'POST',
      body: formData,
    },
  );
}

export async function completePerformanceTestTask(projectId: string) {
  return apiRequest<PerformanceTestsWorkspaceResponse>(
    `/projects/${projectId}/performance-tests/complete-task`,
    {
      method: 'POST',
    },
  );
}

export async function fetchPerformanceTestPageOptions() {
  return fetchUserDirectory();
}

export function getPerformanceTestItemLabel(item: PerformanceTestItem) {
  return PERFORMANCE_TEST_ITEM_LABELS[item];
}

export function getPerformanceTestResultLabel(result: PerformanceTestResult | null) {
  if (!result) {
    return '未填写';
  }

  return PERFORMANCE_TEST_RESULT_LABELS[result];
}

export function getPerformanceTestStatusLabel(status: PerformanceTestStatus) {
  return PERFORMANCE_TEST_STATUS_LABELS[status];
}

export function validatePerformanceTestForm(input: PerformanceTestFormInput) {
  if (!input.testCode.trim()) {
    return '试验编码不能为空。';
  }

  if (!input.sampleId.trim() && !input.relatedObjectName.trim()) {
    return '必须选择关联样板或填写关联对象。';
  }

  if (!input.standardValue.trim()) {
    return '标准值不能为空。';
  }

  if (!input.actualValue.trim()) {
    return '实测值不能为空。';
  }

  if (!input.conclusion.trim()) {
    return '试验结论不能为空。';
  }

  if (!input.testedById.trim()) {
    return '试验人不能为空。';
  }

  if (!input.testedAt.trim()) {
    return '试验时间不能为空。';
  }

  return null;
}

export function canManagePerformanceTests(user: SessionUser | null) {
  if (!user) {
    return false;
  }

  if (user.isSystemAdmin) {
    return true;
  }

  return user.roleCodes.some(
    (roleCode) =>
      roleCode === 'admin' ||
      roleCode === 'project_manager' ||
      roleCode === 'process_engineer' ||
      roleCode === 'quality_engineer',
  );
}

export function canShowCompletePerformanceTestTaskButton(
  user: SessionUser | null,
  workspace: PerformanceTestsWorkspaceResponse,
) {
  if (!workspace.activeTask || !workspace.canCompleteTask) {
    return false;
  }

  return (
    canManagePerformanceTests(user) &&
    canUserOperateWorkflowTask(user, workspace.activeTask)
  );
}

export function getPerformanceTestWorkspaceHighlights(
  workspace: PerformanceTestsWorkspaceResponse,
) {
  return {
    currentNodeLabel: getWorkflowNodeLabel(workspace.project.currentNodeCode),
    targetDateLabel: formatDate(workspace.project.targetDate),
    riskLevelLabel: getProjectPriorityLabel(workspace.project.riskLevel),
    activeTaskStatusLabel: workspace.activeTask
      ? getWorkflowTaskStatusLabel(workspace.activeTask.status)
      : '当前无性能试验任务',
  };
}

export function getDefaultTesterId(users: DirectoryUser[], currentUserId?: string | null) {
  if (currentUserId && users.some((user) => user.id === currentUserId)) {
    return currentUserId;
  }

  return users[0]?.id ?? '';
}
