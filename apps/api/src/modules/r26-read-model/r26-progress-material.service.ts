import { createHash } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AttachmentTargetType,
  AuditTargetType,
  Prisma,
  ProjectMemberType,
  TaskBlockerStatus,
  UserStatus,
  WorkflowTaskStatus,
} from '@prisma/client';

import { PrismaService } from '../../infra/prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { AttachmentsService } from '../attachments/attachments.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ProjectAccessService } from '../auth/project-access.service';
import type {
  R26DeleteProgressDraftDto,
  R26ProgressDraftDto,
  R26SubmitProgressDto,
  R26UploadMaterialDto,
} from './dto/r26-progress-material.dto';

type UploadedBinaryFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

type Gate3BTask = Awaited<
  ReturnType<R26ProgressMaterialService['loadTaskOrThrow']>
>;

const EDITABLE_TASK_STATUSES = new Set<WorkflowTaskStatus>([
  WorkflowTaskStatus.PENDING,
  WorkflowTaskStatus.READY,
  WorkflowTaskStatus.IN_PROGRESS,
  WorkflowTaskStatus.RETURNED,
]);

const PROGRESS_PERCENT_BY_STATUS = {
  NOT_STARTED: 0,
  IN_PROGRESS: 50,
  BLOCKED: 50,
  WORK_COMPLETE_PENDING_TASK_COMPLETION: 100,
} as const;

