BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE "color_production_facts"
  ADD COLUMN "vehicleModel" VARCHAR(100) NOT NULL DEFAULT '';
DROP INDEX "color_production_facts_colorId_productionBaseId_month_metri_key";
CREATE UNIQUE INDEX "color_production_facts_model_grain_key"
  ON "color_production_facts" ("colorId", "productionBaseId", "month", "metricScope", "vehicleModel");
ALTER TABLE "color_production_facts" ADD CONSTRAINT "color_production_facts_model_scope_check"
  CHECK (("metricScope" = 'MONTHLY_MODEL_DETAIL_V1' AND "vehicleModel" <> '' AND "vehicleModel" = btrim("vehicleModel") AND "sourceRowId" IS NULL)
    OR ("metricScope" <> 'MONTHLY_MODEL_DETAIL_V1' AND "vehicleModel" = ''));

CREATE TABLE "color_production_bases" (
  "id" TEXT NOT NULL,
  "colorId" TEXT NOT NULL,
  "productionBaseId" TEXT NOT NULL,
  "month" VARCHAR(7) NOT NULL,
  "mode" VARCHAR(20) NOT NULL,
  "snapshotHash" VARCHAR(64) NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "color_production_bases_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "color_production_bases_mode_check" CHECK ("mode"::text = ANY (ARRAY['MONTH_TOTAL'::text, 'MODEL_DETAILS'::text])),
  CONSTRAINT "color_production_bases_revision_check" CHECK ("revision" > 0),
  CONSTRAINT "color_production_bases_month_check" CHECK ("month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT "color_production_bases_hash_check" CHECK ("snapshotHash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "color_production_bases_colorId_fkey" FOREIGN KEY ("colorId") REFERENCES "colors"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "color_production_bases_productionBaseId_fkey" FOREIGN KEY ("productionBaseId") REFERENCES "production_bases"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "color_production_bases_colorId_productionBaseId_month_key"
  ON "color_production_bases" ("colorId", "productionBaseId", "month");
COMMIT;
