import { requireActiveMonthlyPlan } from '../../common/monthly-review-plan';
import { ConflictException, Injectable } from '@nestjs/common';
import {
  RecurringPlanStatus,
  RecurringTaskStatus,
  WorkflowNodeCode,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { resolveTeamAssignment } from '../personnel/team-assignment';
import { PrismaService } from '../../infra/prisma/prisma.service';
import {
  addUtcMonthsClamped,
  endOfUtcDay,
  startOfUtcDay,
} from './workflow-date.utils';

type WorkflowDbClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class WorkflowRecurringService {
  async ensureMonthlyReviewPlan(
    db: WorkflowDbClient,
    input: {
      projectId: string;
      sourceWorkflowTaskId: string;
      startAt: Date;
      reviewerId?: string | null;
    },
  ) {
    await db.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${'team-monthly-plan'}), hashtext(${input.projectId}))`);
    const plans = await db.recurringPlan.findMany({
      where: { projectId: input.projectId, sourceNodeCode: WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW },
      take: 2, orderBy: { createdAt: 'asc' },
    });
    if (plans.length > 1) throw new ConflictException('此项目存在多个历史月度计划，须核实后再继续，不能自动合并。');
    const existingPlan = plans[0];

    if (existingPlan) {
      await requireActiveMonthlyPlan(db, input.projectId, existingPlan.id);
      const existingTaskCount = await db.recurringTask.count({
        where: {
          recurringPlanId: existingPlan.id,
        },
      });

      if (existingPlan.status !== RecurringPlanStatus.ACTIVE || existingPlan.totalCount !== 12 || existingTaskCount !== 12) {
        throw new ConflictException('历史月度计划已停止或月份不完整，请核对后再继续。');
      }
      return {
        plan: existingPlan,
        generatedTaskCount: existingTaskCount,
        plannedDates: [],
      };
    }

    const totalCount = 12;
    const assignment = await resolveTeamAssignment(db, WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW);
    const startDate = startOfUtcDay(input.startAt);
    const monthlyTasks = this.buildMonthlyTasks(startDate, totalCount);
    const endDate = monthlyTasks.at(-1)?.plannedDate ?? startDate;

    const plan = await db.recurringPlan.create({
      data: {
        projectId: input.projectId,
        sourceWorkflowTaskId: input.sourceWorkflowTaskId,
        sourceNodeCode: WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW,
        planCode: this.buildPlanCode(),
        frequency: 'MONTHLY',
        totalCount,
        generatedCount: monthlyTasks.length,
        startDate,
        endDate,
        status: RecurringPlanStatus.ACTIVE,
        metadata: {
          autoCreated: true,
          sourceNodeCode: WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW,
        },
      },
    });

    await db.recurringTask.createMany({
      data: monthlyTasks.map((task) => ({
        recurringPlanId: plan.id,
        projectId: input.projectId,
        taskCode: task.taskCode,
        periodIndex: task.periodIndex,
        periodLabel: task.periodLabel,
        plannedDate: task.plannedDate,
        dueAt: task.dueAt,
        reviewerId: assignment.assigneeUserId,
        requiredRoleCode: assignment.requiredRoleCode,
        status: RecurringTaskStatus.PENDING,
        payload: {
          sourceWorkflowTaskId: input.sourceWorkflowTaskId,
          nodeCode: WorkflowNodeCode.VISUAL_COLOR_DIFFERENCE_REVIEW,
        },
      })),
    });

    return {
      plan,
      generatedTaskCount: monthlyTasks.length,
      plannedDates: monthlyTasks.map((task) => task.plannedDate),
    };
  }

  buildMonthlyTasks(startDate: Date, totalCount: number) {
    return Array.from({ length: totalCount }, (_, index) => {
      const periodIndex = index + 1;
      const plannedDate = addUtcMonthsClamped(startDate, periodIndex);
      const year = plannedDate.getUTCFullYear();
      const month = String(plannedDate.getUTCMonth() + 1).padStart(2, '0');

      return {
        periodIndex,
        periodLabel: `${year}-${month}`,
        plannedDate,
        dueAt: endOfUtcDay(plannedDate),
        taskCode: `MONTHLY-REVIEW-${year}${month}-${String(periodIndex).padStart(2, '0')}-${randomUUID().slice(0, 6).toUpperCase()}`,
      };
    });
  }

  private buildPlanCode() {
    return `RPLAN-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }
}
