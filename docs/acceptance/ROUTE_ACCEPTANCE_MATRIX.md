# Route Acceptance Matrix

更新时间：2026-08-09

生产环境：`https://timeline.all-too-well.com`

运行代码：`535041bb25f21d548d863d07b35e3e952b0aeb2c`

2026-08-09 已将累积更新部署至精确生产域名。公开元数据与 OAuth 发起链路已复核；内置验收浏览器
当前属于无生产应用权限的测试企业，未取得正式团队已认证会话，所以受保护业务路由统一记录为
`PRODUCTION_DEPLOYED / AWAITING_AUTHENTICATED_RECHECK`。`localhost` 证据仍只证明本地行为，不用于
冒充生产产品验收。

## R27 最终源码组成候选（仅本地）

R27 在独立 worktree 的候选运行时提交
`359b3cb0c01d294d421cf173e0ef0e1d1c06ad5c` 按产品负责人批准的 Gate 0 处置清除了四个正式
Placeholder 入口。该提交未部署 staging 或 production；下表的 HTTP 结果来自候选提交的本地
Next.js production build（`http://127.0.0.1:3100`），不能替代目标环境浏览器验收。

| URL | Route component | API endpoints | Required role | Expected data | Expected action | Screenshot | Browser/runtime result | 结论 |
|---|---|---|---|---|---|---|---|---|
| `/reviews` | `apps/web/src/app/reviews/page.tsx` | 无；服务端兼容跳转 | public compatibility entry；目标业务数据仍要求登录与项目权限 | 无 | 固定跳转 `/projects`，不接受用户提供的目标地址 | 未生成；本轮只验证 HTTP | HTTP `307`，`Location: /projects`；单测 PASS | LOCAL PASS / STAGING UNRUN / PRODUCTION UNCHANGED |
| `/settings` | `apps/web/src/app/settings/page.tsx` | 无；服务端兼容跳转；目标 API 继续由既有 RBAC 保护 | public compatibility entry；目标 `/admin` 要求 `system.manage` | 无 | 固定跳转 `/admin` | 未生成；本轮只验证 HTTP | HTTP `307`，`Location: /admin`；单测 PASS | LOCAL PASS / AUTHENTICATED TARGET RECHECK PENDING |
| `/colors` | `apps/web/src/app/colors/page.tsx` | 无；服务端兼容跳转；目标颜色 API 继续沿用既有 scoped read/RBAC | public compatibility entry；目标按既有颜色档案权限 | 无 | 固定跳转 `/admin/color-database` | 未生成；本轮只验证 HTTP | HTTP `307`，`Location: /admin/color-database`；单测 PASS | LOCAL PASS / AUTHENTICATED TARGET RECHECK PENDING |
| `/projects/:projectId/:section`（不存在的 section） | 无；动态 `[section]` 兜底页已删除 | 无 | 不适用 | 无 | 返回 404；合法 section 继续由 20 个显式页面承载 | 未生成；本轮只验证 HTTP | `/projects/example/not-a-real-section` HTTP `404`；单测 PASS | LOCAL PASS / STAGING UNRUN / PRODUCTION UNCHANGED |

