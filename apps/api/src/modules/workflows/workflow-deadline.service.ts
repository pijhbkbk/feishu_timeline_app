import { BusinessClock } from '../../common/business-clock';
import { businessCalendarDate, businessCalendarDayEnd, businessDayDifference, businessDayRange, businessMonthRange } from '../../common/business-date';
import { Injectable } from '@nestjs/common';
import {
  WorkflowDurationType,
  WorkflowNodeCode,
  type Prisma,
} from '@prisma/client';

import { PrismaService } from '../../infra/prisma/prisma.service';
import { getCurrentNodeName } from './workflow-node.constants';
import { loadPerformanceArrivalAnchor, readPerformanceArrivalAnchor } from './performance-arrival-anchor';
import {
  addUtcDays,
  addUtcMonthsClamped,
  startOfUtcDay,
} from './workflow-date.utils';

type WorkflowDbClient = Prisma.TransactionClient | PrismaService;

export type WorkflowRuntimeNodeDefinition = {
  nodeCode: WorkflowNodeCode;
  nodeName: string;
  stepCode: string | null;
  durationType: WorkflowDurationType | null;
  durationValue: number | null;
  allowManualDueAt: boolean;
  defaultChargeAmount: string | null;
};

@Injectable()
export class WorkflowDeadlineService {
  constructor(private readonly businessClock: BusinessClock = new BusinessClock()) {}

  async getNodeRuntimeDefinition(
    db: WorkflowDbClient,
    nodeCode: WorkflowNodeCode,
  ): Promise<WorkflowRuntimeNodeDefinition> {
    const definition = await db.workflowNodeDefinition.findUnique({
      where: { nodeCode },
      select: {
        nodeCode: true,
        name: true,
        stepCode: true,
        durationType: true,
        durationValue: true,
        allowManualDueAt: true,
        defaultChargeAmount: true,
      },
    });

    return {
      nodeCode,
      nodeName: definition?.name ?? getCurrentNodeName(nodeCode) ?? nodeCode,
      stepCode: definition?.stepCode ?? null,
      durationType: definition?.durationType ?? null,
      durationValue: definition?.durationValue ?? null,
      allowManualDueAt: definition?.allowManualDueAt ?? false,
      defaultChargeAmount: definition?.defaultChargeAmount?.toString() ?? null,
    };
  }

  async buildTaskSchedule(
    db: WorkflowDbClient,
    input: {
      nodeCode: WorkflowNodeCode;
      startAt: Date;
      manualDueAt?: Date | null;
    },
  ) {
    const definition = await this.getNodeRuntimeDefinition(db, input.nodeCode);
    const dueAt =
      input.manualDueAt ??
      (await this.calculateDueAt(db, definition, input.startAt));
    const effectiveDueAt = input.manualDueAt ?? dueAt;

    return {
      stepCode: definition.stepCode,
      dueAt,
      effectiveDueAt,
      defaultChargeAmount: definition.defaultChargeAmount,
    };
  }

  async refreshWorkflowInstanceTaskDeadlines(
    db: WorkflowDbClient,
    workflowInstanceId: string,
    now = this.businessClock.now(),
  ) {
    const tasks = await db.workflowTask.findMany({
      where: {
        workflowInstanceId,
        isActive: true,
      },
      select: {
        id: true,
        dueAt: true,
        effectiveDueAt: true,
        manualDueAt: true,
        overdueDays: true,
        nodeCode: true,
      },
    });

    let updatedCount = 0;

    for (const task of tasks) {
      const effectiveDueAt = task.manualDueAt ?? task.effectiveDueAt ?? task.dueAt;
      const anchor = task.nodeCode === WorkflowNodeCode.PERFORMANCE_TEST
        ? await loadPerformanceArrivalAnchor(db, task.id) : null;
      const overdueDays = this.getOverdueDays(effectiveDueAt, now, {
        nodeCode: task.nodeCode, payload: anchor ? { performanceArrivalAnchor: anchor } : null,
      });

      if (
        task.effectiveDueAt?.getTime() === effectiveDueAt?.getTime() &&
        task.overdueDays === overdueDays
      ) {
        continue;
      }

      await db.workflowTask.update({
        where: { id: task.id },
        data: {
          effectiveDueAt,
          overdueDays,
        },
      });
      updatedCount += 1;
    }

    return {
      scanned: tasks.length,
      updated: updatedCount,
    };
  }

  getOverdueDays(dueAt: Date | null, now = this.businessClock.now(), task?: {
    nodeCode?: WorkflowNodeCode; payload?: Prisma.JsonValue | null;
  }) {
    if (!dueAt) {
      return 0;
    }

    // Preserve the source-bound exact deadline while counting Beijing calendar days.
    if (task?.nodeCode === WorkflowNodeCode.PERFORMANCE_TEST && readPerformanceArrivalAnchor(task.payload)) {
      if (now.getTime() <= dueAt.getTime()) return 0;
      return Math.max(1, businessDayDifference(now, dueAt));
    }
    const dueBoundary = new Date(businessDayRange(dueAt).end.getTime() - 1);
    if (now.getTime() <= dueBoundary.getTime()) {
      return 0;
    }

    return Math.max(1, businessDayDifference(now, dueAt));
  }

  async calculateDueAt(
    db: WorkflowDbClient,
    definition: WorkflowRuntimeNodeDefinition,
    startAt: Date,
  ) {
    switch (definition.durationType) {
      case WorkflowDurationType.WORKDAY:
        return this.addWorkdays(db, startAt, definition.durationValue ?? 0);
      case WorkflowDurationType.SAME_DAY:
        return businessCalendarDayEnd(businessCalendarDate(startAt));
      case WorkflowDurationType.MONTH_END:
        return new Date(businessMonthRange(startAt).end.getTime() - 1);
      case WorkflowDurationType.MONTH_OFFSET:
        return businessCalendarDayEnd(addUtcMonthsClamped(businessCalendarDate(startAt), definition.durationValue ?? 0));
      case WorkflowDurationType.MANUAL_REVIEW_PASS:
        return this.addWorkdays(db, startAt, definition.durationValue ?? 2);
      case WorkflowDurationType.RECURRING_MONTHLY:
        return null;
      default:
        return null;
    }
  }

  private async addWorkdays(
    db: WorkflowDbClient,
    startAt: Date,
    durationValue: number,
  ) {
    if (durationValue <= 0) {
      return businessCalendarDayEnd(businessCalendarDate(startAt));
    }

    const startDate = businessCalendarDate(startAt);
    const fallbackWindowEnd = addUtcDays(startDate, Math.max(durationValue * 5, 90));
    const calendarEntries = await db.workCalendar.findMany({
      where: {
        calendarDate: {
          gt: startDate,
          lte: fallbackWindowEnd,
        },
      },
      orderBy: {
        calendarDate: 'asc',
      },
      select: {
        calendarDate: true,
        isWorkday: true,
      },
    });

    let matched = 0;
    let cursor = startDate;
    let calendarIndex = 0;

    while (matched < durationValue) {
      cursor = addUtcDays(cursor, 1);

      let isWorkday: boolean;
      const calendarEntry = calendarEntries[calendarIndex];
      if (
        calendarEntry &&
        startOfUtcDay(calendarEntry.calendarDate).getTime() === cursor.getTime()
      ) {
        isWorkday = calendarEntry.isWorkday;
        calendarIndex += 1;
      } else {
        const weekDay = cursor.getUTCDay();
        isWorkday = weekDay !== 0 && weekDay !== 6;
      }

      if (isWorkday) {
        matched += 1;
      }
    }

    return businessCalendarDayEnd(cursor);
  }
}
