# Route Acceptance Matrix

## 最新用户确认（2026-09-14 10:56）

用户已确认正式原生账号可以登录并进入工作台，附Safari截图。限定范围 `USER_CONFIRMED_NATIVE_LOGIN_DASHBOARD`。随后浏览器实际读取 `/projects`（原项目10/18）、`/account`、`/admin/accounts`（用户名搜索命中）、组织人员页面；`/build-info` 正文显示6c70完整版本。上述路由更新为 `BROWSER_READ_OBSERVED`，登录至工作台更新为 `USER_CONFIRMED`，不代表写操作/全路由验收。详见 [本次证据](NATIVE_ACCOUNTS_20260912/owner-browser-confirmation-20260914.json)。

工作台“当前还没有项目”与项目列表一条项目不一致，保留开放UI问题。注册/恢复/改密/正式授权写入、完整Network/console和响应式矩阵、别名与callback仍待验收。以下之前的连接失败记录保留历史范围；本次未改变运行程序、数据库、main或tag。


## 10:56用户确认之前的状态：2026-09-14 原生账号修正版

生产精确域名 `https://timeline.all-too-well.com`，Web/API/server checkout均为 `6c70a897ec7643f4681616d801481765aaa8f7bc`。程序切换时间 `2026-09-14T01:56:49.490849+00:00`；身份、镜像和数据库见 [实际运行证明](NATIVE_ACCOUNTS_20260912/production-runtime-6c70.json)。本轮27次HTTPS验证通过，但当前浏览器控制连接不可用，不能替代交互验收。用户解锁后的旧版Chrome原生表单观察及后续连接失败见 [浏览器记录](NATIVE_ACCOUNTS_20260912/browser-resume-20260914.md)。新版本1440/1024/390截图、刷新持久性、浏览器Network/console和登录后操作仍待取得；未获得产品负责人确认。

| 精确URL | Route component | API endpoints | Required role | Expected data/action | 新版证据/截图 | 浏览器结论 |
|---|---|---|---|---|---|---|
| https://timeline.all-too-well.com/login | LoginPage | POST auth/login、register、recover；GET auth/session | public | 原生登录/注册/恢复；格式约束兼容Unicode Sets | 新版HTML模式与9静态脚本200；原管理员登录HTTP200；无新版浏览器截图 | PENDING_BROWSER_CONNECTION |
| https://timeline.all-too-well.com/login/callback | LoginCallbackClient | 无第三方身份交换 | public | 旧登录退役，引导返回原生登录 | 旧OAuth发起410、无Location；页面未复验 | PENDING_BROWSER_CONNECTION |
| https://timeline.all-too-well.com/account | AccountPage | session、auth/job、auth/password | native authenticated | 岗位意向、改密、权限状态 | 既有本机/真实PG验证按未变代码保留；新版生产操作未执行 | PENDING_BROWSER_CONNECTION |
| https://timeline.all-too-well.com/dashboard | V2Shell / Dashboard | session、dashboard | 授权角色 | 原管理员进入真实工作台 | 原生身份与会话HTTPS200；新版浏览器路径未执行 | PENDING_BROWSER_CONNECTION |
| https://timeline.all-too-well.com/projects | V2Shell / Projects | session、projects | project.read及数据范围 | 读取既有项目与历史 | 正式项目读取200；更新前后全部业务表不变；新版截图未取得 | PENDING_BROWSER_CONNECTION |
| https://timeline.all-too-well.com/admin/accounts | AccountsPage | GET auth/accounts；POST recovery | isSystemAdmin | 账号目录、凭据状态及恢复 | 正式目录200、既有管理员可登录匹配；页面操作未执行 | PENDING_BROWSER_CONNECTION |
| https://timeline.all-too-well.com/v2/admin/accounts | AccountsPage alias | 同正式目录 | isSystemAdmin | 显式别名一致 | 源码/构建；生产别名未操作 | PENDING_BROWSER_CONNECTION |
| https://timeline.all-too-well.com/admin/organization | AdminControlCenter | admin/organization及预览/命令 | system.manage及受限管理员动作 | 保留旧ID，正式部门/岗位/项目授权 | 新身份权限负向的原验证按依据保留；新版配置操作未执行 | PENDING_BROWSER_CONNECTION |
| https://timeline.all-too-well.com/build-info | Web metadata | 同URL | public | 精确6c70 SHA/tree/release/time | 新版HTTPS200，完整身份匹配；不是产品验收 | HTTP_PASS |
| https://timeline.all-too-well.com/api/health | HealthController | 同URL | public | 与Web及server版本一致 | 新版HTTPS200，完整身份匹配；不是产品验收 | HTTP_PASS |

正式源码Placeholder0，测试白名单10。staging没有URL/版本/用户路径验收；main/tag未改变。整组生产页面保持 `DEPLOYMENT_UNVERIFIED / AWAITING_PRODUCT_OWNER_CONFIRMATION`。以下历史记录保留其时间与环境，不作为本轮浏览器PASS。

---

## 2026-08-09 及后续历史记录

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


## 2026-09-12 原生账号候选（历史 OAuth PASS 不适用于本轮）

运行候选 `1767dbb5eeb30cc57835081de761e1eccb8fac8b`；本机 `http://127.0.0.1:3350`。2026-09-12 本机 Chrome Incognito 已对最终候选复验登录与下述页面；前一候选 `5daaf7f…` 的普通账号岗位/重启观察按未变化源码明确复用，不能冒充最终全部重跑。12:30 UTC Web/API 元数据再次一致，记录见 `NATIVE_ACCOUNTS_20260912/browser/runtime-after-browser.json`。生产 `https://timeline.all-too-well.com` 本次未部署，11:55 UTC只读仍为旧 `535041bb…`。所有本轮生产用户路径均 NOT_EXECUTED，不能沿用上表历史 OAuth PASS。

| URL（本机；生产同路径未部署） | Route component | API endpoints | Required role | Expected data/action | Screenshot / browser result | 本轮状态 |
|---|---|---|---|---|---|---|
| `/login` | LoginPage | POST `/api/auth/login`、`register`、`recover`；GET `session` | public | 原生登录、注册、一次性恢复；无第三方入口 | 最终合成管理员登录成功；login/register/recover 各三档 PNG 见浏览器清单；新凭据提交另有 HTTP 证据 | LOCAL_BROWSER_PARTIAL |
| `/login/callback` | LoginCallbackClient | 无外部身份交换 | public | 旧入口停用并引导返回登录 | 源码/构建检查；本轮浏览器未执行 | NOT_ACCEPTED |
| `/account` | AccountPage + AppShell | GET `session`；POST `/auth/job`、`/auth/password` | native authenticated | 岗位仅为意向，刷新保留；改密撤销旧会话 | 最终三档 PNG 及手机底部截图，控制台保留一条用户名自动填充建议、无应用异常；此前岗位/重启/退出观察按依据复用；改密 HTTP PASS，浏览器提交未执行 | LOCAL_BROWSER_PARTIAL |
| `/dashboard`、`/projects` | V2Shell + 既有业务页 | GET `session`、业务 API | 后端角色及项目范围 | 未授权进入账号页；授权用户查看真实数据 | 合成管理员登录进入真实空工作台；项目范围 14 HTTP 请求 PASS；完整业务写入浏览器待办 | LOCAL_BROWSER_PARTIAL |
| `/admin/accounts`、`/v2/admin/accounts` | AccountsPage | GET `/api/auth/accounts`；POST `/api/auth/accounts/:id/recovery` | isSystemAdmin | 有界搜索/原生凭据状态/一次性恢复码 | 最终正式 `/admin/accounts` 搜索命中/空结果、三档 PNG、刷新后23个200 GET的脱敏HAR；普通账号拒绝有既有观察和HTTP证据；恢复签发和显式别名路由浏览器未执行 | LOCAL_BROWSER_PARTIAL |
| `/admin/organization` | 既有 AdminControlCenter | GET `/api/admin/organization`；既有预览/命令接口 | system.manage + 受限系统管理员动作 | 原生可登录状态、角色/部门/项目授权，保留旧 ID 并撤销旧会话 | HTTP 读取及真实 PostgreSQL 权限/并发负向 PASS；浏览器配置待办 | NOT_ACCEPTED |
| `/build-info`、`/api/health` | Web metadata / HealthController | GET 相同路径 | public | 与固定候选完整 SHA/tree/release 一致 | 最终本机两个响应均 200 且身份一致；不单独证明产品完成 | LOCAL_METADATA_PASS |

正式源码 Placeholder 0；测试白名单10行。登录/注册/恢复表单、账号目录与个人账号页的1440/1024/390三档已有17张截图及可保存网络/控制台证据；尚未覆盖全部路由和受控写入，整组路由不得标记 PASS。详见 [浏览器清单](NATIVE_ACCOUNTS_20260912/browser/manifest.json) 与 [候选证据与阻塞](NATIVE_ACCOUNTS_20260912/README.md)。


## 2026-09-13 原生账号正式域名切换记录

当前运行提交 `f2da3629e13b2653aae8879c98992877d5ef4170`；正式切换时间 `2026-09-12T17:38:51+00:00`。原有本机及历史飞书截图仍保留其原范围。当前Mac锁屏，正式域名浏览器截图、Network、console与交互待解锁后取得；HTTP验证不替代页面验收。

| 精确URL | Route component | API endpoints | Required role | Expected data/action | 当前证据 | 浏览器结论 |
|---|---|---|---|---|---|---|
| https://timeline.all-too-well.com/login | LoginPage | POST /api/auth/login、register、recover；GET session | public | 原生账号登录/注册/恢复，无第三方登录按钮 | 正式密码登录/Origin负向/退出HTTP PASS；尚无正式页面截图 | PENDING_MAC_UNLOCK |
| https://timeline.all-too-well.com/login/callback | LoginCallbackClient | 不交换第三方身份 | public | 旧登录入口停用，返回原生登录 | 旧OAuth发起HTTP410且无跳转；页面待验收 | PENDING_MAC_UNLOCK |
| https://timeline.all-too-well.com/account | AccountPage | session、auth/job、auth/password | native authenticated | 岗位意向、密码管理和权限状态 | 本机页面与新HTTP/数据库测试按既有证据范围保留 | PENDING_MAC_UNLOCK |
| https://timeline.all-too-well.com/dashboard | V2Shell / Dashboard | session、dashboard | 授权角色 | 原管理员查看真实工作台 | 正式原管理员会话/身份HTTP PASS | PENDING_MAC_UNLOCK |
| https://timeline.all-too-well.com/projects | V2Shell / Projects | session、projects | project.read及数据范围 | 读取迁移保留项目 | 正式管理员项目读取200，未认证401；迁移项目与历史保留 | PENDING_MAC_UNLOCK |
| https://timeline.all-too-well.com/admin/accounts | AccountsPage | GET /api/auth/accounts；POST recovery | isSystemAdmin | 原生账号目录/凭据状态与恢复管理 | 正式目录读取200、原管理员账号匹配；截图与交互待验收 | PENDING_MAC_UNLOCK |
| https://timeline.all-too-well.com/v2/admin/accounts | AccountsPage alias | 同上 | isSystemAdmin | 显式别名路径一致 | 源码/本机构建验证；正式别名页面待验收 | PENDING_MAC_UNLOCK |
| https://timeline.all-too-well.com/admin/organization | AdminControlCenter | admin/organization及预览/命令 | system.manage及受限管理员动作 | 用户、岗位、部门和正式授权 | 新身份权限/并发负向的既有真实PG证据保留；正式配置交互待验收 | PENDING_MAC_UNLOCK |
| https://timeline.all-too-well.com/build-info | Web metadata | 同URL | public | f2da完整版本/release/buildTime | 实际HTTPS200且准确身份 | HTTP_PASS / NOT_PRODUCT_ACCEPTANCE |
| https://timeline.all-too-well.com/api/health | HealthController | 同URL | public | f2da完整版本/release/buildTime | 实际HTTPS200且准确身份 | HTTP_PASS / NOT_PRODUCT_ACCEPTANCE |

当前源码Placeholder扫描：正式源码0，测试白名单10行（7个getByPlaceholder、3个禁止占位断言），与未改动Web源码相符。产品负责人未确认，整组生产页面不能标记PASS。


## 2026-09-18 固定c5正式域名验收（替代旧待解锁状态，历史不改写）

Production `https://timeline.all-too-well.com`，runtime `c5aed415cd17e6e8a21b422a4c5c92b4b924e091`；2026-09-17 09:27:01.821805Z更新。身份/构建/数据库/上游见[实际运维记录](NATIVE_RELEASE_20260917/PRODUCTION_OPERATIONS_RESULT_20260918.md)。截图位于私有交付目录 `verification/browser-20260918`；摘要及观察到的API见[本轮清单](NATIVE_A2_20260917/production-browser-20260918.json)。页面请求清单是真实观察，无浏览器响应状态HAR；[18项正常TLS状态检查](NATIVE_A2_20260917/production-http-c5.json)分开保留。

