import { Injectable } from '@nestjs/common';
import {
  ColorStatus,
  ProjectPriority,
  ProjectStatus,
  ReviewResult,
  WorkflowAction,
  WorkflowNodeCode,
  WorkflowTaskStatus,
  type Prisma,
} from '@prisma/client';

import { PrismaService } from '../../infra/prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { getCurrentNodeName, WORKFLOW_NODE_META_MAP } from '../workflows/workflow-node.constants';
import {
  computeProjectRiskLevel,
  DASHBOARD_REVIEW_NODE_CODES,
  getOverdueDays,
} from './dashboard.rules';

type DashboardProjectVisibility = Prisma.ProjectWhereInput;

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(actor: AuthenticatedUser) {
    const now = new Date();
    const visibleProjectWhere = this.buildVisibleProjectWhere(actor);
    const myTaskWhere = this.buildAssignedActiveTaskWhere(actor);

    const [projects, overdueTasks, activeReviewTasks, activeColors] = await Promise.all([
      this.prisma.project.findMany({
        where: visibleProjectWhere,
        select: {
          status: true,
        },
      }),
      this.prisma.workflowTask.count({
        where: {
          ...myTaskWhere,
          dueAt: {
            lt: now,
          },
        },
      }),
      this.canUserReview(actor)
        ? this.prisma.workflowTask.count({
            where: {
              isActive: true,
              status: {
                in: [
                  WorkflowTaskStatus.PENDING,
                  WorkflowTaskStatus.READY,
                  WorkflowTaskStatus.IN_PROGRESS,
                  WorkflowTaskStatus.RETURNED,
                ],
              },
              nodeCode: {
                in: DASHBOARD_REVIEW_NODE_CODES,
              },
              project: {
                is: visibleProjectWhere,
              },
            },
          })
        : Promise.resolve(0),
      this.prisma.color.count({
        where: {
          project: {
            is: visibleProjectWhere,
          },
          status: {
            not: ColorStatus.EXITED,
          },
        },
      }),
    ]);

    return {
      totalProjects: projects.length,
      activeProjects: projects.filter(
        (project) =>
          project.status !== ProjectStatus.COMPLETED &&
          project.status !== ProjectStatus.CANCELLED,
      ).length,
      overdueTasks,
      pendingReviews: activeReviewTasks,
      activeColors,
      completedProjects: projects.filter(
        (project) => project.status === ProjectStatus.COMPLETED,
      ).length,
    };
  }

  async getStageDistribution(actor: AuthenticatedUser) {
    const projects = await this.prisma.project.findMany({
      where: {
        ...this.buildVisibleProjectWhere(actor),
        currentNodeCode: {
          not: null,
        },
      },
      select: {
        currentNodeCode: true,
      },
    });

    const counter = new Map<WorkflowNodeCode, number>();

    for (const project of projects) {
      if (!project.currentNodeCode) {
        continue;
      }

      counter.set(project.currentNodeCode, (counter.get(project.currentNodeCode) ?? 0) + 1);
    }

    return [...counter.entries()]
      .sort(
        (left, right) =>
          WORKFLOW_NODE_META_MAP[left[0]].sequence - WORKFLOW_NODE_META_MAP[right[0]].sequence,
      )
      .map(([nodeCode, count]) => ({
        nodeCode,
        nodeName: getCurrentNodeName(nodeCode) ?? nodeCode,
        count,
      }));
  }

  async getRecentReviews(actor: AuthenticatedUser) {
    const reviews = await this.prisma.reviewRecord.findMany({
      where: {
        project: {
          is: this.buildVisibleProjectWhere(actor),
        },
        result: {
          in: [
            ReviewResult.APPROVED,
            ReviewResult.CONDITIONAL_APPROVED,
            ReviewResult.REJECTED,
          ],
        },
        reviewedAt: {
          not: null,
        },
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
          },
        },
        reviewer: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        reviewedAt: 'desc',
      },
      take: 8,
    });

    return reviews.map((review) => ({
      id: review.id,
      reviewType: review.reviewType,
      projectId: review.projectId,
      projectName: review.project.name,
      reviewerName: review.reviewer?.name ?? '未指定',
      reviewDate: review.reviewedAt?.toISOString() ?? null,
      conclusion: review.result,
    }));
  }

  async getRiskProjects(actor: AuthenticatedUser) {
    const now = new Date();
    const projects = await this.prisma.project.findMany({
      where: {
        ...this.buildVisibleProjectWhere(actor),
        status: {
          notIn: [ProjectStatus.COMPLETED, ProjectStatus.CANCELLED],
        },
      },
      include: {
        ownerUser: {
          select: {
            name: true,
          },
        },
        workflowTasks: {
          where: {
            isActive: true,
            status: {
              in: [
                WorkflowTaskStatus.PENDING,
                WorkflowTaskStatus.READY,
                WorkflowTaskStatus.IN_PROGRESS,
                WorkflowTaskStatus.RETURNED,
              ],
            },
          },
          select: {
            dueAt: true,
            isActive: true,
            status: true,
          },
        },
        workflowTransitions: {
          where: {
            action: WorkflowAction.RETURN,
          },
          select: {
            id: true,
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
      take: 50,
    });

    return projects
      .map((project) => {
        const overdueDays = Math.max(
          0,
          ...project.workflowTasks.map((task) => getOverdueDays(task.dueAt, now)),
        );
        const riskLevel = computeProjectRiskLevel(
          {
            status: project.status,
            priority: project.priority,
            plannedEndDate: project.plannedEndDate,
            maxOverdueDays: overdueDays,
            returnCount: project.workflowTransitions.length,
          },
          now,
        );

        return {
          projectId: project.id,
          projectName: project.name,
          riskLevel,
          currentNodeCode: project.currentNodeCode,
          currentNodeName: getCurrentNodeName(project.currentNodeCode) ?? '未开始',
          overdueDays,
          ownerName: project.ownerUser?.name ?? '未分配',
        };
      })
      .filter(
        (item) =>
          item.overdueDays > 0 ||
          item.riskLevel === ProjectPriority.HIGH ||
          item.riskLevel === ProjectPriority.CRITICAL,
      )
      .sort((left, right) => {
        if (left.overdueDays !== right.overdueDays) {
          return right.overdueDays - left.overdueDays;
        }

        return this.getRiskWeight(right.riskLevel) - this.getRiskWeight(left.riskLevel);
      })
      .slice(0, 10);
  }

  private buildVisibleProjectWhere(actor: AuthenticatedUser): DashboardProjectVisibility {
    if (actor.isSystemAdmin || actor.roleCodes.includes('admin')) {
      return {};
    }

    return {
      OR: [
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
      ],
    };
  }

  private buildAssignedActiveTaskWhere(actor: AuthenticatedUser): Prisma.WorkflowTaskWhereInput {
    return {
      isActive: true,
      status: {
        in: [
          WorkflowTaskStatus.PENDING,
          WorkflowTaskStatus.READY,
          WorkflowTaskStatus.IN_PROGRESS,
          WorkflowTaskStatus.RETURNED,
        ],
      },
      assigneeUserId: actor.id,
    };
  }

  private canUserReview(actor: AuthenticatedUser) {
    if (actor.isSystemAdmin || actor.roleCodes.includes('admin')) {
      return true;
    }

    return (
      actor.roleCodes.includes('project_manager') ||
      actor.roleCodes.includes('reviewer') ||
      actor.roleCodes.includes('quality_engineer')
    );
  }

  private getRiskWeight(priority: ProjectPriority) {
    switch (priority) {
      case ProjectPriority.CRITICAL:
        return 4;
      case ProjectPriority.HIGH:
        return 3;
      case ProjectPriority.MEDIUM:
        return 2;
      case ProjectPriority.LOW:
      default:
        return 1;
    }
  }
}
