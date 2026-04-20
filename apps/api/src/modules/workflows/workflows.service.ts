import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditTargetType,
  NotificationType,
  ProjectStatus,
  RecurringTaskStatus,
  ReviewType,
  WorkflowAction,
  WorkflowInstanceStatus,
  WorkflowNodeCode,
  WorkflowTaskStatus,
  type Prisma,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../infra/prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ProjectAccessService } from '../auth/project-access.service';
import { NotificationQueueService } from '../queue/notification-queue.service';
import {
  DEFAULT_WORKFLOW_TEMPLATE,
  DEFAULT_WORKFLOW_TEMPLATE_VERSION,
  INITIAL_WORKFLOW_NODE,
  getAllowedWorkflowActions,
  getCurrentNodeName,
  getPreviousPrimaryNodeCode,
  isWorkflowActionCurrentlyAvailable,
  getWorkflowDefaultReturnNode,
  getWorkflowNextTaskTemplates,
  getWorkflowNodeMeta,
  getWorkflowTerminalStatus,
  isWorkflowCompletionAction,
  isPrimaryWorkflowNode,
  isWorkflowReviewAction,
  isWorkflowTaskStatusCompletable,
  isWorkflowTaskStatusActionable,
  isWorkflowTaskStatusStartable,
  type WorkflowTaskSpawnTemplate,
} from './workflow-node.constants';
import { WorkflowDeadlineService } from './workflow-deadline.service';
import { WorkflowRecurringService } from './workflow-recurring.service';

type WorkflowDbClient = Prisma.TransactionClient | PrismaService;

type InitializeWorkflowInput = {
  projectId: string;
  ownerUserId?: string | null;
  initiatedById: string;
};

type WorkflowActionInput = {
  comment?: string | null;
  targetNodeCode?: WorkflowNodeCode;
  metadata?: Prisma.InputJsonValue;
};

type WorkflowFormSaveInput = {
  payload: Record<string, unknown>;
  comment?: string | null;
};

type WorkflowTaskWithRelations = Prisma.WorkflowTaskGetPayload<{
  include: {
    workflowInstance: true;
    project: true;
    assigneeUser: true;
    assigneeDepartment: true;
  };
}>;

