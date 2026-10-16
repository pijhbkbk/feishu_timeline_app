ALTER TYPE "AuditTargetType" ADD VALUE 'PERSON_PROFILE';

CREATE TABLE "person_profiles" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "name" VARCHAR(100) NOT NULL,
  "departmentId" TEXT,
  "position" VARCHAR(100),
  "email" VARCHAR(160),
  "mobile" VARCHAR(32),
  "note" VARCHAR(2000),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "person_profiles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "person_profiles_revision_check" CHECK ("revision" > 0)
);
CREATE UNIQUE INDEX "person_profiles_userId_key" ON "person_profiles"("userId");
CREATE INDEX "person_profiles_departmentId_isActive_id_idx" ON "person_profiles"("departmentId", "isActive", "id");
CREATE INDEX "person_profiles_name_id_idx" ON "person_profiles"("name", "id");
ALTER TABLE "person_profiles" ADD CONSTRAINT "person_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "person_profiles" ADD CONSTRAINT "person_profiles_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve identity, all historical foreign keys and source text. Never infer a
-- match from names, phones or departments; no credentials/roles are created.
-- Existing values exceeding the new limits intentionally block migration;
-- do not silently truncate source data or bypass the Prisma migration.
INSERT INTO "person_profiles" ("id", "userId", "name", "departmentId", "email", "mobile", "isActive", "createdAt", "updatedAt")
SELECT "id", "id", "name", "departmentId", "email", "mobile", ("status" = 'ACTIVE'), "createdAt", "updatedAt" FROM "users";
