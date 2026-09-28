import {
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  ProjectMemberType,
  UserStatus,
  WorkflowInstanceStatus,
  WorkflowNodeCode,
  WorkflowTaskStatus,
} from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { installTeamAuthorizationFixture } from '../../test-support/team-authorization.fixture';

import type { AuthenticatedUser } from '../auth/auth.types';
import { R26ProgressMaterialService } from './r26-progress-material.service';

const actor: AuthenticatedUser = {
  id: 'user-owner',
  username: 'owner',
  name: '李晓晨',
  email: null,
  departmentId: 'dept-purchase',
  departmentName: '采购部',
  isSystemAdmin: false,
  authSource: 'local',
  authVersion: 1,
  roleCodes: ['purchaser'],
  permissionCodes: [
    'project.read',
    'workflow.transition',
    'attachment.manage',
  ],
};

const ordinaryAdminReadOnly: AuthenticatedUser = {
  ...actor,
  id: 'ordinary-admin-read-only',
  username: 'ordinary-admin-read-only',
  name: '仅有读取权限的普通管理员',
  roleCodes: ['admin'],
  permissionCodes: ['project.read'],
};

const ordinaryAdminProgressWriter: AuthenticatedUser = {
  ...ordinaryAdminReadOnly,
  id: 'ordinary-admin-progress-writer',
  username: 'ordinary-admin-progress-writer',
  name: '仅有进展写权限的普通管理员',
  permissionCodes: ['project.read', 'workflow.transition'],
};

const ordinaryAdminMaterialWriter: AuthenticatedUser = {
  ...ordinaryAdminReadOnly,
  id: 'ordinary-admin-material-writer',
  username: 'ordinary-admin-material-writer',
  name: '仅有材料写权限的普通管理员',
  permissionCodes: ['project.read', 'attachment.manage'],
};

const permissionlessSystemAdmin: AuthenticatedUser = {
  ...ordinaryAdminReadOnly,
  id: 'permissionless-system-admin',
  username: 'permissionless-system-admin',
  name: '无权限码系统管理员',
  isSystemAdmin: true,
  roleCodes: [],
  permissionCodes: [],
};

const taskUpdatedAt = new Date('2026-07-24T03:00:00.000Z');

function task(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-6',
    projectId: 'project-1',
    workflowInstanceId: 'workflow-1',
    taskNo: 'TASK-006',
    nodeCode: WorkflowNodeCode.PAINT_PROCUREMENT,
    stepCode: '06',
    nodeName: '涂料采购',
    taskRound: 1,
    status: WorkflowTaskStatus.IN_PROGRESS,
    isPrimary: true,
    isActive: true,
    assigneeUserId: actor.id,
    assigneeDepartmentId: 'dept-purchase',
    dueAt: new Date('2026-07-30T09:00:00.000Z'),
    manualDueAt: null,
    effectiveDueAt: new Date('2026-07-30T09:00:00.000Z'),
    reviewPassAt: null,
    overdueDays: 0,
    startedAt: new Date('2026-07-23T09:00:00.000Z'),
    completedAt: null,
    returnedAt: null,
    returnedFromTaskId: null,
    reworkReason: null,
    idempotencyKey: null,
    payload: null,
    createdAt: new Date('2026-07-23T09:00:00.000Z'),
    updatedAt: taskUpdatedAt,
    workflowInstance: {
      currentNodeCode: WorkflowNodeCode.PAINT_PROCUREMENT,
      status: WorkflowInstanceStatus.RUNNING,
    },
    assigneeUser: {
      id: actor.id,
      name: actor.name,
      status: UserStatus.ACTIVE,
      departmentId: 'dept-purchase',
      department: { id: 'dept-purchase', name: '采购部' },
    },
    project: {
      id: 'project-1',
      name: 'R26-G3B-UAT-进展提交',
      ownerUserId: 'project-manager',
      ownerUser: {
        id: 'project-manager',
        name: '项目经理',
        status: UserStatus.ACTIVE,
        departmentId: 'dept-pmo',
        department: { id: 'dept-pmo', name: '项目管理部' },
      },
      members: [
        {
          id: 'member-1',
          projectId: 'project-1',
          userId: actor.id,
          memberType: ProjectMemberType.MEMBER,
          title: '采购执行',
          isPrimary: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          user: {
            id: actor.id,
            name: actor.name,
            status: UserStatus.ACTIVE,
            departmentId: 'dept-purchase',
            department: { id: 'dept-purchase', name: '采购部' },
          },
        },
      ],
      nodeAssignments: [],
    },
    ...overrides,
  };
}

