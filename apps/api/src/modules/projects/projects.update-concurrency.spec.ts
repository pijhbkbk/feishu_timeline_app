import { BadRequestException } from '@nestjs/common';
import {
  ProjectPriority,
  ProjectStatus,
  WorkflowNodeCode,
} from '@prisma/client';
import { validate } from 'class-validator';
import { describe, expect, it, vi } from 'vitest';

import { installTeamAuthorizationFixture } from '../../test-support/team-authorization.fixture';
import type { AuthenticatedUser } from '../auth/auth.types';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectsService } from './projects.service';

const actor: AuthenticatedUser = {
  id: 'project-manager-1',
  username: 'project-manager-1',
  name: '项目经理',
  email: null,
  departmentId: 'dept-old',
  departmentName: '原部门',
  isSystemAdmin: false,
  authSource: 'local',
  authVersion: 1,
  roleCodes: ['project_manager'],
  permissionCodes: ['project.write'],
};

const initialVersion = new Date('2026-08-11T08:00:00.000Z');

function createProjectRow() {
  return {
    id: 'project-1',
    code: 'PRJ-001',
    name: '原项目名称',
    description: '原项目描述',
    status: ProjectStatus.IN_PROGRESS,
    priority: ProjectPriority.MEDIUM,
    currentNodeCode: WorkflowNodeCode.PROJECT_INITIATION,
    owningDepartmentId: 'dept-old',
    ownerUserId: 'owner-old',
    memberAssignmentVersion: 7,
    marketRegion: '华东',
    colorMarketingUnit: null,
    paintSupplier: null,
    vehicleModel: '轻卡 X1',
    plannedStartDate: new Date('2026-08-01T00:00:00.000Z'),
    plannedEndDate: new Date('2026-09-01T00:00:00.000Z'),
    actualStartDate: null,
    actualEndDate: null,
    closedAt: null,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date(initialVersion),
  };
}

type ProjectRow = ReturnType<typeof createProjectRow>;

