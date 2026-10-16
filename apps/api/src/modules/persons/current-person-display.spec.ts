import { ProjectMemberType, ProjectPriority, ProjectStatus, UserStatus, WorkflowNodeCode, WorkflowTaskStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ProjectsService } from '../projects/projects.service';
import { R26ReadModelService } from '../r26-read-model/r26-read-model.service';
import { WorkflowsService } from '../workflows/workflows.service';
import { PERSON_PRESENTATION_SELECT } from './person-profile-read';

const at = new Date('2026-10-01T00:00:00.000Z');
const actor: AuthenticatedUser = {
  id: 'account-1', username: 'ordinary', name: '账号旧姓名', email: null,
  departmentId: 'old-dept', departmentName: '旧部门', authSource: 'local',
  teamAccessApproved: true, authVersion: 1, isSystemAdmin: false, roleCodes: [],
};
function currentUser() {
  return {
    id: actor.id, name: '账号旧姓名', email: null, status: UserStatus.ACTIVE,
    departmentId: 'old-dept', department: { id: 'old-dept', name: '旧部门' }, userRoles: [],
    personProfile: {
      id: 'person-1', name: '档案新姓名', departmentId: 'new-dept', position: '档案岗位',
      department: { name: '新部门' },
    },
  };
}
function task(user = currentUser()) {
  return {
    id: 'task-1', taskNo: 'TASK-1', nodeCode: WorkflowNodeCode.PROJECT_INITIATION,
    nodeName: '项目立项', taskRound: 1, status: WorkflowTaskStatus.READY,
    isActive: true, isPrimary: true, assigneeUserId: user.id, assigneeUser: user,
    assigneeDepartmentId: null, assigneeDepartment: null, dueAt: null, effectiveDueAt: null,
    startedAt: null, completedAt: null, returnedAt: null, createdAt: at, updatedAt: at,
  };
}
function project(user = currentUser()) {
  return {
    id: 'project-1', code: 'P-1', name: '档案展示回归', description: null,
    status: ProjectStatus.IN_PROGRESS, priority: ProjectPriority.LOW,
    currentNodeCode: WorkflowNodeCode.PROJECT_INITIATION, ownerUserId: user.id,
    ownerUser: user, owningDepartmentId: null, owningDepartment: null,
    primaryColor: null, primaryColorId: null, colors: [], workflowTasks: [task(user)],
    taskBlockers: [], workflowInstances: [], plannedEndDate: null,
    createdAt: at, updatedAt: at, _count: { members: 1 }, memberAssignmentVersion: 0,
    members: [{ id: 'member-1', userId: user.id, user, memberType: ProjectMemberType.OWNER,
      title: null, isPrimary: true, createdAt: at }],
  };
}
function projects() {
  return new ProjectsService({} as never, { getCurrentNodeName: () => '项目立项' } as never, {} as never, {} as never);
}
function workflows() {
  return new WorkflowsService({} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
}

describe('current responsibility reads use the linked personnel profile', () => {
  it('updates project list, detail, and stage names while keeping account IDs and historical audit snapshots', () => {
    const service = projects(), record = project();
    const list = service['toProjectListItem'](record as never);
    expect(list).toMatchObject({ ownerUserId: actor.id, ownerName: '档案新姓名', ownerDepartmentName: '新部门',
      currentTaskOwnerId: actor.id, currentTaskOwnerName: '档案新姓名', currentTaskDepartmentName: '新部门' });
    const detail = service['toProjectDetail'](record as never);
    expect(detail).toMatchObject({ ownerUserId: actor.id, ownerName: '档案新姓名' });
    expect(detail.members[0]).toMatchObject({ userId: actor.id, name: '档案新姓名', departmentName: '新部门' });
    expect(service['toProjectStageOverviewTask'](task() as never)).toMatchObject({ assigneeUserId: actor.id, assigneeUserName: '档案新姓名' });
    expect(service['toMemberAuditSnapshot'](record.members)).toEqual([expect.objectContaining({ userId: actor.id, userName: '账号旧姓名' })]);
    expect(record.ownerUser.name).toBe('账号旧姓名');
  });

  it('does not resurrect the account department after a linked profile explicitly clears it', () => {
    const user = { ...currentUser(), personProfile: { ...currentUser().personProfile, departmentId: null, department: null } };
    const list = projects()['toProjectListItem'](project(user as never) as never);
    expect(list.ownerDepartmentName).toBeNull();
    expect(list.currentTaskDepartmentName).toBeNull();
    expect(workflows()['currentPersonSummary'](user)).toEqual({ id: actor.id, name: '档案新姓名', departmentId: null, departmentName: null });
  });

  it('preserves an explicit task department and uses the legacy account when no profile exists', () => {
    const user = { ...currentUser(), personProfile: null };
    const record = project(user as never);
    record.workflowTasks[0] = { ...task(user as never), assigneeDepartmentId: 'explicit-dept', assigneeDepartment: { name: '任务部门' } } as never;
    expect(projects()['toProjectListItem'](record as never)).toMatchObject({ ownerName: '账号旧姓名', ownerDepartmentName: '旧部门', currentTaskDepartmentName: '任务部门' });
    expect(workflows()['toWorkflowTaskSummary'](task(user as never) as never)).toMatchObject({ assigneeUserId: actor.id, assigneeUserName: '账号旧姓名' });
  });

  it('keeps the current reviewer presentation when a past review references the same account', () => {
    const service = workflows(), historical = { reviewerId: actor.id, reviewer: { id: actor.id, name: '历史评审姓名', department: { id: 'history-dept', name: '历史部门' } } };
    const output = service['buildTaskApprovers']([{ memberType: 'REVIEWER', user: currentUser() }], [historical,
      { reviewerId: 'former-reviewer', reviewer: { id: 'former-reviewer', name: '更早姓名', department: null } },
      { reviewerId: 'former-reviewer', reviewer: { id: 'former-reviewer', name: '历史其他评审人', department: null } }]);
    expect(output).toEqual([
      { id: actor.id, name: '档案新姓名', departmentId: 'new-dept', departmentName: '新部门' },
      { id: 'former-reviewer', name: '历史其他评审人', departmentId: null, departmentName: null },
    ]);
    expect(historical.reviewer.name).toBe('历史评审姓名');
    expect(service['toWorkflowTaskSummary'](task() as never)).toMatchObject({ assigneeUserId: actor.id, assigneeUserName: '档案新姓名' });
  });

  it('loads the profile for task detail and keeps the task department independent from the person', async () => {
    const findUnique = vi.fn().mockResolvedValue({ nodeCode: WorkflowNodeCode.PROJECT_INITIATION,
      assigneeDepartment: { id: 'task-dept', name: '任务部门' }, assigneeUser: currentUser() });
    const service = new R26ReadModelService({ workflowTask: { findUnique } } as never, {} as never, {} as never,
      { getTaskInteractionDetail: vi.fn().mockResolvedValue({ taskId: 'task-1' }) } as never);
    const response = await service.getTask('task-1', actor);
    expect(response.task.owner).toEqual({ id: actor.id, name: '档案新姓名', departmentId: 'new-dept', departmentName: '新部门' });
    expect(response.task.department).toEqual({ id: 'task-dept', name: '任务部门' });
    expect(findUnique.mock.calls[0]?.[0].select.assigneeUser.select.personProfile).toEqual({ select: PERSON_PRESENTATION_SELECT });
  });

  it('uses current departments in the scoped candidate directory and counts without changing account eligibility', async () => {
    const user = currentUser();
    const findMany = vi.fn().mockResolvedValue([user]);
    const departmentFind = vi.fn().mockResolvedValue([{ id: 'new-dept', code: 'NEW', name: '新部门', path: null, isActive: true }]);
    const prisma = { workflowTask: { findMany: vi.fn().mockResolvedValue([]) }, projectNodeAssignment: { findMany: vi.fn().mockResolvedValue([]) },
      auditLog: { findMany: vi.fn().mockResolvedValue([{ id: 'history-1', action: 'REVIEW', summary: '既有记录', actorUser: { name: '历史作者' }, nodeCode: null, metadata: {}, createdAt: at }]) },
      user: { findMany }, department: { findMany: departmentFind } };
    const service = new R26ReadModelService(prisma as never, {} as never,
      { getProjectDetail: vi.fn().mockResolvedValue({ ...project(), members: [{ id: 'member-1', userId: actor.id, name: '档案新姓名', departmentName: '新部门', memberType: ProjectMemberType.OWNER, title: null, isPrimary: true }] }),
        getProjectFlowMap: vi.fn().mockResolvedValue({ currentStepCode: null, currentDepartment: null, nodes: [] }) } as never, {} as never);
    const result = await service.getWorkspace('project-1', actor);
    expect(result.organization.users).toEqual([{ id: actor.id, name: '档案新姓名', departmentId: 'new-dept', departmentName: '新部门', isProjectMember: true }]);
    expect(result.organization.departments).toEqual([{ id: 'new-dept', code: 'NEW', name: '新部门', activeUserCount: 1 }]);
    expect(result.projectRecords[0]?.actorName).toBe('历史作者');
    expect(findMany.mock.calls[0]?.[0].where).not.toHaveProperty('personProfile');
    expect(findMany.mock.calls[0]?.[0].select.personProfile).toEqual({ select: PERSON_PRESENTATION_SELECT });
  });
});
