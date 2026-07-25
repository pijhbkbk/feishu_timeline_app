-- R26 Gate 3A adds scoped project-member/assignment concurrency and idempotency.
CREATE TYPE "ProjectAssignmentSource" AS ENUM (
  'TASK_OVERRIDE',
  'PROJECT_NODE_OVERRIDE',
  'PROJECT_DEPARTMENT_LEAD',
  'PROJECT_DEFAULT_ASSIGNEE',
  'SINGLE_ELIGIBLE_MEMBER',
  'UNASSIGNED'
);

ALTER TABLE "projects"
ADD COLUMN "memberAssignmentVersion" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "project_node_assignments" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "nodeCode" "WorkflowNodeCode" NOT NULL,
  "primaryDepartmentId" TEXT,
  "ownerUserId" TEXT,
  "collaboratorUserIds" JSONB,
  "reviewerUserIds" JSONB,
  "assignmentSource" "ProjectAssignmentSource" NOT NULL DEFAULT 'PROJECT_NODE_OVERRIDE',
  "version" INTEGER NOT NULL DEFAULT 1,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "project_node_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "r26_command_requests" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "result" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "r26_command_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "project_node_assignments_projectId_nodeCode_key"
ON "project_node_assignments"("projectId", "nodeCode");

CREATE INDEX "project_node_assignments_ownerUserId_nodeCode_idx"
ON "project_node_assignments"("ownerUserId", "nodeCode");

CREATE INDEX "project_node_assignments_primaryDepartmentId_nodeCode_idx"
ON "project_node_assignments"("primaryDepartmentId", "nodeCode");

CREATE UNIQUE INDEX "r26_command_requests_idempotencyKey_key"
ON "r26_command_requests"("idempotencyKey");

CREATE INDEX "r26_command_requests_projectId_action_createdAt_idx"
ON "r26_command_requests"("projectId", "action", "createdAt");

CREATE INDEX "r26_command_requests_actorUserId_createdAt_idx"
ON "r26_command_requests"("actorUserId", "createdAt");

ALTER TABLE "project_node_assignments"
ADD CONSTRAINT "project_node_assignments_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_node_assignments"
ADD CONSTRAINT "project_node_assignments_primaryDepartmentId_fkey"
FOREIGN KEY ("primaryDepartmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "project_node_assignments"
ADD CONSTRAINT "project_node_assignments_ownerUserId_fkey"
FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "project_node_assignments"
ADD CONSTRAINT "project_node_assignments_updatedById_fkey"
FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "r26_command_requests"
ADD CONSTRAINT "r26_command_requests_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "r26_command_requests"
ADD CONSTRAINT "r26_command_requests_actorUserId_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
