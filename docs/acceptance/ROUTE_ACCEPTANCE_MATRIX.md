# Route Acceptance Matrix

更新时间：2026-07-31

生产环境：`https://timeline.all-too-well.com`

运行代码：`63b4998b3893b42ec7f2b80d4181d3ca37f67fa7`

本矩阵只记录 2026-07-30 至 2026-07-31 在精确生产域名完成的浏览器复核。`localhost`
证据不用于证明生产部署或产品验收。

| URL | Route component | API / 数据源 | Required role | Expected action | Production evidence | Browser result |
|---|---|---|---|---|---|---|
| `/dashboard` | `R26Dashboard` | 真实会话、任务、动态 | authenticated | 查看当前任务或新建项目 | `03-dashboard-authenticated-1440.png` | PASS |
| `/projects` | `R26Projects` | 真实项目组合 | project.read | 筛选并打开项目 | `04-projects-authenticated-1440.png`、`11-projects-production-1024.png`、`16-projects-production-390.png` | PASS |
| `/projects`（未登录） | `V2Shell` 登录态门禁 | `/api/auth/session`、`/api/auth/feishu/start` | public | 不渲染业务外壳，直接进入飞书中国区认证 | `R26_AUTH_REDIRECT_FIX_20260731/02-after-projects-feishu-login.png` | PASS |
| `/projects/cmrzz7z3k0001br11ep76ub1f?taskId=cms02wkmk000vbr6d3qsanep7` | `FlowMapWorkspace` | 18 节点真实流程与工序详情 | project.read | 从项目列表进入并恢复选中工序 | `05-project-workspace-authenticated-1440.png` | PASS |
| `/admin` | `AdminDashboardR22` | 系统规模与颜色归档概况 | system.manage | 进入管理或颜色数据库 | `06-admin-dashboard-authenticated-1440.png`、`12-admin-dashboard-production-1024.png`、`17-admin-dashboard-production-390.png` | PASS |
| `/admin/manage` | `AdminManageHubR26` | 管理入口 | system.manage | 进入四组管理能力 | `07-admin-manage-authenticated-1440.png`、`13-admin-manage-production-1024.png`、`18-admin-manage-production-390.png` | PASS |
| `/admin/projects` | `AdminControlCenter(projects)` | 真实项目台账 | system.manage | 搜索、分页和受控编辑 | `21-admin-projects-production-1440.png` | PASS |
| `/admin/tasks` | `AdminControlCenter(tasks)` | 真实工序台账 | system.manage | 筛选、分页和受控编辑 | `22-admin-tasks-production-1440.png` | PASS |
| `/admin/organization` | `AdminControlCenter(organization)` | 用户、部门和项目成员 | system.manage | 管理组织与人员 | `23-admin-organization-production-1440.png` | PASS |
| `/admin/assignments` | `AdminControlCenter(assignments)` | 18 节点分工 | system.manage | 查看和维护分工配置 | `24-admin-assignments-production-1440.png` | PASS |
| `/admin/permissions` | `AdminControlCenter(permissions)` | 后端 RBAC 矩阵 | system.manage | 打开角色权限编辑器 | `09-admin-permission-editor-open-1440.png`、`14-admin-permissions-production-1024.png`、`19-admin-permissions-production-390.png` | PASS（未保存生产变更） |
| `/admin/audit-logs` | `AdminAuditWorkspaceR25a` | 真实审计记录 | audit.read | 筛选、分页和查看详情 | `26-admin-audit-logs-production-1440.png` | PASS |
| `/admin/color-database` | `AdminColorDatabaseR26` | 颜色与工序材料归档 | system.manage / scoped read | 查询颜色档案 | `10-admin-color-database-authenticated-1440.png`、`15-color-database-production-1024.png`、`20-color-database-production-390.png` | PASS |
| `/build-info` | `GET route` | Web build metadata | public | 验证 Web 运行身份 | `runtimeCommit=63b4998b...` | PASS |
| `/api/health` | `HealthController` | API build metadata | public | 验证 API 运行身份 | `runtimeCommit=63b4998b...` | PASS |

## 浏览器结果

- 飞书首次回调因无效 OAuth state 被安全拒绝；同一生产标签重新发起登录后成功建立
  `李晓晨` 的飞书会话并进入 `/projects`。
- 2026-07-31 未登录重新打开 `/projects` 已验证直接进入
  `accounts.feishu.cn/open-apis/authen/v1/index`，不再显示业务导航和“重新读取”数据错误。
- 1440、1024、390 三档检查未发现页面级横向溢出。
- 新建的生产验收标签在上述路由中 `console/page error = 0`。
- 管理子页面未出现正式 Placeholder 文案。
- 产品负责人尚未对本次生产版本回复 `PRODUCT_OWNER_ACCEPTED`。

以下页面已按产品决策移除，不再属于正式路由：

- `/progress`
- `/admin/workflow-templates`
- `/admin/dictionaries`
