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

export type StandardBoardStatus = 'DRAFT' | 'CREATED' | 'ISSUED' | 'ARCHIVED';
export type ColorBoardDetailUpdateStatus = 'PENDING' | 'UPDATED';

export type StandardBoardSampleOption = {
  id: string;
  sampleNo: string;
  sampleName: string;
  versionNo: number;
};

export type BoardDistributionRecord = {
  id: string;
  receiverName: string | null;
  receiverDept: string | null;
  sentAt: string | null;
  signedAt: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StandardBoardSummary = {
  id: string;
  boardCode: string;
  versionNo: number;
  basedOnSampleId: string | null;
  status: StandardBoardStatus;
  isCurrent: boolean;
  producedAt: string | null;
  issuedAt: string | null;
  issuedById: string | null;
  issuedByName: string | null;
  recipientName: string | null;
  recipientDept: string | null;
  remark: string | null;
  createdAt: string;
  updatedAt: string;
  basedOnSample: StandardBoardSampleOption | null;
  distributions: BoardDistributionRecord[];
};

export type ColorBoardDetailUpdateRecord = {
  id: string;
  standardBoardId: string;
  updateStatus: ColorBoardDetailUpdateStatus;
  detailUpdatedAt: string;
  note: string | null;
  updatedById: string | null;
  updatedByName: string | null;
  createdAt: string;
  updatedAt: string;
  standardBoard: {
    id: string;
    boardCode: string;
    versionNo: number;
  };
};

export type StandardBoardWorkspaceResponse = {
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
  activeStandardBoardTask: WorkflowTaskSummary | null;
  activeColorBoardDetailUpdateTask: WorkflowTaskSummary | null;
  canCompleteStandardBoardTask: boolean;
  standardBoardCompletionIssue: string | null;
  canCompleteColorBoardDetailUpdateTask: boolean;
  colorBoardDetailUpdateCompletionIssue: string | null;
  sampleOptions: StandardBoardSampleOption[];
  currentBoard: StandardBoardSummary | null;
  items: StandardBoardSummary[];
  detailUpdates: ColorBoardDetailUpdateRecord[];
};

export type ColorBoardDetailUpdateWorkspaceResponse = {
  project: StandardBoardWorkspaceResponse['project'];
  activeTask: WorkflowTaskSummary | null;
  canCompleteTask: boolean;
  completionIssue: string | null;
  currentBoard: StandardBoardSummary | null;
  items: ColorBoardDetailUpdateRecord[];
};

export type StandardBoardFormInput = {
  boardCode: string;
  versionNo: string;
  basedOnSampleId: string;
  remark: string;
};

export type IssueBoardFormInput = {
  recipientName: string;
  recipientDept: string;
  issuedAt: string;
  remark: string;
};

export type DistributionRecordFormInput = {
  receiverName: string;
  receiverDept: string;
  sentAt: string;
  signedAt: string;
  note: string;
};

export type ColorBoardDetailUpdateFormInput = {
  standardBoardId: string;
  updateStatus: ColorBoardDetailUpdateStatus;
  detailUpdatedAt: string;
  note: string;
};

const STANDARD_BOARD_ALLOWED_ROLE_CODES: FrontendRoleCode[] = [
  'admin',
  'project_manager',
  'process_engineer',
  'quality_engineer',
];

const STANDARD_BOARD_STATUS_LABELS: Record<StandardBoardStatus, string> = {
  DRAFT: '草稿',
  CREATED: '已制作',
  ISSUED: '已下发',
  ARCHIVED: '已归档',
};

const COLOR_BOARD_DETAIL_UPDATE_STATUS_LABELS: Record<
  ColorBoardDetailUpdateStatus,
  string
> = {
  PENDING: '待更新',
  UPDATED: '已更新',
};

export const COLOR_BOARD_DETAIL_UPDATE_STATUS_OPTIONS: Array<{
  value: ColorBoardDetailUpdateStatus;
  label: string;
}> = [
  { value: 'PENDING', label: '待更新' },
  { value: 'UPDATED', label: '已更新' },
];

export async function fetchStandardBoardWorkspace(projectId: string) {
  return apiRequest<StandardBoardWorkspaceResponse>(
    `/projects/${projectId}/standard-boards`,
  );
}

export async function fetchCurrentStandardBoard(projectId: string) {
  return apiRequest<StandardBoardSummary | null>(
    `/projects/${projectId}/standard-boards/current`,
  );
}

export async function fetchColorBoardDetailUpdateWorkspace(projectId: string) {
  return apiRequest<ColorBoardDetailUpdateWorkspaceResponse>(
    `/projects/${projectId}/color-board-detail-update`,
  );
}

export async function createStandardBoard(
  projectId: string,
  input: StandardBoardFormInput,
) {
  return apiRequest<StandardBoardWorkspaceResponse>(
    `/projects/${projectId}/standard-boards`,
    {
      method: 'POST',
      body: {
        boardCode: input.boardCode,
        versionNo: Number(input.versionNo),
        basedOnSampleId: input.basedOnSampleId || null,
        remark: input.remark || null,
      },
    },
  );
}

export async function updateStandardBoard(
  projectId: string,
  boardId: string,
  input: StandardBoardFormInput,
) {
  return apiRequest<StandardBoardWorkspaceResponse>(
    `/projects/${projectId}/standard-boards/${boardId}`,
    {
      method: 'PATCH',
      body: {
        boardCode: input.boardCode,
        versionNo: Number(input.versionNo),
        basedOnSampleId: input.basedOnSampleId || null,
        remark: input.remark || null,
      },
    },
  );
}

export async function setCurrentStandardBoard(projectId: string, boardId: string) {
  return apiRequest<StandardBoardWorkspaceResponse>(
    `/projects/${projectId}/standard-boards/${boardId}/set-current`,
    {
      method: 'POST',
    },
  );
}

export async function markStandardBoardCreated(projectId: string, boardId: string) {
  return apiRequest<StandardBoardWorkspaceResponse>(
    `/projects/${projectId}/standard-boards/${boardId}/mark-created`,
    {
      method: 'POST',
    },
  );
}

export async function issueStandardBoard(
  projectId: string,
  boardId: string,
  input: IssueBoardFormInput,
) {
  return apiRequest<StandardBoardWorkspaceResponse>(
    `/projects/${projectId}/standard-boards/${boardId}/issue`,
    {
      method: 'POST',
      body: {
        recipientName: input.recipientName || null,
        recipientDept: input.recipientDept || null,
        issuedAt: input.issuedAt,
        remark: input.remark || null,
      },
    },
  );
}

export async function addBoardDistributionRecord(
  projectId: string,
  boardId: string,
  input: DistributionRecordFormInput,
) {
  return apiRequest<StandardBoardWorkspaceResponse>(
    `/projects/${projectId}/standard-boards/${boardId}/distributions`,
    {
      method: 'POST',
      body: {
        receiverName: input.receiverName,
        receiverDept: input.receiverDept,
        sentAt: input.sentAt,
        signedAt: input.signedAt || null,
        note: input.note || null,
      },
    },
  );
}

export async function createColorBoardDetailUpdate(
  projectId: string,
  input: ColorBoardDetailUpdateFormInput,
) {
  return apiRequest<StandardBoardWorkspaceResponse>(
    `/projects/${projectId}/color-board-detail-update`,
    {
      method: 'POST',
      body: {
        standardBoardId: input.standardBoardId,
        updateStatus: input.updateStatus,
        detailUpdatedAt: input.detailUpdatedAt,
        note: input.note || null,
      },
    },
  );
}

export async function completeStandardBoardTask(projectId: string) {
  return apiRequest<StandardBoardWorkspaceResponse>(
    `/projects/${projectId}/standard-boards/complete-task`,
    {
      method: 'POST',
    },
  );
}

export async function completeColorBoardDetailUpdateTask(projectId: string) {
  return apiRequest<StandardBoardWorkspaceResponse>(
    `/projects/${projectId}/color-board-detail-update/complete-task`,
    {
      method: 'POST',
    },
  );
}

export function validateStandardBoardForm(input: StandardBoardFormInput) {
  if (!input.boardCode.trim()) {
    return '标准板编号不能为空。';
  }

  if (!input.versionNo.trim()) {
    return '版本号不能为空。';
  }

  const versionNo = Number(input.versionNo);

  if (!Number.isInteger(versionNo) || versionNo <= 0) {
    return '版本号必须是大于 0 的整数。';
  }

  return null;
}

export function validateIssueBoardForm(input: IssueBoardFormInput) {
  if (!input.recipientName.trim() && !input.recipientDept.trim()) {
    return '接收人或接收部门至少填写一项。';
  }

  if (!input.issuedAt.trim()) {
    return '下发时间不能为空。';
  }

  return null;
}

export function validateDistributionRecordForm(input: DistributionRecordFormInput) {
  if (!input.receiverName.trim()) {
    return '接收人不能为空。';
  }

  if (!input.receiverDept.trim()) {
    return '接收部门不能为空。';
  }

  if (!input.sentAt.trim()) {
    return '发送时间不能为空。';
  }

  return null;
}

export function validateColorBoardDetailUpdateForm(
  input: ColorBoardDetailUpdateFormInput,
) {
  if (!input.standardBoardId.trim()) {
    return '必须选择关联标准板。';
  }

  if (!input.detailUpdatedAt.trim()) {
    return '更新时间不能为空。';
  }

  return null;
}

export function canManageStandardBoards(user: SessionUser | null) {
  if (!user) {
    return false;
  }

  if (user.isSystemAdmin) {
    return true;
  }

  return user.roleCodes.some((roleCode) =>
    STANDARD_BOARD_ALLOWED_ROLE_CODES.includes(roleCode),
  );
}

export function canShowCompleteStandardBoardTaskButton(
  user: SessionUser | null,
  workspace: StandardBoardWorkspaceResponse,
) {
  if (!workspace.activeStandardBoardTask || !workspace.canCompleteStandardBoardTask) {
    return false;
  }

  return (
    canManageStandardBoards(user) &&
    canUserOperateWorkflowTask(user, workspace.activeStandardBoardTask)
  );
}

export function canShowCompleteBoardDetailUpdateTaskButton(
  user: SessionUser | null,
  workspace: StandardBoardWorkspaceResponse,
) {
  if (
    !workspace.activeColorBoardDetailUpdateTask ||
    !workspace.canCompleteColorBoardDetailUpdateTask
  ) {
    return false;
  }

  return (
    canManageStandardBoards(user) &&
    canUserOperateWorkflowTask(user, workspace.activeColorBoardDetailUpdateTask)
  );
}

export function getStandardBoardStatusLabel(status: StandardBoardStatus) {
  return STANDARD_BOARD_STATUS_LABELS[status];
}

export function getColorBoardDetailUpdateStatusLabel(
  status: ColorBoardDetailUpdateStatus,
) {
  return COLOR_BOARD_DETAIL_UPDATE_STATUS_LABELS[status];
}

export function getStandardBoardWorkspaceHighlights(
  workspace: StandardBoardWorkspaceResponse,
) {
  return {
    currentNodeLabel: getWorkflowNodeLabel(workspace.project.currentNodeCode),
    targetDateLabel: formatDate(workspace.project.targetDate),
    riskLevelLabel: getProjectPriorityLabel(workspace.project.riskLevel),
    standardBoardTaskStatusLabel: workspace.activeStandardBoardTask
      ? getWorkflowTaskStatusLabel(workspace.activeStandardBoardTask.status)
      : '当前无标准板任务',
    detailUpdateTaskStatusLabel: workspace.activeColorBoardDetailUpdateTask
      ? getWorkflowTaskStatusLabel(workspace.activeColorBoardDetailUpdateTask.status)
      : '当前无明细更新任务',
  };
}