@Injectable()
export class R26ProgressMaterialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectAccessService: ProjectAccessService,
    private readonly activityLogsService: ActivityLogsService,
    private readonly attachmentsService: AttachmentsService,
  ) {}

  async getContext(taskId: string, actor: AuthenticatedUser) {
    const task = await this.loadTaskOrThrow(taskId, actor);
    const [
      definition,
      draft,
      progressUpdates,
      attachments,
      assistanceDepartments,
    ] = await Promise.all([
      this.prisma.workflowNodeDefinition.findUnique({
        where: { nodeCode: task.nodeCode },
        select: { requiredAttachments: true },
      }),
      this.prisma.r26ProgressDraft.findUnique({
        where: {
          workflowTaskId_authorUserId: {
            workflowTaskId: task.id,
            authorUserId: actor.id,
          },
        },
      }),
      this.prisma.taskProgressUpdate.findMany({
        where: { workflowTaskId: task.id },
        include: {
          submittedBy: {
            select: {
              id: true,
              name: true,
              department: { select: { id: true, name: true } },
            },
          },
          blocker: {
            include: {
              helperUser: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 50,
      }),
      this.prisma.attachment.findMany({
        where: {
          projectId: task.projectId,
          entityType: AttachmentTargetType.WORKFLOW_TASK,
          entityId: task.id,
        },
        include: {
          uploadedBy: { select: { id: true, name: true } },
        },
        orderBy: [{ versionNo: 'desc' }, { uploadedAt: 'desc' }],
      }),
      this.prisma.department.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
    ]);
    const requiredMaterials = this.parseRequiredMaterials(
      definition?.requiredAttachments,
    );
    const materialView = this.buildMaterialView(
      task.projectId,
      task.id,
      requiredMaterials,
      attachments,
    );
    const availableActions = this.getAvailableActions(task, actor);

    return {
      gate: 'R26_GATE3B',
      taskVersion: task.updatedAt.toISOString(),
      progressSubmissionEnabled: availableActions.some(
        (action) => action.action === 'SUBMIT_PROGRESS',
      ),
      workflowTransitionEnabled: false,
      availableActions,
      draft: draft ? this.serializeDraft(draft) : null,
      progressHistory: progressUpdates.map((item) =>
        this.serializeProgress(item),
      ),
      materials: materialView,
      assistanceOptions: {
        users: this.uniquePeople([
          task.project.ownerUser,
          ...task.project.members.map((member) => member.user),
        ]),
        departments: assistanceDepartments,
      },
      notice:
        '提交进展只记录本次工作事实，不会完成工序、创建下一工序或改变当前流程节点。',
    };
  }

  getProgressHistory(taskId: string, actor: AuthenticatedUser) {
    return this.getContext(taskId, actor).then((context) => ({
      dataSource: 'database',
      gate: context.gate,
      taskId,
      progressHistory: context.progressHistory,
      materials: context.materials,
      workflowTransitionEnabled: false,
    }));
  }

  async saveDraft(
    taskId: string,
    input: R26ProgressDraftDto,
    actor: AuthenticatedUser,
    requestId: string,
  ) {
    const task = await this.loadWritableTaskOrThrow(taskId, actor);
    this.assertBlockerFields(input, false);
    await this.assertAssistanceReferences(task, input);
    const requestHash = this.hashRequest({
      action: 'R26_PROGRESS_DRAFT_SAVED',
      taskId,
      actorUserId: actor.id,
      input,
    });
    const replay = await this.findCommandReplay(
      input.idempotencyKey,
      task,
      actor,
      'R26_PROGRESS_DRAFT_SAVED',
      requestHash,
    );
    if (replay) return replay;

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const duplicate = await tx.r26CommandRequest.findUnique({
            where: { idempotencyKey: input.idempotencyKey },
          });
          if (duplicate) {
            return this.replayCommand(
              duplicate,
              task,
              actor,
              'R26_PROGRESS_DRAFT_SAVED',
              requestHash,
            );
          }

          const current = await tx.r26ProgressDraft.findUnique({
            where: {
              workflowTaskId_authorUserId: {
                workflowTaskId: task.id,
                authorUserId: actor.id,
              },
            },
          });
          const currentVersion = current?.draftVersion ?? 0;
          if (currentVersion !== input.draftVersion) {
            throw new ConflictException({
              code: 'STALE_PROGRESS_DRAFT_VERSION',
              message: '草稿已在其他标签页更新，请先刷新后再保存。',
              expectedVersion: input.draftVersion,
              currentVersion,
            });
          }

          const normalized = this.normalizeProgressFields(input);
          const draft = current
            ? await tx.r26ProgressDraft.update({
                where: { id: current.id },
                data: {
                  ...normalized,
                  draftVersion: { increment: 1 },
                },
              })
            : await tx.r26ProgressDraft.create({
                data: {
                  workflowTaskId: task.id,
                  projectId: task.projectId,
                  authorUserId: actor.id,
                  draftVersion: 1,
                  ...normalized,
                },
              });
          const result = {
            action: 'R26_PROGRESS_DRAFT_SAVED',
            requestId,
            idempotencyKey: input.idempotencyKey,
            idempotentReplay: false,
            draft: this.serializeDraft(draft),
            taskStatusChanged: false,
            workflowTransitioned: false,
          };
          await tx.r26CommandRequest.create({
            data: {
              projectId: task.projectId,
              actorUserId: actor.id,
              idempotencyKey: input.idempotencyKey,
              action: 'R26_PROGRESS_DRAFT_SAVED',
              requestHash,
              result: result as Prisma.InputJsonValue,
            },
          });
          return result;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      return this.handleIdempotentConflict(
        error,
        input.idempotencyKey,
        task,
        actor,
        'R26_PROGRESS_DRAFT_SAVED',
        requestHash,
      );
    }
  }

  async deleteDraft(
    taskId: string,
    input: R26DeleteProgressDraftDto,
    actor: AuthenticatedUser,
    requestId: string,
  ) {
    const task = await this.loadWritableTaskOrThrow(taskId, actor);
    const requestHash = this.hashRequest({
      action: 'R26_PROGRESS_DRAFT_DELETED',
      taskId,
      actorUserId: actor.id,
      input,
    });
    const replay = await this.findCommandReplay(
      input.idempotencyKey,
      task,
      actor,
      'R26_PROGRESS_DRAFT_DELETED',
      requestHash,
    );
    if (replay) return replay;

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const current = await tx.r26ProgressDraft.findUnique({
            where: {
              workflowTaskId_authorUserId: {
                workflowTaskId: task.id,
                authorUserId: actor.id,
              },
            },
          });
          if (!current) {
            throw new NotFoundException('当前工序没有可删除的草稿。');
          }
          if (current.draftVersion !== input.draftVersion) {
            throw new ConflictException({
              code: 'STALE_PROGRESS_DRAFT_VERSION',
              message: '草稿已在其他标签页更新，请刷新后重试。',
              expectedVersion: input.draftVersion,
              currentVersion: current.draftVersion,
            });
          }
          await tx.r26ProgressDraft.delete({ where: { id: current.id } });
          const result = {
            action: 'R26_PROGRESS_DRAFT_DELETED',
            requestId,
            idempotencyKey: input.idempotencyKey,
            idempotentReplay: false,
            deleted: true,
            draftVersion: current.draftVersion,
            taskStatusChanged: false,
            workflowTransitioned: false,
          };
          await tx.r26CommandRequest.create({
            data: {
              projectId: task.projectId,
              actorUserId: actor.id,
              idempotencyKey: input.idempotencyKey,
              action: 'R26_PROGRESS_DRAFT_DELETED',
              requestHash,
              result: result as Prisma.InputJsonValue,
            },
          });
          return result;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      return this.handleIdempotentConflict(
        error,
        input.idempotencyKey,
        task,
        actor,
        'R26_PROGRESS_DRAFT_DELETED',
        requestHash,
      );
    }
  }

  async submitProgress(
    taskId: string,
    input: R26SubmitProgressDto,
    actor: AuthenticatedUser,
    requestId: string,
  ) {
    const task = await this.loadWritableTaskOrThrow(taskId, actor);
    this.assertTaskVersion(task, input.taskVersion);
    this.assertBlockerFields(input, true);
    await Promise.all([
      this.assertAssistanceReferences(task, input),
      this.assertAttachmentReferences(task, input.attachmentIds ?? []),
    ]);
    const requestHash = this.hashRequest({
      action: 'R26_PROGRESS_SUBMITTED',
      taskId,
      actorUserId: actor.id,
      input,
    });
    const replay = await this.findCommandReplay(
      input.idempotencyKey,
      task,
      actor,
      'R26_PROGRESS_SUBMITTED',
      requestHash,
    );
    if (replay) {
      return {
        ...replay,
        viewModel: await this.getContext(taskId, actor),
      };
    }

    try {
      const result = await this.prisma.$transaction(
        async (tx) => {
          const lockedTask = await tx.workflowTask.findUnique({
            where: { id: task.id },
            select: {
              id: true,
              projectId: true,
              nodeCode: true,
              nodeName: true,
              status: true,
              isActive: true,
              updatedAt: true,
              workflowInstance: {
                select: { currentNodeCode: true },
              },
            },
          });
          if (!lockedTask) throw new NotFoundException('工序任务不存在。');
          this.assertTaskCanReceiveProgress(lockedTask);
          this.assertTaskVersion(lockedTask, input.taskVersion);
          const taskCountBefore = await tx.workflowTask.count({
            where: { projectId: task.projectId },
          });
          const assistanceUserIds = this.uniqueIds(
            input.assistanceUserIds ?? [],
          );
          const assistanceDepartmentIds = this.uniqueIds(
            input.assistanceDepartmentIds ?? [],
          );
          const openBlockersBefore = await tx.taskBlocker.findMany({
            where: {
              workflowTaskId: task.id,
              status: TaskBlockerStatus.OPEN,
            },
            select: {
              id: true,
              blockerType: true,
              description: true,
              helperUserId: true,
              assistanceUserIds: true,
              assistanceDepartmentIds: true,
              impactLevel: true,
              expectedResolvedAt: true,
            },
            orderBy: { createdAt: 'desc' },
          });
          if (openBlockersBefore.length > 0) {
            await tx.taskBlocker.updateMany({
              where: {
                id: { in: openBlockersBefore.map((blocker) => blocker.id) },
                status: TaskBlockerStatus.OPEN,
              },
              data: {
                status: TaskBlockerStatus.RESOLVED,
                resolvedAt: new Date(),
              },
            });
          }
          const progress = await tx.taskProgressUpdate.create({
            data: {
              workflowTaskId: task.id,
              projectId: task.projectId,
              submittedById: actor.id,
              progressStatus: input.progressStatus,
              completionPercent:
                PROGRESS_PERCENT_BY_STATUS[input.progressStatus],
              completedContent: input.completedWork.trim(),
              nextPlan: input.nextPlan?.trim() || null,
              materialAttachmentIds:
                input.attachmentIds?.length
                  ? this.uniqueIds(input.attachmentIds)
                  : Prisma.JsonNull,
              idempotencyKey: input.idempotencyKey,
              requestId,
              taskVersion: input.taskVersion,
              ...(input.progressStatus === 'BLOCKED'
                ? {
                    blocker: {
                      create: {
                        workflowTaskId: task.id,
                        projectId: task.projectId,
                        blockerType: input.blockerType!,
                        description: input.blockerDescription!.trim(),
                        helperUserId: assistanceUserIds[0] ?? null,
                        assistanceUserIds:
                          assistanceUserIds.length > 0
                            ? assistanceUserIds
                            : Prisma.JsonNull,
                        assistanceDepartmentIds:
                          assistanceDepartmentIds.length > 0
                            ? assistanceDepartmentIds
                            : Prisma.JsonNull,
                        impactLevel: input.impactLevel!,
                        expectedResolvedAt: new Date(
                          input.expectedResolvedAt!,
                        ),
                        status: TaskBlockerStatus.OPEN,
                      },
                    },
                  }
                : {}),
            },
            include: {
              submittedBy: {
                select: {
                  id: true,
                  name: true,
                  department: { select: { id: true, name: true } },
                },
              },
              blocker: {
                include: {
                  helperUser: { select: { id: true, name: true } },
                },
              },
            },
          });
          await tx.r26ProgressDraft.deleteMany({
            where: {
              workflowTaskId: task.id,
              authorUserId: actor.id,
            },
          });
          const audit = await this.activityLogsService.createWithExecutor(tx, {
            projectId: task.projectId,
            actorUserId: actor.id,
            targetType: AuditTargetType.WORKFLOW_TASK,
            targetId: task.id,
            action: 'R26_PROGRESS_SUBMITTED',
            nodeCode: task.nodeCode,
            summary:
              input.progressStatus === 'BLOCKED'
                ? `${task.nodeName} 已提交进展并申报阻塞：${input.blockerDescription!.trim()}`
                : `${task.nodeName} 已提交工作进展。`,
            beforeData: {
              blockers: openBlockersBefore.map((blocker) => ({
                id: blocker.id,
                blockerType: blocker.blockerType,
                description: blocker.description,
                helperUserId: blocker.helperUserId,
                assistanceUserIds: blocker.assistanceUserIds,
                assistanceDepartmentIds:
                  blocker.assistanceDepartmentIds,
                impactLevel: blocker.impactLevel,
                expectedResolvedAt:
                  blocker.expectedResolvedAt?.toISOString() ?? null,
                status: TaskBlockerStatus.OPEN,
              })),
            },
            afterData: {
              progressUpdateId: progress.id,
              progressStatus: input.progressStatus,
              attachmentIds: input.attachmentIds ?? [],
              blocker: progress.blocker
                ? {
                    id: progress.blocker.id,
                    blockerType: progress.blocker.blockerType,
                    description: progress.blocker.description,
                    helperUserId: progress.blocker.helperUserId,
                    assistanceUserIds:
                      progress.blocker.assistanceUserIds,
                    assistanceDepartmentIds:
                      progress.blocker.assistanceDepartmentIds,
                    impactLevel: progress.blocker.impactLevel,
                    expectedResolvedAt:
                      progress.blocker.expectedResolvedAt?.toISOString() ??
                      null,
                    status: progress.blocker.status,
                  }
                : null,
              taskStatus: lockedTask.status,
              currentNodeCode: lockedTask.workflowInstance.currentNodeCode,
              taskStatusChanged: false,
              workflowTransitioned: false,
            },
            metadata: {
              requestId,
              idempotencyKey: input.idempotencyKey,
              gate: 'R26_GATE3B',
            },
          });
          const [taskAfter, taskCountAfter] = await Promise.all([
            tx.workflowTask.findUnique({
              where: { id: task.id },
              select: {
                status: true,
                workflowInstance: {
                  select: { currentNodeCode: true },
                },
              },
            }),
            tx.workflowTask.count({ where: { projectId: task.projectId } }),
          ]);
          const result = {
            action: 'R26_PROGRESS_SUBMITTED',
            requestId,
            idempotencyKey: input.idempotencyKey,
            idempotentReplay: false,
            progressSubmitted: true,
            progress: this.serializeProgress(progress),
            auditLogId: audit.id,
            taskStatusChanged:
              taskAfter?.status !== lockedTask.status,
            workflowTransitioned:
              taskAfter?.workflowInstance.currentNodeCode !==
                lockedTask.workflowInstance.currentNodeCode ||
              taskCountAfter !== taskCountBefore,
            invariants: {
              taskStatusBefore: lockedTask.status,
              taskStatusAfter: taskAfter?.status ?? null,
              currentNodeBefore:
                lockedTask.workflowInstance.currentNodeCode,
              currentNodeAfter:
                taskAfter?.workflowInstance.currentNodeCode ?? null,
              taskCountBefore,
              taskCountAfter,
            },
          };
          if (result.taskStatusChanged || result.workflowTransitioned) {
            throw new ConflictException(
              'Gate 3B 安全断言失败：进展提交不得改变流程状态。',
            );
          }
          await tx.r26CommandRequest.create({
            data: {
              projectId: task.projectId,
              actorUserId: actor.id,
              idempotencyKey: input.idempotencyKey,
              action: 'R26_PROGRESS_SUBMITTED',
              requestHash,
              result: result as Prisma.InputJsonValue,
            },
          });
          return result;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      return {
        ...result,
        viewModel: await this.getContext(taskId, actor),
      };
    } catch (error) {
      const recovered = await this.handleIdempotentConflict(
        error,
        input.idempotencyKey,
        task,
        actor,
        'R26_PROGRESS_SUBMITTED',
        requestHash,
      );
      return {
        ...recovered,
        viewModel: await this.getContext(taskId, actor),
      };
    }
  }

  async uploadMaterial(
    taskId: string,
    input: R26UploadMaterialDto,
    file: UploadedBinaryFile | undefined,
    actor: AuthenticatedUser,
    requestId: string,
  ) {
    const task = await this.loadWritableTaskOrThrow(taskId, actor, true);
    this.assertTaskVersion(task, input.taskVersion);
    this.assertMaterialType(input.materialType);
    if (!file) throw new BadRequestException('请选择要上传的材料。');

    const replacement = input.replacesAttachmentId
      ? await this.prisma.attachment.findFirst({
          where: {
            id: input.replacesAttachmentId,
            projectId: task.projectId,
            entityType: AttachmentTargetType.WORKFLOW_TASK,
            entityId: task.id,
            isDeleted: false,
          },
        })
      : null;
    if (input.replacesAttachmentId && !replacement) {
      throw new NotFoundException('待替换材料不存在或不属于当前工序。');
    }
    if (
      replacement?.materialType &&
      replacement.materialType !== input.materialType
    ) {
      throw new BadRequestException('替换材料的类型必须与原材料一致。');
    }
    const activeSameType = await this.prisma.attachment.findFirst({
      where: {
        projectId: task.projectId,
        entityType: AttachmentTargetType.WORKFLOW_TASK,
        entityId: task.id,
        materialType: input.materialType,
        isDeleted: false,
      },
    });
    if (activeSameType && activeSameType.id !== replacement?.id) {
      throw new ConflictException({
        code: 'MATERIAL_VERSION_REPLACEMENT_REQUIRED',
        message: '该材料已有当前版本，请使用“替换版本”上传。',
        attachmentId: activeSameType.id,
      });
    }

    const requestHash = this.hashRequest({
      action: replacement
        ? 'R26_MATERIAL_VERSION_UPLOADED'
        : 'R26_MATERIAL_UPLOADED',
      taskId,
      actorUserId: actor.id,
      materialType: input.materialType,
      taskVersion: input.taskVersion,
      replacesAttachmentId: replacement?.id ?? null,
      fileName: file.originalname,
      mimeType: file.mimetype,
      fileSize: file.size,
      checksum: createHash('sha256').update(file.buffer).digest('hex'),
    });
    const action = replacement
      ? 'R26_MATERIAL_VERSION_UPLOADED'
      : 'R26_MATERIAL_UPLOADED';
    const replay = await this.findCommandReplay(
      input.idempotencyKey,
      task,
      actor,
      action,
      requestHash,
    );
    if (replay) return replay;

    try {
      await this.prisma.r26CommandRequest.create({
        data: {
          projectId: task.projectId,
          actorUserId: actor.id,
          idempotencyKey: input.idempotencyKey,
          action,
          requestHash,
          result: Prisma.JsonNull,
        },
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        const duplicate = await this.prisma.r26CommandRequest.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
        });
        if (duplicate?.result) {
          return this.replayCommand(
            duplicate,
            task,
            actor,
            action,
            requestHash,
          );
        }
        throw new ConflictException({
          code: 'MATERIAL_UPLOAD_IN_PROGRESS',
          message: '相同材料正在上传，请勿重复提交。',
        });
      }
      throw error;
    }

    try {
      const attachment = await this.attachmentsService.createStoredAttachment({
        projectId: task.projectId,
        targetType: AttachmentTargetType.WORKFLOW_TASK,
        targetId: task.id,
        file,
        uploadedById: actor.id,
        nodeCode: task.nodeCode,
        materialType: input.materialType,
        replacesAttachmentId: replacement?.id ?? null,
        summary: replacement
          ? `替换工序材料 ${input.materialType}，生成 V${replacement.versionNo + 1}`
          : `上传工序材料 ${input.materialType}`,
      });
      const result = {
        action,
        requestId,
        idempotencyKey: input.idempotencyKey,
        idempotentReplay: false,
        materialUploaded: true,
        attachment,
        taskStatusChanged: false,
        workflowTransitioned: false,
      };
      await this.prisma.r26CommandRequest.update({
        where: { idempotencyKey: input.idempotencyKey },
        data: { result: result as Prisma.InputJsonValue },
      });
      return result;
    } catch (error) {
      await this.prisma.r26CommandRequest.deleteMany({
        where: {
          idempotencyKey: input.idempotencyKey,
          result: { equals: Prisma.JsonNull },
        },
      });
      throw error;
    }
  }

  async getHistoricalMaterialContent(
    taskId: string,
    attachmentId: string,
    actor: AuthenticatedUser,
    disposition?: string,
  ) {
    const task = await this.loadTaskOrThrow(taskId, actor);
    return this.attachmentsService.getTaskMaterialVersionContent(
      task.projectId,
      task.id,
      attachmentId,
      actor,
      disposition,
    );
  }

  private async loadTaskOrThrow(
    taskId: string,
    actor: AuthenticatedUser,
  ) {
    const task = await this.prisma.workflowTask.findUnique({
      where: { id: taskId },
      include: {
        workflowInstance: {
          select: { currentNodeCode: true, status: true },
        },
        assigneeUser: {
          select: {
            id: true,
            name: true,
            status: true,
            departmentId: true,
            department: { select: { id: true, name: true } },
          },
        },
        project: {
          select: {
            id: true,
            name: true,
            ownerUserId: true,
            ownerUser: {
              select: {
                id: true,
                name: true,
                status: true,
                departmentId: true,
                department: { select: { id: true, name: true } },
              },
            },
            members: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    status: true,
                    departmentId: true,
                    department: { select: { id: true, name: true } },
                  },
                },
              },
            },
            nodeAssignments: {
              select: {
                nodeCode: true,
                collaboratorUserIds: true,
                reviewerUserIds: true,
              },
            },
          },
        },
      },
    });
    if (!task) throw new NotFoundException('工序任务不存在。');
    await this.projectAccessService.assertProjectAccessWithDefaultClient(
      task.projectId,
      actor,
      'project.read',
    );
    return task;
  }

  private async loadWritableTaskOrThrow(
    taskId: string,
    actor: AuthenticatedUser,
    forMaterial = false,
  ) {
    const task = await this.loadTaskOrThrow(taskId, actor);
    this.assertTaskCanReceiveProgress(task);
    const actions = this.getAvailableActions(task, actor);
    const requiredAction = forMaterial ? 'UPLOAD_MATERIAL' : 'SUBMIT_PROGRESS';
    if (!actions.some((action) => action.action === requiredAction)) {
      throw new ForbiddenException(
        forMaterial
          ? '当前用户不是该工序明确授权的材料提交人。'
          : '当前用户不是该工序明确授权的进展提交人。',
      );
    }
    return task;
  }

  private getAvailableActions(task: Gate3BTask, actor: AuthenticatedUser) {
    if (
      !task.isActive ||
      !EDITABLE_TASK_STATUSES.has(task.status)
    ) {
      return [];
    }
    const nodeAssignment = task.project.nodeAssignments.find(
      (item) => item.nodeCode === task.nodeCode,
    );
    const collaboratorIds = this.parseIdList(
      nodeAssignment?.collaboratorUserIds,
    );
    const managerMember = task.project.members.some(
      (member) =>
        member.userId === actor.id &&
        (member.memberType === ProjectMemberType.OWNER ||
          member.memberType === ProjectMemberType.MANAGER),
    );
    const canSubmit =
      actor.isSystemAdmin ||
      actor.roleCodes.includes('admin') ||
      task.assigneeUserId === actor.id ||
      task.project.ownerUserId === actor.id ||
      managerMember ||
      collaboratorIds.includes(actor.id);
    if (!canSubmit) return [];
    return [
      { action: 'SAVE_PROGRESS_DRAFT', label: '保存草稿' },
      { action: 'DELETE_PROGRESS_DRAFT', label: '删除草稿' },
      { action: 'SUBMIT_PROGRESS', label: '提交工作进展' },
      { action: 'UPLOAD_MATERIAL', label: '上传工序材料' },
    ];
  }

  private assertTaskCanReceiveProgress(task: {
    status: WorkflowTaskStatus;
    isActive: boolean;
  }) {
    if (!task.isActive || !EDITABLE_TASK_STATUSES.has(task.status)) {
      throw new BadRequestException('当前任务状态不允许提交普通工作进展。');
    }
  }

  private assertTaskVersion(
    task: { updatedAt: Date },
    taskVersion: string,
  ) {
    if (task.updatedAt.toISOString() !== new Date(taskVersion).toISOString()) {
      throw new ConflictException({
        code: 'STALE_TASK_VERSION',
        message: '工序信息已更新，请刷新后再提交。',
        expectedVersion: taskVersion,
        currentVersion: task.updatedAt.toISOString(),
      });
    }
  }

  private assertBlockerFields(
    input: R26ProgressDraftDto | R26SubmitProgressDto,
    formal: boolean,
  ) {
    if (input.progressStatus !== 'BLOCKED') return;
    if (!formal) return;
    if (
      !input.blockerType ||
      !input.blockerDescription?.trim() ||
      !input.expectedResolvedAt ||
      !input.impactLevel
    ) {
      throw new BadRequestException(
        '申报阻塞时必须填写类型、说明、预计解除时间和影响程度。',
      );
    }
    if (
      (input.assistanceUserIds?.length ?? 0) === 0 &&
      (input.assistanceDepartmentIds?.length ?? 0) === 0
    ) {
      throw new BadRequestException('申报阻塞时必须选择协助人员或部门。');
    }
  }

  private async assertAssistanceReferences(
    task: Gate3BTask,
    input: Pick<
      R26ProgressDraftDto,
      'assistanceUserIds' | 'assistanceDepartmentIds'
    >,
  ) {
    const userIds = this.uniqueIds(input.assistanceUserIds ?? []);
    const departmentIds = this.uniqueIds(
      input.assistanceDepartmentIds ?? [],
    );
    if (userIds.length > 0) {
      const allowed = new Set(
        [
          task.project.ownerUser,
          ...task.project.members.map((member) => member.user),
        ]
          .filter((person) => person?.status === UserStatus.ACTIVE)
          .map((person) => person!.id),
      );
      if (userIds.some((id) => !allowed.has(id))) {
        throw new BadRequestException(
          '协助人员必须是当前项目的有效成员或项目负责人。',
        );
      }
    }
    if (departmentIds.length > 0) {
      const count = await this.prisma.department.count({
        where: { id: { in: departmentIds }, isActive: true },
      });
      if (count !== departmentIds.length) {
        throw new BadRequestException('协助部门不存在或已停用。');
      }
    }
  }

  private async assertAttachmentReferences(
    task: Gate3BTask,
    attachmentIds: string[],
  ) {
    const uniqueIds = this.uniqueIds(attachmentIds);
    if (uniqueIds.length === 0) return;
    const count = await this.prisma.attachment.count({
      where: {
        id: { in: uniqueIds },
        projectId: task.projectId,
        entityType: AttachmentTargetType.WORKFLOW_TASK,
        entityId: task.id,
        isDeleted: false,
      },
    });
    if (count !== uniqueIds.length) {
      throw new BadRequestException(
        '进展只能引用当前工序中仍有效的材料。',
      );
    }
  }

  private normalizeProgressFields(input: R26ProgressDraftDto) {
    return {
      progressStatus: input.progressStatus,
      completedWork: input.completedWork?.trim() || null,
      nextPlan: input.nextPlan?.trim() || null,
      blockerType:
        input.progressStatus === 'BLOCKED' ? input.blockerType ?? null : null,
      blockerDescription:
        input.progressStatus === 'BLOCKED'
          ? input.blockerDescription?.trim() || null
          : null,
      assistanceUserIds:
        input.progressStatus === 'BLOCKED' &&
        (input.assistanceUserIds?.length ?? 0) > 0
          ? this.uniqueIds(input.assistanceUserIds ?? [])
          : Prisma.JsonNull,
      assistanceDepartmentIds:
        input.progressStatus === 'BLOCKED' &&
        (input.assistanceDepartmentIds?.length ?? 0) > 0
          ? this.uniqueIds(input.assistanceDepartmentIds ?? [])
          : Prisma.JsonNull,
      expectedResolvedAt:
        input.progressStatus === 'BLOCKED' && input.expectedResolvedAt
          ? new Date(input.expectedResolvedAt)
          : null,
      impactLevel:
        input.progressStatus === 'BLOCKED' ? input.impactLevel ?? null : null,
    };
  }

  private serializeDraft(draft: {
    id: string;
    draftVersion: number;
    progressStatus: string;
    completedWork: string | null;
    nextPlan: string | null;
    blockerType: string | null;
    blockerDescription: string | null;
    assistanceUserIds: Prisma.JsonValue;
    assistanceDepartmentIds: Prisma.JsonValue;
    expectedResolvedAt: Date | null;
    impactLevel: string | null;
    updatedAt: Date;
  }) {
    return {
      id: draft.id,
      draftVersion: draft.draftVersion,
      progressStatus: draft.progressStatus,
      completedWork: draft.completedWork,
      nextPlan: draft.nextPlan,
      blockerType: draft.blockerType,
      blockerDescription: draft.blockerDescription,
      assistanceUserIds: this.parseIdList(draft.assistanceUserIds),
      assistanceDepartmentIds: this.parseIdList(
        draft.assistanceDepartmentIds,
      ),
      expectedResolvedAt: draft.expectedResolvedAt?.toISOString() ?? null,
      impactLevel: draft.impactLevel,
      updatedAt: draft.updatedAt.toISOString(),
    };
  }

  private serializeProgress(item: {
    id: string;
    progressStatus: string;
    completionPercent: number;
    completedContent: string;
    nextPlan: string | null;
    materialAttachmentIds: Prisma.JsonValue;
    requestId: string | null;
    taskVersion: string | null;
    submittedById: string | null;
    submittedBy: {
      id: string;
      name: string;
      department: { id: string; name: string } | null;
    } | null;
    blocker: {
      blockerType: string;
      description: string;
      assistanceUserIds: Prisma.JsonValue;
      assistanceDepartmentIds: Prisma.JsonValue;
      impactLevel: string | null;
      expectedResolvedAt: Date | null;
      status: TaskBlockerStatus;
      helperUser: { id: string; name: string } | null;
    } | null;
    createdAt: Date;
  }) {
    return {
      id: item.id,
      progressStatus: item.progressStatus,
      completionPercent: item.completionPercent,
      completedWork: item.completedContent,
      nextPlan: item.nextPlan,
      attachmentIds: this.parseIdList(item.materialAttachmentIds),
      requestId: item.requestId,
      taskVersion: item.taskVersion,
      submittedBy: item.submittedBy
        ? {
            id: item.submittedBy.id,
            name: item.submittedBy.name,
            departmentName: item.submittedBy.department?.name ?? null,
          }
        : null,
      blocker: item.blocker
        ? {
            type: item.blocker.blockerType,
            description: item.blocker.description,
            assistanceUserIds: this.parseIdList(
              item.blocker.assistanceUserIds,
            ),
            assistanceDepartmentIds: this.parseIdList(
              item.blocker.assistanceDepartmentIds,
            ),
            impactLevel: item.blocker.impactLevel,
            expectedResolvedAt:
              item.blocker.expectedResolvedAt?.toISOString() ?? null,
            status: item.blocker.status,
            helper: item.blocker.helperUser,
          }
        : null,
      createdAt: item.createdAt.toISOString(),
    };
  }

  private parseRequiredMaterials(
    value: Prisma.JsonValue | null | undefined,
  ) {
    if (!Array.isArray(value)) return [];
    return value
      .map((item, index) => {
        if (typeof item === 'string') {
          return {
            id: `material-${index + 1}`,
            name: item,
            required: true,
            description: null,
          };
        }
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          return null;
        }
        const record = item as Record<string, unknown>;
        const name = typeof record.name === 'string' ? record.name : null;
        if (!name) return null;
        return {
          id:
            typeof record.id === 'string'
              ? record.id
              : typeof record.code === 'string'
                ? record.code
                : `material-${index + 1}`,
          name,
          required:
            typeof record.required === 'boolean' ? record.required : true,
          description:
            typeof record.description === 'string'
              ? record.description
              : null,
        };
      })
      .filter(
        (
          material,
        ): material is {
          id: string;
          name: string;
          required: boolean;
          description: string | null;
        } => material !== null,
      );
  }

  private buildMaterialView(
    projectId: string,
    taskId: string,
    requiredMaterials: Array<{
      id: string;
      name: string;
      required: boolean;
      description: string | null;
    }>,
    attachments: Array<{
      id: string;
      fileName: string;
      originalFileName: string | null;
      mimeType: string;
      fileSize: number;
      materialType: string | null;
      versionNo: number;
      replacesAttachmentId: string | null;
      uploadedById: string | null;
      uploadedBy: { id: string; name: string } | null;
      uploadedAt: Date;
      isDeleted: boolean;
    }>,
  ) {
    const serialize = (attachment: (typeof attachments)[number]) => ({
      id: attachment.id,
      fileName: attachment.originalFileName ?? attachment.fileName,
      mimeType: attachment.mimeType,
      fileSize: attachment.fileSize,
      materialType: attachment.materialType,
      versionNo: attachment.versionNo,
      replacesAttachmentId: attachment.replacesAttachmentId,
      uploadedById: attachment.uploadedById,
      uploadedByName: attachment.uploadedBy?.name ?? null,
      uploadedAt: attachment.uploadedAt.toISOString(),
      isCurrent: !attachment.isDeleted,
      downloadUrl: `/v2/tasks/${taskId}/materials/${attachment.id}/content`,
      projectId,
    });
    const current = attachments.filter((attachment) => !attachment.isDeleted);
    const requirements = requiredMaterials.map((material) => {
      const currentAttachment =
        current.find(
          (attachment) =>
            attachment.materialType === material.id ||
            attachment.materialType === material.name,
        ) ??
        current.find((attachment) =>
          attachment.fileName.includes(material.name),
        ) ??
        null;
      return {
        ...material,
        status: currentAttachment ? 'SUBMITTED' : 'MISSING',
        currentAttachment: currentAttachment
          ? serialize(currentAttachment)
          : null,
      };
    });
    return {
      requirements,
      current: current.map(serialize),
      versions: attachments.map(serialize),
      summary: {
        required: requirements.filter((item) => item.required).length,
        submitted: requirements.filter(
          (item) => item.required && item.status === 'SUBMITTED',
        ).length,
        missing: requirements.filter(
          (item) => item.required && item.status === 'MISSING',
        ).length,
        uploaded: current.length,
      },
    };
  }

  private uniquePeople(
    people: Array<{
      id: string;
      name: string;
      status: UserStatus;
      departmentId: string | null;
      department: { id: string; name: string } | null;
    } | null>,
  ) {
    return [
      ...new Map(
        people
          .filter(
            (
              person,
            ): person is NonNullable<(typeof people)[number]> =>
              person !== null && person.status === UserStatus.ACTIVE,
          )
          .map((person) => [
            person.id,
            {
              id: person.id,
              name: person.name,
              departmentId: person.departmentId,
              departmentName: person.department?.name ?? null,
            },
          ]),
      ).values(),
    ];
  }

  private assertMaterialType(value: string) {
    const normalized = value.trim();
    if (
      !normalized ||
      normalized.includes('..') ||
      /[<>"'`\\/]/u.test(normalized)
    ) {
      throw new BadRequestException('材料类型无效。');
    }
  }

  private normalizeCommandResult(value: Prisma.JsonValue | null) {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  private async findCommandReplay(
    idempotencyKey: string,
    task: Gate3BTask,
    actor: AuthenticatedUser,
    action: string,
    requestHash: string,
  ) {
    const existing = await this.prisma.r26CommandRequest.findUnique({
      where: { idempotencyKey },
    });
    return existing
      ? this.replayCommand(existing, task, actor, action, requestHash)
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
    task: Gate3BTask,
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
        message: '相同请求正在处理中，请稍后重试。',
      });
    }
    return { ...result, idempotentReplay: true };
  }

  private async handleIdempotentConflict(
    error: unknown,
    idempotencyKey: string,
    task: Gate3BTask,
    actor: AuthenticatedUser,
    action: string,
    requestHash: string,
  ): Promise<Record<string, unknown>> {
    if (this.isUniqueConstraintError(error)) {
      const duplicate = await this.prisma.r26CommandRequest.findUnique({
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
        code: 'CONCURRENT_PROGRESS_UPDATE',
        message: '进展正在被其他标签页更新，请刷新后重试。',
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
      return `[${value.map((item) => this.stableStringify(item)).join(',')}]`;
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

  private parseIdList(value: Prisma.JsonValue | null | undefined) {
    return Array.isArray(value)
      ? value.filter(
          (item): item is string =>
            typeof item === 'string' && item.length > 0,
        )
      : [];
  }

  private uniqueIds(values: string[]) {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
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
