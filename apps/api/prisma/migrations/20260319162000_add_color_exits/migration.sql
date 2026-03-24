ALTER TYPE "ColorStatus" ADD VALUE IF NOT EXISTS 'EXITED';

ALTER TYPE "AuditTargetType" ADD VALUE IF NOT EXISTS 'COLOR_EXIT';

ALTER TABLE "colors"
ADD COLUMN "exitFlag" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "exitDate" TIMESTAMP(3);

CREATE TABLE "color_exits" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "workflowTaskId" TEXT NOT NULL,
  "colorId" TEXT,
  "replacementColorId" TEXT,
  "operatorId" TEXT,
  "exitDate" TIMESTAMP(3) NOT NULL,
  "exitReason" TEXT NOT NULL,
  "description" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "color_exits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "color_exits_workflowTaskId_key" ON "color_exits"("workflowTaskId");
CREATE INDEX "color_exits_projectId_exitDate_idx" ON "color_exits"("projectId", "exitDate");
CREATE INDEX "color_exits_colorId_idx" ON "color_exits"("colorId");
CREATE INDEX "color_exits_replacementColorId_idx" ON "color_exits"("replacementColorId");
CREATE INDEX "color_exits_operatorId_exitDate_idx" ON "color_exits"("operatorId", "exitDate");
CREATE INDEX "colors_exitFlag_exitDate_idx" ON "colors"("exitFlag", "exitDate");

ALTER TABLE "color_exits"
ADD CONSTRAINT "color_exits_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "projects"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "color_exits"
ADD CONSTRAINT "color_exits_workflowTaskId_fkey"
FOREIGN KEY ("workflowTaskId") REFERENCES "workflow_tasks"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "color_exits"
ADD CONSTRAINT "color_exits_colorId_fkey"
FOREIGN KEY ("colorId") REFERENCES "colors"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "color_exits"
ADD CONSTRAINT "color_exits_replacementColorId_fkey"
FOREIGN KEY ("replacementColorId") REFERENCES "colors"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "color_exits"
ADD CONSTRAINT "color_exits_operatorId_fkey"
FOREIGN KEY ("operatorId") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
