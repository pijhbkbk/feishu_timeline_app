CREATE TYPE "DevelopmentFeeStatus" AS ENUM ('PENDING', 'RECORDED', 'PAID', 'CANCELLED');

ALTER TABLE "development_fees"
ADD COLUMN "recordedById" TEXT,
ADD COLUMN "payer" TEXT,
ADD COLUMN "payStatus" "DevelopmentFeeStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "recordedAt" TIMESTAMP(3),
ADD COLUMN "completedAt" TIMESTAMP(3),
ADD COLUMN "cancelledAt" TIMESTAMP(3),
ADD COLUMN "note" TEXT;

CREATE INDEX "development_fees_projectId_payStatus_recordedAt_idx"
ON "development_fees"("projectId", "payStatus", "recordedAt");

CREATE INDEX "development_fees_recordedById_recordedAt_idx"
ON "development_fees"("recordedById", "recordedAt");

ALTER TABLE "development_fees"
ADD CONSTRAINT "development_fees_recordedById_fkey"
FOREIGN KEY ("recordedById") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
