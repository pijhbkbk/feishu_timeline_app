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
