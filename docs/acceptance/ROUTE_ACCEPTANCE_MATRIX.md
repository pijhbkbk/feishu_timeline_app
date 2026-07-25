# Route Acceptance Matrix

更新时间：2026-07-25

本矩阵区分本机 staging 与 production。`localhost` 证据不得替代
`https://timeline.all-too-well.com` 的生产证据。

| URL | Route component | API endpoints | Required role | Expected data | Expected action | Screenshot | Browser result |
|---|---|---|---|---|---|---|---|
| `/admin` | `AdminDashboardR22` | `GET /api/admin/overview` | admin + `system.manage` | 管理摘要与真实入口 | 点击入口进入真实台账 | 待生产复测 | 待生产复测 |
| `/admin/projects` | `AdminControlCenter(projects)` | `GET /api/admin/projects` | admin + `system.manage` | 项目台账 | 搜索、分页、受控编辑入口 | 待生产复测 | 待生产复测 |
| `/admin/tasks` | `AdminControlCenter(tasks)` | `GET /api/admin/tasks` | admin + `system.manage` | 工序台账 | 筛选、分页、导出与影响预览 | 待生产复测 | 待生产复测 |
| `/admin/organization` | `AdminControlCenter(organization)` | `GET /api/admin/organization` | admin + `system.manage` | 用户、部门、项目成员 | 切换真实数据子页 | 待生产复测 | 待生产复测 |
| `/admin/assignments` | `AdminControlCenter(assignments)` | `GET /api/admin/assignments` | admin + `system.manage` | 18 节点分工 | 查看服务端分配来源与预览 | 待生产复测 | 待生产复测 |
| `/admin/permissions` | `AdminControlCenter(permissions)` | `GET /api/admin/permissions` | admin + `system.manage` | RBAC 权限矩阵 | 查看真实角色与权限边界 | 待生产复测 | 待生产复测 |
| `/admin/workflow-templates` | `AdminControlCenter(workflow-templates)` | `GET /api/admin/workflow-templates` | admin + `system.manage` | 模板版本与节点 | 查看版本与新建版本入口 | 待生产复测 | 待生产复测 |
| `/admin/dictionaries` | `AdminControlCenter(dictionaries)` | `GET /api/admin/dictionaries` | admin + `system.manage` | 枚举和系统参数 | 查看真实项与受控维护入口 | 待生产复测 | 待生产复测 |
| `/admin/audit-logs` | `AdminAuditWorkspaceR25a` | `GET /api/admin/audit-logs` | admin + `system.manage` | 审计记录 | 筛选、分页与查看详情 | 待生产复测 | 待生产复测 |
| `/build-info` | `GET route` | 无业务 API | public | Web runtime metadata | 验证发布身份 | JSON 证据 | 待生产复测 |
| `/api/health` | `HealthController` | 无业务数据 | public | API runtime metadata | 验证发布身份 | JSON 证据 | 待生产复测 |
