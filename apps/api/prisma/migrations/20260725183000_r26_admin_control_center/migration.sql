CREATE TABLE "admin_saved_views" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pageKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_saved_views_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "admin_command_requests" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "actorUserId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_command_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "admin_saved_views_userId_pageKey_name_key"
ON "admin_saved_views"("userId", "pageKey", "name");

CREATE INDEX "admin_saved_views_userId_pageKey_updatedAt_idx"
ON "admin_saved_views"("userId", "pageKey", "updatedAt");

CREATE UNIQUE INDEX "admin_command_requests_idempotencyKey_key"
ON "admin_command_requests"("idempotencyKey");

CREATE INDEX "admin_command_requests_projectId_action_createdAt_idx"
ON "admin_command_requests"("projectId", "action", "createdAt");

CREATE INDEX "admin_command_requests_actorUserId_createdAt_idx"
ON "admin_command_requests"("actorUserId", "createdAt");

ALTER TABLE "admin_saved_views"
ADD CONSTRAINT "admin_saved_views_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "admin_command_requests"
ADD CONSTRAINT "admin_command_requests_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "projects"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "admin_command_requests"
ADD CONSTRAINT "admin_command_requests_actorUserId_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
