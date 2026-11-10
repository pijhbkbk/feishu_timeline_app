import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../infra/prisma/prisma.service';

type MonthlyPlan = { id: string; totalCount: number; status: string; frequency: string; taskCount: number; validCount: number };

/** Caller holds the project write lock (or the exclusive personnel fence).
 * Historical anomalies fail closed; this check never repairs or discards history.
 */
export async function requireActiveMonthlyPlan(db: Prisma.TransactionClient | PrismaService, projectId: string, expectedPlanId?: string) {
  const plan = await resolveVisualReviewPlan(db, projectId, expectedPlanId);
  if (!plan) throw new ConflictException({ code: 'MONTHLY_REVIEW_PLAN_INVALID', message: '历史月度计划缺失，请核对后再继续。' });
  return plan;
}

/** A V1 project with no historical plan has actual stage reviews, not missing calendar obligations. */
export async function resolveVisualReviewPlan(db: Prisma.TransactionClient | PrismaService, projectId: string, expectedPlanId?: string) {
  const plans = await db.$queryRaw<MonthlyPlan[]>(Prisma.sql`
    /* monthly_plan_integrity */
    SELECT p.id, p."totalCount",
      CASE WHEN p."projectId" = ${projectId} THEN p.status::text ELSE 'INVALID_IDENTITY' END AS status, p.frequency,
      months."taskCount", months."validCount"
    FROM recurring_plans p
    CROSS JOIN LATERAL (
      SELECT count(*)::int AS "taskCount",
        count(*) FILTER (WHERE t."projectId" = p."projectId" AND t."periodIndex" BETWEEN 1 AND 12)::int AS "validCount"
      FROM (SELECT "projectId", "periodIndex" FROM recurring_tasks
        WHERE "recurringPlanId" = p.id ORDER BY "periodIndex" LIMIT 13) t
    ) months
    WHERE p."sourceNodeCode" = 'VISUAL_COLOR_DIFFERENCE_REVIEW'
      AND (p."projectId" = ${projectId}
        OR EXISTS (SELECT 1 FROM workflow_tasks source WHERE source.id = p."sourceWorkflowTaskId" AND source."projectId" = ${projectId})
        OR EXISTS (SELECT 1 FROM recurring_tasks child WHERE child."recurringPlanId" = p.id AND child."projectId" = ${projectId}))
    ORDER BY p.id LIMIT 2
  `);
  if (plans.length === 0 && !expectedPlanId) return null;
  const plan = plans[0];
  // The unique (recurringPlanId, periodIndex) constraint plus 12 valid indices
  // proves that every period 1..12 exists exactly once for this project.
  if (plans.length !== 1 || !plan || (expectedPlanId && plan.id !== expectedPlanId) ||
      plan.status !== 'ACTIVE' || plan.frequency !== 'MONTHLY' || plan.totalCount !== 12 ||
      plan.taskCount !== 12 || plan.validCount !== 12) {
    throw new ConflictException({ code: 'MONTHLY_REVIEW_PLAN_INVALID',
      message: '月度计划须启用且完整保留第 1–12 月；历史计划异常，请管理员核对后再继续。' });
  }
  return plan;
}