function copyProject(row: ProjectRow): ProjectRow {
  return {
    ...row,
    plannedStartDate: new Date(row.plannedStartDate),
    plannedEndDate: new Date(row.plannedEndDate),
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

function createService(
  tx: Record<string, unknown>,
  readState: () => ProjectRow,
) {
  installTeamAuthorizationFixture(tx, [{ ...actor, authVersion: 1 }]);
  const activityLogsService = {
    createWithExecutor: vi.fn(async () => ({ id: 'audit-1' })),
  };
  const projectAccessService = {
    assertProjectAccess: vi.fn(async () => undefined),
  };
  const prisma = {
    $transaction: vi.fn(
      async (callback: (executor: typeof tx) => Promise<unknown>) => callback(tx),
    ),
  };
  const service = new ProjectsService(
    prisma as never,
    {} as never,
    activityLogsService as never,
    projectAccessService as never,
  );

  vi.spyOn(service as any, 'toProjectAuditSnapshot').mockReturnValue({});
  vi.spyOn(service as any, 'findProjectDetailOrThrow').mockImplementation(
    async () => copyProject(readState()),
  );
  vi.spyOn(service as any, 'toProjectDetail').mockImplementation((project: unknown) => project);

  return { activityLogsService, prisma, projectAccessService, service };
}

describe('ProjectsService generic PATCH concurrency integrity', () => {
  it('requires an ISO expectedVersion at both the DTO and service boundaries', async () => {
    const missingDto = Object.assign(new UpdateProjectDto(), {
      name: '缺少版本',
    });
    const malformedDto = Object.assign(new UpdateProjectDto(), {
      name: '错误版本',
      expectedVersion: 'not-a-date',
    });

    expect((await validate(missingDto)).some((error) => error.property === 'expectedVersion')).toBe(
      true,
    );
    expect(
      (await validate(malformedDto)).some((error) => error.property === 'expectedVersion'),
    ).toBe(true);

    const transaction = vi.fn(async () => {
      throw new Error('transaction must not start without a version');
    });
    const service = new ProjectsService(
      { $transaction: transaction } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const request = service.updateProject('project-1', { name: '缺少版本' }, actor);

    await expect(request).rejects.toBeInstanceOf(BadRequestException);
    await expect(request).rejects.toMatchObject({
      response: { code: 'PROJECT_VERSION_REQUIRED' },
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('lets only one of two different patches claim the same updatedAt version', async () => {
    let state = createProjectRow();
    let initialReadCount = 0;
    let releaseInitialReads!: () => void;
    const bothInitialReadsReached = new Promise<void>((resolve) => {
      releaseInitialReads = resolve;
    });

    const findUnique = vi.fn(async () => {
      if (initialReadCount < 2) {
        const snapshot = copyProject(state);
        initialReadCount += 1;
        if (initialReadCount === 2) {
          releaseInitialReads();
        }
        await bothInitialReadsReached;
        return snapshot;
      }
      return copyProject(state);
    });
    const update = vi.fn(async ({ data }: { data: Partial<ProjectRow> }) => {
      state = {
        ...state,
        ...data,
        updatedAt: new Date(state.updatedAt.getTime() + 1),
      };
      return copyProject(state);
    });
    const updateMany = vi.fn(
      async ({ where, data }: { where: Partial<ProjectRow>; data: Partial<ProjectRow> }) => {
        if (
          !(where.updatedAt instanceof Date) ||
          where.updatedAt.getTime() !== state.updatedAt.getTime()
        ) {
          return { count: 0 };
        }
        state = { ...state, ...data };
        return { count: 1 };
      },
    );
    const tx = { project: { findUnique, update, updateMany } };
    const { activityLogsService, service } = createService(tx, () => state);

    const results = await Promise.allSettled([
      service.updateProject(
        state.id,
        { expectedVersion: initialVersion.toISOString(), name: '请求 A 的名称' },
        actor,
      ),
      service.updateProject(
        state.id,
        { expectedVersion: initialVersion.toISOString(), description: '请求 B 的描述' },
        actor,
      ),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({
      reason: { response: { code: 'PROJECT_STATE_CHANGED' } },
    });
    expect(activityLogsService.createWithExecutor).toHaveBeenCalledTimes(1);
    expect(
      (state.name === '请求 A 的名称' && state.description === '原项目描述') ||
        (state.name === '原项目名称' && state.description === '请求 B 的描述'),
    ).toBe(true);
  });

  it('conflicts with an interleaved R26 owner/department update without overwriting it', async () => {
    let state = createProjectRow();
    let firstRead = true;
    const r26Version = new Date(initialVersion);
    const findUnique = vi.fn(async () => {
      if (firstRead) {
        firstRead = false;
        const staleSnapshot = copyProject(state);
        state = {
          ...state,
          ownerUserId: 'owner-r26-live',
          owningDepartmentId: 'dept-r26-live',
          memberAssignmentVersion: state.memberAssignmentVersion + 1,
          updatedAt: r26Version,
        };
        return staleSnapshot;
      }
      return copyProject(state);
    });
    const update = vi.fn(async ({ data }: { data: Partial<ProjectRow> }) => {
      state = {
        ...state,
        ...data,
        updatedAt: new Date(state.updatedAt.getTime() + 1),
      };
      return copyProject(state);
    });
    const updateMany = vi.fn(
      async ({ where, data }: { where: Partial<ProjectRow>; data: Partial<ProjectRow> }) => {
        if (
          !(where.updatedAt instanceof Date) ||
          where.updatedAt.getTime() !== state.updatedAt.getTime() ||
          where.memberAssignmentVersion !== state.memberAssignmentVersion
        ) {
          return { count: 0 };
        }
        state = { ...state, ...data };
        return { count: 1 };
      },
    );
    const tx = { project: { findUnique, update, updateMany } };
    const { activityLogsService, service } = createService(tx, () => state);

    const request = service.updateProject(
      state.id,
      { expectedVersion: initialVersion.toISOString(), vehicleModel: '轻卡 X2' },
      actor,
    );

    await expect(request).rejects.toMatchObject({
      response: { code: 'PROJECT_STATE_CHANGED' },
    });
    expect(update).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(updateMany.mock.calls[0]![0].data).not.toHaveProperty('ownerUserId');
    expect(updateMany.mock.calls[0]![0].data).not.toHaveProperty('owningDepartmentId');
    expect(state).toMatchObject({
      ownerUserId: 'owner-r26-live',
      owningDepartmentId: 'dept-r26-live',
      memberAssignmentVersion: 8,
      updatedAt: r26Version,
    });
    expect(activityLogsService.createWithExecutor).not.toHaveBeenCalled();
  });
});
