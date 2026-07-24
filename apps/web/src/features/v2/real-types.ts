export type R26Viewer = {
  id: string;
  name: string;
  departmentId: string | null;
  departmentName: string | null;
  roleCodes: string[];
  permissionCodes: string[];
  isSystemAdmin: boolean;
  roleLabel: string;
  organizationStatus: 'SYNCED' | 'MISSING_DEPARTMENT';
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
  assigneeUserId: string | null;
  assigneeUserName: string | null;
  assigneeDepartmentId: string | null;
  assigneeDepartmentName: string | null;
  dueAt: string | null;
  isOverdue: boolean;
  overdueDays: number;
  completionPercent: number;
  blocker: {
    type: string;
    description: string;
    helperName: string | null;
    expectedResolvedAt: string | null;
    impactLevel: string | null;
  } | null;
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
  currentTaskDepartmentName: string | null;
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
    id: string | null;
    code: string;
    name: string;
    directoryCode: string | null;
    directoryName: string | null;
    isDirectoryMatched: boolean;
  } | null;
  collaboratorDepartments: Array<{
    id: string | null;
    code: string;
    name: string;
    directoryCode: string | null;
    directoryName: string | null;
    isDirectoryMatched: boolean;
  }>;
  suggestedOwner: R26Person | null;
  collaborators: R26Person[];
  reviewers: R26Person[];
  assignmentStatus: 'ASSIGNED' | 'SUGGESTED' | 'UNASSIGNED';
  assignmentSource:
    | 'TASK_OVERRIDE'
    | 'PROJECT_NODE_OVERRIDE'
    | 'PROJECT_DEPARTMENT_LEAD'
    | 'PROJECT_DEFAULT_ASSIGNEE'
    | 'SINGLE_ELIGIBLE_MEMBER'
    | 'UNASSIGNED';
  availableActions: Array<{ action: string; label: string }>;
  blocker: {
    type: string;
    description: string;
    helperName: string | null;
    assistanceUserIds: string[];
    assistanceDepartmentIds: string[];
    impactLevel: string | null;
    expectedResolvedAt: string | null;
  } | null;
};

export type R26TaskDetail = {
  taskId: string;
  taskVersion: string;
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
  readOnly: false;
  writeScope: 'PROJECT_MEMBERS_AND_ASSIGNMENTS';
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
    memberAssignmentVersion: number;
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
    currentStepNumber: number;
    currentOwner: string | null;
    currentDepartment: string | null;
    progressPercent: number;
    progressText: string;
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
    users: Array<R26Person & { isProjectMember: boolean }>;
  };
  memberAssignments: Array<{
    id: string;
    userId: string;
    name: string;
    departmentName: string | null;
    memberType: string;
    memberTypeLabel: string;
    roles: Array<{
      memberType: string;
      label: string;
      title: string | null;
      isPrimary: boolean;
    }>;
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
    taskStatus: string | null;
    primaryDepartment: {
      id: string | null;
      code: string;
      name: string;
      directoryCode: string | null;
      directoryName: string | null;
      isDirectoryMatched: boolean;
    } | null;
    collaboratorDepartments: Array<{
      id: string | null;
      code: string;
      name: string;
      directoryCode: string | null;
      directoryName: string | null;
      isDirectoryMatched: boolean;
    }>;
    suggestedOwner: R26Person | null;
    collaborators: R26Person[];
    reviewers: R26Person[];
    assignmentStatus: 'ASSIGNED' | 'SUGGESTED' | 'UNASSIGNED';
    assignmentSource: R26FlowMapNode['assignmentSource'];
    unassignedReason: string | null;
    affectedTaskIds: string[];
    conflicts: string[];
    availableActions: Array<{ action: string; label: string }>;
  }>;
  projectRecords: Array<{
    id: string;
    action: string;
    summary: string;
    actorName: string;
    nodeCode: string | null;
    requestId: string | null;
    reason: string | null;
    createdAt: string;
  }>;
  capabilities: {
    gate: 'R26_GATE3B' | 'R26_GATE3C1';
    memberAssignmentVersion: number;
    manageMembers: boolean;
    progressWriteEnabled: true;
    workflowWriteEnabled: boolean;
    workflowWriteScope?: 'ORDINARY_STEPS_1_TO_11';
    specialWorkflowActionsEnabled?: false;
  };
};