| URL | Route component | API / 数据源 | Required role | Expected action | Production evidence | Browser result |
|---|---|---|---|---|---|---|
| `/login`（本机） | `LoginPage` | `/api/auth/feishu/start` | public | 发起独立飞书 OAuth 尝试，不覆盖其他标签页 state | `R26_LOGIN_STATE_FIX_20260805/login-success-local.png` | LOCAL PASS：连续两次 start 共存 2 个 state Cookie |
| `/login/callback`（本机） | `LoginCallbackClient` | `/api/auth/feishu/callback`、`/api/auth/session` | public | 只消费当前登录尝试的 state，并建立系统会话 | `R26_LOGIN_STATE_FIX_20260805/login-success-local.png` | LOCAL PASS：真实飞书授权后进入 `/projects` |
| `/dashboard` | `R26Dashboard` | 真实会话、任务、动态 | authenticated | 查看当前任务或新建项目 | `03-dashboard-authenticated-1440.png` | PASS |
| `/materials/upload?taskId=cmrlmnwos00pcn401kt7obo1r`、`/dashboard`、`/projects`、`/tasks`、`/projects/cmryawpo40001pa01qbz0aly5`、`/admin/organization`（共享导航） | `AppShell` / `V2Shell` | 当前会话与各路由真实数据 | authenticated / route permission | 1440、1024、390 始终使用页头四项主导航；无固定底部导航；当前项正确；窄屏可点击、滚动且无页面级横向溢出 | `R26_RESPONSIVE_NAV_FIX_20260807/materials-upload-1440.png`、`materials-upload-1024.png`、`materials-upload-390.png`（本机交互证据） | LOCAL PASS；PRODUCTION_DEPLOYED at `535041bb...`；AWAITING_AUTHENTICATED_RECHECK |
| `/materials/upload?taskId=cmrlmnwos00pcn401kt7obo1r`、`/projects`、`/v2/dashboard`（共享页头清理） | `AppShell` / `V2Shell` / `MaterialsUploadR22` | 当前会话、任务、项目与材料真实数据 | authenticated / route permission | 共享页头不再渲染搜索、通知或帮助入口；账号菜单和主导航保留；材料页不再显示 `Required`、`Upload`、`History` | `R26_HEADER_ACTION_CLEANUP_20260808/after-materials-upload-1280.jpg`（本机交互证据） | LOCAL PASS；PRODUCTION_DEPLOYED at `535041bb...`；AWAITING_AUTHENTICATED_RECHECK |
| `/projects` | `R26Projects` | 真实项目组合 | project.read | 筛选并打开项目 | `04-projects-authenticated-1440.png`、`11-projects-production-1024.png`、`16-projects-production-390.png` | PASS |
| `/projects?focus=search` | `R26Projects` / `ProjectSearchPanel` | `GET /api/v2/projects?view=all&page=1&pageSize=50&keyword=:keyword` | project.read | 页面内搜索按项目/编号/颜色/第05步颜色编号查询；URL 与刷新恢复；清除搜索 | `R26_PROJECT_SEARCH_FIX_20260807/projects-search-filtered.png`、`projects-search-regression.png`（本机交互证据） | LOCAL PASS；PRODUCTION_DEPLOYED at `535041bb...`；AWAITING_AUTHENTICATED_RECHECK |
| `/projects`（未登录） | `V2Shell` 登录态门禁 | `/api/auth/session`、`/api/auth/feishu/start` | public | 不渲染业务外壳，直接进入飞书中国区认证 | `R26_AUTH_REDIRECT_FIX_20260731/02-after-projects-feishu-login.png` | PASS |
| `/projects/new` | `ProjectEditor` | `POST /api/projects`、服务端项目编号生成、`Project.colorMarketingUnit`、`Project.paintSupplier` | project.create | 不显示项目编号和市场；填写颜色营销单位；涂料供应商仅六项受控值 | `R26_PROJECT_CREATE_FIELDS_20260806/projects-new-six-suppliers-local.jpg`（本机交互证据） | LOCAL PASS；PRODUCTION_DEPLOYED at `535041bb...`；AWAITING_AUTHENTICATED_RECHECK，未在生产写入项目 |
| `/projects/cmrzz7z3k0001br11ep76ub1f?taskId=cms02wkmk000vbr6d3qsanep7` | `FlowMapWorkspace` | 18 节点真实流程与工序详情 | project.read | 从项目列表进入并恢复选中工序 | `05-project-workspace-authenticated-1440.png` | PASS |
| `/admin` | `AdminDashboardR22` | 系统规模与颜色归档概况 | system.manage | 进入管理或颜色数据库 | `06-admin-dashboard-authenticated-1440.png`、`12-admin-dashboard-production-1024.png`、`17-admin-dashboard-production-390.png` | PASS |
| `/admin/manage` | `AdminManageHubR26` | 管理入口 | system.manage | 进入四组管理能力 | `07-admin-manage-authenticated-1440.png`、`13-admin-manage-production-1024.png`、`18-admin-manage-production-390.png` | PASS |
| `/admin/projects` | `AdminControlCenter(projects)` | 真实项目台账 | system.manage | 固定精简九列；搜索、分页和受控编辑；表头与单元格双向居中 | `R26_TABLE_ALIGNMENT_20260805/after-admin-projects.png`（本机） | LOCAL PASS / PRODUCTION_DEPLOYED / AWAITING_AUTHENTICATED_RECHECK |
| `/admin/tasks` | `AdminControlCenter(tasks)` | 真实工序台账 | system.manage | 仅使用左侧搜索，分页和受控编辑；表头与单元格双向居中 | `R26_TABLE_ALIGNMENT_20260805/after-admin-tasks.png`（本机） | LOCAL PASS / PRODUCTION_DEPLOYED / AWAITING_AUTHENTICATED_RECHECK |
| `/admin/organization` | `AdminControlCenter(organization)` | 用户、部门、固定六项事业部和项目成员；部门批量删除命令 | system.manage + super administrator | 公司部门置前；所属事业部仅六项；新增/编辑部门只填写名称、事业部、负责人和启用状态；负责人改为姓名文字输入并由服务端精确解析为真实用户；编码、排序、审计原因由服务端管理；双向居中 | `R26_DEPARTMENT_FORM_SIMPLIFICATION_20260806/edit-finance-after.png`、`R26_DEPARTMENT_FORM_SIMPLIFICATION_20260806/create-after.png`（本机） | LOCAL PASS；PRODUCTION_DEPLOYED；migration 已应用；AWAITING_AUTHENTICATED_RECHECK，未在生产写入部门 |
| `/admin/assignments` | `AdminControlCenter(assignments)` | 18 节点分工 | system.manage | 仅显示主要分工数据，灰色辅助小字为 0；项目切换和编辑分工仍可用 | `R26_ASSIGNMENT_TABLE_CLEANUP_20260805/assignment-table-clean.png`（本机） | LOCAL PASS / PRODUCTION_DEPLOYED / AWAITING_AUTHENTICATED_RECHECK |
| `/admin/permissions` | `AdminControlCenter(permissions)` | 后端 RBAC 矩阵 | system.manage | 角色仅显示名称，不显示灰色编码/类型；角色名不逐字竖排；最右“编辑”固定 64×36px 横排；打开角色权限编辑器 | `R26_TABLE_ALIGNMENT_20260805/after-admin-permissions.png`（本机旧截图）+ 契约与计算样式审计 | LOCAL AUTOMATION PASS / PRODUCTION_DEPLOYED / AWAITING_AUTHENTICATED_RECHECK |
| `/admin/audit-logs` | `AdminAuditWorkspaceR25a` | 真实审计记录 | audit.read | 筛选、分页和查看详情；详情抽屉关闭图标中心偏差 0px | `R26_CLOSE_BUTTON_ALIGNMENT_20260805/audit-detail-centered.png`（本机） | LOCAL PASS / PRODUCTION_DEPLOYED / AWAITING_AUTHENTICATED_RECHECK |
| `/admin/color-database` | `AdminColorDatabaseR26` | 颜色与工序材料归档 | system.manage / scoped read | 查询颜色档案 | `10-admin-color-database-authenticated-1440.png`、`15-color-database-production-1024.png`、`20-color-database-production-390.png` | PASS |
| `/projects/:projectId?taskId=:step05TaskId` | `FlowMapWorkspace` / `CompletionDrawer` | 第 05 步完成预览、完成命令、颜色编号确认材料 | task owner / project manager | 输入颜色编号，验证确认材料，完成工序后读取正式编号来源；重复编号必须拒绝且不创建颜色记录 | `R26_COLOR_DATABASE_SIMULATION_20260807/02-controlled-numbering-api-simulation.json`、`02-controlled-numbering-database-evidence.json`；API 21/21 PASS；Playwright 1/1 PASS（隔离本机证据） | LOCAL_BUSINESS_PATH_PASS / DATABASE_EVIDENCE_PASS / IDEMPOTENCY_PASS / PRODUCTION_DEPLOYED / PRODUCTION_WRITE_NOT_EXECUTED / AWAITING_AUTHENTICATED_RECHECK |
| `/admin/color-database`、`/admin/color-database/:colorId` | `AdminColorDatabaseR26` | 只读受控第 05 步编号及来源完整的颜色归档 | system.manage / scoped read | 旧自由编号不可见；正式编号及来源可搜索、清除搜索并重新读取；空结果明确 | `R26_COLOR_DATABASE_SIMULATION_20260807/03-color-database-two-controlled-1440.png`、`04-color-database-search-match-1440.png`、`02-controlled-numbering-api-simulation.json`、`02-controlled-numbering-database-evidence.json`（隔离本机证据） | LOCAL_BROWSER_PASS / DATABASE_EVIDENCE_PASS / PRODUCTION_DEPLOYED / AWAITING_AUTHENTICATED_RECHECK |
| `/build-info` | `GET route` | Web build metadata | public | 验证 Web 运行身份 | `runtimeCommit=535041bb25f21d548d863d07b35e3e952b0aeb2c`、`buildTime=2026-08-09T06:49:11Z`、`release=r26-admin-535041bb25f2` | PASS（2026-08-09 精确生产域名） |
| `/api/health` | `HealthController` | API build metadata | public | 验证 API 运行身份 | `runtimeCommit=535041bb25f21d548d863d07b35e3e952b0aeb2c`、`buildTime=2026-08-09T06:49:11Z`、`release=r26-admin-535041bb25f2` | PASS（2026-08-09 精确生产域名） |
| `/api/auth/feishu/start` | `AuthController` | 飞书 OAuth | public | 使用独立 state Cookie 并跳转中国区飞书认证，回调到生产域名 | HTTP 302；`accounts.feishu.cn`；回调 `https://timeline.all-too-well.com/login/callback` | PASS（2026-08-09 精确生产域名） |

