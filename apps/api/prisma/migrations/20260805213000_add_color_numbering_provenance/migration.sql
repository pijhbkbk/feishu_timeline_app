-- R26: color numbers become an authoritative output of workflow step 05.
-- Existing codes remain legacy data until a controlled completion records
-- the full task, operator, time and confirmation-material provenance.
ALTER TABLE "colors"
  ADD COLUMN "numberingTaskId" TEXT,
  ADD COLUMN "numberedById" TEXT,
  ADD COLUMN "numberedAt" TIMESTAMP(3),
  ADD COLUMN "numberingAttachmentId" TEXT;

CREATE UNIQUE INDEX "colors_numberingTaskId_key"
  ON "colors"("numberingTaskId");

CREATE UNIQUE INDEX "colors_numberingAttachmentId_key"
  ON "colors"("numberingAttachmentId");

CREATE INDEX "colors_numberedById_numberedAt_idx"
  ON "colors"("numberedById", "numberedAt");

ALTER TABLE "colors"
  ADD CONSTRAINT "colors_numberingTaskId_fkey"
  FOREIGN KEY ("numberingTaskId") REFERENCES "workflow_tasks"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "colors"
  ADD CONSTRAINT "colors_numberedById_fkey"
  FOREIGN KEY ("numberedById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "colors"
  ADD CONSTRAINT "colors_numberingAttachmentId_fkey"
  FOREIGN KEY ("numberingAttachmentId") REFERENCES "attachments"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
