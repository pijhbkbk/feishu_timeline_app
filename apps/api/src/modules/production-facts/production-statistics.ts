import { Prisma } from '@prisma/client';
import { MONTHLY_ACTUAL_SCOPE, MONTHLY_MODEL_SCOPE, productionFilters } from './production-facts.rules';

type Aggregate = { factCount: number; unknownCount: number; knownQuantity: string; quantity: string | null; reconciliationMonthCount: number; unallocatedMonthCount: number };
type BaseAggregate = Aggregate & { baseId: string };
type ModelAggregate = Aggregate & { vehicleModel: string };

/** Aggregation stays in PostgreSQL. Raw rows/legacy source JSON are never materialized. */
export async function readProductionStatistics(tx: Prisma.TransactionClient, query: Record<string, unknown>) {
  const filters = productionFilters(query);
  const model = filters.vehicleModel;
  const conditions = [Prisma.sql`f."sourceRowId" IS NULL`, Prisma.sql`f."metricScope" IN (${MONTHLY_ACTUAL_SCOPE}, ${MONTHLY_MODEL_SCOPE})`];
  if (filters.productionBaseId) conditions.push(Prisma.sql`f."productionBaseId" = ${filters.productionBaseId}`);
  if (filters.colorId) conditions.push(Prisma.sql`f."colorId" = ${filters.colorId}`);
  if (filters.month?.gte) conditions.push(Prisma.sql`f.month >= ${filters.month.gte}`);
  if (filters.month?.lte) conditions.push(Prisma.sql`f.month <= ${filters.month.lte}`);
  const cte = Prisma.sql`
    WITH facts AS (SELECT f.id, f."colorId", f."productionBaseId", f.month, f."metricScope", f."vehicleModel", f.quantity
      FROM color_production_facts f WHERE ${Prisma.join(conditions, ' AND ')}),
    groups AS (SELECT "colorId", "productionBaseId", month,
      COUNT(*) FILTER (WHERE "metricScope" = ${MONTHLY_ACTUAL_SCOPE}) AS totals,
      COUNT(*) FILTER (WHERE "metricScope" = ${MONTHLY_MODEL_SCOPE}) AS models
      FROM facts GROUP BY "colorId", "productionBaseId", month),
    modes AS (SELECT g.*, COALESCE(b.mode, CASE WHEN totals > 0 AND models > 0 THEN NULL
      WHEN totals > 0 THEN 'MONTH_TOTAL' ELSE 'MODEL_DETAILS' END) AS mode
      FROM groups g LEFT JOIN color_production_bases b USING ("colorId", "productionBaseId", month)),
    selected AS (SELECT f.* FROM facts f JOIN modes m USING ("colorId", "productionBaseId", month)
      WHERE (m.mode = 'MONTH_TOTAL' AND f."metricScope" = ${MONTHLY_ACTUAL_SCOPE})
         OR (m.mode = 'MODEL_DETAILS' AND f."metricScope" = ${MONTHLY_MODEL_SCOPE})),
    counted AS (SELECT * FROM selected ${model ? Prisma.sql`WHERE "vehicleModel" = ${model}` : Prisma.empty}),
    pending AS (SELECT * FROM modes WHERE mode IS NULL OR (mode = 'MONTH_TOTAL' AND totals = 0) OR (mode = 'MODEL_DETAILS' AND models = 0)),
    unallocated AS (SELECT * FROM modes WHERE mode = 'MONTH_TOTAL' ${model ? Prisma.empty : Prisma.sql`AND FALSE`}),
    measures AS (
      SELECT "productionBaseId", "vehicleModel", 1 AS n, CASE WHEN quantity IS NULL THEN 1 ELSE 0 END AS unknown,
        COALESCE(quantity, 0) AS quantity, 0 AS pending, 0 AS unallocated FROM counted
      UNION ALL SELECT "productionBaseId", '', 0, 1, 0, 1, 0 FROM pending
      UNION ALL SELECT "productionBaseId", '', 0, 1, 0, 0, 1 FROM unallocated)`;
  const aggregate = Prisma.sql`COALESCE(SUM(n), 0)::int AS "factCount", COALESCE(SUM(unknown), 0)::int AS "unknownCount",
    COALESCE(SUM(quantity), 0)::text AS "knownQuantity",
    CASE WHEN COALESCE(SUM(unknown), 0) > 0 THEN NULL ELSE COALESCE(SUM(quantity), 0)::text END AS quantity,
    COALESCE(SUM(pending), 0)::int AS "reconciliationMonthCount", COALESCE(SUM(unallocated), 0)::int AS "unallocatedMonthCount"`;
  const totals = await tx.$queryRaw<Aggregate[]>(Prisma.sql`${cte} SELECT ${aggregate} FROM measures`);
  const byBase = await tx.$queryRaw<BaseAggregate[]>(Prisma.sql`${cte} SELECT "productionBaseId" AS "baseId", ${aggregate} FROM measures GROUP BY "productionBaseId" ORDER BY "productionBaseId" LIMIT 201`);
  const byModel = await tx.$queryRaw<ModelAggregate[]>(Prisma.sql`${cte} SELECT "vehicleModel", ${aggregate} FROM measures WHERE "vehicleModel" <> '' GROUP BY "vehicleModel" ORDER BY "vehicleModel" LIMIT 201`);
  // Decimal(18,3) SQL sums serialize trailing zeroes; retain the prior public integer-string contract.
  const normalize = <T extends Aggregate>(value: T): T => ({ ...value, knownQuantity: new Prisma.Decimal(value.knownQuantity).toString(), quantity: value.quantity === null ? null : new Prisma.Decimal(value.quantity).toString() });
  return { ...normalize(totals[0]!), byBase: byBase.slice(0, 200).map(normalize), byBaseHasMore: byBase.length > 200,
    byVehicleModel: byModel.slice(0, 200).map(normalize), byVehicleModelHasMore: byModel.length > 200 };
}