function progressRecord(
  overrides: Record<string, unknown> = {},
) {
  return {
    id: 'progress-1',
    workflowTaskId: 'task-6',
    projectId: 'project-1',
    submittedById: actor.id,
    progressStatus: 'IN_PROGRESS',
    completionPercent: 50,
    completedContent: '已核对采购批次。',
    nextPlan: '补充到货确认记录。',
    materialAttachmentIds: [],
    idempotencyKey: 'r26-g3b:submit:00000001',
    requestId: 'request-1',
    taskVersion: taskUpdatedAt.toISOString(),
    createdAt: new Date('2026-07-24T03:05:00.000Z'),
    submittedBy: {
      id: actor.id,
      name: actor.name,
      department: { id: 'dept-purchase', name: '采购部' },
    },
    blocker: null,
    ...overrides,
  };
}

function createService(options: {
  loadedTask?: ReturnType<typeof task>;
  command?: unknown;
  transaction?: (tx: Record<string, unknown>) => Promise<unknown>;
  attachmentCreate?: ReturnType<typeof vi.fn>;
} = {}) {
  const loadedTask = options.loadedTask ?? task();
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: loadedTask.id }]),
    workflowTask: {
      findUnique: vi.fn().mockResolvedValue(loadedTask),
      findUniqueOrThrow: vi.fn().mockResolvedValue(loadedTask),
      count: vi.fn().mockResolvedValue(18),
      update: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    taskProgressUpdate: {
      create: vi.fn().mockResolvedValue(progressRecord()),
    },
    taskBlocker: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    r26ProgressDraft: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    r26CommandRequest: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'command-1' }),
      update: vi.fn(), deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    attachment: { findFirst: vi.fn().mockResolvedValue(null) },
  };
  const prisma = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    workflowTask: {
      findUnique: vi.fn().mockResolvedValue(loadedTask),
    },
    workflowNodeDefinition: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    r26ProgressDraft: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    taskProgressUpdate: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    r26CommandRequest: {
      findUnique: vi.fn().mockResolvedValue(options.command ?? null),
      create: vi.fn().mockResolvedValue({ id: 'command-upload' }),
      update: vi.fn().mockResolvedValue({ id: 'command-upload' }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    department: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    attachment: {
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn(
      options.transaction ??
        (async (executor: (client: typeof tx) => Promise<unknown>) =>
          executor(tx)),
    ),
  };
  tx.r26CommandRequest.deleteMany = prisma.r26CommandRequest.deleteMany;
  installTeamAuthorizationFixture(tx, [{ ...actor, authVersion: 1 }], () => loadedTask);
  const projectAccess = {
    assertProjectAccessWithDefaultClient: vi.fn().mockResolvedValue({
      id: loadedTask.projectId,
    }),
  };
  const activityLogs = {
    createWithExecutor: vi.fn().mockResolvedValue({ id: 'audit-1' }),
  };
  const attachmentCreate =
    options.attachmentCreate ??
    vi.fn().mockResolvedValue({
      id: 'attachment-1',
      fileName: '到货确认记录.pdf',
      versionNo: 1,
    });
  const attachments = {
    createStoredAttachment: attachmentCreate,
    getTaskMaterialVersionContent: vi.fn(),
  };
  const service = new R26ProgressMaterialService(
    prisma as never,
    projectAccess as never,
    activityLogs as never,
    attachments as never,
  );
  return {
    service,
    prisma,
    tx,
    projectAccess,
    activityLogs,
    attachmentCreate,
  };
}

const replayMaterialFile = {
  originalname: '到货确认记录.pdf',
  mimetype: 'application/pdf',
  size: 64,
  buffer: Buffer.from('%PDF-1.4\nmaterial-replay'),
};

function createMaterialReplayHarness(options: { replacement?: boolean } = {}) {
  const replacement = options.replacement ?? false;
  const oldAttachment = {
    id: 'attachment-old',
    projectId: 'project-1',
    entityType: 'WORKFLOW_TASK',
    entityId: 'task-6',
    materialType: 'WORK_EVIDENCE',
    versionNo: 2,
    isDeleted: false,
    scanStatus: 'CLEAN',
  };
  let oldAttachmentDeleted = false;
  let currentTask = task();
  let storedCommand: Record<string, unknown> | null = null;

  const commandFindUnique = vi.fn(async () => storedCommand);
  const commandCreate = vi.fn(
    async (args: { data: Record<string, unknown> }) => {
      storedCommand = { ...args.data };
      return { id: 'command-material-replay' };
    },
  );
  const commandUpdate = vi.fn(
    async (args: { data: { result: unknown } }) => {
      storedCommand = {
        ...(storedCommand ?? {}),
        result: args.data.result,
      };
      currentTask = task({
        updatedAt: new Date(taskUpdatedAt.getTime() + 1_000),
      });
      if (replacement) oldAttachmentDeleted = true;
      return { id: 'command-material-replay' };
    },
  );
  const attachmentFindFirst = vi.fn(
    async (args: { where: Record<string, unknown> }) => {
      if (!replacement || oldAttachmentDeleted) return null;
      if (
        args.where.id === oldAttachment.id ||
        args.where.materialType === oldAttachment.materialType
      ) {
        return oldAttachment;
      }
      return null;
    },
  );
  const attachmentCreate = vi.fn().mockResolvedValue({
    id: replacement ? 'attachment-v3' : 'attachment-v1',
    fileName: replayMaterialFile.originalname,
    versionNo: replacement ? 3 : 1,
  });
  const prisma = {
    workflowTask: {
      findUnique: vi.fn(async () => currentTask),
    },
    attachment: {
      findFirst: attachmentFindFirst,
    },
    r26CommandRequest: {
      findUnique: commandFindUnique,
      create: commandCreate,
      update: commandUpdate,
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const tx = { ...prisma, $queryRaw: vi.fn().mockResolvedValue([{ id: 'task-6' }]), workflowTask: {
    findUnique: vi.fn(async () => currentTask), findUniqueOrThrow: vi.fn(async () => currentTask),
  } };
  installTeamAuthorizationFixture(tx, [{ ...actor, authVersion: 1 }], () => currentTask);
  Object.assign(prisma, { $transaction: vi.fn(async (operation: (client: typeof tx) => Promise<unknown>) => operation(tx)) });
  attachmentCreate.mockImplementation(async (input: any) => {
    const stored = { id: replacement ? 'attachment-v3' : 'attachment-v1', fileName: replayMaterialFile.originalname, versionNo: replacement ? 3 : 1 };
    await input.finalizeUploadResult(tx, stored);
    return stored;
  });
  const projectAccess = {
    assertProjectAccessWithDefaultClient: vi.fn().mockResolvedValue({
      id: 'project-1',
    }),
  };
  const service = new R26ProgressMaterialService(
    prisma as never,
    projectAccess as never,
    {} as never,
    { createStoredAttachment: attachmentCreate } as never,
  );

  return {
    service,
    prisma,
    attachmentCreate,
    attachmentFindFirst,
    isOldAttachmentDeleted: () => oldAttachmentDeleted,
  };
}

const submitInput = {
  progressStatus: 'IN_PROGRESS' as const,
  completedWork: '已核对采购批次。',
  nextPlan: '补充到货确认记录。',
  assistanceUserIds: [],
  assistanceDepartmentIds: [],
  attachmentIds: [],
  taskVersion: taskUpdatedAt.toISOString(),
  idempotencyKey: 'r26-g3b:submit:00000001',
};

describe('R26 Gate 3B progress and material service', () => {
  it('replays a successful V1 material upload after the finalize hook bumps taskVersion without a second scan or storage write', async () => {
    const harness = createMaterialReplayHarness();
    const input = {
      materialType: 'WORK_EVIDENCE',
      taskVersion: taskUpdatedAt.toISOString(),
      idempotencyKey: 'r26-material-replay-v1',
    };

    const first = await harness.service.uploadMaterial(
      'task-6',
      input,
      replayMaterialFile,
      actor,
      'request-material-v1-first',
    );
    const replay = await harness.service.uploadMaterial(
      'task-6',
      input,
      replayMaterialFile,
      actor,
      'request-material-v1-replay',
    );

    expect(first).toMatchObject({
      action: 'R26_MATERIAL_UPLOADED',
      idempotentReplay: false,
      materialUploaded: true,
    });
    expect(replay).toMatchObject({
      action: 'R26_MATERIAL_UPLOADED',
      idempotentReplay: true,
      materialUploaded: true,
    });
    expect(harness.attachmentCreate).toHaveBeenCalledTimes(1);
    expect(harness.prisma.r26CommandRequest.create).toHaveBeenCalledTimes(1);
    expect(harness.prisma.r26CommandRequest.update).toHaveBeenCalledTimes(1);
    expect(harness.attachmentFindFirst).toHaveBeenCalledTimes(1);
  });

  it('replays a successful material replacement after the old attachment is deleted without revalidating or rescanning it', async () => {
    const harness = createMaterialReplayHarness({ replacement: true });
    const input = {
      materialType: 'WORK_EVIDENCE',
      taskVersion: taskUpdatedAt.toISOString(),
      idempotencyKey: 'r26-material-replay-replacement',
      replacesAttachmentId: 'attachment-old',
    };

    const first = await harness.service.uploadMaterial(
      'task-6',
      input,
      replayMaterialFile,
      actor,
      'request-material-replacement-first',
    );
    expect(harness.isOldAttachmentDeleted()).toBe(true);
    const attachmentReadsAfterFirstUpload =
      harness.attachmentFindFirst.mock.calls.length;

    const replay = await harness.service.uploadMaterial(
      'task-6',
      input,
      replayMaterialFile,
      actor,
      'request-material-replacement-replay',
    );

    expect(first).toMatchObject({
      action: 'R26_MATERIAL_VERSION_UPLOADED',
      idempotentReplay: false,
      materialUploaded: true,
    });
    expect(replay).toMatchObject({
      action: 'R26_MATERIAL_VERSION_UPLOADED',
      idempotentReplay: true,
      materialUploaded: true,
    });
    expect(harness.attachmentFindFirst).toHaveBeenCalledTimes(
      attachmentReadsAfterFirstUpload,
    );
    expect(harness.attachmentCreate).toHaveBeenCalledTimes(1);
  });

  it('rejects a changed material payload that reuses a completed upload key before any second scan or storage write', async () => {
    const harness = createMaterialReplayHarness();
    const input = {
      materialType: 'WORK_EVIDENCE',
      taskVersion: taskUpdatedAt.toISOString(),
      idempotencyKey: 'r26-material-replay-different-payload',
    };
    await harness.service.uploadMaterial(
      'task-6',
      input,
      replayMaterialFile,
      actor,
      'request-material-original',
    );

    await expect(
      harness.service.uploadMaterial(
        'task-6',
        input,
        {
          ...replayMaterialFile,
          buffer: Buffer.from('%PDF-1.4\nchanged-payload'),
        },
        actor,
        'request-material-changed',
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST',
      },
    });
    expect(harness.attachmentCreate).toHaveBeenCalledTimes(1);
    expect(harness.attachmentFindFirst).toHaveBeenCalledTimes(1);
    expect(harness.prisma.r26CommandRequest.create).toHaveBeenCalledTimes(1);
  });

  it('rejects save, submit and upload for an ordinary admin with project.read only before commands, storage or audit', async () => {
    const noScopeTask = task({
      assigneeUserId: 'another-user',
      project: {
        ...task().project,
        ownerUserId: 'another-owner',
        members: [],
        nodeAssignments: [],
      },
    });

    const draftCase = createService({ loadedTask: noScopeTask });
    await expect(
      draftCase.service.saveDraft(
        'task-6',
        {
          draftVersion: 0,
          progressStatus: 'IN_PROGRESS',
          completedWork: '不应写入',
          idempotencyKey: 'r26-permission:draft-read-only',
        },
        ordinaryAdminReadOnly,
        'request-draft-read-only',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(draftCase.prisma.$transaction).not.toHaveBeenCalled();
    expect(draftCase.prisma.r26CommandRequest.findUnique).not.toHaveBeenCalled();
    expect(draftCase.tx.r26ProgressDraft.create).not.toHaveBeenCalled();
    expect(draftCase.activityLogs.createWithExecutor).not.toHaveBeenCalled();

    const submitCase = createService({ loadedTask: noScopeTask });
    await expect(
      submitCase.service.submitProgress(
        'task-6',
        submitInput,
        ordinaryAdminReadOnly,
        'request-submit-read-only',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(submitCase.prisma.$transaction).not.toHaveBeenCalled();
    expect(submitCase.prisma.r26CommandRequest.findUnique).not.toHaveBeenCalled();
    expect(submitCase.tx.taskProgressUpdate.create).not.toHaveBeenCalled();
    expect(submitCase.activityLogs.createWithExecutor).not.toHaveBeenCalled();

    const uploadCase = createService({ loadedTask: noScopeTask });
    await expect(
      uploadCase.service.uploadMaterial(
        'task-6',
        {
          materialType: 'WORK_EVIDENCE',
          taskVersion: taskUpdatedAt.toISOString(),
          idempotencyKey: 'r26-permission:upload-read-only',
        },
        {
          originalname: '不应写入.pdf',
          mimetype: 'application/pdf',
          size: 64,
          buffer: Buffer.from('%PDF-1.4\n'),
        },
        ordinaryAdminReadOnly,
        'request-upload-read-only',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(uploadCase.prisma.r26CommandRequest.create).not.toHaveBeenCalled();
    expect(uploadCase.attachmentCreate).not.toHaveBeenCalled();
    expect(uploadCase.activityLogs.createWithExecutor).not.toHaveBeenCalled();
  });

  it('rejects progress and materials for an unqualified admin with workflow.transition', async () => {
    const noScopeTask = task({
      assigneeUserId: 'another-user',
      project: {
        ...task().project,
        ownerUserId: 'another-owner',
        members: [],
        nodeAssignments: [],
      },
    });
    const progressCase = createService({ loadedTask: noScopeTask });

    await expect(
      progressCase.service.submitProgress(
        'task-6',
        submitInput,
        ordinaryAdminProgressWriter,
        'request-progress-writer',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(progressCase.tx.taskProgressUpdate.create).not.toHaveBeenCalled();

    const materialCase = createService({ loadedTask: noScopeTask });
    await expect(
      materialCase.service.uploadMaterial(
        'task-6',
        {
          materialType: 'WORK_EVIDENCE',
          taskVersion: taskUpdatedAt.toISOString(),
          idempotencyKey: 'r26-permission:progress-cannot-upload',
        },
        {
          originalname: '不应上传.pdf',
          mimetype: 'application/pdf',
          size: 64,
          buffer: Buffer.from('%PDF-1.4\n'),
        },
        ordinaryAdminProgressWriter,
        'request-progress-cannot-upload',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(materialCase.attachmentCreate).not.toHaveBeenCalled();
  });

  it('rejects materials and progress for an unqualified admin with attachment.manage', async () => {
    const noScopeTask = task({
      assigneeUserId: 'another-user',
      project: {
        ...task().project,
        ownerUserId: 'another-owner',
        members: [],
        nodeAssignments: [],
      },
    });
    const progressCase = createService({ loadedTask: noScopeTask });
    await expect(
      progressCase.service.submitProgress(
        'task-6',
        submitInput,
        ordinaryAdminMaterialWriter,
        'request-material-cannot-progress',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(progressCase.tx.taskProgressUpdate.create).not.toHaveBeenCalled();

    const materialCase = createService({ loadedTask: noScopeTask });
    await expect(
      materialCase.service.uploadMaterial(
        'task-6',
        {
          materialType: 'WORK_EVIDENCE',
          taskVersion: taskUpdatedAt.toISOString(),
          idempotencyKey: 'r26-permission:material-writer',
        },
        {
          originalname: '允许上传.pdf',
          mimetype: 'application/pdf',
          size: 64,
          buffer: Buffer.from('%PDF-1.4\n'),
        },
        ordinaryAdminMaterialWriter,
        'request-material-writer',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(materialCase.attachmentCreate).not.toHaveBeenCalled();
    expect(materialCase.prisma.r26CommandRequest.create).not.toHaveBeenCalled();
  });

  it('denies a system administrator business writes without the required role and claim', async () => {
    const noScopeTask = task({
      assigneeUserId: 'another-user',
      project: {
        ...task().project,
        ownerUserId: 'another-owner',
        members: [],
        nodeAssignments: [],
      },
    });
    const progressCase = createService({ loadedTask: noScopeTask });
    await expect(
      progressCase.service.submitProgress(
        'task-6',
        submitInput,
        permissionlessSystemAdmin,
        'request-system-admin-progress',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(progressCase.tx.taskProgressUpdate.create).not.toHaveBeenCalled();

    const materialCase = createService({ loadedTask: noScopeTask });
    await expect(
      materialCase.service.uploadMaterial(
        'task-6',
        {
          materialType: 'WORK_EVIDENCE',
          taskVersion: taskUpdatedAt.toISOString(),
          idempotencyKey: 'r26-permission:system-admin-upload',
        },
        {
          originalname: '系统管理员上传.pdf',
          mimetype: 'application/pdf',
          size: 64,
          buffer: Buffer.from('%PDF-1.4\n'),
        },
        permissionlessSystemAdmin,
        'request-system-admin-upload',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(materialCase.attachmentCreate).not.toHaveBeenCalled();
  });

  it('requires the corresponding permission for assignees, owners and collaborators too', () => {
    const { service } = createService();
    const getAvailableActions = (
      service as unknown as {
        getAvailableActions(
          loadedTask: ReturnType<typeof task>,
          authenticatedUser: AuthenticatedUser,
        ): Array<{ action: string }>;
      }
    ).getAvailableActions.bind(service);
    const scopedActors: Array<{
      scopedTask: ReturnType<typeof task>;
      scopedActor: AuthenticatedUser;
    }> = [
      {
        scopedTask: task(),
        scopedActor: {
          ...actor,
          permissionCodes: ['project.read'],
        },
      },
      {
        scopedTask: task({
          assigneeUserId: 'another-user',
          project: {
            ...task().project,
            ownerUserId: 'project-owner',
            members: [],
          },
        }),
        scopedActor: {
          ...actor,
          id: 'project-owner',
          roleCodes: ['project_manager'],
          permissionCodes: ['project.read'],
        },
      },
      {
        scopedTask: task({
          assigneeUserId: 'another-user',
          project: {
            ...task().project,
            ownerUserId: 'another-owner',
            members: [],
            nodeAssignments: [
              {
                nodeCode: WorkflowNodeCode.PAINT_PROCUREMENT,
                collaboratorUserIds: ['project-collaborator'],
                reviewerUserIds: [],
              },
            ],
          },
        }),
        scopedActor: {
          ...actor,
          id: 'project-collaborator',
          roleCodes: ['process_engineer'],
          permissionCodes: ['project.read'],
        },
      },
    ];

    for (const { scopedTask, scopedActor } of scopedActors) {
      expect(getAvailableActions(scopedTask, scopedActor)).toEqual([]);
      expect(
        getAvailableActions(scopedTask, {
          ...scopedActor,
          permissionCodes: ['project.read', 'workflow.transition'],
        }).map((item) => item.action),
      ).toEqual(scopedActor.id === scopedTask.assigneeUserId ? [
        'SAVE_PROGRESS_DRAFT',
        'DELETE_PROGRESS_DRAFT',
        'SUBMIT_PROGRESS',
      ] : []);
      expect(
        getAvailableActions(scopedTask, {
          ...scopedActor,
          permissionCodes: ['project.read', 'attachment.manage'],
        }).map((item) => item.action),
      ).toEqual(scopedActor.id === scopedTask.assigneeUserId ? ['UPLOAD_MATERIAL'] : []);
    }
  });

  it('submits immutable progress while preserving task, node and task count', async () => {
    const { service, tx, activityLogs } = createService();

    const result = await service.submitProgress(
      'task-6',
      submitInput,
      actor,
      'request-1',
    );

    expect(result).toMatchObject({
      progressSubmitted: true,
      taskStatusChanged: false,
      workflowTransitioned: false,
      invariants: {
        taskStatusBefore: WorkflowTaskStatus.IN_PROGRESS,
        taskStatusAfter: WorkflowTaskStatus.IN_PROGRESS,
        currentNodeBefore: WorkflowNodeCode.PAINT_PROCUREMENT,
        currentNodeAfter: WorkflowNodeCode.PAINT_PROCUREMENT,
        taskCountBefore: 18,
        taskCountAfter: 18,
      },
    });
    expect(tx.workflowTask.update).not.toHaveBeenCalled();
    expect(tx.workflowTask.updateMany).not.toHaveBeenCalled();
    expect(tx.workflowTask.create).not.toHaveBeenCalled();
    expect(activityLogs.createWithExecutor).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: 'R26_PROGRESS_SUBMITTED',
        metadata: expect.objectContaining({ gate: 'R26_GATE3B' }),
      }),
    );
  });

  it('records XSS-looking content as plain immutable text', async () => {
    const { service, tx } = createService();
    const completedWork = '<script>alert(1)</script>完成批次核对';

    await service.submitProgress(
      'task-6',
      { ...submitInput, completedWork },
      actor,
      'request-xss',
    );

    expect(tx.taskProgressUpdate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ completedContent: completedWork }),
      }),
    );
  });

  it('writes a user-facing material filename instead of an internal material code', async () => {
    const { service, attachmentCreate } = createService();

    await service.uploadMaterial(
      'task-6',
      {
        materialType: 'WORK_EVIDENCE',
        taskVersion: taskUpdatedAt.toISOString(),
        idempotencyKey: 'r26-g3b:upload:filename-summary',
      },
      {
        originalname: '到货确认记录.pdf',
        mimetype: 'application/pdf',
        size: 64,
        buffer: Buffer.from('%PDF-1.4\n'),
      },
      actor,
      'request-upload-summary',
    );

    expect(attachmentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        materialType: 'WORK_EVIDENCE',
        summary: '上传工序材料：到货确认记录.pdf',
      }),
    );
  });

  it('resolves the previous blocker before recording the new blocker summary', async () => {
    const { service, tx, activityLogs } = createService();
    tx.taskBlocker.findMany.mockResolvedValue([
      {
        id: 'blocker-old',
        blockerType: 'WAITING_MATERIAL',
        description: '旧的供应商阻塞',
        helperUserId: 'helper-1',
        assistanceUserIds: ['helper-1'],
        assistanceDepartmentIds: [],
        impactLevel: 'MEDIUM',
        expectedResolvedAt: new Date('2026-07-25T09:00:00.000Z'),
      },
    ]);
    tx.taskProgressUpdate.create.mockResolvedValue(
      progressRecord({
        progressStatus: 'BLOCKED',
        blocker: {
          id: 'blocker-new',
          blockerType: 'WAITING_MATERIAL',
          description: '新的到货阻塞',
          helperUserId: actor.id,
          assistanceUserIds: [actor.id],
          assistanceDepartmentIds: ['dept-purchase'],
          impactLevel: 'ALREADY_DELAYED',
          expectedResolvedAt: new Date('2026-07-26T09:00:00.000Z'),
          status: 'OPEN',
          helperUser: { id: actor.id, name: actor.name },
        },
      }),
    );

    await service.submitProgress(
      'task-6',
      {
        ...submitInput,
        progressStatus: 'BLOCKED',
        blockerType: 'WAITING_MATERIAL',
        blockerDescription: '新的到货阻塞',
        assistanceUserIds: [actor.id],
        assistanceDepartmentIds: [],
        expectedResolvedAt: '2026-07-26T09:00:00.000Z',
        impactLevel: 'ALREADY_DELAYED',
      },
      actor,
      'request-blocker-summary',
    );

    expect(tx.taskBlocker.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['blocker-old'] },
        status: 'OPEN',
      },
      data: {
        status: 'RESOLVED',
        resolvedAt: expect.any(Date),
      },
    });
    expect(activityLogs.createWithExecutor).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        beforeData: expect.objectContaining({
          blockers: [
            expect.objectContaining({
              id: 'blocker-old',
              status: 'OPEN',
            }),
          ],
        }),
        afterData: expect.objectContaining({
          blocker: expect.objectContaining({
            id: 'blocker-new',
            status: 'OPEN',
          }),
        }),
      }),
    );
  });

  it('rejects a formal blocker without assistance and resolution facts', async () => {
    const { service, tx } = createService();

    await expect(
      service.submitProgress(
        'task-6',
        {
          ...submitInput,
          progressStatus: 'BLOCKED',
          blockerType: 'WAITING_MATERIAL',
          blockerDescription: '供应商送货延迟',
        },
        actor,
        'request-blocked',
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(tx.taskProgressUpdate.create).not.toHaveBeenCalled();
  });

  it('returns 409 for a stale draft version', async () => {
    const { service, tx } = createService();
    tx.r26ProgressDraft.findUnique.mockResolvedValue({
      id: 'draft-1',
      draftVersion: 2,
    });

    await expect(
      service.saveDraft(
        'task-6',
        {
          draftVersion: 1,
          progressStatus: 'IN_PROGRESS',
          completedWork: '标签页 A',
          idempotencyKey: 'r26-g3b:draft:00000001',
        },
        actor,
        'request-draft',
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'STALE_PROGRESS_DRAFT_VERSION',
        currentVersion: 2,
      },
    });
  });

  it('replays the same progress request without a second transaction', async () => {
    const { service: hashService } = createService();
    const requestHash = (
      hashService as unknown as {
        hashRequest(value: unknown): string;
      }
    ).hashRequest({
      action: 'R26_PROGRESS_SUBMITTED',
      taskId: 'task-6',
      actorUserId: actor.id,
      input: submitInput,
    });
    const command = {
      projectId: 'project-1',
      actorUserId: actor.id,
      action: 'R26_PROGRESS_SUBMITTED',
      requestHash,
      result: {
        progressSubmitted: true,
        taskStatusChanged: false,
        workflowTransitioned: false,
      },
    };
    const { service, prisma } = createService({ command });

    const result = await service.submitProgress(
      'task-6',
      submitInput,
      actor,
      'request-1',
    );

    expect(result).toMatchObject({
      progressSubmitted: true,
      idempotentReplay: true,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('keeps ordinary observers and cross-project actors read-only', async () => {
    const observerTask = task({
      assigneeUserId: 'another-user',
      project: {
        ...task().project,
        members: [
          {
            ...task().project.members[0],
            userId: actor.id,
            memberType: ProjectMemberType.OBSERVER,
          },
        ],
      },
    });
    const { service } = createService({ loadedTask: observerTask });

    await expect(
      service.submitProgress(
        'task-6',
        submitInput,
        actor,
        'request-observer',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const denied = createService();
    denied.projectAccess.assertProjectAccessWithDefaultClient.mockRejectedValue(
      new ForbiddenException('当前用户无权访问该项目。'),
    );
    await expect(
      denied.service.submitProgress(
        'task-6',
        submitInput,
        actor,
        'request-idor',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('cleans the upload reservation when binary storage fails', async () => {
    const attachmentCreate = vi
      .fn()
      .mockRejectedValue(new Error('storage interrupted'));
    const { service, prisma } = createService({ attachmentCreate });

    await expect(
      service.uploadMaterial(
        'task-6',
        {
          materialType: 'arrival-proof',
          taskVersion: taskUpdatedAt.toISOString(),
          idempotencyKey: 'r26-g3b:upload:00000001',
        },
        {
          originalname: '到货确认记录.pdf',
          mimetype: 'application/pdf',
          size: 64,
          buffer: Buffer.from('%PDF-1.4\n'),
        },
        actor,
        'request-upload',
      ),
    ).rejects.toThrow('storage interrupted');
    expect(prisma.r26CommandRequest.deleteMany).toHaveBeenCalled();
  });

  it('rejects an idempotency key reused with a different payload', async () => {
    const command = {
      projectId: 'project-1',
      actorUserId: actor.id,
      action: 'R26_PROGRESS_SUBMITTED',
      requestHash: 'different',
      result: {},
    };
    const { service } = createService({ command });

    await expect(
      service.submitProgress(
        'task-6',
        submitInput,
        actor,
        'request-conflict',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
