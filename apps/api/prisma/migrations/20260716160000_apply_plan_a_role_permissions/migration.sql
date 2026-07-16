-- R24 前方案 A：把最小权限角色策略作为部署迁移落库，避免依赖 seed。
INSERT INTO "roles" (
  "id",
  "code",
  "name",
  "description",
  "status",
  "isSystem",
  "createdAt",
  "updatedAt"
)
VALUES (
  'plan-a-auditor-role',
  'auditor',
  '审计人员',
  '只读查看全局审计日志，不具备业务写权限。',
  'ACTIVE',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "status" = 'ACTIVE',
  "isSystem" = true,
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "role_permissions" (
  "id",
  "roleId",
  "permissionCode",
  "description",
  "createdAt",
  "updatedAt"
)
SELECT
  permission_row.id,
  role.id,
  permission_row.code,
  permission_row.description,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "roles" AS role
CROSS JOIN (
  VALUES
    ('plan-a-auditor-project-read', 'project.read', '读取项目基本信息'),
    ('plan-a-auditor-audit-read', 'audit.read', '读取全局审计日志'),
    ('plan-a-auditor-dashboard-read', 'dashboard.read', '读取工作台汇总')
) AS permission_row(id, code, description)
WHERE role."code" = 'auditor'
ON CONFLICT ("roleId", "permissionCode") DO UPDATE SET
  "description" = EXCLUDED."description",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "role_permissions" (
  "id",
  "roleId",
  "permissionCode",
  "description",
  "createdAt",
  "updatedAt"
)
SELECT
  'plan-a-project-manager-review-execute',
  role.id,
  'review.execute',
  '以项目经理身份执行或代办指定评审',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "roles" AS role
WHERE role."code" = 'project_manager'
ON CONFLICT ("roleId", "permissionCode") DO UPDATE SET
  "description" = EXCLUDED."description",
  "updatedAt" = CURRENT_TIMESTAMP;
