ALTER TABLE "admin_saved_views"
ADD COLUMN "configBytes" INTEGER;

ALTER TABLE "admin_saved_views"
ADD CONSTRAINT "admin_saved_views_configBytes_check"
CHECK (
  "configBytes" IS NULL
  OR ("configBytes" >= 0 AND "configBytes" <= 16384)
);

-- Existing rows intentionally remain NULL. Their JSON payload is quarantined
-- from application reads until a bounded service update replaces the config.
CREATE INDEX "admin_saved_views_bounded_config_idx"
ON "admin_saved_views"("userId", "pageKey", "updatedAt" DESC)
WHERE "configBytes" IS NOT NULL;
