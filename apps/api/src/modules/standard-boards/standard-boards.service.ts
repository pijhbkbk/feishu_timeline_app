import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditTargetType,
  ColorBoardDetailUpdateStatus,
  DistributionStatus,
  Prisma,
  SampleStatus,
  StandardBoardStatus,
  WorkflowAction,
  WorkflowNodeCode,
  WorkflowTaskStatus,
} from '@prisma/client';

import { PrismaService } from '../../infra/prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  getAllowedWorkflowActions,
  getCurrentNodeName,
  isWorkflowActionCurrentlyAvailable,
} from '../workflows/workflow-node.constants';
import { WorkflowsService } from '../workflows/workflows.service';
import {
  canEditStandardBoard,
  getBoardDetailUpdateCompletionIssue,
  getBoardDetailUpdateStageIssue,
  getStandardBoardCompletionIssue,
  getStandardBoardStageIssue,
  getStandardBoardStatusTransitionTarget,
  type StandardBoardLifecycleAction,
} from './standard-boards.rules';

type StandardBoardsDbClient = Prisma.TransactionClient | PrismaService;

type StandardBoardWriteInput = {
  boardCode: string;
  versionNo: number;
  basedOnSampleId: string | null;
  remark: string | null;
};

type IssueBoardInput = {
  recipientName: string | null;
  recipientDept: string | null;
  issuedAt: Date;
  remark: string | null;
};

type DistributionWriteInput = {
  receiverName: string;
  receiverDept: string;
  sentAt: Date;
  signedAt: Date | null;
  note: string | null;
};

type ColorBoardDetailUpdateWriteInput = {
  standardBoardId: string;
  updateStatus: ColorBoardDetailUpdateStatus;
  detailUpdatedAt: Date;
  note: string | null;
};

const COLOR_BOARD_DETAIL_UPDATE_STATUS_VALUES = Object.values(
  ColorBoardDetailUpdateStatus,
);

const STANDARD_BOARD_INCLUDE = {
  basedOnSample: true,
  issuedBy: true,
  distributionRecords: {
    orderBy: [
      { sentAt: 'desc' as const },
      { createdAt: 'desc' as const },
    ],
  },
} satisfies Prisma.StandardBoardInclude;

const COLOR_BOARD_DETAIL_UPDATE_INCLUDE = {
  standardBoard: {
    include: {
      basedOnSample: true,
      issuedBy: true,
    },
  },
  updatedBy: true,
} satisfies Prisma.ColorBoardDetailUpdateInclude;

