ALTER TABLE "person_profiles" ADD COLUMN "archivedAt" TIMESTAMP(3);
CREATE INDEX "person_profiles_archivedAt_id_idx" ON "person_profiles"("archivedAt", "id");

-- Exact internal IDs only: no names, contacts or prior profiles are merged.
-- Existing foreign keys, account grants and credentials remain unchanged.
INSERT INTO "person_profiles" ("id", "userId", "name", "departmentId", "email", "mobile", "isActive", "createdAt", "updatedAt")
SELECT u."id", u."id", u."name", u."departmentId", u."email", u."mobile", (u."status" = 'ACTIVE'), u."createdAt", u."updatedAt"
FROM "users" u WHERE NOT EXISTS (SELECT 1 FROM "person_profiles" p WHERE p."userId" = u."id");
