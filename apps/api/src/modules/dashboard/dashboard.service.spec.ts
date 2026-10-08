import {
  ProjectStatus,
  RecurringTaskStatus,
  ReviewResult,
  WorkflowNodeCode,
} from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import type { AuthenticatedUser } from '../auth/auth.types';
import { DashboardService } from './dashboard.service';

function createActor(): AuthenticatedUser {
  return {
    id: 'user-1',
    username: 'pm',
    name: '项目经理',
    email: null,
    departmentId: null,
    departmentName: null,
    isSystemAdmin: false,
    teamAccessApproved: true, authSource: 'local',
    roleCodes: ['project_manager'],
    permissionCodes: ['project.read'],
  };
}

describe('DashboardService', () => {
  it('builds a personal task-first dashboard without static data', async () => {
    const prisma = {
      workflowTask: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi
          .fn()
          .mockResolvedValueOnce(4)
          .mockResolvedValueOnce(1)
          .mockResolvedValueOnce(2)
          .mockResolvedValueOnce(1),
      },
      taskBlocker: {
        count: vi.fn().mockResolvedValue(1),
      },
      project: {
        findMany: vi.fn().mockRejectedValue(new Error('unbounded project ID read')),
        count: vi.fn().mockResolvedValue(2),
      },
      auditLog: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const service = new DashboardService(prisma as never);

    const result = await service.getPersonalOverview(createActor());

    expect(result).toMatchObject({
      user: { id: 'user-1', name: '项目经理' },
      currentTask: null,
      nextTask: null,
      stats: {
        activeTasks: 4,
        overdueTasks: 1,
        dueTodayTasks: 2,
        visibleProjects: 2,
        pendingReviewTasks: 1,
        pendingMaterialTasks: 0,
        waitingOnOthersTasks: 1,
      },
    });
    expect(prisma.project.findMany).not.toHaveBeenCalled();
    expect(prisma.project.count).toHaveBeenCalledWith({ where: {} });
  });

  it('aggregates overview statistics for current user scope', async () => {
    const prisma = {
      project: {
        findMany: vi.fn().mockRejectedValue(new Error('unbounded project read')),
        groupBy: vi.fn().mockResolvedValue([
          { status: ProjectStatus.IN_PROGRESS, _count: { _all: 1 } },
          { status: ProjectStatus.COMPLETED, _count: { _all: 1 } },
        ]),
        aggregate: vi.fn().mockResolvedValue({
          _max: { updatedAt: new Date('2026-03-20T00:00:00.000Z') },
        }),
      },
      workflowTask: {
        count: vi.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(3).mockResolvedValueOnce(0),
      },
      color: {
        count: vi.fn().mockResolvedValue(5),
      },
      recurringTask: {
        count: vi.fn().mockRejectedValue(new Error('unbounded recurring task read')),
      },
      $queryRaw: vi.fn().mockResolvedValue([{ count: 1n }]),
    };
    const service = new DashboardService(prisma as never);

    const result = await service.getOverview(createActor());

    expect(result).toEqual(
      expect.objectContaining({
        totalProjects: 2,
        activeProjects: 1,
        overdueTasks: 2,
        pendingReviews: 3,
        currentMonthPendingReviews: 3,
        monthlyColorReviewPending: 1,
        pendingColorExits: 0,
        activeColors: 5,
        completedProjects: 1,
      }),
    );
    expect(prisma.project.findMany).not.toHaveBeenCalled();
    expect(prisma.project.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
        by: ['status'],
      }),
    );
    expect(prisma.recurringTask.count).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    const monthlyReviewQuery = prisma.$queryRaw.mock.calls[0]?.[0] as {
      strings: string[];
      values: unknown[];
    };
    expect(monthlyReviewQuery.strings.join('?')).toContain(
      '::"RecurringTaskStatus"',
    );
    expect(
      monthlyReviewQuery.strings
        .join('?')
        .match(/::"RecurringTaskStatus"/g),
    ).toHaveLength(3);
    expect(monthlyReviewQuery.values.slice(0, 3)).toEqual([
      RecurringTaskStatus.PENDING,
      RecurringTaskStatus.IN_PROGRESS,
      RecurringTaskStatus.OVERDUE,
    ]);
  });

  it('groups stage distribution by current node code', async () => {
    const prisma = {
      project: {
        findMany: vi.fn().mockRejectedValue(new Error('unbounded project read')),
        groupBy: vi.fn().mockResolvedValue([
          {
            currentNodeCode: WorkflowNodeCode.PAINT_PROCUREMENT,
            _count: { _all: 2 },
          },
          {
            currentNodeCode: WorkflowNodeCode.CAB_REVIEW,
            _count: { _all: 1 },
          },
        ]),
      },
    };
    const service = new DashboardService(prisma as never);

    await expect(service.getStageDistribution(createActor())).resolves.toEqual([
      {
        nodeCode: WorkflowNodeCode.PAINT_PROCUREMENT,
        nodeName: '涂料采购',
        count: 2,
      },
      {
        nodeCode: WorkflowNodeCode.CAB_REVIEW,
        nodeName: '样车驾驶室评审',
        count: 1,
      },
    ]);
    expect(prisma.project.findMany).not.toHaveBeenCalled();
    expect(prisma.project.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ['currentNodeCode'],
        _count: { _all: true },
      }),
    );
  });

  it('filters and maps recent reviews', async () => {
    const prisma = {
      reviewRecord: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'review-1',
            projectId: 'project-1',
            reviewType: 'CAB_REVIEW',
            result: ReviewResult.APPROVED,
            reviewedAt: new Date('2026-03-19T12:00:00.000Z'),
            project: {
              id: 'project-1',
              name: '项目A',
            },
            reviewer: {
              name: '张工',
            },
          },
        ]),
      },
    };
    const service = new DashboardService(prisma as never);

    await expect(service.getRecentReviews(createActor())).resolves.toEqual([
      {
        id: 'review-1',
        reviewType: 'CAB_REVIEW',
        projectId: 'project-1',
        projectName: '项目A',
        reviewerName: '张工',
        reviewDate: '2026-03-19T12:00:00.000Z',
        conclusion: ReviewResult.APPROVED,
      },
    ]);
  });
});
