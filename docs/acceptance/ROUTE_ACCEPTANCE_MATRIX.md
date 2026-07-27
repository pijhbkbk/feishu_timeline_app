# Route Acceptance Matrix

更新时间：2026-07-27

本矩阵区分本机 staging 与 production。`localhost` 证据不得替代
`https://timeline.all-too-well.com` 的生产证据。

| URL | Route component | API endpoints | Required role | Expected data | Expected action | Screenshot | Browser result |
|---|---|---|---|---|---|---|---|
| `/admin` | `AdminDashboardR22` | `GET /api/admin/overview` | admin + `system.manage` | 管理摘要与真实入口 | 点击入口进入真实台账 | `production-admin-overview.jpeg` | PASS |
| `/admin/projects` | `AdminControlCenter(projects)` | `GET /api/admin/projects` | admin + `system.manage` | 项目台账 | 搜索、分页、受控编辑入口 | `production-admin-projects.jpeg` | PASS |
| `/admin/tasks` | `AdminControlCenter(tasks)` | `GET /api/admin/tasks` | admin + `system.manage` | 工序台账 | 筛选、分页、导出与影响预览 | `production-admin-tasks.jpeg` | PASS |
| `/admin/organization` | `AdminControlCenter(organization)` | `GET /api/admin/organization` | admin + `system.manage` | 用户、部门、项目成员 | 切换真实数据子页 | `production-admin-organization.jpeg` | PASS |
| `/admin/assignments` | `AdminControlCenter(assignments)` | `GET /api/admin/assignments` | admin + `system.manage` | 18 节点分工 | 查看服务端分配来源与预览 | `production-admin-assignments.jpeg` | PASS |
| `/admin/permissions` | `AdminControlCenter(permissions)` | `GET /api/admin/permissions` | admin + `system.manage` | RBAC 权限矩阵 | 查看真实角色与权限边界 | `production-admin-permissions.jpeg` | PASS |
| `/admin/audit-logs` | `AdminAuditWorkspaceR25a` | `GET /api/admin/audit-logs` | admin + `system.manage` | 审计记录 | 筛选、分页、查看详情与刷新 | `production-admin-audit-logs.jpeg` | PASS |
| `/build-info` | `GET route` | 无业务 API | public | Web runtime metadata | 验证发布身份 | `runtimeCommit=c0a0dc8…` | PASS |
| `/api/health` | `HealthController` | 无业务数据 | public | API runtime metadata | 验证发布身份 | `runtimeCommit=c0a0dc8…` | PASS |

以下页面于 2026-07-27 按产品决策移除，不再属于正式路由：

- `/progress`（独立进展提交页；进展历史与审计数据仍保留）
- `/admin/workflow-templates`
- `/admin/dictionaries`
