import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ProjectMemberType, ProjectPriority, ProjectStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import type { AuthenticatedUser } from '../auth/auth.types';
import { CreateProjectDto } from './dto/create-project.dto';
import { ProjectsService } from './projects.service';

const actor: AuthenticatedUser = {
  id: 'project-manager-1',
  username: 'project-manager-1',
  name: '项目经理',
  email: null,
  departmentId: 'department-1',
  departmentName: '项目管理部',
  isSystemAdmin: false,
  authSource: 'mock',
  roleCodes: ['project_manager'],
  permissionCodes: ['project.write'],
};

const baseInput = {
  name: '新颜色项目',
  description: '创建命令幂等性测试',
  priority: ProjectPriority.HIGH,
  ownerUserId: actor.id,
  members: [
    {
      userId: actor.id,
      memberType: ProjectMemberType.OWNER,
      title: '项目负责人',
      isPrimary: true,
    },
  ],
};

type CommandRow = {
  id: string;
  actorUserId: string;
  idempotencyKey: string;
  requestHash: string;
  projectId: string;
  resultSnapshot: Record<string, unknown>;
  createdAt: Date;
};

function projectRecord(id = 'project-1') {
  const createdAt = new Date('2026-08-11T00:00:00.000Z');
  return {
    id,
    code: `PRJ-${id}`,
    name: baseInput.name,
    description: baseInput.description,
    status: ProjectStatus.IN_PROGRESS,
    priority: ProjectPriority.HIGH,
    currentNodeCode: 'PROJECT_INITIATION',
    owningDepartmentId: actor.departmentId,
    ownerUserId: actor.id,
    marketRegion: null,
    colorMarketingUnit: null,
    paintSupplier: null,
    vehicleModel: null,
    plannedStartDate: null,
    plannedEndDate: null,
    actualStartDate: null,
    actualEndDate: null,
    closedAt: null,
    createdAt,
    updatedAt: createdAt,
    ownerUser: {
      id: actor.id,
      name: actor.name,
      department: { name: actor.departmentName },
    },
    owningDepartment: {
      id: actor.departmentId,
      name: actor.departmentName,
    },
    members: [
      {
        id: 'member-1',
        userId: actor.id,
        memberType: ProjectMemberType.OWNER,
        title: '项目负责人',
        isPrimary: true,
        createdAt,
        user: {
          id: actor.id,
          name: actor.name,
          email: actor.email,
          department: { name: actor.departmentName },
          userRoles: [],
        },
      },
    ],
    workflowInstances: [
      {
        id: 'workflow-1',
        instanceNo: 'WF-1',
        status: 'RUNNING',
        versionNo: 1,
        currentNodeCode: 'PROJECT_INITIATION',
        startedAt: createdAt,
      },
    ],
    _count: { members: 1 },
  };
}

function createHarness() {
  const projects: ReturnType<typeof projectRecord>[] = [];
  const commands: CommandRow[] = [];
  let transactionTail = Promise.resolve();

  const commandStore = {
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    count: vi.fn().mockImplementation(() => Promise.resolve(commands.length)),
    findUnique: vi.fn().mockImplementation(({ where }: {
      where: {
        actorUserId_idempotencyKey: {
          actorUserId: string;
          idempotencyKey: string;
        };
      };
    }) => Promise.resolve(
      commands.find(
        (command) =>
          command.actorUserId === where.actorUserId_idempotencyKey.actorUserId &&
          command.idempotencyKey === where.actorUserId_idempotencyKey.idempotencyKey,
      ) ?? null,
    )),
    create: vi.fn().mockImplementation(({ data }: {
      data: Omit<CommandRow, 'id' | 'createdAt'>;
    }) => {
      if (
        commands.some(
          (command) =>
            command.actorUserId === data.actorUserId &&
            command.idempotencyKey === data.idempotencyKey,
        )
      ) {
        throw Object.assign(new Error('unique command'), { code: 'P2002' });
      }
      const command = {
        ...data,
        id: `command-${commands.length + 1}`,
        createdAt: new Date(),
      };
      commands.push(command);
      return Promise.resolve(command);
    }),
  };

  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ locked: true }]),
    projectCreateCommandRequest: commandStore,
    user: {
      findFirst: vi.fn().mockResolvedValue({
        id: actor.id,
        departmentId: actor.departmentId,
        status: 'ACTIVE',
      }),
      findMany: vi.fn().mockImplementation(({ where }: {
        where: { id: { in: string[] } };
      }) => Promise.resolve(where.id.in.map((id) => ({ id })))),
    },
    project: {
      create: vi.fn().mockImplementation(() => {
        const record = projectRecord(`project-${projects.length + 1}`);
        projects.push(record);
        return Promise.resolve(record);
      }),
      findUnique: vi.fn().mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve(projects.find((project) => project.id === where.id) ?? null),
      ),
    },
    projectMember: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
      findMany: vi.fn().mockResolvedValue(projectRecord().members),
    },
  };

  const prisma = {
    ...tx,
    $transaction: vi.fn(<T>(callback: (client: typeof tx) => Promise<T>) => {
      const execution = transactionTail.then(() => callback(tx));
      transactionTail = execution.then(() => undefined, () => undefined);
      return execution;
    }),
  };
  const workflowsService = {
    initializeProjectWorkflow: vi.fn().mockResolvedValue({
      instance: { id: 'workflow-1', currentNodeCode: 'PROJECT_INITIATION' },
      task: { id: 'task-1' },
    }),
    getCurrentNodeName: vi.fn().mockReturnValue('项目立项'),
  };
  const activityLogsService = {
    createWithExecutor: vi.fn().mockResolvedValue({ id: 'audit-1' }),
  };
  const projectAccessService = {
    assertProjectAccessWithDefaultClient: vi.fn().mockResolvedValue(undefined),
    assertProjectAccess: vi.fn().mockResolvedValue(undefined),
  };
  const service = new ProjectsService(
    prisma as never,
    workflowsService as never,
    activityLogsService as never,
    projectAccessService as never,
  );

  return {
    service,
    prisma,
    tx,
    projects,
    commands,
    workflowsService,
    activityLogsService,
  };
}