| 精确URL | Route component | API endpoints | Required role | 实际数据/操作 | Screenshot / browser result | 本轮状态 |
|---|---|---|---|---|---|---|
| https://timeline.all-too-well.com/login | LoginPage | POST auth/login；GET auth/session | public | 原用户名密码登录到工作台；退出刷新为原生登录，无第三方入口 | login-final-390-viewport.png；其余两档见清单 | 原生登录/退出PASS；注册/恢复UI提交未执行 |
| https://timeline.all-too-well.com/login/callback | LoginCallbackClient | 无第三方交换 | public | 显示旧入口停用，点击返回账号登录 | callback-{1440,1024,390}-viewport.png | BROWSER_PASS |
| https://timeline.all-too-well.com/dashboard | V2 DashboardPage/V2Shell | GET auth/session、v2/dashboard | 已授权原管理员 | 无待办正确提示；刷新保持；打开原项目列表 | dashboard-{1440,1024,390}-viewport.png | 修复BROWSER_PASS；无横向溢出 |
| https://timeline.all-too-well.com/projects | V2 Projects | GET v2/projects、auth/session | project.read及范围 | 1项目，10/18；刷新和打开详情 | projects-1440-viewport.png；原项目详情截图/DOM | READ_PATH_PASS；未写真实业务 |
| https://timeline.all-too-well.com/account | AccountPage/AppShell | GET auth/session；写auth/password未执行 | native authenticated | 本地账号身份、改密表单、管理入口可见 | account-{1440,1024,390}-viewport.png | READ_PATH_PASS；改密提交待人工 |
| https://timeline.all-too-well.com/admin/accounts | AccountsPage | GET auth/accounts（含搜索） | isSystemAdmin | 12历史账号、原密码账号状态；搜索命中/空结果/刷新 | accounts-*-viewport.png、search DOM | READ_SEARCH_PASS；恢复签发UI未执行 |
| https://timeline.all-too-well.com/v2/admin/accounts | AccountsPage alias | GET auth/accounts、auth/session | isSystemAdmin | 与正式目录一致的真实12行 | accounts-alias-{1440,1024,390}-viewport.png | READ_ALIAS_PASS |
| https://timeline.all-too-well.com/admin/organization | AdminControlCenter | GET admin/organization、auth/session | system.manage | 12人员、原生凭据标记及角色可见 | organization-1440-viewport.png | READ_PATH_PASS；授权写UI未执行 |
| https://timeline.all-too-well.com/build-info | Web metadata | GET同路径 | public | 实际正常TLS200/c5，浏览器JSON导航被客户端阻止，原页面未改变 | server/HTTP记录 | HTTP_METADATA_PASS；不冒称浏览器正文通过 |
| https://timeline.all-too-well.com/api/health | HealthController | GET同路径 | public | 实际正常TLS200/c5，Web/API/server身份一致 | server/HTTP记录 | HTTP_METADATA_PASS |

捕获console warn/error为0；工具不提供独立pageerror流，不扩大解释。旧fullPage拼接异常不作视觉判据；用viewport图及最终稳定login图。自己的浏览器会话已退出，未更改用户Safari会话。账号名称含历史mock前缀只是保留旧作者/关系，mock登录接口实际403，不能据历史名称推导登录旁路。

受控写入/越权/并发/恢复/扫描的技术结果来自同c5隔离A3（253HTTP）和独立B（21+22HTTP等分项）；没有为验收推进生产真实项目。用户先前明确接受“原生登录→工作台”继续有效，整个产品未获PRODUCT_OWNER_ACCEPTED。上述READ_PASS只代表所列读取路径，整组含写入UI的路由不标整体PASS。本机 https://localhost:9444/login 仍因用户暂缓证书处理NOT_ACCEPTED。正式Placeholder0，10条测试白名单按未变源码复用。


## 2026-09-18 登录体验/工号/8字符产品策略（最终541）

Runtime `541b3dfff682aa29b49a96b251f0a084903c981a`，正式更新03:40:16Z。环境/镜像/数据库/来源和独立技术结果见[NATIVE_LOGIN_EXPERIENCE_20260918](NATIVE_LOGIN_EXPERIENCE_20260918/README.md)。截图均在该记录的私有screenshots目录，SHA256清单已提交。以下PASS仅对应本轮具体检查，不代替产品负责人接受。

| 精确URL/模式 | Component | API | Required role | 数据与实际动作 | Screenshot | 本轮结果 |
|---|---|---|---|---|---|---|
| https://timeline.all-too-well.com/login 登录 | LoginPage/AppShell | auth/login、auth/session | public | 工号/请输入工号；原长密码登录、进入工作台、退出后硬刷新 | production-login-{1440,390}.png | 登录与两档布局PASS |
| 同精确/login 注册模式 | LoginPage | auth/register | public | 次要链接打开同440px/16px表单；真实8/7设置在隔离HTTP/PG/CLI完成 | production-register-{1440,390}.png | UI布局PASS；生产注册提交未执行 |
| 同精确/login 恢复模式 | LoginPage | auth/recover | public + recovery token | 次要链接打开同窄表单，新密码8字符；隔离真实恢复8/7与撤销通过 | production-recover-{1440,390}.png | UI布局PASS；生产恢复提交未执行 |
| https://timeline.all-too-well.com/login/callback | LoginCallbackClient | 不交换第三方身份 | public | 工号文案、440px卡片和返回链接可见 | production-callback-1440.png | 读取/布局PASS；最终点击后目标导航未观察 |
| https://timeline.all-too-well.com/account | AccountPage | auth/session、auth/password | native authenticated | 原lixiaochen显示工号，改密8字符提示；未输入新凭据 | production-original-account-1440.png | 读取/标签PASS；改密UI提交未执行 |
| https://timeline.all-too-well.com/admin/accounts | AccountsPage | auth/accounts（含搜索） | system admin | 原12目录；工号搜索命中原人且角色保持 | production-accounts-search-1440.png | 读取/搜索PASS；恢复签发UI未执行 |
| https://timeline.all-too-well.com/admin/organization | AdminControlCenter | admin/organization；配置写入未执行 | system.manage | 打开新增表单核对工号与请输入工号后取消，未保存 | production-organization-label-1440.png | 标签PASS；配置写UI未执行 |
| https://timeline.all-too-well.com/dashboard | V2 Dashboard | auth/session、v2/dashboard | 授权原管理员 | 登录到达，刷新保持，无待办正确提示 | production-original-account-dashboard-1440.png | 读取回归PASS |
| https://timeline.all-too-well.com/projects | V2 Projects | v2/projects | project.read与scope | 原1项目10/18可读，工作区保持原宽度，无业务写 | production-original-projects-1440.png | 读取/宽度回归PASS |

本轮未改的显式/v2/admin/accounts别名不额外重跑，其既有c5映射证据按源码未变复用，不冒称541重新截图。仅两档为所有者本轮要求，未机械重跑历史全三档。正式Placeholder0，10条测试白名单；所有者本次接受尚待确认。

## 2026-09-18 指定管理员、登录首页与账号安全（最终22aac）

运行 `22aac0a1b9fe975f60d599f8dbe7be20bcbca1b1`；正式2026-09-18T08:40:11.588218Z。状态及摘要见 [机器结果](NATIVE_OWNER_HOME_20260918/result.json)。截图位于私有 `var/owner-admin-delivery-20260918/screenshots`；production为精确正式hostname，local仅代表 `http://127.0.0.1:3350` 隔离环境。旧路由未重复创建，旧内嵌改密REMOVED，资料路由REPLACED，V2业务页STILL_ACTIVE。

| 精确URL | Component | API | Role | 数据/动作 | Screenshot | 本轮结果 |
|---|---|---|---|---|---|---|
| https://timeline.all-too-well.com/login | LoginPage / PasswordField / auth-navigation | auth/login、auth/session | public | 所有者原账号原密码从退出状态正常登录→dashboard | production-login-{desktop,mobile}.png | OWNER_CONFIRMED，真实路径与布局PASS |
| https://timeline.all-too-well.com/dashboard | RealDashboard / V2Shell | v2/dashboard、auth/session | 已授予角色；admin附管理视图 | 登录到达、刷新保持，项目/账号/组织/权限链接真实可用 | production-admin-workspace-{desktop,mobile}.png | 正式读取与管理员路径PASS |
| https://timeline.all-too-well.com/account | AccountPage / AppShell | auth/session | authenticated | 头像主动进入姓名/工号/真实角色/组织，无默认密码表单 | production-account-{desktop,mobile}.png | 正式读取与布局PASS |
| https://timeline.all-too-well.com/account/security | AccountSecurityPage | auth/session；auth/password仅隔离HTTP提交 | authenticated | 主动二级入口；480px/16px、48px输入、8–128及显示切换 | production-security-{desktop,mobile}.png | 读取布局PASS；浏览器改密提交NOT_EXECUTED |
| https://timeline.all-too-well.com/admin/accounts | AccountsPage | auth/accounts | system administrator | 指定账号真实admin；读取未签发恢复码 | production-authenticated-browser.json资源及观察记录 | 读取PASS；生产写入未执行 |
| https://timeline.all-too-well.com/admin/organization | AdminControlCenter | admin/organization | system.manage | 实际13账号及角色，未修改其他账号 | 同上 | 读取PASS |
| https://timeline.all-too-well.com/admin/permissions | AdminControlCenter | admin/permissions | system.manage | 后端实际角色权限矩阵 | 同上 | 读取PASS |
| https://timeline.all-too-well.com/projects | ProjectsPage | v2/projects | project.read/scope | 原1项目10/18，无业务写入 | production-projects-desktop.png | 读取/历史保护PASS |
| http://127.0.0.1:3350/pending-access | PendingAccessPage | auth/session、auth/job | ordinary unassigned | 普通正常登录及直接后台URL均到受限页；管理员不被待分配阻挡 | local-pending-desktop.png | 隔离PASS；生产普通账号UI未执行 |
| http://127.0.0.1:3350/login 注册/恢复模式 | LoginPage | auth/register、auth/recover（真实HTTP另列） | public | 窄卡片、次要入口，8/7/长密码与恢复撤销由隔离HTTP验证 | local-{register,recover}-{desktop,mobile}.png | 隔离布局PASS；UI凭据提交未执行 |

普通同名/角色参数/浏览器字段/直接管理URL负向，岗位项目授权与撤销、8/7/长密码、主机grant幂等和最小恢复见分项记录。正式没有修改真实密码或项目；第二次正式手动退出再登录未重复，合成循环通过。正式Placeholder0/测试白名单10；用户已确认指定登录路径，不等于所有路由写操作或完整产品接受。


## R28 2026-09-28 本地技术验证，正式域名待复验

环境：local-development，http://127.0.0.1:3100；本机源码运行，非固定发布runtime。生产仍22aac，本组不宣称PRODUCTION_ACCEPTED。所有者确认未取得。

| 路由 | 组件 | 真实API | 角色/数据 | 操作与浏览器结果 | 截图证据 | 状态 |
|---|---|---|---|---|---|---|
| /dashboard | features/team-work/team-workspace.tsx | /team-tasks | 已分配业务角色、真实队列 | 登录、已完成页签、进入项目；1440/1024/390通过 | test-results/r28-native-closed-chrome | LOCAL PASS / PROD PENDING |
| /projects、/projects/:id | features/color-projects/color-projects.tsx、features/v2/real-workspace-page.tsx | /projects、/workflows/projects/:id | 真实A/B已关闭项目 | 列表、详情、任务入口、刷新 | 同上 | LOCAL PASS / PROD PENDING |
| /projects/:id/tasks/:taskId | features/team-work/task-workspace | /v2/tasks/:id/progress-context、materials/history | 对应业务角色、历史任务/材料 | V1/V2 PDF真实下载200；写/幂等由HTTP主流程验证 | 同上 | LOCAL PASS / PROD PENDING |
| /admin/people | features/people | /people | 管理员、合成人员 | 保存角色、刷新保持、三档布局 | test-results/r28-people-notifications-final | LOCAL PASS / PROD PENDING |
| /projects/:id/production-plans | schedule-plans-workspace | /projects/:id/production-plans | 纯生产角色 | 登录后新建排产按钮可用，实际保存由HTTP主流程覆盖 | 同上/pure-production-plan.png | LOCAL PASS / PROD PENDING |
| /notifications | features/team-work/notifications | /notifications | 已分配用户、持久提醒 | 全部已读后刷新仍0未读 | 同上/notifications-read.png | LOCAL PASS / PROD PENDING |

上述截图根下按Playwright子目录保存。中间失败截图与日志保留；本地扫描器local-eicar不能代表正式ClamAV验证。M4需按实际组件路径与精确生产URL补齐矩阵和固定版本。

## R28 2026-09-29 正式程序e917：公开路径通过，登录后路径待复验

环境production；精确URL均为 `https://timeline.all-too-well.com`，runtime `e917da56b9fca54a40635364e168fdb26a080fb1`，切换2026-09-29T00:57:22.219797Z。镜像/数据库/Nginx/source identity见[R28正式记录](R28_PRODUCTION_20260929/README.md)。产品负责人未确认；本机PASS及昨日29ed观察不冒称最终新版本页面PASS。

| 精确URL | Route component | API endpoints | Required role | 预期数据与操作 | Screenshot / browser result | 本轮结果 |
|---|---|---|---|---|---|---|
| https://timeline.all-too-well.com/login | app/login/page、LoginPage | auth/session、auth/login | public | 原生登录；外部身份关闭；停用合成账号拒登 | 私有var/r28-patch-release/production-browser/login-{1440,1024,390}.png，public-browser.json有实际Network/status及pageerror | PUBLIC_BOUNDARY_PASS；原管理员成功登录待恢复 |
| https://timeline.all-too-well.com/dashboard | features/team-work/team-workspace.tsx | team-tasks、v2/dashboard | 已授业务角色；管理汇总按管理员 | 普通/月度共享待办，读取、页签、领取/转派、刷新 | e917固定本机已验证；昨日29ed正式管理汇总观察保留；新正式截图待登录 | PENDING_AUTHENTICATED_RECHECK |
| https://timeline.all-too-well.com/admin/people | features/personnel/personnel-workspace.tsx | people、people/:id | system.manage/管理员 | 真实分页人员、七角色、保存与再读取；合成账号停用审计 | 昨日29ed三档/停用/刷新及审计PASS；e917服务器只读确认停用事实保留；新页面待登录 | PENDING_AUTHENTICATED_RECHECK |
| https://timeline.all-too-well.com/projects | features/color-projects/color-projects.tsx:ColorProjects | projects | project.read/团队范围 | 真实项目六字段、搜索/空态、三档卡片和打开详情 | 原29ed手机失败保留，e917固定本机PASS；正式未登录访问实际转/login | PENDING_MOBILE_FIX_RECHECK |
| https://timeline.all-too-well.com/projects/new | features/color-projects/color-projects.tsx:NewColorProject | auth/session；POST projects | project.create/项目协调或管理员 | 基本信息表单、校验、幂等创建 | 隔离HTTP/浏览器创建覆盖；正式不为测试新建真实项目，表单读取待登录 | PENDING_AUTHENTICATED_RECHECK |
| https://timeline.all-too-well.com/projects/cmrzz7z3k0001br11ep76ub1f | features/v2/real-workspace-page.tsx | v2/projects/:id/workspace、workflows/projects/:id | project.read/团队范围；写按固定角色+领取 | 原项目10/18、实际主责生产；三档详情不裁切、关闭点击、刷新 | 原29ed手机详情/角色失败保留；e917固定镜像本机三档PASS；真实刷新因过期会话转/login | PENDING_DETAIL_FIX_RECHECK |
| 同上精确项目URL，资料页签 | 项目工作区与AttachmentWorkspace | attachments及项目业务实体目录 | 附件读取范围；写按管理/工序权限 | 真实材料/空态、过滤、版本和归属 | 昨日29ed材料0及真实请求观察保留；新正式页面待登录 | PENDING_AUTHENTICATED_RECHECK |
| 同上精确项目URL，记录页签 | RealWorkspace projectRecords | v2/projects/:id/workspace | project.read/团队范围 | 历史事实可读、未被更新覆盖 | 隔离及数据库保全PASS；新正式页面待登录 | PENDING_AUTHENTICATED_RECHECK |
| https://timeline.all-too-well.com/projects/cmrzz7z3k0001br11ep76ub1f/tasks/cms02wkmk000vbr6d3qsanep7 | features/team-work/task-workspace.tsx | v2/tasks/:id/progress-context、materials/history | project.read；写须对应角色并领取 | 真实首台生产计划工作单、材料/历史、只读与办理提示 | 本机真实API/材料PDF已验证；正式不推进真实工序，读取待登录 | PENDING_AUTHENTICATED_RECHECK |
| https://timeline.all-too-well.com/notifications | features/team-work/notifications.tsx | notifications/my、unread-count、mark-read | 当前已认证用户 | 持久提醒、分页、已读刷新保持 | e917固定本机读取/退出通过；此前本机已读真实写入通过；正式待登录 | PENDING_AUTHENTICATED_RECHECK |
| https://timeline.all-too-well.com/build-info | Web metadata | 同路径 | public | 实际e917/buildTime/release，正常TLS | public-metadata.json，HTTP200 | METADATA_PASS |
| https://timeline.all-too-well.com/api/health | HealthController | 同路径 | public | API与Web/服务器HEAD一致 | public-metadata.json，HTTP200 | METADATA_PASS |

