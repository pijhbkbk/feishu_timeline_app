ALTER TABLE "workflow_instances"
ADD COLUMN "commandVersion" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "task_blockers"
ADD COLUMN "resolutionSummary" TEXT,
ADD COLUMN "actualResolvedAt" TIMESTAMP(3),
ADD COLUMN "resolvedById" TEXT,
ADD COLUMN "resolutionRequestId" TEXT;
