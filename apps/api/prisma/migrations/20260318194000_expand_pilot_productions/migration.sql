-- CreateEnum
CREATE TYPE "TrialProductionResult" AS ENUM ('PASS', 'FAIL', 'PASS_WITH_ISSUES');

-- CreateEnum
CREATE TYPE "TrialProductionIssueSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- AlterTable
ALTER TABLE "production_plans"
ADD COLUMN "ownerId" TEXT,
ADD COLUMN "confirmedById" TEXT,
ADD COLUMN "actualQuantity" INTEGER,
ADD COLUMN "planDate" TIMESTAMP(3),
ADD COLUMN "lineName" TEXT,
ADD COLUMN "workshop" TEXT,
ADD COLUMN "batchNo" TEXT,
ADD COLUMN "confirmedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "trial_productions"
ADD COLUMN "productionPlanId" TEXT,
ADD COLUMN "paintBatchNo" TEXT,
ADD COLUMN "result" "TrialProductionResult",
ADD COLUMN "note" TEXT;

-- CreateTable
CREATE TABLE "trial_production_issues" (
    "id" TEXT NOT NULL,
    "trialProductionId" TEXT NOT NULL,
    "issueType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "TrialProductionIssueSeverity" NOT NULL,
    "responsibleDept" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trial_production_issues_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "production_plans_ownerId_status_idx" ON "production_plans"("ownerId", "status");

-- CreateIndex
CREATE INDEX "trial_productions_productionPlanId_idx" ON "trial_productions"("productionPlanId");

-- CreateIndex
CREATE INDEX "trial_production_issues_trialProductionId_severity_idx" ON "trial_production_issues"("trialProductionId", "severity");

-- CreateIndex
CREATE INDEX "trial_production_issues_responsibleDept_idx" ON "trial_production_issues"("responsibleDept");

-- AddForeignKey
ALTER TABLE "production_plans"
ADD CONSTRAINT "production_plans_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_plans"
ADD CONSTRAINT "production_plans_confirmedById_fkey"
FOREIGN KEY ("confirmedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trial_productions"
ADD CONSTRAINT "trial_productions_productionPlanId_fkey"
FOREIGN KEY ("productionPlanId") REFERENCES "production_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trial_production_issues"
ADD CONSTRAINT "trial_production_issues_trialProductionId_fkey"
FOREIGN KEY ("trialProductionId") REFERENCES "trial_productions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
