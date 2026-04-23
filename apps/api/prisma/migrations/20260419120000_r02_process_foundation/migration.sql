-- CreateEnum
CREATE TYPE "WorkflowDurationType" AS ENUM ('WORKDAY', 'SAME_DAY', 'MONTH_END', 'MONTH_OFFSET', 'MANUAL_REVIEW_PASS', 'RECURRING_MONTHLY');

-- CreateEnum
CREATE TYPE "ProcessTemplateStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "WorkCalendarDayType" AS ENUM ('WORKDAY', 'WEEKEND', 'HOLIDAY', 'ADJUSTED_WORKDAY');

-- CreateEnum
CREATE TYPE "RecurringPlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RecurringTaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SystemParameterValueType" AS ENUM ('STRING', 'NUMBER', 'BOOLEAN', 'JSON');

-- CreateEnum
CREATE TYPE "ColorExitSuggestion" AS ENUM ('EXIT', 'RETAIN', 'OBSERVE');

-- DropForeignKey
ALTER TABLE "attachments" DROP CONSTRAINT "attachments_projectId_fkey";

-- DropIndex
DROP INDEX "attachments_deletedAt_idx";

-- DropIndex
DROP INDEX "attachments_projectId_createdAt_idx";

-- DropIndex
DROP INDEX "attachments_targetType_targetId_idx";

-- DropIndex
DROP INDEX "attachments_uploadedById_createdAt_idx";

-- AlterTable
ALTER TABLE "color_exits"
ADD COLUMN "annualOutput" INTEGER,
ADD COLUMN "effectiveDate" DATE,
ADD COLUMN "exitThreshold" INTEGER,
ADD COLUMN "finalDecision" "ColorExitSuggestion",
ADD COLUMN "statisticYear" INTEGER,
ADD COLUMN "systemSuggestion" "ColorExitSuggestion",
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "workflow_instances" ADD COLUMN "templateVersion" TEXT;

-- AlterTable
ALTER TABLE "workflow_node_definitions"
ADD COLUMN "allowManualDueAt" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "allowRework" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "defaultChargeAmount" DECIMAL(12,2),
ADD COLUMN "durationType" "WorkflowDurationType",
ADD COLUMN "durationValue" INTEGER,
ADD COLUMN "formSchema" JSONB,
ADD COLUMN "isBlocking" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "isDecisionNode" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "processTemplateCode" TEXT,
ADD COLUMN "processTemplateVersion" TEXT,
ADD COLUMN "requiredAttachments" JSONB,
ADD COLUMN "stepCode" TEXT;

-- AlterTable
ALTER TABLE "workflow_tasks"
ADD COLUMN "effectiveDueAt" TIMESTAMP(3),
ADD COLUMN "idempotencyKey" TEXT,
ADD COLUMN "manualDueAt" TIMESTAMP(3),
ADD COLUMN "overdueDays" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "returnedFromTaskId" TEXT,
ADD COLUMN "reviewPassAt" TIMESTAMP(3),
ADD COLUMN "reworkReason" TEXT,
ADD COLUMN "stepCode" TEXT;

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "permissionCode" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "process_templates" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ProcessTemplateStatus" NOT NULL DEFAULT 'ACTIVE',
    "isDefault" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "process_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_calendar" (
    "id" TEXT NOT NULL,
    "calendarDate" DATE NOT NULL,
    "dayType" "WorkCalendarDayType" NOT NULL DEFAULT 'WORKDAY',
    "isWorkday" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_calendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_parameters" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "valueType" "SystemParameterValueType" NOT NULL,
    "valueText" TEXT,
    "valueNumber" DECIMAL(18,2),
    "valueBoolean" BOOLEAN,
    "valueJson" JSONB,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_parameters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_plans" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sourceWorkflowTaskId" TEXT,
    "sourceNodeCode" "WorkflowNodeCode",
    "planCode" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "totalCount" INTEGER NOT NULL,
    "generatedCount" INTEGER NOT NULL DEFAULT 0,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "status" "RecurringPlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_tasks" (
    "id" TEXT NOT NULL,
    "recurringPlanId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "taskCode" TEXT NOT NULL,
    "periodIndex" INTEGER NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "plannedDate" DATE NOT NULL,
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "reviewerId" TEXT,
    "status" "RecurringTaskStatus" NOT NULL DEFAULT 'PENDING',
    "result" "ReviewResult" NOT NULL DEFAULT 'PENDING',
    "comment" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "role_permissions_permissionCode_idx" ON "role_permissions"("permissionCode");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_roleId_permissionCode_key" ON "role_permissions"("roleId", "permissionCode");

-- CreateIndex
CREATE INDEX "process_templates_status_isDefault_idx" ON "process_templates"("status", "isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "process_templates_code_version_key" ON "process_templates"("code", "version");

-- CreateIndex
CREATE INDEX "work_calendar_dayType_isWorkday_idx" ON "work_calendar"("dayType", "isWorkday");

-- CreateIndex
CREATE UNIQUE INDEX "work_calendar_calendarDate_key" ON "work_calendar"("calendarDate");

-- CreateIndex
CREATE INDEX "system_parameters_category_isActive_idx" ON "system_parameters"("category", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "system_parameters_category_code_key" ON "system_parameters"("category", "code");

-- CreateIndex
CREATE UNIQUE INDEX "recurring_plans_planCode_key" ON "recurring_plans"("planCode");

-- CreateIndex
CREATE INDEX "recurring_plans_projectId_status_idx" ON "recurring_plans"("projectId", "status");

-- CreateIndex
CREATE INDEX "recurring_plans_sourceWorkflowTaskId_idx" ON "recurring_plans"("sourceWorkflowTaskId");

-- CreateIndex
CREATE UNIQUE INDEX "recurring_tasks_taskCode_key" ON "recurring_tasks"("taskCode");

-- CreateIndex
CREATE INDEX "recurring_tasks_projectId_status_idx" ON "recurring_tasks"("projectId", "status");

-- CreateIndex
CREATE INDEX "recurring_tasks_reviewerId_status_idx" ON "recurring_tasks"("reviewerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "recurring_tasks_recurringPlanId_periodIndex_key" ON "recurring_tasks"("recurringPlanId", "periodIndex");

-- CreateIndex
CREATE INDEX "attachments_uploadedById_uploadedAt_idx" ON "attachments"("uploadedById", "uploadedAt");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_node_definitions_stepCode_key" ON "workflow_node_definitions"("stepCode");

-- CreateIndex
CREATE INDEX "workflow_node_definitions_processTemplateCode_processTemplateVersion_sequence_idx"
ON "workflow_node_definitions"("processTemplateCode", "processTemplateVersion", "sequence");

-- CreateIndex
CREATE INDEX "workflow_tasks_idempotencyKey_idx" ON "workflow_tasks"("idempotencyKey");

-- AddForeignKey
ALTER TABLE "role_permissions"
ADD CONSTRAINT "role_permissions_roleId_fkey"
FOREIGN KEY ("roleId") REFERENCES "roles"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_tasks"
ADD CONSTRAINT "recurring_tasks_recurringPlanId_fkey"
FOREIGN KEY ("recurringPlanId") REFERENCES "recurring_plans"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments"
ADD CONSTRAINT "attachments_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "projects"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
