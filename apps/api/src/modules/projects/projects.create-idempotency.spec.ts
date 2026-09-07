import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { randomUUID } from 'node:crypto';
import {
  Prisma,
  PrismaClient,
  ProjectMemberType,
  ProjectPriority,
  ProjectStatus,
  UserStatus,
} from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

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
    $executeRaw: vi.fn().mockResolvedValue(0),
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
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
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

const projectsPostgresTestDatabaseUrl =
  process.env.PROJECTS_POSTGRES_TEST_DATABASE_URL;
const projectCreateLockNamespace = 'feishu-timeline:project-create';

type ProjectLockService = {
  lockProjectCreateCommand(
    tx: Prisma.TransactionClient,
    actorUserId: string,
    idempotencyKey: string,
  ): Promise<void>;
};

function acquireProjectCreateLock(
  service: ProjectsService,
  tx: Prisma.TransactionClient,
  actorUserId: string,
  idempotencyKey: string,
) {
  return (service as unknown as ProjectLockService).lockProjectCreateCommand(
    tx,
    actorUserId,
    idempotencyKey,
  );
}

async function tryProjectCreateLock(
  tx: Prisma.TransactionClient,
  actorUserId: string,
  idempotencyKey: string,
) {
  const rows = await tx.$queryRaw<Array<{ acquired: boolean }>>(Prisma.sql`
    SELECT pg_try_advisory_xact_lock(
      hashtext(${projectCreateLockNamespace}),
      hashtext(${`${actorUserId}:${idempotencyKey}`})
    ) AS "acquired"
  `);

  return rows[0]?.acquired ?? false;
}

