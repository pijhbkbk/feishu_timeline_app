import {
  WorkflowAction,
  WorkflowNodeCode,
  WorkflowTaskStatus,
} from '@prisma/client';

export type WorkflowTaskSpawnTemplate = {
  nodeCode: WorkflowNodeCode;
  isPrimary?: boolean;
  reason: string;
};

type WorkflowNodeMeta = {
  name: string;
  sequence: number;
  isReviewNode: boolean;
  isPrimaryTask: boolean;
  allowedActions: WorkflowAction[];
  defaultReturnNodeCode?: WorkflowNodeCode;
};

export const DEFAULT_WORKFLOW_TEMPLATE = 'LIGHT_TRUCK_CUSTOM_COLOR_DEV';
export const DEFAULT_WORKFLOW_TEMPLATE_VERSION = '1.0';
export const INITIAL_WORKFLOW_NODE = WorkflowNodeCode.PROJECT_INITIATION;

export const ACTIVE_WORKFLOW_TASK_STATUSES: WorkflowTaskStatus[] = [
  WorkflowTaskStatus.PENDING,
  WorkflowTaskStatus.READY,
  WorkflowTaskStatus.IN_PROGRESS,
  WorkflowTaskStatus.RETURNED,
] ;

export const ACTIONABLE_WORKFLOW_TASK_STATUSES: WorkflowTaskStatus[] = [
  WorkflowTaskStatus.READY,
  WorkflowTaskStatus.IN_PROGRESS,
  WorkflowTaskStatus.RETURNED,
] ;

export const TERMINAL_WORKFLOW_TASK_STATUSES: WorkflowTaskStatus[] = [
  WorkflowTaskStatus.APPROVED,
  WorkflowTaskStatus.REJECTED,
  WorkflowTaskStatus.COMPLETED,
  WorkflowTaskStatus.CANCELLED,
] ;

export const STARTABLE_WORKFLOW_TASK_STATUSES: WorkflowTaskStatus[] = [
  WorkflowTaskStatus.READY,
  WorkflowTaskStatus.RETURNED,
];

export const COMPLETABLE_WORKFLOW_TASK_STATUSES: WorkflowTaskStatus[] = [
  WorkflowTaskStatus.READY,
  WorkflowTaskStatus.IN_PROGRESS,
  WorkflowTaskStatus.RETURNED,
];

export const COMPLETION_WORKFLOW_ACTIONS: WorkflowAction[] = [
  WorkflowAction.SUBMIT,
  WorkflowAction.COMPLETE,
];

export const REVIEW_WORKFLOW_ACTIONS: WorkflowAction[] = [
  WorkflowAction.APPROVE,
  WorkflowAction.REJECT,
  WorkflowAction.RETURN,
];

