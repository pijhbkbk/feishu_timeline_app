import { Injectable } from '@nestjs/common';
import {
  ColorStatus,
  ProjectPriority,
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
import { getCurrentNodeName, WORKFLOW_NODE_META_MAP } from '../workflows/workflow-node.constants';
import {
  computeProjectRiskLevel,
  DASHBOARD_REVIEW_NODE_CODES,
  getOverdueDays,
} from './dashboard.rules';

type DashboardProjectVisibility = Prisma.ProjectWhereInput;

const ACTIVE_TASK_STATUSES = [
  WorkflowTaskStatus.PENDING,
  WorkflowTaskStatus.READY,
  WorkflowTaskStatus.IN_PROGRESS,
  WorkflowTaskStatus.RETURNED,
] as const;

const TIMELINE_NODE_CODES = Object.values(WorkflowNodeCode).sort(
  (left, right) =>
    WORKFLOW_NODE_META_MAP[left].sequence - WORKFLOW_NODE_META_MAP[right].sequence,
);

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(actor: AuthenticatedUser) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const visibleProjectWhere = this.buildVisibleProjectWhere(actor);
    const myTaskWhere = this.buildAssignedActiveTaskWhere(actor);

    const [
      projects,
      overdueTasks,
      currentMonthReviewTasks,
      activeColors,
      pendingColorExits,
    ] = await Promise.all([
      this.prisma.project.findMany({
        where: visibleProjectWhere,
        select: {
          id: true,
          status: true,
          updatedAt: true,
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
                in: [...ACTIVE_TASK_STATUSES],
              },
              nodeCode: {
                in: DASHBOARD_REVIEW_NODE_CODES,
              },
              project: {
                is: visibleProjectWhere,
              },
              OR: [
                {
                  dueAt: {
                    gte: monthStart,
                    lt: nextMonthStart,
                  },
                },
                {
                  dueAt: null,
                  createdAt: {
                    gte: monthStart,
                    lt: nextMonthStart,
                  },
                },
              ],
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
      this.prisma.workflowTask.count({
        where: {
          isActive: true,
          nodeCode: WorkflowNodeCode.PROJECT_CLOSED,
          status: {
            in: [...ACTIVE_TASK_STATUSES],
          },
          project: {
            is: visibleProjectWhere,
          },
        },
      }),
    ]);

    const projectIds = projects.map((project) => project.id);
    const effectiveMonthlyReviewPending =
      projectIds.length === 0
        ? 0
        : await this.prisma.recurringTask.count({
            where: {
              projectId: {
                in: projectIds,
              },
              status: {
                in: [RecurringTaskStatus.PENDING, RecurringTaskStatus.IN_PROGRESS, RecurringTaskStatus.OVERDUE],
              },
              plannedDate: {
                gte: monthStart,
                lt: nextMonthStart,
              },
            },
          });
    const lastDataUpdatedAt =
      projects.length > 0
        ? new Date(Math.max(...projects.map((project) => project.updatedAt.getTime())))
        : now;

    return {
      totalProjects: projects.length,
      activeProjects: projects.filter(
        (project) =>
          project.status !== ProjectStatus.COMPLETED &&
          project.status !== ProjectStatus.CANCELLED,
      ).length,
      overdueTasks,
      pendingReviews: currentMonthReviewTasks,
      currentMonthPendingReviews: currentMonthReviewTasks,
      monthlyColorReviewPending: effectiveMonthlyReviewPending,
      pendingColorExits,
      activeColors,
      completedProjects: projects.filter(
        (project) => project.status === ProjectStatus.COMPLETED,
      ).length,
      lastUpdatedAt: now.toISOString(),
      lastDataUpdatedAt: lastDataUpdatedAt.toISOString(),
    };
  }

  async getProjectTimelines(actor: AuthenticatedUser) {
    const now = new Date();
    const visibleProjectWhere = this.buildVisibleProjectWhere(actor);
    const projects = await this.prisma.project.findMany({
      where: visibleProjectWhere,
      include: {
        ownerUser: {
          select: {
            id: true,
            name: true,
            department: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        colors: {
          select: {
            id: true,
            code: true,
            name: true,
            isPrimary: true,
            status: true,
          },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        },
        workflowTasks: {
          include: {
            assigneeUser: {
              select: {
                id: true,
                name: true,
              },
            },
            assigneeDepartment: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: [{ createdAt: 'asc' }, { taskRound: 'asc' }],
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: 50,
    });

    const projectIds = projects.map((project) => project.id);
    const recurringPlans =
      projectIds.length === 0
        ? []
        : await this.prisma.recurringPlan.findMany({
            where: {
              projectId: {
                in: projectIds,
              },
              sourceNodeCode: WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW,
            },
            include: {
              tasks: {
                orderBy: {
                  periodIndex: 'asc',
                },
              },
            },
            orderBy: {
              createdAt: 'desc',
            },
          });

    const recurringPlanByProject = new Map<string, (typeof recurringPlans)[number]>();
    for (const plan of recurringPlans) {
      if (!recurringPlanByProject.has(plan.projectId)) {
        recurringPlanByProject.set(plan.projectId, plan);
      }
    }

    return {
      lastUpdatedAt: now.toISOString(),
      items: projects.map((project) =>
        this.toTimelineBoardProject(project, recurringPlanByProject.get(project.id) ?? null, now),
      ),
    };
  }

  async getMonthlyReviewBoard(actor: AuthenticatedUser) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const visibleProjectWhere = this.buildVisibleProjectWhere(actor);
    const projects = await this.prisma.project.findMany({
      where: visibleProjectWhere,
      select: {
        id: true,
        code: true,
        name: true,
        currentNodeCode: true,
        ownerUser: {
          select: {
            name: true,
          },
        },
        colors: {
          select: {
            name: true,
            isPrimary: true,
          },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        },
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: 50,
    });
    const projectIds = projects.map((project) => project.id);
    const plans =
      projectIds.length === 0
        ? []
        : await this.prisma.recurringPlan.findMany({
            where: {
              projectId: {
                in: projectIds,
              },
              sourceNodeCode: WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW,
            },
            include: {
              tasks: {
                orderBy: {
                  periodIndex: 'asc',
                },
              },
            },
            orderBy: {
              createdAt: 'desc',
            },
          });
    const projectById = new Map(projects.map((project) => [project.id, project]));
    const items = plans
      .filter((plan, index, allPlans) =>
        allPlans.findIndex((candidate) => candidate.projectId === plan.projectId) === index,
      )
      .map((plan) => {
        const project = projectById.get(plan.projectId);
        const currentMonthTask =
          plan.tasks.find(
            (task) =>
              task.plannedDate.getTime() >= monthStart.getTime() &&
              task.plannedDate.getTime() < nextMonthStart.getTime(),
          ) ?? null;

        return {
          projectId: plan.projectId,
          projectCode: project?.code ?? '',
          projectName: project?.name ?? '未知项目',
          colorName: project?.colors[0]?.name ?? '未关联颜色',
          ownerName: project?.ownerUser?.name ?? '未分配',
          currentNodeCode: project?.currentNodeCode ?? null,
          currentNodeName: getCurrentNodeName(project?.currentNodeCode) ?? '未开始',
          planId: plan.id,
          planCode: plan.planCode,
          totalPeriods: plan.totalCount,
          completedPeriods: plan.tasks.filter((task) => task.status === RecurringTaskStatus.COMPLETED).length,
          overduePeriods: plan.tasks.filter((task) => task.status === RecurringTaskStatus.OVERDUE).length,
          currentMonthTask: currentMonthTask ? this.toMonthlyBoardTask(currentMonthTask) : null,
          months: plan.tasks.map((task) => this.toMonthlyBoardTask(task)),
        };
      });

    return {
      lastUpdatedAt: now.toISOString(),
      summary: {
        projectCount: items.length,
        totalPeriods: items.reduce((sum, item) => sum + item.totalPeriods, 0),
        completedPeriods: items.reduce((sum, item) => sum + item.completedPeriods, 0),
        overduePeriods: items.reduce((sum, item) => sum + item.overduePeriods, 0),
        currentMonthPending: items.filter(
          (item) =>
            item.currentMonthTask &&
            item.currentMonthTask.status !== RecurringTaskStatus.COMPLETED &&
            item.currentMonthTask.status !== RecurringTaskStatus.CANCELLED,
        ).length,
      },
      items,
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
        in: [...ACTIVE_TASK_STATUSES],
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

  private toTimelineBoardProject(
    project: Prisma.ProjectGetPayload<{
      include: {
        ownerUser: {
          select: {
            id: true;
            name: true;
            department: {
              select: {
                id: true;
                name: true;
              };
            };
          };
        };
        colors: {
          select: {
            id: true;
            code: true;
            name: true;
            isPrimary: true;
            status: true;
          };
        };
        workflowTasks: {
          include: {
            assigneeUser: {
              select: {
                id: true;
                name: true;
              };
            };
            assigneeDepartment: {
              select: {
                id: true;
                name: true;
              };
            };
          };
        };
      };
    }>,
    recurringPlan: Prisma.RecurringPlanGetPayload<{
      include: {
        tasks: true;
      };
    }> | null,
    now: Date,
  ) {
    const latestTaskByNode = this.getLatestTaskByNode(project.workflowTasks);
    const activePrimaryTasks = project.workflowTasks
      .filter((task) => task.isActive && task.isPrimary)
      .sort(
        (left, right) =>
          WORKFLOW_NODE_META_MAP[left.nodeCode].sequence -
            WORKFLOW_NODE_META_MAP[right.nodeCode].sequence ||
          left.createdAt.getTime() - right.createdAt.getTime(),
      );
    const currentTask = activePrimaryTasks[0] ?? null;
    const activeTasks = project.workflowTasks.filter((task) => task.isActive);
    const overdueDays = Math.max(
      0,
      ...activeTasks.map((task) => getOverdueDays(task.dueAt, now)),
    );
    const nodes = TIMELINE_NODE_CODES.map((nodeCode) => {
      const task = latestTaskByNode.get(nodeCode) ?? null;
      const overdueForTask = task ? getOverdueDays(task.dueAt, now) : 0;

      return {
        stepNumber: WORKFLOW_NODE_META_MAP[nodeCode].sequence / 10,
        nodeCode,
        nodeName: WORKFLOW_NODE_META_MAP[nodeCode].name,
        taskId: task?.id ?? null,
        taskStatus: task?.status ?? null,
        timelineStatus: this.resolveTimelineNodeStatus(
          nodeCode,
          task,
          project.currentNodeCode,
          overdueForTask > 0,
        ),
        isOverdue: overdueForTask > 0,
        overdueDays: overdueForTask,
        assigneeName: task?.assigneeUser?.name ?? null,
        dueAt: task?.dueAt?.toISOString() ?? null,
        completedAt: task?.completedAt?.toISOString() ?? task?.reviewPassAt?.toISOString() ?? null,
      };
    });
    const completedNodeCount = nodes.filter((node) => node.timelineStatus === 'COMPLETED').length;
    const color = project.colors[0] ?? null;

    return {
      projectId: project.id,
      projectCode: project.code,
      projectName: project.name,
      colorName: color?.name ?? '未关联颜色',
      colorCode: color?.code ?? null,
      projectStatus: project.status,
      currentNodeCode: project.currentNodeCode,
      currentNodeName:
        currentTask?.nodeName ?? getCurrentNodeName(project.currentNodeCode) ?? '未开始',
      currentOwnerName:
        currentTask?.assigneeUser?.name ?? project.ownerUser?.name ?? '未分配',
      currentDepartmentName:
        currentTask?.assigneeDepartment?.name ?? project.ownerUser?.department?.name ?? null,
      deadline: currentTask?.dueAt?.toISOString() ?? project.plannedEndDate?.toISOString() ?? null,
      overdueDays,
      progressPercent: Math.round((completedNodeCount / TIMELINE_NODE_CODES.length) * 100),
      nextStep: this.getNextStep(project.status, currentTask, nodes),
      monthlyReview: recurringPlan
        ? {
            completedPeriods: recurringPlan.tasks.filter(
              (task) => task.status === RecurringTaskStatus.COMPLETED,
            ).length,
            totalPeriods: recurringPlan.totalCount,
            overduePeriods: recurringPlan.tasks.filter(
              (task) => task.status === RecurringTaskStatus.OVERDUE,
            ).length,
          }
        : null,
      updatedAt: project.updatedAt.toISOString(),
      nodes,
    };
  }

  private getLatestTaskByNode<
    T extends {
      nodeCode: WorkflowNodeCode;
      taskRound: number;
      createdAt: Date;
    },
  >(tasks: T[]) {
    const result = new Map<WorkflowNodeCode, T>();

    for (const task of tasks) {
      const current = result.get(task.nodeCode);

      if (
        !current ||
        task.taskRound > current.taskRound ||
        (task.taskRound === current.taskRound && task.createdAt > current.createdAt)
      ) {
        result.set(task.nodeCode, task);
      }
    }

    return result;
  }

  private resolveTimelineNodeStatus(
    nodeCode: WorkflowNodeCode,
    task:
      | {
          status: WorkflowTaskStatus;
          isActive: boolean;
        }
      | null,
    currentNodeCode: WorkflowNodeCode | null,
    isOverdue: boolean,
  ) {
    if (isOverdue) {
      return 'OVERDUE';
    }

    if (currentNodeCode === nodeCode && task?.isActive) {
      return 'CURRENT';
    }

    if (!task) {
      return 'NOT_STARTED';
    }

    if (task.status === WorkflowTaskStatus.APPROVED || task.status === WorkflowTaskStatus.COMPLETED) {
      return 'COMPLETED';
    }

    if (task.status === WorkflowTaskStatus.REJECTED || task.status === WorkflowTaskStatus.RETURNED) {
      return 'RETURNED';
    }

    if (task.status === WorkflowTaskStatus.IN_PROGRESS) {
      return 'IN_PROGRESS';
    }

    return 'PENDING';
  }

  private getNextStep(
    projectStatus: ProjectStatus,
    currentTask:
      | {
          nodeName: string;
          assigneeUser?: { name: string } | null;
        }
      | null,
    nodes: Array<{
      nodeName: string;
      timelineStatus: string;
    }>,
  ) {
    if (projectStatus === ProjectStatus.COMPLETED) {
      return '项目已完成，等待归档复盘';
    }

    if (projectStatus === ProjectStatus.CANCELLED) {
      return '项目已取消';
    }

    if (currentTask) {
      return `推进${currentTask.nodeName}`;
    }

    const nextNode = nodes.find((node) => node.timelineStatus !== 'COMPLETED');
    return nextNode ? `等待${nextNode.nodeName}` : '等待流程生成下一节点';
  }

  private toMonthlyBoardTask(task: {
    id: string;
    periodIndex: number;
    periodLabel: string;
    plannedDate: Date;
    dueAt: Date | null;
    completedAt: Date | null;
    status: RecurringTaskStatus;
    result: ReviewResult;
  }) {
    return {
      id: task.id,
      periodIndex: task.periodIndex,
      periodLabel: task.periodLabel,
      plannedDate: task.plannedDate.toISOString(),
      dueAt: task.dueAt?.toISOString() ?? null,
      completedAt: task.completedAt?.toISOString() ?? null,
      status: task.status,
      result: task.result,
    };
  }
}
