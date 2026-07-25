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
  TaskBlockerStatus,
  WorkflowAction,
  WorkflowInstanceStatus,
  WorkflowNodeCode,
} from '@prisma/client';

import { PrismaService } from '../../infra/prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ProjectAccessService } from '../auth/project-access.service';
import {
  getWorkflowNextTaskTemplates,
  getWorkflowNodeMeta,
} from '../workflows/workflow-node.constants';
import {
  type WorkflowResolvedAssignment,
  WorkflowsService,
} from '../workflows/workflows.service';
import type {
  R26CompleteOrdinaryTaskDto,
  R26CompletionPreviewDto,
  R26ResolveTaskBlockerDto,
} from './dto/r26-ordinary-completion.dto';
import { R26MemberAssignmentService } from './r26-member-assignment.service';

type Gate3C1DbClient = Prisma.TransactionClient | PrismaService;
type Gate3C1Task = Awaited<
  ReturnType<R26OrdinaryCompletionService['loadTaskWithExecutor']>
>;

const GATE3C1_NODE_CODES = new Set<WorkflowNodeCode>([
  WorkflowNodeCode.PROJECT_INITIATION,
  WorkflowNodeCode.DEVELOPMENT_REPORT,
  WorkflowNodeCode.PAINT_DEVELOPMENT,
  WorkflowNodeCode.SAMPLE_COLOR_CONFIRMATION,
  WorkflowNodeCode.COLOR_NUMBERING,
  WorkflowNodeCode.PAINT_PROCUREMENT,
  WorkflowNodeCode.STANDARD_BOARD_PRODUCTION,
  WorkflowNodeCode.BOARD_DETAIL_UPDATE,
  WorkflowNodeCode.PERFORMANCE_TEST,
  WorkflowNodeCode.FIRST_UNIT_PRODUCTION_PLAN,
  WorkflowNodeCode.TRIAL_PRODUCTION,
]);

const COMPLETE_ACTION = 'R26_ORDINARY_TASK_COMPLETED';
const RESOLVE_BLOCKER_ACTION = 'R26_TASK_BLOCKER_RESOLVED';

