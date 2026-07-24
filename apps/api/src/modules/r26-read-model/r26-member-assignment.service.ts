import { createHash } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditTargetType,
  Prisma,
  ProjectAssignmentSource,
  ProjectMemberType,
  UserStatus,
  WorkflowNodeCode,
  WorkflowTaskStatus,
} from '@prisma/client';

import { PrismaService } from '../../infra/prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  buildR26AssignmentPreview,
  parseAssignmentSource,
  type R26AssignmentPreview,
  type R26AssignmentTask,
  type R26DirectoryDepartment,
  type R26DirectoryUser,
  type R26NodeAssignmentConfig,
  type R26ProjectMemberRow,
} from './r26-assignment.resolver';
import {
  type R26ApplyAssignmentsDto,
  type R26AssignmentPreviewDto,
  type R26AssignmentScope,
  type R26MemberDraftDto,
  type R26RemoveMemberDto,
  type R26TransferTaskDto,
  type R26UpsertMemberDto,
  type R26VersionedCommandDto,
} from './dto/r26-member-assignment.dto';

type Gate3DbClient = Prisma.TransactionClient | PrismaService;

type AssignmentState = Awaited<
  ReturnType<R26MemberAssignmentService['loadAssignmentState']>
>;

const PENDING_TASK_STATUSES = new Set<WorkflowTaskStatus>([
  WorkflowTaskStatus.PENDING,
  WorkflowTaskStatus.READY,
]);

const ACTIVE_ASSIGNMENT_STATUSES = [
  WorkflowTaskStatus.PENDING,
  WorkflowTaskStatus.READY,
  WorkflowTaskStatus.IN_PROGRESS,
] as const;

