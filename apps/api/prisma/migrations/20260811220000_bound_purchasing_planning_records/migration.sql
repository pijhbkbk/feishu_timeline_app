ALTER TABLE "development_fees"
  ALTER COLUMN "currency" TYPE VARCHAR(3),
  ALTER COLUMN "payer" TYPE VARCHAR(200),
  ALTER COLUMN "remark" TYPE VARCHAR(4000),
  ALTER COLUMN "note" TYPE VARCHAR(4000);

ALTER TABLE "development_fees"
  ADD CONSTRAINT "development_fees_amount_positive_check"
    CHECK ("amount" > 0),
  ADD CONSTRAINT "development_fees_currency_format_check"
    CHECK ("currency" ~ '^[A-Z]{3}$');

ALTER TABLE "paint_procurements"
  ALTER COLUMN "procurementNo" TYPE VARCHAR(64),
  ALTER COLUMN "materialName" TYPE VARCHAR(200),
  ALTER COLUMN "batchNo" TYPE VARCHAR(64),
  ALTER COLUMN "unit" TYPE VARCHAR(32),
  ALTER COLUMN "remark" TYPE VARCHAR(4000);

ALTER TABLE "paint_procurements"
  ADD CONSTRAINT "paint_procurements_procurementNo_format_check"
    CHECK ("procurementNo" ~ '^[A-Za-z0-9._-]+$'),
  ADD CONSTRAINT "paint_procurements_quantity_positive_check"
    CHECK ("quantity" IS NULL OR "quantity" > 0);

ALTER TABLE "production_plans"
  ADD CONSTRAINT "production_plans_schedule_record_bounds_check"
    CHECK (
      "planType" <> 'SCHEDULE'::"ProductionPlanType"
      OR (
        "planNo" ~ '^[A-Za-z0-9._-]{1,64}$'
        AND "lineName" IS NOT NULL
        AND char_length("lineName") BETWEEN 1 AND 200
        AND "workshop" IS NOT NULL
        AND char_length("workshop") BETWEEN 1 AND 200
        AND "batchNo" IS NOT NULL
        AND "batchNo" ~ '^[A-Za-z0-9._-]{1,64}$'
        AND ("remark" IS NULL OR char_length("remark") <= 4000)
        AND "quantity" IS NOT NULL
        AND "quantity" BETWEEN 1 AND 2147483647
      )
    );
