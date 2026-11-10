BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
CREATE TABLE "free_workbook_drafts" (
 "id" UUID NOT NULL, "workbookId" UUID NOT NULL, "authorUserId" TEXT NOT NULL,
 "draftRevision" INTEGER NOT NULL DEFAULT 1, "baseWorkbookRevision" INTEGER NOT NULL,
 "snapshot" JSONB NOT NULL, "snapshotBytes" INTEGER NOT NULL, "snapshotHash" VARCHAR(64) NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "free_workbook_drafts_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "free_workbook_drafts_revision_check" CHECK ("draftRevision" > 0 AND "baseWorkbookRevision" > 0),
 CONSTRAINT "free_workbook_drafts_bytes_check" CHECK ("snapshotBytes" BETWEEN 1 AND 7340032),
 CONSTRAINT "free_workbook_drafts_hash_check" CHECK ("snapshotHash" ~ '^[a-f0-9]{64}$'),
 CONSTRAINT "free_workbook_drafts_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "free_workbook_drafts_workbookId_fkey" FOREIGN KEY ("workbookId") REFERENCES "free_workbooks"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "free_workbook_drafts_workbookId_baseWorkbookRevision_fkey" FOREIGN KEY ("workbookId", "baseWorkbookRevision") REFERENCES "free_workbook_revisions"("workbookId", "revision") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "free_workbook_drafts_workbookId_authorUserId_key" ON "free_workbook_drafts" ("workbookId", "authorUserId");
CREATE INDEX "free_workbook_drafts_authorUserId_updatedAt_idx" ON "free_workbook_drafts" ("authorUserId", "updatedAt");
COMMIT;
