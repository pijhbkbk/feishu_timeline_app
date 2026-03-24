CREATE TYPE "PerformanceTestType_new" AS ENUM (
  'ADHESION',
  'IMPACT',
  'SALT_SPRAY',
  'HUMIDITY',
  'GLOSS',
  'HARDNESS',
  'DELTA_E',
  'THICKNESS'
);

ALTER TABLE "performance_tests"
  ALTER COLUMN "testType" DROP DEFAULT,
  ALTER COLUMN "testType" TYPE "PerformanceTestType_new"
  USING (
    CASE
      WHEN "testType" = 'ADHESION' THEN 'ADHESION'::"PerformanceTestType_new"
      WHEN "testType" = 'CORROSION' THEN 'SALT_SPRAY'::"PerformanceTestType_new"
      WHEN "testType" = 'WEATHERING' THEN 'HUMIDITY'::"PerformanceTestType_new"
      WHEN "testType" = 'CHEMICAL_RESISTANCE' THEN 'HARDNESS'::"PerformanceTestType_new"
      ELSE 'GLOSS'::"PerformanceTestType_new"
    END
  );

DROP TYPE "PerformanceTestType";
ALTER TYPE "PerformanceTestType_new" RENAME TO "PerformanceTestType";

CREATE TYPE "PerformanceTestStatus_new" AS ENUM ('DRAFT', 'SUBMITTED', 'CANCELLED');

ALTER TABLE "performance_tests"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "PerformanceTestStatus_new"
  USING (
    CASE
      WHEN "status" IN ('PASSED', 'FAILED') THEN 'SUBMITTED'::"PerformanceTestStatus_new"
      WHEN "status" = 'CANCELLED' THEN 'CANCELLED'::"PerformanceTestStatus_new"
      ELSE 'DRAFT'::"PerformanceTestStatus_new"
    END
  );

DROP TYPE "PerformanceTestStatus";
ALTER TYPE "PerformanceTestStatus_new" RENAME TO "PerformanceTestStatus";

ALTER TABLE "performance_tests"
  ALTER COLUMN "status" SET DEFAULT 'DRAFT',
  ADD COLUMN "testedById" TEXT,
  ADD COLUMN "reportAttachmentId" TEXT,
  ADD COLUMN "relatedObjectName" TEXT,
  ADD COLUMN "standardValue" TEXT,
  ADD COLUMN "actualValue" TEXT,
  ADD COLUMN "result" TEXT;

CREATE TYPE "PerformanceTestResult" AS ENUM ('PASS', 'FAIL', 'OBSERVE');

ALTER TABLE "performance_tests"
  ALTER COLUMN "result" TYPE "PerformanceTestResult"
  USING (
    CASE
      WHEN "status" = 'SUBMITTED'::"PerformanceTestStatus" THEN 'PASS'::"PerformanceTestResult"
      ELSE NULL
    END
  );

CREATE UNIQUE INDEX "performance_tests_reportAttachmentId_key"
  ON "performance_tests"("reportAttachmentId");

CREATE INDEX "performance_tests_testedById_testedAt_idx"
  ON "performance_tests"("testedById", "testedAt");

ALTER TABLE "performance_tests"
  ADD CONSTRAINT "performance_tests_testedById_fkey"
  FOREIGN KEY ("testedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "performance_tests"
  ADD CONSTRAINT "performance_tests_reportAttachmentId_fkey"
  FOREIGN KEY ("reportAttachmentId") REFERENCES "attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
