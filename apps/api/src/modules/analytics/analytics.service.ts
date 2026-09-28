import { teamProjectScope } from '../../common/team-authorization';
import { Injectable } from '@nestjs/common';
import {
  ColorExitSuggestion,
  ProjectStatus,
  RecurringTaskStatus,
  ReviewResult,
  WorkflowAction,
  WorkflowNodeCode,
  WorkflowTaskStatus,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../../infra/prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { WORKFLOW_NODE_META_MAP } from '../workflows/workflow-node.constants';

const COMPLETED_TASK_STATUSES: WorkflowTaskStatus[] = [
  WorkflowTaskStatus.APPROVED,
  WorkflowTaskStatus.COMPLETED,
];

const PENDING_RECURRING_TASK_STATUSES: RecurringTaskStatus[] = [
  RecurringTaskStatus.PENDING,
  RecurringTaskStatus.IN_PROGRESS,
];

type AggregateNumber = bigint | number;

type OverviewSummaryRow = {
  totalProjects: AggregateNumber;
  activeProjects: AggregateNumber;
  completedProjects: AggregateNumber;
  overdueProjects: AggregateNumber;
  averageDevelopmentDays: number;
  completedTaskCount: AggregateNumber;
  onTimeCompletedTaskCount: AggregateNumber;
  totalOverdueTasks: AggregateNumber;
};

type NodeEfficiencyRow = {
  nodeCode: WorkflowNodeCode;
  averageDays: number;
  overdueCount: AggregateNumber;
  onTimeCount: AggregateNumber;
  completedCount: AggregateNumber;
};

type DepartmentEfficiencyRow = {
  departmentName: string;
  todoCount: AggregateNumber;
  overdueCount: AggregateNumber;
  completedCount: AggregateNumber;
  onTimeCount: AggregateNumber;
};

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(actor: AuthenticatedUser) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const visibleProjectSql = this.buildVisibleProjectSql(actor);
    const completedTaskStatuses = COMPLETED_TASK_STATUSES.map(
      (status) => Prisma.sql`${status}::"WorkflowTaskStatus"`,
    );
    const pendingRecurringTaskStatuses = PENDING_RECURRING_TASK_STATUSES.map(
      (status) => Prisma.sql`${status}::"RecurringTaskStatus"`,
    );

    const [
      summaryRows,
      nodeRows,
      departmentRows,
      reworkSummaryRows,
      reasonRows,
      recurringRows,
      colorExitRows,
      feeRows,
    ] = await Promise.all([
      this.prisma.$queryRaw<OverviewSummaryRow[]>(Prisma.sql`
        WITH visible_projects AS MATERIALIZED (
          SELECT
            p."id",
            p."status",
            p."createdAt",
            p."plannedStartDate",
            p."actualStartDate",
            p."actualEndDate",
            p."closedAt"
          FROM "projects" p
          WHERE ${visibleProjectSql}
        ), visible_tasks AS MATERIALIZED (
          SELECT
            t."projectId",
            t."status",
            t."dueAt",
            t."completedAt",
            t."reviewPassAt"
          FROM "workflow_tasks" t
          INNER JOIN visible_projects vp ON vp."id" = t."projectId"
        )
        SELECT
          (SELECT COUNT(*) FROM visible_projects) AS "totalProjects",
          (
            SELECT COUNT(*)
            FROM visible_projects
            WHERE "status" NOT IN (
              ${ProjectStatus.COMPLETED}::"ProjectStatus",
              ${ProjectStatus.CANCELLED}::"ProjectStatus"
            )
          ) AS "activeProjects",
          (
            SELECT COUNT(*)
            FROM visible_projects
            WHERE "status" = ${ProjectStatus.COMPLETED}::"ProjectStatus"
          ) AS "completedProjects",
          (
            SELECT COUNT(DISTINCT "projectId")
            FROM visible_tasks
            WHERE "dueAt" IS NOT NULL
              AND "status" <> ${WorkflowTaskStatus.CANCELLED}::"WorkflowTaskStatus"
              AND (
                COALESCE("completedAt", "reviewPassAt") > "dueAt"
                OR (COALESCE("completedAt", "reviewPassAt") IS NULL AND "dueAt" < ${now})
              )
          ) AS "overdueProjects",
          COALESCE((
            SELECT ROUND(AVG(GREATEST(
              1::numeric,
              ROUND(EXTRACT(EPOCH FROM (
                COALESCE("actualEndDate", "closedAt")
                - COALESCE("actualStartDate", "plannedStartDate", "createdAt")
              )) / 86400)
            )))::integer
            FROM visible_projects
            WHERE "status" = ${ProjectStatus.COMPLETED}::"ProjectStatus"
              AND COALESCE("actualEndDate", "closedAt") IS NOT NULL
          ), 0) AS "averageDevelopmentDays",
          (
            SELECT COUNT(*)
            FROM visible_tasks
            WHERE "status" IN (${Prisma.join(completedTaskStatuses)})
          ) AS "completedTaskCount",
          (
            SELECT COUNT(*)
            FROM visible_tasks
            WHERE "status" IN (${Prisma.join(completedTaskStatuses)})
              AND "dueAt" IS NOT NULL
              AND COALESCE("completedAt", "reviewPassAt") <= "dueAt"
          ) AS "onTimeCompletedTaskCount",
          (
            SELECT COUNT(*)
            FROM visible_tasks
            WHERE "dueAt" IS NOT NULL
              AND "status" <> ${WorkflowTaskStatus.CANCELLED}::"WorkflowTaskStatus"
              AND (
                COALESCE("completedAt", "reviewPassAt") > "dueAt"
                OR (COALESCE("completedAt", "reviewPassAt") IS NULL AND "dueAt" < ${now})
              )
          ) AS "totalOverdueTasks"
      `),
      this.prisma.$queryRaw<NodeEfficiencyRow[]>(Prisma.sql`
        WITH visible_projects AS MATERIALIZED (
          SELECT p."id"
          FROM "projects" p
          WHERE ${visibleProjectSql}
        )
        SELECT
          t."nodeCode",
          COALESCE(ROUND(
            AVG(GREATEST(
              1::numeric,
              ROUND(EXTRACT(EPOCH FROM (
                COALESCE(t."completedAt", t."reviewPassAt")
                - COALESCE(t."startedAt", t."createdAt")
              )) / 86400)
            )) FILTER (
              WHERE COALESCE(t."completedAt", t."reviewPassAt") IS NOT NULL
            )
          ), 0)::integer AS "averageDays",
          COUNT(*) FILTER (
            WHERE t."dueAt" IS NOT NULL
              AND t."status" <> ${WorkflowTaskStatus.CANCELLED}::"WorkflowTaskStatus"
              AND (
                COALESCE(t."completedAt", t."reviewPassAt") > t."dueAt"
                OR (
                  COALESCE(t."completedAt", t."reviewPassAt") IS NULL
                  AND t."dueAt" < ${now}
                )
              )
          ) AS "overdueCount",
          COUNT(*) FILTER (
            WHERE t."status" IN (${Prisma.join(completedTaskStatuses)})
              AND t."dueAt" IS NOT NULL
              AND COALESCE(t."completedAt", t."reviewPassAt") <= t."dueAt"
          ) AS "onTimeCount",
          COUNT(*) FILTER (
            WHERE t."status" IN (${Prisma.join(completedTaskStatuses)})
          ) AS "completedCount"
        FROM "workflow_tasks" t
        INNER JOIN visible_projects vp ON vp."id" = t."projectId"
        GROUP BY t."nodeCode"
      `),
      this.prisma.$queryRaw<DepartmentEfficiencyRow[]>(Prisma.sql`
        WITH visible_projects AS MATERIALIZED (
          SELECT p."id"
          FROM "projects" p
          WHERE ${visibleProjectSql}
        )
        SELECT
          COALESCE(d."name", '未分配部门') AS "departmentName",
          COUNT(*) FILTER (
            WHERE t."status" NOT IN (
              ${WorkflowTaskStatus.APPROVED}::"WorkflowTaskStatus",
              ${WorkflowTaskStatus.COMPLETED}::"WorkflowTaskStatus",
              ${WorkflowTaskStatus.CANCELLED}::"WorkflowTaskStatus"
            )
          ) AS "todoCount",
          COUNT(*) FILTER (
            WHERE t."dueAt" IS NOT NULL
              AND t."status" <> ${WorkflowTaskStatus.CANCELLED}::"WorkflowTaskStatus"
              AND (
                COALESCE(t."completedAt", t."reviewPassAt") > t."dueAt"
                OR (
                  COALESCE(t."completedAt", t."reviewPassAt") IS NULL
                  AND t."dueAt" < ${now}
                )
              )
          ) AS "overdueCount",
          COUNT(*) FILTER (
            WHERE t."status" IN (${Prisma.join(completedTaskStatuses)})
          ) AS "completedCount",
          COUNT(*) FILTER (
            WHERE t."status" IN (${Prisma.join(completedTaskStatuses)})
              AND t."dueAt" IS NOT NULL
              AND COALESCE(t."completedAt", t."reviewPassAt") <= t."dueAt"
          ) AS "onTimeCount"
        FROM "workflow_tasks" t
        INNER JOIN visible_projects vp ON vp."id" = t."projectId"
        LEFT JOIN "departments" d ON d."id" = t."assigneeDepartmentId"
        GROUP BY COALESCE(t."assigneeDepartmentId", 'unassigned'), d."name"
        ORDER BY "overdueCount" DESC, "departmentName" ASC
        LIMIT 8
      `),
      this.prisma.$queryRaw<Array<{
        returnCount: AggregateNumber;
        averageReworkDays: number;
      }>>(Prisma.sql`
        WITH visible_projects AS MATERIALIZED (
          SELECT p."id"
          FROM "projects" p
          WHERE ${visibleProjectSql}
        ), return_events AS MATERIALIZED (
          SELECT wt."id", wt."createdAt"
          FROM "workflow_transitions" wt
          INNER JOIN visible_projects vp ON vp."id" = wt."projectId"
          WHERE wt."action" = ${WorkflowAction.RETURN}::"WorkflowAction"
        ), ordered_returns AS (
          SELECT
            "createdAt",
            LAG("createdAt") OVER (ORDER BY "createdAt", "id") AS "previousAt"
          FROM return_events
        )
        SELECT
          (
            (SELECT COUNT(*) FROM return_events)
            + (
              SELECT COUNT(*)
              FROM "review_records" rr
              INNER JOIN visible_projects vp ON vp."id" = rr."projectId"
              WHERE rr."result" = ${ReviewResult.REJECTED}::"ReviewResult"
            )
          ) AS "returnCount",
          COALESCE((
            SELECT ROUND(AVG(GREATEST(
              1::numeric,
              ROUND(EXTRACT(EPOCH FROM ("createdAt" - "previousAt")) / 86400)
            )))::integer
            FROM ordered_returns
            WHERE "previousAt" IS NOT NULL
          ), 0) AS "averageReworkDays"
      `),
      this.prisma.$queryRaw<Array<{ reason: string; count: AggregateNumber }>>(Prisma.sql`
        WITH visible_projects AS MATERIALIZED (
          SELECT p."id"
          FROM "projects" p
          WHERE ${visibleProjectSql}
        ), reasons AS (
          SELECT COALESCE(
            NULLIF(LEFT(BTRIM(COALESCE(wt."comment", '流程退回')), 24), ''),
            '未填写原因'
          ) AS "reason"
          FROM "workflow_transitions" wt
          INNER JOIN visible_projects vp ON vp."id" = wt."projectId"
          WHERE wt."action" = ${WorkflowAction.RETURN}::"WorkflowAction"
          UNION ALL
          SELECT COALESCE(
            NULLIF(LEFT(BTRIM(COALESCE(rr."rejectReason", '评审不通过')), 24), ''),
            '未填写原因'
          ) AS "reason"
          FROM "review_records" rr
          INNER JOIN visible_projects vp ON vp."id" = rr."projectId"
          WHERE rr."result" = ${ReviewResult.REJECTED}::"ReviewResult"
        )
        SELECT "reason", COUNT(*) AS "count"
        FROM reasons
        GROUP BY "reason"
        ORDER BY "count" DESC, "reason" ASC
        LIMIT 6
      `),
      this.prisma.$queryRaw<Array<{
        currentMonthDue: AggregateNumber;
        completed: AggregateNumber;
        pending: AggregateNumber;
        overdue: AggregateNumber;
        allCompleted: AggregateNumber;
        allTasks: AggregateNumber;
      }>>(Prisma.sql`
        WITH visible_projects AS MATERIALIZED (
          SELECT p."id"
          FROM "projects" p
          WHERE ${visibleProjectSql}
        )
        SELECT
          COUNT(*) FILTER (
            WHERE rt."plannedDate" >= ${monthStart} AND rt."plannedDate" < ${nextMonthStart}
          ) AS "currentMonthDue",
          COUNT(*) FILTER (
            WHERE rt."plannedDate" >= ${monthStart}
              AND rt."plannedDate" < ${nextMonthStart}
              AND rt."status" = ${RecurringTaskStatus.COMPLETED}::"RecurringTaskStatus"
          ) AS "completed",
          COUNT(*) FILTER (
            WHERE rt."plannedDate" >= ${monthStart}
              AND rt."plannedDate" < ${nextMonthStart}
              AND rt."status" IN (${Prisma.join(pendingRecurringTaskStatuses)})
          ) AS "pending",
          COUNT(*) FILTER (
            WHERE rt."plannedDate" >= ${monthStart}
              AND rt."plannedDate" < ${nextMonthStart}
              AND rt."status" = ${RecurringTaskStatus.OVERDUE}::"RecurringTaskStatus"
          ) AS "overdue",
          COUNT(*) FILTER (
            WHERE rt."status" = ${RecurringTaskStatus.COMPLETED}::"RecurringTaskStatus"
          ) AS "allCompleted",
          COUNT(*) AS "allTasks"
        FROM "recurring_tasks" rt
        INNER JOIN visible_projects vp ON vp."id" = rt."projectId"
      `),
      this.prisma.$queryRaw<Array<{
        suggestedExit: AggregateNumber;
        exited: AggregateNumber;
        retained: AggregateNumber;
      }>>(Prisma.sql`
        WITH visible_projects AS MATERIALIZED (
          SELECT p."id"
          FROM "projects" p
          WHERE ${visibleProjectSql}
        )
        SELECT
          COUNT(*) FILTER (
            WHERE ce."systemSuggestion" = ${ColorExitSuggestion.EXIT}::"ColorExitSuggestion"
          ) AS "suggestedExit",
          COUNT(*) FILTER (
            WHERE ce."finalDecision" = ${ColorExitSuggestion.EXIT}::"ColorExitSuggestion"
              OR ce."completedAt" IS NOT NULL
          ) AS "exited",
          COUNT(*) FILTER (
            WHERE ce."finalDecision" = ${ColorExitSuggestion.RETAIN}::"ColorExitSuggestion"
          ) AS "retained"
        FROM "color_exits" ce
        INNER JOIN visible_projects vp ON vp."id" = ce."projectId"
      `),
      this.prisma.$queryRaw<Array<{
        totalRecords: AggregateNumber;
        recordedCount: AggregateNumber;
      }>>(Prisma.sql`
        WITH visible_projects AS MATERIALIZED (
          SELECT p."id"
          FROM "projects" p
          WHERE ${visibleProjectSql}
        )
        SELECT
          COUNT(*) AS "totalRecords",
          COUNT(*) FILTER (WHERE df."recordedAt" IS NOT NULL) AS "recordedCount"
        FROM "development_fees" df
        INNER JOIN visible_projects vp ON vp."id" = df."projectId"
      `),
    ]);

    const summary = summaryRows[0] ?? {
      totalProjects: 0,
      activeProjects: 0,
      completedProjects: 0,
      overdueProjects: 0,
      averageDevelopmentDays: 0,
      completedTaskCount: 0,
      onTimeCompletedTaskCount: 0,
      totalOverdueTasks: 0,
    };
    const nodeByCode = new Map(nodeRows.map((row) => [row.nodeCode, row]));
    const reworkSummary = reworkSummaryRows[0] ?? { returnCount: 0, averageReworkDays: 0 };
    const recurring = recurringRows[0] ?? {
      currentMonthDue: 0,
      completed: 0,
      pending: 0,
      overdue: 0,
      allCompleted: 0,
      allTasks: 0,
    };
    const colorExit = colorExitRows[0] ?? { suggestedExit: 0, exited: 0, retained: 0 };
    const fee = feeRows[0] ?? { totalRecords: 0, recordedCount: 0 };

    return {
      lastUpdatedAt: now.toISOString(),
      projectOverview: {
        totalProjects: this.toNumber(summary.totalProjects),
        activeProjects: this.toNumber(summary.activeProjects),
        completedProjects: this.toNumber(summary.completedProjects),
        overdueProjects: this.toNumber(summary.overdueProjects),
        averageDevelopmentDays: this.toNumber(summary.averageDevelopmentDays),
      },
      workflowEfficiency: {
        onTimeCompletionRate: this.percent(
          this.toNumber(summary.onTimeCompletedTaskCount),
          this.toNumber(summary.completedTaskCount),
        ),
        totalOverdueTasks: this.toNumber(summary.totalOverdueTasks),
        byNode: Object.values(WorkflowNodeCode)
          .sort(
            (left, right) =>
              WORKFLOW_NODE_META_MAP[left].sequence - WORKFLOW_NODE_META_MAP[right].sequence,
          )
          .map((nodeCode) => {
            const row = nodeByCode.get(nodeCode);
            return {
              nodeCode,
              nodeName: WORKFLOW_NODE_META_MAP[nodeCode].name,
              averageDays: this.toNumber(row?.averageDays),
              overdueCount: this.toNumber(row?.overdueCount),
              onTimeRate: this.percent(
                this.toNumber(row?.onTimeCount),
                this.toNumber(row?.completedCount),
              ),
            };
          }),
      },
      departmentAnalysis: departmentRows.map((row) => ({
        departmentName: row.departmentName,
        todoCount: this.toNumber(row.todoCount),
        overdueCount: this.toNumber(row.overdueCount),
        onTimeRate: this.percent(
          this.toNumber(row.onTimeCount),
          this.toNumber(row.completedCount),
        ),
      })),
      reworkAnalysis: {
        returnCount: this.toNumber(reworkSummary.returnCount),
        averageReworkDays: this.toNumber(reworkSummary.averageReworkDays),
        reasonDistribution: reasonRows.map((row) => ({
          reason: row.reason,
          count: this.toNumber(row.count),
        })),
      },
      monthlyReviewAnalysis: {
        currentMonthDue: this.toNumber(recurring.currentMonthDue),
        completed: this.toNumber(recurring.completed),
        pending: this.toNumber(recurring.pending),
        overdue: this.toNumber(recurring.overdue),
        completionRate: this.percent(
          this.toNumber(recurring.allCompleted),
          this.toNumber(recurring.allTasks),
        ),
      },
      colorExitAnalysis: {
        suggestedExit: this.toNumber(colorExit.suggestedExit),
        exited: this.toNumber(colorExit.exited),
        retained: this.toNumber(colorExit.retained),
        pending: Math.max(
          0,
          this.toNumber(colorExit.suggestedExit) - this.toNumber(colorExit.exited),
        ),
      },
      feeAnalysis: {
        fixedAmount: 10000,
        totalRecords: this.toNumber(fee.totalRecords),
        recordedCount: this.toNumber(fee.recordedCount),
      },
    };
  }

  private buildVisibleProjectSql(actor: AuthenticatedUser): Prisma.Sql {
    teamProjectScope(actor);
    return Prisma.sql`TRUE`;
  }

  private toNumber(value: AggregateNumber | null | undefined) {
    return value === null || value === undefined ? 0 : Number(value);
  }

  private percent(numerator: number, denominator: number) {
    if (denominator <= 0) {
      return 0;
    }

    return Math.round((numerator / denominator) * 100);
  }
}
