import { WorkflowNodeCode } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AnalyticsService } from './analytics.service';

describe('AnalyticsService bounded overview read model', () => {
  const forbiddenFindMany = vi.fn(() => {
    throw new Error('analytics overview must not materialize domain rows');
  });
  const prisma = {
    $queryRaw: vi.fn(),
    project: { findMany: forbiddenFindMany },
    workflowTask: { findMany: forbiddenFindMany },
    workflowTransition: { findMany: forbiddenFindMany },
    reviewRecord: { findMany: forbiddenFindMany },
    recurringTask: { findMany: forbiddenFindMany },
    colorExit: { findMany: forbiddenFindMany },
    developmentFee: { findMany: forbiddenFindMany },
  };
  let service: AnalyticsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AnalyticsService(prisma as never);
  });

  it('returns the overview from bounded database aggregates without project id arrays', async () => {
    prisma.$queryRaw
      .mockResolvedValueOnce([{
        totalProjects: 10n,
        activeProjects: 6n,
        completedProjects: 3n,
        overdueProjects: 2n,
        averageDevelopmentDays: 18,
        completedTaskCount: 8n,
        onTimeCompletedTaskCount: 6n,
        totalOverdueTasks: 3n,
      }])
      .mockResolvedValueOnce([{
        nodeCode: WorkflowNodeCode.COLOR_NUMBERING,
        averageDays: 4,
        overdueCount: 1n,
        onTimeCount: 2n,
        completedCount: 3n,
      }])
      .mockResolvedValueOnce([{
        departmentName: '质量验证部',
        todoCount: 5n,
        overdueCount: 2n,
        completedCount: 4n,
        onTimeCount: 3n,
      }])
      .mockResolvedValueOnce([{ returnCount: 5n, averageReworkDays: 2 }])
      .mockResolvedValueOnce([{ reason: '色差超标', count: 3n }])
      .mockResolvedValueOnce([{
        currentMonthDue: 7n,
        completed: 4n,
        pending: 2n,
        overdue: 1n,
        allCompleted: 11n,
        allTasks: 15n,
      }])
      .mockResolvedValueOnce([{
        suggestedExit: 4n,
        exited: 3n,
        retained: 2n,
      }])
      .mockResolvedValueOnce([{ totalRecords: 9n, recordedCount: 7n }]);

    const result = await service.getOverview({
      id: 'viewer-1', authSource: 'local', teamAccessApproved: true,
      departmentId: 'department-1',
      isSystemAdmin: false,
      roleCodes: ['viewer'],
      permissionCodes: ['project.read'],
    } as never);

    expect(result.projectOverview).toEqual({
      totalProjects: 10,
      activeProjects: 6,
      completedProjects: 3,
      overdueProjects: 2,
      averageDevelopmentDays: 18,
    });
    expect(result.workflowEfficiency).toEqual(expect.objectContaining({
      onTimeCompletionRate: 75,
      totalOverdueTasks: 3,
    }));
    expect(result.workflowEfficiency.byNode).toHaveLength(Object.values(WorkflowNodeCode).length);
    expect(result.workflowEfficiency.byNode).toContainEqual(expect.objectContaining({
      nodeCode: WorkflowNodeCode.COLOR_NUMBERING,
      averageDays: 4,
      overdueCount: 1,
      onTimeRate: 67,
    }));
    expect(result.departmentAnalysis).toEqual([{
      departmentName: '质量验证部',
      todoCount: 5,
      overdueCount: 2,
      onTimeRate: 75,
    }]);
    expect(result.reworkAnalysis).toEqual({
      returnCount: 5,
      averageReworkDays: 2,
      reasonDistribution: [{ reason: '色差超标', count: 3 }],
    });
    expect(result.monthlyReviewAnalysis).toEqual({
      currentMonthDue: 7,
      completed: 4,
      pending: 2,
      overdue: 1,
      completionRate: 73,
    });
    expect(result.colorExitAnalysis).toEqual({
      suggestedExit: 4,
      exited: 3,
      retained: 2,
      pending: 1,
    });
    expect(result.feeAnalysis).toEqual({ fixedAmount: 10000, totalRecords: 9, recordedCount: 7 });

    expect(forbiddenFindMany).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(8);
    const statements = prisma.$queryRaw.mock.calls.map(([statement]) => statement as {
      strings?: readonly string[];
      values?: readonly unknown[];
    });
    const sql = statements.map((statement) => statement.strings?.join('') ?? '').join('\n');
    const values = statements.flatMap((statement) => [...(statement.values ?? [])]);
    expect(sql).toContain('WITH visible_projects AS MATERIALIZED');
    expect(sql).toContain('LIMIT 8');
    expect(sql).toContain('LIMIT 6');
    expect(sql).not.toMatch(/"projectId"\s+IN\s*\(/u);
    expect(sql).toContain('::"ProjectStatus"');
    expect(sql).toContain('::"WorkflowTaskStatus"');
    expect(sql).toContain('::"WorkflowAction"');
    expect(sql).toContain('::"ReviewResult"');
    expect(sql).toContain('::"RecurringTaskStatus"');
    expect(sql).toContain('::"ColorExitSuggestion"');
    expect(values).not.toContain('viewer-1');
    expect(values).not.toContain('department-1');
  });
});
