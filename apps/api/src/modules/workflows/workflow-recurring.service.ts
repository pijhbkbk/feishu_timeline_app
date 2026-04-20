import { Injectable } from '@nestjs/common';
import {
  RecurringPlanStatus,
  RecurringTaskStatus,
  SystemParameterValueType,
  WorkflowNodeCode,
  type Prisma,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';

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
    const existingPlan = await db.recurringPlan.findFirst({
      where: {
        sourceWorkflowTaskId: input.sourceWorkflowTaskId,
      },
    });

    if (existingPlan) {
      const existingTaskCount = await db.recurringTask.count({
        where: {
          recurringPlanId: existingPlan.id,
        },
      });

      return {
        plan: existingPlan,
        generatedTaskCount: existingTaskCount,
        plannedDates: [],
      };
    }

    const totalCount = await this.getMonthlyReviewTotalCount(db);
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
        reviewerId: input.reviewerId ?? null,
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

  private async getMonthlyReviewTotalCount(db: WorkflowDbClient) {
    const parameter = await db.systemParameter.findUnique({
      where: {
        category_code: {
          category: 'WORKFLOW',
          code: 'MONTHLY_REVIEW_TOTAL_COUNT',
        },
      },
      select: {
        valueType: true,
        valueNumber: true,
      },
    });

    if (
      parameter?.valueType === SystemParameterValueType.NUMBER &&
      parameter.valueNumber
    ) {
      return Number(parameter.valueNumber);
    }

    return 12;
  }

  private buildPlanCode() {
    return `RPLAN-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }
}
