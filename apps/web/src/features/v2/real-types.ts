export type R26Viewer = {
  id: string;
  name: string;
  departmentId: string | null;
  departmentName: string | null;
  roleCodes: string[];
  permissionCodes: string[];
  isSystemAdmin: boolean;
  authSource: string;
};

export type R26Person = {
  id: string;
  name: string;
  departmentId: string | null;
  departmentName: string | null;
};

export type R26MaterialProgress = {
  submitted: number;
  required: number;
  total: number;
  missing: number;
  text: string;
};

export type R26DashboardTask = {
  taskId: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  projectPriority: string;
  nodeCode: string;
  nodeName: string;
  status: string;
  dueAt: string | null;
  isOverdue: boolean;
  overdueDays: number;
  completionPercent: number;
  materials: {
    submitted: number;
    required: number;
    missing: number;
  };
};

export type R26DashboardResponse = {
  dataSource: 'database';
  readOnly: true;
  generatedAt: string;
  viewer: R26Viewer;
  dashboard: {
    generatedAt: string;
    user: {
      id: string;
      name: string;
      departmentName: string | null;
    };
    currentTask: R26DashboardTask | null;
    nextTask: R26DashboardTask | null;
    stats: {
      activeTasks: number;
      dueTodayTasks: number;
      overdueTasks: number;
      visibleProjects: number;
      pendingReviewTasks: number;
      pendingMaterialTasks: number;
      waitingOnOthersTasks: number;
    };
    recentActivity: Array<{
      id: string;
      summary: string;
      actorName: string;
      projectId: string | null;
      projectName: string;
      createdAt: string;
    }>;
  };
};

export type R26ProjectListItem = {
  id: string;
  code: string;
  name: string;
  colorName: string | null;
  colorCode: string | null;
  status: string;
  priority: string;
  currentNodeCode: string | null;
  currentNodeName: string | null;
  ownerUserId: string | null;
  ownerName: string | null;
  ownerDepartmentName: string | null;
  targetDate: string | null;
  riskLevel: string;
  isOverdue: boolean;
  progressPercent: number;
  progressText: string;
  currentTaskId: string | null;
  currentTaskOwnerName: string | null;
  currentTaskDueAt: string | null;
  latestTaskUpdatedAt: string;
  stall: {
    nodeCode: string | null;
    nodeName: string | null;
    days: number;
    reason: string;
    ownerName: string | null;
    helperName: string | null;
    expectedResolvedAt: string | null;
  } | null;
  memberCount: number;
};

export type R26ProjectsResponse = {
  dataSource: 'database';
  readOnly: true;
  viewer: R26Viewer;
  projects: {
    summary: {
      active: number;
      risk: number;
      dueThisWeek: number;
      pendingReview: number;
    };
    items: R26ProjectListItem[];
  };
};

export type R26FlowMapNode = {
  taskId: string | null;
  stepCode: string;
  stepNumber: number;
  stepName: string;
  nodeCode: string;
  status: string;
  statusLabel: string;
  ownerName: string | null;
  departmentName: string | null;
  dueAt: string | null;
  overdueDays: number;
  isOverdue: boolean;
  isBlocking: boolean;
  isMainline: boolean;
  nodeType: string;
  materialProgress: R26MaterialProgress;
  roundNo: number;
  monthlyReview: {
    totalPeriods: number;
    completedPeriods: number;
    overduePeriods: number;
    progressText: string;
  } | null;
  colorExit: {
    systemSuggestion: string | null;
    finalDecision: string | null;
  } | null;
  primaryDepartment: {
    id: string;
    code: string;
    name: string;
  } | null;
  collaboratorDepartments: Array<{
    id: string;
    code: string;
    name: string;
  }>;
  suggestedOwner: R26Person | null;
  collaborators: R26Person[];
  reviewers: R26Person[];
  assignmentStatus: 'ASSIGNED' | 'SUGGESTED' | 'UNASSIGNED';
  assignmentSource: 'WORKFLOW_TASK' | 'PROJECT_MEMBER_RULE' | 'DEPARTMENT_POOL' | 'NONE';
  availableActions: Array<{ action: string; label: string }>;
};

