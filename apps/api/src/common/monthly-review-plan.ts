import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../infra/prisma/prisma.service';

type MonthlyPlan = { id: string; totalCount: number; status: string; frequency: string; taskCount: number; validCount: number };

/** Caller holds the project write lock (or the exclusive personnel fence).
 * Historical anomalies fail closed; this check never repairs or discards history.
 */
export async function requireActiveMonthlyPlan(db: Prisma.TransactionClient | PrismaService, projectId: string, expectedPlanId?: string) {
  const plans = await db.$queryRaw<MonthlyPlan[]>(Prisma.sql`
    /* monthly_plan_integrity */
    SELECT p.id, p."totalCount", p.status, p.frequency,
      months."taskCount", months."validCount"
    FROM recurring_plans p
    CROSS JOIN LATERAL (
      SELECT count(*)::int AS "taskCount",
        count(*) FILTER (WHERE t."projectId" = p."projectId" AND t."periodIndex" BETWEEN 1 AND 12)::int AS "validCount"
      FROM (SELECT "projectId", "periodIndex" FROM recurring_tasks
        WHERE "recurringPlanId" = p.id ORDER BY "periodIndex" LIMIT 13) t
    ) months
    WHERE p."projectId" = ${projectId} AND p."sourceNodeCode" = 'VISUAL_COLOR_DIFFERENCE_REVIEW'
    ORDER BY p.id LIMIT 2
  `);
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
