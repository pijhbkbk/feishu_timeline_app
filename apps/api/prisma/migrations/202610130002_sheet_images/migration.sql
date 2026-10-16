ALTER TYPE "AttachmentTargetType" ADD VALUE 'SHEET_COLOR';
ALTER TYPE "AttachmentTargetType" ADD VALUE 'SHEET_PERSON';
ALTER TYPE "AttachmentTargetType" ADD VALUE 'SHEET_INSPECTION';
ALTER TYPE "AttachmentTargetType" ADD VALUE 'SHEET_PRODUCTION';
ALTER TABLE "attachments" ALTER COLUMN "projectId" DROP NOT NULL;
ALTER TABLE "attachment_storage_reservations" ALTER COLUMN "projectId" DROP NOT NULL;
-- Cast to text avoids using newly introduced enum literals before this migration
-- transaction commits. Legacy null-project writes stay disallowed at DB level.
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_sheet_project_check" CHECK (
  ("targetType"::text IN ('SHEET_COLOR','SHEET_PERSON','SHEET_INSPECTION','SHEET_PRODUCTION') AND "projectId" IS NULL)
  OR ("targetType"::text NOT IN ('SHEET_COLOR','SHEET_PERSON','SHEET_INSPECTION','SHEET_PRODUCTION') AND "projectId" IS NOT NULL)
);
ALTER TABLE "attachment_storage_reservations" ADD CONSTRAINT "attachment_reservations_sheet_project_check" CHECK (
  ("targetType"::text IN ('SHEET_COLOR','SHEET_PERSON','SHEET_INSPECTION','SHEET_PRODUCTION') AND "projectId" IS NULL)
  OR ("targetType"::text NOT IN ('SHEET_COLOR','SHEET_PERSON','SHEET_INSPECTION','SHEET_PRODUCTION') AND "projectId" IS NOT NULL)
);
CREATE TABLE "sheet_images" (
  "id" UUID NOT NULL, "attachmentId" TEXT NOT NULL, "targetType" "AttachmentTargetType" NOT NULL,
  "recordId" TEXT NOT NULL, "fieldKey" VARCHAR(64) NOT NULL, "mode" VARCHAR(16) NOT NULL DEFAULT 'CELL',
  "offsetX" INTEGER NOT NULL DEFAULT 0, "offsetY" INTEGER NOT NULL DEFAULT 0, "width" INTEGER NOT NULL, "height" INTEGER NOT NULL,
  "pixelWidth" INTEGER NOT NULL, "pixelHeight" INTEGER NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1, "actorUserId" TEXT NOT NULL, "operationId" VARCHAR(128) NOT NULL, "uploadHash" VARCHAR(64) NOT NULL,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false, "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sheet_images_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sheet_images_pixels_check" CHECK ("pixelWidth" > 0 AND "pixelHeight" > 0 AND "pixelWidth"::bigint * "pixelHeight"::bigint <= 40000000),
  CONSTRAINT "sheet_images_layout_check" CHECK ("mode" IN ('CELL','FLOATING') AND "offsetX" BETWEEN -4096 AND 4096 AND "offsetY" BETWEEN -4096 AND 4096 AND "width" BETWEEN 16 AND 4096 AND "height" BETWEEN 16 AND 4096 AND "revision" > 0),
  CONSTRAINT "sheet_images_target_check" CHECK ("targetType"::text IN ('SHEET_COLOR','SHEET_PERSON','SHEET_INSPECTION','SHEET_PRODUCTION'))
);
CREATE UNIQUE INDEX "sheet_images_attachmentId_key" ON "sheet_images"("attachmentId");
CREATE UNIQUE INDEX "sheet_images_actorUserId_operationId_key" ON "sheet_images"("actorUserId","operationId");
CREATE INDEX "sheet_images_targetType_recordId_isDeleted_id_idx" ON "sheet_images"("targetType","recordId","isDeleted","id");
ALTER TABLE "sheet_images" ADD CONSTRAINT "sheet_images_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "attachments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sheet_images" ADD CONSTRAINT "sheet_images_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
