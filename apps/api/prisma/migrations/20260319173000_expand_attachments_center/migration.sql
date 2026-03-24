ALTER TYPE "AttachmentTargetType" ADD VALUE IF NOT EXISTS 'NEW_COLOR_REPORT';

ALTER TABLE "attachments"
  ADD COLUMN "originalFileName" TEXT,
  ADD COLUMN "fileUrl" TEXT,
  ADD COLUMN "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "deletedById" TEXT;

UPDATE "attachments"
SET
  "originalFileName" = COALESCE("originalFileName", "fileName"),
  "fileUrl" = COALESCE("fileUrl", '/attachments/' || "id" || '/content'),
  "uploadedAt" = COALESCE("uploadedAt", "createdAt"),
  "isDeleted" = CASE WHEN "deletedAt" IS NULL THEN false ELSE true END;

ALTER TABLE "attachments"
  ALTER COLUMN "projectId" SET NOT NULL;

CREATE INDEX "attachments_projectId_uploadedAt_idx" ON "attachments"("projectId", "uploadedAt");
CREATE INDEX "attachments_projectId_isDeleted_uploadedAt_idx" ON "attachments"("projectId", "isDeleted", "uploadedAt");
CREATE INDEX "attachments_targetType_targetId_isDeleted_idx" ON "attachments"("targetType", "targetId", "isDeleted");
CREATE INDEX "attachments_deletedById_deletedAt_idx" ON "attachments"("deletedById", "deletedAt");

ALTER TABLE "attachments"
  ADD CONSTRAINT "attachments_deletedById_fkey"
  FOREIGN KEY ("deletedById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
