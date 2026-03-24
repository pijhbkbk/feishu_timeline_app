-- CreateEnum
CREATE TYPE "SampleConfirmationDecision" AS ENUM ('APPROVE', 'REJECT', 'RETURN');

-- AlterTable
ALTER TABLE "samples"
ADD COLUMN "sampleName" TEXT,
ADD COLUMN "versionNo" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "isCurrent" BOOLEAN NOT NULL DEFAULT true;

-- Backfill existing rows
UPDATE "samples"
SET "sampleName" = "sampleNo"
WHERE "sampleName" IS NULL;

-- Make sampleName required
ALTER TABLE "samples"
ALTER COLUMN "sampleName" SET NOT NULL;

-- CreateTable
CREATE TABLE "sample_confirmations" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sampleId" TEXT NOT NULL,
    "workflowInstanceId" TEXT NOT NULL,
    "workflowTaskId" TEXT NOT NULL,
    "decision" "SampleConfirmationDecision" NOT NULL,
    "colorAssessment" TEXT,
    "appearanceAssessment" TEXT,
    "comment" TEXT,
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sample_confirmations_pkey" PRIMARY KEY ("id")
);

-- DropIndex
DROP INDEX "samples_projectId_sampleNo_key";

-- CreateIndex
CREATE UNIQUE INDEX "samples_projectId_sampleNo_versionNo_key" ON "samples"("projectId", "sampleNo", "versionNo");

-- CreateIndex
CREATE INDEX "samples_projectId_sampleNo_isCurrent_idx" ON "samples"("projectId", "sampleNo", "isCurrent");

-- CreateIndex
CREATE UNIQUE INDEX "sample_confirmations_workflowTaskId_key" ON "sample_confirmations"("workflowTaskId");

-- CreateIndex
CREATE INDEX "sample_confirmations_projectId_confirmedAt_idx" ON "sample_confirmations"("projectId", "confirmedAt");

-- CreateIndex
CREATE INDEX "sample_confirmations_sampleId_confirmedAt_idx" ON "sample_confirmations"("sampleId", "confirmedAt");

-- CreateIndex
CREATE INDEX "sample_confirmations_confirmedById_confirmedAt_idx" ON "sample_confirmations"("confirmedById", "confirmedAt");

-- AddForeignKey
ALTER TABLE "sample_confirmations" ADD CONSTRAINT "sample_confirmations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_confirmations" ADD CONSTRAINT "sample_confirmations_sampleId_fkey" FOREIGN KEY ("sampleId") REFERENCES "samples"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_confirmations" ADD CONSTRAINT "sample_confirmations_workflowInstanceId_fkey" FOREIGN KEY ("workflowInstanceId") REFERENCES "workflow_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_confirmations" ADD CONSTRAINT "sample_confirmations_workflowTaskId_fkey" FOREIGN KEY ("workflowTaskId") REFERENCES "workflow_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_confirmations" ADD CONSTRAINT "sample_confirmations_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