export const WORKFLOW_NODE_META_MAP: Record<WorkflowNodeCode, WorkflowNodeMeta> = {
  [WorkflowNodeCode.PROJECT_INITIATION]: {
    name: '反映市场需求',
    sequence: 10,
    isReviewNode: false,
    isPrimaryTask: true,
    allowedActions: [WorkflowAction.START, WorkflowAction.SUBMIT, WorkflowAction.COMPLETE],
  },
  [WorkflowNodeCode.DEVELOPMENT_REPORT]: {
    name: '新颜色开发报告',
    sequence: 20,
    isReviewNode: false,
    isPrimaryTask: true,
    allowedActions: [WorkflowAction.START, WorkflowAction.SUBMIT, WorkflowAction.COMPLETE],
    defaultReturnNodeCode: WorkflowNodeCode.PROJECT_INITIATION,
  },
  [WorkflowNodeCode.PAINT_DEVELOPMENT]: {
    name: '涂料开发',
    sequence: 30,
    isReviewNode: false,
    isPrimaryTask: true,
    allowedActions: [WorkflowAction.START, WorkflowAction.SUBMIT, WorkflowAction.COMPLETE],
    defaultReturnNodeCode: WorkflowNodeCode.DEVELOPMENT_REPORT,
  },
  [WorkflowNodeCode.SAMPLE_COLOR_CONFIRMATION]: {
    name: '样板颜色确认',
    sequence: 40,
    isReviewNode: true,
    isPrimaryTask: true,
    allowedActions: [
      WorkflowAction.START,
      WorkflowAction.APPROVE,
      WorkflowAction.REJECT,
      WorkflowAction.RETURN,
    ],
    defaultReturnNodeCode: WorkflowNodeCode.PAINT_DEVELOPMENT,
  },
  [WorkflowNodeCode.COLOR_NUMBERING]: {
    name: '新颜色取号',
    sequence: 50,
    isReviewNode: false,
    isPrimaryTask: false,
    allowedActions: [WorkflowAction.START, WorkflowAction.SUBMIT, WorkflowAction.COMPLETE],
  },
  [WorkflowNodeCode.PAINT_PROCUREMENT]: {
    name: '涂料采购',
    sequence: 60,
    isReviewNode: false,
    isPrimaryTask: true,
    allowedActions: [WorkflowAction.START, WorkflowAction.SUBMIT, WorkflowAction.COMPLETE],
    defaultReturnNodeCode: WorkflowNodeCode.SAMPLE_COLOR_CONFIRMATION,
  },
  [WorkflowNodeCode.PERFORMANCE_TEST]: {
    name: '涂料性能试验',
    sequence: 70,
    isReviewNode: false,
    isPrimaryTask: false,
    allowedActions: [WorkflowAction.START, WorkflowAction.SUBMIT, WorkflowAction.COMPLETE],
  },
  [WorkflowNodeCode.STANDARD_BOARD_PRODUCTION]: {
    name: '标准板制作、下发',
    sequence: 80,
    isReviewNode: false,
    isPrimaryTask: false,
    allowedActions: [WorkflowAction.START, WorkflowAction.SUBMIT, WorkflowAction.COMPLETE],
  },
  [WorkflowNodeCode.BOARD_DETAIL_UPDATE]: {
    name: '色板明细更新',
    sequence: 90,
    isReviewNode: false,
    isPrimaryTask: false,
    allowedActions: [WorkflowAction.START, WorkflowAction.SUBMIT, WorkflowAction.COMPLETE],
  },
  [WorkflowNodeCode.FIRST_UNIT_PRODUCTION_PLAN]: {
    name: '首台生产计划',
    sequence: 100,
    isReviewNode: false,
    isPrimaryTask: true,
    allowedActions: [WorkflowAction.START, WorkflowAction.SUBMIT, WorkflowAction.COMPLETE],
    defaultReturnNodeCode: WorkflowNodeCode.PAINT_PROCUREMENT,
  },
  [WorkflowNodeCode.TRIAL_PRODUCTION]: {
    name: '样车试制',
    sequence: 110,
    isReviewNode: false,
    isPrimaryTask: true,
    allowedActions: [WorkflowAction.START, WorkflowAction.SUBMIT, WorkflowAction.COMPLETE],
    defaultReturnNodeCode: WorkflowNodeCode.FIRST_UNIT_PRODUCTION_PLAN,
  },
  [WorkflowNodeCode.CAB_REVIEW]: {
    name: '样车驾驶室评审',
    sequence: 120,
    isReviewNode: true,
    isPrimaryTask: true,
    allowedActions: [
      WorkflowAction.START,
      WorkflowAction.APPROVE,
      WorkflowAction.REJECT,
      WorkflowAction.RETURN,
    ],
    defaultReturnNodeCode: WorkflowNodeCode.TRIAL_PRODUCTION,
  },
  [WorkflowNodeCode.DEVELOPMENT_ACCEPTANCE]: {
    name: '颜色开发收费',
    sequence: 130,
    isReviewNode: false,
    isPrimaryTask: false,
    allowedActions: [WorkflowAction.START, WorkflowAction.SUBMIT, WorkflowAction.COMPLETE],
  },
  [WorkflowNodeCode.COLOR_CONSISTENCY_REVIEW]: {
    name: '颜色一致性评审',
    sequence: 140,
    isReviewNode: true,
    isPrimaryTask: true,
    allowedActions: [
      WorkflowAction.START,
      WorkflowAction.APPROVE,
      WorkflowAction.REJECT,
      WorkflowAction.RETURN,
    ],
    defaultReturnNodeCode: WorkflowNodeCode.PAINT_DEVELOPMENT,
  },
  [WorkflowNodeCode.MASS_PRODUCTION_PLAN]: {
    name: '排产计划',
    sequence: 150,
    isReviewNode: false,
    isPrimaryTask: true,
    allowedActions: [WorkflowAction.START, WorkflowAction.SUBMIT, WorkflowAction.COMPLETE],
    defaultReturnNodeCode: WorkflowNodeCode.COLOR_CONSISTENCY_REVIEW,
  },
  [WorkflowNodeCode.MASS_PRODUCTION]: {
    name: '批量生产',
    sequence: 160,
    isReviewNode: false,
    isPrimaryTask: true,
    allowedActions: [WorkflowAction.START, WorkflowAction.SUBMIT, WorkflowAction.COMPLETE],
    defaultReturnNodeCode: WorkflowNodeCode.MASS_PRODUCTION_PLAN,
  },
  [WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW]: {
    name: '整车色差一致性评审',
    sequence: 170,
    isReviewNode: true,
    isPrimaryTask: true,
    allowedActions: [
      WorkflowAction.START,
      WorkflowAction.APPROVE,
      WorkflowAction.REJECT,
      WorkflowAction.RETURN,
      WorkflowAction.COMPLETE,
    ],
    defaultReturnNodeCode: WorkflowNodeCode.MASS_PRODUCTION,
  },
  [WorkflowNodeCode.PROJECT_CLOSED]: {
    name: '颜色退出',
    sequence: 180,
    isReviewNode: false,
    isPrimaryTask: true,
    allowedActions: [WorkflowAction.START, WorkflowAction.COMPLETE],
  },
};

