import {
  ProjectAssignmentSource,
  ProjectMemberType,
  WorkflowNodeCode,
  WorkflowTaskStatus,
} from '@prisma/client';

import { WORKFLOW_NODE_META_MAP } from '../workflows/workflow-node.constants';
import {
  R26_ASSIGNMENT_RULES,
  type R26DepartmentRule,
} from './r26-assignment.rules';

export type R26DirectoryDepartment = {
  id: string;
  code: string;
  name: string;
  path: string | null;
};

export type R26DirectoryUser = {
  id: string;
  name: string;
  departmentId: string | null;
  departmentName: string | null;
};

export type R26ProjectMemberRow = {
  id: string;
  userId: string;
  name: string;
  departmentName: string | null;
  memberType: ProjectMemberType;
  title: string | null;
  isPrimary: boolean;
};

export type R26NodeAssignmentConfig = {
  nodeCode: WorkflowNodeCode;
  primaryDepartmentId: string | null;
  ownerUserId: string | null;
  collaboratorUserIds: string[];
  reviewerUserIds: string[];
  assignmentSource: ProjectAssignmentSource;
};

export type R26AssignmentTask = {
  id: string;
  nodeName: string;
  status: WorkflowTaskStatus;
  isActive: boolean;
  assigneeUserId: string | null;
  assigneeDepartmentId: string | null;
  assignmentSource?: ProjectAssignmentSource | null;
  assigneeUser: {
    id: string;
    name: string;
    departmentId: string | null;
    department: { name: string } | null;
  } | null;
};

export type R26AssignmentPreview = ReturnType<typeof buildR26AssignmentPreview>;

const MUTABLE_PENDING_STATUSES = new Set<WorkflowTaskStatus>([
  WorkflowTaskStatus.PENDING,
  WorkflowTaskStatus.READY,
]);

const ASSIGNMENT_SOURCE_VALUES = new Set<ProjectAssignmentSource>(
  Object.values(ProjectAssignmentSource),
);

