import { Prisma } from '@prisma/client';
import type { PrismaService } from '../infra/prisma/prisma.service';

/** Fixed alias r is supplied only by these queries. A historical approval for
 * another task or an older version never confirms the current review. */
function confirmedSql() {
  return Prisma.sql`EXISTS (
    SELECT 1 FROM audit_logs e
    WHERE e."projectId" = r."projectId" AND e."targetId" = r.id
      AND e."targetType" = 'REVIEW_RECORD' AND e.action = 'VISUAL_DELTA_REVIEW_APPROVED'
      AND (
        (e.metadata->>'workflowTaskId' = r."workflowTaskId"
         AND e.metadata->>'reviewRecordId' = r.id
         AND e.metadata->>'reviewVersion' = to_char(r."updatedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
         AND e.metadata->>'result' = r.result::text
         AND COALESCE(e.metadata->>'standardVersionId', '') = COALESCE(r."standardVersionId", ''))
        OR
        (e.metadata->>'reviewVersion' IS NULL AND e."createdAt" >= r."updatedAt"
         AND e."afterData"->>'reviewRecordId' = r.id AND e."afterData"->>'result' = r.result::text
         AND EXISTS (
           SELECT 1 FROM recurring_tasks t JOIN recurring_plans p ON p.id = t."recurringPlanId"
           WHERE t.id = e."afterData"->>'recurringTaskId' AND t."projectId" = r."projectId"
             AND p."projectId" = r."projectId" AND p."sourceNodeCode" = 'VISUAL_COLOR_DIFFERENCE_REVIEW'
             AND t.status = 'COMPLETED' AND r."reviewPeriod" = to_char(t."plannedDate", 'YYYY-MM')
             AND r."reviewPeriod" = to_char(r."reviewedAt", 'YYYY-MM')
         ))
      )
      AND r."submittedAt" IS NOT NULL AND r."reviewedAt" IS NOT NULL
      AND r."reviewerId" IS NOT NULL AND length(btrim(COALESCE(r.comment, ''))) > 0
      AND r.result IN ('APPROVED','CONDITIONAL_APPROVED')
      AND (r.result <> 'CONDITIONAL_APPROVED' OR length(btrim(COALESCE(r."conditionNote", ''))) > 0)
  )`;
}

export async function confirmedVisualReviewIds(db: Prisma.TransactionClient | PrismaService, projectId: string, ids: string[]) {
  if (!ids.length) return new Set<string>();
  if (ids.length > 100) throw new Error('VISUAL_REVIEW_CONFIRMATION_BOUND');
  const rows = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT r.id FROM review_records r WHERE r."projectId" = ${projectId}
      AND r."reviewType" = 'VISUAL_COLOR_DIFFERENCE_REVIEW' AND r.id IN (${Prisma.join(ids)})
      AND ${confirmedSql()} LIMIT 100`);
  return new Set(rows.map(row => row.id));
}

/** A first signature closes the calendar period, not other already registered
 * actual records. Reopen only those exact unconfirmed records; never the period.
 * Legacy CREATE snapshots bind record/task/author/date explicitly, not color.
 */
export async function continuableVisualReviewIds(
  db: Prisma.TransactionClient | PrismaService, projectId: string, ids: string[], periodTaskId?: string,
) {
  if (!ids.length) return new Set<string>();
  if (ids.length > 100) throw new Error('VISUAL_REVIEW_CONTINUATION_BOUND');
  const rows = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    /* visual_review_continuation */
    SELECT r.id FROM review_records r
    JOIN workflow_tasks w ON w.id = r."workflowTaskId" AND w."projectId" = r."projectId"
    JOIN recurring_plans p ON p."projectId" = r."projectId" AND p."sourceNodeCode" = 'VISUAL_COLOR_DIFFERENCE_REVIEW' AND p.status = 'ACTIVE'
    JOIN recurring_tasks t ON t."recurringPlanId" = p.id AND t."projectId" = r."projectId"
      AND r."reviewPeriod" = to_char(t."plannedDate", 'YYYY-MM')
    WHERE r."projectId" = ${projectId} AND r.id IN (${Prisma.join(ids)})
      AND r."reviewType" = 'VISUAL_COLOR_DIFFERENCE_REVIEW' AND w."nodeCode" = 'VISUAL_COLOR_DIFFERENCE_REVIEW'
      AND w."isActive" AND w.status IN ('PENDING','READY','IN_PROGRESS','RETURNED')
      AND t.status = 'COMPLETED' AND t."completedAt" IS NOT NULL AND r."createdAt" <= t."completedAt"
      AND r."reviewPeriod" = to_char(r."reviewedAt", 'YYYY-MM')
      AND ${periodTaskId ? Prisma.sql`t.id = ${periodTaskId}` : Prisma.sql`TRUE`}
      AND NOT ${confirmedSql()}
      AND EXISTS (SELECT 1 FROM audit_logs e
        WHERE e."projectId" = r."projectId" AND e."targetType" = 'REVIEW_RECORD' AND e."targetId" = r.id
          AND e."createdAt" <= t."completedAt"
          AND e.action IN ('VISUAL_DELTA_REVIEW_CREATED','VISUAL_DELTA_REVIEW_UPDATED')
          AND ((e.metadata->>'recurringTaskId' = t.id AND e.metadata->>'reviewPeriod' = r."reviewPeriod")
            OR (e.action = 'VISUAL_DELTA_REVIEW_CREATED' AND e.metadata->>'recurringTaskId' IS NULL
              AND e."afterData"->>'id' = r.id AND e."afterData"->>'workflowTaskId' = r."workflowTaskId"
              AND e."afterData"->>'reviewerId' = r."reviewerId"
              AND e."afterData"->>'reviewType' = 'VISUAL_COLOR_DIFFERENCE_REVIEW'
              AND length(e."afterData"->>'reviewDate') = 24
              AND e."afterData"->>'reviewDate' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$'
              AND left(e."afterData"->>'reviewDate', 7) = r."reviewPeriod")))
    LIMIT 100`);
  return new Set(rows.map(row => row.id));
}
