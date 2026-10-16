ALTER TABLE "development_reports"
  ALTER COLUMN "reportTitle" TYPE VARCHAR(200),
  ALTER COLUMN "demandSource" TYPE VARCHAR(500),
  ALTER COLUMN "targetMarket" TYPE VARCHAR(200),
  ALTER COLUMN "targetVehicleModel" TYPE VARCHAR(200),
  ALTER COLUMN "targetColorName" TYPE VARCHAR(200),
  ALTER COLUMN "benchmarkColorRef" TYPE VARCHAR(200),
  ALTER COLUMN "developmentReason" TYPE VARCHAR(4000),
  ALTER COLUMN "technicalRequirements" TYPE VARCHAR(4000),
  ALTER COLUMN "qualityRequirements" TYPE VARCHAR(4000),
  ALTER COLUMN "costTarget" TYPE VARCHAR(500),
  ALTER COLUMN "riskSummary" TYPE VARCHAR(4000),
  ALTER COLUMN "remark" TYPE VARCHAR(4000);

ALTER TABLE "development_reports"
  ADD CONSTRAINT "development_reports_estimatedAnnualVolume_bounds_check"
  CHECK (
    "estimatedAnnualVolume" IS NULL
    OR "estimatedAnnualVolume" BETWEEN 0 AND 2147483647
  );
