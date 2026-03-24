-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('TASK_ASSIGNED', 'REVIEW_PENDING', 'TASK_RETURNED', 'TASK_OVERDUE', 'SYSTEM_INFO');

-- CreateEnum
CREATE TYPE "NotificationSendChannel" AS ENUM ('IN_APP', 'FEISHU');

-- CreateEnum
CREATE TYPE "NotificationSendStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- AlterType
ALTER TYPE "AuditTargetType" ADD VALUE IF NOT EXISTS 'NOTIFICATION';

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "taskId" TEXT,
    "notificationType" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "linkPath" TEXT,
    "dedupeKey" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "sendChannel" "NotificationSendChannel" NOT NULL DEFAULT 'IN_APP',
    "sendStatus" "NotificationSendStatus" NOT NULL DEFAULT 'PENDING',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_userId_isRead_createdAt_idx" ON "notifications"("userId", "isRead", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_projectId_createdAt_idx" ON "notifications"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_taskId_createdAt_idx" ON "notifications"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_notificationType_createdAt_idx" ON "notifications"("notificationType", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_sendChannel_dedupeKey_key" ON "notifications"("sendChannel", "dedupeKey");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "workflow_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