export function buildR26AssignmentPreview(input: {
  nodeCode: WorkflowNodeCode;
  task: R26AssignmentTask | null;
  nodeAssignment?: R26NodeAssignmentConfig | null;
  projectMembers: R26ProjectMemberRow[];
  departments: R26DirectoryDepartment[];
  users: R26DirectoryUser[];
}) {
  const rule = R26_ASSIGNMENT_RULES[input.nodeCode];
  const departmentByCode = new Map(
    input.departments.map((department) => [department.code, department]),
  );
  const primaryDepartment = materializeDepartment(
    rule.primaryDepartment,
    departmentByCode,
  );
  const collaboratorDepartments = rule.collaboratorDepartments.map((departmentRule) =>
    materializeDepartment(departmentRule, departmentByCode),
  );
  const reviewerDepartments = (rule.reviewerDepartments ?? []).map((departmentRule) =>
    materializeDepartment(departmentRule, departmentByCode),
  );
  const projectMembersByDepartment = findProjectMembersForDepartment(
    input.projectMembers,
    input.users,
    primaryDepartment.id,
  );
  const uniqueEligibleMembers = uniqueMembers(projectMembersByDepartment);
  const departmentLead =
    projectMembersByDepartment.find(
      (member) =>
        member.memberType === ProjectMemberType.MANAGER && member.isPrimary,
    ) ??
    projectMembersByDepartment.find(
      (member) => member.memberType === ProjectMemberType.MANAGER,
    ) ??
    null;
  const defaultExecutor =
    projectMembersByDepartment.find(
      (member) =>
        member.memberType === ProjectMemberType.MEMBER &&
        member.isPrimary,
    ) ?? null;
  const singleEligibleMember =
    uniqueEligibleMembers.length === 1 ? uniqueEligibleMembers[0] ?? null : null;
  const configuredOwner = input.nodeAssignment?.ownerUserId
    ? serializeMemberByUserId(
        input.nodeAssignment.ownerUserId,
        input.projectMembers,
        input.users,
      )
    : null;
  const taskOwner = input.task?.assigneeUser
    ? serializePerson(input.task.assigneeUser)
    : null;
  const suggestedOwner =
    taskOwner ??
    configuredOwner ??
    (departmentLead
      ? serializeProjectMember(departmentLead, input.users)
      : defaultExecutor
        ? serializeProjectMember(defaultExecutor, input.users)
        : singleEligibleMember
          ? serializeProjectMember(singleEligibleMember, input.users)
          : null);
  const assignmentStatus = taskOwner
    ? 'ASSIGNED'
    : suggestedOwner
      ? 'SUGGESTED'
      : 'UNASSIGNED';
  const assignmentSource = resolveAssignmentSource({
    task: input.task,
    taskOwner,
    nodeAssignment: input.nodeAssignment ?? null,
    configuredOwner,
    departmentLead,
    defaultExecutor,
    singleEligibleMember,
  });
  const configuredCollaborators = peopleFromIds(
    input.nodeAssignment?.collaboratorUserIds ?? [],
    input.projectMembers,
    input.users,
  );
  const configuredReviewers = peopleFromIds(
    input.nodeAssignment?.reviewerUserIds ?? [],
    input.projectMembers,
    input.users,
  );
  const collaborators = uniquePeople(
    configuredCollaborators.length > 0
      ? configuredCollaborators
      : collaboratorDepartments.flatMap((department) =>
          findProjectMembersForDepartment(
            input.projectMembers,
            input.users,
            department.id,
          )
            .filter((member) => member.userId !== suggestedOwner?.id)
            .map((member) => serializeProjectMember(member, input.users)),
        ),
  ).filter((person) => person.id !== suggestedOwner?.id);
  const reviewers = uniquePeople(
    configuredReviewers.length > 0
      ? configuredReviewers
      : [
          ...input.projectMembers
            .filter((member) => member.memberType === ProjectMemberType.REVIEWER)
            .map((member) => serializeProjectMember(member, input.users)),
          ...reviewerDepartments.flatMap((department) =>
            findProjectMembersForDepartment(
              input.projectMembers,
              input.users,
              department.id,
            ).map((member) => serializeProjectMember(member, input.users)),
          ),
        ],
  ).filter((person) => person.id !== suggestedOwner?.id);
  const conflicts: string[] = [];

  if (input.nodeAssignment?.ownerUserId && !configuredOwner) {
    conflicts.push('节点配置的负责人已不在当前有效项目成员中。');
  }
  if (
    assignmentStatus === 'UNASSIGNED' &&
    primaryDepartment.isDirectoryMatched &&
    uniqueEligibleMembers.length > 1
  ) {
    conflicts.push(`存在 ${uniqueEligibleMembers.length} 位候选成员，需要明确默认负责人。`);
  }

  return {
    nodeCode: input.nodeCode,
    stepNumber: WORKFLOW_NODE_META_MAP[input.nodeCode].sequence / 10,
    stepName: WORKFLOW_NODE_META_MAP[input.nodeCode].name,
    taskId: input.task?.id ?? null,
    taskStatus: input.task?.status ?? null,
    primaryDepartment,
    collaboratorDepartments,
    suggestedOwner,
    collaborators,
    reviewers: WORKFLOW_NODE_META_MAP[input.nodeCode].isReviewNode ? reviewers : [],
    assignmentStatus,
    assignmentSource,
    unassignedReason:
      assignmentStatus === 'UNASSIGNED'
        ? resolveUnassignedReason(
            primaryDepartment,
            uniqueEligibleMembers.length,
          )
        : null,
    affectedTaskIds:
      input.task?.isActive === true &&
      (MUTABLE_PENDING_STATUSES.has(input.task.status) ||
        input.task.status === WorkflowTaskStatus.IN_PROGRESS)
        ? [input.task.id]
        : [],
    conflicts,
    availableActions: resolveAvailableActions(input.task, suggestedOwner !== null),
  };
}

export function parseAssignmentSource(value: unknown) {
  return typeof value === 'string' &&
    ASSIGNMENT_SOURCE_VALUES.has(value as ProjectAssignmentSource)
    ? (value as ProjectAssignmentSource)
    : null;
}

function resolveAssignmentSource(input: {
  task: R26AssignmentTask | null;
  taskOwner: ReturnType<typeof serializePerson> | null;
  nodeAssignment?: R26NodeAssignmentConfig | null;
  configuredOwner: ReturnType<typeof serializeProjectMember> | null;
  departmentLead: R26ProjectMemberRow | null;
  defaultExecutor: R26ProjectMemberRow | null;
  singleEligibleMember: R26ProjectMemberRow | null;
}) {
  if (input.taskOwner) {
    return input.task?.assignmentSource ?? ProjectAssignmentSource.TASK_OVERRIDE;
  }
  if (input.configuredOwner) {
    return input.nodeAssignment?.assignmentSource ??
      ProjectAssignmentSource.PROJECT_NODE_OVERRIDE;
  }
  if (input.departmentLead) {
    return ProjectAssignmentSource.PROJECT_DEPARTMENT_LEAD;
  }
  if (input.defaultExecutor) {
    return ProjectAssignmentSource.PROJECT_DEFAULT_ASSIGNEE;
  }
  if (input.singleEligibleMember) {
    return ProjectAssignmentSource.SINGLE_ELIGIBLE_MEMBER;
  }
  return ProjectAssignmentSource.UNASSIGNED;
}