@Injectable()
export class R26MemberAssignmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLogsService: ActivityLogsService,
  ) {}

  async previewAssignments(
    projectId: string,
    input: R26AssignmentPreviewDto,
    actor: AuthenticatedUser,
  ) {
    await this.assertCanManage(this.prisma, projectId, actor);
    const state = await this.loadAssignmentState(this.prisma, projectId);
    const proposedMembers = input.memberChange
      ? await this.applyMemberDraftToPreview(state, input.memberChange)
      : state.projectMembers;
    const previewState = this.buildPreviewState(
      state,
      proposedMembers,
      input,
    );
    const assignments = input.taskTransfer
      ? this.resolveAssignments(previewState, proposedMembers)
      : Object.values(WorkflowNodeCode).map((nodeCode) =>
          this.resolveAssignmentForFuture(
            previewState,
            proposedMembers,
            nodeCode,
          ),
        );
    const selectedNodeCodes = new Set(
      input.nodeCodes?.length ? input.nodeCodes : Object.values(WorkflowNodeCode),
    );
    const selected = assignments.filter((assignment) =>
      selectedNodeCodes.has(assignment.nodeCode),
    );
    const confirmedInProgress = new Set(
      input.confirmedInProgressTaskIds ?? [],
    );
    const items = selected.map((assignment) =>
      this.toImpactItem(
        assignment,
        input.scope,
        confirmedInProgress,
        input.memberChange ?? null,
        state,
      ),
    );
    const conflicts = [
      ...new Set(items.flatMap((item) => item.conflicts)),
    ];

    return {
      dataSource: 'database',
      writePerformed: false,
      projectId,
      expectedVersion: state.project.memberAssignmentVersion,
      applicationScope: input.scope,
      memberChange: input.memberChange ?? null,
      taskTransfer: input.taskTransfer ?? null,
      summary: {
        nodeCount: items.length,
        futureAssignmentCount: items.filter((item) => item.applyToFuture).length,
        pendingTaskCount: items.filter((item) => item.applyToPendingTask).length,
        inProgressTaskCount: items.filter((item) => item.requiresInProgressConfirmation)
          .length,
        blockedCount: items.filter((item) => item.blocked).length,
      },
      conflicts,
      canApply: conflicts.length === 0,
      items,
    };
  }

  addMember(
    projectId: string,
    input: R26UpsertMemberDto,
    actor: AuthenticatedUser,
    requestId: string,
  ) {
    return this.upsertMember(projectId, input, actor, requestId, 'ADD');
  }

  updateMember(
    projectId: string,
    userId: string,
    input: R26UpsertMemberDto,
    actor: AuthenticatedUser,
    requestId: string,
  ) {
    if (input.userId !== userId) {
      throw new BadRequestException('路径成员与请求成员不一致。');
    }
    return this.upsertMember(projectId, input, actor, requestId, 'UPDATE');
  }

  removeMember(
    projectId: string,
    userId: string,
    input: R26RemoveMemberDto,
    actor: AuthenticatedUser,
    requestId: string,
  ) {
    if (!input.reason?.trim()) {
      throw new BadRequestException('移出项目成员必须填写原因。');
    }
    if (input.transferToUserId === userId) {
      throw new BadRequestException('活跃任务不能转交给待移出的成员本人。');
    }
    if (input.replacementOwnerUserId === userId) {
      throw new BadRequestException('新的项目负责人不能是待移出的成员本人。');
    }

    return this.executeVersionedCommand({
      projectId,
      action: 'R26_PROJECT_MEMBER_REMOVED',
      input,
      actor,
      requestId,
      execute: async (tx, project) => {
        const memberRows = await tx.projectMember.findMany({
          where: { projectId, userId },
          include: { user: { include: { department: true } } },
        });

        if (memberRows.length === 0) {
          throw new NotFoundException('该用户不是当前项目成员。');
        }

        const activeTasks = await tx.workflowTask.findMany({
          where: {
            projectId,
            isActive: true,
            assigneeUserId: userId,
            status: { in: [...ACTIVE_ASSIGNMENT_STATUSES] },
          },
          select: {
            id: true,
            nodeCode: true,
            nodeName: true,
            status: true,
            assigneeUserId: true,
            assigneeDepartmentId: true,
            payload: true,
          },
        });
        const confirmedInProgress = new Set(
          input.confirmedInProgressTaskIds ?? [],
        );
        const unconfirmed = activeTasks.filter(
          (task) =>
            task.status === WorkflowTaskStatus.IN_PROGRESS &&
            !confirmedInProgress.has(task.id),
        );

        if (activeTasks.length > 0 && !input.transferToUserId) {
          throw new ConflictException({
            code: 'ACTIVE_TASK_TRANSFER_REQUIRED',
            message: '该成员仍有活跃任务，必须先选择转交人员。',
            affectedTaskIds: activeTasks.map((task) => task.id),
          });
        }
        if (unconfirmed.length > 0) {
          throw new ConflictException({
            code: 'IN_PROGRESS_CONFIRMATION_REQUIRED',
            message: '进行中任务必须逐项确认后才能转交。',
            affectedTaskIds: unconfirmed.map((task) => task.id),
          });
        }

        const transferUser = input.transferToUserId
          ? await this.getActiveProjectMemberUser(
              tx,
              projectId,
              input.transferToUserId,
            )
          : null;

        if (project.ownerUserId === userId) {
          if (!input.replacementOwnerUserId) {
            throw new ConflictException({
              code: 'PROJECT_OWNER_REPLACEMENT_REQUIRED',
              message: '项目负责人移出前必须指定新的项目负责人。',
            });
          }
          const replacementOwner = await this.getActiveProjectMemberUser(
            tx,
            projectId,
            input.replacementOwnerUserId,
          );
          await tx.project.update({
            where: { id: projectId },
            data: {
              ownerUserId: replacementOwner.id,
              owningDepartmentId:
                replacementOwner.departmentId ?? project.owningDepartmentId,
            },
          });
          await tx.projectMember.deleteMany({
            where: {
              projectId,
              memberType: ProjectMemberType.OWNER,
              userId: { not: replacementOwner.id },
            },
          });
          await tx.projectMember.upsert({
            where: {
              projectId_userId_memberType: {
                projectId,
                userId: replacementOwner.id,
                memberType: ProjectMemberType.OWNER,
              },
            },
            create: {
              projectId,
              userId: replacementOwner.id,
              memberType: ProjectMemberType.OWNER,
              title: '项目负责人',
              isPrimary: true,
            },
            update: {
              title: '项目负责人',
              isPrimary: true,
            },
          });
        }

        const changedTasks = [];
        for (const task of activeTasks) {
          if (!transferUser) {
            continue;
          }
          const updated = await tx.workflowTask.update({
            where: { id: task.id },
            data: {
              assigneeUserId: transferUser.id,
              assigneeDepartmentId: transferUser.departmentId,
              payload: this.mergeTaskPayload(task.payload, {
                assignmentSource: ProjectAssignmentSource.TASK_OVERRIDE,
                assignmentReason: input.reason?.trim() ?? null,
                assignmentRequestId: requestId,
              }),
            },
          });
          changedTasks.push({
            taskId: task.id,
            nodeCode: task.nodeCode,
            beforeOwnerUserId: userId,
            afterOwnerUserId: updated.assigneeUserId,
          });
        }

        await tx.projectNodeAssignment.updateMany({
          where: { projectId, ownerUserId: userId },
          data: transferUser
            ? {
                ownerUserId: transferUser.id,
                primaryDepartmentId: transferUser.departmentId,
                assignmentSource: ProjectAssignmentSource.PROJECT_NODE_OVERRIDE,
                updatedById: actor.id,
                version: { increment: 1 },
              }
            : {
                ownerUserId: null,
                assignmentSource: ProjectAssignmentSource.UNASSIGNED,
                updatedById: actor.id,
                version: { increment: 1 },
              },
        });

        await tx.projectMember.deleteMany({
          where: { projectId, userId },
        });

        const audit = await this.activityLogsService.createWithExecutor(tx, {
          projectId,
          actorUserId: actor.id,
          targetType: AuditTargetType.PROJECT,
          targetId: projectId,
          action: 'R26_PROJECT_MEMBER_REMOVED',
          nodeCode: project.currentNodeCode,
          summary: `移出项目成员 ${memberRows[0]?.user.name ?? userId}`,
          beforeData: {
            member: this.serializeMemberRows(memberRows),
            activeTasks: activeTasks.map((task) => ({
              taskId: task.id,
              nodeCode: task.nodeCode,
              status: task.status,
            })),
          },
          afterData: {
            removedUserId: userId,
            transferToUserId: transferUser?.id ?? null,
            changedTasks,
          },
          metadata: {
            requestId,
            idempotencyKey: input.idempotencyKey,
            expectedVersion: input.expectedVersion,
            reason: input.reason?.trim() ?? null,
            result: 'SUCCESS',
          },
        });

        return {
          auditLogIds: [audit.id],
          affectedTaskIds: changedTasks.map((task) => task.taskId),
          memberUserId: userId,
          transferToUserId: transferUser?.id ?? null,
        };
      },
    });
  }

  applyAssignments(
    projectId: string,
    input: R26ApplyAssignmentsDto,
    actor: AuthenticatedUser,
    requestId: string,
  ) {
    return this.executeVersionedCommand({
      projectId,
      action: 'R26_PROJECT_ASSIGNMENTS_APPLIED',
      input,
      actor,
      requestId,
      execute: async (tx, project) => {
        const state = await this.loadAssignmentState(tx, projectId);
        const assignments = this.resolveAssignments(state, state.projectMembers);
        const selectedNodeCodes = new Set(
          input.nodeCodes?.length
            ? input.nodeCodes
            : Object.values(WorkflowNodeCode),
        );
        const confirmedInProgress = new Set(
          input.confirmedInProgressTaskIds ?? [],
        );
        const selected = assignments.filter((assignment) =>
          selectedNodeCodes.has(assignment.nodeCode),
        );
        const selectedInProgressTaskIds = selected.flatMap((assignment) => {
          const task = state.latestTaskByNode.get(assignment.nodeCode);
          return task?.isActive &&
            task.status === WorkflowTaskStatus.IN_PROGRESS
            ? [task.id]
            : [];
        });
        const unconfirmedInProgressTaskIds =
          input.scope === 'CONFIRM_IN_PROGRESS'
            ? selectedInProgressTaskIds.filter(
                (taskId) => !confirmedInProgress.has(taskId),
              )
            : [];
        if (
          input.scope === 'CONFIRM_IN_PROGRESS' &&
          selectedInProgressTaskIds.length > 0 &&
          !input.reason?.trim()
        ) {
          throw new BadRequestException(
            '转交进行中任务必须填写原因。',
          );
        }
        if (unconfirmedInProgressTaskIds.length > 0) {
          throw new ConflictException({
            code: 'IN_PROGRESS_CONFIRMATION_REQUIRED',
            message: '进行中任务必须逐项确认后才能应用分配。',
            affectedTaskIds: unconfirmedInProgressTaskIds,
          });
        }
        const selectedWithFuture = selected.map((assignment) => ({
          assignment,
          futureAssignment: this.resolveAssignmentForFuture(
            state,
            state.projectMembers,
            assignment.nodeCode,
          ),
        }));
        const unresolved = selectedWithFuture.filter(
          ({ futureAssignment }) =>
            !futureAssignment.suggestedOwner ||
            futureAssignment.conflicts.length > 0,
        );

        if (unresolved.length > 0) {
          throw new ConflictException({
            code: 'ASSIGNMENT_CONFLICTS_MUST_BE_RESOLVED',
            message: '存在未分配或冲突工序，不能批量应用。',
            nodes: unresolved.map(({ futureAssignment }) => ({
              nodeCode: futureAssignment.nodeCode,
              reason:
                futureAssignment.unassignedReason ??
                futureAssignment.conflicts.join('；') ??
                '负责人待分配',
            })),
          });
        }

        const changedTasks: Array<{
          taskId: string;
          nodeCode: WorkflowNodeCode;
          beforeOwnerUserId: string | null;
          afterOwnerUserId: string;
          status: WorkflowTaskStatus;
        }> = [];
        const configuredNodes: WorkflowNodeCode[] = [];

        for (const { assignment, futureAssignment } of selectedWithFuture) {
          const owner = futureAssignment.suggestedOwner;

          if (!owner) {
            continue;
          }

          await tx.projectNodeAssignment.upsert({
            where: {
              projectId_nodeCode: {
                projectId,
                nodeCode: assignment.nodeCode,
              },
            },
            create: {
              projectId,
              nodeCode: assignment.nodeCode,
              primaryDepartmentId: futureAssignment.primaryDepartment.id,
              ownerUserId: owner.id,
              collaboratorUserIds: futureAssignment.collaborators.map(
                (person) => person.id,
              ),
              reviewerUserIds: futureAssignment.reviewers.map(
                (person) => person.id,
              ),
              assignmentSource: futureAssignment.assignmentSource,
              updatedById: actor.id,
            },
            update: {
              primaryDepartmentId: futureAssignment.primaryDepartment.id,
              ownerUserId: owner.id,
              collaboratorUserIds: futureAssignment.collaborators.map(
                (person) => person.id,
              ),
              reviewerUserIds: futureAssignment.reviewers.map(
                (person) => person.id,
              ),
              assignmentSource: futureAssignment.assignmentSource,
              updatedById: actor.id,
              version: { increment: 1 },
            },
          });
          configuredNodes.push(assignment.nodeCode);

          const task = state.latestTaskByNode.get(assignment.nodeCode);
          if (!task?.isActive) {
            continue;
          }
          const appliesToPending =
            input.scope !== 'FUTURE_ONLY' &&
            PENDING_TASK_STATUSES.has(task.status);
          const appliesToInProgress =
            input.scope === 'CONFIRM_IN_PROGRESS' &&
            task.status === WorkflowTaskStatus.IN_PROGRESS &&
            confirmedInProgress.has(task.id);

          if (!appliesToPending && !appliesToInProgress) {
            continue;
          }

          const updated = await tx.workflowTask.update({
            where: { id: task.id },
            data: {
              assigneeUserId: owner.id,
              assigneeDepartmentId: futureAssignment.primaryDepartment.id,
              payload: this.mergeTaskPayload(task.payload, {
                assignmentSource: futureAssignment.assignmentSource,
                collaboratorUserIds: futureAssignment.collaborators.map(
                  (person) => person.id,
                ),
                reviewerUserIds: futureAssignment.reviewers.map(
                  (person) => person.id,
                ),
                assignmentReason: input.reason?.trim() ?? null,
                assignmentRequestId: requestId,
              }),
            },
          });
          changedTasks.push({
            taskId: task.id,
            nodeCode: task.nodeCode,
            beforeOwnerUserId: task.assigneeUserId,
            afterOwnerUserId: updated.assigneeUserId!,
            status: task.status,
          });
        }

        const audit = await this.activityLogsService.createWithExecutor(tx, {
          projectId,
          actorUserId: actor.id,
          targetType: AuditTargetType.PROJECT,
          targetId: projectId,
          action: 'R26_PROJECT_ASSIGNMENTS_APPLIED',
          nodeCode: project.currentNodeCode,
          summary: `应用 ${configuredNodes.length} 个工序的项目分配配置`,
          beforeData: {
            memberAssignmentVersion: input.expectedVersion,
          },
          afterData: {
            scope: input.scope,
            configuredNodes,
            changedTasks,
          },
          metadata: {
            requestId,
            idempotencyKey: input.idempotencyKey,
            reason: input.reason?.trim() ?? null,
            result: 'SUCCESS',
          },
        });

        return {
          auditLogIds: [audit.id],
          affectedTaskIds: changedTasks.map((task) => task.taskId),
          configuredNodeCodes: configuredNodes,
          scope: input.scope,
        };
      },
    });
  }

  transferTask(
    projectId: string,
    taskId: string,
    input: R26TransferTaskDto,
    actor: AuthenticatedUser,
    requestId: string,
  ) {
    return this.executeVersionedCommand({
      projectId,
      action: 'R26_WORKFLOW_TASK_REASSIGNED',
      input,
      actor,
      requestId,
      execute: async (tx) => {
        const task = await tx.workflowTask.findFirst({
          where: {
            id: taskId,
            projectId,
            isActive: true,
          },
        });

        if (!task) {
          throw new NotFoundException('工序任务不存在或不属于当前项目。');
        }
        if (!ACTIVE_ASSIGNMENT_STATUSES.includes(task.status as never)) {
          throw new ConflictException({
            code: 'COMPLETED_OR_HISTORICAL_TASK_IMMUTABLE',
            message: '已完成或历史工序不可重新分配。',
          });
        }
        if (
          task.status === WorkflowTaskStatus.IN_PROGRESS &&
          (!input.confirmInProgress || !input.reason?.trim())
        ) {
          throw new ConflictException({
            code: 'IN_PROGRESS_CONFIRMATION_REQUIRED',
            message: '进行中任务必须明确确认并填写转交原因。',
            affectedTaskIds: [task.id],
          });
        }
        if (task.assigneeUserId === input.newOwnerUserId) {
          throw new BadRequestException('新的负责人不能与当前负责人相同。');
        }

        const newOwner = await this.getActiveProjectMemberUser(
          tx,
          projectId,
          input.newOwnerUserId,
        );
        const updated = await tx.workflowTask.update({
          where: { id: task.id },
          data: {
            assigneeUserId: newOwner.id,
            assigneeDepartmentId: newOwner.departmentId,
            payload: this.mergeTaskPayload(task.payload, {
              assignmentSource: ProjectAssignmentSource.TASK_OVERRIDE,
              assignmentReason: input.reason?.trim() ?? null,
              assignmentRequestId: requestId,
            }),
          },
        });
        const audit = await this.activityLogsService.createWithExecutor(tx, {
          projectId,
          actorUserId: actor.id,
          targetType: AuditTargetType.WORKFLOW_TASK,
          targetId: task.id,
          action: 'R26_WORKFLOW_TASK_REASSIGNED',
          nodeCode: task.nodeCode,
          summary: `转交工序 ${task.nodeName}`,
          beforeData: {
            assigneeUserId: task.assigneeUserId,
            assigneeDepartmentId: task.assigneeDepartmentId,
            status: task.status,
          },
          afterData: {
            assigneeUserId: updated.assigneeUserId,
            assigneeDepartmentId: updated.assigneeDepartmentId,
            status: updated.status,
          },
          metadata: {
            requestId,
            idempotencyKey: input.idempotencyKey,
            reason: input.reason?.trim() ?? null,
            result: 'SUCCESS',
          },
        });

        return {
          auditLogIds: [audit.id],
          affectedTaskIds: [task.id],
          taskId: task.id,
          previousOwnerUserId: task.assigneeUserId,
          newOwnerUserId: updated.assigneeUserId,
        };
      },
    });
  }

  private upsertMember(
    projectId: string,
    input: R26UpsertMemberDto,
    actor: AuthenticatedUser,
    requestId: string,
    mode: 'ADD' | 'UPDATE',
  ) {
    if (
      (input.defaultNodeCodes?.length ?? 0) > 0 &&
      !input.memberTypes.includes(ProjectMemberType.MEMBER)
    ) {
      throw new BadRequestException('默认工序负责人必须具有项目成员职责。');
    }

    return this.executeVersionedCommand({
      projectId,
      action:
        mode === 'ADD'
          ? 'R26_PROJECT_MEMBER_ADDED'
          : 'R26_PROJECT_MEMBER_UPDATED',
      input,
      actor,
      requestId,
      execute: async (tx, project) => {
        const user = await tx.user.findFirst({
          where: { id: input.userId, status: UserStatus.ACTIVE },
          include: { department: true },
        });

        if (!user) {
          throw new BadRequestException('所选用户不存在或已停用。');
        }

        const beforeRows = await tx.projectMember.findMany({
          where: { projectId, userId: input.userId },
          include: { user: { include: { department: true } } },
        });

        if (mode === 'UPDATE' && beforeRows.length === 0) {
          throw new NotFoundException('该用户不是当前项目成员。');
        }

        if (mode === 'UPDATE') {
          await tx.projectMember.deleteMany({
            where: {
              projectId,
              userId: input.userId,
              memberType: { notIn: input.memberTypes },
            },
          });
        }

        if (input.memberTypes.includes(ProjectMemberType.OWNER)) {
          await tx.project.update({
            where: { id: projectId },
            data: {
              ownerUserId: user.id,
              owningDepartmentId: user.departmentId ?? project.owningDepartmentId,
            },
          });
          await tx.projectMember.deleteMany({
            where: {
              projectId,
              memberType: ProjectMemberType.OWNER,
              userId: { not: user.id },
            },
          });
        } else if (project.ownerUserId === user.id) {
          throw new ConflictException({
            code: 'PROJECT_OWNER_ROLE_REQUIRED',
            message: '当前项目负责人必须保留项目负责人职责。',
          });
        }

        if (user.departmentId && input.isDepartmentLead) {
          const competingManagerRows = await tx.projectMember.findMany({
            where: {
              projectId,
              memberType: ProjectMemberType.MANAGER,
              isPrimary: true,
              user: {
                departmentId: user.departmentId,
              },
              userId: { not: user.id },
            },
            select: { id: true },
          });
          await tx.projectMember.updateMany({
            where: { id: { in: competingManagerRows.map((row) => row.id) } },
            data: { isPrimary: false },
          });
        }

        if (user.departmentId && input.isDefaultExecutor) {
          const competingExecutorRows = await tx.projectMember.findMany({
            where: {
              projectId,
              memberType: ProjectMemberType.MEMBER,
              isPrimary: true,
              user: {
                departmentId: user.departmentId,
              },
              userId: { not: user.id },
            },
            select: { id: true },
          });
          await tx.projectMember.updateMany({
            where: { id: { in: competingExecutorRows.map((row) => row.id) } },
            data: { isPrimary: false },
          });
        }

        for (const memberType of input.memberTypes) {
          const isPrimary =
            memberType === ProjectMemberType.OWNER ||
            (memberType === ProjectMemberType.MANAGER &&
              input.isDepartmentLead === true) ||
            (memberType === ProjectMemberType.MEMBER &&
              input.isDefaultExecutor === true);
          await tx.projectMember.upsert({
            where: {
              projectId_userId_memberType: {
                projectId,
                userId: user.id,
                memberType,
              },
            },
            create: {
              projectId,
              userId: user.id,
              memberType,
              title: input.responsibility?.trim() || null,
              isPrimary,
            },
            update: {
              title: input.responsibility?.trim() || null,
              isPrimary,
            },
          });
        }

        if (input.defaultNodeCodes) {
          await tx.projectNodeAssignment.deleteMany({
            where: {
              projectId,
              ownerUserId: user.id,
              assignmentSource:
                ProjectAssignmentSource.PROJECT_DEFAULT_ASSIGNEE,
              nodeCode: { notIn: input.defaultNodeCodes },
            },
          });

          for (const nodeCode of input.defaultNodeCodes) {
            await tx.projectNodeAssignment.upsert({
              where: {
                projectId_nodeCode: { projectId, nodeCode },
              },
              create: {
                projectId,
                nodeCode,
                primaryDepartmentId: user.departmentId,
                ownerUserId: user.id,
                collaboratorUserIds: [],
                reviewerUserIds: [],
                assignmentSource:
                  ProjectAssignmentSource.PROJECT_DEFAULT_ASSIGNEE,
                updatedById: actor.id,
              },
              update: {
                primaryDepartmentId: user.departmentId,
                ownerUserId: user.id,
                assignmentSource:
                  ProjectAssignmentSource.PROJECT_DEFAULT_ASSIGNEE,
                updatedById: actor.id,
                version: { increment: 1 },
              },
            });
          }
        }

        const afterRows = await tx.projectMember.findMany({
          where: { projectId, userId: user.id },
          include: { user: { include: { department: true } } },
        });
        const action =
          mode === 'ADD'
            ? 'R26_PROJECT_MEMBER_ADDED'
            : 'R26_PROJECT_MEMBER_UPDATED';
        const audit = await this.activityLogsService.createWithExecutor(tx, {
          projectId,
          actorUserId: actor.id,
          targetType: AuditTargetType.PROJECT,
          targetId: projectId,
          action,
          nodeCode: project.currentNodeCode,
          summary:
            mode === 'ADD'
              ? `添加项目成员 ${user.name}`
              : `更新项目成员 ${user.name} 的职责`,
          beforeData: {
            member: this.serializeMemberRows(beforeRows),
          },
          afterData: {
            member: this.serializeMemberRows(afterRows),
            defaultNodeCodes: input.defaultNodeCodes ?? [],
          },
          metadata: {
            requestId,
            idempotencyKey: input.idempotencyKey,
            expectedVersion: input.expectedVersion,
            reason: input.reason?.trim() ?? null,
            result: 'SUCCESS',
          },
        });

        return {
          auditLogIds: [audit.id],
          affectedTaskIds: [],
          memberUserId: user.id,
          memberName: user.name,
          memberTypes: input.memberTypes,
        };
      },
    });
  }

  private async executeVersionedCommand<T extends Record<string, unknown>>(input: {
    projectId: string;
    action: string;
    input: R26VersionedCommandDto;
    actor: AuthenticatedUser;
    requestId: string;
    execute: (
      tx: Prisma.TransactionClient,
      project: {
        id: string;
        name: string;
        ownerUserId: string | null;
        owningDepartmentId: string | null;
        currentNodeCode: WorkflowNodeCode | null;
        memberAssignmentVersion: number;
      },
    ) => Promise<T>;
  }) {
    const requestHash = this.hashRequest({
      projectId: input.projectId,
      action: input.action,
      actorUserId: input.actor.id,
      body: input.input,
    });
    const existing = await this.prisma.r26CommandRequest.findUnique({
      where: { idempotencyKey: input.input.idempotencyKey },
    });

    if (existing) {
      return this.replayCommand(existing, input, requestHash);
    }

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const project = await this.assertCanManage(
            tx,
            input.projectId,
            input.actor,
          );
          const duplicate = await tx.r26CommandRequest.findUnique({
            where: { idempotencyKey: input.input.idempotencyKey },
          });
          if (duplicate) {
            return this.replayCommand(duplicate, input, requestHash);
          }

          const locked = await tx.project.updateMany({
            where: {
              id: input.projectId,
              memberAssignmentVersion: input.input.expectedVersion,
            },
            data: {
              memberAssignmentVersion: { increment: 1 },
            },
          });

          if (locked.count !== 1) {
            const current = await tx.project.findUnique({
              where: { id: input.projectId },
              select: { memberAssignmentVersion: true },
            });
            throw new ConflictException({
              code: 'STALE_MEMBER_ASSIGNMENT_VERSION',
              message: '成员与分工已被其他管理员更新，请刷新后重试。',
              expectedVersion: input.input.expectedVersion,
              currentVersion: current?.memberAssignmentVersion ?? null,
            });
          }

          const result = await input.execute(tx, project);
          const commandResult = {
            action: input.action,
            requestId: input.requestId,
            idempotencyKey: input.input.idempotencyKey,
            idempotentReplay: false,
            previousVersion: input.input.expectedVersion,
            memberAssignmentVersion: input.input.expectedVersion + 1,
            ...result,
          };
          await tx.r26CommandRequest.create({
            data: {
              projectId: input.projectId,
              actorUserId: input.actor.id,
              idempotencyKey: input.input.idempotencyKey,
              action: input.action,
              requestHash,
              result: commandResult as Prisma.InputJsonValue,
            },
          });
          return commandResult;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        const duplicate = await this.prisma.r26CommandRequest.findUnique({
          where: { idempotencyKey: input.input.idempotencyKey },
        });
        if (duplicate) {
          return this.replayCommand(duplicate, input, requestHash);
        }
      }
      if (this.isSerializableWriteConflict(error)) {
        throw new ConflictException({
          code: 'CONCURRENT_MEMBER_ASSIGNMENT_UPDATE',
          message: '成员与分工正在被其他管理员更新，请刷新后重试。',
        });
      }
      throw error;
    }
  }

  private replayCommand(
    existing: {
      projectId: string;
      actorUserId: string | null;
      action: string;
      requestHash: string;
      result: Prisma.JsonValue | null;
    },
    input: {
      projectId: string;
      action: string;
      actor: AuthenticatedUser;
    },
    requestHash: string,
  ) {
    if (
      existing.projectId !== input.projectId ||
      existing.actorUserId !== input.actor.id ||
      existing.action !== input.action ||
      existing.requestHash !== requestHash
    ) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST',
        message: '幂等键已被其他请求使用，请生成新的幂等键。',
      });
    }

    const result =
      existing.result && typeof existing.result === 'object'
        ? (existing.result as Record<string, unknown>)
        : {};
    return {
      ...result,
      idempotentReplay: true,
    };
  }

  private async assertCanManage(
    db: Gate3DbClient,
    projectId: string,
    actor: AuthenticatedUser,
  ) {
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
        ownerUserId: true,
        owningDepartmentId: true,
        currentNodeCode: true,
        memberAssignmentVersion: true,
      },
    });

    if (!project) {
      throw new NotFoundException('项目不存在。');
    }

    const isAdmin =
      actor.isSystemAdmin || actor.roleCodes.includes('admin');
    const isAuthorizedOwner =
      project.ownerUserId === actor.id &&
      (actor.roleCodes.includes('project_manager') ||
        (actor.permissionCodes ?? []).includes('project.write'));

    if (!isAdmin && !isAuthorizedOwner) {
      throw new ForbiddenException(
        '只有系统管理员或该项目负责人可以管理成员与分工。',
      );
    }

    return project;
  }

  private async loadAssignmentState(db: Gate3DbClient, projectId: string) {
    const [project, departments, users, tasks, nodeAssignments] =
      await Promise.all([
        db.project.findUnique({
          where: { id: projectId },
          select: {
            id: true,
            name: true,
            ownerUserId: true,
            owningDepartmentId: true,
            currentNodeCode: true,
            memberAssignmentVersion: true,
            members: {
              include: {
                user: {
                  include: { department: true },
                },
              },
              orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
            },
          },
        }),
        db.department.findMany({
          where: { isActive: true },
          select: { id: true, code: true, name: true, path: true },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        }),
        db.user.findMany({
          where: { status: UserStatus.ACTIVE },
          select: {
            id: true,
            name: true,
            departmentId: true,
            department: { select: { name: true } },
          },
          orderBy: [{ name: 'asc' }],
        }),
        db.workflowTask.findMany({
          where: { projectId },
          select: {
            id: true,
            nodeCode: true,
            nodeName: true,
            taskRound: true,
            status: true,
            isActive: true,
            assigneeUserId: true,
            assigneeDepartmentId: true,
            payload: true,
            assigneeUser: {
              select: {
                id: true,
                name: true,
                departmentId: true,
                department: { select: { name: true } },
              },
            },
            createdAt: true,
          },
          orderBy: [{ taskRound: 'desc' }, { createdAt: 'desc' }],
        }),
        db.projectNodeAssignment.findMany({
          where: { projectId },
        }),
      ]);

    if (!project) {
      throw new NotFoundException('项目不存在。');
    }

    const directoryDepartments: R26DirectoryDepartment[] = departments;
    const directoryUsers: R26DirectoryUser[] = users.map((user) => ({
      id: user.id,
      name: user.name,
      departmentId: user.departmentId,
      departmentName: user.department?.name ?? null,
    }));
    const projectMembers: R26ProjectMemberRow[] = project.members.map(
      (member) => ({
        id: member.id,
        userId: member.userId,
        name: member.user.name,
        departmentName: member.user.department?.name ?? null,
        memberType: member.memberType,
        title: member.title,
        isPrimary: member.isPrimary,
      }),
    );
    const latestTaskByNode = new Map<WorkflowNodeCode, (typeof tasks)[number]>();
    for (const task of tasks) {
      const current = latestTaskByNode.get(task.nodeCode);
      if (
        !current ||
        task.taskRound > current.taskRound ||
        (task.taskRound === current.taskRound &&
          task.createdAt > current.createdAt)
      ) {
        latestTaskByNode.set(task.nodeCode, task);
      }
    }
    const assignmentByNode = new Map<WorkflowNodeCode, R26NodeAssignmentConfig>(
      nodeAssignments.map((assignment) => [
        assignment.nodeCode,
        {
          nodeCode: assignment.nodeCode,
          primaryDepartmentId: assignment.primaryDepartmentId,
          ownerUserId: assignment.ownerUserId,
          collaboratorUserIds: this.parseUserIdList(
            assignment.collaboratorUserIds,
          ),
          reviewerUserIds: this.parseUserIdList(assignment.reviewerUserIds),
          assignmentSource: assignment.assignmentSource,
        },
      ]),
    );

    return {
      project,
      projectMembers,
      departments: directoryDepartments,
      users: directoryUsers,
      latestTaskByNode,
      assignmentByNode,
    };
  }

  private resolveAssignments(
    state: AssignmentState,
    projectMembers: R26ProjectMemberRow[],
  ) {
    return Object.values(WorkflowNodeCode).map((nodeCode) => {
      const task = state.latestTaskByNode.get(nodeCode) ?? null;
      return buildR26AssignmentPreview({
        nodeCode,
        task: task ? this.toResolverTask(task) : null,
        nodeAssignment: state.assignmentByNode.get(nodeCode) ?? null,
        projectMembers,
        departments: state.departments,
        users: state.users,
      });
    });
  }

  private resolveAssignmentForFuture(
    state: AssignmentState,
    projectMembers: R26ProjectMemberRow[],
    nodeCode: WorkflowNodeCode,
  ) {
    return buildR26AssignmentPreview({
      nodeCode,
      task: null,
      nodeAssignment: state.assignmentByNode.get(nodeCode) ?? null,
      projectMembers,
      departments: state.departments,
      users: state.users,
    });
  }

  private toResolverTask(
    task: AssignmentState['latestTaskByNode'] extends Map<
      WorkflowNodeCode,
      infer T
    >
      ? T
      : never,
  ): R26AssignmentTask {
    const payload =
      task.payload && typeof task.payload === 'object'
        ? (task.payload as Record<string, unknown>)
        : null;
    return {
      id: task.id,
      nodeName: task.nodeName,
      status: task.status,
      isActive: task.isActive,
      assigneeUserId: task.assigneeUserId,
      assigneeDepartmentId: task.assigneeDepartmentId,
      assignmentSource: parseAssignmentSource(payload?.assignmentSource),
      assigneeUser: task.assigneeUser,
    };
  }

  private async applyMemberDraftToPreview(
    state: AssignmentState,
    draft: R26MemberDraftDto,
  ) {
    const user = state.users.find((item) => item.id === draft.userId);
    if (!user) {
      throw new BadRequestException('所选用户不存在或已停用。');
    }
    const currentRows = state.projectMembers.filter(
      (member) => member.userId !== draft.userId,
    );
    if (draft.type === 'REMOVE') {
      return currentRows;
    }
    const memberTypes = draft.memberTypes ?? [];
    if (memberTypes.length === 0) {
      throw new BadRequestException('至少选择一项项目职责。');
    }

    return [
      ...currentRows,
      ...memberTypes.map((memberType) => ({
        id: `preview:${draft.userId}:${memberType}`,
        userId: draft.userId,
        name: user.name,
        departmentName: user.departmentName,
        memberType,
        title: draft.responsibility?.trim() || null,
        isPrimary:
          memberType === ProjectMemberType.OWNER ||
          (memberType === ProjectMemberType.MANAGER &&
            draft.isDepartmentLead === true) ||
          (memberType === ProjectMemberType.MEMBER &&
            draft.isDefaultExecutor === true),
      })),
    ].map((member, index) => ({
      ...member,
      id: member.id || `preview:${index}`,
    }));
  }

  private buildPreviewState(
    state: AssignmentState,
    proposedMembers: R26ProjectMemberRow[],
    input: R26AssignmentPreviewDto,
  ): AssignmentState {
    const latestTaskByNode = new Map(state.latestTaskByNode);
    const assignmentByNode = new Map(state.assignmentByNode);
    const memberChange = input.memberChange;

    if (
      memberChange &&
      memberChange.type !== 'REMOVE' &&
      memberChange.defaultNodeCodes
    ) {
      for (const [nodeCode, assignment] of assignmentByNode) {
        if (
          assignment.ownerUserId === memberChange.userId &&
          assignment.assignmentSource ===
            ProjectAssignmentSource.PROJECT_DEFAULT_ASSIGNEE &&
          !memberChange.defaultNodeCodes.includes(nodeCode)
        ) {
          assignmentByNode.delete(nodeCode);
        }
      }
      const user = state.users.find(
        (item) => item.id === memberChange.userId,
      );
      for (const nodeCode of memberChange.defaultNodeCodes) {
        assignmentByNode.set(nodeCode, {
          nodeCode,
          primaryDepartmentId: user?.departmentId ?? null,
          ownerUserId: memberChange.userId,
          collaboratorUserIds: [],
          reviewerUserIds: [],
          assignmentSource:
            ProjectAssignmentSource.PROJECT_DEFAULT_ASSIGNEE,
        });
      }
    }

    if (memberChange?.type === 'REMOVE' && memberChange.transferToUserId) {
      const transferUser = state.users.find(
        (item) => item.id === memberChange.transferToUserId,
      );
      const isProjectMember = proposedMembers.some(
        (member) => member.userId === memberChange.transferToUserId,
      );
      if (!transferUser || !isProjectMember) {
        throw new BadRequestException(
          '转交人员必须是当前有效项目成员。',
        );
      }
      for (const [nodeCode, task] of latestTaskByNode) {
        if (
          task.assigneeUserId === memberChange.userId &&
          task.isActive &&
          ACTIVE_ASSIGNMENT_STATUSES.includes(task.status as never)
        ) {
          latestTaskByNode.set(nodeCode, {
            ...task,
            assigneeUserId: transferUser.id,
            assigneeDepartmentId: transferUser.departmentId,
            assigneeUser: {
              id: transferUser.id,
              name: transferUser.name,
              departmentId: transferUser.departmentId,
              department: transferUser.departmentName
                ? { name: transferUser.departmentName }
                : null,
            },
          });
        }
      }
      for (const [nodeCode, assignment] of assignmentByNode) {
        if (assignment.ownerUserId === memberChange.userId) {
          assignmentByNode.set(nodeCode, {
            ...assignment,
            ownerUserId: transferUser.id,
            primaryDepartmentId: transferUser.departmentId,
            assignmentSource:
              ProjectAssignmentSource.PROJECT_NODE_OVERRIDE,
          });
        }
      }
    }

    if (input.taskTransfer) {
      const transferUser = state.users.find(
        (item) => item.id === input.taskTransfer!.newOwnerUserId,
      );
      const isProjectMember = proposedMembers.some(
        (member) => member.userId === input.taskTransfer!.newOwnerUserId,
      );
      if (!transferUser || !isProjectMember) {
        throw new BadRequestException(
          '转交人员必须是当前有效项目成员。',
        );
      }
      const taskEntry = [...latestTaskByNode.entries()].find(
        ([, task]) => task.id === input.taskTransfer!.taskId,
      );
      if (!taskEntry) {
        throw new NotFoundException('工序任务不存在或不属于当前项目。');
      }
      const [nodeCode, task] = taskEntry;
      latestTaskByNode.set(nodeCode, {
        ...task,
        assigneeUserId: transferUser.id,
        assigneeDepartmentId: transferUser.departmentId,
        assigneeUser: {
          id: transferUser.id,
          name: transferUser.name,
          departmentId: transferUser.departmentId,
          department: transferUser.departmentName
            ? { name: transferUser.departmentName }
            : null,
        },
      });
    }

    return {
      ...state,
      latestTaskByNode,
      assignmentByNode,
    };
  }

  private toImpactItem(
    assignment: R26AssignmentPreview,
    scope: R26AssignmentScope,
    confirmedInProgress: Set<string>,
    memberChange: R26MemberDraftDto | null,
    state: AssignmentState,
  ) {
    const task = state.latestTaskByNode.get(assignment.nodeCode) ?? null;
    const conflicts = [...assignment.conflicts];
    const isMemberRemoval =
      memberChange?.type === 'REMOVE' &&
      task?.assigneeUserId === memberChange.userId &&
      task.isActive &&
      ACTIVE_ASSIGNMENT_STATUSES.includes(task.status as never);

    if (isMemberRemoval && !memberChange.transferToUserId) {
      conflicts.push(`${assignment.stepName}仍由待移出成员负责，必须指定转交人。`);
    }
    const requiresInProgressConfirmation =
      task?.isActive === true &&
      task.status === WorkflowTaskStatus.IN_PROGRESS &&
      scope === 'CONFIRM_IN_PROGRESS' &&
      (memberChange?.type === 'REMOVE' ? isMemberRemoval : true);
    if (
      requiresInProgressConfirmation &&
      !confirmedInProgress.has(task.id)
    ) {
      conflicts.push(`${assignment.stepName}正在进行，必须逐项确认转交。`);
    }

    return {
      ...assignment,
      taskId: task?.id ?? assignment.taskId,
      taskStatus: task?.status ?? assignment.taskStatus,
      affectedTaskIds:
        task?.isActive &&
        ACTIVE_ASSIGNMENT_STATUSES.includes(task.status as never)
          ? [task.id]
          : [],
      applicationScope: scope,
      applyToFuture: assignment.suggestedOwner !== null,
      applyToPendingTask:
        task?.isActive === true &&
        scope !== 'FUTURE_ONLY' &&
        PENDING_TASK_STATUSES.has(task.status),
      requiresInProgressConfirmation,
      completedOrHistoricalProtected:
        Boolean(task) &&
        (!task!.isActive ||
          !ACTIVE_ASSIGNMENT_STATUSES.includes(task!.status as never)),
      blocked: conflicts.length > 0 || assignment.suggestedOwner === null,
      conflicts,
    };
  }

  private async getActiveProjectMemberUser(
    tx: Prisma.TransactionClient,
    projectId: string,
    userId: string,
  ) {
    const user = await tx.user.findFirst({
      where: {
        id: userId,
        status: UserStatus.ACTIVE,
        projectMembers: {
          some: { projectId },
        },
      },
      include: { department: true },
    });
    if (!user) {
      throw new BadRequestException('转交人员必须是当前有效项目成员。');
    }
    return user;
  }

  private serializeMemberRows(
    rows: Array<{
      userId: string;
      memberType: ProjectMemberType;
      title: string | null;
      isPrimary: boolean;
      user: {
        name: string;
        department?: { name: string } | null;
      };
    }>,
  ) {
    return rows.map((row) => ({
      userId: row.userId,
      userName: row.user.name,
      departmentName: row.user.department?.name ?? null,
      memberType: row.memberType,
      title: row.title,
      isPrimary: row.isPrimary,
    }));
  }

  private mergeTaskPayload(
    payload: Prisma.JsonValue | null,
    patch: Record<string, Prisma.JsonValue>,
  ): Prisma.InputJsonValue {
    const current =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? payload
        : {};
    return {
      ...current,
      ...patch,
    } as Prisma.InputJsonObject;
  }

  private parseUserIdList(value: unknown) {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  }

  private hashRequest(value: unknown) {
    return createHash('sha256')
      .update(this.stableSerialize(value))
      .digest('hex');
  }

  private stableSerialize(value: unknown): string {
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableSerialize(item)).join(',')}]`;
    }
    if (value && typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>).sort(
        ([left], [right]) => left.localeCompare(right),
      );
      return `{${entries
        .map(
          ([key, item]) =>
            `${JSON.stringify(key)}:${this.stableSerialize(item)}`,
        )
        .join(',')}}`;
    }
    return JSON.stringify(value);
  }

  private isUniqueConstraintError(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  private isSerializableWriteConflict(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2034'
    );
  }
}