@Injectable()
export class R26OrdinaryCompletionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectAccessService: ProjectAccessService,
    private readonly memberAssignmentService: R26MemberAssignmentService,
    private readonly workflowsService: WorkflowsService,
    private readonly activityLogsService: ActivityLogsService,
  ) {}

  async previewCompletion(
    taskId: string,
    input: R26CompletionPreviewDto,
    actor: AuthenticatedUser,
  ) {
    const task = await this.loadTaskWithExecutor(
      this.prisma,
      taskId,
      actor,
    );
    this.assertGate3C1Node(task);
    this.assertTaskVersion(task, input.taskVersion);

    return this.buildCompletionPreview(
      this.prisma,
      task,
      actor,
    );
  }

  async completeTask(
    taskId: string,
    input: R26CompleteOrdinaryTaskDto,
    actor: AuthenticatedUser,
    requestId: string,
  ) {
    const task = await this.loadTaskWithExecutor(
      this.prisma,
      taskId,
      actor,
    );
    this.assertGate3C1Node(task);
    const requestHash = this.hashRequest({
      action: COMPLETE_ACTION,
      taskId,
      actorUserId: actor.id,
      input,
    });
    const replay = await this.findCommandReplay(
      input.idempotencyKey,
      task,
      actor,
      COMPLETE_ACTION,
      requestHash,
    );
    if (replay) {
      return replay;
    }

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const lockedTask = await this.loadTaskWithExecutor(
            tx,
            taskId,
            actor,
          );
          this.assertGate3C1Node(lockedTask);
          this.assertTaskVersion(lockedTask, input.taskVersion);
          this.assertActorCanComplete(lockedTask, actor);
          const preview = await this.buildCompletionPreview(
            tx,
            lockedTask,
            actor,
          );
          if (!preview.canComplete) {
            throw new BadRequestException({
              code: 'COMPLETION_REQUIREMENTS_NOT_MET',
              message: '当前工序尚未满足完成条件。',
              blockingReasons: preview.blockingReasons,
            });
          }
          if (!input.acknowledgedConsequences) {
            throw new BadRequestException('必须确认推进影响后才能完成工序。');
          }

          const beforeTaskIds = new Set(
            (
              await tx.workflowTask.findMany({
                where: {
                  workflowInstanceId: lockedTask.workflowInstanceId,
                },
                select: { id: true },
              })
            ).map((item) => item.id),
          );
          const action = this.resolveCompletionAction(
            lockedTask.nodeCode,
          );
          const trustedAssignments =
            this.toWorkflowAssignments(preview.nextTasks);

          await this.workflowsService.transitionTaskWithExecutor(
            tx,
            lockedTask.id,
            action,
            actor,
            {
              comment: input.completionReason.trim(),
              metadata: {
                gate: 'R26_GATE3C1',
                requestId,
                idempotencyKey: input.idempotencyKey,
                acknowledgedConsequences: true,
              },
            },
            'r26-gate3c1',
            {
              enforceCompletionRequirements: true,
              nextTaskAssignments: trustedAssignments,
            },
          );

          const [completedTask, createdTasks, workflowInstance, project] =
            await Promise.all([
              tx.workflowTask.findUniqueOrThrow({
                where: { id: lockedTask.id },
                include: {
                  assigneeUser: {
                    select: { id: true, name: true },
                  },
                  assigneeDepartment: {
                    select: { id: true, name: true },
                  },
                },
              }),
              tx.workflowTask.findMany({
                where: {
                  workflowInstanceId: lockedTask.workflowInstanceId,
                  id: { notIn: [...beforeTaskIds] },
                },
                include: {
                  assigneeUser: {
                    select: { id: true, name: true },
                  },
                  assigneeDepartment: {
                    select: { id: true, name: true },
                  },
                },
                orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
              }),
              tx.workflowInstance.update({
                where: { id: lockedTask.workflowInstanceId },
                data: { commandVersion: { increment: 1 } },
              }),
              tx.project.findUniqueOrThrow({
                where: { id: lockedTask.projectId },
                select: {
                  id: true,
                  currentNodeCode: true,
                },
              }),
            ]);
          const assignmentSummary = createdTasks
            .map((createdTask) => ({
              taskId: createdTask.id,
              nodeCode: createdTask.nodeCode,
              stepNumber:
                getWorkflowNodeMeta(createdTask.nodeCode).sequence /
                10,
              stepName: createdTask.nodeName,
              isPrimary: createdTask.isPrimary,
              isNonBlocking:
                createdTask.nodeCode ===
                WorkflowNodeCode.PERFORMANCE_TEST,
              owner: createdTask.assigneeUser
                ? {
                    id: createdTask.assigneeUser.id,
                    name: createdTask.assigneeUser.name,
                  }
                : null,
              department: createdTask.assigneeDepartment
                ? {
                    id: createdTask.assigneeDepartment.id,
                    name: createdTask.assigneeDepartment.name,
                  }
                : null,
              assignmentSource:
                this.readPayloadString(
                  createdTask.payload,
                  'assignmentSource',
                ) ?? ProjectAssignmentSource.UNASSIGNED,
            }))
            .sort(
              (left, right) =>
                left.stepNumber - right.stepNumber,
            );
          const audit =
            await this.activityLogsService.createWithExecutor(tx, {
              projectId: lockedTask.projectId,
              actorUserId: actor.id,
              targetType: AuditTargetType.WORKFLOW_TASK,
              targetId: lockedTask.id,
              action: COMPLETE_ACTION,
              nodeCode: lockedTask.nodeCode,
              summary: `完成工序 ${lockedTask.nodeName}，系统已按冻结拓扑推进。`,
              beforeData: {
                taskStatus: lockedTask.status,
                taskVersion: lockedTask.updatedAt.toISOString(),
                currentNodeCode:
                  lockedTask.workflowInstance.currentNodeCode,
                workflowVersion:
                  lockedTask.workflowInstance.commandVersion,
              },
              afterData: {
                taskStatus: completedTask.status,
                currentNodeCode: project.currentNodeCode,
                workflowVersion: workflowInstance.commandVersion,
                createdTasks: assignmentSummary,
              },
              metadata: {
                gate: 'R26_GATE3C1',
                requestId,
                idempotencyKey: input.idempotencyKey,
                completionReason: input.completionReason.trim(),
                acknowledgedConsequences: true,
                result: 'SUCCESS',
              },
            });
          const result = {
            action: COMPLETE_ACTION,
            requestId,
            idempotencyKey: input.idempotencyKey,
            idempotentReplay: false,
            projectId: lockedTask.projectId,
            completedTask: {
              id: completedTask.id,
              nodeCode: completedTask.nodeCode,
              stepNumber:
                getWorkflowNodeMeta(completedTask.nodeCode).sequence /
                10,
              stepName: completedTask.nodeName,
              status: completedTask.status,
              completedAt:
                completedTask.completedAt?.toISOString() ?? null,
            },
            createdTasks: assignmentSummary,
            activatedTasks: [],
            projectCurrentNodeCode: project.currentNodeCode,
            assignmentSummary,
            activity: {
              id: audit.id,
              summary: audit.summary,
              createdAt: audit.createdAt.toISOString(),
            },
            workflowVersion: workflowInstance.commandVersion,
          };

          await tx.r26CommandRequest.create({
            data: {
              projectId: lockedTask.projectId,
              actorUserId: actor.id,
              idempotencyKey: input.idempotencyKey,
              action: COMPLETE_ACTION,
              requestHash,
              result: result as Prisma.InputJsonValue,
            },
          });

          return result;
        },
        {
          isolationLevel:
            Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    } catch (error) {
      return this.handleIdempotentConflict(
        error,
        input.idempotencyKey,
        task,
        actor,
        COMPLETE_ACTION,
        requestHash,
      );
    }
  }

  async resolveBlocker(
    taskId: string,
    blockerId: string,
    input: R26ResolveTaskBlockerDto,
    actor: AuthenticatedUser,
    requestId: string,
  ) {
    const task = await this.loadTaskWithExecutor(
      this.prisma,
      taskId,
      actor,
    );
    this.assertGate3C1Node(task);
    const requestHash = this.hashRequest({
      action: RESOLVE_BLOCKER_ACTION,
      taskId,
      blockerId,
      actorUserId: actor.id,
      input,
    });
    const replay = await this.findCommandReplay(
      input.idempotencyKey,
      task,
      actor,
      RESOLVE_BLOCKER_ACTION,
      requestHash,
    );
    if (replay) {
      return replay;
    }
    const actualResolvedAt = new Date(input.actualResolvedAt);
    if (actualResolvedAt.getTime() > Date.now() + 5 * 60 * 1000) {
      throw new BadRequestException('实际解除时间不能晚于当前时间。');
    }

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const lockedTask = await this.loadTaskWithExecutor(
            tx,
            taskId,
            actor,
          );
          this.assertGate3C1Node(lockedTask);
          this.assertTaskVersion(lockedTask, input.taskVersion);
          this.assertActorCanComplete(lockedTask, actor);
          const blocker = await tx.taskBlocker.findFirst({
            where: {
              id: blockerId,
              workflowTaskId: lockedTask.id,
              projectId: lockedTask.projectId,
            },
          });
          if (!blocker) {
            throw new NotFoundException(
              '阻塞不存在或不属于当前工序。',
            );
          }
          if (blocker.status !== TaskBlockerStatus.OPEN) {
            throw new ConflictException({
              code: 'BLOCKER_ALREADY_RESOLVED',
              message: '该阻塞已解除，请刷新后重试。',
            });
          }

          const updated = await tx.taskBlocker.updateMany({
            where: {
              id: blocker.id,
              status: TaskBlockerStatus.OPEN,
            },
            data: {
              status: TaskBlockerStatus.RESOLVED,
              resolvedAt: actualResolvedAt,
              actualResolvedAt,
              resolutionSummary: input.resolutionSummary.trim(),
              resolvedById: actor.id,
              resolutionRequestId: requestId,
            },
          });
          if (updated.count !== 1) {
            throw new ConflictException({
              code: 'BLOCKER_ALREADY_RESOLVED',
              message: '该阻塞已被其他操作解除，请刷新后重试。',
            });
          }
          const audit =
            await this.activityLogsService.createWithExecutor(tx, {
              projectId: lockedTask.projectId,
              actorUserId: actor.id,
              targetType: AuditTargetType.WORKFLOW_TASK,
              targetId: lockedTask.id,
              action: RESOLVE_BLOCKER_ACTION,
              nodeCode: lockedTask.nodeCode,
              summary: `解除 ${lockedTask.nodeName} 的阻塞：${blocker.description}`,
              beforeData: {
                blockerId: blocker.id,
                status: blocker.status,
                description: blocker.description,
              },
              afterData: {
                blockerId: blocker.id,
                status: TaskBlockerStatus.RESOLVED,
                actualResolvedAt:
                  actualResolvedAt.toISOString(),
                resolutionSummary:
                  input.resolutionSummary.trim(),
              },
              metadata: {
                gate: 'R26_GATE3C1',
                requestId,
                idempotencyKey: input.idempotencyKey,
                result: 'SUCCESS',
              },
            });
          const result = {
            action: RESOLVE_BLOCKER_ACTION,
            requestId,
            idempotencyKey: input.idempotencyKey,
            idempotentReplay: false,
            projectId: lockedTask.projectId,
            taskId: lockedTask.id,
            blockerId: blocker.id,
            blockerResolved: true,
            taskStatusChanged: false,
            workflowTransitioned: false,
            resolvedAt: actualResolvedAt.toISOString(),
            resolutionSummary: input.resolutionSummary.trim(),
            auditLogId: audit.id,
          };

          await tx.r26CommandRequest.create({
            data: {
              projectId: lockedTask.projectId,
              actorUserId: actor.id,
              idempotencyKey: input.idempotencyKey,
              action: RESOLVE_BLOCKER_ACTION,
              requestHash,
              result: result as Prisma.InputJsonValue,
            },
          });

          return result;
        },
        {
          isolationLevel:
            Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    } catch (error) {
      return this.handleIdempotentConflict(
        error,
        input.idempotencyKey,
        task,
        actor,
        RESOLVE_BLOCKER_ACTION,
        requestHash,
      );
    }
  }

  private async buildCompletionPreview(
    db: Gate3C1DbClient,
    task: Gate3C1Task,
    actor: AuthenticatedUser,
  ) {
    const inspection =
      await this.workflowsService.inspectTaskCompletionWithExecutor(
        db,
        task.id,
      );
    const action = this.resolveCompletionAction(task.nodeCode);
    const templates = getWorkflowNextTaskTemplates(
      task.nodeCode,
      action,
    );
    const assignments =
      await this.memberAssignmentService.resolveFutureAssignmentsWithExecutor(
        db,
        task.projectId,
        templates.map((template) => template.nodeCode),
      );
    const assignmentByNode = new Map(
      assignments.map((assignment) => [
        assignment.nodeCode,
        assignment,
      ]),
    );
    const nextTasks = templates
      .map((template) => {
        const assignment = assignmentByNode.get(template.nodeCode);
        const meta = getWorkflowNodeMeta(template.nodeCode);

        return {
          nodeCode: template.nodeCode,
          stepNumber: meta.sequence / 10,
          stepName: meta.name,
          isPrimary: template.isPrimary ?? meta.isPrimaryTask,
          isNonBlocking:
            template.nodeCode === WorkflowNodeCode.PERFORMANCE_TEST,
          reason: template.reason,
          primaryDepartment:
            assignment?.primaryDepartment ?? null,
          suggestedOwner: assignment?.suggestedOwner ?? null,
          collaborators: assignment?.collaborators ?? [],
          reviewers: assignment?.reviewers ?? [],
          assignmentStatus:
            assignment?.assignmentStatus ?? 'UNASSIGNED',
          assignmentSource:
            assignment?.assignmentSource ??
            ProjectAssignmentSource.UNASSIGNED,
          unassignedReason:
            assignment?.unassignedReason ??
            '没有符合 Gate 3A 规则的项目成员，负责人保持待分配。',
        };
      })
      .sort((left, right) => left.stepNumber - right.stepNumber);
    const actorCanComplete = this.actorCanComplete(task, actor);
    const workflowRunning =
      task.workflowInstance.status ===
      WorkflowInstanceStatus.RUNNING;
    const blockingReasons = [
      ...(!inspection.taskIsActive
        ? ['当前任务不是有效的可完成活动任务。']
        : []),
      ...(!workflowRunning
        ? ['当前流程不在运行中。']
        : []),
      ...(!actorCanComplete
        ? ['当前用户不是任务负责人或项目负责人。']
        : []),
      ...inspection.form.missing.map(
        (field) => `必填表单缺少：${field.label}`,
      ),
      ...inspection.materials.missing.map(
        (material) => `缺少必交材料：${material.name}`,
      ),
      ...inspection.blockers.map(
        (blocker) => `解除“${blocker.description}”阻塞`,
      ),
      ...inspection.domainBlockingReasons,
    ];

    return {
      gate: 'R26_GATE3C1',
      writePerformed: false,
      canComplete: blockingReasons.length === 0,
      blockingReasons,
      currentTask: {
        id: task.id,
        projectId: task.projectId,
        nodeCode: task.nodeCode,
        stepNumber:
          getWorkflowNodeMeta(task.nodeCode).sequence / 10,
        stepName: task.nodeName,
        status: task.status,
        taskVersion: task.updatedAt.toISOString(),
        owner: task.assigneeUser
          ? {
              id: task.assigneeUser.id,
              name: task.assigneeUser.name,
            }
          : null,
      },
      checks: [
        {
          code: 'REQUIRED_FORM',
          label: '必填表单已完成',
          passed: inspection.form.satisfied,
          details: inspection.form.missing.map(
            (field) => field.label,
          ),
        },
        {
          code: 'REQUIRED_MATERIALS',
          label: '必交材料已提交',
          passed: inspection.materials.satisfied,
          details: inspection.materials.missing.map(
            (material) => material.name,
          ),
        },
        {
          code: 'PERMISSION',
          label: '当前用户有完成权限',
          passed: actorCanComplete,
          details: actorCanComplete
            ? []
            : ['仅当前负责人或项目负责人可完成'],
        },
        {
          code: 'ACTIVE_TASK',
          label: '当前任务仍为有效活动任务',
          passed: inspection.taskIsActive && workflowRunning,
          details:
            inspection.taskIsActive && workflowRunning
              ? []
              : ['任务已失效、已完成或流程未运行'],
        },
        {
          code: 'OPEN_BLOCKERS',
          label: '当前不存在未解除阻塞',
          passed: inspection.blockers.length === 0,
          details: inspection.blockers.map(
            (blocker) => blocker.description,
          ),
        },
        {
          code: 'DOMAIN_RECORDS',
          label: '工序业务记录满足完成要求',
          passed:
            inspection.domainBlockingReasons.length === 0,
          details: inspection.domainBlockingReasons,
        },
      ],
      openBlockers: inspection.blockers,
      nextTasks,
      assignmentPreview: nextTasks.map((taskItem) => ({
        nodeCode: taskItem.nodeCode,
        suggestedOwner: taskItem.suggestedOwner,
        primaryDepartment: taskItem.primaryDepartment,
        assignmentSource: taskItem.assignmentSource,
        assignmentStatus: taskItem.assignmentStatus,
      })),
      workflowVersion: task.workflowInstance.commandVersion,
      availableActions: [
        ...(actorCanComplete
          ? [
              {
                action: 'COMPLETE',
                label: '确认完成并推进',
              },
            ]
          : []),
        ...(actorCanComplete && inspection.blockers.length > 0
          ? [
              {
                action: 'RESOLVE_BLOCKER',
                label: '解除阻塞',
              },
            ]
          : []),
      ],
      notice:
        getWorkflowNodeMeta(task.nodeCode).sequence === 110
          ? '完成第 11 步只生成第 12 步；第 12 步通过、退回等专项动作仍保持关闭。'
          : '下一任务及负责人由现有工作流状态机和 Gate 3A 服务端分配规则计算。',
    };
  }

  private async loadTaskWithExecutor(
    db: Gate3C1DbClient,
    taskId: string,
    actor: AuthenticatedUser,
  ) {
    const task = await db.workflowTask.findUnique({
      where: { id: taskId },
      include: {
        workflowInstance: true,
        assigneeUser: {
          select: {
            id: true,
            name: true,
          },
        },
        project: {
          select: {
            id: true,
            ownerUserId: true,
            members: {
              where: { userId: actor.id },
              select: {
                userId: true,
                memberType: true,
              },
            },
          },
        },
      },
    });
    if (!task) {
      throw new NotFoundException('工序任务不存在。');
    }
    await this.projectAccessService.assertProjectAccess(
      db,
      task.projectId,
      actor,
      'workflow.transition',
    );
    return task;
  }

  private assertGate3C1Node(task: {
    nodeCode: WorkflowNodeCode;
    nodeName: string;
  }) {
    if (!GATE3C1_NODE_CODES.has(task.nodeCode)) {
      throw new ForbiddenException(
        `${task.nodeName} 不属于 Gate 3C1 普通工序完成范围。`,
      );
    }
  }

  private actorCanComplete(
    task: Pick<
      Gate3C1Task,
      'assigneeUserId' | 'project'
    >,
    actor: AuthenticatedUser,
  ) {
    const isManagerMember = task.project.members.some(
      (member) =>
        member.userId === actor.id &&
        (member.memberType === ProjectMemberType.OWNER ||
          member.memberType === ProjectMemberType.MANAGER),
    );

    return (
      actor.isSystemAdmin ||
      actor.roleCodes.includes('admin') ||
      actor.roleCodes.includes('project_manager') ||
      task.assigneeUserId === actor.id ||
      task.project.ownerUserId === actor.id ||
      isManagerMember
    );
  }

  private assertActorCanComplete(
    task: Pick<
      Gate3C1Task,
      'assigneeUserId' | 'project' | 'nodeName'
    >,
    actor: AuthenticatedUser,
  ) {
    if (!this.actorCanComplete(task, actor)) {
      throw new ForbiddenException(
        `${task.nodeName} 仅允许当前负责人或项目负责人完成。`,
      );
    }
  }

  private assertTaskVersion(
    task: { updatedAt: Date },
    taskVersion: string,
  ) {
    if (
      task.updatedAt.toISOString() !==
      new Date(taskVersion).toISOString()
    ) {
      throw new ConflictException({
        code: 'STALE_TASK_VERSION',
        message: '工序信息已更新，请刷新完成前检查。',
        expectedVersion: taskVersion,
        currentVersion: task.updatedAt.toISOString(),
      });
    }
  }

  private resolveCompletionAction(nodeCode: WorkflowNodeCode) {
    return nodeCode === WorkflowNodeCode.SAMPLE_COLOR_CONFIRMATION
      ? WorkflowAction.APPROVE
      : WorkflowAction.COMPLETE;
  }

  private toWorkflowAssignments(
    nextTasks: Array<{
      nodeCode: WorkflowNodeCode;
      suggestedOwner: { id: string } | null;
      primaryDepartment: { id: string | null } | null;
      collaborators: Array<{ id: string }>;
      reviewers: Array<{ id: string }>;
      assignmentSource: ProjectAssignmentSource;
    }>,
  ): WorkflowResolvedAssignment[] {
    return nextTasks.map((task) => ({
      nodeCode: task.nodeCode,
      ownerUserId: task.suggestedOwner?.id ?? null,
      primaryDepartmentId:
        task.primaryDepartment?.id ?? null,
      collaboratorUserIds: task.collaborators.map(
        (person) => person.id,
      ),
      reviewerUserIds: task.reviewers.map(
        (person) => person.id,
      ),
      assignmentSource: task.assignmentSource,
    }));
  }

  private readPayloadString(
    payload: Prisma.JsonValue | null,
    key: string,
  ) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return null;
    }
    const value = (payload as Record<string, unknown>)[key];
    return typeof value === 'string' ? value : null;
  }

  private normalizeCommandResult(value: Prisma.JsonValue | null) {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  private async findCommandReplay(
    idempotencyKey: string,
    task: Gate3C1Task,
    actor: AuthenticatedUser,
    action: string,
    requestHash: string,
  ) {
    const existing = await this.prisma.r26CommandRequest.findUnique({
      where: { idempotencyKey },
    });
    return existing
      ? this.replayCommand(
          existing,
          task,
          actor,
          action,
          requestHash,
        )
      : null;
  }

  private replayCommand(
    existing: {
      projectId: string;
      actorUserId: string | null;
      action: string;
      requestHash: string;
      result: Prisma.JsonValue | null;
    },
    task: Gate3C1Task,
    actor: AuthenticatedUser,
    action: string,
    requestHash: string,
  ) {
    if (
      existing.projectId !== task.projectId ||
      existing.actorUserId !== actor.id ||
      existing.action !== action ||
      existing.requestHash !== requestHash
    ) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST',
        message: '幂等键已被其他请求使用，请生成新的幂等键。',
      });
    }
    const result = this.normalizeCommandResult(existing.result);
    if (!result) {
      throw new ConflictException({
        code: 'COMMAND_IN_PROGRESS',
        message: '相同命令正在处理中，请稍后重试。',
      });
    }
    return { ...result, idempotentReplay: true };
  }

  private async handleIdempotentConflict(
    error: unknown,
    idempotencyKey: string,
    task: Gate3C1Task,
    actor: AuthenticatedUser,
    action: string,
    requestHash: string,
  ): Promise<Record<string, unknown>> {
    if (this.isUniqueConstraintError(error)) {
      const duplicate =
        await this.prisma.r26CommandRequest.findUnique({
          where: { idempotencyKey },
        });
      if (duplicate) {
        return this.replayCommand(
          duplicate,
          task,
          actor,
          action,
          requestHash,
        );
      }
    }
    if (this.isSerializableWriteConflict(error)) {
      throw new ConflictException({
        code: 'CONCURRENT_TASK_COMPLETION',
        message: '工序已被其他标签页更新，请刷新后重试。',
      });
    }
    throw error;
  }

  private hashRequest(value: unknown) {
    return createHash('sha256')
      .update(this.stableStringify(value))
      .digest('hex');
  }

  private stableStringify(value: unknown): string {
    if (Array.isArray(value)) {
      return `[${value
        .map((item) => this.stableStringify(item))
        .join(',')}]`;
    }
    if (value && typeof value === 'object') {
      return `{${Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(
          ([key, item]) =>
            `${JSON.stringify(key)}:${this.stableStringify(item)}`,
        )
        .join(',')}}`;
    }
    return JSON.stringify(value) ?? 'null';
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
