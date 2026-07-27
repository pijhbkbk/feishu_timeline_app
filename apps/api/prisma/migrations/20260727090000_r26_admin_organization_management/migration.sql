-- Department leaders are explicit business data. Previously the read model guessed
-- the leader from the first system administrator in a department.
ALTER TABLE "departments" ADD COLUMN "leadUserId" TEXT;

CREATE INDEX "departments_leadUserId_idx" ON "departments"("leadUserId");

ALTER TABLE "departments"
ADD CONSTRAINT "departments_leadUserId_fkey"
FOREIGN KEY ("leadUserId") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Preserve the one value that the former read model displayed, while allowing a
-- super administrator to correct it through the controlled configuration UI.
UPDATE "departments" AS department
SET "leadUserId" = (
  SELECT "id"
  FROM "users"
  WHERE "departmentId" = department."id"
    AND "status" = 'ACTIVE'
    AND "isSystemAdmin" = TRUE
  ORDER BY "createdAt" ASC
  LIMIT 1
)
WHERE department."leadUserId" IS NULL;