function createWithKey(
  service: ProjectsService,
  input: Record<string, unknown>,
  idempotencyKey: string | undefined,
) {
  return (
    service.createProject as unknown as (
      rawInput: unknown,
      currentActor: AuthenticatedUser,
      key?: string,
    ) => Promise<Record<string, unknown>>
  )(input, actor, idempotencyKey);
}

describe('ProjectsService create idempotency', () => {
  it('requires a bounded safe Idempotency-Key before opening a transaction', async () => {
    const { service, prisma } = createHarness();

    await expect(createWithKey(service, baseInput, undefined)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PROJECT_IDEMPOTENCY_KEY_INVALID' }),
    });
    await expect(createWithKey(service, baseInput, 'x'.repeat(129))).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PROJECT_IDEMPOTENCY_KEY_INVALID' }),
    });
    await expect(createWithKey(service, baseInput, 'unsafe key')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PROJECT_IDEMPOTENCY_KEY_INVALID' }),
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('creates one project/workflow/task/audit set for concurrent same-key retries', async () => {
    const { service, tx, projects, commands, workflowsService, activityLogsService } =
      createHarness();

    const [first, second] = await Promise.all([
      createWithKey(service, baseInput, 'project-create:concurrent-1'),
      createWithKey(service, baseInput, 'project-create:concurrent-1'),
    ]);

    expect([first.idempotentReplay, second.idempotentReplay].sort()).toEqual([false, true]);
    expect(projects).toHaveLength(1);
    expect(tx.project.create).toHaveBeenCalledTimes(1);
    expect(workflowsService.initializeProjectWorkflow).toHaveBeenCalledTimes(1);
    expect(activityLogsService.createWithExecutor).toHaveBeenCalledTimes(2);
    expect(commands).toHaveLength(1);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('uses a canonical payload hash and rejects changed payload under the same key', async () => {
    const { service, tx, commands, activityLogsService } = createHarness();

    const first = await createWithKey(
      service,
      { name: baseInput.name, priority: baseInput.priority, description: baseInput.description },
      'project-create:canonical-1',
    );
    const replay = await createWithKey(
      service,
      { description: baseInput.description, priority: baseInput.priority, name: baseInput.name },
      'project-create:canonical-1',
    );

    expect(first.idempotentReplay).toBe(false);
    expect(replay.idempotentReplay).toBe(true);
    expect(commands).toHaveLength(1);

    await expect(
      createWithKey(
        service,
        { ...baseInput, name: '不同项目' },
        'project-create:canonical-1',
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST',
      }),
    });
    expect(tx.project.create).toHaveBeenCalledTimes(1);
    expect(activityLogsService.createWithExecutor).toHaveBeenCalledTimes(2);
  });

  it('recovers a committed winner after a P2002 command-ledger race', async () => {
    const { service, prisma, commands } = createHarness();
    const winnerResult = await createWithKey(
      service,
      baseInput,
      'project-create:p2002-1',
    );
    const winner = commands[0];
    expect(winner).toBeDefined();
    prisma.projectCreateCommandRequest.findUnique
      .mockResolvedValueOnce(null)
      .mockImplementationOnce(() => Promise.resolve(winner));
    prisma.$transaction.mockRejectedValueOnce(
      Object.assign(new Error('unique command'), { code: 'P2002' }),
    );

    const result = await createWithKey(
      service,
      baseInput,
      'project-create:p2002-1',
    );

    expect(result).toEqual({ ...winnerResult, idempotentReplay: true });
  });

  it('rejects oversized member arrays at both DTO and service boundaries', async () => {
    const members = Array.from({ length: 51 }, (_, index) => ({
      userId: `user-${index}`,
      memberType: ProjectMemberType.MEMBER,
    }));
    const dto = plainToInstance(CreateProjectDto, {
      name: '成员超限项目',
      members,
    });

    const validationErrors = await validate(dto);
    expect(validationErrors.some((error) => error.property === 'members')).toBe(true);

    const { service, prisma } = createHarness();
    await expect(
      createWithKey(
        service,
        { name: '成员超限项目', members },
        'project-create:members-1',
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PROJECT_MEMBER_LIMIT_EXCEEDED' }),
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