## 浏览器结果

- 飞书首次回调因无效 OAuth state 被安全拒绝；同一生产标签重新发起登录后成功建立
  `李晓晨` 的飞书会话并进入 `/projects`。
- 2026-08-05 本机复现多标签同时发起登录时固定 state Cookie 互相覆盖；改为每个 state 使用
  独立 HttpOnly Cookie 后，连续 start 可共存，真实飞书授权回调成功进入 `/projects`。该条交互证据
  仍只代表 `http://localhost:8080`；修复代码已随 2026-08-09 版本部署生产，正式团队回调复测待办。
- 2026-07-31 未登录重新打开 `/projects` 已验证直接进入
  `accounts.feishu.cn/open-apis/authen/v1/index`，不再显示业务导航和“重新读取”数据错误。
- 1440、1024、390 三档检查未发现页面级横向溢出。
- 新建的生产验收标签在上述路由中 `console/page error = 0`。
- 管理子页面未出现正式 Placeholder 文案。
- 产品负责人尚未对本次生产版本回复 `PRODUCT_OWNER_ACCEPTED`。
- 2026-08-09 累积代码已从 GitHub `main` 的不可变提交
  `535041bb25f21d548d863d07b35e3e952b0aeb2c` 部署生产；Web/API/server HEAD 四方一致，
  公共元数据和中国区飞书 OAuth 发起链路通过。