export const WORKFLOW_NEXT_TASK_MAP: Partial<
  Record<WorkflowNodeCode, Partial<Record<WorkflowAction, WorkflowTaskSpawnTemplate[]>>>
> = {
  [WorkflowNodeCode.PROJECT_INITIATION]: {
    [WorkflowAction.SUBMIT]: [
      { nodeCode: WorkflowNodeCode.DEVELOPMENT_REPORT, reason: '项目立项提交后进入开发报告。' },
    ],
    [WorkflowAction.COMPLETE]: [
      { nodeCode: WorkflowNodeCode.DEVELOPMENT_REPORT, reason: '项目立项完成后进入开发报告。' },
    ],
  },
  [WorkflowNodeCode.DEVELOPMENT_REPORT]: {
    [WorkflowAction.SUBMIT]: [
      { nodeCode: WorkflowNodeCode.PAINT_DEVELOPMENT, reason: '开发报告提交后进入涂料开发。' },
    ],
    [WorkflowAction.COMPLETE]: [
      { nodeCode: WorkflowNodeCode.PAINT_DEVELOPMENT, reason: '开发报告完成后进入涂料开发。' },
    ],
  },
  [WorkflowNodeCode.PAINT_DEVELOPMENT]: {
    [WorkflowAction.SUBMIT]: [
      {
        nodeCode: WorkflowNodeCode.SAMPLE_COLOR_CONFIRMATION,
        reason: '涂料开发提交后进入样板颜色确认。',
      },
    ],
    [WorkflowAction.COMPLETE]: [
      {
        nodeCode: WorkflowNodeCode.SAMPLE_COLOR_CONFIRMATION,
        reason: '涂料开发完成后进入样板颜色确认。',
      },
    ],
  },
  [WorkflowNodeCode.SAMPLE_COLOR_CONFIRMATION]: {
    [WorkflowAction.APPROVE]: [
      {
        nodeCode: WorkflowNodeCode.PAINT_PROCUREMENT,
        isPrimary: true,
        reason: '样板颜色确认通过后进入涂料采购。',
      },
      {
        nodeCode: WorkflowNodeCode.COLOR_NUMBERING,
        isPrimary: false,
        reason: '样板颜色确认通过后并行创建新颜色取号。',
      },
    ],
  },
  [WorkflowNodeCode.PAINT_PROCUREMENT]: {
    [WorkflowAction.SUBMIT]: [
      {
        nodeCode: WorkflowNodeCode.FIRST_UNIT_PRODUCTION_PLAN,
        isPrimary: true,
        reason: '涂料采购提交后进入首台生产计划。',
      },
      {
        nodeCode: WorkflowNodeCode.PERFORMANCE_TEST,
        isPrimary: false,
        reason: '涂料采购完成后并行创建性能试验。',
      },
      {
        nodeCode: WorkflowNodeCode.STANDARD_BOARD_PRODUCTION,
        isPrimary: false,
        reason: '涂料采购完成后并行创建标准板制作、下发。',
      },
    ],
    [WorkflowAction.COMPLETE]: [
      {
        nodeCode: WorkflowNodeCode.FIRST_UNIT_PRODUCTION_PLAN,
        isPrimary: true,
        reason: '涂料采购完成后进入首台生产计划。',
      },
      {
        nodeCode: WorkflowNodeCode.PERFORMANCE_TEST,
        isPrimary: false,
        reason: '涂料采购完成后并行创建性能试验。',
      },
      {
        nodeCode: WorkflowNodeCode.STANDARD_BOARD_PRODUCTION,
        isPrimary: false,
        reason: '涂料采购完成后并行创建标准板制作、下发。',
      },
    ],
  },
  [WorkflowNodeCode.STANDARD_BOARD_PRODUCTION]: {
    [WorkflowAction.SUBMIT]: [
      {
        nodeCode: WorkflowNodeCode.BOARD_DETAIL_UPDATE,
        isPrimary: false,
        reason: '标准板制作完成后自动创建色板明细更新。',
      },
    ],
    [WorkflowAction.COMPLETE]: [
      {
        nodeCode: WorkflowNodeCode.BOARD_DETAIL_UPDATE,
        isPrimary: false,
        reason: '标准板制作完成后自动创建色板明细更新。',
      },
    ],
  },
  [WorkflowNodeCode.FIRST_UNIT_PRODUCTION_PLAN]: {
    [WorkflowAction.SUBMIT]: [
      { nodeCode: WorkflowNodeCode.TRIAL_PRODUCTION, reason: '首台生产计划提交后进入样车试制。' },
    ],
    [WorkflowAction.COMPLETE]: [
      { nodeCode: WorkflowNodeCode.TRIAL_PRODUCTION, reason: '首台生产计划完成后进入样车试制。' },
    ],
  },
  [WorkflowNodeCode.TRIAL_PRODUCTION]: {
    [WorkflowAction.SUBMIT]: [
      { nodeCode: WorkflowNodeCode.CAB_REVIEW, reason: '样车试制提交后进入驾驶室评审。' },
    ],
    [WorkflowAction.COMPLETE]: [
      { nodeCode: WorkflowNodeCode.CAB_REVIEW, reason: '样车试制完成后进入驾驶室评审。' },
    ],
  },
  [WorkflowNodeCode.CAB_REVIEW]: {
    [WorkflowAction.APPROVE]: [
      {
        nodeCode: WorkflowNodeCode.COLOR_CONSISTENCY_REVIEW,
        isPrimary: true,
        reason: '驾驶室评审通过后进入颜色一致性评审。',
      },
      {
        nodeCode: WorkflowNodeCode.DEVELOPMENT_ACCEPTANCE,
        isPrimary: false,
        reason: '驾驶室评审通过后并行触发颜色开发收费。',
      },
    ],
    [WorkflowAction.REJECT]: [
      {
        nodeCode: WorkflowNodeCode.TRIAL_PRODUCTION,
        isPrimary: true,
        reason: '驾驶室评审不通过，退回样车试制。',
      },
    ],
    [WorkflowAction.RETURN]: [
      {
        nodeCode: WorkflowNodeCode.TRIAL_PRODUCTION,
        isPrimary: true,
        reason: '驾驶室评审退回，重新进行样车试制。',
      },
    ],
  },
  [WorkflowNodeCode.COLOR_CONSISTENCY_REVIEW]: {
    [WorkflowAction.APPROVE]: [
      {
        nodeCode: WorkflowNodeCode.MASS_PRODUCTION_PLAN,
        isPrimary: true,
        reason: '一致性评审通过后进入排产计划。',
      },
    ],
    [WorkflowAction.REJECT]: [
      {
        nodeCode: WorkflowNodeCode.PAINT_DEVELOPMENT,
        isPrimary: true,
        reason: '一致性评审不通过，退回涂料开发。',
      },
    ],
    [WorkflowAction.RETURN]: [
      {
        nodeCode: WorkflowNodeCode.PAINT_DEVELOPMENT,
        isPrimary: true,
        reason: '一致性评审退回，重新进行涂料开发。',
      },
    ],
  },
  [WorkflowNodeCode.MASS_PRODUCTION_PLAN]: {
    [WorkflowAction.SUBMIT]: [
      { nodeCode: WorkflowNodeCode.MASS_PRODUCTION, reason: '排产计划提交后进入批量生产。' },
    ],
    [WorkflowAction.COMPLETE]: [
      { nodeCode: WorkflowNodeCode.MASS_PRODUCTION, reason: '排产计划完成后进入批量生产。' },
    ],
  },
  [WorkflowNodeCode.MASS_PRODUCTION]: {
    [WorkflowAction.SUBMIT]: [
      {
        nodeCode: WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW,
        reason: '批量生产提交后进入色差目视评审。',
      },
    ],
    [WorkflowAction.COMPLETE]: [
      {
        nodeCode: WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW,
        reason: '批量生产完成后进入色差目视评审。',
      },
    ],
  },
  [WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW]: {
    [WorkflowAction.APPROVE]: [
      { nodeCode: WorkflowNodeCode.PROJECT_CLOSED, reason: '色差目视评审通过后进入颜色退出。' },
    ],
    [WorkflowAction.REJECT]: [
      {
        nodeCode: WorkflowNodeCode.MASS_PRODUCTION,
        isPrimary: true,
        reason: '色差目视评审不通过，退回批量生产。',
      },
    ],
    [WorkflowAction.RETURN]: [
      {
        nodeCode: WorkflowNodeCode.MASS_PRODUCTION,
        isPrimary: true,
        reason: '色差目视评审退回，重新进入批量生产。',
      },
    ],
    [WorkflowAction.COMPLETE]: [
      { nodeCode: WorkflowNodeCode.PROJECT_CLOSED, reason: '色差目视评审完成后进入颜色退出。' },
    ],
  },
};

