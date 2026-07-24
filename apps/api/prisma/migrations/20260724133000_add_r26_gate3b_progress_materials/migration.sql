-- R26 Gate 3B: progress drafts, explicit progress semantics, blocker assistance,
-- and immutable task-progress request metadata. This migration does not alter
-- workflow task state or workflow transition tables.

ALTER TABLE "task_progress_updates"
ADD COLUMN "progressStatus" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
ADD COLUMN "requestId" TEXT,
ADD COLUMN "taskVersion" TEXT;

ALTER TABLE "task_blockers"
ADD COLUMN "assistanceUserIds" JSONB,
ADD COLUMN "assistanceDepartmentIds" JSONB,
ADD COLUMN "impactLevel" TEXT;

CREATE TABLE "r26_progress_drafts" (
  "id" TEXT NOT NULL,
  "workflowTaskId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "authorUserId" TEXT NOT NULL,
  "draftVersion" INTEGER NOT NULL DEFAULT 1,
  "progressStatus" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
  "completedWork" TEXT,
  "nextPlan" TEXT,
  "blockerType" TEXT,
  "blockerDescription" TEXT,
  "assistanceUserIds" JSONB,
  "assistanceDepartmentIds" JSONB,
  "expectedResolvedAt" TIMESTAMP(3),
  "impactLevel" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "r26_progress_drafts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "r26_progress_drafts_workflowTaskId_authorUserId_key"
ON "r26_progress_drafts"("workflowTaskId", "authorUserId");

CREATE INDEX "r26_progress_drafts_projectId_updatedAt_idx"
ON "r26_progress_drafts"("projectId", "updatedAt");

CREATE INDEX "r26_progress_drafts_authorUserId_updatedAt_idx"
ON "r26_progress_drafts"("authorUserId", "updatedAt");

ALTER TABLE "r26_progress_drafts"
ADD CONSTRAINT "r26_progress_drafts_workflowTaskId_fkey"
FOREIGN KEY ("workflowTaskId") REFERENCES "workflow_tasks"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "r26_progress_drafts"
ADD CONSTRAINT "r26_progress_drafts_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "projects"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "r26_progress_drafts"
ADD CONSTRAINT "r26_progress_drafts_authorUserId_fkey"
FOREIGN KEY ("authorUserId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
