-- Expand only the explicitly authorized workbook asset target. Every other
-- non-project attachment and reservation remains forbidden by these checks.
ALTER TABLE "attachments" DROP CONSTRAINT "attachments_sheet_project_check";
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_sheet_project_check" CHECK (
  ("targetType"::text IN ('SHEET_COLOR','SHEET_PERSON','SHEET_INSPECTION','SHEET_PRODUCTION','SHEET_WORKBOOK') AND "projectId" IS NULL)
  OR ("targetType"::text NOT IN ('SHEET_COLOR','SHEET_PERSON','SHEET_INSPECTION','SHEET_PRODUCTION','SHEET_WORKBOOK') AND "projectId" IS NOT NULL)
);
ALTER TABLE "attachment_storage_reservations" DROP CONSTRAINT "attachment_reservations_sheet_project_check";
ALTER TABLE "attachment_storage_reservations" ADD CONSTRAINT "attachment_reservations_sheet_project_check" CHECK (
  ("targetType"::text IN ('SHEET_COLOR','SHEET_PERSON','SHEET_INSPECTION','SHEET_PRODUCTION','SHEET_WORKBOOK') AND "projectId" IS NULL)
  OR ("targetType"::text NOT IN ('SHEET_COLOR','SHEET_PERSON','SHEET_INSPECTION','SHEET_PRODUCTION','SHEET_WORKBOOK') AND "projectId" IS NOT NULL)
);
ALTER TABLE "sheet_images" DROP CONSTRAINT "sheet_images_target_check";
ALTER TABLE "sheet_images" ADD CONSTRAINT "sheet_images_target_check" CHECK (
  "targetType"::text IN ('SHEET_COLOR','SHEET_PERSON','SHEET_INSPECTION','SHEET_PRODUCTION','SHEET_WORKBOOK')
);