if (projectsPostgresTestDatabaseUrl) {
  describe.sequential('ProjectsService PostgreSQL project-create lock', () => {
    let prisma: PrismaClient;
    let secondConnection: PrismaClient;
    const fixtureRunId = randomUUID().slice(0, 8);

    function createPostgresService() {
      return new ProjectsService(
        prisma as never,
        {
          initializeProjectWorkflow: vi.fn().mockImplementation(
            (_tx: Prisma.TransactionClient, input: { projectId: string }) =>
              Promise.resolve({
                instance: {
                  id: `workflow-${input.projectId}`,
                  currentNodeCode: 'PROJECT_INITIATION',
                },
                task: { id: `task-${input.projectId}` },
              }),
          ),
          getCurrentNodeName: vi.fn().mockReturnValue('项目立项'),
        } as never,
        {
          createWithExecutor: vi.fn().mockResolvedValue(undefined),
        } as never,
        {
          assertProjectAccessWithDefaultClient: vi.fn().mockResolvedValue(undefined),
          assertProjectAccess: vi.fn().mockResolvedValue(undefined),
        } as never,
      );
    }

    beforeAll(async () => {
      prisma = new PrismaClient({
        datasources: { db: { url: projectsPostgresTestDatabaseUrl } },
      });
      secondConnection = new PrismaClient({
        datasources: { db: { url: projectsPostgresTestDatabaseUrl } },
      });
      await Promise.all([prisma.$connect(), secondConnection.$connect()]);
    });

    afterAll(async () => {
      await Promise.all([prisma.$disconnect(), secondConnection.$disconnect()]);
    });

    it('executes the blocking lock without P2010 and continues with a write and read', async () => {
      const service = createPostgresService();
      const userId = `r27rc2-lock-user-${fixtureRunId}`;
      const username = `r27rc2_lock_user_${fixtureRunId}`;

      await prisma.user.deleteMany({ where: { id: userId } });
      try {
        await expect(
          prisma.$transaction(async (tx) => {
            await acquireProjectCreateLock(
              service,
              tx,
              userId,
              `connector-${fixtureRunId}`,
            );
            await tx.user.create({
              data: {
                id: userId,
                username,
                name: 'R27 RC2 锁连接器测试',
              },
            });
            return tx.user.findUnique({ where: { id: userId } });
          }),
        ).resolves.toMatchObject({ id: userId, username });

        await expect(
          prisma.user.findUnique({ where: { id: userId } }),
        ).resolves.toMatchObject({ id: userId });
      } finally {
        await prisma.user.deleteMany({ where: { id: userId } });
      }
    });

    it('serializes the same key and releases it after commit and rollback', async () => {
      const service = createPostgresService();
      const actorUserId = `r27rc2-lock-actor-${fixtureRunId}`;
      const commitKey = `serialization-${fixtureRunId}`;
      let markHolderReady!: () => void;
      let rejectHolderReady!: (error: unknown) => void;
      let releaseHolder!: () => void;
      const holderReady = new Promise<void>((resolve, reject) => {
        markHolderReady = resolve;
        rejectHolderReady = reject;
      });
      const holderRelease = new Promise<void>((resolve) => {
        releaseHolder = resolve;
      });
      const holder = prisma.$transaction(async (tx) => {
        try {
          await acquireProjectCreateLock(service, tx, actorUserId, commitKey);
          markHolderReady();
        } catch (error) {
          rejectHolderReady(error);
          throw error;
        }
        await holderRelease;
      });

      await holderReady;
      try {
        await expect(
          secondConnection.$transaction((tx) =>
            tryProjectCreateLock(tx, actorUserId, commitKey),
          ),
        ).resolves.toBe(false);
      } finally {
        releaseHolder();
        await holder;
      }

      await expect(
        secondConnection.$transaction((tx) =>
          tryProjectCreateLock(tx, actorUserId, commitKey),
        ),
      ).resolves.toBe(true);

      const rollbackKey = `rollback-${fixtureRunId}`;
      await expect(
        prisma.$transaction(async (tx) => {
          await acquireProjectCreateLock(service, tx, actorUserId, rollbackKey);
          throw new Error('intentional project-lock rollback');
        }),
      ).rejects.toThrow('intentional project-lock rollback');
      await expect(
        secondConnection.$transaction((tx) =>
          tryProjectCreateLock(tx, actorUserId, rollbackKey),
        ),
      ).resolves.toBe(true);
    });

    it('creates and persists a project through the repaired transaction', async () => {
      const service = createPostgresService();
      const userId = `r27rc2-project-user-${fixtureRunId}`;
      const username = `r27rc2_project_user_${fixtureRunId}`;
      const projectCode = `R27RC2-${fixtureRunId.toUpperCase()}`;
      const idempotencyKey = `project-create:postgres-${fixtureRunId}`;
      const postgresActor: AuthenticatedUser = {
        id: userId,
        username,
        name: 'R27 RC2 项目经理',
        email: null,
        departmentId: null,
        departmentName: null,
        isSystemAdmin: false,
        authSource: 'mock',
        roleCodes: ['project_manager'],
        permissionCodes: ['project.write'],
      };

      await prisma.project.deleteMany({ where: { code: projectCode } });
      await prisma.user.deleteMany({ where: { id: userId } });
      try {
        await prisma.user.create({
          data: {
            id: userId,
            username,
            name: postgresActor.name,
            status: UserStatus.ACTIVE,
          },
        });

        const result = await service.createProject(
          {
            code: projectCode,
            name: 'R27 RC2 PostgreSQL 项目创建',
            ownerUserId: userId,
            members: [],
          },
          postgresActor,
          idempotencyKey,
        );

        expect(result).toMatchObject({
          code: projectCode,
          name: 'R27 RC2 PostgreSQL 项目创建',
          idempotentReplay: false,
        });
        if (!('id' in result) || typeof result.id !== 'string') {
          throw new Error('Project creation must return a persisted project id.');
        }
        const resultProjectId = result.id;
        const persisted = await prisma.project.findUnique({
          where: { id: resultProjectId },
        });
        const command = await prisma.projectCreateCommandRequest.findUnique({
          where: {
            actorUserId_idempotencyKey: {
              actorUserId: userId,
              idempotencyKey,
            },
          },
        });
        expect(persisted).toMatchObject({ id: resultProjectId, code: projectCode });
        expect(command).toMatchObject({ projectId: resultProjectId });
      } finally {
        await prisma.project.deleteMany({ where: { code: projectCode } });
        await prisma.user.deleteMany({ where: { id: userId } });
      }
    });
  });
}
