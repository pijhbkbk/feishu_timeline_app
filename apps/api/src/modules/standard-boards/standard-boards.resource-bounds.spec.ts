import {
  ColorBoardDetailUpdateStatus,
  DistributionStatus,
  SampleStatus,
  StandardBoardStatus,
  WorkflowNodeCode,
  WorkflowTaskStatus,
} from '@prisma/client';
import { ConflictException } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { StandardBoardsService } from './standard-boards.service';

const actor = {
  id: 'quality-engineer-1',
  username: 'quality-engineer-1',
  name: '质量工程师',
  email: null,
  departmentId: null,
  departmentName: null,
  authSource: 'mock',
  roleCodes: ['quality_engineer'],
  permissionCodes: ['project.read', 'workflow.transition'],
  isSystemAdmin: false,
} as never;

const project = {
  id: 'project-1',
  code: 'PRJ-001',
  name: '项目 A',
  priority: 'MEDIUM',
  currentNodeCode: WorkflowNodeCode.STANDARD_BOARD_PRODUCTION,
  plannedEndDate: null,
};

const standardBoardTask = {
  id: 'standard-board-task-1',
  taskNo: 'TASK-STANDARD-BOARD-1',
  nodeCode: WorkflowNodeCode.STANDARD_BOARD_PRODUCTION,
  nodeName: '标准板制作、下发',
  taskRound: 1,
  status: WorkflowTaskStatus.IN_PROGRESS,
  isPrimary: true,
  isActive: true,
  assigneeUserId: null,
  assigneeDepartmentId: null,
  assigneeUser: null,
  assigneeDepartment: null,
  dueAt: null,
  startedAt: new Date('2026-08-11T00:00:00.000Z'),
  completedAt: null,
  returnedAt: null,
  payload: null,
  createdAt: new Date('2026-08-11T00:00:00.000Z'),
  updatedAt: new Date('2026-08-11T00:00:00.000Z'),
};

const detailTask = {
  ...standardBoardTask,
  id: 'board-detail-task-1',
  taskNo: 'TASK-BOARD-DETAIL-1',
  nodeCode: WorkflowNodeCode.BOARD_DETAIL_UPDATE,
  nodeName: '色板明细更新',
};

const validBoardInput = {
  boardCode: 'SB-001',
  versionNo: 1,
  basedOnSampleId: 'sample-1',
  remark: '标准板备注',
};

const validDistributionInput = {
  receiverName: '接收人',
  receiverDept: '接收部门',
  sentAt: '2026-08-11T01:00:00.000Z',
  signedAt: '2026-08-11T02:00:00.000Z',
  note: '下发备注',
};

const validDetailInput = {
  standardBoardId: 'standard-board-1',
  updateStatus: ColorBoardDetailUpdateStatus.UPDATED,
  detailUpdatedAt: '2026-08-11T03:00:00.000Z',
  note: '明细更新备注',
};

