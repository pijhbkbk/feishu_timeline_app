import { PERSON_PRESENTATION_SELECT, personPresentation } from '../persons/person-profile-read';
import { ProjectAssignmentSource, type Prisma, type WorkflowNodeCode } from '@prisma/client';
import type { R26AssignmentPreview, R26AssignmentTask } from '../r26-read-model/r26-assignment.resolver';
import { getWorkflowNodeMeta } from '../workflows/workflow-node.constants';
import { BUSINESS_ROLES, NODE_BUSINESS_ROLES } from './personnel.constants';
import { eligibleTeamUserWhere } from './team-assignment';

/** Compatibility read model; no project member or department grants authority. */
export async function teamAssignmentPreview(db: Prisma.TransactionClient, nodeCode: WorkflowNodeCode, task: R26AssignmentTask | null = null): Promise<R26AssignmentPreview> {
  const code = NODE_BUSINESS_ROLES[nodeCode];
  const role = BUSINESS_ROLES.find(item => item.code === code)!;
  const meta = getWorkflowNodeMeta(nodeCode);
  const candidates = await db.user.findMany({ where: eligibleTeamUserWhere(code), take: 2, orderBy: { id: 'asc' },
    select: { id: true, name: true, departmentId: true, personProfile: { select: PERSON_PRESENTATION_SELECT }, department: { select: { name: true } } } });
  const owner = task ? task.assigneeUser : candidates.length === 1 ? candidates[0]! : null;
  const suggestedOwner = owner ? personPresentation(owner) : null;
  return {
    nodeCode, stepNumber: meta.sequence / 10, stepName: meta.name,
    taskId: task?.id ?? null, taskStatus: task?.status ?? null,
    primaryDepartment: { id: code, code, name: role.name, directoryCode: code, directoryName: role.name, isDirectoryMatched: true },
    collaboratorDepartments: [], suggestedOwner, collaborators: [], reviewers: [],
    assignmentStatus: owner ? task ? 'ASSIGNED' : 'SUGGESTED' : 'UNASSIGNED',
    assignmentSource: owner ? task ? ProjectAssignmentSource.TASK_OVERRIDE : ProjectAssignmentSource.SINGLE_ELIGIBLE_MEMBER : ProjectAssignmentSource.UNASSIGNED,
    unassignedReason: owner ? null : candidates.length === 0 ? '对应业务角色暂无有效人员，请管理员分配角色。' : '多人具备此角色，进入共享队列，领取后办理。',
    affectedTaskIds: task?.isActive ? [task.id] : [], conflicts: [], availableActions: [],
  };
}
