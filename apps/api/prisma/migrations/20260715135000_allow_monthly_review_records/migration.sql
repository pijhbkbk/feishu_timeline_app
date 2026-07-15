ALTER TABLE "review_records"
ADD COLUMN "reviewPeriod" TEXT NOT NULL DEFAULT 'TASK';

DROP INDEX "review_records_workflowTaskId_reviewerId_key";

CREATE UNIQUE INDEX "review_records_workflowTaskId_reviewerId_reviewPeriod_key"
ON "review_records"("workflowTaskId", "reviewerId", "reviewPeriod");
