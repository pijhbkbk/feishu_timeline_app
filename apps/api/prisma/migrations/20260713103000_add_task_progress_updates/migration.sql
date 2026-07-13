-- CreateEnum
CREATE TYPE "TaskBlockerStatus" AS ENUM ('OPEN', 'RESOLVED', 'CANCELLED');

-- CreateTable
CREATE TABLE "task_progress_updates" (
    "id" TEXT NOT NULL,
    "workflowTaskId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "submittedById" TEXT,
    "completionPercent" INTEGER NOT NULL,
    "completedContent" TEXT NOT NULL,
    "nextPlan" TEXT,
    "materialAttachmentIds" JSONB,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_progress_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_blockers" (
    "id" TEXT NOT NULL,
    "progressUpdateId" TEXT NOT NULL,
    "workflowTaskId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "blockerType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "helperUserId" TEXT,
    "expectedResolvedAt" TIMESTAMP(3),
    "status" "TaskBlockerStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_blockers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "task_progress_updates_idempotencyKey_key" ON "task_progress_updates"("idempotencyKey");
CREATE INDEX "task_progress_updates_workflowTaskId_createdAt_idx" ON "task_progress_updates"("workflowTaskId", "createdAt");
CREATE INDEX "task_progress_updates_projectId_createdAt_idx" ON "task_progress_updates"("projectId", "createdAt");
CREATE INDEX "task_progress_updates_submittedById_createdAt_idx" ON "task_progress_updates"("submittedById", "createdAt");
CREATE UNIQUE INDEX "task_blockers_progressUpdateId_key" ON "task_blockers"("progressUpdateId");
CREATE INDEX "task_blockers_workflowTaskId_status_createdAt_idx" ON "task_blockers"("workflowTaskId", "status", "createdAt");
CREATE INDEX "task_blockers_projectId_status_createdAt_idx" ON "task_blockers"("projectId", "status", "createdAt");
CREATE INDEX "task_blockers_helperUserId_status_idx" ON "task_blockers"("helperUserId", "status");

-- AddForeignKey
ALTER TABLE "task_progress_updates" ADD CONSTRAINT "task_progress_updates_workflowTaskId_fkey" FOREIGN KEY ("workflowTaskId") REFERENCES "workflow_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_progress_updates" ADD CONSTRAINT "task_progress_updates_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_progress_updates" ADD CONSTRAINT "task_progress_updates_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "task_blockers" ADD CONSTRAINT "task_blockers_progressUpdateId_fkey" FOREIGN KEY ("progressUpdateId") REFERENCES "task_progress_updates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_blockers" ADD CONSTRAINT "task_blockers_workflowTaskId_fkey" FOREIGN KEY ("workflowTaskId") REFERENCES "workflow_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_blockers" ADD CONSTRAINT "task_blockers_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_blockers" ADD CONSTRAINT "task_blockers_helperUserId_fkey" FOREIGN KEY ("helperUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