export type R26AssignmentScope =
  | 'FUTURE_ONLY'
  | 'FUTURE_AND_PENDING'
  | 'CONFIRM_IN_PROGRESS';

export type R26MemberDraft = {
  type: 'ADD' | 'UPDATE' | 'REMOVE';
  userId: string;
  memberTypes?: string[];
  responsibility?: string | null;
  isDepartmentLead?: boolean;
  isDefaultExecutor?: boolean;
  defaultNodeCodes?: string[];
  transferToUserId?: string | null;
  replacementOwnerUserId?: string | null;
};

export type R26AssignmentImpactResponse = {
  dataSource: 'database';
  writePerformed: false;
  projectId: string;
  expectedVersion: number;
  applicationScope: R26AssignmentScope;
  memberChange: R26MemberDraft | null;
  summary: {
    nodeCount: number;
    futureAssignmentCount: number;
    pendingTaskCount: number;
    inProgressTaskCount: number;
    blockedCount: number;
  };
  conflicts: string[];
  canApply: boolean;
  items: Array<
    R26WorkspaceResponse['assignmentPreview'][number] & {
      applicationScope: R26AssignmentScope;
      applyToFuture: boolean;
      applyToPendingTask: boolean;
      requiresInProgressConfirmation: boolean;
      completedOrHistoricalProtected: boolean;
      blocked: boolean;
    }
  >;
};

export type R26Gate3CommandResponse = {
  command: {
    action: string;
    requestId: string;
    idempotencyKey: string;
    idempotentReplay: boolean;
    previousVersion: number;
    memberAssignmentVersion: number;
    auditLogIds: string[];
    affectedTaskIds: string[];
  };
  workspace: R26WorkspaceResponse;
};

export type R26TaskResponse = {
  dataSource: 'database';
  readOnly: boolean;
  viewer: R26Viewer;
  task: R26TaskDetail;
};

export type R26ProgressResponse = R26TaskResponse & {
  gate: 'R26_GATE3B';
  taskVersion: string;
  progressSubmissionEnabled: boolean;
  workflowTransitionEnabled: false;
  availableActions: Array<{ action: string; label: string }>;
  draft: R26ProgressDraft | null;
  progressHistory: R26ProgressHistoryItem[];
  materials: R26ProgressMaterials;
  assistanceOptions: {
    users: R26Person[];
    departments: Array<{ id: string; name: string }>;
  };
  notice: string;
};

export type R26ProgressStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'BLOCKED'
  | 'WORK_COMPLETE_PENDING_TASK_COMPLETION';

export type R26ProgressDraft = {
  id: string;
  draftVersion: number;
  progressStatus: R26ProgressStatus;
  completedWork: string | null;
  nextPlan: string | null;
  blockerType: string | null;
  blockerDescription: string | null;
  assistanceUserIds: string[];
  assistanceDepartmentIds: string[];
  expectedResolvedAt: string | null;
  impactLevel: string | null;
  updatedAt: string;
};

export type R26ProgressHistoryItem = {
  id: string;
  progressStatus: R26ProgressStatus;
  completionPercent: number;
  completedWork: string;
  nextPlan: string | null;
  attachmentIds: string[];
  requestId: string | null;
  taskVersion: string | null;
  submittedBy: {
    id: string;
    name: string;
    departmentName: string | null;
  } | null;
  blocker: {
    type: string;
    description: string;
    assistanceUserIds: string[];
    assistanceDepartmentIds: string[];
    impactLevel: string | null;
    expectedResolvedAt: string | null;
    status: string;
    helper: { id: string; name: string } | null;
  } | null;
  createdAt: string;
};

export type R26MaterialVersion = {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  materialType: string | null;
  versionNo: number;
  replacesAttachmentId: string | null;
  uploadedById: string | null;
  uploadedByName: string | null;
  uploadedAt: string;
  isCurrent: boolean;
  downloadUrl: string;
  projectId: string;
};

