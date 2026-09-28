-- CreateEnum
CREATE TYPE "TaskReminderKind" AS ENUM ('ACTIVATE', 'DUE_SOON', 'OVERDUE_DAY', 'LEGACY_TASK');

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "assignmentEpoch" INTEGER,
ADD COLUMN     "businessDate" VARCHAR(10),
ADD COLUMN     "recurringTaskId" TEXT,
ADD COLUMN     "reminderKind" "TaskReminderKind",
ADD COLUMN     "stageTaskId" TEXT;

-- CreateTable
CREATE TABLE "notification_digest_items" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "taskKey" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "workflowTaskId" TEXT,
    "recurringTaskId" TEXT,
    "stageTaskId" TEXT NOT NULL,
    "assignmentEpoch" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_digest_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminder_scan_states" (
    "name" TEXT NOT NULL,
    "cursor" TEXT NOT NULL DEFAULT '',
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reminder_scan_states_pkey" PRIMARY KEY ("name")
);

-- CreateIndex
CREATE INDEX "notification_digest_items_notificationId_id_idx" ON "notification_digest_items"("notificationId", "id");

-- CreateIndex
CREATE INDEX "notification_digest_items_projectId_idx" ON "notification_digest_items"("projectId");

-- CreateIndex
CREATE INDEX "notification_digest_items_workflowTaskId_idx" ON "notification_digest_items"("workflowTaskId");

-- CreateIndex
CREATE INDEX "notification_digest_items_recurringTaskId_idx" ON "notification_digest_items"("recurringTaskId");

-- CreateIndex
CREATE INDEX "notification_digest_items_stageTaskId_idx" ON "notification_digest_items"("stageTaskId");

-- CreateIndex
CREATE UNIQUE INDEX "notification_digest_items_notificationId_taskKey_key" ON "notification_digest_items"("notificationId", "taskKey");

-- CreateIndex
CREATE INDEX "notifications_stageTaskId_idx" ON "notifications"("stageTaskId");

-- CreateIndex
CREATE INDEX "notifications_recurringTaskId_idx" ON "notifications"("recurringTaskId");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_stageTaskId_fkey" FOREIGN KEY ("stageTaskId") REFERENCES "workflow_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recurringTaskId_fkey" FOREIGN KEY ("recurringTaskId") REFERENCES "recurring_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_digest_items" ADD CONSTRAINT "notification_digest_items_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notifications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_digest_items" ADD CONSTRAINT "notification_digest_items_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_digest_items" ADD CONSTRAINT "notification_digest_items_workflowTaskId_fkey" FOREIGN KEY ("workflowTaskId") REFERENCES "workflow_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_digest_items" ADD CONSTRAINT "notification_digest_items_recurringTaskId_fkey" FOREIGN KEY ("recurringTaskId") REFERENCES "recurring_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_digest_items" ADD CONSTRAINT "notification_digest_items_stageTaskId_fkey" FOREIGN KEY ("stageTaskId") REFERENCES "workflow_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Preserve legacy reminder history; current work cards are rebuilt with current role/stage eligibility.
UPDATE "notifications" SET "reminderKind" = 'LEGACY_TASK'
WHERE "taskId" IS NOT NULL OR metadata ? 'recurringTaskId';

ALTER TABLE "notification_digest_items" ADD CONSTRAINT "digest_exactly_one_task"
CHECK (("workflowTaskId" IS NOT NULL)::int + ("recurringTaskId" IS NOT NULL)::int = 1);