R28导航与路由：旧工作台和项目列表REPLACED，项目详情STILL_ACTIVE并整合资料/记录，旧账号/组织管理入口LEGACY_ONLY（正式人员入口统一/admin/people），旧成员/节点配置/角色自定义写入REMOVED并由后端410拒绝。未新增切换产品版本的Feature Flag；NEXT_PUBLIC配置固定随镜像构建。

本轮重新扫描正式Placeholder0、测试白名单10（7个getByPlaceholder及3个禁止占位断言）。未执行远端staging；main/tag未变。整个正式路由组不能标记PASS，等待原管理员恢复登录后继续实际页面验证及最终产品负责人确认。


## 2026-10-09 SINGLE_DEPARTMENT_UI_M1 本机增量

本表追加，不改写此前正式网站结论。environment=isolated-local-synthetic；hostname=127.0.0.1；数据库m1_http；runtime code commit=`a0769e7808ace84a05a36bed6c0edc2e81d097c6`。本机3350同源代理→Web3352/API3351，构建与配置身份见 [M1回执](SINGLE_DEPARTMENT_UI_M1/README.md)。PASS表示所列浏览器技术检查，不等于PRODUCT_OWNER_ACCEPTED。

主截图和原始项目来自10月8日不可变版本2PASS；10月9日相同版本、最终本机代理配置下再次2PASS/exit0，新增项目及网络见 `SINGLE_DEPARTMENT_UI_M1/local-runtime-final.json` 和 `browser-receipt-resumed.json`，新截图在 `var/m1-evidence/screenshots-resumed`。原项目、截图、恢复和Safari局部复核保持可追溯，不把不同运行合并为同一次执行。

API列省略统一/api前缀。获准成员指原生ACTIVE且teamAccessApproved=true，普通成员没有系统管理员权。

