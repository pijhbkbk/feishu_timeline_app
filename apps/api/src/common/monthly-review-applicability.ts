import { Prisma } from '@prisma/client';
import type { PrismaService } from '../infra/prisma/prisma.service';

/** Old calendar periods are history, not evidence that a color was sampled.
 * Only explicit activity/task links or service-written review/task audit links
 * qualify a period for current work/reminders. Never infer from color or month.
 * Identifier fragments are fixed by callers, never taken from request input.
 */
export function recordedMonthlyReviewSql(id: Prisma.Sql, projectId: Prisma.Sql) {
  return Prisma.sql`(
    EXISTS (SELECT 1 FROM inspection_activities a
      WHERE a."recurringTaskId" = ${id} AND a."projectId" = ${projectId}
      AND EXISTS (SELECT 1 FROM inspection_occurrences o WHERE o."activityId" = a.id))
    OR EXISTS (SELECT 1 FROM audit_logs e JOIN review_records r ON r.id = e."targetId"
      WHERE e."projectId" = ${projectId} AND r."projectId" = ${projectId}
      AND e."targetType" = 'REVIEW_RECORD' AND r."reviewType" = 'VISUAL_COLOR_DIFFERENCE_REVIEW'
      AND r."reviewedAt" IS NOT NULL
      AND e.action IN ('VISUAL_DELTA_REVIEW_CREATED','VISUAL_DELTA_REVIEW_UPDATED','VISUAL_DELTA_REVIEW_APPROVED')
      AND ((e.metadata->>'recurringTaskId' = ${id} AND e.metadata->>'reviewPeriod' = r."reviewPeriod")
        OR (e.action = 'VISUAL_DELTA_REVIEW_APPROVED' AND e."afterData"->>'recurringTaskId' = ${id}))))`;
}

export async function hasRecordedMonthlyReview(db: Prisma.TransactionClient | PrismaService, id: string, projectId: string) {
  const rows = await db.$queryRaw<Array<{ recorded: boolean }>>(Prisma.sql`
    SELECT ${recordedMonthlyReviewSql(Prisma.sql`${id}`, Prisma.sql`${projectId}`)} AS recorded`);
  return rows[0]?.recorded === true;
}

export async function recordedMonthlyReviewIds(db: Prisma.TransactionClient | PrismaService, ids: string[]) {
  const uniqueIds = [...new Set(ids)];
  const result = new Set<string>();
  // Callers pass already bounded project/page results; each SQL request is capped.
  for (let offset = 0; offset < uniqueIds.length; offset += 100) {
    const rows = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT t.id FROM recurring_tasks t WHERE t.id IN (${Prisma.join(uniqueIds.slice(offset, offset + 100))})
      AND ${recordedMonthlyReviewSql(Prisma.sql`t.id`, Prisma.sql`t."projectId"`)} LIMIT 100`);
    for (const row of rows) result.add(row.id);
  }
  return result;
}
