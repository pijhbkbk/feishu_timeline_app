-- Additive visual ledger fields. No backfill or conversion of instrument/history data.
ALTER TABLE "inspection_objects" ADD COLUMN "productionDate" DATE;
ALTER TABLE "inspection_occurrences"
  ADD COLUMN "visualScores" JSONB,
  ADD COLUMN "manualRectification" BOOLEAN,
  ADD COLUMN "rectificationDueDate" DATE,
  ADD COLUMN "paintUnit" VARCHAR(200),
  ADD COLUMN "responsibleUnit" VARCHAR(200),
  ADD COLUMN "rectificationUnit" VARCHAR(200);
