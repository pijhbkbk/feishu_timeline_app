CREATE TABLE "project_create_command_requests" (
  "id" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "idempotencyKey" VARCHAR(128) NOT NULL,
  "requestHash" VARCHAR(64) NOT NULL,
  "projectId" TEXT NOT NULL,
  "resultSnapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_create_command_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "project_create_command_requests_actorUserId_idempotencyKey_key"
  ON "project_create_command_requests"("actorUserId", "idempotencyKey");

CREATE INDEX "project_create_command_requests_actorUserId_createdAt_idx"
  ON "project_create_command_requests"("actorUserId", "createdAt");

CREATE INDEX "project_create_command_requests_projectId_idx"
  ON "project_create_command_requests"("projectId");

ALTER TABLE "project_create_command_requests"
  ADD CONSTRAINT "project_create_command_requests_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_create_command_requests"
  ADD CONSTRAINT "project_create_command_requests_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