function resolveAvailableActions(
  task: R26AssignmentTask | null,
  hasSuggestedOwner: boolean,
) {
  if (!hasSuggestedOwner) {
    return [
      {
        action: 'ADD_OR_CONFIGURE_MEMBER',
        label: '补充项目成员或默认负责人',
      },
    ];
  }
  if (!task) {
    return [
      {
        action: 'APPLY_FUTURE_ASSIGNMENT',
        label: '应用到未来任务',
      },
    ];
  }
  if (!task.isActive) {
    return [];
  }
  if (MUTABLE_PENDING_STATUSES.has(task.status)) {
    return [
      {
        action: 'REASSIGN_PENDING_TASK',
        label: '应用到未开始任务',
      },
      {
        action: 'APPLY_FUTURE_ASSIGNMENT',
        label: '应用到未来任务',
      },
    ];
  }
  if (task.status === WorkflowTaskStatus.IN_PROGRESS) {
    return [
      {
        action: 'CONFIRM_REASSIGN_IN_PROGRESS',
        label: '确认转交进行中任务',
      },
      {
        action: 'APPLY_FUTURE_ASSIGNMENT',
        label: '应用到未来任务',
      },
    ];
  }
  return [];
}

function materializeDepartment(
  rule: R26DepartmentRule,
  departmentByCode: Map<string, R26DirectoryDepartment>,
) {
  const directoryDepartment =
    departmentByCode.get(rule.directoryCode ?? rule.code) ?? null;

  return {
    id: directoryDepartment?.id ?? null,
    code: rule.code,
    // Once a Gate 3A business rule has matched a real company-directory
    // department, all downstream previews must use that canonical directory
    // name. Otherwise the completion preview can say "涂装工艺部" while the
    // created task (correctly linked by id) says "工艺开发部".
    name: directoryDepartment?.name ?? rule.name,
    directoryCode: directoryDepartment?.code ?? null,
    directoryName: directoryDepartment?.name ?? null,
    isDirectoryMatched: directoryDepartment !== null,
  };
}

function findProjectMembersForDepartment(
  projectMembers: R26ProjectMemberRow[],
  users: R26DirectoryUser[],
  departmentId: string | null,
) {
  if (!departmentId) {
    return [];
  }

  const activeUserIds = new Set(
    users
      .filter((user) => user.departmentId === departmentId)
      .map((user) => user.id),
  );

  return projectMembers.filter((member) => activeUserIds.has(member.userId));
}

function uniqueMembers(members: R26ProjectMemberRow[]) {
  return [...new Map(members.map((member) => [member.userId, member])).values()];
}

function resolveUnassignedReason(
  department: ReturnType<typeof materializeDepartment>,
  projectMemberCount: number,
) {
  if (!department.isDirectoryMatched) {
    return `公司目录中尚未配置“${department.name}”，负责人待分配。`;
  }
  if (projectMemberCount === 0) {
    return `当前项目没有${department.name}有效成员。`;
  }
  return `当前项目有 ${projectMemberCount} 位${department.name}成员，但未设置部门负责人或默认执行人。`;
}

function serializeProjectMember(
  member: R26ProjectMemberRow,
  users: R26DirectoryUser[],
) {
  const directoryUser = users.find((user) => user.id === member.userId) ?? null;

  return {
    id: member.userId,
    name: member.name,
    departmentId: directoryUser?.departmentId ?? null,
    departmentName: directoryUser?.departmentName ?? member.departmentName,
  };
}

function serializeMemberByUserId(
  userId: string,
  members: R26ProjectMemberRow[],
  users: R26DirectoryUser[],
) {
  const member = members.find((item) => item.userId === userId);
  return member ? serializeProjectMember(member, users) : null;
}

function serializePerson(person: {
  id: string;
  name: string;
  departmentId: string | null;
  department?: { name: string } | null;
  departmentName?: string | null;
}) {
  return {
    id: person.id,
    name: person.name,
    departmentId: person.departmentId,
    departmentName: person.department?.name ?? person.departmentName ?? null,
  };
}

function peopleFromIds(
  userIds: string[],
  members: R26ProjectMemberRow[],
  users: R26DirectoryUser[],
) {
  return userIds.flatMap((userId) => {
    const person = serializeMemberByUserId(userId, members, users);
    return person ? [person] : [];
  });
}

function uniquePeople<T extends { id: string }>(people: T[]) {
  return [...new Map(people.map((person) => [person.id, person])).values()];
}
