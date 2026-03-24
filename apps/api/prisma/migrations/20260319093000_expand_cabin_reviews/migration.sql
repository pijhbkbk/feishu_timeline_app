-- AlterEnum
ALTER TYPE "ReviewResult" ADD VALUE IF NOT EXISTS 'CONDITIONAL_APPROVED';

-- AlterTable
ALTER TABLE "review_records"
ADD COLUMN "attachmentId" TEXT,
ADD COLUMN "conditionNote" TEXT,
ADD COLUMN "rejectReason" TEXT,
ADD COLUMN "returnToNodeCode" "WorkflowNodeCode",
ADD COLUMN "submittedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "review_records_attachmentId_key" ON "review_records"("attachmentId");

-- CreateIndex
CREATE INDEX "review_records_returnToNodeCode_idx" ON "review_records"("returnToNodeCode");

-- AddForeignKey
ALTER TABLE "review_records"
ADD CONSTRAINT "review_records_attachmentId_fkey"
FOREIGN KEY ("attachmentId") REFERENCES "attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
