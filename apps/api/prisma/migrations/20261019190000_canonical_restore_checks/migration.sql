-- PostgreSQL 14 rewrites implicit varchar-array coercions and nested BETWEEN
-- groups on dump/restore. Use explicit text literals and flat comparisons so
-- the stored CHECK expressions round-trip without a schema-fingerprint waiver.
-- All existing bounds and NOT NULL constraints remain in force; no rows change.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE "sheet_images"
  DROP CONSTRAINT "sheet_images_layout_check",
  ADD CONSTRAINT "sheet_images_layout_check" CHECK (
    "mode"::text = ANY (ARRAY['CELL'::text, 'FLOATING'::text])
    AND "offsetX" >= -4096 AND "offsetX" <= 4096
    AND "offsetY" >= -4096 AND "offsetY" <= 4096
    AND "width" >= 16 AND "width" <= 4096
    AND "height" >= 16 AND "height" <= 4096
    AND "revision" > 0
  );

ALTER TABLE "trial_production_issues"
  DROP CONSTRAINT "trial_production_issues_text_bounds_check",
  ADD CONSTRAINT "trial_production_issues_text_bounds_check" CHECK (
    char_length("issueType"::text) >= 1 AND char_length("issueType"::text) <= 500
    AND char_length("description"::text) >= 1 AND char_length("description"::text) <= 4000
    AND char_length("responsibleDept"::text) >= 1 AND char_length("responsibleDept"::text) <= 500
  );

COMMIT;