@Injectable()
export class StandardBoardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLogsService: ActivityLogsService,
    private readonly workflowsService: WorkflowsService,
  ) {}

  getWorkspace(projectId: string) {
    return this.buildWorkspace(this.prisma, projectId);
  }

  async getCurrentBoard(projectId: string) {
    const board = await this.prisma.standardBoard.findFirst({
      where: {
        projectId,
        isCurrent: true,
      },
      include: STANDARD_BOARD_INCLUDE,
      orderBy: [
        { versionNo: 'desc' },
        { updatedAt: 'desc' },
      ],
    });

    return board ? this.toStandardBoardSummary(board) : null;
  }

  getColorBoardDetailUpdateWorkspace(projectId: string) {
    return this.buildColorBoardDetailUpdateWorkspace(this.prisma, projectId);
  }

  async createStandardBoard(
    projectId: string,
    rawInput: unknown,
    actor: AuthenticatedUser,
  ) {
    this.assertActorCanManage(actor);
    const input = this.parseBoardWriteInput(rawInput);

    await this.prisma.$transaction(async (tx) => {
      const context = await this.getStandardBoardContext(tx, projectId);
      this.assertWritableStandardBoardStage(context);
      await this.assertSampleReference(tx, projectId, input.basedOnSampleId);
      await this.assertUniqueBoardVersion(tx, projectId, input.boardCode, input.versionNo);

      const hasCurrentBoard = context.boards.some((board) => board.isCurrent);
      const board = await tx.standardBoard.create({
        data: {
          projectId,
          boardCode: input.boardCode,
          versionNo: input.versionNo,
          basedOnSampleId: input.basedOnSampleId,
          remark: input.remark,
          isCurrent: !hasCurrentBoard,
        },
        include: STANDARD_BOARD_INCLUDE,
      });

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.STANDARD_BOARD,
        targetId: board.id,
        action: 'STANDARD_BOARD_CREATED',
        nodeCode: WorkflowNodeCode.STANDARD_BOARD_PRODUCTION,
        summary: `创建标准板 ${board.boardCode} V${board.versionNo}`,
        afterData: this.toStandardBoardAuditSnapshot(board),
      });
    });

    return this.buildWorkspace(this.prisma, projectId);
  }

  async updateStandardBoard(
    projectId: string,
    boardId: string,
    rawInput: unknown,
    actor: AuthenticatedUser,
  ) {
    this.assertActorCanManage(actor);
    const input = this.parseBoardWriteInput(rawInput);

    await this.prisma.$transaction(async (tx) => {
      const context = await this.getStandardBoardContext(tx, projectId);
      this.assertWritableStandardBoardStage(context);
      const board = await this.getBoardOrThrow(tx, projectId, boardId);

      if (!canEditStandardBoard(board.status)) {
        throw new BadRequestException('已下发或已归档的标准板不允许编辑。');
      }

      await this.assertSampleReference(tx, projectId, input.basedOnSampleId);
      if (
        board.boardCode !== input.boardCode ||
        board.versionNo !== input.versionNo
      ) {
        await this.assertUniqueBoardVersion(
          tx,
          projectId,
          input.boardCode,
          input.versionNo,
          board.id,
        );
      }

      const updatedBoard = await tx.standardBoard.update({
        where: { id: boardId },
        data: {
          boardCode: input.boardCode,
          versionNo: input.versionNo,
          basedOnSampleId: input.basedOnSampleId,
          remark: input.remark,
        },
        include: STANDARD_BOARD_INCLUDE,
      });

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.STANDARD_BOARD,
        targetId: boardId,
        action: 'STANDARD_BOARD_UPDATED',
        nodeCode: WorkflowNodeCode.STANDARD_BOARD_PRODUCTION,
        summary: `更新标准板 ${updatedBoard.boardCode} V${updatedBoard.versionNo}`,
        beforeData: this.toStandardBoardAuditSnapshot(board),
        afterData: this.toStandardBoardAuditSnapshot(updatedBoard),
      });
    });

    return this.buildWorkspace(this.prisma, projectId);
  }

  async setCurrentBoard(
    projectId: string,
    boardId: string,
    actor: AuthenticatedUser,
  ) {
    this.assertActorCanManage(actor);

    await this.prisma.$transaction(async (tx) => {
      const context = await this.getStandardBoardContext(tx, projectId);
      this.assertWritableStandardBoardStage(context);
      const board = await this.getBoardOrThrow(tx, projectId, boardId);

      if (board.status === StandardBoardStatus.ARCHIVED) {
        throw new BadRequestException('已归档的标准板不能设置为当前版本。');
      }

      await tx.standardBoard.updateMany({
        where: {
          projectId,
          isCurrent: true,
        },
        data: {
          isCurrent: false,
        },
      });

      const updatedBoard = await tx.standardBoard.update({
        where: { id: boardId },
        data: {
          isCurrent: true,
        },
        include: STANDARD_BOARD_INCLUDE,
      });

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.STANDARD_BOARD,
        targetId: boardId,
        action: 'STANDARD_BOARD_SET_CURRENT',
        nodeCode: WorkflowNodeCode.STANDARD_BOARD_PRODUCTION,
        summary: `设置当前标准板版本为 ${updatedBoard.boardCode} V${updatedBoard.versionNo}`,
        beforeData: this.toStandardBoardAuditSnapshot(board),
        afterData: this.toStandardBoardAuditSnapshot(updatedBoard),
      });
    });

    return this.buildWorkspace(this.prisma, projectId);
  }

  async markCreated(
    projectId: string,
    boardId: string,
    actor: AuthenticatedUser,
  ) {
    return this.transitionBoardStatus(
      projectId,
      boardId,
      'MARK_CREATED',
      actor,
      'STANDARD_BOARD_MARK_CREATED',
      '标准板已标记制作完成。',
    );
  }

  async issueBoard(
    projectId: string,
    boardId: string,
    rawInput: unknown,
    actor: AuthenticatedUser,
  ) {
    this.assertActorCanManage(actor);
    const input = this.parseIssueBoardInput(rawInput);

    await this.prisma.$transaction(async (tx) => {
      const context = await this.getStandardBoardContext(tx, projectId);
      this.assertWritableStandardBoardStage(context);
      const board = await this.getBoardOrThrow(tx, projectId, boardId);
      const nextStatus = getStandardBoardStatusTransitionTarget(
        board.status,
        'ISSUE',
      );

      if (!nextStatus) {
        throw new BadRequestException('当前标准板状态不允许标记为已下发。');
      }

      const issuedBoard = await tx.standardBoard.update({
        where: { id: boardId },
        data: {
          status: nextStatus,
          issuedAt: input.issuedAt,
          issuedById: actor.id,
          recipientName: input.recipientName,
          recipientDept: input.recipientDept,
          ...(input.remark !== null ? { remark: input.remark } : {}),
        },
        include: STANDARD_BOARD_INCLUDE,
      });

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.STANDARD_BOARD,
        targetId: boardId,
        action: 'STANDARD_BOARD_ISSUED',
        nodeCode: WorkflowNodeCode.STANDARD_BOARD_PRODUCTION,
        summary: `标准板 ${issuedBoard.boardCode} V${issuedBoard.versionNo} 已下发。`,
        beforeData: this.toStandardBoardAuditSnapshot(board),
        afterData: this.toStandardBoardAuditSnapshot(issuedBoard),
      });
    });

    return this.buildWorkspace(this.prisma, projectId);
  }

  async addDistribution(
    projectId: string,
    boardId: string,
    rawInput: unknown,
    actor: AuthenticatedUser,
  ) {
    this.assertActorCanManage(actor);
    const input = this.parseDistributionWriteInput(rawInput);

    await this.prisma.$transaction(async (tx) => {
      const context = await this.getStandardBoardContext(tx, projectId);
      this.assertWritableStandardBoardStage(context);
      const board = await this.getBoardOrThrow(tx, projectId, boardId);

      if (board.status !== StandardBoardStatus.ISSUED) {
        throw new BadRequestException('仅已下发的标准板才能添加下发记录。');
      }

      const distributionRecord = await tx.boardDistributionRecord.create({
        data: {
          projectId,
          standardBoardId: boardId,
          receiverName: input.receiverName,
          receiverDept: input.receiverDept,
          sentAt: input.sentAt,
          signedAt: input.signedAt,
          note: input.note,
          status: input.signedAt ? DistributionStatus.RECEIVED : DistributionStatus.SENT,
        },
      });

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.STANDARD_BOARD,
        targetId: boardId,
        action: 'STANDARD_BOARD_DISTRIBUTION_ADDED',
        nodeCode: WorkflowNodeCode.STANDARD_BOARD_PRODUCTION,
        summary: `新增标准板 ${board.boardCode} V${board.versionNo} 下发记录。`,
        afterData: {
          distributionRecordId: distributionRecord.id,
          receiverName: distributionRecord.receiverName,
          receiverDept: distributionRecord.receiverDept,
          sentAt: distributionRecord.sentAt?.toISOString() ?? null,
          signedAt: distributionRecord.signedAt?.toISOString() ?? null,
        },
      });
    });

    return this.buildWorkspace(this.prisma, projectId);
  }

  async createColorBoardDetailUpdate(
    projectId: string,
    rawInput: unknown,
    actor: AuthenticatedUser,
  ) {
    this.assertActorCanManage(actor);
    const input = this.parseColorBoardDetailUpdateWriteInput(rawInput);

    await this.prisma.$transaction(async (tx) => {
      const context = await this.getColorBoardDetailUpdateContext(tx, projectId);
      this.assertWritableBoardDetailUpdateStage(context);
      await this.getBoardOrThrow(tx, projectId, input.standardBoardId);

      const detailUpdate = await tx.colorBoardDetailUpdate.create({
        data: {
          projectId,
          standardBoardId: input.standardBoardId,
          updateStatus: input.updateStatus,
          detailUpdatedAt: input.detailUpdatedAt,
          note: input.note,
          updatedById: actor.id,
        },
        include: COLOR_BOARD_DETAIL_UPDATE_INCLUDE,
      });

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.STANDARD_BOARD,
        targetId: input.standardBoardId,
        action: 'COLOR_BOARD_DETAIL_UPDATE_CREATED',
        nodeCode: WorkflowNodeCode.BOARD_DETAIL_UPDATE,
        summary: '新增色板明细更新记录。',
        afterData: this.toColorBoardDetailUpdateAuditSnapshot(detailUpdate),
      });
    });

    return this.buildWorkspace(this.prisma, projectId);
  }

  async completeStandardBoardTask(projectId: string, actor: AuthenticatedUser) {
    this.assertActorCanManage(actor);

    await this.prisma.$transaction(async (tx) => {
      const context = await this.getStandardBoardContext(tx, projectId);
      this.assertWritableStandardBoardStage(context);

      if (!context.activeTask) {
        throw new BadRequestException('当前没有可完成的标准板制作、下发任务。');
      }

      const completionIssue = getStandardBoardCompletionIssue(context.boards);

      if (completionIssue) {
        throw new BadRequestException(completionIssue);
      }

      await this.workflowsService.transitionTaskWithExecutor(
        tx,
        context.activeTask.id,
        WorkflowAction.COMPLETE,
        actor,
        {
          comment: '标准板制作、下发节点已完成，自动激活色板明细更新。',
          metadata: {
            issuedBoardCount: context.boards.filter(
              (board) => board.status === StandardBoardStatus.ISSUED,
            ).length,
          },
        },
      );

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.WORKFLOW_TASK,
        targetId: context.activeTask.id,
        action: 'STANDARD_BOARD_TASK_COMPLETED',
        nodeCode: WorkflowNodeCode.STANDARD_BOARD_PRODUCTION,
        summary: '标准板制作、下发节点已完成。',
      });
    });

    return this.buildWorkspace(this.prisma, projectId);
  }

  async completeColorBoardDetailUpdateTask(
    projectId: string,
    actor: AuthenticatedUser,
  ) {
    this.assertActorCanManage(actor);

    await this.prisma.$transaction(async (tx) => {
      const context = await this.getColorBoardDetailUpdateContext(tx, projectId);
      this.assertWritableBoardDetailUpdateStage(context);

      if (!context.activeTask) {
        throw new BadRequestException('当前没有可完成的色板明细更新任务。');
      }

      const completionIssue = getBoardDetailUpdateCompletionIssue(context.updates);

      if (completionIssue) {
        throw new BadRequestException(completionIssue);
      }

      await this.workflowsService.transitionTaskWithExecutor(
        tx,
        context.activeTask.id,
        WorkflowAction.COMPLETE,
        actor,
        {
          comment: '色板明细更新节点已完成。',
          metadata: {
            updatedRecordCount: context.updates.filter(
              (updateRecord) =>
                updateRecord.updateStatus === ColorBoardDetailUpdateStatus.UPDATED,
            ).length,
          },
        },
      );

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.WORKFLOW_TASK,
        targetId: context.activeTask.id,
        action: 'COLOR_BOARD_DETAIL_UPDATE_TASK_COMPLETED',
        nodeCode: WorkflowNodeCode.BOARD_DETAIL_UPDATE,
        summary: '色板明细更新节点已完成。',
      });
    });

    return this.buildWorkspace(this.prisma, projectId);
  }

  private async transitionBoardStatus(
    projectId: string,
    boardId: string,
    action: StandardBoardLifecycleAction,
    actor: AuthenticatedUser,
    auditAction: string,
    summary: string,
  ) {
    this.assertActorCanManage(actor);

    await this.prisma.$transaction(async (tx) => {
      const context = await this.getStandardBoardContext(tx, projectId);
      this.assertWritableStandardBoardStage(context);
      const board = await this.getBoardOrThrow(tx, projectId, boardId);
      const nextStatus = getStandardBoardStatusTransitionTarget(board.status, action);

      if (!nextStatus) {
        throw new BadRequestException('非法标准板状态变更。');
      }

      const updatedBoard = await tx.standardBoard.update({
        where: { id: boardId },
        data: {
          status: nextStatus,
          ...(action === 'MARK_CREATED' ? { producedAt: new Date() } : {}),
        },
        include: STANDARD_BOARD_INCLUDE,
      });

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.STANDARD_BOARD,
        targetId: boardId,
        action: auditAction,
        nodeCode: WorkflowNodeCode.STANDARD_BOARD_PRODUCTION,
        summary: `${updatedBoard.boardCode} V${updatedBoard.versionNo} ${summary}`,
        beforeData: this.toStandardBoardAuditSnapshot(board),
        afterData: this.toStandardBoardAuditSnapshot(updatedBoard),
      });
    });

    return this.buildWorkspace(this.prisma, projectId);
  }

  private async buildWorkspace(
    db: StandardBoardsDbClient,
    projectId: string,
  ) {
    const project = await this.getProjectOrThrow(db, projectId);
    const [
      boards,
      standardBoardTask,
      boardDetailTask,
      procurementCompleted,
      detailUpdates,
      sampleOptions,
    ] = await Promise.all([
      db.standardBoard.findMany({
        where: {
          projectId,
        },
        include: STANDARD_BOARD_INCLUDE,
        orderBy: [
          { isCurrent: 'desc' },
          { boardCode: 'asc' },
          { versionNo: 'desc' },
        ],
      }),
      this.getActiveTask(db, projectId, WorkflowNodeCode.STANDARD_BOARD_PRODUCTION),
      this.getActiveTask(db, projectId, WorkflowNodeCode.BOARD_DETAIL_UPDATE),
      this.hasCompletedProcurementTask(db, projectId),
      db.colorBoardDetailUpdate.findMany({
        where: {
          projectId,
        },
        include: COLOR_BOARD_DETAIL_UPDATE_INCLUDE,
        orderBy: [
          { detailUpdatedAt: 'desc' },
          { createdAt: 'desc' },
        ],
      }),
      db.sample.findMany({
        where: {
          projectId,
          isCurrent: true,
          status: {
            in: [SampleStatus.IN_PREPARATION, SampleStatus.CONFIRMED],
          },
        },
        orderBy: [
          { sampleNo: 'asc' },
          { versionNo: 'desc' },
        ],
      }),
    ]);

    return {
      project: {
        id: project.id,
        code: project.code,
        name: project.name,
        currentNodeCode: project.currentNodeCode,
        currentNodeName: getCurrentNodeName(project.currentNodeCode),
        targetDate: project.plannedEndDate?.toISOString() ?? null,
        riskLevel: project.priority,
      },
      procurementCompleted,
      activeStandardBoardTask: standardBoardTask
        ? this.toWorkflowTaskSummary(standardBoardTask)
        : null,
      activeColorBoardDetailUpdateTask: boardDetailTask
        ? this.toWorkflowTaskSummary(boardDetailTask)
        : null,
      canCompleteStandardBoardTask:
        Boolean(standardBoardTask) &&
        getStandardBoardCompletionIssue(boards) === null,
      standardBoardCompletionIssue: getStandardBoardCompletionIssue(boards),
      canCompleteColorBoardDetailUpdateTask:
        Boolean(boardDetailTask) &&
        getBoardDetailUpdateCompletionIssue(detailUpdates) === null,
      colorBoardDetailUpdateCompletionIssue:
        getBoardDetailUpdateCompletionIssue(detailUpdates),
      sampleOptions: sampleOptions.map((sample) => ({
        id: sample.id,
        sampleNo: sample.sampleNo,
        sampleName: sample.sampleName,
        versionNo: sample.versionNo,
      })),
      currentBoard: boards.find((board) => board.isCurrent)
        ? this.toStandardBoardSummary(boards.find((board) => board.isCurrent)!)
        : null,
      items: boards.map((board) => this.toStandardBoardSummary(board)),
      detailUpdates: detailUpdates.map((updateRecord) =>
        this.toColorBoardDetailUpdateSummary(updateRecord),
      ),
    };
  }

  private async buildColorBoardDetailUpdateWorkspace(
    db: StandardBoardsDbClient,
    projectId: string,
  ) {
    const workspace = await this.buildWorkspace(db, projectId);

    return {
      project: workspace.project,
      activeTask: workspace.activeColorBoardDetailUpdateTask,
      canCompleteTask: workspace.canCompleteColorBoardDetailUpdateTask,
      completionIssue: workspace.colorBoardDetailUpdateCompletionIssue,
      currentBoard: workspace.currentBoard,
      items: workspace.detailUpdates,
    };
  }

  private async getStandardBoardContext(
    db: StandardBoardsDbClient,
    projectId: string,
  ) {
    const [project, activeTask, procurementCompleted, boards] = await Promise.all([
      this.getProjectOrThrow(db, projectId),
      this.getActiveTask(db, projectId, WorkflowNodeCode.STANDARD_BOARD_PRODUCTION),
      this.hasCompletedProcurementTask(db, projectId),
      db.standardBoard.findMany({
        where: {
          projectId,
        },
      }),
    ]);

    return {
      project,
      activeTask,
      procurementCompleted,
      boards,
    };
  }

  private async getColorBoardDetailUpdateContext(
    db: StandardBoardsDbClient,
    projectId: string,
  ) {
    const [project, activeTask, procurementCompleted, updates] = await Promise.all([
      this.getProjectOrThrow(db, projectId),
      this.getActiveTask(db, projectId, WorkflowNodeCode.BOARD_DETAIL_UPDATE),
      this.hasCompletedProcurementTask(db, projectId),
      db.colorBoardDetailUpdate.findMany({
        where: {
          projectId,
        },
      }),
    ]);

    return {
      project,
      activeTask,
      procurementCompleted,
      updates,
    };
  }

  private assertWritableStandardBoardStage(context: {
    procurementCompleted: boolean;
    activeTask: {
      id: string;
    } | null;
  }) {
    const issue = getStandardBoardStageIssue({
      procurementCompleted: context.procurementCompleted,
      hasActiveTask: Boolean(context.activeTask),
    });

    if (issue) {
      throw new BadRequestException(issue);
    }
  }

  private assertWritableBoardDetailUpdateStage(context: {
    activeTask: {
      id: string;
    } | null;
  }) {
    const issue = getBoardDetailUpdateStageIssue({
      hasActiveTask: Boolean(context.activeTask),
    });

    if (issue) {
      throw new BadRequestException(issue);
    }
  }

  private assertActorCanManage(actor: AuthenticatedUser) {
    if (
      actor.isSystemAdmin ||
      actor.roleCodes.some(
        (roleCode) =>
          roleCode === 'admin' ||
          roleCode === 'project_manager' ||
          roleCode === 'process_engineer' ||
          roleCode === 'quality_engineer',
      )
    ) {
      return;
    }

    throw new BadRequestException('当前用户没有标准板管理权限。');
  }

  private async getProjectOrThrow(db: StandardBoardsDbClient, projectId: string) {
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        code: true,
        name: true,
        priority: true,
        currentNodeCode: true,
        plannedEndDate: true,
      },
    });

    if (!project) {
      throw new NotFoundException('项目不存在。');
    }

    return project;
  }

  private async getBoardOrThrow(
    db: StandardBoardsDbClient,
    projectId: string,
    boardId: string,
  ) {
    const board = await db.standardBoard.findFirst({
      where: {
        id: boardId,
        projectId,
      },
      include: STANDARD_BOARD_INCLUDE,
    });

    if (!board) {
      throw new NotFoundException('标准板不存在。');
    }

    return board;
  }

  private async assertSampleReference(
    db: StandardBoardsDbClient,
    projectId: string,
    sampleId: string | null,
  ) {
    if (!sampleId) {
      return;
    }

    const sample = await db.sample.findFirst({
      where: {
        id: sampleId,
        projectId,
      },
      select: {
        id: true,
      },
    });

    if (!sample) {
      throw new BadRequestException('关联样板不存在。');
    }
  }

  private async assertUniqueBoardVersion(
    db: StandardBoardsDbClient,
    projectId: string,
    boardCode: string,
    versionNo: number,
    excludedBoardId?: string,
  ) {
    const duplicatedBoard = await db.standardBoard.findFirst({
      where: {
        projectId,
        boardCode,
        versionNo,
        ...(excludedBoardId
          ? {
              NOT: {
                id: excludedBoardId,
              },
            }
          : {}),
      },
      select: {
        id: true,
      },
    });

    if (duplicatedBoard) {
      throw new BadRequestException('标准板编号与版本号组合已存在。');
    }
  }

  private async getActiveTask(
    db: StandardBoardsDbClient,
    projectId: string,
    nodeCode: 'STANDARD_BOARD_PRODUCTION' | 'BOARD_DETAIL_UPDATE',
  ) {
    return db.workflowTask.findFirst({
      where: {
        projectId,
        nodeCode,
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
    });
  }

  private async hasCompletedProcurementTask(
    db: StandardBoardsDbClient,
    projectId: string,
  ) {
    const completedTask = await db.workflowTask.findFirst({
      where: {
        projectId,
        nodeCode: WorkflowNodeCode.PAINT_PROCUREMENT,
        status: WorkflowTaskStatus.COMPLETED,
      },
      select: {
        id: true,
      },
    });

    return Boolean(completedTask);
  }

  private parseBoardWriteInput(rawInput: unknown): StandardBoardWriteInput {
    if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
      throw new BadRequestException('标准板数据格式不正确。');
    }

    const input = rawInput as Record<string, unknown>;
    const boardCode = typeof input.boardCode === 'string' ? input.boardCode.trim() : '';
    const versionNo = this.parsePositiveInteger(input.versionNo, '版本号');
    const basedOnSampleId =
      typeof input.basedOnSampleId === 'string' && input.basedOnSampleId.trim().length > 0
        ? input.basedOnSampleId.trim()
        : null;
    const remark =
      typeof input.remark === 'string' && input.remark.trim().length > 0
        ? input.remark.trim()
        : null;

    if (!boardCode) {
      throw new BadRequestException('标准板编号不能为空。');
    }

    return {
      boardCode,
      versionNo,
      basedOnSampleId,
      remark,
    };
  }

  private parseIssueBoardInput(rawInput: unknown): IssueBoardInput {
    if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
      throw new BadRequestException('标准板下发数据格式不正确。');
    }

    const input = rawInput as Record<string, unknown>;
    const recipientName =
      typeof input.recipientName === 'string' && input.recipientName.trim().length > 0
        ? input.recipientName.trim()
        : null;
    const recipientDept =
      typeof input.recipientDept === 'string' && input.recipientDept.trim().length > 0
        ? input.recipientDept.trim()
        : null;
    const issuedAt =
      input.issuedAt === undefined || input.issuedAt === null || input.issuedAt === ''
        ? new Date()
        : this.parseDate(input.issuedAt, '下发时间');
    const remark =
      typeof input.remark === 'string' && input.remark.trim().length > 0
        ? input.remark.trim()
        : null;

    if (!recipientName && !recipientDept) {
      throw new BadRequestException('接收人或接收部门至少填写一项。');
    }

    return {
      recipientName,
      recipientDept,
      issuedAt,
      remark,
    };
  }

  private parseDistributionWriteInput(rawInput: unknown): DistributionWriteInput {
    if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
      throw new BadRequestException('下发记录数据格式不正确。');
    }

    const input = rawInput as Record<string, unknown>;
    const receiverName =
      typeof input.receiverName === 'string' ? input.receiverName.trim() : '';
    const receiverDept =
      typeof input.receiverDept === 'string' ? input.receiverDept.trim() : '';
    const sentAt = this.parseDate(input.sentAt, '发送时间');
    const signedAt =
      input.signedAt === undefined || input.signedAt === null || input.signedAt === ''
        ? null
        : this.parseDate(input.signedAt, '签收时间');
    const note =
      typeof input.note === 'string' && input.note.trim().length > 0
        ? input.note.trim()
        : null;

    if (!receiverName) {
      throw new BadRequestException('接收人不能为空。');
    }

    if (!receiverDept) {
      throw new BadRequestException('接收部门不能为空。');
    }

    return {
      receiverName,
      receiverDept,
      sentAt,
      signedAt,
      note,
    };
  }

  private parseColorBoardDetailUpdateWriteInput(
    rawInput: unknown,
  ): ColorBoardDetailUpdateWriteInput {
    if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
      throw new BadRequestException('色板明细更新数据格式不正确。');
    }

    const input = rawInput as Record<string, unknown>;
    const standardBoardId =
      typeof input.standardBoardId === 'string' ? input.standardBoardId.trim() : '';
    const updateStatus =
      typeof input.updateStatus === 'string' &&
      COLOR_BOARD_DETAIL_UPDATE_STATUS_VALUES.includes(
        input.updateStatus as ColorBoardDetailUpdateStatus,
      )
        ? (input.updateStatus as ColorBoardDetailUpdateStatus)
        : null;
    const detailUpdatedAt = this.parseDate(input.detailUpdatedAt, '更新时间');
    const note =
      typeof input.note === 'string' && input.note.trim().length > 0
        ? input.note.trim()
        : null;

    if (!standardBoardId) {
      throw new BadRequestException('必须选择关联标准板。');
    }

    if (!updateStatus) {
      throw new BadRequestException('更新状态不能为空。');
    }

    return {
      standardBoardId,
      updateStatus,
      detailUpdatedAt,
      note,
    };
  }

  private parsePositiveInteger(value: unknown, label: string) {
    if (typeof value !== 'number' && typeof value !== 'string') {
      throw new BadRequestException(`${label}不能为空。`);
    }

    const numericValue = Number(value);

    if (!Number.isInteger(numericValue) || numericValue <= 0) {
      throw new BadRequestException(`${label}必须是大于 0 的整数。`);
    }

    return numericValue;
  }

  private parseDate(value: unknown, label: string) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException(`${label}不能为空。`);
    }

    const parsedDate = new Date(value);

    if (Number.isNaN(parsedDate.getTime())) {
      throw new BadRequestException(`${label}格式不正确。`);
    }

    return parsedDate;
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

  private toStandardBoardSummary(
    board: Prisma.StandardBoardGetPayload<{
      include: typeof STANDARD_BOARD_INCLUDE;
    }>,
  ) {
    return {
      id: board.id,
      boardCode: board.boardCode,
      versionNo: board.versionNo,
      basedOnSampleId: board.basedOnSampleId,
      status: board.status,
      isCurrent: board.isCurrent,
      producedAt: board.producedAt?.toISOString() ?? null,
      issuedAt: board.issuedAt?.toISOString() ?? null,
      issuedById: board.issuedById,
      issuedByName: board.issuedBy?.name ?? null,
      recipientName: board.recipientName,
      recipientDept: board.recipientDept,
      remark: board.remark,
      createdAt: board.createdAt.toISOString(),
      updatedAt: board.updatedAt.toISOString(),
      basedOnSample: board.basedOnSample
        ? {
            id: board.basedOnSample.id,
            sampleNo: board.basedOnSample.sampleNo,
            sampleName: board.basedOnSample.sampleName,
            versionNo: board.basedOnSample.versionNo,
          }
        : null,
      distributions: board.distributionRecords.map((record) =>
        this.toDistributionRecordSummary(record),
      ),
    };
  }

  private toDistributionRecordSummary(
    record: Prisma.BoardDistributionRecordGetPayload<Record<string, never>>,
  ) {
    return {
      id: record.id,
      receiverName: record.receiverName,
      receiverDept: record.receiverDept,
      sentAt: record.sentAt?.toISOString() ?? null,
      signedAt: record.signedAt?.toISOString() ?? null,
      note: record.note,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private toColorBoardDetailUpdateSummary(
    updateRecord: Prisma.ColorBoardDetailUpdateGetPayload<{
      include: typeof COLOR_BOARD_DETAIL_UPDATE_INCLUDE;
    }>,
  ) {
    return {
      id: updateRecord.id,
      standardBoardId: updateRecord.standardBoardId,
      updateStatus: updateRecord.updateStatus,
      detailUpdatedAt: updateRecord.detailUpdatedAt.toISOString(),
      note: updateRecord.note,
      updatedById: updateRecord.updatedById,
      updatedByName: updateRecord.updatedBy?.name ?? null,
      createdAt: updateRecord.createdAt.toISOString(),
      updatedAt: updateRecord.updatedAt.toISOString(),
      standardBoard: {
        id: updateRecord.standardBoard.id,
        boardCode: updateRecord.standardBoard.boardCode,
        versionNo: updateRecord.standardBoard.versionNo,
      },
    };
  }

  private toStandardBoardAuditSnapshot(
    board: Prisma.StandardBoardGetPayload<{
      include: typeof STANDARD_BOARD_INCLUDE;
    }>,
  ) {
    return {
      id: board.id,
      boardCode: board.boardCode,
      versionNo: board.versionNo,
      basedOnSampleId: board.basedOnSampleId,
      basedOnSampleNo: board.basedOnSample?.sampleNo ?? null,
      status: board.status,
      isCurrent: board.isCurrent,
      producedAt: board.producedAt?.toISOString() ?? null,
      issuedAt: board.issuedAt?.toISOString() ?? null,
      issuedById: board.issuedById,
      issuedByName: board.issuedBy?.name ?? null,
      recipientName: board.recipientName,
      recipientDept: board.recipientDept,
      remark: board.remark,
    } satisfies Prisma.InputJsonValue;
  }

  private toColorBoardDetailUpdateAuditSnapshot(
    updateRecord: Prisma.ColorBoardDetailUpdateGetPayload<{
      include: typeof COLOR_BOARD_DETAIL_UPDATE_INCLUDE;
    }>,
  ) {
    return {
      id: updateRecord.id,
      standardBoardId: updateRecord.standardBoardId,
      boardCode: updateRecord.standardBoard.boardCode,
      versionNo: updateRecord.standardBoard.versionNo,
      updateStatus: updateRecord.updateStatus,
      detailUpdatedAt: updateRecord.detailUpdatedAt.toISOString(),
      updatedById: updateRecord.updatedById,
      updatedByName: updateRecord.updatedBy?.name ?? null,
      note: updateRecord.note,
    } satisfies Prisma.InputJsonValue;
  }
}