export function getWorkflowNodeMeta(nodeCode: WorkflowNodeCode) {
  return WORKFLOW_NODE_META_MAP[nodeCode];
}

export function getCurrentNodeName(nodeCode: WorkflowNodeCode | null | undefined) {
  if (!nodeCode) {
    return null;
  }

  return getWorkflowNodeMeta(nodeCode).name;
}

export function getAllowedWorkflowActions(nodeCode: WorkflowNodeCode) {
  return WORKFLOW_NODE_META_MAP[nodeCode].allowedActions;
}

export function getWorkflowNextTaskTemplates(
  nodeCode: WorkflowNodeCode,
  action: WorkflowAction,
) {
  return WORKFLOW_NEXT_TASK_MAP[nodeCode]?.[action] ?? [];
}

export function getWorkflowDefaultReturnNode(nodeCode: WorkflowNodeCode) {
  return WORKFLOW_NODE_META_MAP[nodeCode].defaultReturnNodeCode;
}

export function isPrimaryWorkflowNode(nodeCode: WorkflowNodeCode) {
  return WORKFLOW_NODE_META_MAP[nodeCode].isPrimaryTask;
}

export function isWorkflowTaskStatusActive(status: WorkflowTaskStatus) {
  return ACTIVE_WORKFLOW_TASK_STATUSES.includes(status);
}

