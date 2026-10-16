-- Preserve old audit/history rows while retiring reminders that lack current
-- ownership and stage bindings. New ACTIVATE reminders are safely regenerated.
UPDATE "notifications"
SET "reminderKind" = 'LEGACY_TASK'
WHERE "reminderKind" IS NULL AND "dedupeKey" LIKE 'team-monthly:%';
