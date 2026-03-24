-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'LOCKED');

-- CreateEnum
CREATE TYPE "RoleStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProjectPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ProjectMemberType" AS ENUM ('OWNER', 'MANAGER', 'MEMBER', 'REVIEWER', 'OBSERVER');

-- CreateEnum
CREATE TYPE "ColorStatus" AS ENUM ('DRAFT', 'ACTIVE', 'APPROVED', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ColorVersionStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "WorkflowNodeCode" AS ENUM ('PROJECT_INITIATION', 'DEVELOPMENT_REPORT', 'PAINT_DEVELOPMENT', 'SAMPLE_COLOR_CONFIRMATION', 'COLOR_NUMBERING', 'PAINT_PROCUREMENT', 'PERFORMANCE_TEST', 'STANDARD_BOARD_PRODUCTION', 'BOARD_DETAIL_UPDATE', 'FIRST_UNIT_PRODUCTION_PLAN', 'TRIAL_PRODUCTION', 'CAB_REVIEW', 'DEVELOPMENT_ACCEPTANCE', 'COLOR_CONSISTENCY_REVIEW', 'MASS_PRODUCTION_PLAN', 'MASS_PRODUCTION', 'VISUAL_COLOR_DIFFERENCE_REVIEW', 'PROJECT_CLOSED');

-- CreateEnum
CREATE TYPE "WorkflowInstanceStatus" AS ENUM ('DRAFT', 'RUNNING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WorkflowTaskStatus" AS ENUM ('PENDING', 'READY', 'IN_PROGRESS', 'APPROVED', 'REJECTED', 'RETURNED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WorkflowAction" AS ENUM ('SUBMIT', 'ASSIGN', 'START', 'COMPLETE', 'APPROVE', 'REJECT', 'RETURN', 'REOPEN', 'CANCEL', 'SYSTEM_SYNC');

-- CreateEnum
CREATE TYPE "SampleType" AS ENUM ('PANEL', 'CAB', 'VEHICLE', 'OTHER');

-- CreateEnum
CREATE TYPE "SampleStatus" AS ENUM ('DRAFT', 'IN_PREPARATION', 'CONFIRMED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "StandardBoardStatus" AS ENUM ('DRAFT', 'PRODUCED', 'DISTRIBUTING', 'DISTRIBUTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DistributionStatus" AS ENUM ('PENDING', 'SENT', 'RECEIVED', 'LOST', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SupplierStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ProcurementStatus" AS ENUM ('DRAFT', 'REQUESTED', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PerformanceTestType" AS ENUM ('ADHESION', 'CORROSION', 'WEATHERING', 'CHEMICAL_RESISTANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "PerformanceTestStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'PASSED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TrialProductionStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'PASSED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReviewType" AS ENUM ('CAB_REVIEW', 'COLOR_CONSISTENCY_REVIEW', 'VISUAL_COLOR_DIFFERENCE_REVIEW', 'DEVELOPMENT_ACCEPTANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "ReviewResult" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'NEED_REWORK');

-- CreateEnum
CREATE TYPE "DevelopmentFeeType" AS ENUM ('PAINT_DEVELOPMENT', 'SAMPLE_MAKING', 'TESTING', 'STANDARD_BOARD', 'PROCUREMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "ProductionPlanType" AS ENUM ('FIRST_UNIT', 'MASS_PRODUCTION');

-- CreateEnum
CREATE TYPE "ProductionPlanStatus" AS ENUM ('DRAFT', 'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AttachmentTargetType" AS ENUM ('PROJECT', 'COLOR', 'COLOR_VERSION', 'WORKFLOW_TASK', 'SAMPLE', 'STANDARD_BOARD', 'PERFORMANCE_TEST', 'TRIAL_PRODUCTION', 'REVIEW_RECORD', 'PRODUCTION_PLAN', 'OTHER');

-- CreateEnum
CREATE TYPE "AuditTargetType" AS ENUM ('PROJECT', 'COLOR', 'COLOR_VERSION', 'WORKFLOW_INSTANCE', 'WORKFLOW_TASK', 'SAMPLE', 'STANDARD_BOARD', 'PAINT_PROCUREMENT', 'PERFORMANCE_TEST', 'TRIAL_PRODUCTION', 'REVIEW_RECORD', 'DEVELOPMENT_FEE', 'PRODUCTION_PLAN', 'ATTACHMENT', 'USER', 'ROLE', 'SUPPLIER', 'SYSTEM');

-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "path" TEXT,
    "level" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "mobile" TEXT,
    "feishuUserId" TEXT,
    "feishuOpenId" TEXT,
    "feishuUnionId" TEXT,
    "departmentId" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "isSystemAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "RoleStatus" NOT NULL DEFAULT 'ACTIVE',
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "priority" "ProjectPriority" NOT NULL DEFAULT 'MEDIUM',
    "currentNodeCode" "WorkflowNodeCode",
    "owningDepartmentId" TEXT,
    "ownerUserId" TEXT,
    "marketRegion" TEXT,
    "vehicleModel" TEXT,
    "plannedStartDate" TIMESTAMP(3),
    "plannedEndDate" TIMESTAMP(3),
    "actualStartDate" TIMESTAMP(3),
    "actualEndDate" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_members" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "memberType" "ProjectMemberType" NOT NULL,
    "title" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "colors" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ColorStatus" NOT NULL DEFAULT 'DRAFT',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "colors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "color_versions" (
    "id" TEXT NOT NULL,
    "colorId" TEXT NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "versionName" TEXT,
    "status" "ColorVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "formulaCode" TEXT,
    "changeSummary" TEXT,
    "technicalData" JSONB,
    "createdById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "color_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_node_definitions" (
    "id" TEXT NOT NULL,
    "nodeCode" "WorkflowNodeCode" NOT NULL,
    "name" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "isReviewNode" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_node_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_enum_items" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_enum_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_instances" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "instanceNo" TEXT NOT NULL,
    "versionNo" INTEGER NOT NULL DEFAULT 1,
    "templateCode" TEXT NOT NULL DEFAULT 'COLOR_DEVELOPMENT_MVP',
    "status" "WorkflowInstanceStatus" NOT NULL DEFAULT 'DRAFT',
    "currentNodeCode" "WorkflowNodeCode",
    "initiatedById" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_tasks" (
    "id" TEXT NOT NULL,
    "workflowInstanceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "taskNo" TEXT NOT NULL,
    "nodeCode" "WorkflowNodeCode" NOT NULL,
    "nodeName" TEXT NOT NULL,
    "taskRound" INTEGER NOT NULL DEFAULT 1,
    "status" "WorkflowTaskStatus" NOT NULL DEFAULT 'PENDING',
    "isPrimary" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "assigneeUserId" TEXT,
    "assigneeDepartmentId" TEXT,
    "dueAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_transitions" (
    "id" TEXT NOT NULL,
    "workflowInstanceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "fromTaskId" TEXT,
    "toTaskId" TEXT,
    "fromNodeCode" "WorkflowNodeCode",
    "toNodeCode" "WorkflowNodeCode",
    "action" "WorkflowAction" NOT NULL,
    "comment" TEXT,
    "operatorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_transitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "samples" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "colorId" TEXT,
    "colorVersionId" TEXT,
    "trialProductionId" TEXT,
    "sampleNo" TEXT NOT NULL,
    "sampleType" "SampleType" NOT NULL DEFAULT 'PANEL',
    "status" "SampleStatus" NOT NULL DEFAULT 'DRAFT',
    "location" TEXT,
    "remark" TEXT,
    "producedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "samples_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "standard_boards" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "colorId" TEXT,
    "colorVersionId" TEXT,
    "boardNo" TEXT NOT NULL,
    "status" "StandardBoardStatus" NOT NULL DEFAULT 'DRAFT',
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "producedAt" TIMESTAMP(3),
    "lastDistributedAt" TIMESTAMP(3),
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "standard_boards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "board_distribution_records" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "standardBoardId" TEXT NOT NULL,
    "recipientDepartmentId" TEXT,
    "recipientUserId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "status" "DistributionStatus" NOT NULL DEFAULT 'PENDING',
    "trackingNo" TEXT,
    "distributedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "board_distribution_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "email" TEXT,
    "status" "SupplierStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paint_procurements" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "supplierId" TEXT,
    "colorId" TEXT,
    "colorVersionId" TEXT,
    "procurementNo" TEXT NOT NULL,
    "status" "ProcurementStatus" NOT NULL DEFAULT 'DRAFT',
    "quantity" DECIMAL(18,3),
    "unit" TEXT,
    "unitPrice" DECIMAL(18,2),
    "totalAmount" DECIMAL(18,2),
    "requestedById" TEXT,
    "orderedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "paint_procurements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_tests" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sampleId" TEXT,
    "paintProcurementId" TEXT,
    "testNo" TEXT NOT NULL,
    "testType" "PerformanceTestType" NOT NULL DEFAULT 'OTHER',
    "status" "PerformanceTestStatus" NOT NULL DEFAULT 'PENDING',
    "resultSummary" TEXT,
    "resultData" JSONB,
    "testedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "performance_tests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trial_productions" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "colorId" TEXT,
    "colorVersionId" TEXT,
    "trialNo" TEXT NOT NULL,
    "status" "TrialProductionStatus" NOT NULL DEFAULT 'PLANNED',
    "quantity" INTEGER,
    "location" TEXT,
    "plannedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trial_productions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_records" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "workflowTaskId" TEXT NOT NULL,
    "trialProductionId" TEXT,
    "reviewerId" TEXT,
    "reviewType" "ReviewType" NOT NULL,
    "reviewRound" INTEGER NOT NULL DEFAULT 1,
    "result" "ReviewResult" NOT NULL DEFAULT 'PENDING',
    "comment" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "development_fees" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "supplierId" TEXT,
    "createdById" TEXT,
    "feeType" "DevelopmentFeeType" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "development_fees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_plans" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdById" TEXT,
    "planNo" TEXT NOT NULL,
    "planType" "ProductionPlanType" NOT NULL,
    "status" "ProductionPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "quantity" INTEGER,
    "plannedStartAt" TIMESTAMP(3),
    "plannedEndAt" TIMESTAMP(3),
    "actualStartAt" TIMESTAMP(3),
    "actualEndAt" TIMESTAMP(3),
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "targetType" "AttachmentTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileExtension" TEXT,
    "contentType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "checksum" TEXT,
    "uploadedById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "actorUserId" TEXT,
    "targetType" "AuditTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "nodeCode" "WorkflowNodeCode",
    "summary" TEXT,
    "beforeData" JSONB,
    "afterData" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "departments_code_key" ON "departments"("code");

-- CreateIndex
CREATE INDEX "departments_parentId_idx" ON "departments"("parentId");

-- CreateIndex
CREATE INDEX "departments_isActive_sortOrder_idx" ON "departments"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_mobile_key" ON "users"("mobile");

-- CreateIndex
CREATE UNIQUE INDEX "users_feishuUserId_key" ON "users"("feishuUserId");

-- CreateIndex
CREATE UNIQUE INDEX "users_feishuOpenId_key" ON "users"("feishuOpenId");

-- CreateIndex
CREATE UNIQUE INDEX "users_feishuUnionId_key" ON "users"("feishuUnionId");

-- CreateIndex
CREATE INDEX "users_departmentId_status_idx" ON "users"("departmentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE INDEX "roles_status_idx" ON "roles"("status");

-- CreateIndex
CREATE INDEX "user_roles_roleId_idx" ON "user_roles"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_userId_roleId_key" ON "user_roles"("userId", "roleId");

-- CreateIndex
CREATE UNIQUE INDEX "projects_code_key" ON "projects"("code");

-- CreateIndex
CREATE INDEX "projects_status_currentNodeCode_idx" ON "projects"("status", "currentNodeCode");

-- CreateIndex
CREATE INDEX "projects_owningDepartmentId_status_idx" ON "projects"("owningDepartmentId", "status");

-- CreateIndex
CREATE INDEX "projects_ownerUserId_status_idx" ON "projects"("ownerUserId", "status");

-- CreateIndex
CREATE INDEX "project_members_userId_memberType_idx" ON "project_members"("userId", "memberType");

-- CreateIndex
CREATE UNIQUE INDEX "project_members_projectId_userId_memberType_key" ON "project_members"("projectId", "userId", "memberType");

-- CreateIndex
CREATE UNIQUE INDEX "colors_code_key" ON "colors"("code");

-- CreateIndex
CREATE INDEX "colors_projectId_status_idx" ON "colors"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "colors_projectId_name_key" ON "colors"("projectId", "name");

-- CreateIndex
CREATE INDEX "color_versions_colorId_status_idx" ON "color_versions"("colorId", "status");

-- CreateIndex
CREATE INDEX "color_versions_createdById_idx" ON "color_versions"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "color_versions_colorId_versionNo_key" ON "color_versions"("colorId", "versionNo");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_node_definitions_nodeCode_key" ON "workflow_node_definitions"("nodeCode");

-- CreateIndex
CREATE INDEX "workflow_node_definitions_isActive_sequence_idx" ON "workflow_node_definitions"("isActive", "sequence");

-- CreateIndex
CREATE INDEX "system_enum_items_category_sortOrder_idx" ON "system_enum_items"("category", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "system_enum_items_category_code_key" ON "system_enum_items"("category", "code");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_instances_instanceNo_key" ON "workflow_instances"("instanceNo");

-- CreateIndex
CREATE INDEX "workflow_instances_projectId_status_idx" ON "workflow_instances"("projectId", "status");

-- CreateIndex
CREATE INDEX "workflow_instances_status_currentNodeCode_idx" ON "workflow_instances"("status", "currentNodeCode");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_instances_projectId_versionNo_key" ON "workflow_instances"("projectId", "versionNo");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_tasks_taskNo_key" ON "workflow_tasks"("taskNo");

-- CreateIndex
CREATE INDEX "workflow_tasks_workflowInstanceId_status_idx" ON "workflow_tasks"("workflowInstanceId", "status");

-- CreateIndex
CREATE INDEX "workflow_tasks_projectId_nodeCode_status_idx" ON "workflow_tasks"("projectId", "nodeCode", "status");

-- CreateIndex
CREATE INDEX "workflow_tasks_assigneeUserId_status_idx" ON "workflow_tasks"("assigneeUserId", "status");

-- CreateIndex
CREATE INDEX "workflow_tasks_assigneeDepartmentId_status_idx" ON "workflow_tasks"("assigneeDepartmentId", "status");

-- CreateIndex
CREATE INDEX "workflow_tasks_projectId_nodeCode_isPrimary_isActive_idx" ON "workflow_tasks"("projectId", "nodeCode", "isPrimary", "isActive");

-- CreateIndex
CREATE INDEX "workflow_transitions_workflowInstanceId_createdAt_idx" ON "workflow_transitions"("workflowInstanceId", "createdAt");

-- CreateIndex
CREATE INDEX "workflow_transitions_projectId_createdAt_idx" ON "workflow_transitions"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "workflow_transitions_action_createdAt_idx" ON "workflow_transitions"("action", "createdAt");

-- CreateIndex
CREATE INDEX "samples_projectId_status_idx" ON "samples"("projectId", "status");

-- CreateIndex
CREATE INDEX "samples_colorId_idx" ON "samples"("colorId");

-- CreateIndex
CREATE INDEX "samples_trialProductionId_idx" ON "samples"("trialProductionId");

-- CreateIndex
CREATE UNIQUE INDEX "samples_projectId_sampleNo_key" ON "samples"("projectId", "sampleNo");

-- CreateIndex
CREATE INDEX "standard_boards_projectId_status_idx" ON "standard_boards"("projectId", "status");

-- CreateIndex
CREATE INDEX "standard_boards_colorId_idx" ON "standard_boards"("colorId");

-- CreateIndex
CREATE UNIQUE INDEX "standard_boards_projectId_boardNo_key" ON "standard_boards"("projectId", "boardNo");

-- CreateIndex
CREATE INDEX "board_distribution_records_projectId_status_idx" ON "board_distribution_records"("projectId", "status");

-- CreateIndex
CREATE INDEX "board_distribution_records_standardBoardId_status_idx" ON "board_distribution_records"("standardBoardId", "status");

-- CreateIndex
CREATE INDEX "board_distribution_records_recipientDepartmentId_status_idx" ON "board_distribution_records"("recipientDepartmentId", "status");

-- CreateIndex
CREATE INDEX "board_distribution_records_recipientUserId_status_idx" ON "board_distribution_records"("recipientUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_code_key" ON "suppliers"("code");

-- CreateIndex
CREATE INDEX "suppliers_status_name_idx" ON "suppliers"("status", "name");

-- CreateIndex
CREATE INDEX "paint_procurements_projectId_status_idx" ON "paint_procurements"("projectId", "status");

-- CreateIndex
CREATE INDEX "paint_procurements_supplierId_status_idx" ON "paint_procurements"("supplierId", "status");

-- CreateIndex
CREATE INDEX "paint_procurements_colorId_idx" ON "paint_procurements"("colorId");

-- CreateIndex
CREATE UNIQUE INDEX "paint_procurements_projectId_procurementNo_key" ON "paint_procurements"("projectId", "procurementNo");

-- CreateIndex
CREATE INDEX "performance_tests_projectId_status_idx" ON "performance_tests"("projectId", "status");

-- CreateIndex
CREATE INDEX "performance_tests_sampleId_idx" ON "performance_tests"("sampleId");

-- CreateIndex
CREATE INDEX "performance_tests_paintProcurementId_idx" ON "performance_tests"("paintProcurementId");

-- CreateIndex
CREATE UNIQUE INDEX "performance_tests_projectId_testNo_key" ON "performance_tests"("projectId", "testNo");

-- CreateIndex
CREATE INDEX "trial_productions_projectId_status_idx" ON "trial_productions"("projectId", "status");

-- CreateIndex
CREATE INDEX "trial_productions_colorId_idx" ON "trial_productions"("colorId");

-- CreateIndex
CREATE UNIQUE INDEX "trial_productions_projectId_trialNo_key" ON "trial_productions"("projectId", "trialNo");

-- CreateIndex
CREATE INDEX "review_records_projectId_reviewType_result_reviewedAt_idx" ON "review_records"("projectId", "reviewType", "result", "reviewedAt");

-- CreateIndex
CREATE INDEX "review_records_trialProductionId_idx" ON "review_records"("trialProductionId");

-- CreateIndex
CREATE INDEX "review_records_reviewerId_reviewedAt_idx" ON "review_records"("reviewerId", "reviewedAt");

-- CreateIndex
CREATE UNIQUE INDEX "review_records_workflowTaskId_reviewerId_key" ON "review_records"("workflowTaskId", "reviewerId");

-- CreateIndex
CREATE INDEX "development_fees_projectId_feeType_occurredAt_idx" ON "development_fees"("projectId", "feeType", "occurredAt");

-- CreateIndex
CREATE INDEX "development_fees_supplierId_idx" ON "development_fees"("supplierId");

-- CreateIndex
CREATE INDEX "production_plans_projectId_planType_status_idx" ON "production_plans"("projectId", "planType", "status");

-- CreateIndex
CREATE UNIQUE INDEX "production_plans_projectId_planNo_key" ON "production_plans"("projectId", "planNo");

-- CreateIndex
CREATE UNIQUE INDEX "attachments_objectKey_key" ON "attachments"("objectKey");

-- CreateIndex
CREATE INDEX "attachments_projectId_createdAt_idx" ON "attachments"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "attachments_targetType_targetId_idx" ON "attachments"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "attachments_uploadedById_createdAt_idx" ON "attachments"("uploadedById", "createdAt");

-- CreateIndex
CREATE INDEX "attachments_deletedAt_idx" ON "attachments"("deletedAt");

-- CreateIndex
CREATE INDEX "audit_logs_projectId_createdAt_idx" ON "audit_logs"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_targetType_targetId_createdAt_idx" ON "audit_logs"("targetType", "targetId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_actorUserId_createdAt_idx" ON "audit_logs"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_nodeCode_createdAt_idx" ON "audit_logs"("nodeCode", "createdAt");

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_owningDepartmentId_fkey" FOREIGN KEY ("owningDepartmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colors" ADD CONSTRAINT "colors_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "color_versions" ADD CONSTRAINT "color_versions_colorId_fkey" FOREIGN KEY ("colorId") REFERENCES "colors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "color_versions" ADD CONSTRAINT "color_versions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_instances" ADD CONSTRAINT "workflow_instances_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_instances" ADD CONSTRAINT "workflow_instances_initiatedById_fkey" FOREIGN KEY ("initiatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_tasks" ADD CONSTRAINT "workflow_tasks_workflowInstanceId_fkey" FOREIGN KEY ("workflowInstanceId") REFERENCES "workflow_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_tasks" ADD CONSTRAINT "workflow_tasks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_tasks" ADD CONSTRAINT "workflow_tasks_assigneeUserId_fkey" FOREIGN KEY ("assigneeUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_tasks" ADD CONSTRAINT "workflow_tasks_assigneeDepartmentId_fkey" FOREIGN KEY ("assigneeDepartmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_transitions" ADD CONSTRAINT "workflow_transitions_workflowInstanceId_fkey" FOREIGN KEY ("workflowInstanceId") REFERENCES "workflow_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_transitions" ADD CONSTRAINT "workflow_transitions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_transitions" ADD CONSTRAINT "workflow_transitions_fromTaskId_fkey" FOREIGN KEY ("fromTaskId") REFERENCES "workflow_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_transitions" ADD CONSTRAINT "workflow_transitions_toTaskId_fkey" FOREIGN KEY ("toTaskId") REFERENCES "workflow_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_transitions" ADD CONSTRAINT "workflow_transitions_operatorUserId_fkey" FOREIGN KEY ("operatorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "samples" ADD CONSTRAINT "samples_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "samples" ADD CONSTRAINT "samples_colorId_fkey" FOREIGN KEY ("colorId") REFERENCES "colors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "samples" ADD CONSTRAINT "samples_colorVersionId_fkey" FOREIGN KEY ("colorVersionId") REFERENCES "color_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "samples" ADD CONSTRAINT "samples_trialProductionId_fkey" FOREIGN KEY ("trialProductionId") REFERENCES "trial_productions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "standard_boards" ADD CONSTRAINT "standard_boards_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "standard_boards" ADD CONSTRAINT "standard_boards_colorId_fkey" FOREIGN KEY ("colorId") REFERENCES "colors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "standard_boards" ADD CONSTRAINT "standard_boards_colorVersionId_fkey" FOREIGN KEY ("colorVersionId") REFERENCES "color_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_distribution_records" ADD CONSTRAINT "board_distribution_records_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_distribution_records" ADD CONSTRAINT "board_distribution_records_standardBoardId_fkey" FOREIGN KEY ("standardBoardId") REFERENCES "standard_boards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_distribution_records" ADD CONSTRAINT "board_distribution_records_recipientDepartmentId_fkey" FOREIGN KEY ("recipientDepartmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_distribution_records" ADD CONSTRAINT "board_distribution_records_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paint_procurements" ADD CONSTRAINT "paint_procurements_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paint_procurements" ADD CONSTRAINT "paint_procurements_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paint_procurements" ADD CONSTRAINT "paint_procurements_colorId_fkey" FOREIGN KEY ("colorId") REFERENCES "colors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paint_procurements" ADD CONSTRAINT "paint_procurements_colorVersionId_fkey" FOREIGN KEY ("colorVersionId") REFERENCES "color_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paint_procurements" ADD CONSTRAINT "paint_procurements_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_tests" ADD CONSTRAINT "performance_tests_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_tests" ADD CONSTRAINT "performance_tests_sampleId_fkey" FOREIGN KEY ("sampleId") REFERENCES "samples"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_tests" ADD CONSTRAINT "performance_tests_paintProcurementId_fkey" FOREIGN KEY ("paintProcurementId") REFERENCES "paint_procurements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trial_productions" ADD CONSTRAINT "trial_productions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trial_productions" ADD CONSTRAINT "trial_productions_colorId_fkey" FOREIGN KEY ("colorId") REFERENCES "colors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trial_productions" ADD CONSTRAINT "trial_productions_colorVersionId_fkey" FOREIGN KEY ("colorVersionId") REFERENCES "color_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_records" ADD CONSTRAINT "review_records_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_records" ADD CONSTRAINT "review_records_workflowTaskId_fkey" FOREIGN KEY ("workflowTaskId") REFERENCES "workflow_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_records" ADD CONSTRAINT "review_records_trialProductionId_fkey" FOREIGN KEY ("trialProductionId") REFERENCES "trial_productions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_records" ADD CONSTRAINT "review_records_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "development_fees" ADD CONSTRAINT "development_fees_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "development_fees" ADD CONSTRAINT "development_fees_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "development_fees" ADD CONSTRAINT "development_fees_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_plans" ADD CONSTRAINT "production_plans_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_plans" ADD CONSTRAINT "production_plans_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreatePartialUniqueIndex
CREATE UNIQUE INDEX "workflow_tasks_active_primary_project_node_key"
ON "workflow_tasks" ("projectId", "nodeCode")
WHERE "isPrimary" = true AND "isActive" = true;

-- CreateFunction
CREATE OR REPLACE FUNCTION prevent_audit_logs_delete()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs cannot be physically deleted';
END;
$$ LANGUAGE plpgsql;

-- CreateTrigger
CREATE TRIGGER "audit_logs_no_delete"
BEFORE DELETE ON "audit_logs"
FOR EACH ROW
EXECUTE FUNCTION prevent_audit_logs_delete();