export function isWorkflowTaskStatusActionable(status: WorkflowTaskStatus) {
  return ACTIONABLE_WORKFLOW_TASK_STATUSES.includes(status);
}

export function isWorkflowTaskStatusStartable(status: WorkflowTaskStatus) {
  return STARTABLE_WORKFLOW_TASK_STATUSES.includes(status);
}

export function isWorkflowTaskStatusCompletable(status: WorkflowTaskStatus) {
  return COMPLETABLE_WORKFLOW_TASK_STATUSES.includes(status);
}

export function isWorkflowActionCurrentlyAvailable(
  status: WorkflowTaskStatus,
  action: WorkflowAction,
) {
  if (action === WorkflowAction.START) {
    return isWorkflowTaskStatusStartable(status);
  }

  return isWorkflowTaskStatusActionable(status);
}

export function isWorkflowCompletionAction(action: WorkflowAction) {
  return COMPLETION_WORKFLOW_ACTIONS.includes(action);
}

export function isWorkflowReviewAction(action: WorkflowAction) {
  return REVIEW_WORKFLOW_ACTIONS.includes(action);
}

export function getWorkflowTerminalStatus(action: WorkflowAction) {
  switch (action) {
    case WorkflowAction.APPROVE:
      return WorkflowTaskStatus.APPROVED;
    case WorkflowAction.REJECT:
      return WorkflowTaskStatus.REJECTED;
    case WorkflowAction.RETURN:
      return WorkflowTaskStatus.RETURNED;
    case WorkflowAction.SUBMIT:
    case WorkflowAction.COMPLETE:
      return WorkflowTaskStatus.COMPLETED;
    default:
      return null;
  }
}

export function getPreviousPrimaryNodeCode(nodeCode: WorkflowNodeCode) {
  const currentMeta = getWorkflowNodeMeta(nodeCode);

  const previousPrimaryNodes = Object.entries(WORKFLOW_NODE_META_MAP)
    .map(([code, meta]) => ({
      code: code as WorkflowNodeCode,
      ...meta,
    }))
    .filter((meta) => meta.isPrimaryTask && meta.sequence < currentMeta.sequence)
    .sort((left, right) => right.sequence - left.sequence);

  return previousPrimaryNodes[0]?.code;
}
