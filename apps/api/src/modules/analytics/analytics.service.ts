import { Injectable } from '@nestjs/common';
import {
  ColorExitSuggestion,
  ProjectStatus,
  RecurringTaskStatus,
  ReviewResult,
  WorkflowAction,
  WorkflowNodeCode,
  WorkflowTaskStatus,
  type Prisma,
} from '@prisma/client';

import { PrismaService } from '../../infra/prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { WORKFLOW_NODE_META_MAP } from '../workflows/workflow-node.constants';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const COMPLETED_TASK_STATUSES: WorkflowTaskStatus[] = [
  WorkflowTaskStatus.APPROVED,
  WorkflowTaskStatus.COMPLETED,
];

const PENDING_RECURRING_TASK_STATUSES: RecurringTaskStatus[] = [
  RecurringTaskStatus.PENDING,
  RecurringTaskStatus.IN_PROGRESS,
];

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(actor: AuthenticatedUser) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const visibleProjectWhere = this.buildVisibleProjectWhere(actor);

    const projects = await this.prisma.project.findMany({
      where: visibleProjectWhere,
      select: {
        id: true,
        status: true,
        createdAt: true,
        plannedStartDate: true,
        actualStartDate: true,
        actualEndDate: true,
        closedAt: true,
      },
    });
    const projectIds = projects.map((project) => project.id);
    const projectIdWhere = { in: projectIds };

    const [
      tasks,
      reviewReturns,
      rejectedReviews,
      recurringTasks,
      colorExits,
      developmentFees,
    ] = await Promise.all([
      this.prisma.workflowTask.findMany({
        where: {
          projectId: projectIdWhere,
        },
        include: {
          assigneeDepartment: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      this.prisma.workflowTransition.findMany({
        where: {
          action: WorkflowAction.RETURN,
          projectId: projectIdWhere,
        },
        select: {
          id: true,
          comment: true,
          createdAt: true,
        },
      }),
      this.prisma.reviewRecord.findMany({
        where: {
          projectId: projectIdWhere,
          result: ReviewResult.REJECTED,
        },
        select: {
          id: true,
          rejectReason: true,
          createdAt: true,
        },
      }),
      this.prisma.recurringTask.findMany({
        where: {
          projectId: projectIdWhere,
        },
      }),
      this.prisma.colorExit.findMany({
        where: {
          projectId: projectIdWhere,
        },
      }),
      this.prisma.developmentFee.findMany({
        where: {
          projectId: projectIdWhere,
        },
      }),
    ]);

    const completedProjects = projects.filter(
      (project) => project.status === ProjectStatus.COMPLETED,
    );
    const activeProjects = projects.filter(
      (project) =>
        project.status !== ProjectStatus.COMPLETED &&
        project.status !== ProjectStatus.CANCELLED,
    );
    const overdueProjectIds = new Set(
      tasks.filter((task) => this.isTaskOverdue(task, now)).map((task) => task.projectId),
    );
    const completedTaskCount = tasks.filter((task) =>
      COMPLETED_TASK_STATUSES.includes(task.status),
    ).length;
    const onTimeCompletedTaskCount = tasks.filter((task) => this.isTaskCompletedOnTime(task)).length;
    const monthlyTasks = recurringTasks.filter(
      (task) =>
        task.plannedDate.getTime() >= monthStart.getTime() &&
        task.plannedDate.getTime() < nextMonthStart.getTime(),
    );
    const monthlyCompleted = monthlyTasks.filter(
      (task) => task.status === RecurringTaskStatus.COMPLETED,
    ).length;
    const allMonthlyCompleted = recurringTasks.filter(
      (task) => task.status === RecurringTaskStatus.COMPLETED,
    ).length;
    const exitSuggestedCount = colorExits.filter(
      (record) => record.systemSuggestion === ColorExitSuggestion.EXIT,
    ).length;
    const exitedCount = colorExits.filter(
      (record) => record.finalDecision === ColorExitSuggestion.EXIT || record.completedAt,
    ).length;

    return {
      lastUpdatedAt: now.toISOString(),
      projectOverview: {
        totalProjects: projects.length,
        activeProjects: activeProjects.length,
        completedProjects: completedProjects.length,
        overdueProjects: overdueProjectIds.size,
        averageDevelopmentDays: this.averageProjectCycleDays(completedProjects),
      },
      workflowEfficiency: {
        onTimeCompletionRate: this.percent(onTimeCompletedTaskCount, completedTaskCount),
        totalOverdueTasks: tasks.filter((task) => this.isTaskOverdue(task, now)).length,
        byNode: this.buildNodeEfficiency(tasks, now),
      },
      departmentAnalysis: this.buildDepartmentAnalysis(tasks, now),
      reworkAnalysis: {
        returnCount: reviewReturns.length + rejectedReviews.length,
        averageReworkDays: this.averageReworkDays(reviewReturns),
        reasonDistribution: this.buildReasonDistribution(reviewReturns, rejectedReviews),
      },
      monthlyReviewAnalysis: {
        currentMonthDue: monthlyTasks.length,
        completed: monthlyCompleted,
        pending: monthlyTasks.filter((task) =>
          PENDING_RECURRING_TASK_STATUSES.includes(task.status),
        ).length,
        overdue: monthlyTasks.filter((task) => task.status === RecurringTaskStatus.OVERDUE).length,
        completionRate: this.percent(allMonthlyCompleted, recurringTasks.length),
      },
      colorExitAnalysis: {
        suggestedExit: exitSuggestedCount,
        exited: exitedCount,
        retained: colorExits.filter(
          (record) => record.finalDecision === ColorExitSuggestion.RETAIN,
        ).length,
        pending: Math.max(0, exitSuggestedCount - exitedCount),
      },
      feeAnalysis: {
        fixedAmount: 10000,
        totalRecords: developmentFees.length,
        recordedCount: developmentFees.filter((fee) => fee.recordedAt).length,
      },
    };
  }

  private buildVisibleProjectWhere(actor: AuthenticatedUser): Prisma.ProjectWhereInput {
    if (actor.isSystemAdmin || actor.roleCodes.includes('admin')) {
      return {};
    }

    const scopeWhere: Prisma.ProjectWhereInput[] = [
      { ownerUserId: actor.id },
      {
        members: {
          some: {
            userId: actor.id,
          },
        },
      },
      {
        workflowTasks: {
          some: {
            assigneeUserId: actor.id,
          },
        },
      },
    ];

    if (actor.departmentId) {
      scopeWhere.push({ owningDepartmentId: actor.departmentId });
    }

    return {
      OR: scopeWhere,
    };
  }

  private buildNodeEfficiency(
    tasks: Array<{
      nodeCode: WorkflowNodeCode;
      createdAt: Date;
      startedAt: Date | null;
      completedAt: Date | null;
      reviewPassAt: Date | null;
      dueAt: Date | null;
      status: WorkflowTaskStatus;
    }>,
    now: Date,
  ) {
    return Object.values(WorkflowNodeCode)
      .sort(
        (left, right) =>
          WORKFLOW_NODE_META_MAP[left].sequence - WORKFLOW_NODE_META_MAP[right].sequence,
      )
      .map((nodeCode) => {
        const nodeTasks = tasks.filter((task) => task.nodeCode === nodeCode);
        const completedDurations = nodeTasks
          .map((task) => {
            const actualAt = this.getTaskActualAt(task);
            return actualAt
              ? this.daysBetween(task.startedAt ?? task.createdAt, actualAt)
              : null;
          })
          .filter((value): value is number => value !== null);

        return {
          nodeCode,
          nodeName: WORKFLOW_NODE_META_MAP[nodeCode].name,
          averageDays: this.average(completedDurations),
          overdueCount: nodeTasks.filter((task) => this.isTaskOverdue(task, now)).length,
          onTimeRate: this.percent(
            nodeTasks.filter((task) => this.isTaskCompletedOnTime(task)).length,
            nodeTasks.filter((task) => COMPLETED_TASK_STATUSES.includes(task.status)).length,
          ),
        };
      });
  }

  private buildDepartmentAnalysis(
    tasks: Array<{
      status: WorkflowTaskStatus;
      dueAt: Date | null;
      completedAt: Date | null;
      reviewPassAt: Date | null;
      assigneeDepartment: { id: string; name: string } | null;
    }>,
    now: Date,
  ) {
    const groups = new Map<
      string,
      {
        departmentName: string;
        todoCount: number;
        overdueCount: number;
        completedCount: number;
        onTimeCount: number;
      }
    >();

    for (const task of tasks) {
      const key = task.assigneeDepartment?.id ?? 'unassigned';
      const group = groups.get(key) ?? {
        departmentName: task.assigneeDepartment?.name ?? '未分配部门',
        todoCount: 0,
        overdueCount: 0,
        completedCount: 0,
        onTimeCount: 0,
      };

      if (
        !COMPLETED_TASK_STATUSES.includes(task.status) &&
        task.status !== WorkflowTaskStatus.CANCELLED
      ) {
        group.todoCount += 1;
      }

      if (this.isTaskOverdue(task, now)) {
        group.overdueCount += 1;
      }

      if (COMPLETED_TASK_STATUSES.includes(task.status)) {
        group.completedCount += 1;
      }

      if (this.isTaskCompletedOnTime(task)) {
        group.onTimeCount += 1;
      }

      groups.set(key, group);
    }

    return [...groups.values()]
      .map((group) => ({
        departmentName: group.departmentName,
        todoCount: group.todoCount,
        overdueCount: group.overdueCount,
        onTimeRate: this.percent(group.onTimeCount, group.completedCount),
      }))
      .sort((left, right) => right.overdueCount - left.overdueCount)
      .slice(0, 8);
  }

  private buildReasonDistribution(
    returns: Array<{ comment: string | null }>,
    rejectedReviews: Array<{ rejectReason: string | null }>,
  ) {
    const reasons = [
      ...returns.map((entry) => entry.comment ?? '流程退回'),
      ...rejectedReviews.map((entry) => entry.rejectReason ?? '评审不通过'),
    ];
    const counter = new Map<string, number>();

    for (const reason of reasons) {
      const normalized = reason.trim().slice(0, 24) || '未填写原因';
      counter.set(normalized, (counter.get(normalized) ?? 0) + 1);
    }

    return [...counter.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 6);
  }

  private averageProjectCycleDays(
    projects: Array<{
      createdAt: Date;
      plannedStartDate: Date | null;
      actualStartDate: Date | null;
      actualEndDate: Date | null;
      closedAt: Date | null;
    }>,
  ) {
    return this.average(
      projects
        .map((project) => {
          const startAt = project.actualStartDate ?? project.plannedStartDate ?? project.createdAt;
          const endAt = project.actualEndDate ?? project.closedAt;
          return endAt ? this.daysBetween(startAt, endAt) : null;
        })
        .filter((value): value is number => value !== null),
    );
  }

  private averageReworkDays(returns: Array<{ createdAt: Date }>) {
    if (returns.length < 2) {
      return 0;
    }

    const sorted = [...returns].sort(
      (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
    );
    const durations = sorted
      .slice(1)
      .map((entry, index) => this.daysBetween(sorted[index]!.createdAt, entry.createdAt));
    return this.average(durations);
  }

  private isTaskOverdue(
    task: {
      status: WorkflowTaskStatus;
      dueAt: Date | null;
      completedAt?: Date | null;
      reviewPassAt?: Date | null;
    },
    now: Date,
  ) {
    if (!task.dueAt || task.status === WorkflowTaskStatus.CANCELLED) {
      return false;
    }

    const actualAt = this.getTaskActualAt(task);
    if (actualAt) {
      return actualAt.getTime() > task.dueAt.getTime();
    }

    return task.dueAt.getTime() < now.getTime();
  }

  private isTaskCompletedOnTime(task: {
    status: WorkflowTaskStatus;
    dueAt: Date | null;
    completedAt?: Date | null;
    reviewPassAt?: Date | null;
  }) {
    if (!COMPLETED_TASK_STATUSES.includes(task.status) || !task.dueAt) {
      return false;
    }

    const actualAt = this.getTaskActualAt(task);
    return actualAt ? actualAt.getTime() <= task.dueAt.getTime() : false;
  }

  private getTaskActualAt(task: {
    completedAt?: Date | null;
    reviewPassAt?: Date | null;
  }) {
    return task.completedAt ?? task.reviewPassAt ?? null;
  }

  private daysBetween(startAt: Date, endAt: Date) {
    return Math.max(1, Math.round((endAt.getTime() - startAt.getTime()) / MS_PER_DAY));
  }

  private average(values: number[]) {
    if (values.length === 0) {
      return 0;
    }

    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  }

  private percent(numerator: number, denominator: number) {
    if (denominator <= 0) {
      return 0;
    }

    return Math.round((numerator / denominator) * 100);
  }
}
