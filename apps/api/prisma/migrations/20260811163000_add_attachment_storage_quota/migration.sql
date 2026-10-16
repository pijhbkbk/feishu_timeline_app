CREATE TYPE "AttachmentBinaryState" AS ENUM (
  'RESERVED',
  'RETAINED',
  'PURGING',
  'PURGED',
  'RECONCILIATION_REQUIRED'
);

CREATE TABLE "attachment_storage_reservations" (
  "id" TEXT NOT NULL,
  "attachmentId" TEXT,
  "projectId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "targetType" "AttachmentTargetType" NOT NULL,
  "targetId" TEXT NOT NULL,
  "bucket" TEXT NOT NULL,
  "quarantineStorageKey" TEXT NOT NULL,
  "cleanStorageKey" TEXT NOT NULL,
  "reservedBytes" BIGINT NOT NULL,
  "state" "AttachmentBinaryState" NOT NULL DEFAULT 'RESERVED',
  "ownerToken" TEXT NOT NULL,
  "leaseExpiresAt" TIMESTAMP(3),
  "failureReason" TEXT,
  "purgedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "attachment_storage_reservations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "attachment_storage_reservations_reservedBytes_check"
    CHECK ("reservedBytes" >= 0)
);

CREATE UNIQUE INDEX "attachment_storage_reservations_attachmentId_key"
  ON "attachment_storage_reservations"("attachmentId");
CREATE INDEX "attachment_storage_reservations_state_leaseExpiresAt_id_idx"
  ON "attachment_storage_reservations"("state", "leaseExpiresAt", "id");
CREATE INDEX "attachment_storage_reservations_projectId_state_createdAt_idx"
  ON "attachment_storage_reservations"("projectId", "state", "createdAt");
CREATE INDEX "attachment_storage_reservations_actorUserId_state_createdAt_idx"
  ON "attachment_storage_reservations"("actorUserId", "state", "createdAt");
CREATE INDEX "attachment_storage_reservations_purgedAt_id_idx"
  ON "attachment_storage_reservations"("purgedAt", "id");

ALTER TABLE "attachment_storage_reservations"
  ADD CONSTRAINT "attachment_storage_reservations_attachmentId_fkey"
  FOREIGN KEY ("attachmentId") REFERENCES "attachments"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "attachments_projectId_isDeleted_uploadedAt_id_idx"
  ON "attachments"("projectId", "isDeleted", "uploadedAt", "id");
CREATE INDEX "attachments_projectId_targetType_targetId_isDeleted_uploadedAt_id_idx"
  ON "attachments"(
    "projectId",
    "targetType",
    "targetId",
    "isDeleted",
    "uploadedAt",
    "id"
  );

INSERT INTO "attachment_storage_reservations" (
  "id",
  "attachmentId",
  "projectId",
  "actorUserId",
  "targetType",
  "targetId",
  "bucket",
  "quarantineStorageKey",
  "cleanStorageKey",
  "reservedBytes",
  "state",
  "ownerToken",
  "leaseExpiresAt",
  "failureReason",
  "purgedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  'legacy-' || "id",
  "id",
  "projectId",
  "uploadedById",
  "targetType",
  "targetId",
  "bucket",
  CASE
    WHEN "objectKey" LIKE 'quarantine/%' THEN "objectKey"
    ELSE 'quarantine/' || "objectKey"
  END,
  CASE
    WHEN "objectKey" LIKE 'quarantine/%' THEN substring("objectKey" FROM 12)
    ELSE "objectKey"
  END,
  "fileSize"::BIGINT,
  CASE
    WHEN "scanStatus" = 'CLEAN'::"AttachmentScanStatus"
      THEN 'RETAINED'::"AttachmentBinaryState"
    ELSE 'RECONCILIATION_REQUIRED'::"AttachmentBinaryState"
  END,
  'legacy-backfill',
  CASE
    WHEN "scanStatus" = 'CLEAN'::"AttachmentScanStatus" THEN NULL
    ELSE CURRENT_TIMESTAMP
  END,
  CASE "scanStatus"
    WHEN 'CLEAN'::"AttachmentScanStatus"
      THEN 'R27A_CLEAN_BINARY_RETAINED'
    WHEN 'LEGACY_UNSCANNED'::"AttachmentScanStatus"
      THEN 'R27A_LEGACY_BINARY_INVENTORY_REQUIRED'
    WHEN 'PENDING_SCAN'::"AttachmentScanStatus"
      THEN 'R27A_STALE_PENDING_BINARY_PURGE_REQUIRED'
    WHEN 'REJECTED'::"AttachmentScanStatus"
      THEN 'R27A_REJECTED_BINARY_PURGE_REQUIRED'
    ELSE 'R27A_SCAN_ERROR_BINARY_PURGE_REQUIRED'
  END,
  NULL,
  "createdAt",
  "updatedAt"
FROM "attachments";
