-- AlterEnum
ALTER TYPE "AuditTargetType" ADD VALUE IF NOT EXISTS 'DEVELOPMENT_REPORT';

-- CreateEnum
CREATE TYPE "DevelopmentReportStatus" AS ENUM ('DRAFT', 'SUBMITTED');

-- CreateTable
CREATE TABLE "development_reports" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "workflowInstanceId" TEXT NOT NULL,
    "workflowTaskId" TEXT NOT NULL,
    "status" "DevelopmentReportStatus" NOT NULL DEFAULT 'DRAFT',
    "reportTitle" TEXT NOT NULL,
    "demandSource" TEXT NOT NULL,
    "targetMarket" TEXT,
    "targetVehicleModel" TEXT,
    "targetColorName" TEXT NOT NULL,
    "benchmarkColorRef" TEXT,
    "developmentReason" TEXT NOT NULL,
    "expectedLaunchDate" TIMESTAMP(3),
    "estimatedAnnualVolume" INTEGER,
    "technicalRequirements" TEXT,
    "qualityRequirements" TEXT,
    "costTarget" TEXT,
    "riskSummary" TEXT,
    "remark" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "submittedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "development_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "development_reports_workflowTaskId_key" ON "development_reports"("workflowTaskId");

-- CreateIndex
CREATE INDEX "development_reports_projectId_createdAt_idx" ON "development_reports"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "development_reports_workflowInstanceId_status_idx" ON "development_reports"("workflowInstanceId", "status");

-- CreateIndex
CREATE INDEX "development_reports_submittedById_submittedAt_idx" ON "development_reports"("submittedById", "submittedAt");

-- AddForeignKey
ALTER TABLE "development_reports" ADD CONSTRAINT "development_reports_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "development_reports" ADD CONSTRAINT "development_reports_workflowInstanceId_fkey" FOREIGN KEY ("workflowInstanceId") REFERENCES "workflow_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "development_reports" ADD CONSTRAINT "development_reports_workflowTaskId_fkey" FOREIGN KEY ("workflowTaskId") REFERENCES "workflow_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "development_reports" ADD CONSTRAINT "development_reports_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "development_reports" ADD CONSTRAINT "development_reports_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "development_reports" ADD CONSTRAINT "development_reports_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