export type R26TaskDetail = {
  taskId: string;
  projectId: string;
  stepCode: string | null;
  stepNumber: number;
  stepName: string;
  nodeCode: string;
  status: string;
  statusLabel: string;
  roundNo: number;
  owner: R26Person | null;
  collaborators: Array<R26Person & { memberType?: string }>;
  approvers: R26Person[];
  department: { id: string | null; name: string | null };
  deadline: string | null;
  workContent: string;
  outputName: string;
  requiredMaterials: Array<{
    code?: string;
    name?: string;
    label?: string;
    required?: boolean;
  }>;
  attachments: Array<{
    id: string;
    fileName: string;
    materialType: string | null;
    uploadedByName: string | null;
    uploadedAt: string;
  }>;
  reviewDetail: {
    latestResultLabel: string | null;
    rejectReason: string | null;
    reworkRequirement: string | null;
    records: Array<{
      id: string;
      resultLabel: string;
      reviewerName: string | null;
      reviewedAt: string | null;
    }>;
  };
  monthlyReviewSummary: {
    totalPeriods: number;
    completedPeriods: number;
    overduePeriods: number;
    progressText: string;
  } | null;
  colorExitSummary: {
    annualOutput: number | null;
    exitThreshold: number | null;
    systemSuggestionLabel: string | null;
    finalDecisionLabel: string | null;
    operatorName: string | null;
  } | null;
  availableActions: Array<{ action: string; label: string }>;
  flowLogs: Array<{
    id?: string;
    createdAt?: string;
    actionLabel?: string;
    summary?: string;
    operatorName?: string;
  }>;
  project: {
    id: string;
    code: string;
    name: string;
    colorName: string;
    colorCode: string | null;
    currentNodeCode: string | null;
    currentNodeName: string | null;
  };
  schedule: {
    ruleText: string;
    startedAt: string;
    dueAt: string | null;
    effectiveDueAt: string | null;
    completedAt: string | null;
    remainingWorkdays: number | null;
    overdueDays: number;
    isOverdue: boolean;
    slaStatus: string;
    progressPercent: number;
  };
  relations: {
    previousNodeName: string | null;
    nextNodeName: string | null;
    latestOperatorName: string | null;
  };
};

export type R26WorkspaceResponse = {
  dataSource: 'database';
  readOnly: true;
  viewer: R26Viewer;
  project: {
    id: string;
    code: string;
    name: string;
    description: string | null;
    status: string;
    priority: string;
    riskLevel: string;
    currentNodeCode: string | null;
    currentNodeName: string | null;
    targetDate: string | null;
    ownerUserId: string | null;
    ownerName: string | null;
    owningDepartmentName: string | null;
    updatedAt: string;
    memberCount: number;
    members: Array<{
      id: string;
      userId: string;
      name: string;
      departmentName: string | null;
      memberType: string;
      title: string | null;
      isPrimary: boolean;
    }>;
  };
  flowMap: {
    projectId: string;
    projectName: string;
    projectCode: string;
    colorName: string | null;
    currentStepCode: string | null;
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
    nodes: R26FlowMapNode[];
    recentActivities: Array<{
      id: string;
      actionLabel: string;
      summary: string;
      operatorName: string;
      createdAt: string;
    }>;
  };
  organization: {
    departments: Array<{
      id: string;
      code: string;
      name: string;
      activeUserCount: number;
    }>;
    users: R26Person[];
  };
  memberAssignments: Array<{
    id: string;
    userId: string;
    name: string;
    departmentName: string | null;
    memberType: string;
    memberTypeLabel: string;
    projectResponsibility: string;
    isPrimary: boolean;
    defaultNodes: Array<{
      nodeCode: string;
      stepNumber: number;
      stepName: string;
    }>;
    currentTasks: Array<{
      taskId: string;
      nodeCode: string;
      stepName: string;
    }>;
    relations: Array<{
      nodeCode: string;
      stepName: string;
      relation: string;
    }>;
  }>;
  assignmentPreview: Array<{
    nodeCode: string;
    stepNumber: number;
    stepName: string;
    taskId: string | null;
    primaryDepartment: {
      id: string;
      code: string;
      name: string;
    } | null;
    collaboratorDepartments: Array<{
      id: string;
      code: string;
      name: string;
    }>;
    suggestedOwner: R26Person | null;
    collaborators: R26Person[];
    reviewers: R26Person[];
    assignmentStatus: 'ASSIGNED' | 'SUGGESTED' | 'UNASSIGNED';
    assignmentSource: string;
    unassignedReason: string | null;
    availableActions: Array<{ action: string; label: string }>;
  }>;
};

export type R26TaskResponse = {
  dataSource: 'database';
  readOnly: true;
  viewer: R26Viewer;
  task: R26TaskDetail;
};

export type R26ProgressResponse = R26TaskResponse & {
  progressSubmissionEnabled: false;
  notice: string;
};
