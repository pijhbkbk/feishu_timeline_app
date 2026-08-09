-- The company-department form may only assign one of these six governed
-- business divisions. They are reference organization rows, not editable
-- company-department records.
INSERT INTO "departments" (
  "id",
  "code",
  "name",
  "parentId",
  "path",
  "level",
  "sortOrder",
  "isActive",
  "createdAt",
  "updatedAt"
)
VALUES
  ('business_division_technology', 'BU_TECHNOLOGY', '技术中心', NULL, '/BU_TECHNOLOGY', 1, 1001, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('business_division_cv_marketing', 'BU_COMMERCIAL_VEHICLE_MARKETING', '商用车营销事业部', NULL, '/BU_COMMERCIAL_VEHICLE_MARKETING', 1, 1002, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('business_division_pv_marketing', 'BU_PASSENGER_VEHICLE_MARKETING', '乘用车营销事业部', NULL, '/BU_PASSENGER_VEHICLE_MARKETING', 1, 1003, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('business_division_manufacturing', 'BU_MANUFACTURING', '制造中心', NULL, '/BU_MANUFACTURING', 1, 1004, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('business_division_international', 'BU_INTERNATIONAL', '国际事业部', NULL, '/BU_INTERNATIONAL', 1, 1005, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('business_division_procurement', 'BU_PROCUREMENT', '采购中心', NULL, '/BU_PROCUREMENT', 1, 1006, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "parentId" = NULL,
  "path" = EXCLUDED."path",
  "level" = EXCLUDED."level",
  "sortOrder" = EXCLUDED."sortOrder",
  "isActive" = true,
  "updatedAt" = CURRENT_TIMESTAMP;