- 2026-08-09 内置验收浏览器当前位于无应用权限的测试企业；切换团队后进入正式二维码登录页，但未取得
  正式团队已认证业务会话。所有受保护页面保持 `AWAITING_AUTHENTICATED_RECHECK`，不得根据历史本机
  截图或公共健康检查宣布生产产品验收通过。
- 2026-08-03 工序台账工具栏版本已部署；独立验收浏览器访问受保护路由时进入飞书账号选择页，
  未代替产品负责人重新授权登录，故该路由保持 `AWAITING_AUTHENTICATED_RECHECK`。
- 2026-08-03 公司部门界面收敛的本机源码和自动化证据继续保留；对应代码已随 2026-08-09 版本部署
  生产，目标域名的正式团队已认证交互复核待办。
- 2026-08-03 已从前端移除全部保存视图入口，并完成公司部门选择/删除的本机真实 API 验证；
  既有内置浏览器标签停留在受限网络错误页，安全策略禁止重新导航，因此视觉确认明确保持待办。
- 2026-08-05 本机 `/admin/projects` 已固定为九列精简台账；真实搜索、刷新和表头检查通过，
  “显示完整列/使用精简列”按钮均为 `0`，console/page error 为 `0`。对应代码已部署生产，正式团队
  已认证交互复核待办。
- 2026-08-05 本机逐页检查六个后台表格路由；全部表头和单元格计算样式为
  `text-align:center / vertical-align:middle`，公司部门状态与编辑按钮间距为 `14px`。
  此交互证据只代表 localhost；对应代码已部署生产，正式团队已认证交互复核待办。
- 2026-08-05 本机 `/admin/organization` 已验证公司部门编辑面板只显示六个受控事业部；
  旧部门归属不在清单时先显示“请选择所属事业部”，不会误选第一项。数据库 migration
  已生成六个顶层参考组织，服务端同时拒绝清单外归属。对应 migration 与代码已部署生产，正式团队
  已认证交互复核待办。
- 2026-08-07 本机 `/projects?focus=search` 已完成真实浏览器回归：当时的顶部搜索入口聚焦正式
  搜索表单，带关键字 GET 返回 200 和 1 个真实项目，刷新保持结果，清除恢复 17 个项目。
- 2026-08-08 按产品决策从 `AppShell` 与 `V2Shell` 统一移除全局搜索、通知和帮助入口；项目列表
  自身的页面内搜索逻辑继续保留。原材料上传 URL、`/projects` 和 `/v2/dashboard` 本机回归通过，
  账号菜单仍可使用；对应代码已部署生产，正式团队已认证交互复核待办。

以下页面已按产品决策移除，不再属于正式路由：

- `/progress`
- `/admin/workflow-templates`
- `/admin/dictionaries`