function boardRecord(id = 'standard-board-1', isCurrent = true) {
  const timestamp = new Date('2026-08-11T01:00:00.000Z');
  return {
    id,
    projectId: project.id,
    basedOnSampleId: 'sample-1',
    issuedById: null,
    colorId: null,
    colorVersionId: null,
    boardCode: `SB-${id}`,
    versionNo: 1,
    status: StandardBoardStatus.ISSUED,
    isCurrent,
    producedAt: timestamp,
    issuedAt: timestamp,
    recipientName: '接收人',
    recipientDept: '接收部门',
    remark: null,
    basedOnSample: {
      id: 'sample-1',
      sampleNo: 'S-001',
      sampleName: '样板 A',
      versionNo: 1,
    },
    issuedBy: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function distributionRecord(index = 0, boardId = 'standard-board-1') {
  const timestamp = new Date('2026-08-11T02:00:00.000Z');
  return {
    id: `distribution-${index.toString().padStart(3, '0')}`,
    projectId: project.id,
    standardBoardId: boardId,
    receiverName: '接收人',
    receiverDept: '接收部门',
    recipientDepartmentId: null,
    recipientUserId: null,
    quantity: 1,
    status: DistributionStatus.RECEIVED,
    trackingNo: null,
    sentAt: timestamp,
    signedAt: timestamp,
    note: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function detailRecord(index = 0) {
  const timestamp = new Date('2026-08-11T03:00:00.000Z');
  return {
    id: `detail-${index.toString().padStart(3, '0')}`,
    projectId: project.id,
    standardBoardId: 'standard-board-1',
    updatedById: 'quality-engineer-1',
    updateStatus: ColorBoardDetailUpdateStatus.UPDATED,
    detailUpdatedAt: timestamp,
    note: null,
    standardBoard: boardRecord(),
    updatedBy: { id: 'quality-engineer-1', name: '质量工程师' },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function sampleRecord(index = 0) {
  return {
    id: `sample-${index.toString().padStart(3, '0')}`,
    sampleNo: `S-${index.toString().padStart(3, '0')}`,
    sampleName: `样板 ${index}`,
    versionNo: 1,
    isCurrent: true,
    status: SampleStatus.CONFIRMED,
  };
}

function createService(input?: {
  prisma?: Record<string, unknown>;
  activityLogs?: Record<string, unknown>;
  workflows?: Record<string, unknown>;
}) {
  return new StandardBoardsService(
    (input?.prisma ?? {}) as never,
    (input?.activityLogs ?? { createWithExecutor: vi.fn() }) as never,
    (input?.workflows ?? { transitionTaskWithExecutor: vi.fn() }) as never,
    {
      assertProjectAccessWithDefaultClient: vi
        .fn()
        .mockResolvedValue({ id: project.id }),
    } as never,
  );
}

function parse(
  service: StandardBoardsService,
  method:
    | 'parseBoardWriteInput'
    | 'parseIssueBoardInput'
    | 'parseDistributionWriteInput'
    | 'parseColorBoardDetailUpdateWriteInput',
  input: Record<string, unknown>,
) {
  return Reflect.get(service, method).call(service, input);
}

function workspaceDb(input?: {
  boards?: unknown[];
  distributions?: unknown[];
  details?: unknown[];
  samples?: unknown[];
}) {
  const boardFindMany = vi.fn().mockResolvedValue(input?.boards ?? []);
  const boardFindFirst = vi.fn().mockResolvedValue(
    input?.boards?.find((entry) => (entry as { isCurrent?: boolean }).isCurrent) ??
      null,
  );
  const distributionFindMany = vi
    .fn()
    .mockResolvedValue(input?.distributions ?? []);
  const detailFindMany = vi.fn().mockResolvedValue(input?.details ?? []);
  const sampleFindMany = vi.fn().mockResolvedValue(input?.samples ?? []);
  const workflowFindFirst = vi.fn(async (args: {
    where: { nodeCode?: WorkflowNodeCode; status?: WorkflowTaskStatus };
  }) => {
    if (args.where.nodeCode === WorkflowNodeCode.PAINT_PROCUREMENT) {
      return { id: 'procurement-task-1' };
    }
    return args.where.nodeCode === WorkflowNodeCode.BOARD_DETAIL_UPDATE
      ? detailTask
      : standardBoardTask;
  });

  return {
    db: {
      project: { findUnique: vi.fn().mockResolvedValue(project) },
      standardBoard: {
        findMany: boardFindMany,
        findFirst: boardFindFirst,
      },
      boardDistributionRecord: { findMany: distributionFindMany },
      colorBoardDetailUpdate: { findMany: detailFindMany },
      sample: { findMany: sampleFindMany },
      workflowTask: { findFirst: workflowFindFirst },
    },
    boardFindFirst,
    boardFindMany,
    detailFindMany,
    distributionFindMany,
    sampleFindMany,
    workflowFindFirst,
  };
}

describe('StandardBoardsService resource bounds', () => {
  it('records the mapped physical columns required by the later database-bound migration', () => {
    const schema = readFileSync(
      resolve(process.cwd(), 'prisma/schema.prisma'),
      'utf8',
    );
    const models = schema.slice(
      schema.indexOf('model StandardBoard {'),
      schema.indexOf('model Supplier {'),
    );

    expect(models).toContain('@@map("standard_boards")');
    expect(models).toMatch(/boardCode\s+String\s+@map\("boardNo"\)/u);
    expect(models).toMatch(/issuedAt\s+DateTime\?\s+@map\("lastDistributedAt"\)/u);
    expect(models).toContain('@@map("board_distribution_records")');
    expect(models).toMatch(/sentAt\s+DateTime\?\s+@map\("distributedAt"\)/u);
    expect(models).toMatch(/signedAt\s+DateTime\?\s+@map\("receivedAt"\)/u);
    expect(models).toMatch(/note\s+String\?\s+@map\("remark"\)/u);
    expect(models).toContain('@@map("color_board_detail_updates")');
  });

  it('accepts the exact scalar boundaries for all normalized write payloads', () => {
    const service = createService();

    expect(() =>
      parse(service, 'parseBoardWriteInput', {
        boardCode: 'B'.repeat(64),
        versionNo: 2_147_483_647,
        basedOnSampleId: 's'.repeat(64),
        remark: 'R'.repeat(4_000),
      }),
    ).not.toThrow();
    expect(() =>
      parse(service, 'parseIssueBoardInput', {
        recipientName: 'N'.repeat(200),
        recipientDept: 'D'.repeat(200),
        issuedAt: '2026-08-11T01:00:00.000Z',
        remark: 'R'.repeat(4_000),
      }),
    ).not.toThrow();
    expect(() =>
      parse(service, 'parseDistributionWriteInput', {
        ...validDistributionInput,
        receiverName: 'N'.repeat(200),
        receiverDept: 'D'.repeat(200),
        note: 'R'.repeat(4_000),
      }),
    ).not.toThrow();
    expect(() =>
      parse(service, 'parseColorBoardDetailUpdateWriteInput', {
        ...validDetailInput,
        standardBoardId: 'b'.repeat(64),
        note: 'R'.repeat(4_000),
      }),
    ).not.toThrow();
  });

  it.each([
    ['parseBoardWriteInput', validBoardInput, 'boardCode', 'B'.repeat(65)],
    ['parseBoardWriteInput', validBoardInput, 'boardCode', 'SB / 001'],
    ['parseBoardWriteInput', validBoardInput, 'basedOnSampleId', 's'.repeat(65)],
    ['parseBoardWriteInput', validBoardInput, 'basedOnSampleId', 'sample / 1'],
    ['parseBoardWriteInput', validBoardInput, 'remark', 'R'.repeat(4_001)],
    [
      'parseIssueBoardInput',
      { recipientName: '接收人', issuedAt: '2026-08-11T01:00:00.000Z' },
      'recipientName',
      'N'.repeat(201),
    ],
    [
      'parseIssueBoardInput',
      { recipientDept: '接收部门', issuedAt: '2026-08-11T01:00:00.000Z' },
      'recipientDept',
      'D'.repeat(201),
    ],
    [
      'parseIssueBoardInput',
      { recipientName: '接收人', issuedAt: '2026-08-11T01:00:00.000Z' },
      'remark',
      'R'.repeat(4_001),
    ],
    [
      'parseDistributionWriteInput',
      validDistributionInput,
      'receiverName',
      'N'.repeat(201),
    ],
    [
      'parseDistributionWriteInput',
      validDistributionInput,
      'receiverDept',
      'D'.repeat(201),
    ],
    [
      'parseDistributionWriteInput',
      validDistributionInput,
      'note',
      'R'.repeat(4_001),
    ],
    [
      'parseColorBoardDetailUpdateWriteInput',
      validDetailInput,
      'standardBoardId',
      'b'.repeat(65),
    ],
    [
      'parseColorBoardDetailUpdateWriteInput',
      validDetailInput,
      'standardBoardId',
      'board / 1',
    ],
    [
      'parseColorBoardDetailUpdateWriteInput',
      validDetailInput,
      'note',
      'R'.repeat(4_001),
    ],
  ] as const)(
    'rejects unsafe %s.%s input before persistence',
    (method, base, field, value) => {
      const service = createService();
      expect(() => parse(service, method, { ...base, [field]: value })).toThrowError(
        expect.objectContaining({
          response: expect.objectContaining({
            code: 'STANDARD_BOARD_INPUT_OUT_OF_BOUNDS',
          }),
        }),
      );
    },
  );

  it.each([
    ['parseBoardWriteInput', { ...validBoardInput, remark: '\ud800'.repeat(4_000) }],
    [
      'parseIssueBoardInput',
      {
        recipientName: '接收人',
        issuedAt: '2026-08-11T01:00:00.000Z',
        remark: '\ud800'.repeat(4_000),
      },
    ],
    [
      'parseDistributionWriteInput',
      { ...validDistributionInput, note: '\ud800'.repeat(4_000) },
    ],
    [
      'parseColorBoardDetailUpdateWriteInput',
      { ...validDetailInput, note: '\ud800'.repeat(4_000) },
    ],
  ] as const)(
    'enforces the 16 KiB UTF-8 budget for %s',
    (method, input) => {
      const service = createService();
      expect(() => parse(service, method, input)).toThrowError(
        expect.objectContaining({
          response: expect.objectContaining({
            code: 'STANDARD_BOARD_INPUT_OUT_OF_BOUNDS',
          }),
        }),
      );
    },
  );

  it.each(['1e3', '01', 2_147_483_648, Number.MAX_SAFE_INTEGER])(
    'rejects non-canonical or out-of-range version %s',
    (versionNo) => {
      const service = createService();
      expect(() =>
        parse(service, 'parseBoardWriteInput', { ...validBoardInput, versionNo }),
      ).toThrowError(
        expect.objectContaining({
          response: expect.objectContaining({
            code: 'STANDARD_BOARD_INPUT_OUT_OF_BOUNDS',
          }),
        }),
      );
    },
  );

  it('rejects a signature timestamp before the send timestamp', () => {
    const service = createService();
    expect(() =>
      parse(service, 'parseDistributionWriteInput', {
        ...validDistributionInput,
        sentAt: '2026-08-11T02:00:00.000Z',
        signedAt: '2026-08-11T01:59:59.999Z',
      }),
    ).toThrowError(
      expect.objectContaining({
        response: expect.objectContaining({
          code: 'STANDARD_BOARD_INPUT_OUT_OF_BOUNDS',
        }),
      }),
    );
  });

  it.each([
    ['boards', Array.from({ length: 101 }, (_, index) => boardRecord(`board-${index}`))],
    [
      'distributions',
      Array.from({ length: 101 }, (_, index) => distributionRecord(index)),
    ],
    ['details', Array.from({ length: 101 }, (_, index) => detailRecord(index))],
  ] as const)('fail-closes a legacy 101-row %s workspace', async (field, rows) => {
    const harness = workspaceDb({ [field]: rows });
    const service = createService();

    await expect(
      Reflect.get(service, 'buildWorkspace').call(
        service,
        harness.db,
        project.id,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: expect.stringContaining('LIMIT') }),
    });
    expect(harness.boardFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 101 }),
    );
    expect(harness.distributionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 101 }),
    );
    expect(harness.detailFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 101 }),
    );
  });

  it('loads distributions once, groups them by board, and keeps write/base includes shallow', async () => {
    const boards = [boardRecord('board-1', true), boardRecord('board-2', false)];
    const distributions = [
      distributionRecord(1, 'board-1'),
      distributionRecord(2, 'board-2'),
    ];
    const harness = workspaceDb({ boards, distributions });
    const service = createService();

    const workspace = await Reflect.get(service, 'buildWorkspace').call(
      service,
      harness.db,
      project.id,
    );

    expect(harness.distributionFindMany).toHaveBeenCalledTimes(1);
    expect(harness.boardFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: { basedOnSample: true, issuedBy: true },
        take: 101,
      }),
    );
    expect(workspace.items.map((item: { distributions: unknown[] }) => item.distributions))
      .toEqual([[distributions[0]], [distributions[1]]].map((records) =>
        records.map((record) => expect.objectContaining({ id: record!.id })),
      ));

    const boardFindFirst = vi.fn().mockResolvedValue(boards[0]);
    const shallowService = createService();
    await Reflect.get(shallowService, 'getBoardOrThrow').call(
      shallowService,
      { standardBoard: { findFirst: boardFindFirst } },
      project.id,
      'board-1',
    );
    expect(boardFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        include: { basedOnSample: true, issuedBy: true },
      }),
    );
  });

  it('bounds current-board nested distributions and fail-closes at 101', async () => {
    const distributionFindMany = vi.fn().mockResolvedValue(
      Array.from({ length: 101 }, (_, index) => distributionRecord(index)),
    );
    const prisma = {
      standardBoard: { findFirst: vi.fn().mockResolvedValue(boardRecord()) },
      boardDistributionRecord: { findMany: distributionFindMany },
    };
    const service = createService({ prisma });

    await expect(service.getCurrentBoard(project.id, actor)).rejects.toMatchObject({
      response: {
        code: 'STANDARD_BOARD_DISTRIBUTION_LIMIT_EXCEEDED',
      },
    });
    expect(distributionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 101 }),
    );
  });

  it('uses a dedicated bounded detail workspace without boards or sample selectors', async () => {
    const harness = workspaceDb({
      boards: [boardRecord()],
      details: [detailRecord()],
      distributions: [distributionRecord()],
    });
    const service = createService();
    Reflect.set(
      service,
      'buildWorkspace',
      vi.fn().mockRejectedValue(new Error('full workspace must not be loaded')),
    );

    const workspace = await Reflect.get(
      service,
      'buildColorBoardDetailUpdateWorkspace',
    ).call(service, harness.db, project.id);

    expect(workspace.items).toHaveLength(1);
    expect(harness.boardFindMany).not.toHaveBeenCalled();
    expect(harness.sampleFindMany).not.toHaveBeenCalled();
    expect(harness.boardFindFirst).toHaveBeenCalledTimes(1);
    expect(harness.detailFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 101 }),
    );
    expect(harness.distributionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 101 }),
    );
  });

  it('returns at most 100 sample selector rows plus a has-more sentinel', async () => {
    const samples = Array.from({ length: 101 }, (_, index) => sampleRecord(index));
    const harness = workspaceDb({ samples });
    const service = createService();

    const workspace = await Reflect.get(service, 'buildWorkspace').call(
      service,
      harness.db,
      project.id,
    );

    expect(harness.sampleFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 101 }),
    );
    expect(workspace.sampleOptions).toHaveLength(100);
    expect(workspace.sampleOptionsHasMore).toBe(true);
  });

  it('bounds both standard-board context collections and allows exactly 100 rows', async () => {
    const harness = workspaceDb({
      boards: Array.from({ length: 100 }, (_, index) => boardRecord(`board-${index}`)),
      distributions: Array.from({ length: 100 }, (_, index) =>
        distributionRecord(index),
      ),
    });
    const service = createService();

    await expect(
      Reflect.get(service, 'getStandardBoardContext').call(
        service,
        harness.db,
        project.id,
      ),
    ).resolves.toMatchObject({ boards: expect.any(Array), distributions: expect.any(Array) });
    expect(harness.boardFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 101 }),
    );
    expect(harness.distributionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 101 }),
    );
  });

  it('bounds detail-update context and fail-closes a legacy 101st row', async () => {
    const details = Array.from({ length: 101 }, (_, index) => detailRecord(index));
    const harness = workspaceDb({ details });
    const service = createService();

    await expect(
      Reflect.get(service, 'getColorBoardDetailUpdateContext').call(
        service,
        harness.db,
        project.id,
      ),
    ).rejects.toMatchObject({
      response: { code: 'COLOR_BOARD_DETAIL_UPDATE_LIMIT_EXCEEDED' },
    });
    expect(harness.detailFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 101 }),
    );
  });

  it('preflights detail-update overflow in the standard-board write context', async () => {
    const harness = workspaceDb({
      details: Array.from({ length: 101 }, (_, index) => detailRecord(index)),
    });
    const service = createService();

    await expect(
      Reflect.get(service, 'getStandardBoardContext').call(
        service,
        harness.db,
        project.id,
      ),
    ).rejects.toMatchObject({
      response: { code: 'COLOR_BOARD_DETAIL_UPDATE_LIMIT_EXCEEDED' },
    });
  });

  it('uses scalar-only sentinels for every standard-board write-context collection', async () => {
    const harness = workspaceDb({
      boards: [boardRecord()],
      distributions: [distributionRecord()],
      details: [detailRecord()],
    });
    const service = createService();

    await Reflect.get(service, 'getStandardBoardContext').call(
      service,
      harness.db,
      project.id,
    );

    expect(harness.boardFindMany).toHaveBeenCalledWith({
      where: { projectId: project.id },
      select: { id: true, isCurrent: true, status: true },
      orderBy: { id: 'asc' },
      take: 101,
    });
    expect(harness.distributionFindMany).toHaveBeenCalledWith({
      where: { projectId: project.id },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: 101,
    });
    expect(harness.detailFindMany).toHaveBeenCalledWith({
      where: { projectId: project.id },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: 101,
    });
    expect(harness.workflowFindFirst).toHaveBeenCalledWith({
      where: {
        projectId: project.id,
        nodeCode: WorkflowNodeCode.STANDARD_BOARD_PRODUCTION,
        isActive: true,
      },
      select: { id: true },
      orderBy: [{ createdAt: 'desc' }, { taskRound: 'desc' }],
    });
  });

  it('uses scalar-only sentinels for every detail-update write-context collection', async () => {
    const harness = workspaceDb({
      boards: [boardRecord()],
      distributions: [distributionRecord()],
      details: [detailRecord()],
    });
    const service = createService();

    await Reflect.get(service, 'getColorBoardDetailUpdateContext').call(
      service,
      harness.db,
      project.id,
    );

    expect(harness.detailFindMany).toHaveBeenCalledWith({
      where: { projectId: project.id },
      select: { id: true, updateStatus: true },
      orderBy: { id: 'asc' },
      take: 101,
    });
    expect(harness.boardFindMany).toHaveBeenCalledWith({
      where: { projectId: project.id },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: 101,
    });
    expect(harness.distributionFindMany).toHaveBeenCalledWith({
      where: { projectId: project.id },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: 101,
    });
    expect(harness.workflowFindFirst).toHaveBeenCalledWith({
      where: {
        projectId: project.id,
        nodeCode: WorkflowNodeCode.BOARD_DETAIL_UPDATE,
        isActive: true,
      },
      select: { id: true },
      orderBy: [{ createdAt: 'desc' }, { taskRound: 'desc' }],
    });
  });

  it.each([
    [
      'boards',
      Array.from({ length: 101 }, (_, index) => boardRecord(`board-${index}`)),
      'STANDARD_BOARD_RECORD_LIMIT_EXCEEDED',
    ],
    [
      'distributions',
      Array.from({ length: 101 }, (_, index) => distributionRecord(index)),
      'STANDARD_BOARD_DISTRIBUTION_LIMIT_EXCEEDED',
    ],
  ] as const)(
    'preflights %s overflow in the detail-update write context',
    async (field, rows, code) => {
      const harness = workspaceDb({ [field]: rows });
      const service = createService();

      await expect(
        Reflect.get(service, 'getColorBoardDetailUpdateContext').call(
          service,
          harness.db,
          project.id,
        ),
      ).rejects.toMatchObject({ response: { code } });
    },
  );

  it.each([
    {
      method: 'updateStandardBoard',
      contextMethod: 'getStandardBoardContext',
      nodeCode: WorkflowNodeCode.STANDARD_BOARD_PRODUCTION,
      invoke: (service: StandardBoardsService) =>
        service.updateStandardBoard(
          project.id,
          'standard-board-1',
          validBoardInput,
          actor,
        ),
    },
    {
      method: 'setCurrentBoard',
      contextMethod: 'getStandardBoardContext',
      nodeCode: WorkflowNodeCode.STANDARD_BOARD_PRODUCTION,
      invoke: (service: StandardBoardsService) =>
        service.setCurrentBoard(project.id, 'standard-board-1', actor),
    },
    {
      method: 'markCreated',
      contextMethod: 'getStandardBoardContext',
      nodeCode: WorkflowNodeCode.STANDARD_BOARD_PRODUCTION,
      invoke: (service: StandardBoardsService) =>
        service.markCreated(project.id, 'standard-board-1', actor),
    },
    {
      method: 'issueBoard',
      contextMethod: 'getStandardBoardContext',
      nodeCode: WorkflowNodeCode.STANDARD_BOARD_PRODUCTION,
      invoke: (service: StandardBoardsService) =>
        service.issueBoard(
          project.id,
          'standard-board-1',
          {
            recipientName: '接收人',
            issuedAt: '2026-08-11T01:00:00.000Z',
          },
          actor,
        ),
    },
    {
      method: 'completeStandardBoardTask',
      contextMethod: 'getStandardBoardContext',
      nodeCode: WorkflowNodeCode.STANDARD_BOARD_PRODUCTION,
      invoke: (service: StandardBoardsService) =>
        service.completeStandardBoardTask(project.id, actor),
    },
    {
      method: 'completeColorBoardDetailUpdateTask',
      contextMethod: 'getColorBoardDetailUpdateContext',
      nodeCode: WorkflowNodeCode.BOARD_DETAIL_UPDATE,
      invoke: (service: StandardBoardsService) =>
        service.completeColorBoardDetailUpdateTask(project.id, actor),
    },
  ] as const)(
    'keeps $method free of persisted side effects when bounded workspace preflight fails',
    async ({ contextMethod, nodeCode, invoke }) => {
      const update = vi.fn();
      const updateMany = vi.fn();
      const tx = { standardBoard: { update, updateMany } };
      const prisma = {
        $transaction: vi.fn(async (executor: (client: typeof tx) => unknown) =>
          executor(tx),
        ),
      };
      const activityLogs = { createWithExecutor: vi.fn() };
      const workflows = { transitionTaskWithExecutor: vi.fn() };
      const service = createService({ prisma, activityLogs, workflows });
      const lock = vi.fn().mockResolvedValue(
        nodeCode === WorkflowNodeCode.BOARD_DETAIL_UPDATE
          ? detailTask.id
          : standardBoardTask.id,
      );
      Reflect.set(service, 'lockActiveTaskForWrite', lock);
      Reflect.set(
        service,
        contextMethod,
        vi.fn().mockRejectedValue(
          new ConflictException({
            code: 'STANDARD_BOARD_WORKSPACE_LIMIT_EXCEEDED',
            message: 'legacy workspace overflow',
          }),
        ),
      );
      const buildWorkspace = vi.fn();
      Reflect.set(service, 'buildWorkspace', buildWorkspace);

      await expect(invoke(service)).rejects.toMatchObject({
        response: { code: 'STANDARD_BOARD_WORKSPACE_LIMIT_EXCEEDED' },
      });
      expect(lock).toHaveBeenCalledWith(tx, project.id, nodeCode);
      expect(update).not.toHaveBeenCalled();
      expect(updateMany).not.toHaveBeenCalled();
      expect(workflows.transitionTaskWithExecutor).not.toHaveBeenCalled();
      expect(activityLogs.createWithExecutor).not.toHaveBeenCalled();
      expect(buildWorkspace).not.toHaveBeenCalled();
    },
  );

  it('fail-closes oversized legacy values before projecting an audit snapshot', () => {
    const service = createService();
    expect(() =>
      Reflect.get(service, 'toStandardBoardAuditSnapshot').call(service, {
        ...boardRecord(),
        remark: 'R'.repeat(4_001),
      }),
    ).toThrowError(
      expect.objectContaining({
        response: expect.objectContaining({
          code: 'STANDARD_BOARD_INPUT_OUT_OF_BOUNDS',
        }),
      }),
    );
    expect(() =>
      Reflect.get(service, 'toColorBoardDetailUpdateAuditSnapshot').call(
        service,
        {
          ...detailRecord(),
          note: '\ud800'.repeat(4_000),
        },
      ),
    ).toThrowError(
      expect.objectContaining({
        response: expect.objectContaining({
          code: 'STANDARD_BOARD_INPUT_OUT_OF_BOUNDS',
        }),
      }),
    );
  });

  it.each([
    ['board id', { id: 'b'.repeat(65) }],
    [
      'sample number',
      {
        basedOnSample: {
          ...boardRecord().basedOnSample,
          sampleNo: 'S'.repeat(65),
        },
      },
    ],
    ['issuer id', { issuedById: 'u'.repeat(65) }],
    [
      'issuer name',
      {
        issuedById: 'issuer-1',
        issuedBy: { id: 'issuer-1', name: 'N'.repeat(201) },
      },
    ],
  ] as const)('rejects an oversized legacy %s before board snapshot serialization', (_label, override) => {
    const service = createService();
    expect(() =>
      Reflect.get(service, 'toStandardBoardAuditSnapshot').call(service, {
        ...boardRecord(),
        ...override,
      }),
    ).toThrowError(
      expect.objectContaining({
        response: expect.objectContaining({
          code: 'STANDARD_BOARD_INPUT_OUT_OF_BOUNDS',
        }),
      }),
    );
  });

  it.each([
    ['detail id', { id: 'd'.repeat(65) }],
    ['operator id', { updatedById: 'u'.repeat(65) }],
    [
      'operator name',
      {
        updatedById: 'operator-1',
        updatedBy: { id: 'operator-1', name: 'N'.repeat(201) },
      },
    ],
  ] as const)('rejects an oversized legacy %s before detail snapshot serialization', (_label, override) => {
    const service = createService();
    expect(() =>
      Reflect.get(service, 'toColorBoardDetailUpdateAuditSnapshot').call(
        service,
        {
          ...detailRecord(),
          ...override,
        },
      ),
    ).toThrowError(
      expect.objectContaining({
        response: expect.objectContaining({
          code: 'STANDARD_BOARD_INPUT_OUT_OF_BOUNDS',
        }),
      }),
    );
  });

  it.each([
    {
      method: 'updateStandardBoard',
      status: StandardBoardStatus.DRAFT,
      invoke: (service: StandardBoardsService) =>
        service.updateStandardBoard(
          project.id,
          'standard-board-1',
          validBoardInput,
          actor,
        ),
    },
    {
      method: 'setCurrentBoard',
      status: StandardBoardStatus.ISSUED,
      invoke: (service: StandardBoardsService) =>
        service.setCurrentBoard(project.id, 'standard-board-1', actor),
    },
    {
      method: 'issueBoard',
      status: StandardBoardStatus.CREATED,
      invoke: (service: StandardBoardsService) =>
        service.issueBoard(
          project.id,
          'standard-board-1',
          { recipientName: '接收人', issuedAt: '2026-08-11T01:00:00.000Z' },
          actor,
        ),
    },
    {
      method: 'markCreated',
      status: StandardBoardStatus.DRAFT,
      invoke: (service: StandardBoardsService) =>
        service.markCreated(project.id, 'standard-board-1', actor),
    },
  ] as const)(
    'rejects an oversized legacy summary source before $method mutates a board',
    async ({ status, invoke }) => {
      const update = vi.fn();
      const updateMany = vi.fn();
      const tx = { standardBoard: { update, updateMany } };
      const prisma = {
        $transaction: vi.fn(async (executor: (client: typeof tx) => unknown) =>
          executor(tx),
        ),
      };
      const activityLogs = { createWithExecutor: vi.fn() };
      const service = createService({ prisma, activityLogs });
      Reflect.set(
        service,
        'lockActiveTaskForWrite',
        vi.fn().mockResolvedValue(standardBoardTask.id),
      );
      Reflect.set(
        service,
        'getStandardBoardContext',
        vi.fn().mockResolvedValue({
          activeTask: standardBoardTask,
          procurementCompleted: true,
          boards: [boardRecord()],
          distributions: [],
          detailUpdates: [],
        }),
      );
      Reflect.set(
        service,
        'getBoardOrThrow',
        vi.fn().mockResolvedValue({
          ...boardRecord(),
          status,
          boardCode: 'B'.repeat(65),
        }),
      );
      Reflect.set(service, 'buildWorkspace', vi.fn());

      await expect(invoke(service)).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'STANDARD_BOARD_INPUT_OUT_OF_BOUNDS',
        }),
      });
      expect(update).not.toHaveBeenCalled();
      expect(updateMany).not.toHaveBeenCalled();
      expect(activityLogs.createWithExecutor).not.toHaveBeenCalled();
    },
  );

  it('rejects an oversized referenced board before creating a detail update', async () => {
    const create = vi.fn();
    const tx = { colorBoardDetailUpdate: { create } };
    const prisma = {
      $transaction: vi.fn(async (executor: (client: typeof tx) => unknown) =>
        executor(tx),
      ),
    };
    const activityLogs = { createWithExecutor: vi.fn() };
    const service = createService({ prisma, activityLogs });
    Reflect.set(
      service,
      'lockActiveTaskForWrite',
      vi.fn().mockResolvedValue(detailTask.id),
    );
    Reflect.set(
      service,
      'getColorBoardDetailUpdateContext',
      vi.fn().mockResolvedValue({
        activeTask: detailTask,
        updates: [],
        boards: [boardRecord()],
        distributions: [],
      }),
    );
    Reflect.set(
      service,
      'getBoardOrThrow',
      vi.fn().mockResolvedValue({
        ...boardRecord(),
        boardCode: 'B'.repeat(65),
      }),
    );

    await expect(
      service.createColorBoardDetailUpdate(project.id, validDetailInput, actor),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'STANDARD_BOARD_INPUT_OUT_OF_BOUNDS',
      }),
    });
    expect(create).not.toHaveBeenCalled();
    expect(activityLogs.createWithExecutor).not.toHaveBeenCalled();
  });

  it('rejects an oversized referenced sample number before creating a board', async () => {
    const create = vi.fn();
    const tx = {
      sample: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'sample-1',
          sampleNo: 'S'.repeat(65),
        }),
      },
      standardBoard: { create },
    };
    const prisma = {
      $transaction: vi.fn(async (executor: (client: typeof tx) => unknown) =>
        executor(tx),
      ),
    };
    const activityLogs = { createWithExecutor: vi.fn() };
    const service = createService({ prisma, activityLogs });
    Reflect.set(
      service,
      'lockActiveTaskForWrite',
      vi.fn().mockResolvedValue(standardBoardTask.id),
    );
    Reflect.set(
      service,
      'getStandardBoardContext',
      vi.fn().mockResolvedValue({
        activeTask: standardBoardTask,
        procurementCompleted: true,
        boards: [],
        distributions: [],
        detailUpdates: [],
      }),
    );
    Reflect.set(service, 'assertUniqueBoardVersion', vi.fn());

    await expect(
      service.createStandardBoard(project.id, validBoardInput, actor),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'STANDARD_BOARD_INPUT_OUT_OF_BOUNDS',
      }),
    });
    expect(create).not.toHaveBeenCalled();
    expect(activityLogs.createWithExecutor).not.toHaveBeenCalled();
  });

  it('rejects an oversized legacy board before a distribution write can reach its audit summary', async () => {
    const create = vi.fn();
    const tx = { boardDistributionRecord: { create } };
    const prisma = {
      $transaction: vi.fn(async (executor: (client: typeof tx) => unknown) =>
        executor(tx),
      ),
    };
    const activityLogs = { createWithExecutor: vi.fn() };
    const service = createService({ prisma, activityLogs });
    Reflect.set(
      service,
      'lockActiveTaskForWrite',
      vi.fn().mockResolvedValue(standardBoardTask.id),
    );
    Reflect.set(
      service,
      'getStandardBoardContext',
      vi.fn().mockResolvedValue({
        project,
        activeTask: standardBoardTask,
        procurementCompleted: true,
        boards: [boardRecord()],
        distributions: [],
        detailUpdates: [],
      }),
    );
    Reflect.set(
      service,
      'getBoardOrThrow',
      vi.fn().mockResolvedValue({
        ...boardRecord(),
        boardCode: 'B'.repeat(65),
      }),
    );

    await expect(
      service.addDistribution(
        project.id,
        'standard-board-1',
        validDistributionInput,
        actor,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'STANDARD_BOARD_INPUT_OUT_OF_BOUNDS',
      }),
    });
    expect(create).not.toHaveBeenCalled();
    expect(activityLogs.createWithExecutor).not.toHaveBeenCalled();
  });

  it('keeps 100 boards, distributions, and details linearly bounded without nested amplification', async () => {
    const boards = Array.from({ length: 100 }, (_, index) =>
      boardRecord(`board-${index}`, index === 0),
    );
    const distributions = Array.from({ length: 100 }, (_, index) =>
      distributionRecord(index, `board-${index}`),
    );
    const details = Array.from({ length: 100 }, (_, index) => ({
      ...detailRecord(index),
      standardBoardId: `board-${index}`,
      standardBoard: boardRecord(`board-${index}`, index === 0),
    }));
    const harness = workspaceDb({ boards, distributions, details });
    const service = createService();

    const workspace = await Reflect.get(service, 'buildWorkspace').call(
      service,
      harness.db,
      project.id,
    );

    expect(workspace.items).toHaveLength(100);
    expect(
      workspace.items.reduce(
        (total: number, board: { distributions: unknown[] }) =>
          total + board.distributions.length,
        0,
      ),
    ).toBe(100);
    expect(workspace.detailUpdates).toHaveLength(100);
    expect(workspace.detailUpdates[0].standardBoard).toEqual({
      id: 'board-0',
      boardCode: 'SB-board-0',
      versionNo: 1,
    });
    expect(harness.distributionFindMany).toHaveBeenCalledTimes(1);
    expect(harness.detailFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          standardBoard: {
            include: { basedOnSample: true, issuedBy: true },
          },
          updatedBy: true,
        },
        take: 101,
      }),
    );
  });

  it.each([
    {
      label: 'standard board',
      nodeCode: WorkflowNodeCode.STANDARD_BOARD_PRODUCTION,
      invoke: (service: StandardBoardsService) =>
        service.createStandardBoard(project.id, validBoardInput, actor),
      contextMethod: 'getStandardBoardContext',
      context: {
        project,
        activeTask: standardBoardTask,
        procurementCompleted: true,
        boards: Array.from({ length: 100 }, (_, index) => boardRecord(`board-${index}`)),
        distributions: [],
      },
      createModel: 'standardBoard',
      code: 'STANDARD_BOARD_RECORD_LIMIT_EXCEEDED',
    },
    {
      label: 'distribution',
      nodeCode: WorkflowNodeCode.STANDARD_BOARD_PRODUCTION,
      invoke: (service: StandardBoardsService) =>
        service.addDistribution(
          project.id,
          'standard-board-1',
          validDistributionInput,
          actor,
        ),
      contextMethod: 'getStandardBoardContext',
      context: {
        project,
        activeTask: standardBoardTask,
        procurementCompleted: true,
        boards: [boardRecord()],
        distributions: Array.from({ length: 100 }, (_, index) =>
          distributionRecord(index),
        ),
      },
      createModel: 'boardDistributionRecord',
      code: 'STANDARD_BOARD_DISTRIBUTION_LIMIT_EXCEEDED',
    },
    {
      label: 'detail update',
      nodeCode: WorkflowNodeCode.BOARD_DETAIL_UPDATE,
      invoke: (service: StandardBoardsService) =>
        service.createColorBoardDetailUpdate(project.id, validDetailInput, actor),
      contextMethod: 'getColorBoardDetailUpdateContext',
      context: {
        project,
        activeTask: detailTask,
        procurementCompleted: true,
        updates: Array.from({ length: 100 }, (_, index) => detailRecord(index)),
      },
      createModel: 'colorBoardDetailUpdate',
      code: 'COLOR_BOARD_DETAIL_UPDATE_LIMIT_EXCEEDED',
    },
  ] as const)(
    'checks the 101st $label create after its exact active-task lock and before side effects',
    async ({
      nodeCode,
      invoke,
      contextMethod,
      context,
      createModel,
      code,
    }) => {
      const events: string[] = [];
      const create = vi.fn();
      const tx = { [createModel]: { create } };
      const prisma = {
        $transaction: vi.fn(async (executor: (client: typeof tx) => unknown) => {
          events.push('transaction');
          return executor(tx);
        }),
      };
      const activityLogs = { createWithExecutor: vi.fn() };
      const service = createService({ prisma, activityLogs });
      const lock = vi.fn(async (_tx, _projectId, actualNodeCode) => {
        events.push(`lock:${actualNodeCode}`);
        return context.activeTask.id;
      });
      Reflect.set(service, 'lockActiveTaskForWrite', lock);
      Reflect.set(
        service,
        contextMethod,
        vi.fn(async () => {
          events.push('bounded-context');
          return context;
        }),
      );
      Reflect.set(service, 'buildWorkspace', vi.fn().mockResolvedValue({}));

      await expect(invoke(service)).rejects.toMatchObject({ response: { code } });
      expect(lock).toHaveBeenCalledWith(tx, project.id, nodeCode);
      expect(events).toEqual([
        'transaction',
        `lock:${nodeCode}`,
        'bounded-context',
      ]);
      expect(create).not.toHaveBeenCalled();
      expect(activityLogs.createWithExecutor).not.toHaveBeenCalled();
    },
  );
});
