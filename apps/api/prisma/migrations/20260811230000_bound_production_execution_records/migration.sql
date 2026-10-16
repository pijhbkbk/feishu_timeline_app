ALTER TABLE "production_plans"
  ADD CONSTRAINT "production_plans_execution_record_bounds_check"
    CHECK (
      "planType" NOT IN ('FIRST_UNIT'::"ProductionPlanType", 'MASS_PRODUCTION'::"ProductionPlanType")
      OR (
        "planNo" ~ '^[A-Za-z0-9._-]{1,64}$'
        AND ("ownerId" IS NULL OR "ownerId" ~ '^[A-Za-z0-9_-]{1,64}$')
        AND "lineName" IS NOT NULL
        AND char_length("lineName") BETWEEN 1 AND 200
        AND "workshop" IS NOT NULL
        AND char_length("workshop") BETWEEN 1 AND 200
        AND "batchNo" IS NOT NULL
        AND "batchNo" ~ '^[A-Za-z0-9._-]{1,64}$'
        AND ("remark" IS NULL OR char_length("remark") <= 4000)
        AND "quantity" IS NOT NULL
        AND "quantity" BETWEEN 1 AND 2147483647
        AND ("actualQuantity" IS NULL OR "actualQuantity" BETWEEN 0 AND 2147483647)
        AND "planDate" IS NOT NULL
      )
    );

ALTER TABLE "trial_productions"
  ALTER COLUMN "trialNo" TYPE VARCHAR(64),
  ALTER COLUMN "paintBatchNo" TYPE VARCHAR(64),
  ALTER COLUMN "note" TYPE VARCHAR(4000),
  ALTER COLUMN "location" TYPE VARCHAR(200),
  ALTER COLUMN "summary" TYPE VARCHAR(4000);

ALTER TABLE "trial_productions"
  ADD CONSTRAINT "trial_productions_record_bounds_check"
    CHECK (
      "trialNo" ~ '^[A-Za-z0-9._-]{1,64}$'
      AND ("paintBatchNo" IS NULL OR "paintBatchNo" ~ '^[A-Za-z0-9._-]{1,64}$')
      AND ("location" IS NULL OR char_length("location") BETWEEN 1 AND 200)
      AND ("quantity" IS NULL OR "quantity" BETWEEN 0 AND 2147483647)
    );

ALTER TABLE "trial_production_issues"
  ALTER COLUMN "issueType" TYPE VARCHAR(500),
  ALTER COLUMN "description" TYPE VARCHAR(4000),
  ALTER COLUMN "responsibleDept" TYPE VARCHAR(500);

ALTER TABLE "trial_production_issues"
  ADD CONSTRAINT "trial_production_issues_text_bounds_check"
    CHECK (
      char_length("issueType") BETWEEN 1 AND 500
      AND char_length("description") BETWEEN 1 AND 4000
      AND char_length("responsibleDept") BETWEEN 1 AND 500
    );