@Injectable()
export class WorkflowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLogsService: ActivityLogsService,
    private readonly notificationQueueService: NotificationQueueService,
    private readonly workflowDeadlineService: WorkflowDeadlineService,
    private readonly workflowRecurringService: WorkflowRecurringService,
    private readonly projectAccessService: ProjectAccessService,
  ) {}

  async initializeProjectWorkflow(
    tx: Prisma.TransactionClient,
    input: InitializeWorkflowInput,
  ) {
    const now = new Date();
    const nodeCode = INITIAL_WORKFLOW_NODE;
    const taskSchedule = await this.workflowDeadlineService.buildTaskSchedule(tx, {
      nodeCode,
      startAt: now,
    });

    const instance = await tx.workflowInstance.create({
      data: {
        projectId: input.projectId,
        instanceNo: this.buildInstanceNo(),
        versionNo: 1,
        templateCode: DEFAULT_WORKFLOW_TEMPLATE,
        templateVersion: DEFAULT_WORKFLOW_TEMPLATE_VERSION,
        status: WorkflowInstanceStatus.RUNNING,
        currentNodeCode: nodeCode,
        initiatedById: input.initiatedById,
        startedAt: now,
      },
    });

    const task = await tx.workflowTask.create({
      data: {
        workflowInstanceId: instance.id,
        projectId: input.projectId,
        taskNo: this.buildTaskNo(),
        nodeCode,
        nodeName: getCurrentNodeName(nodeCode) ?? nodeCode,
        stepCode: taskSchedule.stepCode,
        taskRound: 1,
        status: WorkflowTaskStatus.READY,
        isPrimary: true,
        isActive: true,
        assigneeUserId: input.ownerUserId ?? null,
        dueAt: taskSchedule.dueAt,
        effectiveDueAt: taskSchedule.effectiveDueAt,
        overdueDays: 0,
        idempotencyKey: `wf-init:${input.projectId}:${nodeCode}:1`,
        payload: {
          autoInitialized: true,
          templateCode: DEFAULT_WORKFLOW_TEMPLATE,
          templateVersion: DEFAULT_WORKFLOW_TEMPLATE_VERSION,
          nodeCode,
        },
      },
    });

    const transition = await tx.workflowTransition.create({
      data: {
        workflowInstanceId: instance.id,
        projectId: input.projectId,
        toTaskId: task.id,
        toNodeCode: nodeCode,
        action: WorkflowAction.SYSTEM_SYNC,
        comment: 'Project created and workflow initialized automatically.',
        operatorUserId: input.initiatedById,
      },
    });

    try {
      await this.notificationQueueService.enqueueTaskNotification(
        task.id,
        NotificationType.TASK_ASSIGNED,
        input.initiatedById,
      );
    } catch {
      // Notification queue failures must not affect workflow initialization.
    }

    return {
      instance,
      task,
      transition,
    };
  }

  async getProjectWorkflow(projectId: string, actor: AuthenticatedUser) {
    await this.projectAccessService.assertProjectAccessWithDefaultClient(
      projectId,
      actor,
      'project.read',
    );
    const workflowInstance = await this.getWorkflowInstanceByProjectOrThrow(this.prisma, projectId);
    await this.workflowDeadlineService.refreshWorkflowInstanceTaskDeadlines(
      this.prisma,
      workflowInstance.id,
    );
    const tasks = await this.prisma.workflowTask.findMany({
      where: {
        workflowInstanceId: workflowInstance.id,
      },
      include: {
        assigneeUser: true,
        assigneeDepartment: true,
      },
      orderBy: [
        { createdAt: 'asc' },
        { taskRound: 'asc' },
      ],
    });

    return {
      projectId,
      workflowInstance: this.toWorkflowInstanceSummary(workflowInstance),
      activeTasks: tasks
        .filter((task) => task.isActive)
        .map((task) => this.toWorkflowTaskSummary(task)),
      taskHistory: tasks.map((task) => this.toWorkflowTaskSummary(task)),
    };
  }

  async getWorkflowTimeline(projectId: string, actor: AuthenticatedUser) {
    await this.projectAccessService.assertProjectAccessWithDefaultClient(
      projectId,
      actor,
      'project.read',
    );
    const workflowInstance = await this.getWorkflowInstanceByProjectOrThrow(this.prisma, projectId);
    const transitions = await this.prisma.workflowTransition.findMany({
      where: {
        workflowInstanceId: workflowInstance.id,
      },
      include: {
        operatorUser: true,
        fromTask: true,
        toTask: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return {
      projectId,
      workflowInstance: this.toWorkflowInstanceSummary(workflowInstance),
      timeline: transitions.map((transition) => ({
        id: transition.id,
        action: transition.action,
        comment: transition.comment,
        fromTaskId: transition.fromTaskId,
        fromNodeCode: transition.fromNodeCode,
        fromNodeName:
          transition.fromTask?.nodeName ??
          getCurrentNodeName(transition.fromNodeCode) ??
          null,
        toTaskId: transition.toTaskId,
        toNodeCode: transition.toNodeCode,
        toNodeName:
          transition.toTask?.nodeName ??
          getCurrentNodeName(transition.toNodeCode) ??
          null,
        operatorUserId: transition.operatorUserId,
        operatorName: transition.operatorUser?.name ?? null,
        createdAt: transition.createdAt.toISOString(),
      })),
    };
  }

  async getMonthlyReviewWorkspace(projectId: string, actor: AuthenticatedUser) {
    await this.projectAccessService.assertProjectAccessWithDefaultClient(
      projectId,
      actor,
      'project.read',
    );

    const [project, recurringPlan, activeConsistencyTask, latestReviews] = await Promise.all([
      this.prisma.project.findUnique({
        where: { id: projectId },
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
          currentNodeCode: true,
        },
      }),
      this.prisma.recurringPlan.findFirst({
        where: {
          projectId,
          sourceNodeCode: WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW,
        },
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          tasks: {
            orderBy: {
              periodIndex: 'asc',
            },
          },
        },
      }),
      this.prisma.workflowTask.findFirst({
        where: {
          projectId,
          nodeCode: WorkflowNodeCode.COLOR_CONSISTENCY_REVIEW,
          isActive: true,
        },
        include: {
          assigneeUser: true,
          assigneeDepartment: true,
        },
        orderBy: [
          { createdAt: 'desc' },
          { taskRound: 'desc' },
        ],
      }),
      this.prisma.reviewRecord.findMany({
        where: {
          projectId,
          reviewType: ReviewType.COLOR_CONSISTENCY_REVIEW,
        },
        include: {
          reviewer: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          reviewedAt: 'desc',
        },
        take: 6,
      }),
    ]);

    if (!project) {
      throw new NotFoundException('Project not found.');
    }

    const recurringTasks = recurringPlan?.tasks ?? [];

    return {
      project: {
        id: project.id,
        code: project.code,
        name: project.name,
        status: project.status,
        currentNodeCode: project.currentNodeCode,
        currentNodeName: getCurrentNodeName(project.currentNodeCode),
      },
      recurringPlan: recurringPlan
        ? {
            id: recurringPlan.id,
            planCode: recurringPlan.planCode,
            status: recurringPlan.status,
            totalCount: recurringPlan.totalCount,
            generatedCount: recurringPlan.generatedCount,
            startDate: recurringPlan.startDate.toISOString(),
            endDate: recurringPlan.endDate.toISOString(),
          }
        : null,
      summary: {
        totalPeriods: recurringTasks.length,
        completedPeriods: recurringTasks.filter((task) => task.status === RecurringTaskStatus.COMPLETED)
          .length,
        overduePeriods: recurringTasks.filter((task) => task.status === RecurringTaskStatus.OVERDUE)
          .length,
        pendingPeriods: recurringTasks.filter(
          (task) =>
            task.status === RecurringTaskStatus.PENDING ||
            task.status === RecurringTaskStatus.IN_PROGRESS,
        ).length,
      },
      activeWorkflowTask: activeConsistencyTask
        ? this.toWorkflowTaskSummary(activeConsistencyTask)
        : null,
      recurringTasks: recurringTasks.map((task) => this.toRecurringTaskSummary(task)),
      recentReviews: latestReviews.map((review) => this.toMonthlyReviewRecordSummary(review)),
    };
  }

  async getMonthlyReviewTaskDetail(
    projectId: string,
    recurringTaskId: string,
    actor: AuthenticatedUser,
  ) {
    await this.projectAccessService.assertProjectAccessWithDefaultClient(
      projectId,
      actor,
      'project.read',
    );

    const recurringTask = await this.prisma.recurringTask.findFirst({
      where: {
        id: recurringTaskId,
        projectId,
      },
      include: {
        recurringPlan: true,
      },
    });

    if (!recurringTask) {
      throw new NotFoundException('Recurring review task not found.');
    }

    const { periodStart, periodEnd } = this.getMonthlyReviewPeriodRange(recurringTask.plannedDate);
    const reviews = await this.prisma.reviewRecord.findMany({
      where: {
        projectId,
        reviewType: ReviewType.COLOR_CONSISTENCY_REVIEW,
        reviewedAt: {
          gte: periodStart,
          lt: periodEnd,
        },
      },
      include: {
        reviewer: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        reviewedAt: 'desc',
      },
    });

    return {
      recurringPlan: {
        id: recurringTask.recurringPlan.id,
        planCode: recurringTask.recurringPlan.planCode,
        status: recurringTask.recurringPlan.status,
      },
      recurringTask: this.toRecurringTaskSummary(recurringTask),
      relatedReviews: reviews.map((review) => this.toMonthlyReviewRecordSummary(review)),
    };
  }

  async getTaskDetail(taskId: string, actor: AuthenticatedUser) {
    const task = await this.getTaskOrThrow(this.prisma, taskId);
    await this.projectAccessService.assertProjectAccessWithDefaultClient(
      task.projectId,
      actor,
      'project.read',
    );

    return this.buildTaskDetailResponse(this.prisma, task.id);
  }

  async getTaskRoundHistory(taskId: string, actor: AuthenticatedUser) {
    const task = await this.getTaskOrThrow(this.prisma, taskId);
    await this.projectAccessService.assertProjectAccessWithDefaultClient(
      task.projectId,
      actor,
      'project.read',
    );

    const rounds = await this.prisma.workflowTask.findMany({
      where: {
        workflowInstanceId: task.workflowInstanceId,
        nodeCode: task.nodeCode,
      },
      include: {
        assigneeUser: true,
        assigneeDepartment: true,
      },
      orderBy: [
        { taskRound: 'asc' },
        { createdAt: 'asc' },
      ],
    });

    return {
      taskId: task.id,
      projectId: task.projectId,
      nodeCode: task.nodeCode,
      nodeName: task.nodeName,
      rounds: rounds.map((round) => this.toWorkflowTaskSummary(round)),
    };
  }

  async saveTaskForm(taskId: string, actor: AuthenticatedUser, rawInput: unknown) {
    return this.prisma.$transaction(async (tx) => {
      const input = this.parseFormSaveInput(rawInput);
      const task = await this.getTaskOrThrow(tx, taskId);

      await this.projectAccessService.assertProjectAccess(
        tx,
        task.projectId,
        actor,
        'workflow.transition',
      );
      this.assertActorCanOperateTask(task, actor);
      this.assertTaskCanSaveForm(task);

      const now = new Date();
      const currentPayload = this.asJsonObject(task.payload);
      const nextPayload = {
        ...currentPayload,
        formData: JSON.parse(JSON.stringify(input.payload)) as Prisma.InputJsonValue,
        draftSavedAt: now.toISOString(),
        ...(input.comment ? { draftComment: input.comment } : {}),
      } satisfies Record<string, Prisma.InputJsonValue>;

      await tx.workflowTask.update({
        where: {
          id: taskId,
        },
        data: {
          payload: nextPayload,
        },
      });

      await this.activityLogsService.createWithExecutor(tx, {
        projectId: task.projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.WORKFLOW_TASK,
        targetId: task.id,
        action: 'WORKFLOW_FORM_SAVED',
        nodeCode: task.nodeCode,
        summary: `${task.nodeName} 已保存节点表单草稿。`,
        beforeData: {
          payload: task.payload,
        },
        afterData: {
          payload: nextPayload,
        },
      });

      return this.buildTaskDetailResponse(tx, task.id);
    });
  }

  async transitionTask(
    taskId: string,
    action: WorkflowAction,
    actor: AuthenticatedUser,
    rawInput: unknown,
  ) {
    return this.prisma.$transaction((tx) =>
      this.transitionTaskWithExecutor(tx, taskId, action, actor, rawInput),
    );
  }

  async transitionTaskWithExecutor(
    tx: Prisma.TransactionClient,
    taskId: string,
    action: WorkflowAction,
    actor: AuthenticatedUser,
    rawInput: unknown,
  ) {
    const input = this.parseActionInput(rawInput);
    const task = await this.getTaskOrThrow(tx, taskId);

    await this.projectAccessService.assertProjectAccess(tx, task.projectId, actor, 'workflow.transition');
    this.assertActorCanOperateTask(task, actor);
    this.assertTaskCanTransition(task, action);

    if (action === WorkflowAction.START) {
      const startedTask = await tx.workflowTask.update({
        where: { id: task.id },
        data: {
          status: WorkflowTaskStatus.IN_PROGRESS,
          startedAt: task.startedAt ?? new Date(),
        },
      });

      await tx.workflowTransition.create({
        data: {
          workflowInstanceId: task.workflowInstanceId,
          projectId: task.projectId,
          fromTaskId: task.id,
          toTaskId: task.id,
          fromNodeCode: task.nodeCode,
          toNodeCode: task.nodeCode,
          action,
          comment: input.comment ?? `${task.nodeName} 已开始处理。`,
          operatorUserId: actor.id,
        },
      });

      await this.activityLogsService.createWithExecutor(tx, {
        projectId: task.projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.WORKFLOW_TASK,
        targetId: task.id,
        action: 'WORKFLOW_START',
        nodeCode: task.nodeCode,
        summary: `开始任务 ${task.nodeName}`,
        beforeData: {
          status: task.status,
          isActive: task.isActive,
        },
        afterData: {
          status: startedTask.status,
          isActive: startedTask.isActive,
        },
        ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
      });

      await this.syncWorkflowState(tx, task.workflowInstanceId, task.projectId);
      return this.getProjectWorkflowByInstance(tx, task.workflowInstanceId);
    }

    const nextTemplates = this.resolveNextTaskTemplates(task, action, input);
    const terminalStatus = getWorkflowTerminalStatus(action);

    if (!terminalStatus) {
      throw new BadRequestException(`Unsupported workflow action: ${action}.`);
    }

    const now = new Date();
    const updatedTask = await tx.workflowTask.update({
      where: { id: task.id },
      data: {
        status: terminalStatus,
        isActive: false,
        ...(action === WorkflowAction.APPROVE
          ? { reviewPassAt: this.resolveReviewPassAt(input) ?? now }
          : {}),
        ...(action === WorkflowAction.RETURN ? { returnedAt: now } : { completedAt: now }),
      },
    });

    const createdTasks = await this.createNextTasks(tx, task, actor, action, input, nextTemplates);
    const recurringPlan = await this.maybeCreateRecurringPlan(
      tx,
      task,
      updatedTask,
      createdTasks,
    );

    if (createdTasks.length === 0) {
      await tx.workflowTransition.create({
        data: {
          workflowInstanceId: task.workflowInstanceId,
          projectId: task.projectId,
          fromTaskId: task.id,
          toTaskId: task.id,
          fromNodeCode: task.nodeCode,
          toNodeCode: task.nodeCode,
          action,
          comment: input.comment ?? `${task.nodeName} 已执行 ${action.toLowerCase()}。`,
          operatorUserId: actor.id,
        },
      });
    }

    await this.applyWorkflowCompletionIfNeeded(tx, updatedTask);
    const syncedState = await this.syncWorkflowState(tx, task.workflowInstanceId, task.projectId);

    await this.activityLogsService.createWithExecutor(tx, {
      projectId: task.projectId,
      actorUserId: actor.id,
      targetType: AuditTargetType.WORKFLOW_TASK,
      targetId: task.id,
      action: `WORKFLOW_${action}`,
      nodeCode: task.nodeCode,
      summary: `${task.nodeName} 执行 ${action.toLowerCase()}。`,
      beforeData: {
        status: task.status,
        isActive: task.isActive,
        currentNodeCode: task.workflowInstance.currentNodeCode,
      },
      afterData: {
        status: updatedTask.status,
        isActive: updatedTask.isActive,
        currentNodeCode: syncedState.currentNodeCode,
        createdTasks: createdTasks.map((createdTask) => ({
          id: createdTask.id,
          nodeCode: createdTask.nodeCode,
          nodeName: createdTask.nodeName,
          isPrimary: createdTask.isPrimary,
          taskRound: createdTask.taskRound,
        })),
        createdRecurringPlan: recurringPlan
          ? {
              id: recurringPlan.plan.id,
              planCode: recurringPlan.plan.planCode,
              totalCount: recurringPlan.plan.totalCount,
              generatedTaskCount: recurringPlan.generatedTaskCount,
            }
          : null,
      },
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
    });

    await this.enqueueWorkflowNotifications(createdTasks, action, actor.id);

    return this.getProjectWorkflowByInstance(tx, task.workflowInstanceId);
  }

  getCurrentNodeName(nodeCode: WorkflowNodeCode | null | undefined) {
    return getCurrentNodeName(nodeCode);
  }

  private async createNextTasks(
    tx: Prisma.TransactionClient,
    sourceTask: WorkflowTaskWithRelations,
    actor: AuthenticatedUser,
    action: WorkflowAction,
    input: WorkflowActionInput,
    templates: WorkflowTaskSpawnTemplate[],
  ) {
    const createdTasks: Prisma.WorkflowTaskGetPayload<{
      select: {
        id: true;
        nodeCode: true;
        nodeName: true;
        isPrimary: true;
        taskRound: true;
      };
    }>[] = [];

    for (const template of templates) {
      const nextNodeMeta = getWorkflowNodeMeta(template.nodeCode);
      const isPrimary = template.isPrimary ?? nextNodeMeta.isPrimaryTask;

      await this.assertNoActiveTaskForNode(tx, {
        workflowInstanceId: sourceTask.workflowInstanceId,
        nodeCode: template.nodeCode,
        isPrimary,
      });

      const previousTask = await tx.workflowTask.findFirst({
        where: {
          workflowInstanceId: sourceTask.workflowInstanceId,
          nodeCode: template.nodeCode,
        },
        orderBy: {
          taskRound: 'desc',
        },
        select: {
          taskRound: true,
        },
      });
      const taskSchedule = await this.workflowDeadlineService.buildTaskSchedule(tx, {
        nodeCode: template.nodeCode,
        startAt: new Date(),
      });

      const createdTask = await tx.workflowTask.create({
        data: {
          workflowInstanceId: sourceTask.workflowInstanceId,
          projectId: sourceTask.projectId,
          taskNo: this.buildTaskNo(),
          nodeCode: template.nodeCode,
          nodeName: nextNodeMeta.name,
          stepCode: taskSchedule.stepCode,
          taskRound: (previousTask?.taskRound ?? 0) + 1,
          status: WorkflowTaskStatus.READY,
          isPrimary,
          isActive: true,
          assigneeUserId: sourceTask.project.ownerUserId ?? sourceTask.assigneeUserId ?? null,
          dueAt: taskSchedule.dueAt,
          effectiveDueAt: taskSchedule.effectiveDueAt,
          overdueDays: 0,
          returnedFromTaskId:
            action === WorkflowAction.RETURN || action === WorkflowAction.REJECT
              ? sourceTask.id
              : null,
          reworkReason:
            action === WorkflowAction.RETURN || action === WorkflowAction.REJECT
              ? input.comment ?? template.reason
              : null,
          idempotencyKey: `${sourceTask.id}:${action}:${template.nodeCode}:${(previousTask?.taskRound ?? 0) + 1}`,
          payload: {
            autoCreated: true,
            triggerAction: action,
            fromTaskId: sourceTask.id,
            fromNodeCode: sourceTask.nodeCode,
            reason: template.reason,
            ...(taskSchedule.defaultChargeAmount
              ? { defaultChargeAmount: taskSchedule.defaultChargeAmount }
              : {}),
          },
        },
        select: {
          id: true,
          nodeCode: true,
          nodeName: true,
          isPrimary: true,
          taskRound: true,
        },
      });

      await tx.workflowTransition.create({
        data: {
          workflowInstanceId: sourceTask.workflowInstanceId,
          projectId: sourceTask.projectId,
          fromTaskId: sourceTask.id,
          toTaskId: createdTask.id,
          fromNodeCode: sourceTask.nodeCode,
          toNodeCode: createdTask.nodeCode,
          action,
          comment: input.comment ?? template.reason,
          operatorUserId: actor.id,
        },
      });

      createdTasks.push(createdTask);
    }

    return createdTasks;
  }

  private async enqueueWorkflowNotifications(
    createdTasks: Array<{
      id: string;
      nodeCode: WorkflowNodeCode;
      nodeName: string;
      isPrimary: boolean;
      taskRound: number;
    }>,
    action: WorkflowAction,
    actorUserId: string,
  ) {
    for (const task of createdTasks) {
      const type =
        action === WorkflowAction.RETURN || action === WorkflowAction.REJECT
          ? NotificationType.TASK_RETURNED
          : getWorkflowNodeMeta(task.nodeCode).isReviewNode
            ? NotificationType.REVIEW_PENDING
            : NotificationType.TASK_ASSIGNED;

      try {
        await this.notificationQueueService.enqueueTaskNotification(task.id, type, actorUserId);
      } catch {
        // Notification queue failures must not affect workflow transitions.
      }
    }
  }

  private resolveNextTaskTemplates(
    task: WorkflowTaskWithRelations,
    action: WorkflowAction,
    input: WorkflowActionInput,
  ) {
    const configuredTemplates = getWorkflowNextTaskTemplates(task.nodeCode, action);

    if (configuredTemplates.length > 0) {
      return configuredTemplates;
    }

    if (action !== WorkflowAction.RETURN) {
      return [];
    }

    const targetNodeCode =
      input.targetNodeCode ??
      getWorkflowDefaultReturnNode(task.nodeCode) ??
      getPreviousPrimaryNodeCode(task.nodeCode);

    if (!targetNodeCode) {
      throw new BadRequestException(`${task.nodeName} 没有可用的退回目标节点。`);
    }

    return [
      {
        nodeCode: targetNodeCode,
        isPrimary: isPrimaryWorkflowNode(targetNodeCode),
        reason: `${task.nodeName} 退回到 ${getCurrentNodeName(targetNodeCode)}。`,
      },
    ];
  }

  private assertTaskCanTransition(task: WorkflowTaskWithRelations, action: WorkflowAction) {
    if (!task.isActive) {
      throw new BadRequestException('Workflow task is no longer active.');
    }

    if (task.workflowInstance.status !== WorkflowInstanceStatus.RUNNING) {
      throw new BadRequestException('Workflow instance is not in running state.');
    }

    const allowedActions = getAllowedWorkflowActions(task.nodeCode);

    if (!allowedActions.includes(action)) {
      throw new BadRequestException(`${task.nodeName} does not support action ${action}.`);
    }

    if (action === WorkflowAction.START) {
      if (!isWorkflowTaskStatusStartable(task.status)) {
        throw new BadRequestException(`${task.nodeName} cannot be started from ${task.status}.`);
      }

      return;
    }

    if (!isWorkflowTaskStatusActionable(task.status)) {
      throw new BadRequestException(`${task.nodeName} cannot execute ${action} from ${task.status}.`);
    }

    if (isWorkflowCompletionAction(action) && !isWorkflowTaskStatusCompletable(task.status)) {
      throw new BadRequestException(`${task.nodeName} cannot be completed from ${task.status}.`);
    }

    if (isWorkflowReviewAction(action) && !isWorkflowTaskStatusActionable(task.status)) {
      throw new BadRequestException(`${task.nodeName} cannot execute review action from ${task.status}.`);
    }
  }

  private assertTaskCanSaveForm(task: WorkflowTaskWithRelations) {
    if (!task.isActive) {
      throw new BadRequestException('Workflow task is no longer active.');
    }

    if (task.workflowInstance.status !== WorkflowInstanceStatus.RUNNING) {
      throw new BadRequestException('Workflow instance is not in running state.');
    }

    if (
      task.status !== WorkflowTaskStatus.PENDING &&
      task.status !== WorkflowTaskStatus.READY &&
      task.status !== WorkflowTaskStatus.IN_PROGRESS &&
      task.status !== WorkflowTaskStatus.RETURNED
    ) {
      throw new BadRequestException(`${task.nodeName} 当前状态不允许保存表单。`);
    }
  }

  private assertActorCanOperateTask(
    task: WorkflowTaskWithRelations,
    actor: AuthenticatedUser,
  ) {
    if (actor.isSystemAdmin || actor.roleCodes.includes('admin') || actor.roleCodes.includes('project_manager')) {
      return;
    }

    if (
      task.nodeCode === WorkflowNodeCode.PAINT_PROCUREMENT &&
      actor.roleCodes.includes('purchaser')
    ) {
      return;
    }

    if (
      task.nodeCode === WorkflowNodeCode.PERFORMANCE_TEST &&
      (actor.roleCodes.includes('quality_engineer') ||
        actor.roleCodes.includes('process_engineer'))
    ) {
      return;
    }

    if (
      (task.nodeCode === WorkflowNodeCode.STANDARD_BOARD_PRODUCTION ||
        task.nodeCode === WorkflowNodeCode.BOARD_DETAIL_UPDATE) &&
      (actor.roleCodes.includes('quality_engineer') ||
        actor.roleCodes.includes('process_engineer'))
    ) {
      return;
    }

    if (
      (task.nodeCode === WorkflowNodeCode.FIRST_UNIT_PRODUCTION_PLAN ||
        task.nodeCode === WorkflowNodeCode.TRIAL_PRODUCTION ||
        task.nodeCode === WorkflowNodeCode.MASS_PRODUCTION_PLAN ||
        task.nodeCode === WorkflowNodeCode.MASS_PRODUCTION ||
        task.nodeCode === WorkflowNodeCode.PROJECT_CLOSED) &&
      actor.roleCodes.includes('process_engineer')
    ) {
      return;
    }

    if (
      (task.nodeCode === WorkflowNodeCode.CAB_REVIEW ||
        task.nodeCode === WorkflowNodeCode.COLOR_CONSISTENCY_REVIEW ||
        task.nodeCode === WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW) &&
      (actor.roleCodes.includes('reviewer') ||
        actor.roleCodes.includes('quality_engineer'))
    ) {
      return;
    }

    if (
      task.nodeCode === WorkflowNodeCode.DEVELOPMENT_ACCEPTANCE &&
      actor.roleCodes.includes('finance')
    ) {
      return;
    }

    if (!task.assigneeUserId || task.assigneeUserId === actor.id) {
      return;
    }

    throw new BadRequestException(`${task.nodeName} 仅允许当前负责人执行。`);
  }

  private async assertNoActiveTaskForNode(
    tx: Prisma.TransactionClient,
    input: {
      workflowInstanceId: string;
      nodeCode: WorkflowNodeCode;
      isPrimary: boolean;
    },
  ) {
    const activeTask = await tx.workflowTask.findFirst({
      where: {
        workflowInstanceId: input.workflowInstanceId,
        nodeCode: input.nodeCode,
        isActive: true,
        isPrimary: input.isPrimary,
      },
      select: {
        id: true,
      },
    });

    if (activeTask) {
      throw new BadRequestException(
        `${getCurrentNodeName(input.nodeCode)} 已存在活跃${input.isPrimary ? '主' : '并行'}任务。`,
      );
    }
  }

  private async applyWorkflowCompletionIfNeeded(
    tx: Prisma.TransactionClient,
    task: {
      workflowInstanceId: string;
      projectId: string;
      nodeCode: WorkflowNodeCode;
      status: WorkflowTaskStatus;
    },
  ) {
    if (
      task.nodeCode !== WorkflowNodeCode.PROJECT_CLOSED ||
      task.status !== WorkflowTaskStatus.COMPLETED
    ) {
      return;
    }

    const now = new Date();

    await tx.workflowInstance.update({
      where: { id: task.workflowInstanceId },
      data: {
        status: WorkflowInstanceStatus.COMPLETED,
        completedAt: now,
        currentNodeCode: WorkflowNodeCode.PROJECT_CLOSED,
      },
    });

    await tx.project.update({
      where: { id: task.projectId },
      data: {
        status: ProjectStatus.COMPLETED,
        currentNodeCode: WorkflowNodeCode.PROJECT_CLOSED,
        actualEndDate: now,
        closedAt: now,
      },
    });
  }

  private async syncWorkflowState(
    tx: Prisma.TransactionClient,
    workflowInstanceId: string,
    projectId: string,
  ) {
    await this.workflowDeadlineService.refreshWorkflowInstanceTaskDeadlines(
      tx,
      workflowInstanceId,
    );
    const activePrimaryTask = await tx.workflowTask.findFirst({
      where: {
        workflowInstanceId,
        isActive: true,
        isPrimary: true,
      },
      orderBy: [
        { status: 'asc' },
        { createdAt: 'asc' },
      ],
      select: {
        nodeCode: true,
      },
    });

    const currentNodeCode = activePrimaryTask?.nodeCode ?? null;
    const project = await tx.project.findUnique({
      where: { id: projectId },
      select: {
        actualStartDate: true,
      },
    });

    await tx.workflowInstance.update({
      where: { id: workflowInstanceId },
      data: {
        currentNodeCode,
      },
    });

    if (currentNodeCode) {
      await tx.project.update({
        where: { id: projectId },
        data: {
          status: ProjectStatus.IN_PROGRESS,
          currentNodeCode,
          ...(currentNodeCode === INITIAL_WORKFLOW_NODE
            ? {}
            : { actualStartDate: project?.actualStartDate ?? new Date() }),
        },
      });
    }

    return {
      currentNodeCode,
    };
  }

  private async getTaskOrThrow(tx: Prisma.TransactionClient, taskId: string) {
    const task = await tx.workflowTask.findUnique({
      where: { id: taskId },
      include: {
        workflowInstance: true,
        project: true,
        assigneeUser: true,
        assigneeDepartment: true,
      },
    });

    if (!task) {
      throw new NotFoundException('Workflow task not found.');
    }

    return task;
  }

  private async getWorkflowInstanceByProjectOrThrow(
    db: WorkflowDbClient,
    projectId: string,
  ) {
    const workflowInstance = await db.workflowInstance.findFirst({
      where: {
        projectId,
      },
      orderBy: {
        versionNo: 'desc',
      },
    });

    if (!workflowInstance) {
      throw new NotFoundException('Workflow instance not found.');
    }

    return workflowInstance;
  }

  private async getProjectWorkflowByInstance(
    db: WorkflowDbClient,
    workflowInstanceId: string,
  ) {
    await this.workflowDeadlineService.refreshWorkflowInstanceTaskDeadlines(
      db,
      workflowInstanceId,
    );
    const workflowInstance = await db.workflowInstance.findUnique({
      where: { id: workflowInstanceId },
    });

    if (!workflowInstance) {
      throw new NotFoundException('Workflow instance not found.');
    }

    const tasks = await db.workflowTask.findMany({
      where: {
        workflowInstanceId,
      },
      include: {
        assigneeUser: true,
        assigneeDepartment: true,
      },
      orderBy: [
        { createdAt: 'asc' },
        { taskRound: 'asc' },
      ],
    });

    return {
      projectId: workflowInstance.projectId,
      workflowInstance: this.toWorkflowInstanceSummary(workflowInstance),
      activeTasks: tasks
        .filter((task) => task.isActive)
        .map((task) => this.toWorkflowTaskSummary(task)),
      taskHistory: tasks.map((task) => this.toWorkflowTaskSummary(task)),
    };
  }

  private async buildTaskDetailResponse(db: WorkflowDbClient, taskId: string) {
    const task = await this.getTaskOrThrow(db, taskId);
    const transitions = await db.workflowTransition.findMany({
      where: {
        OR: [
          { fromTaskId: taskId },
          { toTaskId: taskId },
        ],
      },
      include: {
        operatorUser: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return {
      project: {
        id: task.project.id,
        code: task.project.code,
        name: task.project.name,
        status: task.project.status,
        currentNodeCode: task.project.currentNodeCode,
        currentNodeName: getCurrentNodeName(task.project.currentNodeCode),
      },
      workflowInstance: this.toWorkflowInstanceSummary(task.workflowInstance),
      task: this.toWorkflowTaskSummary(task),
      transitions: transitions.map((transition) => ({
        id: transition.id,
        action: transition.action,
        comment: transition.comment,
        fromTaskId: transition.fromTaskId,
        fromNodeCode: transition.fromNodeCode,
        toTaskId: transition.toTaskId,
        toNodeCode: transition.toNodeCode,
        operatorUserId: transition.operatorUserId,
        operatorName: transition.operatorUser?.name ?? null,
        createdAt: transition.createdAt.toISOString(),
      })),
    };
  }

  private toWorkflowInstanceSummary(
    workflowInstance: Prisma.WorkflowInstanceGetPayload<Record<string, never>>,
  ) {
    return {
      id: workflowInstance.id,
      instanceNo: workflowInstance.instanceNo,
      versionNo: workflowInstance.versionNo,
      status: workflowInstance.status,
      currentNodeCode: workflowInstance.currentNodeCode,
      currentNodeName: getCurrentNodeName(workflowInstance.currentNodeCode),
      startedAt: workflowInstance.startedAt?.toISOString() ?? null,
      completedAt: workflowInstance.completedAt?.toISOString() ?? null,
      cancelledAt: workflowInstance.cancelledAt?.toISOString() ?? null,
    };
  }

  private toWorkflowTaskSummary(
    task: Prisma.WorkflowTaskGetPayload<{
      include: {
        assigneeUser: true;
        assigneeDepartment: true;
      };
    }>,
  ) {
    return {
      id: task.id,
      taskNo: task.taskNo,
      nodeCode: task.nodeCode,
      nodeName: task.nodeName,
      taskRound: task.taskRound,
      status: task.status,
      isPrimary: task.isPrimary,
      isActive: task.isActive,
      assigneeUserId: task.assigneeUserId,
      assigneeUserName: task.assigneeUser?.name ?? null,
      assigneeDepartmentId: task.assigneeDepartmentId,
      assigneeDepartmentName: task.assigneeDepartment?.name ?? null,
      dueAt: task.dueAt?.toISOString() ?? null,
      startedAt: task.startedAt?.toISOString() ?? null,
      completedAt: task.completedAt?.toISOString() ?? null,
      returnedAt: task.returnedAt?.toISOString() ?? null,
      payload: task.payload,
      availableActions: task.isActive
        ? getAllowedWorkflowActions(task.nodeCode).filter((action) =>
            isWorkflowActionCurrentlyAvailable(task.status, action),
          )
        : [],
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    };
  }

  private toRecurringTaskSummary(
    task: {
      id: string;
      recurringPlanId: string;
      taskCode: string;
      periodIndex: number;
      periodLabel: string;
      plannedDate: Date;
      dueAt: Date | null;
      completedAt: Date | null;
      reviewerId: string | null;
      status: RecurringTaskStatus;
      result: Prisma.RecurringTaskGetPayload<Record<string, never>>['result'];
      comment: string | null;
      payload: Prisma.JsonValue | null;
      createdAt: Date;
      updatedAt: Date;
    },
  ) {
    return {
      id: task.id,
      recurringPlanId: task.recurringPlanId,
      taskCode: task.taskCode,
      periodIndex: task.periodIndex,
      periodLabel: task.periodLabel,
      plannedDate: task.plannedDate.toISOString(),
      dueAt: task.dueAt?.toISOString() ?? null,
      completedAt: task.completedAt?.toISOString() ?? null,
      reviewerId: task.reviewerId,
      status: task.status,
      result: task.result,
      comment: task.comment,
      payload: task.payload,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    };
  }

  private toMonthlyReviewRecordSummary(
    review: Prisma.ReviewRecordGetPayload<{
      include: {
        reviewer: {
          select: {
            id: true;
            name: true;
          };
        };
      };
    }>,
  ) {
    return {
      id: review.id,
      reviewType: review.reviewType,
      result: review.result,
      comment: review.comment,
      rejectReason: review.rejectReason,
      returnToNodeCode: review.returnToNodeCode,
      reviewerId: review.reviewerId,
      reviewerName: review.reviewer?.name ?? null,
      reviewedAt: review.reviewedAt?.toISOString() ?? null,
      submittedAt: review.submittedAt?.toISOString() ?? null,
      createdAt: review.createdAt.toISOString(),
      updatedAt: review.updatedAt.toISOString(),
    };
  }

  private parseActionInput(rawInput: unknown): WorkflowActionInput {
    if (rawInput === undefined || rawInput === null) {
      return {};
    }

    if (typeof rawInput !== 'object' || Array.isArray(rawInput)) {
      throw new BadRequestException('Invalid workflow action payload.');
    }

    const input = rawInput as Record<string, unknown>;
    const comment =
      typeof input.comment === 'string' && input.comment.trim().length > 0
        ? input.comment.trim()
        : undefined;
    const targetNodeCode =
      typeof input.targetNodeCode === 'string' &&
      Object.values(WorkflowNodeCode).includes(input.targetNodeCode as WorkflowNodeCode)
        ? (input.targetNodeCode as WorkflowNodeCode)
        : undefined;
    const metadata =
      input.metadata === undefined
        ? undefined
        : (JSON.parse(JSON.stringify(input.metadata)) as Prisma.InputJsonValue);

    return {
      ...(comment ? { comment } : {}),
      ...(targetNodeCode ? { targetNodeCode } : {}),
      ...(metadata === undefined ? {} : { metadata }),
    };
  }

  private parseFormSaveInput(rawInput: unknown): WorkflowFormSaveInput {
    if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
      throw new BadRequestException('Invalid workflow form payload.');
    }

    const input = rawInput as Record<string, unknown>;

    if (!input.payload || typeof input.payload !== 'object' || Array.isArray(input.payload)) {
      throw new BadRequestException('payload must be a plain object.');
    }

    const comment =
      typeof input.comment === 'string' && input.comment.trim().length > 0
        ? input.comment.trim()
        : undefined;

    return {
      payload: input.payload as Record<string, unknown>,
      ...(comment ? { comment } : {}),
    };
  }

  private buildInstanceNo() {
    return `WF-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }

  private buildTaskNo() {
    return `TASK-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }

  private resolveReviewPassAt(input: WorkflowActionInput) {
    if (!input.metadata || typeof input.metadata !== 'object' || Array.isArray(input.metadata)) {
      return null;
    }

    const reviewPassAt = (input.metadata as Record<string, unknown>).reviewPassAt;
    if (typeof reviewPassAt !== 'string' || reviewPassAt.trim().length === 0) {
      return null;
    }

    const parsed = new Date(reviewPassAt);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private asJsonObject(value: Prisma.JsonValue | null | undefined) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {} as Record<string, Prisma.InputJsonValue>;
    }

    return value as Record<string, Prisma.InputJsonValue>;
  }

  private getMonthlyReviewPeriodRange(plannedDate: Date) {
    const year = plannedDate.getUTCFullYear();
    const month = plannedDate.getUTCMonth();

    return {
      periodStart: new Date(Date.UTC(year, month, 1, 0, 0, 0, 0)),
      periodEnd: new Date(Date.UTC(year, month + 1, 1, 0, 0, 0, 0)),
    };
  }

  private async maybeCreateRecurringPlan(
    tx: Prisma.TransactionClient,
    sourceTask: WorkflowTaskWithRelations,
    updatedTask: {
      nodeCode: WorkflowNodeCode;
      status: WorkflowTaskStatus;
      completedAt: Date | null;
    },
    createdTasks: Array<{
      id: string;
      nodeCode: WorkflowNodeCode;
      nodeName: string;
      isPrimary: boolean;
      taskRound: number;
    }>,
  ) {
    if (
      sourceTask.nodeCode !== WorkflowNodeCode.MASS_PRODUCTION ||
      updatedTask.status !== WorkflowTaskStatus.COMPLETED
    ) {
      return null;
    }

    const monthlyReviewTask = createdTasks.find(
      (task) => task.nodeCode === WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW,
    );

    if (!monthlyReviewTask) {
      return null;
    }

    return this.workflowRecurringService.ensureMonthlyReviewPlan(tx, {
      projectId: sourceTask.projectId,
      sourceWorkflowTaskId: monthlyReviewTask.id,
      startAt: updatedTask.completedAt ?? new Date(),
      reviewerId: sourceTask.assigneeUserId ?? sourceTask.project.ownerUserId ?? null,
    });
  }
}
