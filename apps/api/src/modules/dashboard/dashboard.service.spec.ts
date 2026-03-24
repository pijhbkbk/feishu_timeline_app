import { ProjectStatus, ReviewResult, WorkflowNodeCode } from '@prisma/client';
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
    authSource: 'mock',
    roleCodes: ['project_manager'],
  };
}

describe('DashboardService', () => {
  it('aggregates overview statistics for current user scope', async () => {
    const prisma = {
      project: {
        findMany: vi.fn().mockResolvedValue([
          { status: ProjectStatus.IN_PROGRESS },
          { status: ProjectStatus.COMPLETED },
        ]),
      },
      workflowTask: {
        count: vi.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(3),
      },
      color: {
        count: vi.fn().mockResolvedValue(5),
      },
    };
    const service = new DashboardService(prisma as never);

    await expect(service.getOverview(createActor())).resolves.toEqual({
      totalProjects: 2,
      activeProjects: 1,
      overdueTasks: 2,
      pendingReviews: 3,
      activeColors: 5,
      completedProjects: 1,
    });
    expect(prisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.any(Array),
        }),
      }),
    );
  });

  it('groups stage distribution by current node code', async () => {
    const prisma = {
      project: {
        findMany: vi.fn().mockResolvedValue([
          { currentNodeCode: WorkflowNodeCode.PAINT_PROCUREMENT },
          { currentNodeCode: WorkflowNodeCode.PAINT_PROCUREMENT },
          { currentNodeCode: WorkflowNodeCode.CAB_REVIEW },
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
