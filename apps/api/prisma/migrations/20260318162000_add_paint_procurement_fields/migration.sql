-- Align procurement statuses to MVP flow and add procurement-specific fields.
CREATE TYPE "ProcurementStatus_new" AS ENUM ('DRAFT', 'ORDERED', 'ARRIVED', 'CANCELLED');

ALTER TABLE "paint_procurements"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "ProcurementStatus_new"
  USING (
    CASE
      WHEN "status" = 'RECEIVED' THEN 'ARRIVED'::"ProcurementStatus_new"
      WHEN "status" = 'PARTIALLY_RECEIVED' THEN 'ORDERED'::"ProcurementStatus_new"
      WHEN "status" = 'REQUESTED' THEN 'ORDERED'::"ProcurementStatus_new"
      WHEN "status" = 'ORDERED' THEN 'ORDERED'::"ProcurementStatus_new"
      WHEN "status" = 'CANCELLED' THEN 'CANCELLED'::"ProcurementStatus_new"
      ELSE 'DRAFT'::"ProcurementStatus_new"
    END
  );

ALTER TABLE "paint_procurements"
  ALTER COLUMN "status" SET DEFAULT 'DRAFT';

DROP TYPE "ProcurementStatus";
ALTER TYPE "ProcurementStatus_new" RENAME TO "ProcurementStatus";

ALTER TABLE "paint_procurements"
  ADD COLUMN "materialName" TEXT,
  ADD COLUMN "batchNo" TEXT,
  ADD COLUMN "cancelledAt" TIMESTAMP(3);

CREATE INDEX "paint_procurements_projectId_materialName_idx"
  ON "paint_procurements"("projectId", "materialName");

CREATE INDEX "paint_procurements_projectId_batchNo_idx"
  ON "paint_procurements"("projectId", "batchNo");
