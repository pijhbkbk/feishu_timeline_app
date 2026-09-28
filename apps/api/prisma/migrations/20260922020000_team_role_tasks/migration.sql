-- AlterTable
ALTER TABLE "workflow_tasks" ADD COLUMN     "assignmentEpoch" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "requiredRoleCode" TEXT;

-- AlterTable
ALTER TABLE "recurring_tasks" ADD COLUMN     "assignmentEpoch" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "requiredRoleCode" TEXT;

-- CreateIndex
CREATE INDEX "workflow_tasks_requiredRoleCode_isActive_status_assigneeUse_idx" ON "workflow_tasks"("requiredRoleCode", "isActive", "status", "assigneeUserId");

-- CreateIndex
CREATE INDEX "recurring_tasks_requiredRoleCode_status_plannedDate_idx" ON "recurring_tasks"("requiredRoleCode", "status", "plannedDate");

-- AddForeignKey
ALTER TABLE "workflow_tasks" ADD CONSTRAINT "workflow_tasks_requiredRoleCode_fkey" FOREIGN KEY ("requiredRoleCode") REFERENCES "roles"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_tasks" ADD CONSTRAINT "recurring_tasks_requiredRoleCode_fkey" FOREIGN KEY ("requiredRoleCode") REFERENCES "roles"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Required-role metadata only; preserve existing user IDs, assignees and all completed history.
INSERT INTO roles (id, code, name, status, "isSystem", "createdAt", "updatedAt") VALUES
('role_r28_project_manager', 'project_manager', '项目协调', 'ACTIVE', true, NOW(), NOW()),
('role_r28_process_engineer', 'process_engineer', '工艺', 'ACTIVE', true, NOW(), NOW()),
('role_r28_purchaser', 'purchaser', '采购', 'ACTIVE', true, NOW(), NOW()),
('role_r28_quality_engineer', 'quality_engineer', '质量试验', 'ACTIVE', true, NOW(), NOW()),
('role_r28_reviewer', 'reviewer', '评审', 'ACTIVE', true, NOW(), NOW()),
('role_r28_production_operator', 'production_operator', '生产', 'ACTIVE', true, NOW(), NOW()),
('role_r28_finance', 'finance', '财务', 'ACTIVE', true, NOW(), NOW())
ON CONFLICT (code) DO NOTHING;
UPDATE workflow_tasks SET "requiredRoleCode" = CASE "nodeCode"::text
  WHEN 'PROJECT_INITIATION' THEN 'project_manager'
  WHEN 'DEVELOPMENT_REPORT' THEN 'project_manager'
  WHEN 'PAINT_DEVELOPMENT' THEN 'process_engineer'
  WHEN 'SAMPLE_COLOR_CONFIRMATION' THEN 'reviewer'
  WHEN 'COLOR_NUMBERING' THEN 'process_engineer'
  WHEN 'PAINT_PROCUREMENT' THEN 'purchaser'
  WHEN 'STANDARD_BOARD_PRODUCTION' THEN 'process_engineer'
  WHEN 'BOARD_DETAIL_UPDATE' THEN 'process_engineer'
  WHEN 'PERFORMANCE_TEST' THEN 'quality_engineer'
  WHEN 'FIRST_UNIT_PRODUCTION_PLAN' THEN 'production_operator'
  WHEN 'TRIAL_PRODUCTION' THEN 'process_engineer'
  WHEN 'CAB_REVIEW' THEN 'reviewer'
  WHEN 'DEVELOPMENT_ACCEPTANCE' THEN 'finance'
  WHEN 'COLOR_CONSISTENCY_REVIEW' THEN 'reviewer'
  WHEN 'MASS_PRODUCTION_PLAN' THEN 'production_operator'
  WHEN 'MASS_PRODUCTION' THEN 'production_operator'
  WHEN 'VISUAL_COLOR_DIFFERENCE_REVIEW' THEN 'quality_engineer'
  WHEN 'PROJECT_CLOSED' THEN 'project_manager'
END
WHERE "isActive" = true AND status IN ('PENDING', 'READY', 'IN_PROGRESS', 'RETURNED');
UPDATE recurring_tasks SET "requiredRoleCode" = 'quality_engineer' WHERE status IN ('PENDING', 'IN_PROGRESS', 'OVERDUE');
