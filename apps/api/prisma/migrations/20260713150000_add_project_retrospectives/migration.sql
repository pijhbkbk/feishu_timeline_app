CREATE TYPE "ProjectRetrospectiveStatus" AS ENUM ('DRAFT', 'COMPLETED');

CREATE TABLE "project_retrospectives" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "status" "ProjectRetrospectiveStatus" NOT NULL DEFAULT 'DRAFT',
    "conclusion" TEXT,
    "improvementMeasures" JSONB,
    "strengths" TEXT,
    "problems" TEXT,
    "reusableExperience" TEXT,
    "workflowRuleUpdates" TEXT,
    "completedById" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_retrospectives_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "project_retrospectives_projectId_key" ON "project_retrospectives"("projectId");
CREATE INDEX "project_retrospectives_status_updatedAt_idx" ON "project_retrospectives"("status", "updatedAt");
CREATE INDEX "project_retrospectives_completedById_completedAt_idx" ON "project_retrospectives"("completedById", "completedAt");

ALTER TABLE "project_retrospectives"
  ADD CONSTRAINT "project_retrospectives_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_retrospectives"
  ADD CONSTRAINT "project_retrospectives_completedById_fkey"
  FOREIGN KEY ("completedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "attachments"
  ADD COLUMN "materialType" TEXT,
  ADD COLUMN "versionNo" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "replacesAttachmentId" TEXT;

CREATE INDEX "attachments_replacesAttachmentId_idx" ON "attachments"("replacesAttachmentId");