| 精确URL | route component | API endpoints | required role / expected data | expected action | screenshot | browser result / PASS-FAIL |
| --- | --- | --- | --- | --- | --- | --- |
| [/login](http://127.0.0.1:3350/login) | `app/login/page.tsx` | `POST /auth/login; GET /auth/session` | 未登录／合成获准、错误密码、停用 | 登录进工作台，错误/停用拒绝 | [实际截图](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/m1-evidence/screenshots/02-login-1440.png) | PASS（Chrome）；Safari登录PASS |
| [/pending-access](http://127.0.0.1:3350/pending-access) | `app/pending-access/page.tsx` | `GET /auth/session; GET /projects/:id→403` | 已登录但teamAccessApproved=false | 未准入业务403，不自授 | [实际截图](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/m1-evidence/final-supplement/2026-10-09T00-42-41-815Z/pending-access-1440x900.png) | PASS（Chrome未准入403）；补拍1440/390通过，助手最终另一步FAIL见报告 |
| [/dashboard?project=cmuzblrjd00039kdr1xsn8bzr&taskId=cmuzblvyr002t9kdrg1muwczs](http://127.0.0.1:3350/dashboard?project=cmuzblrjd00039kdr1xsn8bzr&taskId=cmuzblvyr002t9kdrg1muwczs) | `app/dashboard/page.tsx → M1Dashboard / M1FlowMap` | `GET /projects?pageSize=50; GET /v2/projects/:id/workspace` | 获准普通成员；真实双颜色/18节点 | 切换颜色不串；进入确认、保存返回同颜色/节点 | [实际截图](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/m1-evidence/screenshots/03-dashboard-1440.png) | PASS（Chrome）；四宽见对照；Safari读取及返回URL PASS |
| [/projects?keyword=%E5%90%88%E6%88%90%E7%81%B0%E7%BB%BF](http://127.0.0.1:3350/projects?keyword=%E5%90%88%E6%88%90%E7%81%B0%E7%BB%BF) | `app/projects/page.tsx → ColorProjects` | `GET /projects` | 获准普通成员；真实分页/筛选项目行 | 筛选→进入项目→取消返回保留参数，前进后退保留脏态 | [实际截图](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/m1-evidence/screenshots/04-projects-1440.png) | PASS（Chrome）；四宽见对照 |
| [/projects/new?from=dashboard](http://127.0.0.1:3350/projects/new?from=dashboard) | `app/projects/new/page.tsx → NewColorProject` | `POST /projects; GET /v2/tasks/:id/progress-context; POST /v2/tasks/:id/materials; POST /projects/:id/approved-report` | 获准普通成员；合成已批PDF/实际日期/批准依据 | 真实建项上传扫描登记01/02，不直接改库 | [实际截图](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/m1-evidence/supplemental/new-project.png) | PASS（Chrome）；两个项目建成、取消脏态检查 |
| [/projects/cmuzblrjd00039kdr1xsn8bzr?tab=flow](http://127.0.0.1:3350/projects/cmuzblrjd00039kdr1xsn8bzr?tab=flow) | `app/projects/[projectId]/page.tsx → ColorProjectOverview` | `GET /projects/:id; GET /v2/projects/:id/workspace` | 获准普通成员；真实项目/材料/审计 | 查看同一状态图、进入任务和来源返回 | [实际截图](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/m1-evidence/screenshots/05-overview-1440.png) | PASS（Chrome）；四宽见对照 |
| [/projects/cmuzblrjd00039kdr1xsn8bzr/tasks/cmuzblu3j00159kdrgyqn083x?from=dashboard](http://127.0.0.1:3350/projects/cmuzblrjd00039kdr1xsn8bzr/tasks/cmuzblu3j00159kdrgyqn083x?from=dashboard) | `app/projects/[projectId]/tasks/[taskId]/page.tsx → M1NodeWorkspace/M1Record 03` | `GET /v2/tasks/:id/progress-context; GET /projects/:id/samples?taskId=:id; POST /projects/:id/samples; POST /v2/tasks/:id/complete` | 获准普通成员；实际日期/样板编号/本轮事实 | 记录并完成真实制样，刷新读回 | [实际截图](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/m1-evidence/supplemental/03-saved-paint-record.png) | PASS（Chrome） |
| [/projects/cmuzblrjd00039kdr1xsn8bzr/tasks/cmuzblvyr002t9kdrg1muwczs?from=dashboard&tab=flow](http://127.0.0.1:3350/projects/cmuzblrjd00039kdr1xsn8bzr/tasks/cmuzblvyr002t9kdrg1muwczs?from=dashboard&tab=flow) | `同上 → M1Record 04` | `GET task progress-context/samples; POST task materials/versions; POST /projects/:id/samples/confirm; GET attachment content/logs` | 两名获准普通成员；真实确认材料V1/V2 | CLEAN→预览/下载→保存→返回→刷新/重登；409保留输入；幂等无重复；原作者审计 | [实际截图](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/m1-evidence/screenshots/06-confirmation-1440.png) | PASS（Chrome）；Safari事实/材料读取、关闭与返回URL PASS，完整写链未验 |
| [/projects/cmuzblrjd00039kdr1xsn8bzr/tasks/cmuzblvyr002t9kdrg1muwczs](http://127.0.0.1:3350/projects/cmuzblrjd00039kdr1xsn8bzr/tasks/cmuzblvyr002t9kdrg1muwczs) | `同一正式task route` | `同一task/sample API` | 获准成员；无来源直接深链 | 取消返回所属项目；有来源恢复上下文；失效登录提示 | [实际截图](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/m1-evidence/screenshots/06-saved-1440.png) | PASS（Chrome） |
| [/admin/people](http://127.0.0.1:3350/admin/people) | `app/admin/people/page.tsx → PeopleEntry` | `GET /users/directory` | 获准普通成员只读；系统管理员保留管理边界 | 真实目录可读、不露管理设置死入口 | [实际截图](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/m1-evidence/screenshots/14-people-directory.png) | PASS（Chrome只读目录）；完整管理生命周期未扩展 |
| [/admin/color-database](http://127.0.0.1:3350/admin/color-database) | `既有颜色目录route；STILL_ACTIVE` | `GET /auth/session；本轮补充未证明完整目录数据请求` | 获准成员 | 导航可达既有颜色数据库 | [实际截图](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/m1-evidence/supplemental/color-library.png) | PASS仅入口；完整业务未验 |
| [/monthly-reviews](http://127.0.0.1:3350/monthly-reviews) | `既有月度评审route；STILL_ACTIVE` | `GET /dashboard/monthly-review-board` | 获准成员；真实月度总览 | 周评导航进入既有月度页，HTTP200 | [实际截图](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/m1-evidence/supplemental/weekly-entry.png) | PASS仅既有入口；完整周评未实现 |
| [/analytics](http://127.0.0.1:3350/analytics) | `既有数据中心route；STILL_ACTIVE` | `GET /analytics/overview` | 获准成员；真实overview | 产量统计导航进入既有数据中心，HTTP200 | [实际截图](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/m1-evidence/supplemental/statistics.png) | PASS仅既有入口；完整产量统计未实现 |

### 兼容入口、保留组件和未执行边界

- `/v2/dashboard?project=cmuzblrjd00039kdr1xsn8bzr`、`/projects/flow-map`：REPLACED；真实Chrome重定向到正式工作台PASS。
- `/projects/cmuzblrjd00039kdr1xsn8bzr/overview`、`/flow-map`：REPLACED；同项目`?tab=flow`，真实Chrome PASS。
- `/projects/cmuzblrjd00039kdr1xsn8bzr/development-report`、`/samples`：REPLACED；服务端真实workspace选实际任务并转正式task，真实Chrome PASS。
- `/projects/:id/actions/:action`：STILL_ACTIVE兼容，源码受控落到真实对象，未声称本轮逐一浏览器操作所有action。
- `/legacy/...`及保留旧呈现：LEGACY_ONLY；本地V1_FALLBACK_ENABLED=false；正式路由不依赖UI_VERSION rewrite，未运行旧全站验收。
- 其他节点工作单、审计、材料：STILL_ACTIVE；保留现有真实功能和状态机，本轮没有冒称所有18节点业务均重新推演一遍。
- 空态/错误/会话/冲突/文件拒绝：主链及定向回归分别覆盖；503明确为UI故障注入。原始Placeholder命中10个测试白名单，运行源码0。
- 本轮没有同名新旧导航并存。公共开关默认值、本地构建值、远端未读取状态、读取时机与回退方式见M1回执开关表。
- Safari仅原生登录/地图/已存确认/材料内容/关闭/返回URL有证据；全写链与最终重登刷新未完成，见Safari回执。WebDriver UNAVAILABLE与屏幕捕获失败不计PASS；没有用WebKit替代。
- 全部本机证据不证明https://timeline.all-too-well.com改变。远端staging/production未执行；产品状态AWAITING_PRODUCT_OWNER_CONFIRMATION。


## 2026-10-09 COLOR_REGISTER_LINK_M1 — 3360本机隔离验收

统一身份：runtime `3ace9626dbf88ccca68c16d11faa55ab9f1765dc`，API/Web均同值。数据库color_register_v2，真实原表+明确合成验收记录，未访问生产。required role均为本地原生、已准入单部门成员（测试账号无岗位角色、非管理员）；未准入读写403。本节PASS是技术操作结果，产品仍待负责人确认。

| 精确URL | route component / 状态 | API endpoints | expected data / action | screenshot | browser result / PASS-FAIL |
| --- | --- | --- | --- | --- | --- |
| http://127.0.0.1:3360/admin/color-database | AdminColorDatabaseR26→ColorRegisterWorkspace / REPLACED | GET /api/color-register、/:id、/sources；PATCH /notes；POST /:id/standards | 默认基地/备注，89来源记录，分基地/SD筛选、11表来源、备注复制粘贴保存刷新、空/错误态，标准更正保留旧版 | [清单](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/color-register-runtime/browser-results/color-register-local-Color-2cd1e-licit-notes-and-source-rows/source-shandong-blue-1440.png)、[手机](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/color-register-runtime/browser-results/color-register-local-Color-2cd1e-licit-notes-and-source-rows/source-standard-detail-390.png) | PASS：真实200/写入读回、三宽、无pageerror；503明确注入 |
| http://127.0.0.1:3360/projects/new | NewColorProject及ProjectColorPicker / STILL_ACTIVE并扩展 | GET /api/color-register；POST /api/projects；POST /api/v2/tasks/:id/materials；POST /api/projects/:id/approved-report | 已获批报告真实扫描；NEW候选缺编号/月份，EXISTING准确颜色+基地不重复创建 | [新建页三档](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/color-register-runtime/final-route-captures/new-project-1440.png)；完整Network见register-project-browser.json | PASS：两个建立方式、真实上传CLEAN、准确primaryColorId |
| http://127.0.0.1:3360/projects/cmv0j2z7h00669k740g05m4nn/standard-boards | StandardBoardsWorkspace+BoardStandardPublishForm / STILL_ACTIVE并扩展 | GET /api/projects/:id/standard-boards；POST /save-and-publish；GET /api/color-register/:id | 原子保存节点/标准/清单；同色身份；重复不新增；刷新保留，非量产许可 | [1440](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/color-register-runtime/browser-results/color-register-local-Color-83998-n-history-and-existing-link/board-standard-draft-1440.png)、[390保存](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/color-register-runtime/browser-results/color-register-local-Color-83998-n-history-and-existing-link/board-standard-mobile-save-390.png) | PASS：三宽、仅1板/1清单、幂等、V1→V2旧版保留 |
| http://127.0.0.1:3360/projects/cmv0ietkv00019kbso8u82lyf/standard-boards | ExistingProjectColorLink / STILL_ACTIVE并扩展 | GET/POST /api/projects/:id/color-link；GET /api/color-register/:id | 精确基地+颜色确认关联，刷新保持、原ID/名称/作者/创建时间不变、重复不重绑 | [关联后](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/color-register-runtime/browser-results/color-register-local-Color-93b5f-ty-and-preserves-its-author/existing-project-linked-1440.png) | PASS：普通另一成员操作，准确读回及幂等 |
| http://127.0.0.1:3360/dashboard?project=cmv0j2z7h00669k740g05m4nn ；[03实际记录](http://127.0.0.1:3360/projects/cmv0j2z7h00669k740g05m4nn/tasks/cmv0j2zu7007b9k74m99v3khi?from=dashboard&tab=flow) / [04实际确认](http://127.0.0.1:3360/projects/cmv0j2z7h00669k740g05m4nn/tasks/cmv0j310v007p9k74xccstz7q?from=dashboard&tab=flow) | M1Dashboard/TaskProgress / STILL_ACTIVE | GET /api/v2/projects/:id/workspace；GET/POST /api/v2/tasks/:id；POST /samples、/materials | 合成已批报告→03制样→04真实确认材料，为07提供真实前序；颜色身份准确 | [03三档](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/color-register-runtime/final-route-captures/sample-fact-1440.png)、[04三档](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/color-register-runtime/final-route-captures/confirmation-fact-1440.png)；写入Network见register-project-browser.json | PASS：本轮真实业务前序API与浏览器操作；非全18节点再验 |

### 其他受影响读取/资格帮助函数与版本选择器

以下保留正式路由，变化为显式primaryColorId读取或单部门资格、评审版本选择。其API/组件/PG回归通过，**不声称这些路由的完整业务浏览器路径已经验收**；截图/浏览器结果为未执行（非PASS），原页面继续STILL_ACTIVE。scope为本轮最小关联及受影响回归，不将此组计成多页面“完成”。

| URL（统一http://127.0.0.1:3360） | component | API | expected data/action | screenshot / browser |
| --- | --- | --- | --- | --- |
| /projects/:id/reviews | ProjectReviewsWorkspace→CabinReviewWorkspace/ConsistencyReviewWorkspace | /api/projects/:id/reviews/cabin、consistency | 标准选项精确到已下发版本；保留作者/历史；真实PG已证一致性评审V1固定 | 未执行完整浏览器；PG/单元PASS |
| /projects/:id/color-evaluation | VisualDeltaReviewWorkspace | /api/projects/:id/reviews/visual-delta | 评审绑定标准版本，准入成员资格，状态机保持 | 未执行完整浏览器；单元PASS |
| /projects/:id/paint-procurement | PaintProcurementWorkspace | /api/projects/:id/paint-procurements | 同部门资格；采购完成激活07 | 页面未验；本轮真实API采购/到货/完成PASS |
| /projects/:id/fees | FeesWorkspace | /api/projects/:id/fees | 同部门资格、状态限制保持 | 未执行完整浏览器；单元PASS |
| /projects/:id/performance-tests | PerformanceTestsWorkspace | /api/projects/:id/performance-tests | 同部门资格、状态限制保持 | 未执行完整浏览器；单元PASS |
| /projects/:id/production-plans | SchedulePlansWorkspace | /api/projects/:id/production-plans/schedule | 同部门资格、准确信息读取 | 未执行完整浏览器；单元PASS |
| /projects/:id/pilot-production | PilotProductionWorkspace | /api/projects/:id/first-production-plans、trial-productions | 同部门资格、状态限制保持 | 未执行完整浏览器；单元PASS |
| /projects/:id/mass-production | MassProductionWorkspace | /api/projects/:id/mass-production | 同部门资格；颜色/基地/实际生产月份口径 | 未执行完整浏览器；聚合PG/单元PASS |
| /projects/:id/color-exit | ColorExitWorkspace | /api/projects/:id/color-exit | 资格帮助函数改同部门；关闭业务规则不扩展、不自动执行 | 本轮业务验收排除、未执行 |
| /projects/:id/workflow、/attachments、/materials | 既有Workflow/Attachments workspace | /api/projects/:id/workflow、attachments | 同部门资格及显式身份读取，附件安全不变 | 受影响单元回归；本轮材料实际上传作为前序PASS；非整页完成 |
| /projects/:id、/projects、/admin/projects、/retrospective | 既有项目/管理/回顾呈现 | 既有projects/dashboard/retrospective读API | 显式primaryColor优先，不从同名或遗留数组猜测；管理员仍需独立权限 | 单元回归，未声明完整页面浏览器验收 |

旧颜色清单实现 REPLACED；/v2/admin/color-database 共用同一包装组件、没有第二套导航或开关分流，兼容URL本轮未单独浏览器验收。LEGACY_ONLY页面保持原关闭入口设置。正式Placeholder0，测试白名单10。单元、PG和本机浏览器均不证明远端staging/production改变。


## 2026-10-12 COLOR_CATALOG_SHEET_INTEGRATION_01 — 3370本地隔离验证

统一身份：runtime `5bc1d10e5aea498612d63fd7637107282af7b040`；API/Web同值，DB color_catalog_sheet_20261012、43迁移。只读来源89条，含既有与本轮合成记录总97条。表中PASS是技术操作结果，产品仍AWAITING_PRODUCT_OWNER_CONFIRMATION；不改写3360的历史验收。

| 精确URL | route component / 旧实现状态 | API endpoints | required role / expected data | expected action | screenshot | browser result |
| --- | --- | --- | --- | --- | --- | --- |
| http://127.0.0.1:3370/admin/color-database | app/admin/color-database/page.tsx → AdminColorDatabaseR26 → ColorRegisterWorkspace；旧清单网格REPLACED，兼容包装STILL_ACTIVE，原详情提取复用STILL_ACTIVE | GET /api/color-register（含facets）、/:id、/sources；PATCH /api/color-register/sheet | 本地原生获准单部门成员；沿用project.read/write；97条服务端记录及真实来源、颜色版本 | 画布编辑、批量粘贴、保存/撤销/版本冲突、原详情读回、刷新、模板导出导回、普通表格预览；无隐式项目 | [主表与详情](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/color-sheet-runtime/visual-1791796581799/source-main-detail-1440.png) / [模板预览](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/color-sheet-runtime/browser-evidence/1791796501856308000/results/color-sheet-local-Syntheti-33b80--XLSX-and-responsive-detail/template-import-preview-1440.png) | PASS：Chrome最终四场景、四档宽度；正常console/pageerror0；负责人待确认 |
| http://127.0.0.1:3370/projects/new | app/projects/new/page.tsx → NewColorProject；STILL_ACTIVE，本轮无业务改动 | 保留既有projects业务API；本轮只验证导航进入，不发POST建项 | 获准成员；沿用原项目创建页面 | 点击“新建颜色项目”到准确URL且显示原表单；CREATE_RECORD=EXISTING_FLOW_ONLY | 未新增独立截图；主场景包含导航断言与Network证据 | PASS仅既有入口；不宣称本轮再次验证整套新建流程 |
| http://127.0.0.1:3370/v2/admin/color-database | app/v2/admin/color-database/page.tsx → 同一AdminColorDatabaseR26；STILL_ACTIVE兼容别名 | 同一颜色清单API | 同一原生权限边界 | 兼容入口共用同一页面，无另套导航 | 未执行 | NOT_VERIFIED，本轮正式用户路径为/admin/color-database |

- 未新增feature flag，不按角色/环境装载另一套清单；原route wrapper仅复用同一实现。
- 四档来源记录截图、模板/只读错误/空态/409、Network/console、数据库/重启证据与精确身份见[DELIVERY.md](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/docs/acceptance/COLOR_CATALOG_SHEET_INTEGRATION_01/DELIVERY.md)。浏览器证据目录var/color-sheet-runtime/browser-evidence/1791796501856308000。
- 正式Placeholder0；扫描12处测试白名单命中，非产品占位。原始错误/未完成加载截图不作为最终视觉证据。
- 人员/周评/统计不在本轮范围；Safari/原生Excel/WPS/真实移动触摸未验。本机结果不证明任何远端更新，staging/production/main/tag未改变。


## LIGHT_TRUCK_SHEETS_INTEGRATION_02_04 — 最终本地路由记录

本记录追加到现有矩阵，保留历史生产验收结论。精确环境为 `http://127.0.0.1:3380`（hostname `127.0.0.1`，隔离数据库 `light_truck_sheets_20261013`），最终只读回读 runtime commit=`9ed0502b9e97e543dc5beea00998b5edc0bb0e67`；V8 `68acd102bc8f88fa7bf88aea099ccc7d74cbde28`仍是下述写入/交互/性能的实际运行版本。V9仅003迁移末尾LF及账本变化，数据库/对象恢复复核与重启后四模块只读回读均PASS。制品/启动/备份身份见[交付记录](./LIGHT_TRUCK_SHEETS_INTEGRATION_02_04/DELIVERY.md)，逐阶段证据见[UI验收](./LIGHT_TRUCK_SHEETS_INTEGRATION_02_04/UI_ACCEPTANCE.md)，性能见[性能记录](./LIGHT_TRUCK_SHEETS_INTEGRATION_02_04/PERFORMANCE.md)。下表的PASS只覆盖明确列出的实际操作，不能替代产品负责人确认。

**V9最终四模块回读及颜色1440/1280/1024/390已PASS：1791938988977234000，51.2s。** 数据库/对象只读恢复复核已PASS（68表、136对象、112CLEAN哈希、5迁移，原失败保留）；没有恢复库应用切换或登录，不替代浏览器回读。 68acd原生交互8/8、自动保存专项、连续输入比较、首次图绑定恢复、剪贴板生命周期和1000行/30图性能均已PASS。完整操作验收=`NOT_FULLY_VERIFIED`（SYSTEM_IME未验证）；Office补充验证未齐。产品负责人状态=`AWAITING_PRODUCT_OWNER_CONFIRMATION`。正式运行源码Placeholder=0；12个匹配均在测试白名单，含r20-fixtures.ts。

| 精确URL | 正式组件 | 实际API | 必需权限 | 数据和正常UI操作 | 旧入口状态 | 浏览器结果 |
| --- | --- | --- | --- | --- | --- | --- |
| `http://127.0.0.1:3380/admin/color-database` | `apps/web/src/app/admin/color-database/page.tsx` → `AdminColorDatabaseR26` → `features/color-register/workspace.tsx::ColorRegisterWorkspace` | GET `/api/color-register`、`/sources`、`/:id`；PATCH `/api/color-register/sheet`；原详情POST `/:id/standards`与PATCH `/notes`；共用图片API | 真实local账号、获准部门成员；`project.read`/`project.write`，服务端再次检查当前准入、字段、revision和幂等 | 两条同名异基地稳定ID；原生输入/粘贴/填充/排序/筛选/undo、真实冲突、原详情、图片与系统/普通模板；来源89保持 | **REPLACED**：业务表格接管正式入口；原详情/来源查询 **STILL_ACTIVE** | 68原生8/8含4全页重开、自动保存1/1、连续50输入1/1、T11 1/1、十轮剪贴板1/1全部PASS；a53颜色模板1/1按无关变更复用。当前目标19图=16既有+本轮新增3。V9最终两ID/19图完整解码与四档尺寸回读PASS；尺寸逐档只解码首图并核对全19 ID |
| `http://127.0.0.1:3380/admin/people` | `apps/web/src/app/admin/people/page.tsx` → `features/personnel/people-entry.tsx::PeopleEntry` → `features/person-sheet/person-workspace.tsx::PersonSheetWorkspace` | GET `/api/persons`、`/:id`；POST `/api/persons`；PATCH `/api/persons/sheet`；GET `/api/users/directory`核对无自动建账号 | 真实local获准成员；service `assertApprovedTeamMember` / `withTeamWrite`重校验；关联账号/资格的管理仍是独立管理员路径 | 同名ID、前导零长电话、无账号导入、关联名称在原职责页读回、未知结果同op仅一档案；岗位文字不授权限 | **REPLACED**：人员库业务入口；原账号/资格管理 **STILL_ACTIVE** | a53 3/3 PASS，首次例刷新两长电话可见。V9最终5记录新contextR PASS，含恢复原名、未知创建与两长电话；与旧a53写入证据分开 |
| `http://127.0.0.1:3380/inspections` | `apps/web/src/app/inspections/page.tsx` → `features/inspections/workspace.tsx::InspectionsWorkspace` | GET `/api/inspections/activities`、`/activities/:id`、`/activities/:id/rows`、`/objects`、`/statistics`；POST `/objects`、`/activities`；PATCH `/activities/:id`、`/activities/:id/batch`；POST `/activities/:id/review-link`；原项目visual-delta submit/approve | 获准成员，`project.read`/`project.write`；显式关联须`review.execute`及项目/目标月权限，已提交锁定；原本人签署/有效任务日期状态仍强制 | 2台次/4组/12角度、2+1图；总体pending/PASS/FAIL独立于角度；事实保存不推进月评，显式关联后原页提交/通过仅目标月变 | **REPLACED**：检验业务入口；原项目月度评审页/服务 **STILL_ACTIVE** | a6a 3/3完整I/S/R PASS按明确源码差异复用；68最终1000×27/1000×23/30图性能1/1 PASS，5次100行GET。V9另完成2/4/12/3图及月度锁定回读PASS；性能R仅采样模块返回，不是全1000行重启读回 |
| `http://127.0.0.1:3380/production` | `apps/web/src/app/production/page.tsx` → `features/production-sheet/workspace.tsx::ProductionSheetWorkspace` | GET `/api/production-facts`、`/statistics`、`/sources`、`/:id`；PATCH `/api/production-facts/batch` | 获准成员，`project.read`/`project.write`；业务grain唯一、revision/op与整批原子在服务端检查 | 月/颜色/基地canonical总量；2029-07最终26，null/0分开；2029-10总量100与40/60明细及重复总量拒绝双计；历史来源单列 | **REPLACED**：产量表格入口；原颜色详情读同事实/历史来源 **STILL_ACTIVE** | a53完整业务1/1及跨文件1/1 I/S/R PASS；主记录9+两图刷新，跨文件100整页重开。V9最终逐项核对5事实+canonical共6条、null/0、26/100及两图，R PASS |

共用图片API：GET/POST `/api/sheet-images`，PATCH `/api/sheet-images/:id/layout`，DELETE `/api/sheet-images/:id`，GET `/api/sheet-images/:id/thumbnail`，GET `/api/attachments/:id/content`。目标依次为颜色、人员、检验台次Occurrence、产量事实的稳定ID；服务端在内容读取/上传/最终绑定/布局时检查实体、项目/部门授权及检验提交锁。不是前端直接写文件表或业务关联。

V9最终回读的历史尝试保留FAIL：`1791882314279074000`因脚本未滚入惰性照片即等待img；`1791884341445594000`前三模块及颜色两ID、三个桌面尺寸已观测，390阶段出现两次网络IO暂停与两次下载并发429（Retry-After1）。没有产品数据写入，整体回读门禁不因此判PASS。修正候选按DOM顺序完整照片R一次、各尺寸完整ID集合和首图实际解码，保留全部metadata与错误门禁；随后1791938988977234000全程clean PASS（236请求、业务写0、page/console/guard0），不倒改旧FAIL。

Office口径：历史01284产量文件在真实Excel中部分PASS，检验文件打开超时，整体`OFFICE_NOT_VERIFIED`；最新导出文件未取得完整办公软件复核。系统内含图模板往返PASS不等于Excel/WPS/LibreOffice兼容性全部通过。

### 已执行尺寸和精确截图

以下证据路径以仓库 `var/light-truck-sheets-02-04/` 为起点。viewport与fullPage图片高度分开，不能把截图高度等同窗口高度。

| 路由 | 尺寸与实际版本 | 截图 |
| --- | --- | --- |
| 颜色清单 | V9：1440×900、1280×800、1024×900、390×844只读布局；旧68 T04还包含1024实际交互 | `final-readback-evidence/1791938988977234000/results/readonly-readback-最终重启后普通员工只读重开：人员稳定记录、检验月度锁定、产量26与100、颜色和照片/color-final-readonly-{1440,1280,1024,390}.png`，每档另有`-photos-visible.png`；19图完整解码在同run正常回读阶段，布局每档只解码首图 |
| 人员库 | a53：1440×900、1024×900、390×844 | `person-evidence/1791875967743046000/results/person-Ordinary-worker-two-95b3b--update-and-unlinked-import/person-stable-id-{1440,1024,390}.png` |
| 检验 | a6a：1440×900、1024×900、390×844；68性能1440×900 | `inspection-evidence/1791875015462608000/results/inspection-普通员工从-UI-创建-2-台次-4-测量组-12-角度，3-张照片、总体结论和含图模板回读/inspection-{1440,1024,390}.png`；`compound-performance-evidence/1791879554116987000/results/compound-performance-1000--164e8--5-successful-100x10-pastes/{reading-1000x27-100x10,occurrence-1000x23-30-images}.png` |
| 产量 | a53：1440×900、1280×800、1024×900、390×844 | `production-evidence/1791876002772823000/results/production-Ordinary-member-4f16a-o-and-image-XLSX-round-trip/production-canonical-and-separate-sources-{1440,1280,1024,390}.png` |

a6a→a53仅TSV末尾空白依赖修复，a53→68仅颜色自动保存/对应回归，未改变非颜色JSON/XLSX业务、API、共享runtime、CSS或图片代码。旧尺寸证据保留原commit，不冒充68重新执行；68颜色受影响回归已实跑。68→V9只恢复003已应用字节的末尾LF并更新账本，没有应用逻辑/SQL语义改变；旧浏览器结果保留68标识，不重标为V9。最终readback首次1791880141641001000为harness ESM加载失败、零测试启动，修正测试包配置及惰性照片观察后，9ed的1791938988977234000已有新只读回读PASS；旧写入/性能记录不重标9ed。生产/staging远端发布、main/tag在本轮本地验收中未改变；具体14项交付状态由[交付记录](./LIGHT_TRUCK_SHEETS_INTEGRATION_02_04/DELIVERY.md)统一记录。


---

## 2026-10-19 设计续接：9710 历史运行基线与 14 页对应

本节保留9710阶段的历史运行与源码映射；当前预览及后续候选状态见下方c89与恢复增量，不由本节旧时态推断。当时运行提交为 `9710cbfbda9975c1c58f15cff8ff0167540eef6f`，tree `375767ba259954cfa9c53d25e1f0bac91789cb2a`。当时已报告3390真实运行此版本，并读取非敏感健康身份文件 `var/design-convergence-20261019/runtime-9710-health.json` 核对 source/runtime commit 和 tree；这是 loopback 开发运行环境，不是正式域名验收。

源码映射复用已核对的86f矩阵。实际 `git diff --name-only 86f0300d9ccee6f8019b7580f71766dc7272a688 9710cbfbda9975c1c58f15cff8ff0167540eef6f` 仅有两Dockerfile、Next预取脚本及测试、旧开发档案组件及测试六文件；其中页面差异仅为档案状态分类和跨colorId清理。已对9710该组件重新核对；其它映射源码未变。源码不变允许复用来源映射，不自动把旧版操作记成9710重新验收。

- `SOURCE_VERIFIED` 仅指路由、组件、动作、返回和后端合同有对应，不是整页PASS。
- 浏览器事实由根任务实际操作后提供，本节只引用精确范围与版本。没有实际主动作的页面保持未验；浏览器截图不替代保存读回、权限负向或产品负责人确认。
- API路径省略 `/api`；动态ID由实际授权合成记录选择。网页 `/v2/:path*` 按 `next.config.ts` 重定向 `/:path*`，不移除服务端 `/api/v2/...`；`/legacy`单列历史入口。
- 第1页为封面，不为其新增占位功能。最终状态仍为分项本地验证，未声明整体验收或生产更新。

| 参考页 | 实际路由 / 组件 | 实际 API / 数据 | 默认、编辑、空与错误状态 | 动作及实际结果 | 保存 / 取消 / 后退 | 主路由、v2、legacy 与合同差异 | 参考与浏览器证据 |
|---|---|---|---|---|---|---|---|
| 1 封面 / 总览 | 无独立业务路由；入口 `/login` → `/dashboard` | 无封面业务 API | 仅为参考稿目录，不应创建占位页 | 进入登录或工作台 | 不适用 | 设计封面，不计功能页完成 | 封面，不计功能验收。 |
| 2 登录 | `/login`；`LoginPage`、`AuthProvider`、`PasswordField` | `GET /auth/session`；`POST /auth/login`、`/auth/register`、`/auth/recover`；登录目的地可能校验 `/v2/projects/:p/workspace` | 默认工号/密码；注册/恢复是同页模式；busy 禁用；错误 FeedbackBanner；注册成功但后续登录失败仍提示账号已建立 | 本地密码登录；注册建立真实账号；恢复使旧会话失效；目标由 `resolveLoginDestination` 决定 | 登录成功跳目标；注册/恢复可“返回登录”；无独立保存草稿；字段失败留在页面 | 当前原生身份入口；旧 `/login/callback` 不承担第三方交换；不能用历史 OAuth 截图验收 | SOURCE_VERIFIED；318原生登录与aee3400恢复登录分别有实际路径；9710已运行不等于重新执行全部认证动作。 |
| 3 流程首页 | `/dashboard?project=:p&taskId=:t`；`M1Dashboard`、`M1FlowMap` | `GET /projects` 有界列表；`GET /v2/projects/:p/workspace` | 默认首个可读颜色项目；颜色选择/搜索/刷新；加载、空结果、错误重试；待跟进来自真实节点 | 点节点 / 待跟进进入真实 `/projects/:p/tasks/:t?from=dashboard…`；新建进入 `/projects/new?from=dashboard` | 首页只读；节点保存后按来源返回选中项目；新建有取消 | 当前 M1 首页；`/v2/dashboard` 由 Next redirects 实际跳 `/dashboard`，旧 v2 页面源码不决定对外画面；`/legacy/dashboard` 单列历史 | SOURCE_VERIFIED；318地图→材料扫描→保存返回→刷新；86f1440截图；实际timeout后重试恢复4/18，失败保留。 |
| 4 颜色项目 | `/projects`、`/projects/new`；`ColorProjects`、`NewColorProject` | `GET /projects`；`POST /projects`；新建后读取 `/v2/projects/:p/workspace`，按需上传报告、`POST /projects/:p/approved-report` | 查询/节点筛选/分页、无项目/无匹配、错误重新加载；新建表单和业务权限拒绝态；报告上传/扫描状态可见 | 项目名称/编号打开详情；新建服务端分配稳定项目 ID、继续保存已创建草稿，避免重复项目 | 新建“创建项目/继续保存”后进入详情；取消回来源列表/首页；保留列表搜索和滚动上下文 | 当前 M1；`/v2/projects` 实际重定向 `/projects`；`/legacy/projects` 旧入口不能替代本页截图 | SOURCE_VERIFIED；86f项目列表实际打开并截图；新建/编辑/权限分支未因此判PASS。 |
| 5 项目总览 | `/projects/:p?tab=flow`；`ColorProjectOverview`；`/overview` 固定跳此路由 | `GET /projects/:p`、`GET /v2/projects/:p/workspace`；`PATCH /projects/:p`（expectedVersion）；资料页使用附件 API | 默认流程图；资料/周评与产量/记录标签；`?edit=1` 编辑弹窗；加载、错误重试与返回；记录空态 | 节点进入记录；编辑颜色名称/车型/计划开始/说明；读取真实审计记录；资料进入 `AttachmentsWorkspace` | 保存更新版本并刷新；取消/关闭在 dirty 时确认；回来源首页或保留筛选的列表 | 当前 M1；`/v2/projects/:p` 实际重定向本路由；9710时“周评与产量”标签仍链接项目月度视觉评审与生产记录，独立自然周视图为 `/inspections`，不能混称同一入口；c89新增四入口另列 | SOURCE_VERIFIED；86f项目总览、资料标签实际打开并截图；其余主动作待验。 |
| 6 样板记录 | `/projects/:p/samples` 经 `M1RecordEntry` 解析真实节点 → `/projects/:p/tasks/:t`；`M1NodeWorkspace` | `GET /v2/tasks/:t/progress-context`；`GET /projects/:p/samples?taskId=:t`；`POST /projects/:p/samples`、`/samples/confirm`；材料上传；按真实条件 `POST /v2/tasks/:t/complete` | 实际制样/确认日期、确认方/决定/备注；已处理节点只读；样板先保存后完成失败时继续同一记录；找不到节点有错误/重试/返回 | 登记本轮样板或确认事实；需材料时必须先扫描通过；制样路径仅在后端接受后完成本轮任务 | “保存并返回”回原节点来源并刷新；取消受未保存守卫；不得把仅保存样板误记作节点完成 | 当前 M1 入口复用旧 samples 业务；保留样板/任务 ID；不是任意自由表格行 | SOURCE_VERIFIED；aee3400新库副本新增样板确认→刷新，非3390全样板链或9710重测。 |
| 7 标准板 | `/projects/:p/standard-boards`；`StandardBoardsWorkspace`、`BoardStandardPublishForm` | `GET/POST /projects/:p/standard-boards`；`PATCH …/:boardId`；`POST …/:boardId/{set-current,mark-created,issue,distributions}`；`/color-board-detail-update` 和各 `complete-task` | 选中当前/首条版本；新增/编辑板号、版本、样板来源；下发/签收/明细；加载、错误重试、无记录；权限与活动节点约束 | 创建/修改板、设当前板、制作/下发、记录分发；明确发布颜色标准版本；完成动作走后端门禁 | 保存返回更新后的 workspace；取消编辑重置表单；`M1RecordReturn` 回来源；完成按钮与“保存板记录”区分 | 当前真实业务路由，复用既有组件并加 M1 来源返回；不是 `/legacy` 路由；视觉与 14 页仍须截图核对 | SOURCE_VERIFIED；86f标准板实际打开并截图；创建/制作/下发/完成未全部实测。 |
| 8 项目评审 | `/projects/:p/reviews?review=cabin`（另有 consistency / legacy-monthly）；`ProjectReviewsWorkspace` 及 Cabin/Consistency/Monthly 子组件 | `/projects/:p/reviews/cabin`、`/reviews/consistency`；创建/编辑、attachment、submit、approve/reject；历史 monthly 独立旧 API | 默认驾驶室；切换后保留已打开子页输入；草稿/提交/结果态；错误及业务拒绝需实测；不同时加载所有标签 | 保存评审事实、关联材料、提交/确认；既有后端状态与角色门禁保留 | 各子页显式保存/取消及来源返回；提交不能由前端假置完成 | 当前路由；“历史月度评审”明确 legacy 语义但不在 `/legacy` URL；本轮未新增多角色审批；旧 approve/reject 能力仍在，不能据视觉稿称已移除 | SOURCE_VERIFIED；9710实际切驾驶室→一致性；未到节点按钮disabled，为门禁观察，未执行评审保存。 |
| 9 材料 | 项目资料 `/projects/:p?tab=materials` 或 `/projects/:p/materials` → `AttachmentsWorkspace`；`/materials/upload?taskId=:t` → `MaterialsUploadR22`；`/materials` → `MaterialsCenter` | 项目附件 list/upload/detail/preview/download；节点材料命令；`GET /dashboard/project-timelines`（聚合入口） | 文件选择、扫描待处理/成功/拒绝、版本历史；替换态可取消；无任务/无材料空态；MaterialsCenter 初次失败且 payload 空时现显示错误、重试与返回；后续刷新失败保留已读数据。附件/驾驶室/节点首载错误与返回亦已修复（Node 回归证据，不代替浏览器故障注入） | 上传/替换保留版本，预览/下载再次鉴权；节点材料与普通附件不能互换；聚合页只是导航 | 上传确认后刷新材料；取消替换不删除已存历史；项目资料按来源返回；旧上传页回我的任务 | 当前真实资料与旧 R22 上传组件并存；`/v2/materials` 实际重定向聚合页；`/legacy/materials` 单列历史，不能用聚合页能打开替代上传验收 | SOURCE_VERIFIED；318材料扫描→保存返回→刷新；86f资料页实际打开；aee3400旧PDF下载hash一致。其他附件动作待验。 |
| 10 颜色库：自由工作簿与业务区 | `/admin/color-database` → `FreeWorkbookWorkspace`；`?view=records` 或 `?colorId=:id` → `ColorRegisterWorkspace`；`/admin/color-database/:id` → `AdminColorArchiveR26` + `AnnualReviewPanel`；`AdminColorDatabaseR26` 分流 | `GET/POST /workbooks`；`GET/PUT /workbooks/:id`、`GET …/revisions`、`POST …/restore`；`SHEET_WORKBOOK` 图片；业务区 `/color-register`、`/color-register/sheet`、标准版本与导入 API | 默认列表/选择/新建；完整 Univer 编辑；dirty、saving、未确认、冲突、图片导入/取消、空态、错误；导入不支持内容明确拒绝或确认降级副本 | 多 sheet/样式/合并/公式/图片；保存全 snapshot；恢复追加新 revision；XLSX 导入创建独立副本；导出本地文件；业务区保留稳定业务 ID | 显式保存；未确认重试原请求；重新读取/切换受未保存守卫；图片未完成不能保存；取消导入回持久副本；返回工作台/业务区 | 当前默认自由工作簿；`/v2/admin/color-database` 实际重定向当前路由；自由行号不作业务 ID；**未自动发布/同步到颜色业务记录，首版业务发布入口指向受控区，不等于已实现任意工作簿映射发布** | SOURCE_VERIFIED；aee合成两表v5编辑+Excel实开；86f真实11表副本v2保存读回、背景可见、Excel11表无repair；OWNER_REPORTED_PASS系统IME。非全部兼容性/任意映射发布PASS。 |
| 11 周评与日常检验 | `/inspections`；`InspectionsWorkspace` 默认周评视图；`week-range`、`ActivityForm`、`RecordSheetWorkspace`；另可切日常全部日期 | `GET /inspections/activities?baseId&fromDate&toDate&page&pageSize=25` 与同范围 `/inspections/statistics`；原 `POST/PATCH /activities`、层级 `/rows`、`/batch`、`/review-link` | 上海日期的周一至周日首尾计入；上一周/下一周/日期选周/回本周/基地筛选；周活动空态与统计失败单独重试；日常历史分页；切范围保留未保存守卫 | 周列表来自真实活动；统计覆盖该周及基地全部已保存事实、车辆按稳定对象 ID 跨活动去重；新建本周活动默认适用日期，编辑沿用活动 ID/revision；照片仍绑定对象台次，不绑定行号 | 活动显式保存/取消；层级表格有自动保存、冲突/未确认恢复；活动或事实保存后刷新周列表与汇总；切周/基地/层级前处理未保存内容；侧栏返回工作台 | 已实现自然周读取与维护入口，无新增“周评完成”审批状态、无自动推进月度流程；`/monthly-reviews` 仍为原月度进度。周视图不是新增自由工作簿，不把检验事实保存等同评审完成 | SOURCE_VERIFIED；86f活动新建10/19→编辑10/20并保留备注/参与人→同ID刷新；上周10/12..18空态→本周1活动。首次工具fill日期失败保留；跨年等未实测项待验。 |
| 12 月度产量 | `/production`；`ProductionSheetWorkspace`、`RecordSheetWorkspace`；项目旧批量生产另为 `/projects/:p/mass-production` | `GET /production-facts`、`/statistics`、`/sources`；`PATCH /production-facts/batch`；颜色/基地与 `SHEET_PRODUCTION` 图片 | 基地/颜色/月份筛选；有界列表；新增、导入、来源核对、统计失败；空白未知与 0 区分；冲突/保存未确认态 | 维护颜色×基地×月份全车型总量；更正更新同一事实；来源事实与项目批次分开；图片/含图 XLSX | 表格自动保存及重试/冲突处理；新增弹窗保存/取消；未保存先处理再筛选/导入；返回工作台，链接项目统计 | 当前真实月度总量页；项目 mass-production 是旧流程批次，不等于总量事实；不要相加造成双计 | SOURCE_VERIFIED；9710阶段尚无完整月度产量写入/导入/刷新UI链，不能用年度种子事实代替；c89新增与刷新证据另列。 |
| 13 年度颜色复核 | `/admin/color-database/:id` → `AdminColorArchiveR26` 的 `AnnualReviewPanel`；业务清单 `?view=records` / `?colorId=:id` → `RegisterDetails` 同面板；项目 `/projects/:p/color-exit` 嵌入同面板 | `GET/POST /color-register/:id/annual-review`；`ColorAnnualReviewService` 读取同颜色/基地的 `MONTHLY_ACTUAL_TOTAL_V1` 13月事实；immutable AuditLog + AdminCommandRequest；旧 `/color-exit` 承接正式退出评审 | 首次入清单月起连续13自然月、下一月复核：2026-09..2027-09，2027-10复核；缺月/未知不能裁决，0是真实0；未到期、未入清单或已退出不可保存；读失败可重试；仅旧档案明确404转普通status；未知404/403/500仍alert；挂起时年度与返回仍挂载；切colorId清旧档案和旧年度状态 | 显示逐月原事实、版本、总量与依据；20/21继续保留，19低于阈值待原退出评审；输入说明后保存不可变复核证据，不自动退出/推进项目；已有年度证据约束后续旧手填退出，不能把20伪写19绕过 | 保存包含operationId/revision/snapshotHash并读回历史；详情关闭有dirty保护；退出页保存年度后刷新阈值20且保留未保存表单；使用已保存依据填入退出表单需显式点击；返回颜色库/原项目 | 已闭合本轮明确的首次13月与20保留合同；无新周期表/schema/多角色审批；不推断后续年度周期、不覆盖历史已完成退出。旧 color-evaluation/月度评审不冒充本年度合同；任意颜色批量年度确认不在此实现内 | SOURCE_VERIFIED；86f合成2024-09..2025-09共13月，保存20保留→刷新历史；9710普通状态新文案与原20历史实看。19/21/缺月等仅真实PG/HTTP证据，不冒称浏览器负向。 |
| 14 人员库 | `/admin/people`；`PeopleEntry` 默认 `PeopleDirectory`，可切 `PersonSheetWorkspace`；权限 `/admin/people/permissions` 独立 | `GET/POST /persons`；`PATCH /persons/sheet`、`/persons/:id/archive`、`/persons/:id/department`；已关联账号状态/准入 `PATCH /people/:userId` | 常用/启用/归档，姓名工号搜索、游标分页；详情、新增/编辑/状态/归档表单；加载/空/错误重试；无准入拒绝 | 直接维护人员；新增不创建登录账号；停用后可归档；恢复名单不自动启用账号；关联账号准入/部门/停用仅管理员适用范围 | 表单保存有 operationId 和 revision/version；取消不写；dirty 离开守卫；返回工作台或表格/列表切换；详情关闭 | 当前 M1 默认列表；`/v2/admin/people` 实际重定向当前路由；人员档案与登录账号/授权分开，不恢复旧多角色审批流程 | SOURCE_VERIFIED；新增无账号→编辑刷新→停用归档隐藏→恢复仍无账号；86f实际1440/1024/389无body横向溢出，长姓名详情实点。历史作者保留仅独立PG。 |

### 复用的源码定位（除档案项外，9710相对86f未变）

| 范围 | 源码定位（相对仓库；未变化项沿用86f行号） | 本次可准确声明 |
|---|---|---|
| 页面重定向 | `apps/web/next.config.ts` 的 `redirects()` | `/v2/:path* → /:path*`；不要把残留页面实现当实际URL分流。 |
| 工作簿/业务记录/档案 | `apps/web/src/components/admin-color-database-r26.tsx:8`；`apps/web/src/app/admin/color-database/[colorId]/page.tsx:3` | 默认自由工作簿；query切受控业务清单；路径参数页是开发档案+年度面板，不能混写成同一组件。 |
| 自然周日期与范围 | `apps/web/src/features/inspections/week-range.ts:4`、`:20`；`apps/web/src/features/inspections/client.ts:42`；`apps/web/src/features/inspections/workspace.tsx:23` | 上海业务日期；周一至周日；列表与统计共用同base/date范围，25条分页与完整范围统计分开。 |
| 周活动维护 | `apps/web/src/features/inspections/forms.tsx:9`；`apps/api/src/modules/inspections/inspections.controller.ts:23` | 复用原活动更新/幂等/CAS；日常与周视图共用稳定事实与照片身份；无新审批状态。 |
| 年度窗口和判断 | `apps/api/src/modules/color-register/color-annual-review.rules.ts:10`；`color-annual-review.service.ts:70` | 当前受控registerMonth起0..12月，13月后复核；单一全车型总量；缺月/未知不等同0；20保留。 |
| 年度读写与历史 | `apps/api/src/modules/color-register/color-register.controller.ts:19`；`color-annual-review.service.ts:35`；`apps/web/src/features/color-register/annual-review.tsx:17` | 后端权限、颜色锁、snapshot/revision并发与operationId幂等；保存不可变审计后读回，非自动退出。 |
| 年度与旧退出绑定 | `apps/api/src/modules/color-exits/color-exits.annual-review.ts:12`；`color-exits.service.ts`；`apps/web/src/components/color-exit-workspace.tsx:336` | 已保存年度事实约束手填量/年度/决定，防止20→手填19绕过；无年度证据的其它既有阈值合同不任意重写；不覆盖历史已完成退出。 |
| 档案慢请求与草稿 | `apps/web/src/components/admin-color-archive-r26.tsx:55`；`apps/web/src/components/project-reviews-workspace.tsx:19` | 档案慢/失败时年度与返回仍在；评审标签只首次挂载，已打开标签hidden保留本地输入。 |
| 首载错误与返回 | `apps/web/src/components/materials-center.tsx:92`；`workspace-load-failures.test.tsx`；`features/m1/context.ts`、`record-return.tsx` | 首载失败显式错误重试；节点/记录按allowlisted来源回路返回，测试不冒充浏览器。 |



### 9710 阶段实际证据（历史基线）

9710阶段的本地预览为 `http://127.0.0.1:3390`，当时运行 `9710cbfbda9975c1c58f15cff8ff0167540eef6f`（tree `375767ba259954cfa9c53d25e1f0bac91789cb2a`）。9710年度页已在真实浏览器显示普通status“未找到可展示的开发项目资料档案。清单与年度复核信息在下方单独读取。”，原20台继续保留历史仍可见；截图为 `after/annual-9710-css1440.png`，对应AX文本由根记录引用。独立真实loader10项覆盖已知404、未知404、403/500、挂起及换颜色旧数据清理；没有把该单测当浏览器故障注入。9710评审页实际切驾驶室→一致性，因未到节点而按钮禁用，只记门禁观察，不记评审保存PASS。

318构建（`31864786da03bb9e61f977a62edfd2c587c89631`）已实走原生登录 → 流程地图 → 涂料材料扫描 → 保存返回 → 刷新。86f（`86f0300d9ccee6f8019b7580f71766dc7272a688`）项目列表、总览、资料与标准板实际打开并截图，仍未覆盖每页主动作。流程首页有一次实际请求timeout，错误可重试并恢复到4/18；失败留存，不能改成从未失败。

人员实际链为无账号新增 → 编辑保存刷新 → 停用 → 归档后默认名单隐藏 → 恢复仍无登录账号。86f实宽1440、1024、389均无body横向溢出，长姓名详情实点；文件名390不代表实际390（浏览器67%时实际389）。历史作者保留、最后管理员与关联账号会话边界只引用独立11项真实PG记录，不冒称浏览器全路径。

86f周活动 `cmverityx000y9klo8my61j6v` 新建10/19 → 编辑10/20并保留备注与参与人 → 同ID刷新；上一周10/12..18为空态，再回本周1活动。首次工具fill(date)未触发React导致日期未改，后用实际键盘stepper修改成功；前者记工具输入失败。86f年度合成颜色 `synthetic-annual-ui-20261019-20` 的2024-09..2025-09共13个月事实已说明→保存→刷新历史，20台继续保留。规则按所有者明确决定：2026-09..2027-09首尾13月，2027-10复核；20保留、缺月不裁决，保存不可变证据不自动退出，19仍走已有退出评审。19/20/21/缺月和并发等另有真实PG/HTTP验证，不扩大为全部浏览器负向。

aee（`aee63f6e51b477b9a43b5b5b3678ec0efd2703d7`）合成工作簿两表已实做中文paste、SUM20、14号粗体居中、合并/取消合并/undo、行插删/undo/高36、列插删/宽220、图片保存至v5；实际Excel已查看导出两表、1个图片对象和20。中文paste本身不证明IME。所有者对所请求合成工作簿D1的系统中文输入验收反馈“选词、保存和刷新正常”，记 `OWNER_REPORTED_PASS`；不是自动化OS候选词事件证据，也不将其它文件中出现同样文字推断为同一次IME操作。

真实11表清单此前“不支持背景图”和aee“背景附件CUID误按UUID”的两次导入失败均保留。86f独立副本已导入11表、保存v2并读回，背景可见；导出由实际Excel打开为11表且无repair提示。这只证明已观察的表数、背景显示、保存读回和Office可打开，未逐格证明全部样式、公式、DPI、打印设置或再导入无损。本节仅记录已报告的实测范围，不附真实清单内容或截图。

aee在 `http://127.0.0.1:3400` 的同机新数据库与对象副本恢复已原密码登录 → 新增样板确认 → 刷新，旧PDF下载hash一致。该证据不代替9710异机portable或正式HTTPS恢复。在该历史记录形成时portable仍在独立准备/验证，当时尚无最终异机结果；后续结果按实际候选另列，生产域名状态不由本地结果推导。

参考/调整前/实装对照页在 `http://127.0.0.1:3394/`，3/10/14页逐项三列比较、14页可折叠、所有业务操作入口前往3390。当时已实看三列可见、布局可读，放大/折叠与链接操作仍待逐项检查；后续完成情况见c89增量。该阶段对照包含27张明确授权的参考与合成现场图，原86f/aee图未批量重标9710，未含真实清单截图、私密配置或账号资料。

9710阶段的未完成/未验证范围（后续增量另列）：未有证据的14页主动作、部分错误/权限负向和全部页面窄屏；自由工作簿到业务记录的任意映射发布；完整Office无损兼容；portable异机运行/恢复与生产HTTPS验收。既有业务ID、安全命令、图片扫描/归属/CLEAN下载和审批门禁继续保留。未使用测试总数、页面打开或源码合并替代产品完成；产品负责人整体接受仍待明确。

### 9710 受影响源码及独立审查引用

- `apps/web/src/components/admin-color-archive-r26.tsx:25`：真实loader，精确识别既有档案404；`:29`开始清旧data；`:37`未知错误仍alert；`:55`普通状态；`:57`年度以colorId为key且不依赖档案返回。API权限与档案筛选未改。
- 档案独审：`/private/tmp/design-convergence-archive-state-v2-independent-review.json`，SHA256 `87af60640c5f8ac696980089fc0bdc468f8fac4936ee852469ed116a55512bc5`；独立10/10，不把自动组件测试写成真实浏览器负向。
- 年度后端与UI独审：`/private/tmp/design-convergence-annual-independent-review.json`，SHA256 `db51549690f5bbabac4780655b6a2d837ac62574cb73bef95c5b850b6dfb8a55`；真实PG/HTTP11项、API26项、Web6项，仅对应已绑定源码/环境。类型修正另见 `design-convergence-annual-seed-and-type-independent-review.json`。
- 构建缓存独审：`/private/tmp/design-convergence-build-cache-independent-review.json`，SHA256 `4316d20cb3f91c2efe4e348c9f8c38465fe82ac8e6ddd2340bb7c01586bfd4e6`；6项与固定官方包SHA512，不代替最终镜像构建/扫描。

本节作为既有矩阵的9710历史基线保留；后续截图、Network/console、实际制品摘要及portable结果按具体候选增补，不覆盖旧失败或改记旧版本事实。


9710 新增完整路径：重新登录 → 首页样板确认 → 合成 PDF 扫描放行 → 保存返回原 project/taskId → 重开并刷新，事实与材料读回一致。详见 [实施与验证记录](DESIGN_CONVERGENCE_20261019.md)。最新候选修复及运行证据在该记录补录；不将本节旧截图自动改记为后续候选实测。

## 2026-10-19 c89 历史运行增量（后续4bdb另列）

本节保留c89阶段当时的状态，与上方9710历史基线分开；最新运行以末尾4bdb增量为准。当时 loopback `http://127.0.0.1:3390` 健康身份为应用 `c89c5e5540c39423bd186539bb1ab3649771e9b6`、tree `795490f179548ef4b9e2319c315a4611cb153718`，已只读核对 `var/design-convergence-20261019/runtime-c89-health.json`。`ede2439b7a353d1eaf98a0ca49e740e34e2a457a` 仅修 Portable CLI status 两文件；当前最终源码候选为 `de2b49c49358ffa917a237442672528a16da3f85`、tree `3d722a4642f5ea52a98867411dcb97c026d61adf`，再增加前向2条CHECK稳定迁移及round-trip回归，保留strict schema hash比对，不做指纹豁免。de2已完成同机独立新实例的API严格恢复、新写与重启读回；随后Chrome并发加载触发128MiB proxy OOM退出，45444当前不可用，另有healthcheck错误端口，新候选修复中。3390仍为c89，不把API链通过写成浏览器交付或全服务健康。既有86f/aee/9710截图与动作保留原版本。

| 参考页 | 路由 / 组件 | 本次准确增量 | 未验证或限制 |
|---|---|---|---|
| 1 封面 | `/login` → `/dashboard` | 参考目录，无新业务页 | 不计功能完成。 |
| 2 登录 | `/login` / `LoginPage`、`AuthProvider` | 9710实际重新原生登录后走完整样板确认路径；aee3400另有原密码恢复登录 | c89健康身份不代表重新完成注册、恢复、所有会话负向。 |
| 3 流程首页 | `/dashboard` / `M1Dashboard`、`M1FlowMap` | 9710样板确认保存返回后来源project/taskId保留，地图6/18，后续取号/采购；旧4/18和timeout→重试记录保留 | 新地图不是其余12个节点通过。旧截图不批量改c89。 |
| 4 颜色项目 | `/projects`、`/projects/new` / `ColorProjects`、`NewColorProject` | 沿用86f已打开/截图与SOURCE_VERIFIED | 新建、编辑、权限分支无新增实际验收。 |
| 5 项目总览 | `/projects/:p?tab=tracking` / `ColorProjectOverview`、`ProjectTrackingLinks` | c89四入口真实点击：`/inspections`同周10/20活动可见，`/production`14条28台；旧项目`color-evaluation`未到节点0/12，旧`mass-production`未到节点禁用表单；各自浏览器back均回`tab=tracking`，最后总览返回来源→`/projects` | 入口及浏览器返回已观察。旧页自身返回link明确为`?tab=flow`，不伪装tracking；旧流程仅门禁观察，不记写入PASS。合成截图`after/project-c89-tracking-css1280.png`及4份destination文本由root保存。 |
| 6 样板记录 | `/projects/:p/tasks/:t` / `M1NodeWorkspace` | 9710重新登录→样板确认合成PDF→扫描CLEAN→保存返回来源project/taskId→重开+刷新。证据`after/confirmation-9710-path.json`及scanned/returned/refreshed三PNG、AX | 该路径不覆盖所有制样/退回分支，也不是标准板或评审验收。aee3400恢复样板路径另列。 |
| 7 标准板 | `/projects/:p/standard-boards` / `StandardBoardsWorkspace` | 沿用86f打开截图与SOURCE_VERIFIED | 创建、制作、下发、签收、完成仍未全走；项目未到节点的门禁需与缺实现区分。 |
| 8 项目评审 | `/projects/:p/reviews` / `ProjectReviewsWorkspace` | 9710实际驾驶室→一致性，未到节点按钮disabled；已打开标签保留草稿有组件证据 | 只记门禁观察，未执行评审保存/提交，不重引入多角色审批。 |
| 9 材料 | 项目资料、`/materials`、上传页 / `AttachmentsWorkspace`、`MaterialsCenter` | 318涂料材料链保留；9710本次合成PDF属于样板确认链，扫描CLEAN与保存读回有事实 | 普通附件替换/下载/权限负向不能用样板PDF替代。首载错误回归不冒称浏览器故障注入。 |
| 10 颜色库 / 工作簿 | `/admin/color-database?workbook=:id` / `FreeWorkbookWorkspace`；`?view=records` / `ColorRegisterWorkspace` | c89实际无效ID明确报错不fallback；新建ID与URL同步；保存v2刷新；从v1恢复追加v3，再从v2恢复追加v4。合成两表/一图导入ID `fdd44911-adce-4fc5-bb4c-34e435485908`与URL同步，继续图片导入扫描→明确保存→reload同ID v2；1440第一表14号粗体、合并A5:C5、公式结果20；1280第二表图片和值20可见。作者37、独立39项仅辅助覆盖同实例query/back、dirty取消与晚包；不替代UI | 首张restored截图为loading，不展示或计成功；ready截图已获授权且实际查看：`after/workbook-c89-restored-ready-css1440.png`及同名DOM，当前v4，A1合成导航验证/B1数量/A2保存与重开/B2 21均可见。c89实际browserback已回原`22205d21-fe60-4b7f-8a94-e45ef35ee9fb`、版本4；dirty原生confirm取消受工具限制未完成，未保存、未更改server。证据`after/workbook-c89-dirty-cancel-tool-limit.json`及back-version4 PNG/TXT。该取消分支不因组件测试或普通back通过判PASS。原11表/Office/IME仍绑定86及所有者事实；任意业务映射发布未实现。 |
| 11 周评与日常检验 | `/inspections` / `InspectionsWorkspace` | 自然周语义与86f新建10/19→编辑10/20→刷新、前周空态→本周事实保留；项目总览已新增明确全局入口 | 不能把全局周活动保存当旧月度评审完成；首次工具fill日期失败保留。 |
| 12 月度产量 | `/production` / `ProductionSheetWorkspace`、`productionSourceSummary` | 合成旧来源元数据导致`rowNumbers.join`崩溃；c89已兼容并实际加载13条，来源异常显示“来源信息待核对”而不改事实 | c89新增合成松柏绿/基地甲/2026-10/8台→整页reload→服务器读回8；原13条20台不变，总14条28台。截图`after/production-c89-refreshed-css1440.png`，DOM同前缀。首次工具fill月份失效，HTMLvalidation阻止写入；原生月份/年份键盘后成功，保留工具失败。未验证全部导入/冲突分支。 |
| 13 首次年度 | `/admin/color-database/:id` / `AnnualReviewPanel` | 原86f13月20台保存→刷新历史、9710普通档案status与原20历史读回保留；规则2026-09..2027-09首尾13月、2027-10复核、20保留 | 19/21/缺月/并发以真实PG/HTTP证据记录；不自动退出、不猜后续周期、不覆盖历史退出。 |
| 14 人员库 | `/admin/people` / `PeopleDirectory`、可切`PersonSheetWorkspace` | 原新增无账号→编辑刷新→停用归档→恢复无账号；86f1440/1024/389，9710合成1280截图补录 | 新截图不等于再次完整维护链；历史作者与最后管理员/会话边界仍只引用独立PG。 |

### c89 受影响源码定位与证据

- `apps/web/src/features/color-projects/project-overview.tsx:70` / `:107`：项目跟踪标签与四个明确入口，保留旧月度和旧量产。
- `apps/web/src/features/free-workbook/workspace.tsx:25`、`:32`、`:59`：实时query身份、读控制器/晚响应过滤、未决操作和dirty守卫；确认切换后旧编辑器移除，失败不展示错身份旧内容。自身URL更新不重读导入副本。GET15秒边界位于`client.ts`，CAS/幂等/扫描合同未改。
- 独审`/private/tmp/design-convergence-navigation-v2-independent-review.json`，SHA256 `0021748c3ee9d2586e62209fcf9ca5353ee2cf3b2607cc87edce5859afe43e8d`；39/39零skip，v1两条独立FAIL保留。不是实际Next浏览器history证据。
- `apps/web/src/features/production-sheet/production-adapter.ts:8`、`:42`、`:49`：历史来源按unknown解析，严格验证文件/表/行号后展示，异常只提示核对；不改原事实。UI13条加载由根实际确认。
- `apps/api/Dockerfile`的Sharp运行依赖属于候选构建修复；本矩阵不以源码修复或3390健康代替实际容器图片处理和Portable验收。

### 对照页与保留边界

`http://127.0.0.1:3394/`现含37张明确授权的参考/合成现场图；禁止真实清单截图或账号配置。三列布局、放大开关、14行展开已有根实际观察。旧target=_blank点击未观察新tab的失败保留；已改同页target=_self，CTA点击→同页3390/dashboard→后退3394/#top已实际确认。c89对照页已更新为37张授权图片、40项公开资源；5私密路径404、错误Host421。证据`/private/tmp/design-convergence-compare-verification-c89-tracking.json`（SHA256 `8d64e706b1b034a8b5f9e1caa166e427d5428d379ceb82c8b83a8b41cda28bda`）绑定本版内容、白名单及源码/运行版本。合成导入截图`after/workbook-c89-import-refreshed-css1440.png`、`after/workbook-c89-import-sheet2-css1280.png`及同名AX由根实际查看确认ready；仅复制获准PNG，不公开AX。产量新增/读回、工作簿恢复ready及此次导入图已展示，不展示loading恢复图。

同机3400恢复与实际Office/所有者IME范围沿用原精确记录。de2的API严格恢复与新写/重启限定通过，随后Chrome并发导致proxy OOM、45444当前不可用，后继候选修复中；生产HTTPS状态不从本轮UI推导；SOURCE_VERIFIED、截图、测试数量、构建和源码合并均不等于整页/整产品完成。最终产品负责人接受仍待明确。

对照页交互补录：root已真实点击同页“进入实际工作台”→3390/dashboard→浏览器back回3394/#top；lightbox开闭、14行展开与折叠也已实际验证。证据`after/comparison-interactions.json`。原target_blank未观察新tab失败保留；不再将已完成同页CTA标为pending。新补图库仍待root最终reload视觉复核。


### c89 精确390布局与返回补录

- 现场由root实际设置CDP `mobile:true,width:390,height:844,deviceScaleFactor:1`，首页、工作簿、人员列表及人员详情的`documentWidth`均为390，无body横向溢出；证据`after/exact390-c89-evidence.json`，不改旧86f 389事实。
- 精确图：`workbook-c89-css390-mobile.png`、`dashboard-c89-css390-mobile.png`、`people-c89-css390-mobile.png`、`people-detail-c89-css390-mobile.png`。仅这些获准合成PNG加入3394，新增后41图/44公开资源。
- 人员详情先在正常视口真实打开，再缩至390；移动仿真下两种点击无反应，清除后同定位器可打开。布局通过不等于移动点击通过，临时override已由root清除。
- c89工作簿普通browserback已回原`22205d21-fe60-4b7f-8a94-e45ef35ee9fb`版本4；原生dirty-confirm取消受工具限制未完成，未保存、未更改server。该分支保留未验，不能用组件测试或普通back结果替代。
- 3390仍运行c89；de2恢复API链为历史限定通过，后续proxy OOM/45444不可用与healthcheck错端口独立保留，后继候选修复中。


### c89 新建项目、说明编辑与资料路径增量（PDF 修复前真实事实）

运行仍为 `c89c5e5540c39423bd186539bb1ab3649771e9b6`，`http://127.0.0.1:3390`。本增量可并入本轮第4、5、9页的实际动作列；9710历史表不重写。

| 页 | 本次实际路径与读回 | 保留边界 |
| --- | --- | --- |
| 4 颜色项目 | `/projects` → `/projects/new`；填写合成基地甲、批准日期2026-10-19、依据/来源，上传合成PDF并扫描放行；创建项目 `cmvey2ws3001a9kuqemje6d81` 后进入详情3/18，批准报告已完成。 | 不覆盖所有角色/失败分支或18节点。基地label定位和文件chooser监听曾失败，按真实AX与先监听后点击成功；不记作无失败路径。 |
| 5 项目总览 | 编辑该项目需求说明 → 保存 → 整页刷新 → 再打开编辑框，读回相同内容 → 无修改取消。批准报告节点 `cmvey2xyf00259kuquf6jrzyt` 显示原日期、依据、来源、已放行V1与审计；返回原项目 `tab=flow&taskId=…`。 | 与既有tracking四入口记录并存，不把本次flow返回改写为tracking。 |
| 9 材料/附件 | 项目资料列表1材料，CLEAN；实际下载与合成原件SHA256相同：`97f59943dabd4bcc3b8f88207a625bfbbc0598b889f910c45466ba8127aecfdd`。 | **内嵌PDF预览FAIL**：HTTP200/inline仍被 `coep-frame-resource-needs-coep-header` 阻断。下载通过不等于预览通过。PDF-inline最小COEP修复已形成独立审查补丁，真实新制品绘制仍待验证。 |

证据：`var/design-convergence-20261019/after/project-c89-create-edit-path.json`，同目录 `project-c89-{created,edit-readback,approved-report-readback}.{png,txt}`、`project-c89-material-preview-failure.{png,txt}`、`project-c89-pdf-response-headers.json`、`project-c89-pdf-network-diagnostics.json`。比较页只可复制已明确授权的前三张合成PNG，不复制下载件、私密材料或真实清单。

最小修复补丁 `/private/tmp/design-convergence-pdf-preview-20261019.patch`（SHA256 `76bcdf472c32a02604a0b6d5818a472500ed984b68fa0e09637a9e79580b2d08`），仅PDF inline添加 `Cross-Origin-Embedder-Policy: credentialless`；原CSP sandbox/default-src none、CORP same-origin、nosniff、权限与CLEAN检查不变。作者及独立各86项目标回归通过；独立报告 `/private/tmp/design-convergence-pdf-preview-independent-review.json`（SHA256 `5f44b23e4d54bb6a5d4d4ffd5b9287d53cb661c6601ee60bc2835fa83d74e946`）。该测试不替代浏览器PDF绘制。


### 4bdb 当前运行与恢复增量

3390当前实际运行 `4bdbb85174208d30a12c70bba777f1bd6a86c123` / tree `60781402dfee27c99d1f567019450ded7c858be8`，构建时间2026-10-19T08:07:32Z、BUILD_ID `bcCQGc6V-oSOX4p4Df5TG`。升级先备份既有隔离数据库，核对完整migration文件集合与字节，再迁移/保留对象/重启；API与Web均200且身份匹配，详见 `var/design-convergence-20261019/preview-4bdb-cutover.json`。此前318 EXPECTED配置残留导致旧build-info500，首次helper在停服前断言拒绝；失败保留，不能把旧Web健康记PASS。

- 第4/5页以上c89新建、编辑、刷新、批准报告返回增量覆盖原表的相应“未验”项；其它权限/失败分支保持未验。
- 第9页：c89原PDF缺COEP的FAIL保留；4bdb只精确增加PDF inline COEP，安全限制不变。新B45454资料页的PDF原件、响应头、匿名/退出负向有实际接口验证；自动工具暂停PDF响应，不能证明绘制。所有者手动确认“能看到 PDF 正文”，单列OWNER_REPORTED_PASS。
- 第10页：新B45454原账号登录→新建 `72b9c48b-63a2-4a49-993f-18eee00204bc` → 四格输入 → 保存v2 → 整页刷新同ID v2，合成松柏绿和20实际可见。`after/portable-4bdb-workbook-readback.{png,txt}`。旧builder工作簿版本未覆盖。
- 第2页新增真实缺口：`/projects/:id/materials`登录returnTo被旧精确白名单拒绝，落/dashboard；同项目 `?tab=materials`形式可用。已对main核对为既有未改问题；资料子路由深链返回仍未完成，不以登录成功替代返回验收。
- 最终portable的70表/2对象、schema、原密码/会话隔离、新写入和重启读回为同机新卷事实；物理异机未执行。离线软件与备份持久保存于本机delivery，未部署正式域名。

## 2026-10-20 V1 A01–A15 路径对应（持续实施，非最终签收）

本节承接已有14页对照及后续增量；总进度和有效口径仍见 [V1入口](TRUCK_COLOR_V1_COMPLETION_20261020.md)。以下新证据位于 `var/truck-color-v1-20261020/`。API3491/代理3490来自干净e0870e8f4d919496d0161646ccc2c1aa28cd7822，Web3492是同步至c8a33daf2ba061b7c42cb78c794d5e657686675d的开发快照；不称完整最终制品。

| 验收项 | 实际路由及动作/返回 | 当前证据与仍需完成的范围 |
|---|---|---|
| A01 原生账号/共同维护 | `/login` → `/admin/people`；账号入口 `/account`；人员详情返回同列表 | `a01-api-result.json`：两个非管理员且无岗位角色的已准入成员创建/修改同一合成人员v1→v2；未准入403，停用/失效会话401，旧版本409；改密、一次性恢复、退出再登录真实HTTP通过。双成员GUI尚待，不拿API代替页面验收。 |
| A02 自由编辑 | `/admin/color-database?workbook=:id`；原生工具栏和工作表标签；业务保护表仍由`?view=records`进入 | `filter-api-readback.json`：实点筛选/排序、保存rev3并读回；全多表结构、冻结、填充等沿既有证据逐项复用/补验，尚未总PASS。 |
| A03 整本/草稿持久化 | 同工作簿保存、关闭重开、恢复本机或服务器草稿 | `unknown-ack-result.json`、`inflight-ack-result.json`、`server-draft-browser-result.json`、`cloud-unknown-ack-result.json`、`cloud-two-editors-result.json`已覆盖对应异常回执/N+1和双槽冲突；最终多表/全格式/图片合并样本仍待。 |
| A04 IME/性能 | 同工作簿真实系统输入；正式构建下既定规模样本与模块切换 | `ime-owner-result.json`限定ec20监听3490的Mac Chrome人工反馈；Safari与最终相关快照保护范围另验。性能口径固定在V1入口，无新实测数值或PASS。 |
| A05 Office往返 | 导入XLSX→工作簿→导出副本→本机Office→重新导入 | `filter-xlsx-artifact-result.json`只证实际导出文件区域/全行和显式条件转换；旧Mac Excel按旧版本复用，新代表性多表/图片往返尚待。 |
| A06 图片 | 工作簿图片/重试、业务稳定ID图片入口；保存重开 | `image-retry-browser-result.json`、`image-background-repeated-result.json`覆盖429/连续网络错误后手动恢复，文本/绘图不变；排序插行、改名、业务归属和最终含图往返仍待。 |
| A07 显式业务映射 | 工作簿“应用到业务”→人员、颜色记录、检验活动或产量范围→对应业务详情 | `mapping-person-readback.json`已走两人映射、重复字段报错、预览值、应用、人员详情读回；`mapping-person-replay.json`精确API重放同一操作不增人/版本。其他域及应用日志跨页面恢复尚待。图片映射当前明确拒绝，保留原工作簿并由业务图片入口另行绑定，不宣称自动搬图。 |
| A08 幂等/并发 | 工作簿操作记录、历史恢复及导入；业务应用日志与冲突提示 | c8a33da三类持久意图已接线及独审。`a08-create-new-page.json`新建响应201丢失→关原页→新页面精确重放同一工作簿通过；普通reload曾被离开保护取消，仅记同页重试。恢复/导入与业务应用跨页面仍待。 |
| A09 颜色身份/标准 | `?view=records`、颜色档案/项目关联、标准更正理由与历史 | 沿现有标准/合并关系证据；当前候选关联、排序改名/导入后的精确读回尚待，不合并两个尊贵蓝身份。 |
| A10 项目及并行分支 | `/projects/new` → `/projects/:id?tab=flow` → `/projects/:id/tasks/:taskId`及材料子路由 → 原项目/任务 | 旧建项和材料登录返回证据复用；新独占合成项目从正式API推进，采购中间状态及完整并行路径尚待实操。 |
| A11 两类整改 | 驾驶室工作单、整车评审/外饰件整改；返回原项目流程 | eac13ea差异及隔离数据库验证已通过，现API已包含；驾驶室返工与整车整改GUI/正式接口路径待完整串联。 |
| A12 周评/人员 | `/inspections`活动→多色/多车明细、人员选择→颜色/项目查询 | 当前分支正在取消虚构每色12月义务、按显式抽检关联处理；独审成立的项目列表截止日漏过滤已交修。候选和实际路径仍待。 |
| A13 半年性能 | `/projects/:id/paint-procurement` → 实际到货 → `/projects/:id/performance-tests`及提醒 | 当前API含首次有效到货+6日历月/月末夹断/后续不重置；隔离PG日期边界有证据，采购实际记录到期限/提醒的集成验收待完成。 |
| A14 产量/年度复核 | `/production`明细/汇总/导出 → 颜色档案年度复核 | 车型事实与月总量明确口径/CAS正在隔离分支实现；10+12+5、修改及13月≥20/未知的最终集成证据待完成，不复用旧总量结果冒充车型验证。 |
| A15 候选/导航/恢复 | 1440/1280/390的上述入口；离线恢复实例及约定目标域名 | 旧14页对照/恢复范围保留。本轮Web仍开发快照，最终CI、不可变应用制品、Safari、导航尺寸、备份恢复及目标环境均未完成；产品状态仍AWAITING_PRODUCT_OWNER_CONFIRMATION。 |

15:02左右Mac锁屏导致浏览器控制超时，现场工具明确自动解锁失败；仅GUI暂停并已请求手动解锁。该环境阻断不计产品失败或PASS，未调整生产时钟或扩大权限。

当前结果与历史表分列；完整产品仍待所有者验收，未覆盖的主动作仍按原矩阵显式保留。

3390切换后原账号实际登录并回原项目 `?tab=materials&taskId=…`，原CLEAN材料下载SHA未变；旧合成工作簿仍v4/B2=21，本次只读。IAB PDF网络200/COEP已修复，但黑色阅读区/blockedByClient与inline-style CSP错误仍保留，不冒称IAB绘制通过。证据 `after/preview-4bdb-browser-verification.json`。

最终3394对照包含45张明确授权图片、48项公开资源，14页可展开、三列对照和放大、同页实际应用CTA。37/41张的旧统计只属于对应历史版本。最终核验 `/private/tmp/design-convergence-compare-verification-final-4bdb.json`，不展示真实清单内容。

对照最后仅补文本边界：`/private/tmp/design-convergence-compare-final-text-addendum.json`（SHA256 `80f5bdc906a23a30c225f5c4976b748a9db1ad40a1f9c8fcd0f89cfed4589c75`）绑定最终HTML/manifest，复用同一图库/脚本/服务的48项检查。49个对照包文件已原字节持久复制至 `var/design-convergence-20261019/delivery/reference-comparison-20261019/`；根任务已重新加载实际查看最终三列与边界并保存 `after/comparison-final-4bdb.jpg`。

2026-10-21增量（3490 API/Web=cbe）：A11实际14整改表单→新复审→上传→提交→通过→15排产，刷新两轮历史保留；A13报告缺附件拒绝/上传/提交只读与截止不重置实走；A08晚输入拒绝、A07照片归属/原件补齐。A02仅Mac Excel小型筛选样本打开另存，完整往返待验。A01通知资格已合入15c但未运行、当前队列false。后续布局核对使用真实CSS1440/1024/390，旧物理窗口宽度不等同CSS。


### 2026-10-22 冷备暂停与已提交候选增量

当前3490/3491/3492和合成PG/Redis均停止，所有者明确冷备尚未完成、暂不启动Docker。下列源码结果不标为真实页面通过，旧cbe路径证据按其版本保留。

| 对应页/验收项 | 新候选189a8c4改动或实际证据 | 尚未覆盖 |
|---|---|---|
| 导览及六主入口 | `/guide`实际六路由、共同维护、实际抽检及年度13月/20台口径修正；原驾驶室12→11/历史月期次保留；5项目标和精确独审通过 | 新候选截图、点击/返回与真实CSS1440/1280/1024/390；1280仍属原矩阵，不由1024替换 |
| 工作簿A02/A05/A07 | 合法x:前缀XLSX内存兼容与安全预检差异修复，原附件hash不变；100目标/独立回归及精确合入源blob确认 | 新候选原件真实导入/标题样式/保存刷新/业务映射；旧源码FAIL不覆盖 |
| 产量页A14 | 原始业务记录total、计入口径记录factCount、待补全/核对项unknownCount区分，移除错误相减；2文件联合独审含此copy通过 | 实际27→25→26/稳定ID/未知/0/混合口径唯一计数/13月年度路径 |
| OfficeA05 | Excel16.114真实打开既有双表、中文/20/合并/样式和第二表图片；截图及原件不变收据已保存 | Save As持续禁用已取消，原因未明、无新副本；完整往返不通过 |
| A11已闭合路径 | 复用10月21日cbe原14整改→复审→15及历史保留实操 | 新改文案只补实看，不机械重放完整已接受链 |

新应用候选189a8c4的代码检查通过但293个DB/Redis用例SKIP；当前在线预览不可用。参考/实装对照保留本机离线HTML与历史合成图，不能替代待恢复的产品。具体日志/失败与剩余仍见同一[V1入口](TRUCK_COLOR_V1_COMPLETION_20261020.md)。

R08补录：189a8c4的API/Web不可变Darwin构建已均完成，同commit/tree/release/buildTime，尚未启动。小型Excel4×2样本另存副本已于10月21日cbe实际回导、保存刷新rev2，按filter-excel-roundtrip-readback.json复用；完整双表/日期/公式/图片范围仍未通过，今天Save As失败不覆盖此历史小样本事实。
