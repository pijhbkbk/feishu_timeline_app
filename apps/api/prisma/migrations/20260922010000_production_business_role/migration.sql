-- Add a business role without granting it to any existing user or rewriting history.
INSERT INTO roles (id, code, name, description, status, "isSystem", "createdAt", "updatedAt")
VALUES ('role_production_operator_v1', 'production_operator', '生产', '负责首台计划、排产与批量生产。', 'ACTIVE', true, NOW(), NOW())
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (id, "roleId", "permissionCode", "createdAt", "updatedAt")
SELECT 'permission_production_' || replace(p.code, '.', '_'), r.id, p.code, NOW(), NOW()
FROM roles r CROSS JOIN (VALUES ('project.read'), ('workflow.transition'), ('attachment.manage'), ('dashboard.read')) AS p(code)
WHERE r.code = 'production_operator'
ON CONFLICT ("roleId", "permissionCode") DO NOTHING;
