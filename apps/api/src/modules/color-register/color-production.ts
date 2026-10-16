import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../infra/prisma/prisma.service';

/** System production is a separate metric scope from imported workbook totals.
 * Group at color/base/business-month grain in SQL; never join standard versions.
 * planDate is the productionDate submitted in the mass-production domain.
 */
export async function readSystemColorProduction(db: PrismaService, colorId: string) {
  const rows = await db.$queryRaw<Array<{ month: string; productionBaseId: string; quantity: bigint | null; recordCount: bigint; unknownQuantityCount: bigint }>>(Prisma.sql`
    SELECT to_char(p."planDate" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM') AS month,
      c."productionBaseId",
      CASE WHEN count(p."actualQuantity") = count(*) THEN sum(p."actualQuantity") ELSE NULL END AS quantity,
      count(*) AS "recordCount", count(*) - count(p."actualQuantity") AS "unknownQuantityCount"
    FROM production_plans p
    JOIN projects j ON j.id = p."projectId"
    JOIN colors c ON c.id = j."primaryColorId"
    WHERE c.id = ${colorId} AND c."productionBaseId" IS NOT NULL
      AND p."planType" = 'MASS_PRODUCTION' AND p.status = 'COMPLETED' AND p."planDate" IS NOT NULL
    GROUP BY c.id, c."productionBaseId", month
    ORDER BY month DESC LIMIT 121
  `);
  const undatedRecordCount = await db.productionPlan.count({ where: {
    project: { primaryColorId: colorId }, planType: 'MASS_PRODUCTION', status: 'COMPLETED', planDate: null,
  } });
  return { items: rows.slice(0, 120).map(value => ({ month: value.month, productionBaseId: value.productionBaseId,
    quantity: value.quantity === null ? null : value.quantity.toString(), recordCount: Number(value.recordCount),
    unknownQuantityCount: Number(value.unknownQuantityCount), metricScope: '系统已完成批量生产实际数（按生产日期）' })),
    hasMore: rows.length > 120, undatedRecordCount };
}
