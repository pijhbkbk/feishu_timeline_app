-- Explicit admission only: existing accounts and role memberships are unchanged.
ALTER TABLE "users" ADD COLUMN "teamAccessApproved" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "sample_confirmations" ADD COLUMN "actualConfirmedAt" TIMESTAMP(3),
  ADD COLUMN "confirmationParty" VARCHAR(200), ADD COLUMN "confirmationAttachmentId" VARCHAR(64);
ALTER TABLE "projects" ADD COLUMN "requiresApprovedReport" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "approvedReportDate" TIMESTAMP(3), ADD COLUMN "approvalReference" VARCHAR(200),
  ADD COLUMN "approvedReportAttachmentId" TEXT;
CREATE UNIQUE INDEX "projects_approvedReportAttachmentId_key" ON "projects"("approvedReportAttachmentId");
ALTER TABLE "projects" ADD CONSTRAINT "projects_approvedReportAttachmentId_fkey" FOREIGN KEY ("approvedReportAttachmentId") REFERENCES "attachments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sample_confirmations" ADD CONSTRAINT "sample_confirmations_confirmationAttachmentId_fkey" FOREIGN KEY ("confirmationAttachmentId") REFERENCES "attachments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