export type R26ProgressMaterials = {
  requirements: Array<{
    id: string;
    name: string;
    required: boolean;
    description: string | null;
    status: 'SUBMITTED' | 'MISSING';
    currentAttachment: R26MaterialVersion | null;
  }>;
  current: R26MaterialVersion[];
  versions: R26MaterialVersion[];
  summary: {
    required: number;
    submitted: number;
    missing: number;
    uploaded: number;
  };
};

export type R26ProgressCommandResponse = {
  action: string;
  requestId: string;
  idempotencyKey: string;
  idempotentReplay: boolean;
  taskStatusChanged: false;
  workflowTransitioned: false;
  draft?: R26ProgressDraft;
  deleted?: boolean;
  progressSubmitted?: boolean;
  materialUploaded?: boolean;
  progress?: R26ProgressHistoryItem;
  attachment?: R26MaterialVersion;
  viewModel?: R26ProgressResponse;
  invariants?: {
    taskStatusBefore: string;
    taskStatusAfter: string;
    currentNodeBefore: string | null;
    currentNodeAfter: string | null;
    taskCountBefore: number;
    taskCountAfter: number;
  };
};

export type R26CompletionPreview = {
  gate: 'R26_GATE3C1';
  writePerformed: false;
  canComplete: boolean;
  blockingReasons: string[];
  currentTask: {
    id: string;
    projectId: string;
    nodeCode: string;
    stepNumber: number;
    stepName: string;
    status: string;
    taskVersion: string;
    owner: { id: string; name: string } | null;
  };
  checks: Array<{
    code: string;
    label: string;
    passed: boolean;
    details: string[];
  }>;
  openBlockers: Array<{
    id: string;
    blockerType: string;
    description: string;
    impactLevel: string | null;
    expectedResolvedAt: string | null;
    createdAt: string;
  }>;
  nextTasks: Array<{
    nodeCode: string;
    stepNumber: number;
    stepName: string;
    isPrimary: boolean;
    isNonBlocking: boolean;
    reason: string;
    primaryDepartment: {
      id: string | null;
      name: string;
    } | null;
    suggestedOwner: R26Person | null;
    collaborators: R26Person[];
    reviewers: R26Person[];
    assignmentStatus: 'ASSIGNED' | 'SUGGESTED' | 'UNASSIGNED';
    assignmentSource: R26FlowMapNode['assignmentSource'];
    unassignedReason: string | null;
  }>;
  workflowVersion: number;
  availableActions: Array<{ action: string; label: string }>;
  notice: string;
};

export type R26OrdinaryCompletionCommand = {
  action: 'R26_ORDINARY_TASK_COMPLETED';
  requestId: string;
  idempotencyKey: string;
  idempotentReplay: boolean;
  projectId: string;
  completedTask: {
    id: string;
    nodeCode: string;
    stepNumber: number;
    stepName: string;
    status: string;
    completedAt: string | null;
  };
  createdTasks: Array<{
    taskId: string;
    nodeCode: string;
    stepNumber: number;
    stepName: string;
    isPrimary: boolean;
    isNonBlocking: boolean;
    owner: { id: string; name: string } | null;
    department: { id: string; name: string } | null;
    assignmentSource: R26FlowMapNode['assignmentSource'];
  }>;
  activatedTasks: [];
  projectCurrentNodeCode: string | null;
  assignmentSummary: R26OrdinaryCompletionCommand['createdTasks'];
  activity: {
    id: string;
    summary: string;
    createdAt: string;
  };
  workflowVersion: number;
};

export type R26OrdinaryCompletionResponse = {
  command: R26OrdinaryCompletionCommand;
  viewModel: {
    workspace: R26WorkspaceResponse;
    dashboard: R26DashboardResponse;
    projects: R26ProjectsResponse;
    task: R26TaskResponse;
  };
};

export type R26ResolveBlockerResponse = {
  command: {
    action: 'R26_TASK_BLOCKER_RESOLVED';
    projectId: string;
    taskId: string;
    blockerId: string;
    blockerResolved: true;
    taskStatusChanged: false;
    workflowTransitioned: false;
    resolvedAt: string;
    resolutionSummary: string;
  };
  viewModel: {
    completionPreview: R26CompletionPreview;
    workspace: R26WorkspaceResponse;
    task: R26TaskResponse;
  };
};
