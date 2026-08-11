ALTER TABLE "suppliers"
  ALTER COLUMN "code" TYPE VARCHAR(64),
  ALTER COLUMN "name" TYPE VARCHAR(200),
  ALTER COLUMN "contactName" TYPE VARCHAR(100),
  ALTER COLUMN "contactPhone" TYPE VARCHAR(64);

CREATE TABLE "supplier_mutation_buckets" (
  "actorUserId" TEXT NOT NULL,
  "windowStartedAt" TIMESTAMP(3) NOT NULL,
  "requestCount" INTEGER NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "supplier_mutation_buckets_pkey" PRIMARY KEY ("actorUserId")
);

CREATE TABLE "supplier_command_requests" (
  "id" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "idempotencyKey" VARCHAR(128) NOT NULL,
  "action" VARCHAR(32) NOT NULL,
  "targetId" TEXT,
  "requestHash" VARCHAR(64) NOT NULL,
  "resultSnapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supplier_command_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "supplier_mutation_buckets_windowStartedAt_idx"
  ON "supplier_mutation_buckets"("windowStartedAt");

CREATE UNIQUE INDEX "supplier_command_requests_actorUserId_idempotencyKey_key"
  ON "supplier_command_requests"("actorUserId", "idempotencyKey");

CREATE INDEX "supplier_command_requests_actorUserId_createdAt_idx"
  ON "supplier_command_requests"("actorUserId", "createdAt");

CREATE INDEX "supplier_command_requests_createdAt_idx"
  ON "supplier_command_requests"("createdAt");

ALTER TABLE "supplier_mutation_buckets"
  ADD CONSTRAINT "supplier_mutation_buckets_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "supplier_command_requests"
  ADD CONSTRAINT "supplier_command_requests_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
