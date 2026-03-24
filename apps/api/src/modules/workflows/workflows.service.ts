import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditTargetType,
  NotificationType,
  ProjectStatus,
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
import { NotificationQueueService } from '../queue/notification-queue.service';
import {
  DEFAULT_WORKFLOW_TEMPLATE,
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
  ) {}

  async initializeProjectWorkflow(
    tx: Prisma.TransactionClient,
    input: InitializeWorkflowInput,
  ) {
    const now = new Date();
    const nodeCode = INITIAL_WORKFLOW_NODE;
    const projectSchedule = await tx.project.findUnique({
      where: { id: input.projectId },
      select: {
        plannedStartDate: true,
        plannedEndDate: true,
      },
    });

    const instance = await tx.workflowInstance.create({
      data: {
        projectId: input.projectId,
        instanceNo: this.buildInstanceNo(),
        versionNo: 1,
        templateCode: DEFAULT_WORKFLOW_TEMPLATE,
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
        taskRound: 1,
        status: WorkflowTaskStatus.READY,
        isPrimary: true,
        isActive: true,
        assigneeUserId: input.ownerUserId ?? null,
        dueAt: this.computeDueAt(projectSchedule, nodeCode),
        payload: {
          autoInitialized: true,
          templateCode: DEFAULT_WORKFLOW_TEMPLATE,
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

  async getProjectWorkflow(projectId: string) {
    const workflowInstance = await this.getWorkflowInstanceByProjectOrThrow(this.prisma, projectId);
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

  async getWorkflowTimeline(projectId: string) {
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
        ...(action === WorkflowAction.RETURN ? { returnedAt: now } : { completedAt: now }),
      },
    });

    const createdTasks = await this.createNextTasks(tx, task, actor, action, input, nextTemplates);

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

      const createdTask = await tx.workflowTask.create({
        data: {
          workflowInstanceId: sourceTask.workflowInstanceId,
          projectId: sourceTask.projectId,
          taskNo: this.buildTaskNo(),
          nodeCode: template.nodeCode,
          nodeName: nextNodeMeta.name,
          taskRound: (previousTask?.taskRound ?? 0) + 1,
          status: WorkflowTaskStatus.READY,
          isPrimary,
          isActive: true,
          assigneeUserId: sourceTask.project.ownerUserId ?? sourceTask.assigneeUserId ?? null,
          dueAt: this.computeDueAt(sourceTask.project, template.nodeCode),
          payload: {
            autoCreated: true,
            triggerAction: action,
            fromTaskId: sourceTask.id,
            fromNodeCode: sourceTask.nodeCode,
            reason: template.reason,
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

  private buildInstanceNo() {
    return `WF-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }

  private buildTaskNo() {
    return `TASK-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }

  private computeDueAt(
    schedule: {
      plannedStartDate: Date | null;
      plannedEndDate: Date | null;
    } | null,
    nodeCode: WorkflowNodeCode,
  ) {
    if (!schedule) {
      return null;
    }

    if (schedule.plannedStartDate && schedule.plannedEndDate) {
      const sequences = Object.values(WorkflowNodeCode).map(
        (currentNodeCode) => getWorkflowNodeMeta(currentNodeCode).sequence,
      );
      const maxSequence = Math.max(...sequences);
      const currentSequence = getWorkflowNodeMeta(nodeCode).sequence;
      const totalDuration =
        schedule.plannedEndDate.getTime() - schedule.plannedStartDate.getTime();
      const ratio = maxSequence > 0 ? currentSequence / maxSequence : 1;

      return new Date(schedule.plannedStartDate.getTime() + totalDuration * ratio);
    }

    return schedule.plannedEndDate ?? schedule.plannedStartDate;
  }
}
