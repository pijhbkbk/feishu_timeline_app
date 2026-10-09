import { createHash } from 'node:crypto';
import { isFutureBusinessDate } from '../../common/business-date';
import { appendColorStandard, parseColorTechnicalData, parseRegisterMonth } from '../../common/color-standard';
import { assertApprovedTeamMember } from '../../common/team-membership';
import { isReworkTask, ancestorEvidenceIds, readEvidenceTask } from '../../common/workflow-evidence';
import { assertTeamTaskById, withProjectWrite } from '../../common/team-authorization';
import {
  BadRequestException,
  ConflictException,
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
import { ProjectAccessService } from '../auth/project-access.service';
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

type StandardBoardAdmissionMode = 'AUDIT' | 'IDENTITY';

type JsonAuditScalar = string | number | boolean | null;

const COLOR_BOARD_DETAIL_UPDATE_STATUS_VALUES = Object.values(
  ColorBoardDetailUpdateStatus,
);
const STANDARD_BOARD_RECORD_LIMIT = 100;
const STANDARD_BOARD_DISTRIBUTION_LIMIT = 100;
const COLOR_BOARD_DETAIL_UPDATE_LIMIT = 100;
const STANDARD_BOARD_SAMPLE_OPTION_LIMIT = 100;
const STANDARD_BOARD_MAX_PAYLOAD_BYTES = 16 * 1024;
const STANDARD_BOARD_ID_MAX_CHARS = 64;
const STANDARD_BOARD_CODE_MAX_CHARS = 128;
const STANDARD_BOARD_SAMPLE_CODE_MAX_CHARS = 64;
const STANDARD_BOARD_PERSON_MAX_CHARS = 200;
const STANDARD_BOARD_NOTE_MAX_CHARS = 4_000;
const STANDARD_BOARD_VERSION_MAX = 2_147_483_647;
const STANDARD_BOARD_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
// eslint-disable-next-line no-control-regex -- Preserve ordinary board labels while explicitly rejecting control characters.
const STANDARD_BOARD_CODE_PATTERN = /^[^\u0000-\u001f\u007f]+$/u;
const POSITIVE_DECIMAL_INTEGER_PATTERN = /^[1-9]\d*$/;

const STANDARD_BOARD_SUMMARY_SELECT = {
  id: true,
  colorId: true,
  colorVersionId: true,
  boardCode: true,
  versionNo: true,
  basedOnSampleId: true,
  status: true,
  isCurrent: true,
  producedAt: true,
  issuedAt: true,
  issuedById: true,
  recipientName: true,
  recipientDept: true,
  remark: true,
  createdAt: true,
  updatedAt: true,
  basedOnSample: {
    select: {
      id: true,
      sampleNo: true,
      sampleName: true,
      versionNo: true,
    },
  },
  issuedBy: {
    select: {
      name: true,
    },
  },
} satisfies Prisma.StandardBoardSelect;

const STANDARD_BOARD_AUDIT_SELECT = {
  id: true,
  colorId: true,
  colorVersionId: true,
  boardCode: true,
  versionNo: true,
  basedOnSampleId: true,
  status: true,
  isCurrent: true,
  producedAt: true,
  issuedAt: true,
  issuedById: true,
  recipientName: true,
  recipientDept: true,
  remark: true,
  basedOnSample: {
    select: {
      id: true,
      sampleNo: true,
    },
  },
  issuedBy: {
    select: {
      id: true,
      name: true,
    },
  },
} satisfies Prisma.StandardBoardSelect;

const STANDARD_BOARD_IDENTITY_SELECT = {
  id: true,
  boardCode: true,
  versionNo: true,
  status: true,
} satisfies Prisma.StandardBoardSelect;

const BOARD_DISTRIBUTION_SUMMARY_SELECT = {
  id: true,
  standardBoardId: true,
  receiverName: true,
  receiverDept: true,
  sentAt: true,
  signedAt: true,
  note: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.BoardDistributionRecordSelect;

const COLOR_BOARD_DETAIL_UPDATE_SUMMARY_SELECT = {
  id: true,
  standardBoardId: true,
  updateStatus: true,
  detailUpdatedAt: true,
  note: true,
  updatedById: true,
  createdAt: true,
  updatedAt: true,
  standardBoard: {
    select: {
      id: true,
      boardCode: true,
      versionNo: true,
    },
  },
  updatedBy: {
    select: {
      name: true,
    },
  },
} satisfies Prisma.ColorBoardDetailUpdateSelect;

const COLOR_BOARD_DETAIL_UPDATE_AUDIT_SELECT = {
  id: true,
  standardBoardId: true,
  updateStatus: true,
  detailUpdatedAt: true,
  updatedById: true,
  note: true,
  standardBoard: {
    select: {
      id: true,
      boardCode: true,
      versionNo: true,
    },
  },
  updatedBy: {
    select: {
      id: true,
      name: true,
    },
  },
} satisfies Prisma.ColorBoardDetailUpdateSelect;

type StandardBoardAuditSource = Prisma.StandardBoardGetPayload<{
  select: typeof STANDARD_BOARD_AUDIT_SELECT;
}>;

type StandardBoardIdentitySource = Prisma.StandardBoardGetPayload<{
  select: typeof STANDARD_BOARD_IDENTITY_SELECT;
}>;

type BoardDistributionSummarySource =
  Prisma.BoardDistributionRecordGetPayload<{
    select: typeof BOARD_DISTRIBUTION_SUMMARY_SELECT;
  }>;

type ColorBoardDetailUpdateAuditSource =
  Prisma.ColorBoardDetailUpdateGetPayload<{
    select: typeof COLOR_BOARD_DETAIL_UPDATE_AUDIT_SELECT;
  }>;

type StandardBoardAuditAdmissionRow = Omit<
  StandardBoardAuditSource,
  'basedOnSample' | 'issuedBy'
> & {
  basedOnSampleRecordId: string | null;
  basedOnSampleNo: string | null;
  issuedByRecordId: string | null;
  issuedByName: string | null;
};

@Injectable()
export class StandardBoardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLogsService: ActivityLogsService,
    private readonly workflowsService: WorkflowsService,
    private readonly projectAccessService: ProjectAccessService,
  ) {}

  async getWorkspace(projectId: string, actor: AuthenticatedUser) {
    await this.assertProjectAccess(projectId, actor, 'project.read');
    return this.buildWorkspace(this.prisma, projectId);
  }

  async getCurrentBoard(projectId: string, actor: AuthenticatedUser) {
    await this.assertProjectAccess(projectId, actor, 'project.read');
    const boardReferences = await this.getBoundedStandardBoardStateReferences(
      this.prisma,
      projectId,
    );
    const currentBoardReference = await this.prisma.standardBoard.findFirst({
      where: {
        projectId,
        isCurrent: true,
        id: {
          in: boardReferences.map((reference) => reference.id),
        },
      },
      select: {
        id: true,
      },
      orderBy: [
        { versionNo: 'desc' },
        { updatedAt: 'desc' },
        { id: 'asc' },
      ],
    });

    if (!currentBoardReference) {
      return null;
    }

    const distributionReferences = await this.getBoundedDistributionReferences(
      this.prisma,
      projectId,
    );
    const [board, distributionRecords] = await Promise.all([
      this.prisma.standardBoard.findFirst({
        where: {
          projectId,
          id: currentBoardReference.id,
          isCurrent: true,
        },
        select: STANDARD_BOARD_SUMMARY_SELECT,
      }),
      this.loadAdmittedDistributionRecords(
        this.prisma,
        projectId,
        distributionReferences,
      ),
    ]);

    if (!board) {
      return null;
    }

    return this.toStandardBoardSummary(
      board,
      distributionRecords.filter((record) => record.standardBoardId === board.id),
    );
  }

  async getColorBoardDetailUpdateWorkspace(projectId: string, actor: AuthenticatedUser) {
    await this.assertProjectAccess(projectId, actor, 'project.read');
    return this.buildColorBoardDetailUpdateWorkspace(this.prisma, projectId);
  }

  async saveAndPublish(projectId: string, rawInput: unknown, actor: AuthenticatedUser) {
    await this.assertProjectAccess(projectId, actor, 'workflow.transition');
    this.assertActorCanManage(actor);
    const input = this.parsePublishInput(rawInput);
    const key = `color-standard-publish:${actor.id}:${input.idempotencyKey}`;
    const hash = createHash('sha256').update(JSON.stringify({ projectId, ...input })).digest('hex');
    return withProjectWrite(this.prisma, actor, { projectId }, async tx => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${'color-standard-publish-command'}), hashtext(${key}))`);
      const previous = await tx.r26CommandRequest.findUnique({ where: { idempotencyKey: key } });
      if (previous) {
        if (previous.actorUserId !== actor.id || previous.projectId !== projectId || previous.requestHash !== hash) throw new ConflictException('请求编号已用于其他内容。');
        return { ...(previous.result as Prisma.JsonObject), idempotentReplay: true };
      }
      const lockedTaskId = await this.lockActiveTaskForWrite(tx, actor, projectId, WorkflowNodeCode.STANDARD_BOARD_PRODUCTION);
      const context = await this.getStandardBoardContext(tx, projectId);
      this.assertLockedContextTask(context.activeTask, lockedTaskId);
      this.assertWritableStandardBoardStage(context);
      this.assertStandardBoardCapacity(context.boards, true);
      const task = await tx.workflowTask.findUniqueOrThrow({ where: { id: lockedTaskId }, select: { id: true, updatedAt: true, payload: true } });
      if (task.id !== input.taskId || task.updatedAt.toISOString() !== input.taskVersion) throw new ConflictException({ code: 'STALE_TASK_VERSION', message: '制板工序已变化，请刷新后重新核对。' });
      await this.assertSampleReference(tx, projectId, input.basedOnSampleId);
      const project = await tx.project.findUniqueOrThrow({ where: { id: projectId }, select: { primaryColorId: true } });
      if (!project.primaryColorId) throw new BadRequestException('项目尚未核对并关联准确的颜色身份。');
      const payload = task.payload === null ? {} : task.payload;
      if (typeof payload !== 'object' || Array.isArray(payload) || Buffer.byteLength(JSON.stringify(payload), 'utf8') > 32 * 1024) throw new ConflictException('原工序记录格式需要核对，未修改任何记录。');
      const published = await appendColorStandard(tx, { colorId: project.primaryColorId, expectedRevision: input.expectedColorRevision,
        actorId: actor.id, boardCode: input.boardCode, technicalData: input.technicalData, registerMonth: input.registerMonth,
        sourceReference: { projectId, workflowTaskId: task.id, origin: 'STANDARD_BOARD_PRODUCTION' } });
      const maximum = await tx.standardBoard.aggregate({ where: { projectId, boardCode: input.boardCode }, _max: { versionNo: true } });
      const boardVersion = (maximum._max.versionNo ?? 0) + 1;
      if (boardVersion > STANDARD_BOARD_VERSION_MAX) throw new ConflictException('标准板版本数量超出上限。');
      await tx.standardBoard.updateMany({ where: { projectId, isCurrent: true }, data: { isCurrent: false } });
      const board = await tx.standardBoard.create({ data: { projectId, colorId: published.color.id, colorVersionId: published.version.id,
        boardCode: input.boardCode, versionNo: boardVersion, status: StandardBoardStatus.CREATED, isCurrent: true,
        basedOnSampleId: input.basedOnSampleId, remark: input.remark, producedAt: input.producedAt }, select: STANDARD_BOARD_AUDIT_SELECT });
      const nodeRecord = { boardId: board.id, colorId: published.color.id, colorVersionId: published.version.id, standardVersionNo: published.version.versionNo };
      const updatedTask = await tx.workflowTask.update({ where: { id: task.id }, data: {
        payload: { ...payload, colorRegisterStandard: nodeRecord }, updatedAt: new Date(Math.max(Date.now(), task.updatedAt.getTime() + 1)),
      }, select: { updatedAt: true } });
      await this.activityLogsService.createWithExecutor(tx, { projectId, actorUserId: actor.id, targetType: AuditTargetType.STANDARD_BOARD,
        targetId: board.id, action: 'STANDARD_BOARD_CREATED', nodeCode: WorkflowNodeCode.STANDARD_BOARD_PRODUCTION,
        metadata: { workflowTaskId: task.id, evidenceKind: 'TASK_CREATED_RECORD', ...nodeRecord },
        summary: `保存标准板 ${board.boardCode} V${board.versionNo} 并加入颜色清单`, afterData: { ...this.toStandardBoardAuditSnapshot(board), ...nodeRecord } });
      await tx.auditLog.create({ data: { projectId, actorUserId: actor.id, targetType: AuditTargetType.COLOR,
        targetId: published.color.id, action: 'COLOR_STANDARD_PUBLISHED', nodeCode: WorkflowNodeCode.STANDARD_BOARD_PRODUCTION,
        summary: '制板标准以新版本进入颜色清单，保留既有标准及量产审批状态',
        beforeData: { registerStatus: published.previousColor.registerStatus, registerRevision: published.previousColor.registerRevision },
        afterData: { ...nodeRecord, registerStatus: published.color.registerStatus, registerRevision: published.color.registerRevision },
      } });
      const result = { projectId, ...nodeRecord, registerRevision: published.color.registerRevision,
        taskVersion: updatedTask.updatedAt.toISOString(), idempotentReplay: false };
      await tx.r26CommandRequest.create({ data: { projectId, actorUserId: actor.id, idempotencyKey: key,
        action: 'STANDARD_BOARD_SAVE_AND_PUBLISH', requestHash: hash, result } });
      return result;
    });
  }

  async createStandardBoard(
    projectId: string,
    rawInput: unknown,
    actor: AuthenticatedUser,
  ) {
    await this.assertProjectAccess(projectId, actor, 'workflow.transition');
    this.assertActorCanManage(actor);
    const input = this.parseBoardWriteInput(rawInput);

    await withProjectWrite(this.prisma, actor, { projectId }, async (tx) => {
      const lockedTaskId = await this.lockActiveTaskForWrite(
        tx, actor,
        projectId,
        WorkflowNodeCode.STANDARD_BOARD_PRODUCTION,
      );
      const context = await this.getStandardBoardContext(tx, projectId);
      this.assertLockedContextTask(context.activeTask, lockedTaskId);
      this.assertWritableStandardBoardStage(context);
      this.assertStandardBoardCapacity(context.boards, true);
      await this.assertSampleReference(tx, projectId, input.basedOnSampleId);
      await this.assertUniqueBoardVersion(tx, projectId, input.boardCode, input.versionNo);

      const linked = await tx.project.findUnique({ where: { id: projectId }, select: { primaryColorId: true } });
      if (linked?.primaryColorId) throw new BadRequestException('此项目已关联颜色，请使用“保存并加入颜色清单”建立标准版本。');

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
        select: STANDARD_BOARD_AUDIT_SELECT,
      });

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.STANDARD_BOARD,
        targetId: board.id,
        action: 'STANDARD_BOARD_CREATED',
        metadata: { workflowTaskId: context.activeTask!.id, evidenceKind: 'TASK_CREATED_RECORD' },
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
    await this.assertProjectAccess(projectId, actor, 'workflow.transition');
    this.assertActorCanManage(actor);
    const input = this.parseBoardWriteInput(rawInput);

    await withProjectWrite(this.prisma, actor, { projectId }, async (tx) => {
      const lockedTaskId = await this.lockActiveTaskForWrite(
        tx, actor,
        projectId,
        WorkflowNodeCode.STANDARD_BOARD_PRODUCTION,
      );
      const context = await this.getStandardBoardContext(tx, projectId);
      this.assertLockedContextTask(context.activeTask, lockedTaskId);
      this.assertWritableStandardBoardStage(context);
      const board = await this.getBoardOrThrow(tx, projectId, boardId);
      this.assertPersistedStandardBoardAuditSource(board);

      if (board.colorVersionId && (board.boardCode !== input.boardCode || board.versionNo !== input.versionNo || board.basedOnSampleId !== input.basedOnSampleId)) {
        throw new ConflictException('已入清单的标准板身份不能编辑，请保存新的标准版本。');
      }
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
        select: STANDARD_BOARD_AUDIT_SELECT,
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
    await this.assertProjectAccess(projectId, actor, 'workflow.transition');
    this.assertActorCanManage(actor);

    await withProjectWrite(this.prisma, actor, { projectId }, async (tx) => {
      const lockedTaskId = await this.lockActiveTaskForWrite(
        tx, actor,
        projectId,
        WorkflowNodeCode.STANDARD_BOARD_PRODUCTION,
      );
      const context = await this.getStandardBoardContext(tx, projectId);
      this.assertLockedContextTask(context.activeTask, lockedTaskId);
      this.assertWritableStandardBoardStage(context);
      const board = await this.getBoardOrThrow(tx, projectId, boardId);
      this.assertPersistedStandardBoardAuditSource(board);

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
        select: STANDARD_BOARD_AUDIT_SELECT,
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
    await this.assertProjectAccess(projectId, actor, 'workflow.transition');
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
    await this.assertProjectAccess(projectId, actor, 'workflow.transition');
    this.assertActorCanManage(actor);
    const input = this.parseIssueBoardInput(rawInput);

    await withProjectWrite(this.prisma, actor, { projectId }, async (tx) => {
      const lockedTaskId = await this.lockActiveTaskForWrite(
        tx, actor,
        projectId,
        WorkflowNodeCode.STANDARD_BOARD_PRODUCTION,
      );
      const context = await this.getStandardBoardContext(tx, projectId);
      this.assertLockedContextTask(context.activeTask, lockedTaskId);
      this.assertWritableStandardBoardStage(context);
      const board = await this.getBoardOrThrow(tx, projectId, boardId);
      this.assertPersistedStandardBoardAuditSource(board);
      const nextStatus = getStandardBoardStatusTransitionTarget(
        board.status,
        'ISSUE',
      );

      if (!nextStatus) {
        throw new BadRequestException('当前标准板状态不允许标记为已下发。');
      }

      await this.assertBoardStandardForProject(tx, projectId, boardId);
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
        select: STANDARD_BOARD_AUDIT_SELECT,
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
    await this.assertProjectAccess(projectId, actor, 'workflow.transition');
    this.assertActorCanManage(actor);
    const input = this.parseDistributionWriteInput(rawInput);

    await withProjectWrite(this.prisma, actor, { projectId }, async (tx) => {
      const lockedTaskId = await this.lockActiveTaskForWrite(
        tx, actor,
        projectId,
        WorkflowNodeCode.STANDARD_BOARD_PRODUCTION,
      );
      const context = await this.getStandardBoardContext(tx, projectId);
      this.assertLockedContextTask(context.activeTask, lockedTaskId);
      this.assertWritableStandardBoardStage(context);
      this.assertDistributionCapacity(context.distributions, true);
      const board = await this.getBoardOrThrow(
        tx,
        projectId,
        boardId,
        'IDENTITY',
      );

      if (board.status !== StandardBoardStatus.ISSUED) {
        throw new BadRequestException('仅已下发的标准板才能添加下发记录。');
      }
      await this.assertBoardStandardForProject(tx, projectId, boardId);
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
        select: BOARD_DISTRIBUTION_SUMMARY_SELECT,
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
    await this.assertProjectAccess(projectId, actor, 'workflow.transition');
    this.assertActorCanManage(actor);
    const input = this.parseColorBoardDetailUpdateWriteInput(rawInput);

    await withProjectWrite(this.prisma, actor, { projectId }, async (tx) => {
      const lockedTaskId = await this.lockActiveTaskForWrite(
        tx, actor,
        projectId,
        WorkflowNodeCode.BOARD_DETAIL_UPDATE,
      );
      const context = await this.getColorBoardDetailUpdateContext(tx, projectId);
      this.assertLockedContextTask(context.activeTask, lockedTaskId);
      this.assertWritableBoardDetailUpdateStage(context);
      this.assertColorBoardDetailUpdateCapacity(context.updates, true);
      await this.getBoardOrThrow(
        tx,
        projectId,
        input.standardBoardId,
        'IDENTITY',
      );
      const evidenceTask = await readEvidenceTask(tx, projectId, lockedTaskId);
      if (!evidenceTask) throw new ConflictException('本轮标准板明细任务不存在。');
      if (isReworkTask(evidenceTask)) {
        const ids = await ancestorEvidenceIds(tx, evidenceTask, WorkflowNodeCode.STANDARD_BOARD_PRODUCTION);
        const current = await tx.standardBoard.findFirst({ where: { id: input.standardBoardId, projectId,
          isCurrent: true, status: StandardBoardStatus.ISSUED }, select: { id: true } });
        if (!current || !ids.includes(current.id)) throw new BadRequestException('返工后的明细必须关联本轮已下发的当前标准板，旧板记录保留。');
      }

      const detailUpdate = await tx.colorBoardDetailUpdate.create({
        data: {
          projectId,
          standardBoardId: input.standardBoardId,
          updateStatus: input.updateStatus,
          detailUpdatedAt: input.detailUpdatedAt,
          note: input.note,
          updatedById: actor.id,
        },
        select: COLOR_BOARD_DETAIL_UPDATE_AUDIT_SELECT,
      });

      await this.activityLogsService.createWithExecutor(tx, {
        projectId,
        actorUserId: actor.id,
        targetType: AuditTargetType.STANDARD_BOARD,
        targetId: input.standardBoardId,
        action: 'COLOR_BOARD_DETAIL_UPDATE_CREATED',
        metadata: { workflowTaskId: context.activeTask!.id, evidenceKind: 'TASK_CREATED_RECORD', evidenceRecordId: detailUpdate.id },
        nodeCode: WorkflowNodeCode.BOARD_DETAIL_UPDATE,
        summary: '新增色板明细更新记录。',
        afterData: this.toColorBoardDetailUpdateAuditSnapshot(detailUpdate),
      });
    });

    return this.buildWorkspace(this.prisma, projectId);
  }

  async completeStandardBoardTask(projectId: string, actor: AuthenticatedUser) {
    await this.assertProjectAccess(projectId, actor, 'workflow.transition');
    this.assertActorCanManage(actor);

    await withProjectWrite(this.prisma, actor, { projectId }, async (tx) => {
      const lockedTaskId = await this.lockActiveTaskForWrite(
        tx, actor,
        projectId,
        WorkflowNodeCode.STANDARD_BOARD_PRODUCTION,
      );
      const context = await this.getStandardBoardContext(tx, projectId);
      this.assertLockedContextTask(context.activeTask, lockedTaskId);
      this.assertWritableStandardBoardStage(context);

      if (!context.activeTask) {
        throw new BadRequestException('当前没有可完成的标准板制作、下发任务。');
      }

      await this.assertBoardStandardForProject(tx, projectId);
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
    await this.assertProjectAccess(projectId, actor, 'workflow.transition');
    this.assertActorCanManage(actor);

    await withProjectWrite(this.prisma, actor, { projectId }, async (tx) => {
      const lockedTaskId = await this.lockActiveTaskForWrite(
        tx, actor,
        projectId,
        WorkflowNodeCode.BOARD_DETAIL_UPDATE,
      );
      const context = await this.getColorBoardDetailUpdateContext(tx, projectId);
      this.assertLockedContextTask(context.activeTask, lockedTaskId);
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

  private assertProjectAccess(
    projectId: string,
    actor: AuthenticatedUser,
    requiredPermission: string,
  ) {
    return this.projectAccessService.assertProjectAccessWithDefaultClient(
      projectId,
      actor,
      requiredPermission,
    );
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

    await withProjectWrite(this.prisma, actor, { projectId }, async (tx) => {
      const lockedTaskId = await this.lockActiveTaskForWrite(
        tx, actor,
        projectId,
        WorkflowNodeCode.STANDARD_BOARD_PRODUCTION,
      );
      const context = await this.getStandardBoardContext(tx, projectId);
      this.assertLockedContextTask(context.activeTask, lockedTaskId);
      this.assertWritableStandardBoardStage(context);
      const board = await this.getBoardOrThrow(tx, projectId, boardId);
      this.assertPersistedStandardBoardAuditSource(board);
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
        select: STANDARD_BOARD_AUDIT_SELECT,
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

  private async lockActiveTaskForWrite(
    tx: Prisma.TransactionClient,
    actor: AuthenticatedUser,
    projectId: string,
    nodeCode: WorkflowNodeCode,
  ) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "workflow_tasks"
      WHERE "projectId" = ${projectId}
        AND "nodeCode" = ${nodeCode}::"WorkflowNodeCode"
        AND "isActive" = true
      ORDER BY "createdAt" DESC, "taskRound" DESC
      LIMIT 1
      FOR UPDATE
    `);
    const taskId = rows[0]?.id;
    if (!taskId) {
      throw new ConflictException({
        code: 'DOMAIN_STAGE_CHANGED',
        message: '工序状态已更新，请刷新后再提交标准板数据。',
      });
    }
    await assertTeamTaskById(tx, taskId, actor);
    return taskId;
  }

  private assertLockedContextTask(
    activeTask: { id: string } | null,
    lockedTaskId: string,
  ) {
    if (activeTask?.id !== lockedTaskId) {
      throw new ConflictException({
        code: 'DOMAIN_STAGE_CHANGED',
        message: '工序状态已更新，请刷新后再提交标准板数据。',
      });
    }
  }

  private async buildWorkspace(
    db: StandardBoardsDbClient,
    projectId: string,
  ) {
    const project = await this.getProjectOrThrow(db, projectId);
    const [
      boardReferences,
      distributionReferences,
      detailUpdateReferences,
      sampleOptionReferences,
    ] = await Promise.all([
      this.getBoundedStandardBoardStateReferences(db, projectId),
      this.getBoundedDistributionReferences(db, projectId),
      this.getBoundedColorBoardDetailUpdateIdentityReferences(db, projectId),
      this.getBoundedSampleOptionReferences(db, projectId),
    ]);
    const sampleOptionsHasMore =
      sampleOptionReferences.length > STANDARD_BOARD_SAMPLE_OPTION_LIMIT;
    const admittedSampleOptionIds = sampleOptionReferences
      .slice(0, STANDARD_BOARD_SAMPLE_OPTION_LIMIT)
      .map((reference) => reference.id);
    const [
      boards,
      distributionRecords,
      standardBoardTask,
      boardDetailTask,
      procurementCompleted,
      detailUpdates,
      rawSampleOptions,
    ] = await Promise.all([
      db.standardBoard.findMany({
        where: {
          projectId,
          id: {
            in: boardReferences.map((reference) => reference.id),
          },
        },
        select: STANDARD_BOARD_SUMMARY_SELECT,
        orderBy: [
          { isCurrent: 'desc' },
          { boardCode: 'asc' },
          { versionNo: 'desc' },
          { id: 'asc' },
        ],
        take: STANDARD_BOARD_RECORD_LIMIT,
      }),
      this.loadAdmittedDistributionRecords(
        db,
        projectId,
        distributionReferences,
      ),
      this.getActiveTask(db, projectId, WorkflowNodeCode.STANDARD_BOARD_PRODUCTION),
      this.getActiveTask(db, projectId, WorkflowNodeCode.BOARD_DETAIL_UPDATE),
      this.hasCompletedProcurementTask(db, projectId),
      db.colorBoardDetailUpdate.findMany({
        where: {
          projectId,
          id: {
            in: detailUpdateReferences.map((reference) => reference.id),
          },
        },
        select: COLOR_BOARD_DETAIL_UPDATE_SUMMARY_SELECT,
        orderBy: [
          { detailUpdatedAt: 'desc' },
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
        take: COLOR_BOARD_DETAIL_UPDATE_LIMIT,
      }),
      db.sample.findMany({
        where: {
          projectId,
          id: {
            in: admittedSampleOptionIds,
          },
          isCurrent: true,
          status: {
            in: [SampleStatus.IN_PREPARATION, SampleStatus.CONFIRMED],
          },
        },
        orderBy: [
          { sampleNo: 'asc' },
          { versionNo: 'desc' },
          { id: 'asc' },
        ],
        select: {
          id: true,
          sampleNo: true,
          sampleName: true,
          versionNo: true,
        },
        take: STANDARD_BOARD_SAMPLE_OPTION_LIMIT,
      }),
    ]);
    const sampleOptions = rawSampleOptions.slice(
      0,
      STANDARD_BOARD_SAMPLE_OPTION_LIMIT,
    );
    const distributionsByBoardId = this.groupDistributionsByBoardId(
      distributionRecords,
    );
    const currentBoard = boards.find((board) => board.isCurrent) ?? null;

    return {
      project: {
        id: project.id,
        code: project.code,
        name: project.name,
        currentNodeCode: project.currentNodeCode,
        currentNodeName: getCurrentNodeName(project.currentNodeCode),
        targetDate: project.plannedEndDate?.toISOString() ?? null,
        riskLevel: project.priority,
        primaryColor: project.primaryColor,
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
      sampleOptionsHasMore,
      sampleOptions: sampleOptions.map((sample) => ({
        id: sample.id,
        sampleNo: sample.sampleNo,
        sampleName: sample.sampleName,
        versionNo: sample.versionNo,
      })),
      currentBoard: currentBoard
        ? this.toStandardBoardSummary(
            currentBoard,
            distributionsByBoardId.get(currentBoard.id) ?? [],
          )
        : null,
      items: boards.map((board) =>
        this.toStandardBoardSummary(
          board,
          distributionsByBoardId.get(board.id) ?? [],
        ),
      ),
      detailUpdates: detailUpdates.map((updateRecord) =>
        this.toColorBoardDetailUpdateSummary(updateRecord),
      ),
    };
  }

  private async buildColorBoardDetailUpdateWorkspace(
    db: StandardBoardsDbClient,
    projectId: string,
  ) {
    const [boardReferences, detailUpdateReferences, distributionReferences] =
      await Promise.all([
        this.getBoundedStandardBoardIdentityReferences(db, projectId),
        this.getBoundedColorBoardDetailUpdateIdentityReferences(db, projectId),
        this.getBoundedDistributionReferences(db, projectId),
      ]);
    const [project, activeTask, currentBoard, detailUpdates, distributionRecords] =
      await Promise.all([
        this.getProjectOrThrow(db, projectId),
        this.getActiveTask(db, projectId, WorkflowNodeCode.BOARD_DETAIL_UPDATE),
        db.standardBoard.findFirst({
          where: {
            projectId,
            isCurrent: true,
            id: {
              in: boardReferences.map((reference) => reference.id),
            },
          },
          select: STANDARD_BOARD_SUMMARY_SELECT,
          orderBy: [
            { boardCode: 'asc' },
            { versionNo: 'desc' },
            { id: 'asc' },
          ],
        }),
        db.colorBoardDetailUpdate.findMany({
          where: {
            projectId,
            id: {
              in: detailUpdateReferences.map((reference) => reference.id),
            },
          },
          select: COLOR_BOARD_DETAIL_UPDATE_SUMMARY_SELECT,
          orderBy: [
            { detailUpdatedAt: 'desc' },
            { createdAt: 'desc' },
            { id: 'desc' },
          ],
          take: COLOR_BOARD_DETAIL_UPDATE_LIMIT,
        }),
        this.loadAdmittedDistributionRecords(
          db,
          projectId,
          distributionReferences,
        ),
      ]);
    const completionIssue = getBoardDetailUpdateCompletionIssue(detailUpdates);

    return {
      project: {
        id: project.id,
        code: project.code,
        name: project.name,
        currentNodeCode: project.currentNodeCode,
        currentNodeName: getCurrentNodeName(project.currentNodeCode),
        targetDate: project.plannedEndDate?.toISOString() ?? null,
        riskLevel: project.priority,
        primaryColor: project.primaryColor,
      },
      activeTask: activeTask ? this.toWorkflowTaskSummary(activeTask) : null,
      canCompleteTask: Boolean(activeTask) && completionIssue === null,
      completionIssue,
      currentBoard: currentBoard
        ? this.toStandardBoardSummary(
            currentBoard,
            distributionRecords.filter(
              (record) => record.standardBoardId === currentBoard.id,
            ),
          )
        : null,
      items: detailUpdates.map((updateRecord) =>
        this.toColorBoardDetailUpdateSummary(updateRecord),
      ),
    };
  }

  private async assertBoardStandardForProject(db: StandardBoardsDbClient, projectId: string, boardId?: string) {
    const project = await db.project.findUnique({ where: { id: projectId }, select: { primaryColorId: true } });
    if (!project) throw new NotFoundException('项目不存在。');
    if (!project.primaryColorId) return; // Unlinked historical projects retain their original workflow contract.
    const board = await db.standardBoard.findFirst({ where: { projectId,
      ...(boardId ? { id: boardId } : { isCurrent: true, status: StandardBoardStatus.ISSUED }),
      colorId: project.primaryColorId, colorVersion: { colorId: project.primaryColorId },
    }, select: { id: true } });
    if (!board) throw new BadRequestException('标准板须引用本项目准确颜色的标准版本，请先保存并加入颜色清单。');
  }

  private async getStandardBoardContext(
    db: StandardBoardsDbClient,
    projectId: string,
  ) {
    const [
      activeTask,
      procurementCompleted,
      boards,
      distributions,
      detailUpdates,
    ] = await Promise.all([
      this.getActiveTaskReference(
        db,
        projectId,
        WorkflowNodeCode.STANDARD_BOARD_PRODUCTION,
      ),
      this.hasCompletedProcurementTask(db, projectId),
      this.getBoundedStandardBoardStateReferences(db, projectId),
      this.getBoundedDistributionReferences(db, projectId),
      this.getBoundedColorBoardDetailUpdateIdentityReferences(db, projectId),
    ]);

    return {
      activeTask,
      procurementCompleted,
      boards,
      distributions,
      detailUpdates,
    };
  }

  private async getColorBoardDetailUpdateContext(
    db: StandardBoardsDbClient,
    projectId: string,
  ) {
    const [
      activeTask,
      updates,
      boards,
      distributions,
    ] = await Promise.all([
      this.getActiveTaskReference(
        db,
        projectId,
        WorkflowNodeCode.BOARD_DETAIL_UPDATE,
      ),
      this.getBoundedColorBoardDetailUpdateStateReferences(db, projectId),
      this.getBoundedStandardBoardIdentityReferences(db, projectId),
      this.getBoundedDistributionReferences(db, projectId),
    ]);

    return {
      activeTask,
      updates,
      boards,
      distributions,
    };
  }

  private async getBoundedStandardBoardStateReferences(
    db: StandardBoardsDbClient,
    projectId: string,
  ) {
    const references = await db.standardBoard.findMany({
      where: {
        projectId,
      },
      select: {
        id: true,
        isCurrent: true,
        status: true,
      },
      take: STANDARD_BOARD_RECORD_LIMIT + 1,
    });
    this.assertStandardBoardCapacity(references, false);
    return references;
  }

  private async getBoundedStandardBoardIdentityReferences(
    db: StandardBoardsDbClient,
    projectId: string,
  ) {
    const references = await db.standardBoard.findMany({
      where: {
        projectId,
      },
      select: {
        id: true,
      },
      take: STANDARD_BOARD_RECORD_LIMIT + 1,
    });
    this.assertStandardBoardCapacity(references, false);
    return references;
  }

  private async getBoundedColorBoardDetailUpdateIdentityReferences(
    db: StandardBoardsDbClient,
    projectId: string,
  ) {
    const references = await db.colorBoardDetailUpdate.findMany({
      where: {
        projectId,
      },
      select: {
        id: true,
      },
      take: COLOR_BOARD_DETAIL_UPDATE_LIMIT + 1,
    });
    this.assertColorBoardDetailUpdateCapacity(references, false);
    return references;
  }

  private async getBoundedColorBoardDetailUpdateStateReferences(
    db: StandardBoardsDbClient,
    projectId: string,
  ) {
    const references = await db.colorBoardDetailUpdate.findMany({
      where: {
        projectId,
      },
      select: {
        id: true,
        updateStatus: true,
      },
      take: COLOR_BOARD_DETAIL_UPDATE_LIMIT + 1,
    });
    this.assertColorBoardDetailUpdateCapacity(references, false);
    return references;
  }

  private getBoundedSampleOptionReferences(
    db: StandardBoardsDbClient,
    projectId: string,
  ) {
    return db.sample.findMany({
      where: {
        projectId,
        isCurrent: true,
        status: {
          in: [SampleStatus.IN_PREPARATION, SampleStatus.CONFIRMED],
        },
      },
      select: {
        id: true,
      },
      orderBy: [
        { sampleNo: 'asc' },
        { versionNo: 'desc' },
        { id: 'asc' },
      ],
      take: STANDARD_BOARD_SAMPLE_OPTION_LIMIT + 1,
    });
  }

  private async loadAdmittedDistributionRecords(
    db: StandardBoardsDbClient,
    projectId: string,
    references: readonly { id: string }[],
  ) {
    return db.boardDistributionRecord.findMany({
      where: {
        projectId,
        id: {
          in: references.map((reference) => reference.id),
        },
      },
      orderBy: [
        { standardBoardId: 'asc' },
        { sentAt: 'desc' },
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
      select: BOARD_DISTRIBUTION_SUMMARY_SELECT,
      take: STANDARD_BOARD_DISTRIBUTION_LIMIT,
    });
  }

  private async getBoundedDistributionReferences(
    db: StandardBoardsDbClient,
    projectId: string,
  ) {
    const records = await db.boardDistributionRecord.findMany({
      where: {
        projectId,
      },
      select: {
        id: true,
      },
      take: STANDARD_BOARD_DISTRIBUTION_LIMIT + 1,
    });
    this.assertDistributionCapacity(records, false);
    return records;
  }

  private groupDistributionsByBoardId(
    records: readonly BoardDistributionSummarySource[],
  ) {
    const grouped = new Map<
      string,
      BoardDistributionSummarySource[]
    >();
    for (const record of records) {
      const boardRecords = grouped.get(record.standardBoardId) ?? [];
      boardRecords.push(record);
      grouped.set(record.standardBoardId, boardRecords);
    }
    return grouped;
  }

  private assertStandardBoardCapacity(
    records: readonly unknown[],
    forCreate: boolean,
  ) {
    if (
      records.length > STANDARD_BOARD_RECORD_LIMIT ||
      (forCreate && records.length >= STANDARD_BOARD_RECORD_LIMIT)
    ) {
      throw new ConflictException({
        code: 'STANDARD_BOARD_RECORD_LIMIT_EXCEEDED',
        message: `每个项目最多保留 ${STANDARD_BOARD_RECORD_LIMIT} 条标准板记录。`,
      });
    }
  }

  private assertDistributionCapacity(
    records: readonly unknown[],
    forCreate: boolean,
  ) {
    if (
      records.length > STANDARD_BOARD_DISTRIBUTION_LIMIT ||
      (forCreate && records.length >= STANDARD_BOARD_DISTRIBUTION_LIMIT)
    ) {
      throw new ConflictException({
        code: 'STANDARD_BOARD_DISTRIBUTION_LIMIT_EXCEEDED',
        message: `每个项目最多保留 ${STANDARD_BOARD_DISTRIBUTION_LIMIT} 条标准板下发记录。`,
      });
    }
  }

  private assertColorBoardDetailUpdateCapacity(
    records: readonly unknown[],
    forCreate: boolean,
  ) {
    if (
      records.length > COLOR_BOARD_DETAIL_UPDATE_LIMIT ||
      (forCreate && records.length >= COLOR_BOARD_DETAIL_UPDATE_LIMIT)
    ) {
      throw new ConflictException({
        code: 'COLOR_BOARD_DETAIL_UPDATE_LIMIT_EXCEEDED',
        message: `每个项目最多保留 ${COLOR_BOARD_DETAIL_UPDATE_LIMIT} 条色板明细更新记录。`,
      });
    }
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
    this.assertStandardBoardId(actor.id, '操作人');
    this.assertStandardBoardText(
      actor.name,
      '操作人姓名',
      STANDARD_BOARD_PERSON_MAX_CHARS,
    );

    assertApprovedTeamMember(actor);
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
        primaryColor: { select: { id: true, name: true, code: true, productionBase: { select: { id: true, name: true } }, productionBaseId: true, registerRevision: true, registerStatus: true, registerMonth: true } },
      },
    });

    if (!project) {
      throw new NotFoundException('项目不存在。');
    }

    return project;
  }

  private getBoardOrThrow(
    db: StandardBoardsDbClient,
    projectId: string,
    boardId: string,
    admissionMode: 'IDENTITY',
  ): Promise<StandardBoardIdentitySource>;

  private getBoardOrThrow(
    db: StandardBoardsDbClient,
    projectId: string,
    boardId: string,
    admissionMode?: 'AUDIT',
  ): Promise<StandardBoardAuditSource>;

  private async getBoardOrThrow(
    db: StandardBoardsDbClient,
    projectId: string,
    boardId: string,
    admissionMode: StandardBoardAdmissionMode = 'AUDIT',
  ) {
    this.assertStandardBoardId(boardId, '标准板');
    await this.assertPersistedStandardBoardAdmission(
      db,
      projectId,
      boardId,
      admissionMode,
    );

    if (admissionMode === 'IDENTITY') {
      const board = await db.standardBoard.findFirst({
        where: {
          id: boardId,
          projectId,
        },
        select: STANDARD_BOARD_IDENTITY_SELECT,
      });

      if (!board) {
        throw new NotFoundException('标准板不存在。');
      }

      this.assertPersistedStandardBoardIdentitySource(board);
      return board;
    }

    const board = await db.standardBoard.findFirst({
      where: {
        id: boardId,
        projectId,
      },
      select: STANDARD_BOARD_AUDIT_SELECT,
    });

    if (!board) {
      throw new NotFoundException('标准板不存在。');
    }

    this.assertPersistedStandardBoardAuditSource(board);
    return board;
  }

  private async assertPersistedStandardBoardAdmission(
    db: StandardBoardsDbClient,
    projectId: string,
    boardId: string,
    admissionMode: StandardBoardAdmissionMode,
  ) {
    if (admissionMode === 'IDENTITY') {
      const rows = await db.$queryRaw<StandardBoardIdentitySource[]>(Prisma.sql`
        SELECT
          "standardBoard"."id" AS "id",
          LEFT(
            "standardBoard"."boardNo",
            ${STANDARD_BOARD_CODE_MAX_CHARS + 1}::integer
          ) AS "boardCode",
          "standardBoard"."versionNo" AS "versionNo",
          "standardBoard"."status" AS "status"
        FROM "standard_boards" AS "standardBoard"
        WHERE "standardBoard"."id" = ${boardId}
          AND "standardBoard"."projectId" = ${projectId}
        LIMIT 1
      `);
      const admissionSource = rows[0];

      if (!admissionSource) {
        throw new NotFoundException('标准板不存在。');
      }

      this.assertPersistedStandardBoardIdentitySource(admissionSource);
      return;
    }

    const rows = await db.$queryRaw<StandardBoardAuditAdmissionRow[]>(Prisma.sql`
      SELECT
        "standardBoard"."id" AS "id",
        LEFT(
          "standardBoard"."boardNo",
          ${STANDARD_BOARD_CODE_MAX_CHARS + 1}::integer
        ) AS "boardCode",
        "standardBoard"."versionNo" AS "versionNo",
        LEFT(
          "standardBoard"."basedOnSampleId",
          ${STANDARD_BOARD_ID_MAX_CHARS + 1}::integer
        ) AS "basedOnSampleId",
        LEFT(
          "basedOnSample"."id",
          ${STANDARD_BOARD_ID_MAX_CHARS + 1}::integer
        ) AS "basedOnSampleRecordId",
        LEFT(
          "basedOnSample"."sampleNo",
          ${STANDARD_BOARD_SAMPLE_CODE_MAX_CHARS + 1}::integer
        ) AS "basedOnSampleNo",
        "standardBoard"."status" AS "status",
        "standardBoard"."isCurrent" AS "isCurrent",
        "standardBoard"."producedAt" AS "producedAt",
        "standardBoard"."lastDistributedAt" AS "issuedAt",
        LEFT(
          "standardBoard"."issuedById",
          ${STANDARD_BOARD_ID_MAX_CHARS + 1}::integer
        ) AS "issuedById",
        LEFT(
          "issuedBy"."id",
          ${STANDARD_BOARD_ID_MAX_CHARS + 1}::integer
        ) AS "issuedByRecordId",
        LEFT(
          "issuedBy"."name",
          ${STANDARD_BOARD_PERSON_MAX_CHARS + 1}::integer
        ) AS "issuedByName",
        LEFT(
          "standardBoard"."recipientName",
          ${STANDARD_BOARD_PERSON_MAX_CHARS + 1}::integer
        ) AS "recipientName",
        LEFT(
          "standardBoard"."recipientDept",
          ${STANDARD_BOARD_PERSON_MAX_CHARS + 1}::integer
        ) AS "recipientDept",
        LEFT(
          "standardBoard"."remark",
          ${STANDARD_BOARD_NOTE_MAX_CHARS + 1}::integer
        ) AS "remark"
      FROM "standard_boards" AS "standardBoard"
      LEFT JOIN "samples" AS "basedOnSample"
        ON "basedOnSample"."id" = "standardBoard"."basedOnSampleId"
      LEFT JOIN "users" AS "issuedBy"
        ON "issuedBy"."id" = "standardBoard"."issuedById"
      WHERE "standardBoard"."id" = ${boardId}
        AND "standardBoard"."projectId" = ${projectId}
      LIMIT 1
    `);
    const row = rows[0];

    if (!row) {
      throw new NotFoundException('标准板不存在。');
    }

    this.assertPersistedStandardBoardAuditSource({
      id: row.id,
      boardCode: row.boardCode,
      versionNo: row.versionNo,
      basedOnSampleId: row.basedOnSampleId,
      basedOnSample:
        row.basedOnSampleRecordId === null
          ? null
          : {
              id: row.basedOnSampleRecordId,
              sampleNo: row.basedOnSampleNo ?? '',
            },
      status: row.status,
      isCurrent: row.isCurrent,
      producedAt: row.producedAt,
      issuedAt: row.issuedAt,
      issuedById: row.issuedById,
      issuedBy:
        row.issuedByRecordId === null
          ? null
          : {
              id: row.issuedByRecordId,
              name: row.issuedByName ?? '',
            },
      recipientName: row.recipientName,
      recipientDept: row.recipientDept,
      remark: row.remark,
    });
  }

  private async assertSampleReference(
    db: StandardBoardsDbClient,
    projectId: string,
    sampleId: string | null,
  ) {
    if (!sampleId) {
      return;
    }

    const samples = await db.$queryRaw<Array<{ id: string; sampleNo: string }>>(
      Prisma.sql`
        SELECT
          "sample"."id" AS "id",
          LEFT(
            "sample"."sampleNo",
            ${STANDARD_BOARD_SAMPLE_CODE_MAX_CHARS + 1}::integer
          ) AS "sampleNo"
        FROM "samples" AS "sample"
        WHERE "sample"."id" = ${sampleId}
          AND "sample"."projectId" = ${projectId}
        LIMIT 1
      `,
    );
    const sample = samples[0];

    if (!sample) {
      throw new BadRequestException('关联样板不存在。');
    }
    this.assertStandardBoardId(sample.id, '关联样板');
    this.assertSampleCode(sample.sampleNo);
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

  private async getActiveTaskReference(
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
      select: {
        id: true,
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

  private parsePublishInput(rawInput: unknown) {
    if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) throw new BadRequestException('制板标定数据格式不正确。');
    const input = rawInput as Record<string, unknown>;
    const allowed = new Set(['taskId', 'taskVersion', 'expectedColorRevision', 'idempotencyKey', 'boardCode', 'basedOnSampleId', 'remark', 'producedAt', 'registerMonth', 'technicalData']);
    if (Object.keys(input).some(key => !allowed.has(key))) throw new BadRequestException('制板标定数据包含不支持的字段。');
    const taskId = typeof input.taskId === 'string' ? input.taskId : '';
    this.assertStandardBoardId(taskId, '制板工序');
    if (typeof input.taskVersion !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input.taskVersion) || !Number.isFinite(new Date(input.taskVersion).getTime())) throw new BadRequestException('制板工序版本不正确。');
    if (!Number.isInteger(input.expectedColorRevision) || (input.expectedColorRevision as number) < 1 || (input.expectedColorRevision as number) > STANDARD_BOARD_VERSION_MAX) throw new BadRequestException('颜色版本不正确。');
    const idempotencyKey = typeof input.idempotencyKey === 'string' ? input.idempotencyKey : '';
    if (!/^[A-Za-z0-9._:-]{1,128}$/.test(idempotencyKey)) throw new BadRequestException('保存请求编号不正确。');
    const boardCode = typeof input.boardCode === 'string' ? input.boardCode.trim() : '';
    this.assertStandardBoardCode(boardCode, '标准板编号');
    if (input.basedOnSampleId !== undefined && input.basedOnSampleId !== null && typeof input.basedOnSampleId !== 'string') throw new BadRequestException('关联样板格式不正确。');
    const basedOnSampleId = typeof input.basedOnSampleId === 'string' && input.basedOnSampleId ? input.basedOnSampleId : null;
    if (basedOnSampleId) this.assertStandardBoardId(basedOnSampleId, '关联样板');
    if (input.remark !== undefined && input.remark !== null && typeof input.remark !== 'string') throw new BadRequestException('标准板备注格式不正确。');
    const remark = typeof input.remark === 'string' ? input.remark : null;
    if (remark !== null) this.assertStandardBoardText(remark, '标准板备注', STANDARD_BOARD_NOTE_MAX_CHARS);
    let producedAt: Date | null = null;
    if (input.producedAt !== undefined && input.producedAt !== null && input.producedAt !== '') {
      if (typeof input.producedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.producedAt)) throw new BadRequestException('制作日期须为 YYYY-MM-DD 或空值。');
      const calendarDate = new Date(`${input.producedAt}T00:00:00.000Z`);
      if (!Number.isFinite(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== input.producedAt) throw new BadRequestException('制作日期不正确。');
      producedAt = new Date(`${input.producedAt}T00:00:00.000+08:00`);
      if (isFutureBusinessDate(input.producedAt, producedAt)) throw new BadRequestException('制作日期不能晚于上海业务日。');
    }
    const normalized = { taskId, taskVersion: input.taskVersion, expectedColorRevision: input.expectedColorRevision as number,
      idempotencyKey, boardCode, basedOnSampleId, remark, producedAt, registerMonth: parseRegisterMonth(input.registerMonth),
      technicalData: parseColorTechnicalData(input.technicalData) };
    if (Buffer.byteLength(JSON.stringify(normalized), 'utf8') > 24 * 1024) throw new BadRequestException('制板标定数据过大。');
    return normalized;
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
    this.assertStandardBoardCode(boardCode, '标准板编号');
    if (basedOnSampleId) {
      this.assertStandardBoardId(basedOnSampleId, '关联样板');
    }
    if (remark) {
      this.assertStandardBoardText(
        remark,
        '标准板备注',
        STANDARD_BOARD_NOTE_MAX_CHARS,
      );
    }

    const normalized = {
      boardCode,
      versionNo,
      basedOnSampleId,
      remark,
    };
    this.assertStandardBoardPayloadBytes(normalized, '标准板记录');
    return normalized;
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
    if (recipientName) {
      this.assertStandardBoardText(
        recipientName,
        '接收人',
        STANDARD_BOARD_PERSON_MAX_CHARS,
      );
    }
    if (recipientDept) {
      this.assertStandardBoardText(
        recipientDept,
        '接收部门',
        STANDARD_BOARD_PERSON_MAX_CHARS,
      );
    }
    if (remark) {
      this.assertStandardBoardText(
        remark,
        '下发备注',
        STANDARD_BOARD_NOTE_MAX_CHARS,
      );
    }

    const normalized = {
      recipientName,
      recipientDept,
      issuedAt,
      remark,
    };
    this.assertStandardBoardPayloadBytes(normalized, '标准板下发记录');
    return normalized;
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
    this.assertStandardBoardText(
      receiverName,
      '接收人',
      STANDARD_BOARD_PERSON_MAX_CHARS,
    );
    this.assertStandardBoardText(
      receiverDept,
      '接收部门',
      STANDARD_BOARD_PERSON_MAX_CHARS,
    );
    if (note) {
      this.assertStandardBoardText(
        note,
        '下发备注',
        STANDARD_BOARD_NOTE_MAX_CHARS,
      );
    }
    if (signedAt && signedAt.getTime() < sentAt.getTime()) {
      this.throwStandardBoardInputOutOfBounds('签收时间不得早于发送时间。');
    }

    const normalized = {
      receiverName,
      receiverDept,
      sentAt,
      signedAt,
      note,
    };
    this.assertStandardBoardPayloadBytes(normalized, '标准板下发记录');
    return normalized;
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
    this.assertStandardBoardId(standardBoardId, '关联标准板');
    if (note) {
      this.assertStandardBoardText(
        note,
        '明细更新备注',
        STANDARD_BOARD_NOTE_MAX_CHARS,
      );
    }

    const normalized = {
      standardBoardId,
      updateStatus,
      detailUpdatedAt,
      note,
    };
    this.assertStandardBoardPayloadBytes(normalized, '色板明细更新记录');
    return normalized;
  }

  private parsePositiveInteger(value: unknown, label: string) {
    if (typeof value !== 'number' && typeof value !== 'string') {
      throw new BadRequestException(`${label}不能为空。`);
    }

    const normalizedValue = typeof value === 'string' ? value.trim() : value;
    if (
      typeof normalizedValue === 'string' &&
      !POSITIVE_DECIMAL_INTEGER_PATTERN.test(normalizedValue)
    ) {
      this.throwStandardBoardInputOutOfBounds(
        `${label}必须是十进制正整数。`,
      );
    }

    const numericValue = Number(normalizedValue);

    if (
      !Number.isSafeInteger(numericValue) ||
      numericValue <= 0 ||
      numericValue > STANDARD_BOARD_VERSION_MAX
    ) {
      this.throwStandardBoardInputOutOfBounds(
        `${label}必须在 1～${STANDARD_BOARD_VERSION_MAX} 之间。`,
      );
    }

    return numericValue;
  }

  private assertStandardBoardId(value: string, label: string) {
    if (
      value.length > STANDARD_BOARD_ID_MAX_CHARS ||
      !STANDARD_BOARD_ID_PATTERN.test(value)
    ) {
      this.throwStandardBoardInputOutOfBounds(`${label}标识不合法。`);
    }
  }

  private assertStandardBoardCode(value: string, label: string) {
    if (
      value.length > STANDARD_BOARD_CODE_MAX_CHARS ||
      !STANDARD_BOARD_CODE_PATTERN.test(value)
    ) {
      this.throwStandardBoardInputOutOfBounds(
        `${label}仅允许 1～${STANDARD_BOARD_CODE_MAX_CHARS} 位普通文字，不得包含控制字符。`,
      );
    }
  }

  private assertSampleCode(value: string) {
    if (value.length > STANDARD_BOARD_SAMPLE_CODE_MAX_CHARS || !/^[A-Za-z0-9._-]+$/.test(value)) {
      this.throwStandardBoardInputOutOfBounds('样板编号仅允许 1～64 位字母、数字、点、下划线或连字符。');
    }
  }

  private assertStandardBoardText(
    value: string,
    label: string,
    maxChars: number,
  ) {
    if (value.length > maxChars) {
      this.throwStandardBoardInputOutOfBounds(
        `${label}不得超过 ${maxChars} 个字符。`,
      );
    }
  }

  private assertStandardBoardPayloadBytes(value: object, label: string) {
    if (
      Buffer.byteLength(JSON.stringify(value), 'utf8') >
      STANDARD_BOARD_MAX_PAYLOAD_BYTES
    ) {
      this.throwStandardBoardInputOutOfBounds(
        `${label}不得超过 ${STANDARD_BOARD_MAX_PAYLOAD_BYTES} 字节。`,
      );
    }
  }

  private throwStandardBoardInputOutOfBounds(message: string): never {
    throw new BadRequestException({
      code: 'STANDARD_BOARD_INPUT_OUT_OF_BOUNDS',
      message,
    });
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
      select: typeof STANDARD_BOARD_SUMMARY_SELECT;
    }>,
    distributionRecords: readonly BoardDistributionSummarySource[] = [],
  ) {
    return {
      id: board.id,
      colorId: board.colorId,
      colorVersionId: board.colorVersionId,
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
      distributions: distributionRecords.map((record) =>
        this.toDistributionRecordSummary(record),
      ),
    };
  }

  private toDistributionRecordSummary(
    record: BoardDistributionSummarySource,
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
      select: typeof COLOR_BOARD_DETAIL_UPDATE_SUMMARY_SELECT;
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
    board: StandardBoardAuditSource,
  ) {
    this.assertPersistedStandardBoardAuditSource(board);
    const snapshot = {
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
    this.assertStandardBoardPayloadBytes(snapshot, '标准板审计快照');
    return snapshot;
  }

  private assertPersistedStandardBoardAuditSource(board: {
    id: string;
    boardCode: string;
    versionNo: number;
    basedOnSampleId: string | null;
    basedOnSample: {
      id: string;
      sampleNo: string;
    } | null;
    issuedById: string | null;
    issuedBy: {
      id: string;
      name: string;
    } | null;
    status: StandardBoardStatus;
    isCurrent: boolean;
    producedAt: Date | null;
    issuedAt: Date | null;
    recipientName: string | null;
    recipientDept: string | null;
    remark: string | null;
  }) {
    this.assertPersistedStandardBoardIdentitySource(board);
    if (board.basedOnSampleId) {
      this.assertStandardBoardId(board.basedOnSampleId, '关联样板');
    }
    if (board.basedOnSample) {
      this.assertStandardBoardId(board.basedOnSample.id, '关联样板');
      this.assertSampleCode(board.basedOnSample.sampleNo);
    }
    if (board.issuedById) {
      this.assertStandardBoardId(board.issuedById, '下发人');
    }
    if (board.issuedBy) {
      this.assertStandardBoardId(board.issuedBy.id, '下发人');
      this.assertStandardBoardText(
        board.issuedBy.name,
        '下发人姓名',
        STANDARD_BOARD_PERSON_MAX_CHARS,
      );
    }
    if (board.recipientName) {
      this.assertStandardBoardText(
        board.recipientName,
        '接收人',
        STANDARD_BOARD_PERSON_MAX_CHARS,
      );
    }
    if (board.recipientDept) {
      this.assertStandardBoardText(
        board.recipientDept,
        '接收部门',
        STANDARD_BOARD_PERSON_MAX_CHARS,
      );
    }
    if (board.remark) {
      this.assertStandardBoardText(
        board.remark,
        '标准板备注',
        STANDARD_BOARD_NOTE_MAX_CHARS,
      );
    }
    this.assertStandardBoardAuditPayloadSourceBytes(board);
  }

  private assertPersistedStandardBoardIdentitySource(board: {
    id: string;
    boardCode: string;
    versionNo: number;
  }) {
    this.assertStandardBoardId(board.id, '标准板');
    this.assertStandardBoardCode(board.boardCode, '标准板编号');
    this.parsePositiveInteger(board.versionNo, '版本号');
  }

  private toColorBoardDetailUpdateAuditSnapshot(
    updateRecord: ColorBoardDetailUpdateAuditSource,
  ) {
    this.assertPersistedColorBoardDetailAuditSource(updateRecord);
    const snapshot = {
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
    this.assertStandardBoardPayloadBytes(snapshot, '色板明细更新审计快照');
    return snapshot;
  }

  private assertPersistedColorBoardDetailAuditSource(updateRecord: {
    id: string;
    standardBoardId: string;
    standardBoard: {
      id: string;
      boardCode: string;
      versionNo: number;
    };
    updatedById: string | null;
    updatedBy: {
      id: string;
      name: string;
    } | null;
    updateStatus: ColorBoardDetailUpdateStatus;
    detailUpdatedAt: Date;
    note: string | null;
  }) {
    this.assertStandardBoardId(updateRecord.id, '色板明细更新记录');
    this.assertStandardBoardId(updateRecord.standardBoardId, '关联标准板');
    this.assertPersistedStandardBoardIdentitySource(updateRecord.standardBoard);
    if (updateRecord.updatedById) {
      this.assertStandardBoardId(updateRecord.updatedById, '更新人');
    }
    if (updateRecord.updatedBy) {
      this.assertStandardBoardId(updateRecord.updatedBy.id, '更新人');
      this.assertStandardBoardText(
        updateRecord.updatedBy.name,
        '更新人姓名',
        STANDARD_BOARD_PERSON_MAX_CHARS,
      );
    }
    if (updateRecord.note) {
      this.assertStandardBoardText(
        updateRecord.note,
        '明细更新备注',
        STANDARD_BOARD_NOTE_MAX_CHARS,
      );
    }
    this.assertColorBoardDetailAuditPayloadSourceBytes(updateRecord);
  }

  private assertStandardBoardAuditPayloadSourceBytes(board: {
    id: string;
    boardCode: string;
    versionNo: number;
    basedOnSampleId: string | null;
    basedOnSample: { sampleNo: string } | null;
    status: StandardBoardStatus;
    isCurrent: boolean;
    producedAt: Date | null;
    issuedAt: Date | null;
    issuedById: string | null;
    issuedBy: { name: string } | null;
    recipientName: string | null;
    recipientDept: string | null;
    remark: string | null;
  }) {
    let byteLength = 1;
    byteLength = this.addJsonAuditFieldByteLength(byteLength, 'id', board.id, false);
    byteLength = this.addJsonAuditFieldByteLength(
      byteLength,
      'boardCode',
      board.boardCode,
      true,
    );
    byteLength = this.addJsonAuditFieldByteLength(
      byteLength,
      'versionNo',
      board.versionNo,
      true,
    );
    byteLength = this.addJsonAuditFieldByteLength(
      byteLength,
      'basedOnSampleId',
      board.basedOnSampleId,
      true,
    );
    byteLength = this.addJsonAuditFieldByteLength(
      byteLength,
      'basedOnSampleNo',
      board.basedOnSample?.sampleNo ?? null,
      true,
    );
    byteLength = this.addJsonAuditFieldByteLength(
      byteLength,
      'status',
      board.status,
      true,
    );
    byteLength = this.addJsonAuditFieldByteLength(
      byteLength,
      'isCurrent',
      board.isCurrent,
      true,
    );
    byteLength = this.addJsonAuditFieldByteLength(
      byteLength,
      'producedAt',
      board.producedAt?.toISOString() ?? null,
      true,
    );
    byteLength = this.addJsonAuditFieldByteLength(
      byteLength,
      'issuedAt',
      board.issuedAt?.toISOString() ?? null,
      true,
    );
    byteLength = this.addJsonAuditFieldByteLength(
      byteLength,
      'issuedById',
      board.issuedById,
      true,
    );
    byteLength = this.addJsonAuditFieldByteLength(
      byteLength,
      'issuedByName',
      board.issuedBy?.name ?? null,
      true,
    );
    byteLength = this.addJsonAuditFieldByteLength(
      byteLength,
      'recipientName',
      board.recipientName,
      true,
    );
    byteLength = this.addJsonAuditFieldByteLength(
      byteLength,
      'recipientDept',
      board.recipientDept,
      true,
    );
    byteLength = this.addJsonAuditFieldByteLength(
      byteLength,
      'remark',
      board.remark,
      true,
    );
    byteLength += 1;

    if (byteLength > STANDARD_BOARD_MAX_PAYLOAD_BYTES) {
      this.throwStandardBoardInputOutOfBounds(
        `标准板审计快照不得超过 ${STANDARD_BOARD_MAX_PAYLOAD_BYTES} 字节。`,
      );
    }
  }

  private assertColorBoardDetailAuditPayloadSourceBytes(updateRecord: {
    id: string;
    standardBoardId: string;
    standardBoard: { boardCode: string; versionNo: number };
    updateStatus: ColorBoardDetailUpdateStatus;
    detailUpdatedAt: Date;
    updatedById: string | null;
    updatedBy: { name: string } | null;
    note: string | null;
  }) {
    let byteLength = 1;
    byteLength = this.addJsonAuditFieldByteLength(
      byteLength,
      'id',
      updateRecord.id,
      false,
    );
    byteLength = this.addJsonAuditFieldByteLength(
      byteLength,
      'standardBoardId',
      updateRecord.standardBoardId,
      true,
    );
    byteLength = this.addJsonAuditFieldByteLength(
      byteLength,
      'boardCode',
      updateRecord.standardBoard.boardCode,
      true,
    );
    byteLength = this.addJsonAuditFieldByteLength(
      byteLength,
      'versionNo',
      updateRecord.standardBoard.versionNo,
      true,
    );
    byteLength = this.addJsonAuditFieldByteLength(
      byteLength,
      'updateStatus',
      updateRecord.updateStatus,
      true,
    );
    byteLength = this.addJsonAuditFieldByteLength(
      byteLength,
      'detailUpdatedAt',
      updateRecord.detailUpdatedAt.toISOString(),
      true,
    );
    byteLength = this.addJsonAuditFieldByteLength(
      byteLength,
      'updatedById',
      updateRecord.updatedById,
      true,
    );
    byteLength = this.addJsonAuditFieldByteLength(
      byteLength,
      'updatedByName',
      updateRecord.updatedBy?.name ?? null,
      true,
    );
    byteLength = this.addJsonAuditFieldByteLength(
      byteLength,
      'note',
      updateRecord.note,
      true,
    );
    byteLength += 1;

    if (byteLength > STANDARD_BOARD_MAX_PAYLOAD_BYTES) {
      this.throwStandardBoardInputOutOfBounds(
        `色板明细更新审计快照不得超过 ${STANDARD_BOARD_MAX_PAYLOAD_BYTES} 字节。`,
      );
    }
  }

  private addJsonAuditFieldByteLength(
    currentByteLength: number,
    key: string,
    value: JsonAuditScalar,
    hasPreviousField: boolean,
  ) {
    return (
      currentByteLength +
      (hasPreviousField ? 1 : 0) +
      this.getJsonStringByteLength(key) +
      1 +
      this.getJsonAuditScalarByteLength(value)
    );
  }

  private getJsonAuditScalarByteLength(value: JsonAuditScalar) {
    if (value === null) {
      return 4;
    }
    if (typeof value === 'string') {
      return this.getJsonStringByteLength(value);
    }
    if (typeof value === 'boolean') {
      return value ? 4 : 5;
    }
    return Buffer.byteLength(String(value), 'utf8');
  }

  private getJsonStringByteLength(value: string) {
    let byteLength = 2;

    for (let index = 0; index < value.length; index += 1) {
      const codeUnit = value.charCodeAt(index);

      if (
        codeUnit === 0x08 ||
        codeUnit === 0x09 ||
        codeUnit === 0x0a ||
        codeUnit === 0x0c ||
        codeUnit === 0x0d ||
        codeUnit === 0x22 ||
        codeUnit === 0x5c
      ) {
        byteLength += 2;
        continue;
      }
      if (codeUnit <= 0x1f) {
        byteLength += 6;
        continue;
      }
      if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
        const nextCodeUnit = value.charCodeAt(index + 1);
        if (nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff) {
          byteLength += 4;
          index += 1;
        } else {
          byteLength += 6;
        }
        continue;
      }
      if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
        byteLength += 6;
        continue;
      }
      if (codeUnit <= 0x7f) {
        byteLength += 1;
      } else if (codeUnit <= 0x7ff) {
        byteLength += 2;
      } else {
        byteLength += 3;
      }
    }

    return byteLength;
  }
}
