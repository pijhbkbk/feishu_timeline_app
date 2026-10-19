ALTER TYPE "AttachmentTargetType" ADD VALUE 'SHEET_WORKBOOK';
CREATE TABLE "free_workbooks" (
 "id" UUID NOT NULL, "name" VARCHAR(200) NOT NULL, "revision" INTEGER NOT NULL DEFAULT 1,
 "snapshot" JSONB NOT NULL, "snapshotBytes" INTEGER NOT NULL, "snapshotHash" VARCHAR(64) NOT NULL,
 "createdById" TEXT NOT NULL, "updatedById" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "free_workbooks_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "free_workbooks_revision_check" CHECK ("revision" > 0),
 CONSTRAINT "free_workbooks_bytes_check" CHECK ("snapshotBytes" BETWEEN 1 AND 7340032)
);
CREATE INDEX "free_workbooks_updatedAt_id_idx" ON "free_workbooks" ("updatedAt", "id");
CREATE TABLE "free_workbook_revisions" (
 "id" UUID NOT NULL, "workbookId" UUID NOT NULL, "revision" INTEGER NOT NULL,
 "snapshot" JSONB NOT NULL, "snapshotBytes" INTEGER NOT NULL, "snapshotHash" VARCHAR(64) NOT NULL,
 "actorUserId" TEXT NOT NULL, "restoredFrom" INTEGER, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "free_workbook_revisions_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "free_workbook_revisions_workbookId_fkey" FOREIGN KEY ("workbookId") REFERENCES "free_workbooks"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "free_workbook_revisions_revision_check" CHECK ("revision" > 0),
 CONSTRAINT "free_workbook_revisions_bytes_check" CHECK ("snapshotBytes" BETWEEN 1 AND 7340032)
);
CREATE UNIQUE INDEX "free_workbook_revisions_workbookId_revision_key" ON "free_workbook_revisions"("workbookId", "revision");

ALTER TYPE "AuditTargetType" ADD VALUE 'FREE_WORKBOOK';
ALTER TABLE "free_workbooks" ADD CONSTRAINT "free_workbooks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "free_workbooks" ADD CONSTRAINT "free_workbooks_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "free_workbook_revisions" ADD CONSTRAINT "free_workbook_revisions_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
