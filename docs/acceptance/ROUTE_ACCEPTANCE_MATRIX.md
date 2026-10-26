# Route Acceptance Matrix

当前V1断言与计数唯一入口：[可执行验收基线v1.0](#v1-baseline-v10)；状态总入口 [TRUCK_COLOR_V1_COMPLETION_20261020](TRUCK_COLOR_V1_COMPLETION_20261020.md)。下列原有各日期表均为保留历史，不自动代表当前运行或最终PASS。

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


2026-10-22 Office增量：所有者解锁并手动另存成功，实际Excel副本13762B/SHAe0c1030e…，双表/图片截图留存。原R08生产解析真实拒绝该副本；已在2eede76修复精确revisionPtr/calcFeatures元数据准入，新生产解析双输入成功。数据/公式缓存/合并/图片字节保留，字体、行高和列宽差异保留，图片相对锚点不代表绝对位置相同。A05仅NATIVE_SAVE_AS_AND_PARSER_VERIFIED；完整浏览器回导/保存刷新、日期与全格式保真未通过，不能用解析或116回归替代产品验收。Docker冷备hold仍有效，3490继续不可操作。证据及失败链见同一V1入口“Mac解锁及原生Excel另存后的兼容性修复”。


2026-10-22后续安全增量：R09构建后发现未知MAIN容器下cols能绕预检，实际消费sentinel已证；R09仅历史。最终01b4bbd按完整URI/核心节点路径修复，130受影响/独立20及目标59通过、同文件load0；真实Office r04解析保持原完整结果。不得把旧R09或解析结果写为最终页面/Office往返PASS，浏览器回导/保存刷新仍未执行，Docker停机条件不变。


R10反馈39ac3d37补录：A05原生手动Excel另存步骤可收口，自动按钮灰色不再单列产品阻断。完整A05仍待R10实际浏览器中两文件各按自身XML/解析基准导入→保存→刷新→接口读回，图片实际位置/真实重算/原日期样本分别核对；pending+SPANS_ROWS归属不猜测。冷备/重启许可未解除，当前无可操作预览，整体未到签收。


<a id="v1-baseline-v10"></a>
## V1 可执行验收基线 v1.0（PM已核对冻结）

<!-- V1_BASELINE_V1_0_START -->

本节是A01–A15唯一现行细项；前面的各日期表为保留历史。范围基线 `PM_REVIEWED_FROZEN` 不变，产品 `PARTIAL / AWAITING_PRODUCT_OWNER_CONFIRMATION`。当前本机实际应用与源码均为 `3941beccddd0dfce94c8f0f7fd7d62819fb05270` / tree `db699c2e128e9c40d677de2ccca0788d8ffccdb9` / `truck-recovery-r30-3941beccddd0` / build `2026-10-26T12:28:07Z`，E97构建、E98实装及严格CA四身份、E99–E101实际使用分别成立。17aa与R27保留各自历史，原R23事故库/原API继续停写，旧构建、失败与PASS不覆盖。

冻结依据：[PM反馈原文](../../var/truck-color-v1-20261020/baseline-pm-review-20261023-r01/pm-instruction.txt)，Gmail `1a167cfcb731a6b9`，SHA256 `9c56293247560297a8d2dfde11bc9e553c4bdd6ec565754720d11cf6add2a164`。来源会话PM消息 `4eee3111-3e3a-4762-918c-2dc2d688c660` 确认所有者人工上传已收到并审阅，认可原范围/计数，批准解除E2E-09/A15-12循环并局部检查后直接冻结。原报告及摘要保留；人工收件不改变原自动登记收据。原独立审查仅覆盖原diff，本次局部检查/新diff审阅另存同一反馈证据目录。

### 范围、来源和计数

S1：[原R02完整合同受控原字节副本](../../var/truck-color-v1-20261020/acceptance-baseline-20261023-r01/original-v1-contract.txt)，Gmail `1a157ab3b180f4aa`，SHA256 `1d4eb08ae4a7271b91a1f7103676b5b1140a0340b455d4c24caafb761a40e3d4`。`S1:Axx`精确对应L122–170十五条：A01 122–123、A02 125–126、A03 128–129、A04 131–134、A05 136–137、A06 139–140、A07 142–143、A08 145–146、A09 148–149、A10 151–152、A11 154–155、A12 157–158、A13 160–161、A14 163–165、A15 167–170；其他L号按原字节副本，不随本文件增行漂移。

S2：所有者明确执行的[10月19日续接附件](</Users/lixiaochen/Downloads/仓库进度核对与Codex设计落地续接_20261019.md>)，本轮仅引用授权文字，源层级和短原文保存在本机scope-source-analysis.json；不把附件中的历史叙述自动当新权限。

S3：当前基线任务原文，Gmail `1a1678fa0e3cd0a7`，SHA256 `3a66c78950d2acaaf91d547857bd672c4e56785196926d76ba94199543b13638`，来源人类消息 `5596d75b-92eb-405c-b3e9-ff136e50702c`；本节行号S3:28–35/41按5498字符原instruction。S3明确保留13月/20、真实周评、原生账号和范围约束，不授权运行资源。

S4：[既有R04口径](../../var/truck-color-v1-20261020/feedback-R04.txt)，Gmail `1a157e1b0cfb434d`，`instruction`字段“四、A13口径确认”；本机所有者答复对应 `call_aadb7c4219814db0ae74a6acd66f463e`：首次有效实际到货+6个日历月，月末夹断，后批不重置。年度13月/20由所有者 `call_97bd0bfa97794096aaa95b2c06e6aa63` 两项答复及既有R03承接；不重复提问。

S5：[AGENTS.md](../../AGENTS.md)当前§1/§3/§6–9/§12；明确离线运行、合成异机恢复能力及精确正式HTTPS目标，普通成员不等于系统管理员。S7：[V1入口“A04 自由工作簿测量合同”](TRUCK_COLOR_V1_COMPLETION_20261020.md#a04-自由工作簿测量合同实测前固定)及[既有PERFORMANCE](LIGHT_TRUCK_SHEETS_INTEGRATION_02_04/PERFORMANCE.md)；S8：本矩阵既有“14页路由与动作”中第7/13页及2026-10-20后追加；S9：[10月22日冻结审计](../../var/truck-color-v1-20261020/status-audit-20261022-r01/detailed-status-report.txt)，SHA256 `04dc47acc7d38c709b354abb8b987cab89eaff1479c5b4f5baf6a05739eab450`（事实快照，不是需求源）；S10：[DESIGN_CONVERGENCE](DESIGN_CONVERGENCE_20261019.md)“实现与合同/分项结果”；S11：[唯一Finding](../security/FINDINGS.yaml) `R28-V1-XLSX-NAMESPACE-BOUND-001` 及[既有Gates](../gates/VERIFICATION_GATES.md)；S12：[NATIVE_PORTABLE_20260917](../handoff/NATIVE_PORTABLE_20260917.md)原独立Lima VM载体/离线恢复验收记录。

唯一MUST条目计一次；按用户可独立判定的场景拆分，不按函数/截图/命令数量计数。代码/API、GUI、Office、系统IME、真实PG/Redis、恢复及目标环境方式明确，不能互充。PASS只计所列断言全部有证据，且对所列当前候选输入有逐版本适用复用依据（旧R10/R11及后续桥接保留各自范围）；保留原受测版本/日期，不改标今日重测。PARTIAL/NOT_VERIFIED/BLOCKED/FAIL/SKIPPED/SCOPE_UNRESOLVED均不进分子；OPTIONAL和有来源的NOT_APPLICABLE不进分母、不充PASS。环境HOLD只是下一执行依赖，不取消旧有效PASS。

一个场景可支持不同断言：如A07-04验“正确映射生成正式事实”，A14-01验“这些事实修改后统计/导出对账”；同一个断言不在两个A包重复计数。原子表是状态源；本节统计、主入口看板和本机JSON均从它派生。生成JSON为只读快照，不能人工维护成第二账本。源摘录/差异分析JSON只是本轮一次性证据，不是当前状态源。

本次对S9历史建议的范围核对更正：离线包、合成异机恢复、正式HTTPS仍MUST；可迁移包在独立目标主机/VM恢复使用，旧同Mac新库/新卷只局部。未找到“必须物理第二台硬件”“宿主OS整机重启”“多图逐张中途checkpoint算法”原始强制来源，故A08-90/A15-90/91仅OPTIONAL，不移除图片/异常幂等、浏览器关闭恢复、一般应用重启/独立异机能力。无阻断基线的真正SCOPE_UNRESOLVED；如果PM指出原范围漏项，显式更正版本和分母，不静默删改。19台严格使用既有S8第13页：待原退出评审、保存不可变证据、不自动退出/推进；缺原始所有者19逐字消息ID的来源层级已记录，不据代码或20阈值新造动作。

### 公共前置、样本、版本和执行责任

M1/M2为原已准入、非管理员、roles=[]合成成员；U未准入/D停用，系统管理员只执行原受控系统动作，绝不临时给M1/M2管理员绕过。账号秘密不进入矩阵/报告。RUN前置已于2026-10-24解除：所有者确认冷备完成并授权恢复原专用资源，核原容器/卷/合成库/对象后逐候选运行至R23且四字段一致（E38/E66）；10月25日依赖异常另记录，恢复期间不称业务就绪；不授权生产扫描VM/生产发布。本机3490仅既有隔离入口，不把默认dev配置当可写授权。

W=原双表合成工作簿工作副本：`工作表1`、`合成记录页`；已知 `C2=SUM(B2:B3)`、B2=12/B3=8、缓存20，A5:C5合并、表头14pt粗体居中、空值及一PNG。O1 SHA256 `15be6e7627563c5259f169d78dac6558abe4ebe3b39f060006ed6dd6d91dec43`，O2 Excel另存 SHA256 `e0c1030ece148ccee5a33eeddef36cff3e790c4343b5e49670728423b73559cd`；各自对自身XML/解析基准。图2240字节 SHA256 `5bfbf0545f002fa86cc76a40f9c97fc0b629bdf70b390038779264e64a1ecb1b`，A2+4/4px、160×100；pending+SPANS_ROWS不猜业务行。Excel自身37项样式/几何差异、原空第10行高/字体/列宽变化保留；相对锚点≠实际绝对位置，推导28→36px不是截图测量。日期另用原授权11表固定样本，E68已取得元数据/原生显示及实际回导；双表本身无日期。E84结构本四值与E92代表式已闭合；E99已闭合O2小数列宽受影响范围；两份基准按各自历史原生Office和新增尾段组成连续链。

V-E087=`e0870e8f4d919496d0161646ccc2c1aa28cd7822`；8c630=`8c630ac3c370c54908c9e5b22c0c39af3930d81e`；ec20=`ec20c517896186550098a8ddb72dbfa17782ce69`；c8a33=`c8a33daf2ba061b7c42cb78c794d5e657686675d`；37b3c1a=`37b3c1a989a366f016117e40040eb3c6fee68a0f`；f8bc438=`f8bc4382c6bde573a8b72a1f1bd24110ed496d89`；f43e3e3=`f43e3e382f2950737e6cec0837a84e1398ffbb5b`；V-CBE=`cbe1b35922462325738129c857176fbf24bbc4e5` / tree `d4d12ad0ea544e91939ddcf2e86632707827e542` / release `materials-r04-api-cbe1b3592246` / buildTime `2026-10-20T09:43:35Z`；V-R11=`823b1ea2c3bdfc530720cd8570f4acb2de813fe4` / tree `4885b9fe866be8a9f6456f20abeb26fae1942869` / release `materials-r11-823b1ea2c3bd` / buildTime `2026-10-24T05:14:33Z`；V-R10=`01b4bbdb198a0c0fb324fdded5cb1c8b7bc3146a` / tree `4e3e287d60d82a130440699d1ac151e3c95d40ad`，release `materials-r10-01b4bbdb198a` / `2026-10-22T07:51:49Z`。旧Web开发overlay只能按具体模块源绑定，不伪造完整不可变Web运行身份。

每个未闭合条目“下一动作”责任人默认Codex主执行；只读子任务独审不代执行/人签收。NOW为补证/实施；当前独立Lima已运行3941，RUN项按实际身份执行；HUMAN/外部具体目标/许可/签收另列。已满足条目不排重复任务。性能次数及阈值写在A04，云稿次数未规定则原始n记录，不新增阈值；手机仅关键浏览、节点、附件，不要求完整桌面表格编辑。

### 原子断言（唯一人工维护状态源）

#### A01

| ID | 范围/准确出处 | 验收断言/样本 | 入口、步骤与可观察通过条件 | 所需方式 | 最近真实结果/证据 | 候选适用性/复用依据 | 当前结论 | 未完原因/执行依赖 | 最短下一动作/责任 |
|---|---|---|---|---|---|---|---|---|---|
| A01-01 | MUST; S1:A01; S3:28 | 获准普通成员API共维与准入：M1/M2 roles=[]、U未准入、D停用 | /login→/admin/people对应API；M1建同一人、M2更新；U/D/旧revision请求→共维v1→v2、403/401/409且不自授角色 | 原生认证HTTP/API | E01 | R01：认证/人员/授权代码及相关表不变 | PASS | 无；只闭合API边界，不含双成员GUI | 已满足；不重复执行此局部；Codex仅核E2E集成及后续输入变化 |
| A01-02 | MUST; S1:A01 | 原生密码/会话生命周期 | /account及auth API；改密、单次恢复、退出后重登→旧密码/旧session失效、恢复令牌只用一次且原事实保留 | 真实HTTP/API | E01 | R01：受测密码/session代码同字节 | PASS | 无；注册初始化/最终环境另见A15 | 已满足；不重复执行此局部；Codex仅核E2E集成及后续输入变化 |
| A01-03 | MUST; S1:A01; S1:67 | 两名批准普通成员在GUI共同维护一条人员资料 | M1/M2分别/login→/admin/people→同ID详情；各保存/刷新/返回→值/历史/作者一致，无旧岗位申请或管理员捷径 | 真实GUI+API读回 | E01；E44：R14双成员GUI/两次PATCH/刷新GET/原PG审计 | R14人员与认证相关代码未受后三项窄修影响；只按此链复用 | PASS | 无；同一人员ID rev2→3→4，两actor均非admin、roles=[]，不自授岗位 | 已满足此局部；系统管理/私有草稿边界仍单列A01-04 |
| A01-04 | MUST; S1:A01; S3:28; S5:§3 | 共同业务之外的系统管理/私有草稿边界保留；联系人不自动获登录资格 | M1新联系人并读取M2私有云稿/受控账号管理；U尝试登录业务→联系人不建账号、私有稿/系统动作被服务端拒绝，既有管理员合法动作可用 | HTTP权限负向+真实PG/Redis（适用）+GUI名单 | E01/E05/E06/E44；E48 R17系统边界与私有槽精确复用独审 | R17准确原生成员/管理员8GET与GUI；13草稿PG/8工作簿PG/25规则旧结果按6核心源和模型同字节复用 | PASS | 无；他人私有槽返回draft=null，非本人publish/discard冲突，系统管理403；不等于全API均403 | 已满足本限定边界；管理员实际准入操作沿E01，R17只读控件与GET，不声称重授准入 |

#### A02

| ID | 范围/准确出处 | 验收断言/样本 | 入口、步骤与可观察通过条件 | 所需方式 | 最近真实结果/证据 | 候选适用性/复用依据 | 当前结论 | 未完原因/执行依赖 | 最短下一动作/责任 |
|---|---|---|---|---|---|---|---|---|---|
| A02-01 | MUST; S1:A02; S1:58,70,72 | 自由工作簿与受保护业务表分合同，实际可编辑且业务ID/命令保护保留 | /admin/color-database?workbook=:id与?view=records；在自由本结构编辑，再在业务表尝试不合法身份/命令→自由本操作真实生效、业务写被校验 | GUI+API/命令负向 | E57原结构正向；E101当前双入口与业务负向 | 3941实际W4ec…v9→青州白固定ID/revision4；双击/Backspace真实拒绝，浏览器9GET/零业务写；一次正常认证PATCH含合法note+非法id得400，颜色3份/工作簿4份含返回DTO字节等，独审a0ad0581… | PASS | 无本项缺口；限当前合成记录，未动态执行隐藏结构命令，不代整本E2E-02 | E57结构编辑按16源码与锁/包差异限定复用；实际业务ID/命令安全保持，不因开放自由本删除保护 |
| A02-02 | MUST; S1:A02 | 多表与行列结构操作：W双表副本 | 工作簿内实点新建/切换/改名/删除测试表、插删测试行列→各操作及撤销后目标表/数据位置正确，正式保存刷新 | GUI+正式API读回 | E57 R20结构GUI、正式v3/v4及两次刷新GET；E32旧范围保留 | 实点新建/切换/改名/删除测试表、行列插删和Undo/Redo；同ID/顺序/内容恢复，原双表不变；仅小型样本 | PASS | 已满足E57局部；不含新剪贴板代码或任意大表删除 | 后续输入变化按影响复验，不提升A02-03/06或整本E2E |
| A02-03 | MUST; S1:A02 | 输入/复制粘贴/填充/撤销重做可用 | W中文/前导零/空值单元格；键入→100×10外的小功能粘贴/填充→撤销/重做→值/类型/范围正确，无无效主动作 | 真实GUI+保存读回 | E57结构输入/填充/Undo/Redo；E59复制v5正式刷新独审 | R20右键复制B2→粘贴F2，v4到v5仅新增F2中文STRING；原前导零、空值、填充/Undo/Redo按E57复用，失败尝试保留 | PASS | 限该小型样本；不含图片剪贴板、性能或新R21行为 | 后继输入变化按影响复验；A02-06代表式/格式范围见E92；其他整链另验 |
| A02-04 | MUST; S1:A02 | 基础格式/合并/行高列宽/冻结可编辑并保持 | W表头14pt粗体居中、A5:C5；改样式/高宽→合并取消→冻结滚动→保存刷新；值和样式、冻结范围正确 | GUI+snapshot读回 | E57 R20截图138–147、正式v3/v4与刷新GET；E09/E32旧范围保留 | 14pt粗体居中、合并取消/Undo、行高36/B宽160、首行冻结滚动及v4保持；失败尝试单列 | PASS | 代表基础格式已满足；非全部Excel格式或图片绝对几何 | 后续格式变更复验；A02-03见后续E59；A02-06原11表单列 |
| A02-05 | MUST; S1:A02; S3:33 | 小型4×2筛选排序和显式导出转换 | 数量10/12/5；实点筛10/12排除5→数量升序→保存rev3→导出；A1:B4、全4行及读回正确，条件不导出按原提示说明 | GUI+真实导出ZIP/XML+API | E02 | R03：filter交换/插件/服务端规则及e087锁一致；普通成功分支不受后续新失败UI影响 | PASS | 无；此范围不含新reader的完整Office回导 | 已满足；不重复执行此局部；Codex仅核E2E集成及后续输入变化 |
| A02-06 | MUST; S1:70; S1:A02; S1:A05 | 固定原业务所需公式/格式支持表并覆盖代表样本 | 以W的SUM(B2:B3)、中文/前导零/空值/A5:C5和原已授权11表元数据定支持清单；标明真实日期序列/numFmt，再GUI编辑/保存读回；不支持对象明确告知 | 既有元数据+真实GUI+API读回 | E09/E32/E68支持清单/日期；E40/E42 SUM；E92原11表两输入真实修改、代表直接引用/算术重算、保存v3及刷新 | 17aa下920fc926…：B42 4→5，跨表G43 39→40；B82 416→417，N82 3651→3652、O82 4187→4188。315表达式不变且缓存独立核算相符；11表、502numFmt、212日期格及11背景引用保持；非315次GUI测试 | PASS | 限既定代表式和格式支持清单；初次401/草稿待核实失败保留，重新登录后同草稿核实并正式保存 | 已满足该原子断言；不增加函数范围，不重演SUM/日期；其他工作簿整链另验 |

#### A03

| ID | 范围/准确出处 | 验收断言/样本 | 入口、步骤与可观察通过条件 | 所需方式 | 最近真实结果/证据 | 候选适用性/复用依据 | 当前结论 | 未完原因/执行依赖 | 最短下一动作/责任 |
|---|---|---|---|---|---|---|---|---|---|
| A03-01 | MUST; S1:A03 | 整本正式保存后关闭浏览器、重登重开 | W多表含图/样式/公式；等待真实保存回执→关标签和整个浏览器→重登同本；值类型公式表顺序合并高宽图片一致，未保存/失败状态明确 | 真实GUI+正式API+browser重开 | E99正式v2；E100所有者退出重开+根正常退出登录/重登/返回 | 703898c1…v2四份完整DTO字节等ec68…；所有者报告正常退出整个Chrome后值图正常，根实际logout/login/GET均200并看14/23/双表绿图，独审49dc9ee6…；两类观察分列 | PASS | 无本项缺口；OS退出由所有者报告，不以browser ID变化冒称自动观测；A03-05/E2E-02另记 | 已满足限定正式保存重开；E99未保存→保存与E92失败/待核实状态按未变输入复用，不要求宿主OS重启 |
| A03-02 | MUST; S1:A03; S3:32 | 未确认输入的隔离本机稿可恢复 | 在单元格未按Enter输入→本机落稿→刷新/关页→恢复→正式保存；20稿可恢复/21拒绝、账号隔离及旧写删保护按原承诺成立 | Chrome GUI+IndexedDB+API | E03 | R02：草稿/编辑稿/save-session同字节，普通挂载/restoreEdit连续源段未变 | PASS | 无；整浏览器/完整格式集成仍见A03-01 | 已满足；不重复执行此局部；Codex仅核E2E集成及后续输入变化 |
| A03-03 | MUST; S1:A03; S3:32 | 无本机稿的新上下文可恢复私有服务器草稿 | 云稿保存回执后新上下文无IndexedDB→读私有云稿→恢复并发布rev2→仅精确对应槽清理；云稿丢回执新输入也保留 | GUI+server draft API | E05 | R02：云session/client/后端CAS不变；8c→e087更严资源键校验不影响合法唯一资源fixture | PASS | 无；不覆盖新实例身份配置 | 已满足；不重复执行此局部；Codex仅核E2E集成及后续输入变化 |
| A03-04 | MUST; S1:A03; S1:A08 | 旧回执不清掉保存期间的新输入 | 分别在回执丢失/在途继续N+1输入→关页恢复→同请求核实只确认rev2且N+1仍dirty→明确新保存rev3 | Chrome GUI+意图/草稿+API | E04 | R02：save-session/writeVersion/草稿协议相同；两个回执位置为同一场景变体 | PASS | 无；不是全部故障组合 | 已满足；不重复执行此局部；Codex仅核E2E集成及后续输入变化 |
| A03-05 | MUST; S1:A03; S1:134 | 等待公式期间的新编辑/组词不得被误标已保存 | 工作簿保存/导出/应用取值等待formula后开始新编辑或IME；本次明确拒绝/保留新输入、不可显示成功；下一次明确保存可读回 | 异步边界代码+真实GUI/系统IME适用部分 | [历史47项日志](../../var/truck-color-v1-20261020/committed-snapshot-tests.log)及[8d829开发同步身份](../../var/truck-color-v1-20261020/web-r03-sync.json)；E07只正常IME | committed-snapshot及5分支测试8d829→3941逐字相同；47是历史三文件合计，不是47次GUI；新交错仍待观测 | PARTIAL | RUN（当前实际3941；仅补对应未闭合路径）；责任Codex | Codex先补受影响异步交错；只在缺真实系统组词过程时请求具体人工，不重复已有正常ChromeIME |

#### A04

| ID | 范围/准确出处 | 验收断言/样本 | 入口、步骤与可观察通过条件 | 所需方式 | 最近真实结果/证据 | 候选适用性/复用依据 | 当前结论 | 未完原因/执行依赖 | 最短下一动作/责任 |
|---|---|---|---|---|---|---|---|---|---|
| A04-01 | MUST; S1:A04; S3:32 | Mac Chrome正常系统中文输入不丢字 | 所有者实际Mac Chrome155：候选停留约2秒→确认→连续两格、中文标点、换行、快切、粘贴→保存刷新，D1/D2正式rev2一致 | 所有者真实系统IME+GUI/API | E07 | R04：composition/imeActive/readEdit/restoreEdit同段，Univer核心/drawing仍1.0.4；新async保护独立A03-05 | PASS | 无；仅正常Chrome过程，未称Safari或新交错通过 | 已满足；不重复执行此局部；Codex仅核E2E集成及后续输入变化 |
| A04-02 | MUST; S1:A04; S1:A15 | 真实Safari完成同类系统IME与主工作簿路径 | 所有者实际Safari使用与A04-01同类输入，再保存/刷新/关键导航；选词/文本/状态正确；自动WebKit另记 | 真实Safari+系统IME+GUI/API | E07仅Chrome；无Safari实际记录 | 不能用脚本composition/粘贴/自动WebKit替代Safari系统输入 | NOT_VERIFIED | RUN；仅缺工具无法取得的系统输入由所有者完成 | Codex准备同一本和逐步核对；必要时所有者只补Safari实际系统组词 |
| A04-03 | MUST; S1:A04; S7 | 最终构建冷暖可见可编辑加载≤3秒 | M1同机Chrome1440×900，1000×27及30图约定样本，冷/暖各1；导航起到可见/可编辑≤3000ms，保存原始资源及终点 | 真实GUI Performance | E29无新性能；S7旧68仅口径 | 开发chunk128秒FAIL保留；旧结构化表性能不能当自由本新实测 | NOT_VERIFIED | RUN（当前实际3941；仅补对应未闭合路径）；责任Codex | Codex在届时精确不可变候选测冷暖各1，不扣除滚动等待或修改阈值 |
| A04-04 | MUST; S1:A04; S7 | 输入与保存达到固定阈值 | 选择/按键各50次p95≤100ms；正式保存50次点击至真实成功max≤2s；云稿从最后输入含800ms防抖至回执max≤2s，次数无旧规定则报原始实际n不造门槛 | 真实GUI事件/Network/正式读回 | S7；无R10原始数值 | 测试数量/小样本不能代性能；云稿采样次数未定不等于新产品阈值 | NOT_VERIFIED | RUN（当前实际3941；仅补对应未闭合路径）；责任Codex | Codex固定预先记录测量过程并分别报正式保存/云稿，不把两者混算 |
| A04-05 | MUST; S1:A04; S7 | 排序/筛选/粘贴、30图与10次切换按原测量合同记录 | 1000行排序/筛选各5、100×10粘贴5次本地可编辑max≤1s；30图实际解码与10次目的页ready后返回，记录意外写/长任务/内存原始值 | 真实GUI+图像解码+Performance | S7；无新候选实测 | 不增加零泄漏/全程零长任务或批量保存未规定的数值门槛 | NOT_VERIFIED | RUN（当前实际3941；仅补对应未闭合路径）；责任Codex | Codex复用同一性能夹具；图加载/切换与输入阈值分别记证据 |

#### A05

| ID | 范围/准确出处 | 验收断言/样本 | 入口、步骤与可观察通过条件 | 所需方式 | 最近真实结果/证据 | 候选适用性/复用依据 | 当前结论 | 未完原因/执行依赖 | 最短下一动作/责任 |
|---|---|---|---|---|---|---|---|---|---|
| A05-01 | MUST; S1:A05; S3:33 | 用户实际Excel可打开并另存已接受文件 | Mac Excel16.114打开4×2及双表合成件→看中文/两表/图→另存独立副本；无repair，原件不被覆盖，实际另存文件存在 | 原生Mac Excel+所有者动作/文件 | E08 | R05：固定文件/真实Office外部事实；手动SaveAs已完成，不追修自动按钮 | PASS | 无；原生步骤不包含R10回导 | 已满足；不重复执行此局部；Codex仅核E2E集成及后续输入变化 |
| A05-02 | MUST; S1:A05; S3:33 | 当前生产reader接受两份合法双表文件并保持约定解析结果 | 原SHA15be…与Excel副本e0c…分别readFreeWorkbook→真实ExcelJS；两次exit0，14解析格/16XML记录合并从属差异明确，值/类型/缓存公式/合并及图字节正确 | 真实生产parser（无服务） | E09 | R06：r04全部10源码模块与R10blob匹配、相同锁；37差异保留 | PASS | 无；明确PARSER层PASS，非GUI/重新计算 | 已满足；不重复执行此局部；Codex仅核E2E集成及后续输入变化 |
| A05-03 | MUST; S1:A05; S3:33 | 原双表文件浏览器导入保存重开 | O1基准15be…→GUI导入/编辑/保存/刷新→正式API；中文、值类型、表顺序/合并/样式/图与O1自身基准及明确编辑一致 | GUI+API+截图 | E40：O1正式新本e874a3d6…，rev2→3→4，B2改13/C2重算21再公式+1得22；原PNG内容200同hash | R11；14格集合不变，仅B2/C2明确编辑，另外12格与自身基准相等；截图24–26 | PASS | 无；本机O1导入保存重开属性成立，不代完整Office导出往返 | 已满足；受影响输入变化时复验，保留原件 |
| A05-04 | MUST; S1:A05; S3:33 | Excel另存副本浏览器回导保存重开 | O2基准e0c…→GUI回导/编辑/保存/刷新→API；各项对O2自身基准，不要求与O1所有格式相同 | GUI+API+截图 | E40/E42原首导/编辑与E93失败保留；E99正确db091…新op cb5c1dbe…→703898c1…v2正式保存/刷新 | 3941实际运行；14格语义/样式/合并、400行高/52列宽及图几何全等；四小数99.5×3/87.82421875精确保留，新PNG2240B/5bfb…，独审a276422b… | PASS | 无本项剩余缺口；旧8755…v2失败未覆盖，已知类型/空定义名规范化不冒称原JSON逐字相同 | 原生Excel/SUM/日期和首导按逐输入适用性复用；仅新受影响尾段实际补验，不扩为所有Excel特性 |
| A05-05 | MUST; S1:A05; S1:70; S3:33 | Office往返的真实公式重算及日期/前导零/空值语义 | 在工作副本改SUM(B2:B3)一项已知输入→结果随之变化→导出Excel看→回导读回；用原已授权日期样本核序列/类型/numFmt/显示及前导零/空值 | GUI+真实Office+API/独立格式对照 | E40/E42真实SUM与Excel回导；E68日期往返；E70四值Excel；E84新op真实回导/正式保存v2/刷新 | R27下新本7b259a10…v2：A2 STRING 00017、B4 NUMBER 0、D5/D6显式空串、E2缺失；5图位/4资产。R23→R27→a141相关输入未变；独审59964e6f… | PASS | 无本项缺口；旧de776…/0f91…保留事故原状态，不跨origin重放，不冒称已恢复 | SUM/日期/Excel原生证据按适用性复用；E93 O1尾段已闭合；E99 O2受影响回导已闭合，E2E-03按两基准连续证据PASS；不冒称同一版本重跑Office |
| A05-06 | MUST; S1:A05; S1:A06; S3:33 | 图片实际位置及转换告知不静默丢失 | 两基准各自截图测图相对单元格与实际绝对位置、尺寸/裁剪/背景；导入/导出保留或按原支持规则明确提示；SPANS_ROWS/pending不得猜业务归属 | 真实GUI/原生Office截图+对象hash/API | E40/E42原图及转换；E63 R22双基准截图测量/正式GET独审 | O1v4/O2v5全snapshot与各自旧基线深等；实测159.84×100.21CSS，画布相对(50.21,47.35)/(50.21,56.46)符合各自(50,48)/(50,56)，JPEG边界误差明确；真实R12导出/Excel/回导限定复用 | PASS | 无；不宣称自然宽高比、全部Office或日期通过；Excel自身37差异保留 | E89几何复核：两图均在保留220px的A列内，x4–164，受损B列在图外，位置/尺寸计算差0；限定PASS保留；E93/E99两尾段修复列宽，旧FAIL保留，不重做人工另存 |

#### A06

| ID | 范围/准确出处 | 验收断言/样本 | 入口、步骤与可观察通过条件 | 所需方式 | 最近真实结果/证据 | 候选适用性/复用依据 | 当前结论 | 未完原因/执行依赖 | 最短下一动作/责任 |
|---|---|---|---|---|---|---|---|---|---|
| A06-01 | MUST; S1:A06 | 文件选择/剪贴板/含图XLSX的图片输入与持久原件 | 自由本分别插入约定图片→读原件/保存重开；三入口图内容、所属工作簿、原件hash正确 | GUI+对象下载/API | E16/E56同本含图XLSX；E60 R21剪贴板；E62 R22文件选择/独立GET原件 | v7→v8仅新增K18一drawing；丢201后明确重试replayed=true复用同asset，2240B/5bfb…原件正确；保存/newtab重开/精确GET深等，旧图片提示已清除，原四图未变 | PASS | 无；一般409沿精确错误隔离目标检查复用，不冒称新GUI409；空reopen capture保留并以独立GET补证 | 已满足三入口及持久原件组合；结构归属/整浏览器重开分别按A06-02/A03-01 |
| A06-02 | MUST; S1:A06 | 图片锚定和稳定业务归属经结构变化仍正确 | 有图本按既定浮动/锚定语义排序/插行/切换/改名→保存重开；实际位置按预期，业务图片仍对应原stable ID，明确绑定入口不自动搬图 | GUI+原件/缩略图+API | E64 R22实际结构v8→v9独审；E13业务台次图/12直接源不变复用，E09原oneCell/pending与E60跨页拒绝 | 四drawing/asset/尺寸/表ID/顺序保持；插row8均row+1/top+24，D19=20→D3/D9=10→D4实际降序但图锚不变；改名/切表/保存/刷新GET深等。原业务台次图单独绑定，绝不将drawing ID当业务ID | PASS | 无；184不等大合并排序拒绝保留；不外推任意anchor/hidden-row/列插入或业务图经历自由结构 | 已满足双模式原断言；排序新空稀疏行/marker样式如实保留，原件按未变资产复用 |
| A06-03 | MUST; S1:A06 | 429缩略图/网络失败能明确重试且不丢编辑 | 隔离合成已有429/背景两次网络失败→用户点击重试→第三次恢复；文字/绘图保留，不增正式版本 | 真实Chrome故障/重试+API | E10 | R07：IO/cache/helper同字节、retryImages连续函数同ef3534；就绪重试分支不受新启动/导入影响 | PASS | 无；不扩大成所有网络故障或全几何通过 | 已满足；不重复执行此局部；Codex仅核E2E集成及后续输入变化 |

#### A07

| ID | 范围/准确出处 | 验收断言/样本 | 入口、步骤与可观察通过条件 | 所需方式 | 最近真实结果/证据 | 候选适用性/复用依据 | 当前结论 | 未完原因/执行依赖 | 最短下一动作/责任 |
|---|---|---|---|---|---|---|---|---|---|
| A07-01 | MUST; S1:A07; S1:74 | 人员显式映射/稳定ID更新及跨页重放 | 选择表/表头/区域→重复字段拒绝→预览实际值→明确应用2人；换行按原ID只改备注→丢回执关页同op/body核实→不增人/版本/登录资格 | 真实GUI+API/历史 | E11 | R08：映射核心、person适配/API未改；panel仅产量说明变化，person分支不受影响 | PASS | 无；源fullJSONHash专项比对不由该结果推全部原件 | 已满足；不重复执行此局部；Codex仅核E2E集成及后续输入变化 |
| A07-02 | MUST; S1:A07; S1:A09 | 两条明确颜色带理由应用并留身份/历史 | 缺理由/待核对行拒绝→两显式颜色入清单月更正2026-09→预览/apply→v2/history；另两色不变，板号00017/标准/来源保留 | GUI+API/历史 | E12 | R08：颜色saveSheet/更正实现未改；新产量字段读取不触达该输入 | PASS | 无；标准正式更正及全部关联另见A09 | 已满足；不重复执行此局部；Codex仅核E2E集成及后续输入变化 |
| A07-03 | MUST; S1:A07; S1:A06 | 检验映射明确台次/读数/未知和0及图片所有者 | 未关联review活动预览/apply 2台次/1组/2读数→API0.5/UI50%、45°a*=null/b*=0/ΔE=null→第一台次绑图看原件和缩略图，第二台次无图 | GUI+API+对象解码 | E13 | R08：batch/统计/exchange不变；新归档/评审分支不执行于该有效未归档未关联fixture | PASS | 无；不声称A12关联门禁或自由图自动转业务 | 已满足；不重复执行此局部；Codex仅核E2E集成及后续输入变化 |
| A07-04 | MUST; S1:A07; S1:A14 | 产量字段映射真实生成业务事实 | 已准备源W10/12/5明确车型/月份/颜色基地/stable IDs及唯一口径→预览源fullJSONHash对原文件hash→apply→正式事实ID/版本/来源/结果状态可读 | GUI+production API | E26/E36历史；E45：R15新完整来源ZIP/预览/正式请求/ID/刷新回执/统计 | R15 raw source SHA32490ce…与3事实source.fileHash一致；snapshotHash421792…另列；旧3eb9缺证保留 | PASS | 无；首次配额阻断无写，核对旧已确认日志后才实际PATCH；不补造旧capture | 已满足新首次完整来源；恢复页旧默认表单显示另随R17窄修复验 |
| A07-05 | MUST; S1:A07; S1:48,109 | 工作簿保存/业务应用各自状态，失败和应用日志可追溯 | 先存W，再制造无效映射/过期源或CAS冲突→明确应用失败且W保存内容仍在；切页回来可核对应操作/业务结果，无重复录入事实 | GUI+真实请求/正式读回 | E11；E43：R14已存v4→更新、v5过期拒绝、v6恢复及ZIP/跨页日志 | 原person链保留；R14补产量成功/失败/回执恢复，不反推旧首次source hash | PASS | 无；过期预览客户端拒绝且无写请求，不能写成HTTP409；工作簿与业务状态各自读回 | 已满足；R15新首次来源见E45，后续仅核受影响恢复显示 |

#### A08

| ID | 范围/准确出处 | 验收断言/样本 | 入口、步骤与可观察通过条件 | 所需方式 | 最近真实结果/证据 | 候选适用性/复用依据 | 当前结论 | 未完原因/执行依赖 | 最短下一动作/责任 |
|---|---|---|---|---|---|---|---|---|---|
| A08-01 | MUST; S1:A08 | 新建工作簿201丢响应后跨页仅一份 | 新建响应丢失→关原tab→新tab读取持久意图→用户同operationId/精确body核实；回同一本，无自动重复新建 | 真实GUI+意图+API | E14 | R09：create意图store/session/API幂等不变；后续恢复/导航不触达create协议 | PASS | 无；普通reload曾被取消的历史不充本证据 | 已满足；不重复执行此局部；Codex仅核E2E集成及后续输入变化 |
| A08-02 | MUST; S1:A08 | 历史恢复丢回执和确认后晚输入保护 | rev2恢复rev1成rev3，丢回执后关页明确同op/body核实仍rev3；rev1/rev3完整snapshot相等、rev2不同、旧史保留；确认框后新输入拒绝旧恢复、普通保存rev4 | 真实GUI+API+原只读事务内容证据 | E15; E17 | R09：4c0f515恢复确认/意图核心不变；排除未验IndexedDB等待中输入交错 | PASS | 无；不将JSON属性顺序当内容相等 | 已满足；不重复执行此局部；Codex仅核E2E集成及后续输入变化 |
| A08-03 | MUST; S1:A08; S1:A06 | 单图导入上传丢响应后跨页只一关联 | 单图201丢响应→新页持久原件/意图→明确继续→同asset/attachment、replayed=true、唯一drawingId=原imageOperationId；保存rev2两表/合并/缓存20 | GUI+资产API/正式读回 | E16 | R09+R06：意图/资产/转换同；相同15be原件已由r04新guard真实接受，复用单图幂等属性 | PASS | 无；Network未暴露重放multipart全文，不声称其逐字相等；不扩大成最终页面/绝对图位置 | 已满足；不重复执行此局部；Codex仅核E2E集成及后续输入变化 |
| A08-04 | MUST; S1:A08 | 双编辑器旧正式版本/云槽冲突显式拒绝 | 双标签A/B：B旧槽/旧正式rev1拒绝、B本机稿保留；B明确替换云v2后A旧清理不能删它，新上下文可恢复B稿 | 真实GUI+server draft/正式CAS API | E06 | R02：槽ID/revision/事务与正式CAS同字节；该冲突链独立于A03单上下文恢复 | PASS | 无；无须实时光标或新协作平台 | 已满足；不重复执行此局部；Codex仅核E2E集成及后续输入变化 |
| A08-05 | MUST; S1:A08 | 新合法操作不误去重，删映射区域不删除已发布事实 | 同一合法请求双击/丢响应/超时重试不多对象/附件，流程写同op重试不重复节点推进且节点事实/对应审计仅一次；另发新op再次导入新表/同图不同位置仍成功；删源映射行再apply不默删正式事实，结果明确 | GUI+真实PG/并发API | E56综合独审：E11/E14/E16原回执重试、E55重复拒绝、当前D05PG、R20新O1/同图异位/删源保留 | 历史协议逐输入复用；新op独立本/图片，删源后只更新A而B/C保持；阶段无operationId字段，按同body400与节点审计不变判定 | PASS | 限所列边界，不声称R20另测双击/超时全部排列或全部多图checkpoint | 保留失败/各版本身份，不自动提升E2E-02/04/05或产品签收 |
| A08-06 | MUST; S1:A15; S1:134 | 加载失败有真实可操作重试且不隐式业务写 | 合成runtime脚本被截断→显示错误→实点重试→脚本200/两表与图恢复；该故障窗口无API非GET | 真实Chrome故障/点击+Network | E18 | R09：f43e3e3后启动重试与R10同分支；保留首次128秒空白FAIL | PASS | 无；这不是性能3秒PASS | 已满足；不重复执行此局部；Codex仅核E2E集成及后续输入变化 |
| A08-90 | OPTIONAL; S3:35; S1:A08 | 多图逐张中途checkpoint算法作为独立强化场景 | 没有原始强制产品条款；可作为原图片/幂等风险的可选代表验证，不删原保存/异常恢复要求 | 可选技术验证 | E16仅一图；S9旧审计建议 | 来源未支持独立MUST；非范围冲突、非V1门槛 | NOT_APPLICABLE | 不安排为完成门禁 | 无必做动作；若所有者未来明确新增，记录版本/分母变更 |

#### A09

| ID | 范围/准确出处 | 验收断言/样本 | 入口、步骤与可观察通过条件 | 所需方式 | 最近真实结果/证据 | 候选适用性/复用依据 | 当前结论 | 未完原因/执行依赖 | 最短下一动作/责任 |
|---|---|---|---|---|---|---|---|---|---|
| A09-01 | MUST; S1:A09; S1:73 | 颜色/标准/基地来源准确且指定蓝色独立 | 记录区打开两蓝、新汉玉白相关基地→比较备注/角度/L*a*b*/版本/来源；色相关系不吞基地，尊贵蓝(SD)/新港尊贵蓝ID各自独立，缺测不变0 | GUI+source/业务API | E19; E12 | 旧导入来源/更正身份保留；当前完整关系场景未复核 | PARTIAL | RUN（当前实际3941；仅补对应未闭合路径）；责任Codex | Codex原4颜色只补关系/字段缺口，不重新导入或猜合并 |
| A09-02 | MUST; S1:A09 | 排序/改名/导入后颜色关联不串 | 在工作副本操作排序/改名/导入后打开相应项目、评审、图片→仍为原stable IDs/标准版本/基地，无按名/行位串挂 | GUI+多域API/图片 | E12原更正未改变关联 | 所需结构变化后关联全场景缺证 | NOT_VERIFIED | RUN（当前实际3941；仅补对应未闭合路径）；责任Codex | Codex用原记录只补结构变化关联读回；复用已接受原身份 |
| A09-03 | MUST; S1:A09 | 正式标准更正有理由/历史，普通粘贴不能绕过 | 颜色档案/标准更正入口提交理由→新版本+旧史/作者可查；普通表粘贴保护字段不能绕正式更正服务 | GUI+认证API负向/历史 | E12只入清单月更正；旧标准证据见S8第7页 | 颜色理由更正不自动证明正式标准全部路径 | PARTIAL | RUN（当前实际3941；仅补对应未闭合路径）；责任Codex | Codex定位现有标准更正真实证据，适用即复用，仅补缺少合法/绕过负向 |

#### A10

| ID | 范围/准确出处 | 验收断言/样本 | 入口、步骤与可观察通过条件 | 所需方式 | 最近真实结果/证据 | 候选适用性/复用依据 | 当前结论 | 未完原因/执行依赖 | 最短下一动作/责任 |
|---|---|---|---|---|---|---|---|---|---|
| A10-01 | MUST; S1:A10 | 项目建项至适用评审/费用/排产主路径不失事实 | /projects/new→原项目流程/任务；按有效规格走建项、样板、标准板及适用评审/费用/排产→任务/带taskId材料保存后返回原context，CLEAN文件身份/前置/结果可查，未完成支线仍在 | GUI+正式API/历史 | E20; E21；旧正常API至12、外观至15 | 不能从旧节点数或API推进推全GUI主路径 | PARTIAL | RUN（当前实际3941；仅补对应未闭合路径）；责任Codex | Codex沿原合成项目补未覆盖主动作；已接受A11外观整链不重演 |
| A10-02 | MUST; S1:A10 | 并行07/费用及合流标准取同轮真实已发放依据 | 原项目并行分支实操/查询→未完支线不消失、不强制串行；同轮06→07双依据且ISSUED，跨轮/歧义/旧版本拒绝，费用不伪称财务在线审批 | GUI+真实PG/API并发 | E20; D02支持入口 | 作者12PG/目标39/96不扩大为最终GUI/当前PG全部闭合 | PARTIAL | RUN（当前实际3941；仅补对应未闭合路径）；责任Codex | Codex补并行07/费用/合流实操；核当前共享提醒依赖变化后复用未受影响PG |
| A10-03 | MUST; S1:24; S1:A10 | 材料子路由登录后回原项目材料子路由 | 空材料合成项目（fixture.taskId=null、items=0）未登录进入/projects/:id/materials→原生登录→刷新及旧?tab=materials入口→回原项目materials子路由；保留匿名401/待准入403原范围，不包含taskId/PDF/upload | 真实GUI+URL/API | E34 | R12：已接受材料登录返回修复现包含于R10，auth-navigation相关源未变；只复用该精确子路径 | PASS | 无；带taskId/材料保存/CLEAN原件身份由未闭合A10-01及A15-03承接，其他深链/dirty仍待 | 已满足；不重复执行此局部；Codex仅核E2E集成及后续输入变化 |

#### A11

| ID | 范围/准确出处 | 验收断言/样本 | 入口、步骤与可观察通过条件 | 所需方式 | 最近真实结果/证据 | 候选适用性/复用依据 | 当前结论 | 未完原因/执行依赖 | 最短下一动作/责任 |
|---|---|---|---|---|---|---|---|---|---|
| A11-01 | MUST; S1:A11; S3:29 | 驾驶室不通过仅走涂装厂返工 | 原项目驾驶室失败→涂装厂返工/试制新轮→所需复核；有效标准/颜色/费用/旧史保留，不全部重开 | 真实GUI+API/历史；相关PG | E79：R27同项目驾驶室驳回→试制新轮→复审通过，API/截图02–14、28–30；独审f7197a56…/cd28e6cb…/d6f848cf… | 原标准v4/颜色/旧评审与试制保留；05/09原任务及采购首到货锚点未重开；费用初始空、后续合成正常办理分列 | PASS | 本机限定；原附件为空不冒称非空附件保留，相关PG保护按E58输入适用性复用 | 已满足驾驶室实际分支；旧R28未部署限制保留历史，E95已在17aa补两类提示/历史与返回界面复验 |
| A11-02 | MUST; S1:A11 | 整车不通过的厂家整改闭环保留有效事实 | 原cbe项目14整改→新复审→CLEAN原件/提交/通过→15排产刷新；旧驳回/驾驶室PASS/标准/首排/试产史仍在 | 真实GUI+正式API/历史 | E21 | R10：cbe业务核心未变，复用已接受整车动作及历史；共享team-assignment变化的资格检查另见A13/A15，不冒称整个授权依赖未变 | PASS | 无；完整CDP未留存边界保留 | 已满足；不重复执行此局部；Codex仅核E2E集成及后续输入变化 |
| A11-03 | MUST; S1:A11; S1:69; S3:29 | 导览与两类整改新文案对应实际入口 | /guide及驾驶室/整车两提示页面真实打开/点击→涂装厂返工与外饰件整改区分清楚，返回原项目，不重新引入12期义务/多角色审批 | 真实GUI+路由/截图 | E82既有guide/FAQ与路径；E95实际17aa两提示/历史四页/来源返回、独审96ae4164… | guide/FAQ及导航相关输入R27→17aa相同；新驾驶室涂装厂返工/一致性外饰件整改提示均实看，旧历史保留 | PASS | 无本项缺口；限本机17aa/45464，不代A10材料返回、整改业务或全项目完成 | 已满足；保留05/09/18未完支线，不重演已接受整改链 |

#### A12

| ID | 范围/准确出处 | 验收断言/样本 | 入口、步骤与可观察通过条件 | 所需方式 | 最近真实结果/证据 | 候选适用性/复用依据 | 当前结论 | 未完原因/执行依赖 | 最短下一动作/责任 |
|---|---|---|---|---|---|---|---|---|---|
| A12-01 | MUST; S1:A12; S3:29 | 两成员创建维护同一场多色多车实际周评并查询统计 | M1/M2在/inspections活动填多色/车结论、数据和图片→保存刷新→颜色/项目查询汇总→修改明细后统计正确，未抽检色无虚构逾期 | 真实GUI+API/统计+PG适用性 | E53：M2创建cmvm5a7…、M1同ID备注/蓝色结论/照片；截图123–127、246网络事件与限定PG独审 | R19真实双成员活动；白v2保留、蓝FAILv2→PASSv3，整场2车2台次/100%；蓝色与白色项目查询均2活动2台次1去重车；未抽检色110零统计适用 | PASS | 无；筛选不建立正式评审关联；全链E2E-06另记 | 已满足此局部；Codex不重复已验操作，不把筛选项目当正式关联 |
| A12-02 | MUST; S1:A12; S8:2026-10-20增量 | 同期间第二条继续、完成门禁/已签月份保护 | 原期间已有记录再续评第二条→实际记录分别确认；缺所需确认完成受阻、已签月份移动拒绝、历史首签/旧月评保留 | GUI+真实PG/事务/API | E50 D07实际16项；E53 R19同TASK同日二人独立提交确认、草稿阻阶段、明确完成201/刷新、首签深相等；14相关输入复用独审 | R19 TASK GUI与0c20 D07 legacy signed-month/旧期次保护分别覆盖；14核心源/锁/schema至f323逐字同，不冒称TASK有月份义务 | PASS | 无；完成门禁负向为真实preview阻止，重复stage-confirm后端400单列E55 | 已满足此局部；按2026-10-24 PM勘误，不要求与A12-01同活动ID；同准确颜色/基地项目的正式路径另补E2E-06，首签/旧12期保留 |
| A12-03 | MUST; S1:A12; S1:74 | 人员停用/归档/恢复后历史作者与新名单正确 | /admin/people对原无账号联系人停用→归档→按规则恢复；旧周评/检验作者ID/姓名仍可查，新录入名单按有效性变化，不重复建人或自动启用登录 | GUI+业务查询+真实PG | E32；E44：原联系人rev2→3→4→5→6、旧活动与两次新名单查询 | R14原无账号联系人完整GUI生命周期；旧participant ID/name与activity.createdById保留 | PASS | 无；恢复后仍inactive，另行启用才重返新名单；userId/account一直null | 已满足此局部；不把联系人冒称登录创建者，不新增账号或改原周评事实 |

#### A13

| ID | 范围/准确出处 | 验收断言/样本 | 入口、步骤与可观察通过条件 | 所需方式 | 最近真实结果/证据 | 候选适用性/复用依据 | 当前结论 | 未完原因/执行依赖 | 最短下一动作/责任 |
|---|---|---|---|---|---|---|---|---|---|
| A13-01 | MUST; S1:A13; S4 | 同轮首个有效实际到货+6日历月，后续不重置 | 实际采购登记2026-08-31首批及09-15后批→due固定2027-02-28T15:59:59.999Z（上海3月1日前），首次锚点/来源轮次可追溯，后批采购完成不改锚 | 真实GUI+API持久读回 | E23 | R11：e087→R10到货/期限API及workspaces同字节；提醒依赖变化单列 | PASS | 无；不冒称试验任务已点完成 | 已满足；不重复执行此局部；Codex仅核E2E集成及后续输入变化 |
| A13-02 | MUST; S1:A13; S4 | 无有效到货/轮次不猜锚点，跨月跨年/并发首批按正确日历规则 | DRAFT/ORDERED无日期→不产生锚；MARK_ARRIVED有效日期必需；缺轮次待关联，不能用今天/创建时间补；受控测试时钟跨月年/月末/并发写回保持首批不覆盖旧轮审计 | 真实隔离PG+API | E23合法到货；E50：当前D10真实PG13项及独立532输入/迁移/日志绑定 | 0c20 API tree同fa19122；无日期/缺本轮创建链拒绝，日历夹断/闰年/并发首锚/后批不重置/旧轮史保留均实际通过；服务调用不冒称GUI或实际定时器 | PASS | 无；限原真实PG/API断言，不改系统或生产时钟 | 已满足本原子；后续仅相关输入变化时复验，真实提醒配置/GUI另由E46/E51记录 |
| A13-03 | MUST; S1:A13 | 性能报告缺附件拒绝、上传提交后只读/历史可读 | /projects/:id/performance-tests：缺必需附件拒绝→CLEAN PDF上传→提交→只读/刷新，报告/附件/期限和旧史保持 | 真实GUI+API/文件 | E24 | R11：performance-tests API/workspace与e087同字节；提醒接收资格另验 | PASS | E24当时未点完成；本次完成另见E47/A13-04，不混为原报告验收 | 已满足；不重复执行此局部；Codex仅核E2E集成及后续输入变化 |
| A13-04 | MUST; S1:A13; S1:46 | 试验任务按现行完成条件实际结束并返回 | 用已提交合成报告在原任务点击完成→满足门禁才完成、期限/报告/审计保留→回原流程刷新；缺所需事实拒绝 | 真实GUI+正式API/历史 | E24旧报告；E47原R15 M2完成/返回及只读保存核对；E50缺事实PG拒绝；E51 R18历史上下文/错误/返回GUI独审 | 原完成06:48:26.935Z和M2审计保持；R18正确显示同task已完成/首到货/截止与原报告单附件只读，空origin400后可返回原流程；D10无报告/缺附件两例拒绝且任务/审计不变 | PASS | 无；原90历史显示FAIL保留；不是R18再次完成或再次上传 | 已满足本原子；不重做原任务完成或报告上传，后续按相关输入复验 |
| A13-05 | MUST; S1:A13; S3:41 | 提醒生成/限定入队或单次扫描、两成员可见及去重分别成立 | 先核整个合成扫描范围/接收人→现有受控admin/system.manage身份POST /api/internal/notifications/process-due-reminder-scan（仅合成IN_APP）→M1/M2从提醒UI与GET /api/notifications/my可见→重复扫描不重复/不重置已读，未准入/停用人不得收 | 真实PG/API+两成员GUI+队列证据 | E25历史；E46：R15限定scope、单次POST/M1M2 GUI/完整行摘要及7项专用PG | 自动先触发，manual重放后6通知/2摘要完整行不变；已读/范围外保持；资格负向另绑定专用PG | PASS | 无；enqueued=4为接收尝试，不称新增4条；仅合成IN_APP，未开启全队列 | 已满足限定范围；提醒登录返回修复随R17复验，不扩为邮件或全局调度 |
| A13-06 | MUST; S1:A13; S3:41 | 约定交付配置下提醒自动触发可证 | 合成受控到期fixture由NotificationQueueService.onModuleInit的实际setInterval触发processDueReminderScan→TaskRemindersService.scan→限定提醒可见/去重；不是手动POST，不调整生产时钟 | 真实调度/队列+GUI/API | E46：R15自然60秒timer事件→正式原PG→两成员提醒GUI | 06:45:22Z scheduled run2e0ff3b8…先于manual；真实onModuleInit限定timer，首轮6通知/2摘要，后续不重置 | PASS | 无；全队列false、独立限定开关true、1项目2任务2人；未来任务只有ACTIVATE无到期/逾期 | 已满足本机约定限定配置；后续交付配置须保持范围/资格与身份一致 |

#### A14

| ID | 范围/准确出处 | 验收断言/样本 | 入口、步骤与可观察通过条件 | 所需方式 | 最近真实结果/证据 | 候选适用性/复用依据 | 当前结论 | 未完原因/执行依赖 | 最短下一动作/责任 |
|---|---|---|---|---|---|---|---|---|---|
| A14-01 | MUST; S1:A14 | 颜色/基地/车型/月事实修改后明细汇总导出一致 | A07生成的3事实10+12+5=27→第一条按stable ID10→8总25→9总26；每步保存、刷新、明细/汇总/导出对账，不重复累加 | 真实GUI+API/导出+PG | E36：R11实际27→25→26每步保存/刷新/明细/统计及三份numeric XLSX；D13/E37 | R11同A stable ID的revision7→8→9；B/C及保留TOTAL100不变；原文本导出FAIL保留 | PASS | 无；本机GUI/API/导出与PG断言成立，非完整E2E-04 | 已满足；仅输入改变时复验；年度及映射来源字节缺口分别保留 |
| A14-02 | MUST; S1:A14; S1:78 | 未知≠0、混合来源只取唯一统计依据 | 同颜色基地月含null/0、月总量/车型/原始来源；明确选唯一basis→汇总不与旧项目批次/来源相加；旧basis revision/hash或并发更新拒绝 | GUI+真实PG/同SQL快照+API | E36：null/0/9、混合未选/车型26/月总量100/未分配null真实GUI；E37真实CAS/锁/同SQL快照 | R10重构→R11仅导出类型变化；此UI/API同字节，D13/D14当前R11真实PG通过 | PASS | 无；PG负向不冒称在GUI点击过409，原始4事实/计入3分开记录 | 已满足；年度集成由A14-03/04继续，不自动关闭年度或全链 |
| A14-03 | MUST; S1:A14; S3:30; S8:第13页 | 首次年度13月窗口与20保留/19待原退出评审 | 入清单至次年同月首尾13月、次月复核；20/21保留、19仅待原退出评审，不自动删除/退出/推进；缺月/未知不裁决 | 真实PG日期边界+GUI/API合法与关键负向 | E41：合法到期合成色2024-09..2025-09，13真实月份20→19，两次GUI保存；E37/D13/D15补21/缺月/未知/未来边界 | R11，颜色始终LISTED；截图38逐月19、39双历史/无项目不可直接退出；不改系统时钟 | PASS | 无；年度属性成立，关联项目退出点击未执行且不冒称整链通过 | 已满足；仅输入变化时复验；原退出完整路径仍按对应E2E验收 |
| A14-04 | MUST; S1:A14; S8:第13页年度证据约束 | 年度证据不可变且不能手填19绕过真实20 | 保存operationId/revision/snapshotHash→重放只一证据→刷新历史；新事实使旧snapshot/CAS冲突；原退出表单不得将已保存20伪写19绕过，不覆盖未保存表单 | 真实PG/API+GUI | E41：旧20快照真实GUI409且说明保留；重新读取19保存；旧20历史深相等、原operation重放同ID/时间且历史仍2条；E37/D15原退出伪造负向 | R11，颜色rev2→3→4；原首月fact ID不变、rev1→2；其余12月未变；独立核对 | PASS | 无；不可变事实与幂等/CAS属性成立，不代关联项目退出UI全链 | 已满足；不新增自动退出，不覆盖旧历史 |

#### A15

| ID | 范围/准确出处 | 验收断言/样本 | 入口、步骤与可观察通过条件 | 所需方式 | 最近真实结果/证据 | 候选适用性/复用依据 | 当前结论 | 未完原因/执行依赖 | 最短下一动作/责任 |
|---|---|---|---|---|---|---|---|---|---|
| A15-01 | MUST; S1:A15; S5:§6; S3:34 | 四个真实CSS宽度可用，参考/实装逐页对应 | 1440/1280/1024/390分别核原14页及受影响guide：默认/编辑/长文本/加载/空/错误，按钮可见可点、无整页溢出；工作簿只自身横滚，手机仅已承诺浏览/节点/附件 | 真实GUI+computed尺寸/截图+Network/console | E33旧对照/390历史，不是R10图 | 1440/1280/390原R02，1024根规则；物理窗口像素不能充CSS | PARTIAL | RUN（当前实际3941；仅补对应未闭合路径）；责任Codex | Codex补受影响/缺页四宽度；复用未改页面旧图须逐页说明，不重做全部PPT或给手机全表格编辑新门槛 |
| A15-02 | MUST; S1:A15 | 已保存工作簿→业务记录→回原本 | 干净已保存本rev2→?view=records→返回同workbook ID/rev；值与context正确 | 真实GUI+URL/正式读回 | E27 | R12：25621b5→R10 workspace/admin/record-navigation相关路径无差异 | PASS | 无；不包含dirty离开/全部路由或新guide | 已满足；不重复执行此局部；Codex仅核E2E集成及后续输入变化 |
| A15-03 | MUST; S1:A15; S1:68-69 | 六主入口、14页动作/返回和未保存离开可用 | /dashboard、/projects、颜色、/inspections、/production、/admin/people及必要账号/资料；按原矩阵逐页点保存/取消/后退/深链，保留来源context；dirty取消不丢、确认离开按草稿合同恢复 | 真实GUI+路由/持久读回 | E27/E34精确返回已接受；E33历史14页；E69 R23年度正常返回到原colorId/C3/侧栏且历史深等 | 已保存返回缺陷修复成立；未保存确认框曾出现但实际选择UNKNOWN，不算PASS也不据此判产品失败；其他原动作仍待 | PARTIAL | RUN于新恢复实例；E77 R25实际原生登录正确返回pilot-production；75目标/types/lint/独审成立，其他深链/dirty动作仍待，责任Codex | 不覆盖confirm、不因工具限制改确认组件、不重开E2E-04或新增所有业务表单草稿 |
| A15-04 | MUST; S1:A15 | 干净不可变源的API/Web制品四字段及清单可对照 | 读取当前候选API/Web manifests、receipt及独审库存→sourceCommit/tree/release/buildTime一致且source/archive/log/依赖库存匹配，54迁移/锁未变 | 实际构建/制品完整性证据 | E90不可变17aa编译；E91应用完整选择集15741项/460214339B复制与manifest/copy读回、独审ce933156… | 17aa/tree738a/build08:28:17Z；3host/8子阶段exit0，旧依赖复用有前后清单；application-manifest83c76b92…与copy86aba501…绑定 | PASS | 仅当前17aa应用制品，不代完整离线安装包或新3941源码运行 | 已运行17aa身份成立；3941为已提交待构建源码，不能混称最终候选对齐 |
| A15-05 | MUST; S1:A15 | 实际Web/API运行身份、数据源和安全配置对应候选 | 获准新恢复目标HTTPS45464的直连/TLS API和Web四字段对应已运行候选，记录新PG/Redis/对象及安全配置，正常原生成员登录 | 实际运行API+Web+配置身份/GUI | E76/E77原恢复；E91实际17aa四身份/owned PID及前后quota；E92/E93原生成员实际工作簿保存刷新 | API2976/Web2977/proxy2988，run first-17aa74a-r01；PG2277同systemID7700459308674415750/Redis2309/scanner保持，同boot2552886b…；前后90日quota39/三零 | PASS | 限本机https://localhost:45464；原R27正常停，原Docker/事故库不动；不代远端CI或正式域名 | 当前预览17aa可操作，新3941源码尚未构建；正式域名另验 |
| A15-06 | MUST; S1:A15; S1:60; S5:§6-8 | 必需G3与真实PG/Redis属性有适用证据，无关键依赖skip | 按下方D01–D18属性入口绑定原版本/输入复用或专用隔离目标实际执行；事务/CAS/审计/提醒/统计/Redis真实语义满足，mock不替代；必要lint/types/构建按变化复用 | 真实PG/Redis+适用G3 | E67精确R23 G3及独审；E58逐D01–D18适用性独审；E37/E50/E52、f323九PG/Redis、16f两测试复验及旧工作簿PG | R23 Web1101PASS/0skip、API1817PASS/305skip；原73PASS/5FAIL和两测试10PASS分列；D12含1纯例、D16/17历史21PG+另25规则/body；新旧skip均不算PG PASS | PASS | R23 G3已执行；未变真实PG/Redis按精确输入适用性复用，CI/安全/恢复另验 | 不机械重跑未变历史；后继代码须受影响验证及新制品身份，不外推A15其他项 |
| A15-07 | MUST; S1:A15; S1:102-103 | 候选必需CI、Linux镜像与实际安全门禁通过 | 同最终候选verify及security-source全部required命令/产物有效，Web/API Linux镜像digest及扫描绑定；按workflow记录结果，未执行/skip不能充绿 | CI+Linux镜像/扫描证据 | E35旧main failure；E52旧0c20及E67精确R23本机双Linux镜像/Trivy未检出；候选required CI仍缺 | R23两精确镜像及10/25漏洞库全severity未检出有独审；required-check配置/完整候选CI仍缺；不冒称远端CI通过或全安全关闭 | NOT_VERIFIED | 外部：有效Git/CI授权及候选可发布条件；原外盘Docker不在本轮使用，Lima预览不能代候选CI | 保留NOT_VERIFIED所指必需CI缺口；按有效授权核required命令/配置及最终候选，手动mock smoke不作原生/Safari替代 |
| A15-08 | MUST; S1:102-103; S5:§7-9; S11 | XLSX指定finding及适用安全风险按既有门禁验证 | R28-V1-XLSX-NAMESPACE-BOUND-001维持target/affected/diff已验；完整关闭需既有full gate、最终runtime/Office适用验证及合法生命周期结论，记录commit/tree/锁/工具/环境/hash | 既有G1/G2/G4_DIFF+待授权适用full/发布 | E30；唯一FINDINGS fixed_diff_verified/full pending/closure=null | R14只复用精确01b4 target/affected/diff；无全仓安全clearance | PARTIAL | NOW准确引用；full/运行按现有范围授权与RUN | Codex按唯一Ledger推进，不因整理改严重度/closed；旧24项schema错误不虚构新修复义务，不用其数量猜当前漏洞 |
| A15-09 | MUST; S1:A15; S1:115; S5:§1; S12 | 本版离线包可迁移并在独立目标主机/VM原生运行 | 最终提交对应程序/镜像/配置模板/恢复说明/摘要齐全→受批准独立目标主机/VM安装→无第三方身份凭据/mock注册/密码登录、业务/退出/应用重启可用；源资源不覆盖 | 离线安装+独立环境GUI/API/重启 | E80既有prefix安装；E82新账号；E102新空目标初始化 | R27包内CLI在固定新低权DB实际54迁移/目录/一次性管理员成功，重复CLI exit1后账户/marker/audit计数不变；11直接组件R27→3941逐字同，独审b433ccc6…。当前3941预览未停，恢复库未连接 | PARTIAL | PARTIAL仍因20deb实际安装、新prefix scanner first-start及R30联合交付集合实走未完；新管理员HTTP登录未验证 | 不重跑已闭空目标初始化；继续20deb新prefix安装与扫描器首次启动、R27基包加3941必需增量的真实完整安装 |
| A15-10 | MUST; S1:A15; S1:179; S5:§1 | DB+工作簿+对象一起恢复后实际使用且源不覆盖 | 同次备份清单/版本→空隔离目标恢复→从恢复数据启动→原密码重新登录→开本/项目/图片→新合成业务写入读回→应用重启再读；会话/作者/历史边界符合原合同 | 真实备份/DB+对象恢复+GUI/API/重启 | E77：授权事故后dump/36对象→独立Lima实际restore→M1原密码→W v9/项目/图→全新计划batch002→正常应用重启同ID/字段；独审f271f719… | 72表/2459行/54迁移在应用前UTC相等；36对象/引用/原作者保持；恢复后正常业务新增不要求行数冻结。原缺失计划未找回，原API停写 | PASS | 限获准事故后逻辑状态与正常应用重启；不代物理事故镜像/故障重启、完整离线包或生产 | 已满足该限定恢复断言；A15-09与E2E-08仍按各自缺口继续 |
| A15-11 | MUST; S1:A15; S1:188; S5:§1,12 | 约定正式HTTPS目标版本真实部署并可用 | 有效授权/实际安全条件后在https://timeline.all-too-well.com核Web/API/镜像/upstream/时间/数据库，再代表原生账号业务及附件动作；记录截图/请求/console | 精确目标环境GUI/API+版本/发布证据 | E35当前生产UNKNOWN，旧e917只历史 | 本机成功不能证明正式网站；扫描VM暂停/新附件不可用仍有效，不能旁路 | BLOCKED | 外部：候选门禁/发布准入及扫描资源限制的明确处理；当前不访问生产/启VM | Codex先备齐候选/回退；新附件限制如与原MUST冲突报具体依赖，未经许可不重启扫描机、不宣称生产已完成 |
| A15-12 | MUST; S1:185-189; S5:§12 | 李晓晨对最终具体版本实际使用后明确签收 | 其余73项技术/交付MUST（不含A15-12）、9条技术关键链及必需门禁和约定环境先就绪；可操作预览/参考实装/完整路径/失败与限制齐备→李晓晨在指定环境实际UAT并明确接收，此后A15-12才计PASS，记录版本日期范围；发现原范围缺陷按影响修复/复验 | 所有者实际UAT/明确确认 | 无最终PRODUCT_OWNER_ACCEPTED | ChatGPT审技术报告/本次基线完成不代签 | NOT_VERIFIED | HUMAN：前置为其余73项技术/交付MUST（不含A15-12）、9条技术关键链、必需门禁和约定环境就绪；再由所有者实际UAT并明确接收 | Codex先完成可审阅交付；只在具体UAT阶段请李晓晨操作，不请求形式性继续开发批准 |
| A15-90 | OPTIONAL; S3:35; S5:§1; S12 | 必须物理第二台硬件而不是独立目标VM | 原要求是异机恢复能力，现有载体含独立VM；未找到物理第二台必需原文，不把旧未验证反推新MUST | 可选载体强化 | S12既有独立VM；E32非物理机 | A15-09/10的离线/独立恢复MUST保持，不豁免 | NOT_APPLICABLE | 无独立强制来源；非V1门槛 | 无必做动作；不宣称已验证物理异机 |
| A15-91 | OPTIONAL; S3:35; S1:A03; S5:§1 | 宿主OS整机重启作为独立门槛 | 原合同标签页/浏览器关闭恢复及一般应用/服务重启仍必需；未明确宿主OS重启，不由模型建议扩项 | 可选载体强化 | S12旧VM冷启历史 | A03-01和A15-09/10的一般重启/恢复MUST不减少 | NOT_APPLICABLE | 无独立强制来源；非V1门槛 | 无必做动作；需新增范围时记录决定及版本 |

### 由唯一原子表派生的计数

主分母N=74，有效PASS P=57，覆盖率57/74=77.03%（证据覆盖率，非代码完成率）；OPTIONAL 3项不计分母。PASS=57、PARTIAL=9、NOT_VERIFIED=7、BLOCKED=1、FAIL=0、SKIPPED=0、SCOPE_UNRESOLVED=0、NOT_APPLICABLE=0，总和74。E100闭合A03-01及P0-03；E101补实际双入口与身份/命令负向闭合A02-01。10/15整包、5/9技术链、6/10 P0；A03-05/E2E-02未升级，旧计数及失败保留原日期。

| A包 | MUST N_i | 有效PASS P_i | PARTIAL | NOT_VERIFIED | BLOCKED | 其他未通过 | 整包状态 |
|---|---:|---:|---:|---:|---:|---:|---|
| A01 | 4 | 4 | 0 | 0 | 0 | 0 | PASS |
| A02 | 6 | 6 | 0 | 0 | 0 | 0 | PASS |
| A03 | 5 | 4 | 1 | 0 | 0 | 0 | PARTIAL |
| A04 | 5 | 1 | 0 | 4 | 0 | 0 | PARTIAL |
| A05 | 6 | 6 | 0 | 0 | 0 | 0 | PASS |
| A06 | 3 | 3 | 0 | 0 | 0 | 0 | PASS |
| A07 | 5 | 5 | 0 | 0 | 0 | 0 | PASS |
| A08 | 6 | 6 | 0 | 0 | 0 | 0 | PASS |
| A09 | 3 | 0 | 2 | 1 | 0 | 0 | PARTIAL |
| A10 | 3 | 1 | 2 | 0 | 0 | 0 | PARTIAL |
| A11 | 3 | 3 | 0 | 0 | 0 | 0 | PASS |
| A12 | 3 | 3 | 0 | 0 | 0 | 0 | PASS |
| A13 | 6 | 6 | 0 | 0 | 0 | 0 | PASS |
| A14 | 4 | 4 | 0 | 0 | 0 | 0 | PASS |
| A15 | 12 | 5 | 4 | 2 | 1 | 0 | PARTIAL |

整包仅全部MUST PASS才PASS；当前10/15整包PASS不表示工程完成率。本基线v1.0已由PM核对冻结，当前分母保持不变，PASS计数随逐项真实证据更新，不以改变分母提高通过率；后续任何新增/删MUST/阈值变动需显式范围决定和版本记录。

### 既有证据与受测身份索引

E01–E35保留历史记录的原日期/身份；E36起是本轮新增实际验收。证据不足或完整绑定缺口在条目标明，文件hash本身不替代测试或产品动作。

| 引用 | 现成证据位置及SHA256 | 原受测身份 | 原时间 | 环境/范围限制 |
|---|---|---|---|---|
| E01 | [a01-api-result.json](../../var/truck-color-v1-20261020/a01-api-result.json) SHA256 `87928758295492b500b99ee69a1062739cbe2fb763611cc08f40ff09b0b76026` | V-E087 | 2026-10-20T07:08:59.478Z | 3490隔离原生HTTP/合成M1,M2,U,D；API边界，不含GUI |
| E02 | [filter-api-readback.json](../../var/truck-color-v1-20261020/filter-api-readback.json) SHA256 `ee8f3c19b861b3bd9857b737a99efa85fc18cf871752b7c5d3e13e009ccceed8`<br>[filter-xlsx-artifact-result.json](../../var/truck-color-v1-20261020/filter-xlsx-artifact-result.json) SHA256 `0084c8cf691559d16a3783ad21323524e27bcd2017533db50e9badfdc5f7d91b` | V-E087 API / c8a33 Web同步开发快照 | 2026-10-20 | 3490 Chrome/实际下载；小型筛排及明确转换 |
| E03 | [local-draft-checkpoint.json](../../var/truck-color-v1-20261020/local-draft-checkpoint.json) SHA256 `02abbdb3e6664a88988377343547698d07f29bdb6cdfb8318b0accb80345bcb3` | 8c630 API / f8bc438本机草稿前端；开发快照 | 2026-10-20 | 3490 Chrome/IndexedDB；未按Enter文本/容量/账号隔离；不是整浏览器 |
| E04 | [unknown-ack-result.json](../../var/truck-color-v1-20261020/unknown-ack-result.json) SHA256 `1f483e76b2d530467f7e9e071b09644f2c6acacbdbf843e8637191ad4234e0d3`<br>[inflight-ack-result.json](../../var/truck-color-v1-20261020/inflight-ack-result.json) SHA256 `8aad4184769cd2751dc0f2236ade7d9f226e0e5c17179a5b0b99f9e5bef28cfb` | 8c630 API / ec20前端开发快照 | 2026-10-20 | 3490 Chrome/真实故障回执；N+1保留 |
| E05 | [server-draft-browser-result.json](../../var/truck-color-v1-20261020/server-draft-browser-result.json) SHA256 `4aebb1c12a5033df4099f53b8e95f35fe913e0e1bae6ca7b489d766e205890a0`<br>[cloud-unknown-ack-result.json](../../var/truck-color-v1-20261020/cloud-unknown-ack-result.json) SHA256 `2e3f4b1735005e2b23792c50d33443ea8eb6e4825b70407d11746347a358ec34` | 8c630 API / ec20+A06前端开发快照 | 2026-10-20 | 新browser context/私有云稿；不等于OS重启 |
| E06 | [cloud-two-editors-result.json](../../var/truck-color-v1-20261020/cloud-two-editors-result.json) SHA256 `ad4e3c23925a1d9065d701513831ea471a2ba2839f63c1cbc488348376e161b8` | 8c630 API / ec20+A06前端开发快照 | 2026-10-20T06:24:24.566Z | 3490 Chrome两标签；云槽/正式CAS |
| E07 | [ime-owner-result.json](../../var/truck-color-v1-20261020/ime-owner-result.json) SHA256 `84be742b7f329736a2e1d147e5d04f9de05cc3e7d8bee2f0571c60eddf2bd935` | ec20监听+A06开发快照 | 2026-10-20T06:13:43.482Z | 实际Mac Chrome155/所有者系统IME；OWNER_REPORTED+API；非Safari |
| E08 | [office-r02-native-save-checkpoint.json](../../var/truck-color-v1-20261020/office-r02-native-save-checkpoint.json) SHA256 `907bf8337b9350b0e603be017139a427a6d28ca770440d7a1cc7bf18a277b74d`<br>[filter-excel-roundtrip-readback.json](../../var/truck-color-v1-20261020/filter-excel-roundtrip-readback.json) SHA256 `0830cd300287fa87a98d04055e5eb9e360a450a70e156deb524556703610fdb6` | 原生Excel16.114；小型旧app V-CBE | 2026-10-22T07:23:38.025687+00:00；小型2026-10-21T00:55:42.611Z | 本机Excel/所有者手动SaveAs；原生打开/另存与小型旧app全链分层 |
| E09 | [comparison.json](../../var/truck-color-v1-20261020/nested-core-paths-20261022/actual-parser-r04/comparison.json) SHA256 `a896b3b34ad4865d493f9242783f4bd37d50599a52c3e9326494f1e240a77629`<br>[prerequisites.json](../../var/truck-color-v1-20261020/nested-core-paths-20261022/actual-parser-r04/prerequisites.json) SHA256 `5044ad62b1a2c2692cdaa44d43c99e4b84b17ecfebba96a3e9de668551ccc812` | V-R10精确10源码模块匹配 | 2026-10-22T07:47:54.618963+00:00 | Node24生产parser真实ExcelJS，无服务；14解析/16XML记录，37差异；缓存不是重算 |
| E10 | [image-retry-browser-result.json](../../var/truck-color-v1-20261020/image-retry-browser-result.json) SHA256 `3781375d8f3e51c373f1af39495508274c8e8baa6945e8674d17ce88b73df75b`<br>[image-background-repeated-result.json](../../var/truck-color-v1-20261020/image-background-repeated-result.json) SHA256 `79bef779f19f4174e9964b0ede9e8e32f63edf9426b85397bede5adeda826fbf` | ef3534f3cd1b34fa4cd49242b5c63ca985ab33c8开发快照 | 2026-10-20 | 3490 Chrome故障/点击重试；429、背景连失败恢复 |
| E11 | [mapping-person-network.json](../../var/truck-color-v1-20261020/mapping-person-network.json) SHA256 `c1dde330738859f841b61cb8e41a09dbb7b51f3ee2a06b1ce0cd78e4d263fcf8`<br>[mapping-person-readback.json](../../var/truck-color-v1-20261020/mapping-person-readback.json) SHA256 `6cc1bd47e606d39b2ae9c7d583729872e3cd07f8a7694e8b1b132653b043c096`<br>[mapping-person-update-new-page.json](../../var/truck-color-v1-20261020/mapping-person-update-new-page.json) SHA256 `899b4462f1c9d9a5226e02744181a878d888fd1666f1a618b30523cfc928bffd`<br>[mapping-person-update-readback.json](../../var/truck-color-v1-20261020/mapping-person-update-readback.json) SHA256 `14451978d2657ca9f3d34843925e01cec308c24589edc3ccfb78bf4e05b5a5b5` | V-E087 API / 37b3c1a预览及后续Web开发快照 | 2026-10-20 | 3490原2人员GUI/正式HTTP；person明确映射、稳定ID和同请求跨页恢复 |
| E12 | [a07-color-readback.json](../../var/truck-color-v1-20261020/a07-color-readback.json) SHA256 `ea82e65b428693eae9f6650c22b82d5c9cab05b9834f379f7bc8ad08f5df3a4b` | V-E087 API / Web开发快照 | 2026-10-20T08:42:57.595Z | 3490合成颜色GUI/API；精确两条listing-month更正，不是全部标准更正 |
| E13 | [a07-inspection-readback.json](../../var/truck-color-v1-20261020/a07-inspection-readback.json) SHA256 `63680b63dd196e21660bae16312c207bd8655f84d92e2de87fa84523101085d2`<br>[a07-inspection-photo-readback.json](../../var/truck-color-v1-20261020/a07-inspection-photo-readback.json) SHA256 `7ece853fdde0d1e94c806af75c5e6ff540bae83a56e7d05f85aa6f0d4dfe741d` | V-E087 API / Web开发快照 | 2026-10-20 | 3490未关联review检验活动/有效未归档成员；两台次/读数/明确照片归属，非A12门禁 |
| E14 | [a08-create-new-page.json](../../var/truck-color-v1-20261020/a08-create-new-page.json) SHA256 `e633116a1f0cd276709141c7e9290bd17d76a2ebb227fe4d801d0c3e331d4df3` | V-E087 API / c8a33意图Web开发快照 | 2026-10-20 | 3490 Chrome关旧页新页；create响应丢失 |
| E15 | [a08-inline-restore-new-page.json](../../var/truck-color-v1-20261020/a08-inline-restore-new-page.json) SHA256 `fc8995a6c2e115e9a5f979161546fc2e6e3bbb1635129f7d73745964bbeb8758`<br>[a08-inline-restore-history-content.json](../../var/truck-color-v1-20261020/a08-inline-restore-history-content.json) SHA256 `0bf78ef1a2e5ef4d22064ab432c4849c3a0fc8b525432b2d3a5d5c1009ba55ec` | V-E087 API / 4c0f515a6b317e9e928c5711a4c70571f0bc93b0 Web确认核心 | 2026-10-20 | 3490 Chrome+原只读数据库事务；rev1=restored rev3，rev2不同 |
| E16 | [a08-import-image-new-page.json](../../var/truck-color-v1-20261020/a08-import-image-new-page.json) SHA256 `975bf093b8710804086014b8db3c24649549f1ed8d36a5f0ae8301779b7fb3ae`<br>[a08-import-readback.json](../../var/truck-color-v1-20261020/a08-import-readback.json) SHA256 `5f6cfd8fe3fe595c103e6d37c2fd77a757d6373208a8ff6b9f7e8ed89fe00bee` | V-E087 API / 4c0f515核心Web开发快照 | 2026-10-20T08:33:31.742Z | 3490 Chrome/单图真实上传丢回执；仅一图协议；multipart全文未暴露 |
| E17 | [a08-late-input-browser.json](../../var/truck-color-v1-20261020/a08-late-input-browser.json) SHA256 `4f6c31e38960169324d320d6e975502e5c0236093a0e14113cafd30c3461ffe7`<br>[a08-late-input-readback.json](../../var/truck-color-v1-20261020/a08-late-input-readback.json) SHA256 `a334260fc76ea484962f75080e3d3a89df3a685c39b00cc063902cf9da3a6888` | V-E087 API / 4c0f515 Web核心 | 2026-10-20 | 3490确认框显示后新输入；不是IndexedDB await中输入 |
| E18 | [a08-canvas-retry-browser.json](../../var/truck-color-v1-20261020/a08-canvas-retry-browser.json) SHA256 `87f79c2c54781a4d6d357800b4bbb2b171638a9b982dce41082d0ea696624cc1` | V-E087 API / f43e3e3启动重试开发快照 | 2026-10-20 | 3490真实runtime JS故障/Chrome重试；首次128秒空白FAIL保留，不证明性能 |
| E19 | [readback.json](../../var/truck-color-v1-20261020/a09-source/readback.json) SHA256 `cdf7cf1c86d52ade8408c8092d692146a4b5e81a513f78d4b9f0c0a68d3d73bd` | {"contextApiCommit":"e0870e8f4d919496d0161646ccc2c1aa28cd7822","bindingLimit":"record itself lacks runtime identity; nearest documented runtime context only"} | 2026-10-20T08:03:05.046Z | owned local synthetic materials_login_return_20261020_r01; actual parser/CLI/CLEAN; browser not implied；2sheet/10source rows→4colors, source identities/source hash retained |
| E20 | [a11-a12-root-integration.json](../../var/truck-color-v1-20261020/a11-a12-root-integration.json) SHA256 `97efbe3f746b1a34495ae776d22153b725a333daaa0348ae045c508880945993` | {"commit":"cbe1b35922462325738129c857176fbf24bbc4e5","tree":"d4d12ad0ea544e91939ddcf2e86632707827e542"} | 2026-10-20T09:36:54.849578+00:00 | targeted source tests; API189/10files,Web18/2files,0skip; types/lint0; authorPG separate；exact merged-source targeted results |
| E21 | [a11-gui-readback.json](../../var/truck-color-v1-20261020/a11-gui-readback.json) SHA256 `1eaf375d546609a795c68003ab3b9dd34503df32e2b0102f6d3aaf28ebb6790b` | {"commit":"cbe1b35922462325738129c857176fbf24bbc4e5","tree":"d4d12ad0ea544e91939ddcf2e86632707827e542","release":"materials-r04-api-cbe1b3592246","buildTime":"2026-10-20T09:43:35Z"} | 2026-10-21T00:51:22.473Z | 3490; exclusive synthetic project; GUI+authenticated API; no directDB; complete CDP unavailable；14rectification→newreview→CLEANupload→submit→approve→15+refresh/history |
| E22 | [a12-root-integration.json](../../var/truck-color-v1-20261020/a12-root-integration.json) SHA256 `d31ff15eae6734320425370348da90a619091572a2b8379a9d00c197d626f577` | {"commit":"8352f2b041e06c899ae463126881eae14b7c8ec5","author":"214858ef4fc15bd4f5cfb293bac52ed2a9ae352e"} | 2026-10-20T07:43:30.586774+00:00 | source API48/Web33 + types; documented author realPG6 retains author scope；early actual-sampling/no fictional obligation implementation |
| E24 | [a13-report-readback.json](../../var/truck-color-v1-20261020/a13-report-readback.json) SHA256 `cdb25e3d4b70c9b37181d57c078949a2d131b0a0b8551fa7631c9890dec350be` | {"apiCommit":"e0870e8f4d919496d0161646ccc2c1aa28cd7822"} | 2026-10-20T09:49:04.793Z | 3490 GUI+readback, Web development overlay; CDP buffer truncated；missing attachment rejects; PDF upload/submit/read-only/refresh; performance complete button left unclicked |
| E25 | [team-reminders-root-integration.json](../../var/truck-color-v1-20261020/team-reminders-root-integration.json) SHA256 `03b50ece9f18654d96d0087055ccf155058061f9faba297e639ba9e46235cc88` | {"commit":"15c5ec7de97bebe0c931bc972c367c773b3fee33","tree":"38554e5c32a28e3b55b5a599f4c4f34bf66fcf56","authorPGCommit":"20914ed63856f5aa93ca8652e0b34fba60d66680"} | 2026-10-21T00:51:31.210179+00:00 | Nodev24.14.0; lockd96a07...; root70unit/types/lint; author5realPG separate；approved roles-empty eligibility and preserved notification invariants |
| E27 | [a15-workbook-record-return.json](../../var/truck-color-v1-20261020/a15-workbook-record-return.json) SHA256 `5e7144eaafbbafcbd4ecb71c86e44187bef8efa7b7af18260c177b990a0ee9b7` | {"commit":"25621b5a2abc7c0c53c178f3e3ba5fe7ab53c4bb"} | 2026-10-20T09:14:06.667Z | 3490 browser, saved-clean workbookrev2；workbook→records→return samebook/rev |
| E29 | [verification.json](../../var/truck-color-v1-20261020/candidate-189a8c4-20261022/verification.json) SHA256 `62538b478e3cdf162452177497aee51ab2b713f868ec7103152a9b196e550001` | {"commit":"189a8c471b624f8e8e3e8f903b2185f3bf0b7f69","tree":"3dd0358fcbd6cd87b64b5747b67923a3197012cb"} | 2026-10-22T05:50:46.974129+00:00 | Nodev24.14.0/pnpm9.15.4; DB/Redis owner-offline; Web937/API1756pass;293skip；full noDB source suite under189; not final candidate full G3 |
| E23 | [a13-first-arrival-readback.json](../../var/truck-color-v1-20261020/a13-first-arrival-readback.json) SHA256 `0e0f9fcc0a238e2942a0031764887e0792f6d42f2853ba195913e31bec0a8936`<br>[a13-completed-readback.json](../../var/truck-color-v1-20261020/a13-completed-readback.json) SHA256 `b081351dbc24468ce00ee79bf3cf9a965ebcf669630a3b58a5ffd22247c4c28d`<br>[a13-gui-checkpoint.json](../../var/truck-color-v1-20261020/a13-gui-checkpoint.json) SHA256 `a498605337e58472d6289f15718d7d31e714e5cdd5cfda5c8e5e9e804254321f` | V-E087 API / Web开发快照 | 2026-10-20T08:06:29.533Z及08:09:47.856Z | 3490原合成采购GUI/API；两批到货/期限，非试验完成 |
| E26 | [a14-and-restore-integration.json](../../var/truck-color-v1-20261020/a14-and-restore-integration.json) SHA256 `8f12fc82edf163dd98213b00f2d21540a4b154f5f840a83beaa4823c71d68aa6`<br>[a14-source-readback.json](../../var/truck-color-v1-20261020/a14-source-readback.json) SHA256 `c5d97f992ad9b01d2fc7a65c4d48286f384d29c2bc0918192a5dff47b217890c` | fd708d54cfe40b88a0abad26de3941ac68cdcf5d代码集成 / V-CBE源准备 | 源读回2026-10-21T01:03:10.484Z；旧作者PG完整时间未展开 | 目标检查及3490 source workbookrev3；factCount0/quantity0；不是实际apply或27→25→26 |
| E28 | [build-receipt.json](../../var/truck-color-v1-20261020/candidate-01b4bbd-20261022/build-receipt.json) SHA256 `975a4f9fda2ca3ef13b95972fe6305e5cb6041c5c593dca3115aee7ee5c3a59f`<br>[artifact-independent-review.json](../../var/truck-color-v1-20261020/candidate-01b4bbd-20261022/artifact-independent-review.json) SHA256 `a29aba7b9884cd190f40e01d8ca3d55559db1462baa605c193d483856e0cfb99`<br>[api-build-manifest.json](../../var/truck-color-v1-20261020/candidate-01b4bbd-20261022/api-build-manifest.json) SHA256 `0022ac6560ca09b73db3e968f3367e79e07eab1d5ff9d33b4621a0d4196aff46`<br>[web-build-manifest.json](../../var/truck-color-v1-20261020/candidate-01b4bbd-20261022/web-build-manifest.json) SHA256 `6758bc4e5285c271fdfd22fdc667f72b6d275ccbd48f90bd118e8c824628dd96` | V-R10 / materials-r10-01b4bbdb198a / 2026-10-22T07:51:49Z | receipt2026-10-22T07:54:28.885910+00:00；独审07:55:52.149534+00:00 | Darwin不可变构建/独立只读清单；7命令0；不启服务、不含完整portable |
| E30 | [committed-verification.json](../../var/truck-color-v1-20261020/nested-core-paths-20261022/committed-verification.json) SHA256 `e7321fcc6051fe26f8e8698f9fed8b79a849cbffcec8178255130bcb09316ce5`<br>[independent-review.json](../../var/truck-color-v1-20261020/nested-core-paths-20261022/independent-review.json) SHA256 `82e23b6295ce7c5882bee8f82fbbf9e0d3671ae2b1d888466667d17f74e53d9b` | V-R10 / Finding精确target+affected+diff | 2026-10-22T07:51:52.529764+00:00 | Node24.14/pnpm9.15.4/Vitest4.1.11，无服务；130/独立20/目标59重叠，不相加；full pending |
| E31 | [DESIGN_CONVERGENCE_20261019.md](../../docs/acceptance/DESIGN_CONVERGENCE_20261019.md) SHA256 `d713f44f5c82b875d76266b818df5c79fef62f66c13ca95e917758d68b626876` | 86f0300d9ccee6f8019b7580f71766dc7272a688及9710cbfbda9975c1c58f15cff8ff0167540eef6f | 2026-10-19 | 3390合成到期2024-09..2025-09；13月20合法GUI/旧PG/HTTP边界；此处为报告索引，非新增实际记录 |
| E32 | [DESIGN_CONVERGENCE_20261019.md](../../docs/acceptance/DESIGN_CONVERGENCE_20261019.md) SHA256 `d713f44f5c82b875d76266b818df5c79fef62f66c13ca95e917758d68b626876`<br>[NATIVE_PORTABLE_20260917.md](../../docs/handoff/NATIVE_PORTABLE_20260917.md) SHA256 `60b45320ffbba8c3d0d04f1fc4a3d18852c2d6788c1e836cc6e2e46cd9f51291` | 旧aee/86f/4bdb及09-17独立VM，各保原版本 | 2026-10-19及2026-09-17各历史 | 人员/11表/同Mac新卷与独立VM历史；报告索引，不能代当前R10全路径或物理机 |
| E33 | [index.html](../../var/design-convergence-20261019/delivery/reference-comparison-20261019/index.html) SHA256 `6d638b95b717d815e05426a3c9ca2f071177f6198270c5404c894c99855d994d` | 旧4bdb参考/调整前/实装 | 2026-10-19 | 本机离线HTML；当前未启3394；45授权图片/48公开资源；不读/外传真实内容 |
| E34 | [materials-browser-result.json](../../var/chatgpt-followup-20261020/materials-browser-result.json) SHA256 `801f242709471b8e32c2ee4c5bd714cd66a1fdc30d353cf0a68df37e2eb69f6e`<br>[materials-completion.json](../../var/chatgpt-followup-20261020/materials-completion.json) SHA256 `8b6fee193ca635e9486be3a314a91eedb04fd7d61276f134004c8864f157895b` | API4bdbb85174208d30a12c70bba777f1bd6a86c123；Web base a6f046880b58ae4c061b2779266150e94e18f675 + patch b6bbb3cab51321a27663258bbed906752e796557770112a2f98c761383f61d64，开发快照 | 2026-10-20T03:07:38.102Z至03:07:48.577Z | 独立3490 Chrome155.0.8059.85原生登录/returnTo；fixture.taskId=null、items=0，无PDF/upload。30/30及空材料子路径已接受 |
| E35 | [current-identity-and-source.json](../../var/truck-color-v1-20261020/status-audit-20261022-r01/current-identity-and-source.json) SHA256 `b75e4994dac8686e729335a769c3c85ef870a255ba0b17bfe099296191385bed`<br>[current-public-runtime.json](../../var/truck-color-v1-20261020/status-audit-20261022-r01/current-public-runtime.json) SHA256 `c58b1ee49b8d68fdea1ef7f8fc1076280714d43214c17b72c9aaee0491104deb`<br>[current-main-ci-connector.json](../../var/truck-color-v1-20261020/status-audit-20261022-r01/current-main-ci-connector.json) SHA256 `3115ff6b6705d0f26eadb422b0cf294b7779d7466201a651402d5ac7701d930f` | HEAD221621d8快照；main9bdec286 / CI38866594479 | 2026-10-22 16:31 Asia/Shanghai | 只读端口/公共TLS/GitHub观察，非今天重探；无监听；production UNKNOWN；旧mainCI failure |
| E36 | [R11产量网络](../../var/truck-color-v1-20261020/final-execution-20261024-r01/candidate-823b1ea-r02/production-27-25-26-network.json)；同目录production-numeric-27/25/26-final.xlsx；父目录production-apply-network、production-unknown-zero-restored-network、production-mixed-basis-network.json及截图04–22 | R10重构GUI/API局部＋R11数量导出；完整身份见E38 | 2026-10-24 | 3条实际映射；稳定ID修订27/25/26，各步数值导出；未知/0/唯一依据。A07原capture字节仍缺 |
| E37 | [PG结果](../../var/truck-color-v1-20261020/final-execution-20261024-r01/db-tests/results.json) SHA256 `5049498e93ece3109c5f48fc97bb30fa9c56f3fe4f5b48c74cb205f0dfc45b5e`；environment.json及D13-D14-D15-vitest.log | R11；独立新PG14集群、3新DB、各54迁移；测试不连接原55439库 | 2026-10-24 13:22 Asia/Shanghai | 3文件22PASS/0SKIP；真实并发/统计/13月19/20/21/年度回滚；内存HTTP会话不证明Redis |
| E38 | [R11运行身份](../../var/truck-color-v1-20261020/final-execution-20261024-r01/candidate-823b1ea-r02/runtime-identity-readback.json) SHA256 `cc4246052f5fa0273a429beddb002a450cedba389fae9a8d3969d97ef3919d01`；父目录resume-preflight、pre-resume-backup-receipt、original-resources-before-start及登录截图 | 823b1ea2c3bdfc530720cd8570f4acb2de813fe4 / 4885b9fe866be8a9f6456f20abeb26fae1942869 / materials-r11-823b1ea2c3bd / 2026-10-24T05:14:33Z | 2026-10-24 | 原PG/Redis/对象不变；真实本机登录/运行；不证明生产HTTPS/独立恢复 |
| E39 | [本机扫描](../../var/truck-color-v1-20261020/final-execution-20261024-r01/scanner-resume/scanner-live-verification-r02.json)；freshclam-final.log；signatures-before.tar摘要见backup.json | 原本机scanner-v2；ClamAV1.4.6/28162，签名2026-10-23T06:24:08Z | 2026-10-24 13:25 Asia/Shanghai | 原updater0；签名约23h、普通内容CLEAN/EICAR FOUND；48h门槛未变；生产VM未动；第一次启动就绪取证失败保留 |
| E40 | [O1最终读回](../../var/truck-color-v1-20261020/final-execution-20261024-r01/office-o1-api-readback.json) SHA256 `cb263e6c32ca3df320265ebb4b246036619a611973f2c5675e0ec0c8451e0567`；O2-final-api-readback SHA256 `dc315561010e3b0a8fe09a44427e68d3b72238f9de1ea4de3b145ca48d6a6e85`；同目录office-o1/o2网络/图片收据与截图24–31 | R11 / E38；O1/O2各自14格基线 | 2026-10-24 | 两本GUI真实导入、保存、编辑重算及刷新/关闭页重开；O1显示正常，O2首行字形FAIL；没有浏览器进程重启/新登录或编辑后真实Excel往返证据 |
| E41 | [年度最终读回](../../var/truck-color-v1-20261020/final-execution-20261024-r01/annual-final-api-readback.json) SHA256 `8953f98d16c7b8a72c341adb6f3b0a0b99743d57e4ee2bb8a32aea1c40a71462`；annual-idempotent-replay-20 SHA256 `b1de77a11360a6b1ddf6b6fd19dab138991955545c63172c9733860415bf1e0e`；annual-stale-20-rejected-network及截图35/38/39 | R11 / E38；合法新合成源CLI导入、GUI标准更正为2024-09、正式13月事实，不直写业务DB/不改钟 | 2026-10-24 | 20保留→事实19→旧快照409→19待原评审，旧历史不覆盖，重放不新增；D13/D15当前真PG补关键负向；未执行关联项目退出GUI |
| E42 | [R12四端点身份](../../var/truck-color-v1-20261020/final-execution-20261024-r01/candidate-5d3d843-r02/runtime-identity-readback.json)；[O2最终读回](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r12-o2-after-readback.json) SHA256 `b274c61521119c5cb07fb5ee6fcd7958e371384f5445b4d66c57f3adeddb75bc`；42/44/45显示、47/48真实Excel、49/50往返回导截图及r12-office-*-network | R12 5d3d8434d2d97fa26010714a543754ccc850a224 / tree885d94fe… / materials-r12-5d3d8434d2d9 / build2026-10-24T05:45:14Z | 2026-10-24 | 首导复用R11；R12原生重登后O2显示修复、edit/save/refresh与PNG字节成立；导出文件11355B SHAfa01a74e6606827d3b1a5376ed0c228294e2b070229f1b8c36073cd14bb16c41，Mac Excel只读查看后原字节回导，不称Office编辑/日期/全部图位通过 |
| E43 | [R14映射链独审](../../var/truck-color-v1-20261020/final-execution-20261024-r01/mapping-evidence-r01/independent-r14-mapping-chain-review-r01.json) SHA256 `d5cdecee95d1a76adc7e19e7dd363b10b01f022d4414f5a00845cd998cb00ccb`；3ZIP、4正式GET、6网络与截图53–58 | R14 c2ba4fe5aa6ba91fa8726a1dfac5d44cc21b8b4f / treeb274cd3e91c166bde4bdc162a934f6df20f31227 / materials-r14-c2ba4fe5aa6b / build2026-10-24T06:10:55Z | 2026-10-24 | source JSON原字节与mapping/binding摘要可复核；A同ID v9→10→11，其他2事实不变、总量恢复26；旧首次3eb9完整来源缺口保留 |
| E44 | [两成员正式读回](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r14-people-formal-readback.json)；r14-people-member-*-network、r14-person-lifecycle-{before,disabled,archived,restored,enabled}.json与截图61–70 | R14 / E43；3490原生合成M1/M2，原PG只读事务 | 2026-10-24 | 共维同ID v2→3→4与两条新审计；无账号联系人v2→6生命周期，旧参与者ID/姓名与activity.createdById保留，新名单正确，不重复建账号；独审independent-people-gui-evidence-review-r01.json SHA05d1b090b134c0913b0e27f592ecf7ffdd524712fdec5a730ba3a7ab1d3e9aae，27输入逐网络/GET/PG/截图核对 |
| E45 | [首次来源独审](../../var/truck-color-v1-20261020/final-execution-20261024-r01/a07-first-source-review-r01/independent-first-source-chain-review-r01.json) SHAe578cb7eeb4fbe77974b9eea382ab90cb0df8de5b4dfa8252e30a3f499d3c5a7；[刷新统计附录](../../var/truck-color-v1-20261020/final-execution-20261024-r01/a07-first-source-review-r01/independent-refresh-statistics-appendix-r01.json) SHAd8e11855bffcb941441432a8101d32fce817035c055e0df7d9798f9bf6bd9c8b；2ZIP/网络/读回/截图80–85 | R15 df2fab9a6f493d5e56e7b082ca4b9db740563eb6 / treeea3f498ac0f94791aaad4ef1e13f9a84c07875a7 / materials-r15-df2fab9a6f49 / build06:36:32Z | 2026-10-24 | 新book2807d567…v2，来源SHA32490c…/十月10/12/5，PATCH200创建3事实v1/27台、刷新3ID回执；81是配额失败不是apply；snapshotHash另列，不补旧3eb9来源 |
| E46 | [提醒链独审](../../var/truck-color-v1-20261020/final-execution-20261024-r01/a13-reminder-runtime-r01/independent-runtime-chain-review-r01.json) SHA f6067b492d99f4eca750500223468d546f279f24deb4acdf05dcfc9aa3c3e3bb；baseline/after01–04、timer/manual事件、两成员网络/截图71–75 | R15 / E45；原materials合成PG，scope ada49cae…，1项目/2任务/2成员 | 2026-10-24 06:42–06:48Z | 自然timer先生成6通知/2摘要；M1标读后自然/单次manual重放完整行不变、M2仍3未读，范围外不变；7项专用PG资格负向分列，全队列/外邮关闭 |
| E47 | [完成GUI独审](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r15-a13-completion-review-r01/existing-api-and-gui-review-r01.json) SHA3ca1ea990bbfa158b5317fe2e29815a65f8d7268a285a40af3c4620ebbedf73c；[原PG读回](../../var/truck-color-v1-20261020/final-execution-20261024-r01/a13-completion-readback-r01/receipt.json) SHA1a4460a589c0962efa63b3ce5e02bf6efc30d365cccca15f2aa0542d1973e673；截图76–79 | R15 / E45；原report cmvghuzjy…及原PERFORMANCE任务cmvgejs2… | 2026-10-24 06:48:26.935Z完成、06:58:19.849Z只读 | M2点击完成→返回任务/项目刷新；首到货7字段/期限、报告可比字段/单附件v1历史与M2审计保持。R15旧状态/4月显示FAIL保留，已修源码不代GUI复验 |
| E48 | [R17系统边界结果](../../var/truck-color-v1-20261020/final-execution-20261024-r01/a01-system-boundary-r17-r01/result.json) SHAaa8953621044405ac14060ff4092a17a1a2a2780ede4d4667447d8e7923e3104；独审b856cb59f9b622e287339986dc95abebe2ff5b07f769bbe933778d0063fd0fbb；[E2E-01独审](../../var/truck-color-v1-20261020/final-execution-20261024-r01/a01-e2e-chain-review-r01/review.json) SHAb0c478ae6d1f3a0368acaceed22f0335e682928797b6c78257c1b7ce54c5cb19 | R17 c2b066fc…；E44/E01原版本按28相关源与36证据限定复用至0c20c56 | 2026-10-24 | M1/M2本人200/系统管理403，admin200；87既有准入控件/91普通成员无权实显。私有槽13PG+8工作簿PG+25规则按不变6核心源/模型复用，不新造PG/授予权限。A01-04与E2E-01闭合，非生产或所有者签收 |
| E49 | [R17实际四端点](../../var/truck-color-v1-20261020/final-execution-20261024-r01/candidate-c2b066f-r17-r01/runtime-identity-readback.json) SHA4fa1c6c87408ea86064e3f4c323cef5f047dc08676312b3980d3afd1c5c8f50a；截图88–95及对应AX/网络；[两镜像收据](../../var/truck-color-v1-20261020/final-execution-20261024-r01/ci-images-c2b066f-r17-r01/verification.json) SHAccfda99fb96e2377334b5ead71eb666e6cae7b4a96619b19d89a0a668cc26077 | c2b066fc23281faf100c8e871e9cb73eb6309832 / tree629a96126e48c98add93c9a333e7f748c2bc9b7f / materials-r17-c2b066fc2328 / build07:03:08Z | 2026-10-24，07:11:03Z启动，07:11:37Z四字段读回 | 提醒未登录返回/任务已完成状态/映射旧回执恢复后结束新映射已实际点击；报告页历史任务缺失为截图90真实FAIL。c2两Linux镜像构建/Trivy全严重度各0，不代远端CI。原周评原图实显95，重试缩略图按钮本身不是失败证据 |
| E50 | [当前真实PG最终收据](../../var/truck-color-v1-20261020/final-execution-20261024-r01/d10-d06-d07-pg-0c20c56-r03/resume-r01/final-summary.json) SHA35d442154f08fb5a9f351e2c95e38c74af5a58d3df146d1d0c3c78d990731a87；[独审](../../var/truck-color-v1-20261020/final-execution-20261024-r01/d10-d06-d07-independent-review-r01/independent-review.json) SHA32b2589b312269550667b819b9f4f5d129f7df6b9fb056d1409328d9f1d92d3f | 0c20c565…/tree2ca1c057…；API tree同fa19122；lockb90b4bac…/Node24.14.0/Vitest4.1.12/Prisma6.19.3 | 2026-10-24 07:39Z；独立新PG14.24/127.0.0.1:55461 | D10/D06/D07实际13/6/16 PASS、0SKIP；532源/54迁移/71表逐套原行保持。旧52库停且原卷保留，新空库0表后仅部署54迁移；本runner不访问材料库/Redis/生产。D07只删本例新月12负例、附件为合成CLEAN元数据+真实finalize，不是扫描或双人GUI |
| E51 | [R18历史任务GUI独审](../../var/truck-color-v1-20261020/final-execution-20261024-r01/a13-r18-gui-evidence-review-r02/review.json) SHA39678ba8ed2dd7bc112c669ef295adac0facb21daf5c31e851e52e69d44edd58；[实际时序附录](../../var/truck-color-v1-20261020/final-execution-20261024-r01/a13-r18-gui-evidence-review-r02/chronology-and-claim-boundary.json) SHAbdd0e4159c81a77eca86d1cf4636b0be5b1e5d4c4c0ed2e01b20b154ccfdf5a2；截图96–98/AX/网络 | R18 0c20c565…/tree2ca1c057…/materials-r18-0c20c5651791/build07:31:53Z；原project cmvgd1g0…/task cmvgejs2…/report cmvghuzjy… | 2026-10-24；四端点07:37:55Z | 同已完成轮次/7锚点/原报告/单附件只读、空origin400与重试返回、原项目流程已完成均成立；E47完成仍是R15。真实顺序为10/20到货报告→R15自然timer/双人/去重→M2完成→R18只读历史返回；不是同版本重演，已完成任务不重新发提醒 |
| E52 | [独立clean-clone G3](../../var/truck-color-v1-20261020/final-execution-20261024-r01/final-g3-0c20c56-r01/final-summary.json) SHAbdeb8dbdfc7489de87ff00dc182d0724ab4d0891ffef85db7fe6eddf5d06296c；[双Linux镜像收据](../../var/truck-color-v1-20261020/final-execution-20261024-r01/ci-images-0c20c56-r18-r01/verification.json) SHA9f68019c1b34509321907310e155704661675f142937e9493b97b5a49ad3e45f | 精确0c20c565…/tree2ca1c057…/lockb90b4bac…；Darwin G3 Node24.14.0；镜像ci-local-0c20c5651791-r18-20261024-r01/build07:41:26Z、Node24.19.0 | 2026-10-24 | lint/types/test/prisma validate全0；Web1017/API1808 PASS、303SKIP另列，真实Prisma hooks2次。API IID d4069bbd…/Web afeb1382…构建0，固定Trivy0.72.0两exact IID各0命中；41公开产物/raw结果绑定。不代required远端CI、f4d/R19镜像、XLSX full或全安全clearance |
| E53 | [多色双人实际链独审](../../var/truck-color-v1-20261020/final-execution-20261024-r01/a12-r19-multicolor-independent-review-r01/review-r02.json) SHA256 `350647e7322eb41aa1c44c445d53a8c39531a7b278179f7688ad54e27ed03ae7`；[正式阶段独审](../../var/truck-color-v1-20261020/final-execution-20261024-r01/a12-r19-actual-stage-independent-review-r01/review.json) SHA256 `383324236b6aa17725d3832889fafed416a3e56263884d189b915d310ed64c2f`；[原子/整链组合独审](../../var/truck-color-v1-20261020/final-execution-20261024-r01/a12-r19-multicolor-independent-review-r01/atomic-and-chain-combination-review-r01.json) SHA256 `70b752f1d41c5a589bdf3c430990caf7cdb58200dff56eb920b81a8201ab9dfb` | R19 f4d82589…；E50 D07 0c20原执行，14核心输入至f323同字节；当前材料库54迁移 | 2026-10-24 08:08–08:51Z | M2新多色活动/M1共维及色/项目统计；A11单色活动对应两TASK实际评审、首签/附件保留、草稿阻阶段、明确201后18唯一READY。legacy签月保护复用真实D07，非新GUI。两路径资源不同，A12-01/02 PASS不自动提升E2E-06 |
| E54 | [f323目标结果](../../var/truck-color-v1-20261020/final-execution-20261024-r01/a12-navigation-mode-fix-r01/final-results.json) SHA256 `2d51d24b41c221619ffcfe664c27731387f665b3011e7493eab1a8f28043899d`；[R20实际切换](../../var/truck-color-v1-20261020/final-execution-20261024-r01/candidate-f323e51-r20-r01/actual-switch-receipt.json) SHA256 `4d2674b87a901b3f81750e317a812ab821e64639040a7a5c9f38c3f80d5dd5f4` | f323e51da77291591b32696c46cd0c7675c9ae3d/tree b29db577a56de8d000bd41d7b8ec573c0bad89ba；R20/build08:35:16Z | 2026-10-24；08:50:15Z启动/08:50:56Z四端点一致 | 评审登录返回与实际/历史评审摘要9文件修复；Web78覆盖含73已过复用+SSR5重跑、API15、types/lint0，原测试/TS失败保留。7构建0/全库存及启动独审；首502保留后四端点200。截图128正常重登返回color-evaluation；不代fullG3/CI/完整布局 |
| E55 | [单次实际重复阶段请求独审](../../var/truck-color-v1-20261020/final-execution-20261024-r01/a08-domain-replay-r19-r01/resume-r01/independent-result-review-r01.json) SHA256 `94bca12a9fd675d528d8a00b3e5a98bf11b1899f175d75a7b0147feccb085042` | R19 f4d82589…；原GUI stage-confirm taskId/taskVersion字节，M2正常认证、无operationId字段 | 2026-10-24T08:43:04.621Z–08:43:05.661Z | 原201后同body只重放1次，实际400无活跃阶段；原task1/下游1/对应audit15/transition2完整行与SHA不变。原cookie假设失败domain0保留；不是成功回执幂等协议或全库不变；该证据形成时其他义务仍PARTIAL；后续E56综合独审另闭合，不改本次400事实 |
| E56 | [A08-05综合独审](../../var/truck-color-v1-20261020/final-execution-20261024-r01/a08-new-import-independent-r20-r01/a08-05-combined-judgment.json) SHA256 `9aef9e48fa5248cc36e35a7e9f722c34768d254c7bb56a1b01757ee52431294f` | R20 f323e51da77291591b32696c46cd0c7675c9ae3d；旧协议逐输入复用、E55原R19 | 独审2026-10-24T09:40:54Z | 新O1独立本、同图异位、删源后事实保留；D05九PG与原批次失败分列，不声称所有故障排列/自动升E2E |
| E57 | [结构/格式独审](../../var/truck-color-v1-20261020/final-execution-20261024-r01/a02-structure-independent-r20-r01/review.json) SHA256 `c490ac1de12711f36a2a211b87426777ef8cea62a0fa1b55e20235db13b72265` | f323e51da77291591b32696c46cd0c7675c9ae3d/treeb29db577a56de8d000bd41d7b8ec573c0bad89ba/materials-r20-f323e51da772/build08:35:16Z | 独审2026-10-24T09:55:21Z | 截图138–147、v3/v4及两次刷新；结构/代表格式/冻结保持；复制、原11表与图片绝对图位及新剪贴板代码未覆盖 |
| E58 | [适用性](../../var/truck-color-v1-20261020/final-execution-20261024-r01/a15-d01-d18-applicability-r20-r01/applicability.json) SHA256 `951e80d8d12706607dcdea2cdc40ead845be541ece248eb42adb038b439a8da0`；[独审](../../var/truck-color-v1-20261020/final-execution-20261024-r01/a15-d01-d18-applicability-r20-r01/independent-review.json) SHA256 `8e31e0aac1f52852506e0bb7fdf538665e135d67e2526ca5155f435841844bb0` | 16f160b73c38001c2d7796b59343651229caa601/tree0271a9ffa3f72d649756c2cd7e7f456e4e5c6cc7；产品等价R20 f323；历史执行各保原身份 | 执行/适用性2026-10-24；独审2026-10-25T02:03:14Z | 18属性适用，原73PASS/5FAIL后两测试10PASS及Redis3分列；D12含1纯例，历史21PG+25规则/body与53→54影响复用；303SKIP保留；不覆盖新剪贴板/CI/安全/恢复/生产 |
| E59 | [真实复制独审](../../var/truck-color-v1-20261020/final-execution-20261024-r01/a02-copy-independent-r20-r01/review.json) SHA256 `e9a93ac9af2d209921edbc4cb9dac03290e86e75593d6d52a9f52a3b39692ecf` | R20 f323e51da77291591b32696c46cd0c7675c9ae3d；原book4ecbabd3…v4→v5 | 2026-10-25 | 实际菜单复制B2后粘贴F2；expectedRevision4→200rev5及刷新snapshot相等，唯一差异F2中文STRING。149失败与两401保留；150/151成功显示；不覆盖图片剪贴板 |
| E60 | [R21剪贴板完整链独审](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r21-clipboard-independent-r01/review.json) SHA256 `139e264e4a473f51f32d9d1709286122b3306a151e103e314f6605004a7fe416` | 611a36ea32af0d6862701c6770a8bae7a9d889a8/tree06d0162ea709120a9a95637a5152e3882a856233/materials-r21-611a36ea32af/build02:15:13Z | 2026-10-25 | G8/K8独立图Undo/Redo、v6关旧页新开；同B2跨sheet拒绝、G18丢响应重试单图、v7刷新；两原件5bfb…/2240B。164/166旧错误残留保留待R22；非全部入口/结构几何/Office或整链 |
| E61 | [R21同源产量年度独审](../../var/truck-color-v1-20261020/final-execution-20261024-r01/e2e04-bridge-independent-r21-r01/review.json) SHA6172d40effb402fed060c4963b2e09c9f895112e521c5e257f6a41928e629048；[R22导航增量独审](../../var/truck-color-v1-20261020/final-execution-20261024-r01/e2e04-bridge-independent-r21-r01/r22-navigation-appendix.json) SHA63e8486a97ffdcdd03f0562e6cb06f7bba65b0aad8cb9f5799cbd4898f52735b | R21 611a实际写入；R22 08d862c3d8d757ae4409bd895a9a98756b37e79e/tree d88f5f8c8b747b254931e3ea6e61c0a2953b4f02/build02:43:31Z | 2026-10-25 | 源cad334d8…v2，source.json/fullJSONHash/3事实fileHash为740660dd…，区别原XLSX642482…和ZIPfba8…；3事实27/25/26、明确MODEL_DETAILS，TOTAL19只对账；首月26+12明确零月组成13月，旧20/19全历史不变。截图175–177实际导航/关闭/刷新，空最后capture不当GET；E2E-04按组合闭合 |
| E62 | [R22文件选择/错误重试独审](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r22-picker-independent-r01/review.json) SHA34c96a73db7c1fb2e3f9768d2bb26963eae5e8e522cf4b16ac68ecaddce61768 | R22 08d862c…/materials-r22-08d862c3d8d7/build02:43:31Z；book4ecbabd3…v8 | 2026-10-25 | 178错误→显式retry201/replayedtrue→179两旧图片提示消失→v8→新tab7/180四图→M1正常精确GET和原件5bfb…2240B。v7内容全等、仅新增K18一图；空truncated重开capture保留，未新演一般409。与E16/E56/E60闭合A06-01 |
| E63 | [R22 Office实际几何独审](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r22-office-geometry-independent-r01/review.json) SHA46fefc2e9fe9281fd67f1000e2cd4abff4b06cc6d3bdc6749bf0f43257323099 | R22 08d862c…；O1 e874…v4/O2 9be5…v5；旧真实R12导出fa01a74e…及原生Office截图复用 | 2026-10-25 | 181/182原压缩截图1888×1062与1910×1075 CSS逐轴换算，测外框/相对A2/画布绝对位置，记录约1像素边界误差；图边框底色底字完整。独立GET61403c…确认各自完整旧snapshot不变，空Network不当GET；不冒称R22新导出/Excel另存或E2E-03 |
| E64 | [R22图片结构独审](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r22-image-structure-independent-r01/review.json) SHA3204961a7f0a2bff5b194d2555b79a9e40cad8d93d6735fb7790a6e85905f8bc；[业务归属适用性](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r22-image-structure-independent-r01/business-binding-reuse.json) SHAab6bae4f18b45f8d698ca43e57d929ba881ec0b0655b10cf0501e187af06324c | R22 08d862c…；同book4ec…/sheet Zd9RQGJtemIb7exiaHCOm，v8 f059981e…→v9 68869d4e… | 2026-10-25 | 截图183/186–188及正式PUT/刷新GET/独立03:01:54Z GET；四图插行+24px、实际降序不移图、改名切表保持，其他两sheet深等。184为合并排序保护拒绝，非成功。E13原明确台次图与12直接源/稳定绑定语句同字节复用；自由图和业务图分别按合同，不虚构同一行号归属 |
| E65 | [R22四端点实际身份](../../var/truck-color-v1-20261020/final-execution-20261024-r01/candidate-08d862c-r22-r01/runtime-identity-readback.json) SHA3371d845ff2116df466cf8766743298d7fedf0dab2b0d04f35939056498d128e；[poststart独审](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r22-runtime-independent-readback-r01/review.json) SHAb688ba8c7d1413828343ccd6c1a0688647417cf4120d1f04001ea98947827a9c | 08d862c3d8d757ae4409bd895a9a98756b37e79e/tree d88f5f8c8b747b254931e3ea6e61c0a2953b4f02/materials-r22-08d862c3d8d7/build2026-10-25T02:43:31Z | 2026-10-25，02:49:23Z启动，02:49:39Z四端点匹配 | 7构建0/库存独审4847a38d…/启动前1f1ee705…；只TERM已核R21三PID，R22 PID81997/81998/81999 cwd/命令/出生/端口匹配，原PG Redis Clam对象保持；38通知/4摘要全行及scope外不变，仅state.updatedAt自然tick。不代Linux包/远端CI/生产 |
| E66 | [R23四端点实际身份](../../var/truck-color-v1-20261020/final-execution-20261024-r01/candidate-e3e7392-r23-r01/runtime-identity-readback.json) SHA16bc10a8f025388c6bd5c1a52ef2877efda4cb240a9df377f5d09c82834e7e88；[poststart独审](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r23-runtime-independent-readback-r01/review.json) SHAb50e26064c9734f05fac2c5cee2e648f91695f367482f908894ec708d5d0b1eb | e3e73926d17c07a67cf557b4abd5feae3bcb2948/tree31c193517c35b5f8c9aa193d5da7096916b8022f/materials-r23-e3e73926d17c/build2026-10-25T03:20:06Z | 2026-10-25，03:25:36Z启动，03:25:40Z及03:27:07Z四端点匹配 | 7构建0/库存独审cdd1e32a…/启动前fcb4cd0b…；只TERM已核R22三PID，R23 PID85926/85927/85928 cwd/命令/出生/端口匹配。原资源保持；38通知/4摘要全行及scope外不变，state仅updatedAt自然tick。不代Linux扫描/远端CI/生产 |
| E67 | [R23质量实际执行](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r23-quality-execution-r01/verification.json) SHAc830c3b6598a2c247363dcfa88de61b524a17d369cf469af8cf9b996953af01c；[独审](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r23-quality-independent-review-r01/review.json) SHAcc4581f23201e19eb9e696270714d8f702d12c0d778a8cf0fd1090a345a40b76 | e3e73926d17c07a67cf557b4abd5feae3bcb2948/tree31c193517c35b5f8c9aa193d5da7096916b8022f；独立干净clone | 2026-10-25，本机G3及Linux amd64 | Web1101PASS/0skip、API1817PASS/305skip、lint/types/prisma均0；305不计PG PASS。API IID sha256:5f6ad65340962acbab35cdacf47d5780b3c4643e9228feb6d1098f36226537f8，Web sha256:5a5a2553e0407af91167f01ba764728b79e249a61b16a9f5fd4dfee1b4f3fa70；固定Trivy0.72.0/新库01:20:33Z更新、03:33下载，两镜像全severity未检出。94产物/2080源/index-child/包锁独审；Node内嵌OpenSSL/OS EOL警告/旧Finding分列，不代远端CI或全安全 |
| E68 | [日期往返独审](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r23-date-roundtrip-independent-r01/review.json) SHAd807de335de11ad22e382a75fcbadcea88cb3610c8510be66d2577e38e86db73；[原生Excel五样本附录](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r23-date-roundtrip-independent-r01/native-excel-five-sample-appendix.json) SHA3590399547b258ff06f9e1b344110c3c244576f1c2196d26981d899ae429479b | E66/R23；源34ab4145…不变，fed52fc6-1456-4815-a5c6-40c2f58674ad/v2→实际导出208150c9e0f109da447e9b917f0e6578bb7f22096064833d003921dd2eb296ca→回导920fc926-23bb-400a-aaaf-b0570a1bb233/v2 | 2026-10-25，原文件GUI导入/显式继续/保存/刷新/导出/回导/普通M1 GET及实际Excel | 五样本类型/序列/numFmt/文本/空白成立；F26 2028-05-11、B2 2025-09-11、E3日期与09:52:00保持。11表背景共1资产，315表达式与缓存保留不是重算。207/211错误截图不计；非目标E40微小浮点尾差及取证helper失败保留，不宣称全JSON完全相同 |
| E69 | [年度正常返回独审](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r23-annual-return-independent-r01/review.json) SHA91ccec6ea038408c7ba45b92f3cd9fed492ed63508c6e847a9fa7e0b3f71248d | E66/R23；colorId cmvlymc4y00059k71ml8abn3h | 2026-10-25，实际点击201→202，正常M1 GET03:40Z | 关闭并返回同colorId/C3原记录/侧栏，revision5及年度26/19/20完整DTO与E61深等；dirty提示出现但选择UNKNOWN。Network截断与无dialog事件不作负向证明，不重开E2E-04 |
| E70 | [结构本四值导出及Excel独审](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r23-synthetic-semantics-independent-r01/review.json) SHA6369dd6bfef3adeadd569623cc0438d9ccd9724525d18fe2da6f1a46c33afc9e | E66/R23；W4ecbabd3-5e43-4dd5-be69-c544d4732da8/v9；导出4a5f27421f20ac2eb4cfe600edb0c11620c8cbf3939b5fe027d475f696aa3acd/19622B | 2026-10-25，实际导出/所有者打开/215–219原生查看 | 第三表A2 STRING00017/@，B4 NUMBER0，D5显式空串且有OOXML cell/v，E2完全无cell；三表5逻辑图/4物理PNG与旧五drawing对应。仅导出/Excel成立；GUI回导de776ef8-8c81-43d7-8fa0-f90366efc7e5先遇登录500；恢复后核实同op得到0f91badd-2d51-4a35-a2d2-d55919973f25/图片0of5，数据hold暂停继续和正式保存，不计往返PASS |
| E71 | [精确合成计划状态差异](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r23-dependency-recovered-readback-r01/exact-plan-discrepancy.json) SHA9a9f72b59eb94e1d3c5602680121700ac8a8b6e276b0d905f3c571e0dcaf2647；[原资源恢复及API暂停](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r23-login-500-resource-diagnostic-r01/root-quiesce-api-data-discrepancy.json) | R23/e3e原合成PG；03:48:30Z创建、03:48:48Z依赖异常、03:58恢复 | 2026-10-25 | 计划曾201+GET200，恢复后精确API/PG为0；其他指定3DTO相等、54迁移同checksum。只确认该差异，非全库损坏证明；当时初始原因UNKNOWN；后续系统/人类时间线见E74，特定丢行机制仍未知。API04:02:47Z停止，当前预览不可操作，不重放/补建/覆盖 |
| E72 | [R24代码提交与检查](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r24-login-return-quality-r01/committed.json)；[两文件独审](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r24-login-return-independent-r01/review.json) SHAa260855773288425da3eb9942ec14a5c7159369a6104c66719962d65ecbd40b7 | 43fada95cbd1648879c67a772d3e45596f9f2741/treefc875f8bfe9019847ef4221299e1d1ecbd0f953c | 2026-10-25，75目标/0skip，Web types/目标lint0 | pilot等既有项目页returnTo遗漏已在源码修复；精确集合和服务端project probe，未授权/异常fail closed。历史221/222真实错误保留，R24已构建并完成库存独审，新GUI待验，无业务/权限/schema改动；不是20页全部GUI通过 |
| E73 | [当前合成库保护收据](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r23-current-synthetic-preservation-r01/preservation-receipt.json) SHA79546e9d975711b376d88285f5b75616bb6eece637da5478ed4418a885551efb | 原R23合成库、API已停止；内置盘独占0700/0600输出 | 2026-10-25T04:10:28Z–04:10:31Z | custom dump749762B/SHA91241ce988b6c2ea8cb3bcc066bbb05ffff1c8755d90e56ca07e9b19a31ae81e；pg_restore仅list0，无实际恢复。54迁移/36对象stat前后一致；不含对象二进制备份，不读旧backup/raw，不补建缺行 |
| E74 | [限定存储异常日志及人类操作](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r23-storage-cause-readonly-r01/final-report.json) SHA602d9f5e3f180606f4470d1585c766916015c7b6675ab1d620713b8f2e388dd6；[所有者明确顺序](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r23-storage-cause-readonly-r01/owner-operation-sequence.json) | 原外置Extreme SSD及DockerData-SSD；5分钟disk/15秒USB限定窗口 | 2026-10-25 | 系统证实设备断联→APFS写/sync失败→Docker EOF；所有者确认退出Docker→推出外盘→连回。退出是否完成/特定丢行机制未证明，不把重挂成功当持久性恢复，也不指认硬件坏；停止扩搜 |
| E75 | [R24制品库存独审](../../var/truck-color-v1-20261020/final-execution-20261024-r01/candidate-43fada9-r24-r01/independent-artifact-review-r01.json) SHA352364316a1f85b575bc8a459641398e165f32146cd495cdbaacda94b89fc994；[构建收据](../../var/truck-color-v1-20261020/final-execution-20261024-r01/candidate-43fada9-r24-r01/reconstructed-build-receipt.json) SHA977b028f87e2997bc59c737a771adaa02df92c2d70724e23154ccc8d2738df30 | 43fada95cbd1648879c67a772d3e45596f9f2741/treefc875f8bfe9019847ef4221299e1d1ecbd0f953c/materials-r24-43fada95cbd1/build04:10:59Z | 2026-10-25，7构建阶段0；未启动 | 2080源码/43590依赖/1857运行条目全库存、日志、lock/schema+54迁移及编译四身份匹配；内置盘纯构建，未调用Docker或业务DB。仅A15-04制品绑定，不释放数据hold或证明GUI/restore/remoteCI |
| E76 | [R25构建独审](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r25-build-independent-review-r01/review.json) SHAc2da687995e7592640f62cbe278b244f03d7a5aa32a5077b349e4e2ce797828b；[当前身份独审](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r25-a15-05-identity-review-r01/review.json) SHAf56a80a9f5af18388780daad0d491b1c07d066e0611f8b6723746764c46beec1 | 27013ab9486743071edc326fd903ae1b46e59cff/treef313865f5432bc920241e436dc5b19a774cf8062/truck-recovery-r25-27013ab94867/build2026-10-25T12:49:18Z | 2026-10-25；初启13:05、重启13:20、独立当前快照13:28:59Z | 新Ubuntu ARM64 7构建阶段0；严格显式production Node+staging loopback profile，183目标0skip/类型lint0及75返回测试按输入复用；旧失败保留。新PID24236/24242/24243、PG systemID7700459308674415750、真实Clam23986/Redis23473、全loopback与四身份匹配。非旧Alpine扫描替代、非新HTTP扫描门禁或完整离线包 |
| E77 | [浏览器与运行绑定](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r25-browser-recovery-r01/browser-runtime-binding.json) SHA78dcb08d10e4efd42aa932a41a93633a2668bd41abd99e826b8e720f0fbe9ff0；[恢复独审](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r25-postrestart-acceptance-review-r01/final-recovery-readback-review.json) SHAf271f719b4b59dbf2f63235875c4b7b119cbc7b03a8d603e9f50f1d7c60b32df | E76 R25；https://localhost:45464；获准事故后dump91241ce9…与新36对象包，原API停写 | 2026-10-25；13:18:42新计划，13:19:36正常停，13:20重启，13:20–24新请求读回 | 72表/2459行/54迁移UTC相等与36对象字节/引用核对后，原M1真实密码登录返回同project；W v9与日期本v2/11页、真实图片显示；新plan cmvnusx5t0009jzl50azd96tj/batch002于201→200→刷新→应用重启后完整记录一致，W DTO同/3张图非缓存200/local会话保持。正常API/Web/proxy重启，不推VM/PG/Redis/故障或物理事故恢复；旧plan缺失未掩盖，A15-09和E2E-08未闭合 |
| E78 | [R27构建独审](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r27-build-independent-r01/review.json) SHA d1467131327a806552faadb2858081cfc58b381eedf23ab2a42e2d852c82e9f0；[日期/评审独审](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r27-project-path-independent-r01/review.json) SHA f7197a569819143e2c9d37299f8fb360cd73109c7c5f396a5ff158e6f15e0083 | R27/147f2db23a3a1c4fabce7b31fb4db542d08dc0b9/treeb7552adf04725b32aaff0cd8e253d4ff959ee275；Linux ARM64；HTTPS45464 | 2026-10-25，build14:10:48Z | datetime-local转ISO修复后新V4上海21:37→13:37Z正确保存/下发；旧V3错时保留。7构建阶段0与完整库存；后继R28/R29未构建，不冒称源码运行一致 |
| E79 | [业务链独审](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r27-project-path-independent-r02/review.json) SHA cd28e6cb57c544a1bdb268415e4c6f100a7e349dfb484505bb82514717f3980d；[最终桥接独审](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r27-project-chain-independent-r03/review.json) SHA d6f848cf16694ba6cf1618123c4453b618af12fb6d1cc8727d878a85b8555df1 | E78实际R27；project cmvm46f44000r9kl5klnhsonj/青州白；原E53实际双人链按18输入适用性复用 | 2026-10-25；GUI/API02–37，历史E53明确原日期 | 驾驶室拒绝→试制新轮→复审通过；费用/14/排产/量产/17明确完成→18待退出。05/09与首到货期限保留。当前查询3场4白色台次2车，原多色白v2/蓝v3与作者图不改，正式单色活动关联同项目/评审且锁定；37实际返回原评审。A11-01/E2E-06本机限定PASS；项目未整体关闭，A10/E2E-05不自动升级 |
| E80 | [完整限定安装独审](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r27-offline-install-independent-r01/review.json) SHA1f32d3cc60c6220d7332fba81ea1ac127e1e4cf82cd631f67dc383580967ff2f；[安装执行收据](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r27-offline-package-execution-r01/new-app-start-result.json) SHA 38c406119eaf6ec5324d259fa2a94f9b2a7a2d7cbb0346d8089c5e86bd556fe4；[r04独审](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r27-scanner-filesize-independent-r04/review.json) SHA eed2a9d5f98d4c805cb0ad6330d8b15b7d061a31c4dd5432e440af3c312d458b | R27 tar SHA594c92b6131ee17290a538b02bbcfd2067521586645a40e7b9f9b370707eb7e3；非覆盖offline-software-r27-r01，新PG/原恢复数据不变 | 2026-10-25，15:45Z应用从新prefix启动 | 17225项安装/签名离线导入，原5例3/5失败保留；r04正常停旧daemon、保留log、128MiB临时文件限额后5/5（256c3825…），原扫描拒绝不放宽。直连HTTP+严格CA HTTPS四身份与GUI33–37成功。原tar须另附r04固定本次回执补充，非通用最终包；依赖实际安装/初始化注册退出等缺口保留，A15-09仅PARTIAL |
| E81 | [R28提交绑定](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r28-preview-checks-r01/source-commit.json)；[R29提交绑定](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r29-history-status-checks-r02/source-commit.json) SHA6bd0b4e39fae2ab2a771e4f12105d48754650051a551f57ecadee4246e00bb1a；[R29独审](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r29-history-status-independent-r01/review.json) SHA8cf1acbbdea98b20482be2fa14bdf78040a44112b03c9ca79e299c560787f0ff | 源码d5e8e47b43d5dbe5e5ffef2ddfc252b19e3a32d4 → d3b264141798ae0c8195e921c097a014b042d589/treeeddf0f1d611701100e28cfdc2d8597b03ae929a4；未部署 | 2026-10-25 | 返工预览复用真实完成证据守卫；历史排产/量产显示同工作流历史任务且不授予写权限；显式构建缓存关闭支持。目标/类型/lint及独立diff通过；新制品和真实GUI待验，不覆盖当前R27的P2显示缺陷 |
| E82 | [新账号限定结果](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r29-native-account-check-r01/bounded-result.json) SHA22e0a9bb61813fa9ced226ea829de6035c525f49ec2e74ec1a83f74be939a390；[独审](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r29-auth-refresh-readonly-review-r01/review.json) SHAef6f9dd71fdd4ceed928e699ef646605248c82b4191a3ea5a0b284a0e2fa57d5；[guide截图目录](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r29-guide-path-r01) | 实际R27/HTTPS45464，新普通合成账号未获准入/角色/管理员 | API 2026-10-25T16:25Z；GUI 2026-10-26T00:29Z后 | 注册201、密码登录/会话、退出200与旧cookie401；第二次GUI刷新session true，退出后false。首次GUI刷新未保持会话且缺cookie根因证据，保留UNKNOWN。guide/两评审/返回实点，新驾驶室文案未运行 |
| E83 | [源码提交](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r29-review-history-checks-r04/source-commit.json) SHAe789b5963b4cab0b24b21fe2e3c5c20ea00d2a2d7434372c50eed9c601b64fba；[独审绑定](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r29-review-history-independent-r01/commit-binding.json) SHA5104bc43f99aa8ea2d1aa18e3510508bc5adf932fa9193156c4cd21a6aeca096；[构建失败](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r29-low-space-build-preparation-r03/execution-r01/host-result.json) SHA822fb7bc292a7ea95bbd323bf5a803b031e23f18435bb6028137c895d51831b0 | a14126fb0ca2f8ca70e61730896f5c91836d5122/treee38c9d73e053e1dbf3e9da8370a3bcf70226884f；源码未运行 | 2026-10-26 | 历史展示与写动作分离，涂装厂提示明确；119API/19Web/6文案、类型lint/独审成立，原夹具失败保留。00:34Z应用/scanner正常停机。初次预检源/生成schema误比已修，第二次预检0、根只读remount EBUSY32，未抽源编译；640MiB空image/日志保留。实际24785432576B低于24GiB；不计新制品PASS |
| E84 | [四值回导结果](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r29-office-semantics-reimport-r01/result.json) SHAf71e1853…；[独审](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r29-office-semantics-independent-r01/review.json) SHA59964e6f…；[整链独审](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r29-office-e2e03-independent-r01/review.json) SHA1e69d1ce… | R27，原R23导出4a5f2742…，新op369b6840…/本7b259a10…v2 | 2026-10-26 | 真实文件选择/创建201→显式继续导入→4资产/5图位→草稿200→正式PUT200v2→刷新GET200；STRING00017、NUMBER0、显式空串和缺失格逐类型读回。E42/E68/E70按输入复用，A05-05限定PASS；旧意图不改，E2E-03只缺O1尾段 |
| E85 | [维护后预览读回](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r29-preview-resume-execution-r02/result.json) SHAea451dcf…；[运行与恢复回执](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r29-preview-resume-execution-r02/runtime-receipts.json) | R27/147f2db23a3a1c4fabce7b31fb4db542d08dc0b9；非新a141候选 | 2026-10-26T03:11Z后 | 所有者批准临时guest core设置，B05退出后已恢复原Apport pattern（07fe9e37…）。PG/Redis/scanner及三app正常续启，四身份同R27；前后quota 39条/三项0，90日原口径未改；浏览器原会话/项目05、09、18及新book v2 snapshotHash保持。早先取证psql多语句末结果空输出失败保留，改-f后真实SELECT通过；非故障恢复或全库相等结论 |
| E86 | [B05实际失败](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r29-low-space-build-preparation-r05/execution-r01/host-result.json)；[B06最小修正独审](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r29-low-space-build-independent-r06/review.json) SHA3f3d1c6b…；[离线first-start联合清单审查](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r29-portable-first-start-scanner-independent-r02/review.json) SHAb72d1311… | a141仍未构建；R27包+必需扫描器修正与精确sudo .4附件 | 2026-10-26 | B05准备0，在编译入口因继承/boot可写被guard拒绝，实际编译0条，日志/盘保留；B06仅私有视图boot只读与vfat检查，未构建。sudo官方签名/Packages/deb链成立、联合清单必需附件完整，未假计为20deb安装；fresh初始化/20deb实际安装仍未执行 |
| E87 | [O1文件绑定](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r29-o1-office-tail-r01/export-identity.json)；[导出缺陷独审](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r29-o1-tail-review-r02/review.json) SHA57595013…；[源码与检查](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r29-default-column-width-fix-r01/committed.json)；[最终diff独审](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r29-default-column-width-fix-independent-r01/review.json) SHA9447d3d0… | 实际R27；新源码17aa74a33c14fac516c924573c2b2388f6960238/tree738a75c3b949a08309ce7084f2d75bddbcb61a46未运行 | 2026-10-26 | c28a…11325B的Excel13/22已由所有者截图确认。14格/PNG锚点保持，但4处默认列宽100/88变68，E2E-03 FAIL。源码修复继承默认列宽，先红后绿、136目标及最终44目标/types/lint/独审；错误文件保留，新候选实装及Office尾段待验，A05既有局部范围不改 |
| E88 | [新boot实际回执](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r29-vm-restart-observation-r01/actual-public-receipts.json) SHA19fcf66d…；[独审](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r29-vm-resume-independent-r01/actual-newboot-binding-review.json) SHA8e6a997c…；[GUI读回](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r29-vm-resume-independent-r01/gui-o1-v4-addendum.json) SHA39f3b8e3… | 原R27、同独立VM/PG；新boot2552886b-e854-4f99-8b4e-bd307d8ddb92 | 2026-10-26T07:06Z后 | 新现场VM停止/host SIGTERM来源UNKNOWN，旧PG in production不伪正常停机；正常恢复原服务，旧scanner PID精确保留改名，配置/签名/限额不变，前后quota39/三零。4身份一致，Dashboard与O1v4全DTO保持。旧回导结果未观察不重放；缓存根现缺失按ABSENT/0记账，原raw/gzip保留，当前余量需每大阶段重测 |
| E89 | [列宽及几何影响独审](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r29-o1-column-geometry-impact-r01/review.json) SHA8c7c05c5… | O1v4实际c28a…；O2v5旧fa01…与新本v2两次GET | 2026-10-26 | O2同样四列68反证成立，E2E-03失败范围包含两本；各自图片在显式220px A列内、x4–164/固定160×100，计算位置/尺寸差0支持A05-06限定PASS。小数取整无明确容差批准，未将算法推导当候选实测或新PASS |
| E90 | [构建主结果](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r29-candidate-17aa74a-build-preparation-r01/execution-r01/host-result.json)；[编译回执](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r29-candidate-17aa74a-build-preparation-r01/build-public-r01/reuse-build-receipt.json) SHA746e0f3b…；[实际独审](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r29-candidate-17aa74a-build-independent-r01/maintenance-build-actual-binding.json) SHA243bb9f3…；[core正文及清单附录](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r29-candidate-17aa74a-build-independent-r01/core-body-and-build-manifests-addendum.json) SHAc8daef23…；[正常续启实际回执索引](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r29-candidate-17aa74a-build-preparation-r01/maintenance-execution-r01/public-receipts/index.json) SHAcadf7ecc… | 编译17aa/tree738a，build2026-10-26T08:28:17Z；运行仍R27 | 2026-10-26T08:27–08:49Z | 3主阶段/8子阶段exit0、旧依赖前后相同，640MiB image5fc084fc…保留并只读挂载；COMPILED_ONLY/runtimeReady=false。四服务正常停后临时core窗口finally恢复66adfe73…；PG2277/Redis2309/scanner及R27 API2426/Web2428/proxy2438正常续启，前后quota39/三零，原O1v4页面恢复。未装载新候选、不代Office产品或全包安装；累计22673813504B，后续复制另核峰值 |
| E91 | [实际装载与运行](<../../var/truck-color-v1-20261020/final-execution-20261024-r01/r29-preview-17aa74a-execution-r01/>)；[独审](<../../var/truck-color-v1-20261020/final-execution-20261024-r01/r29-preview-17aa74a-independent-r01/review.json>) SHAce933156… | 17aa/tree738a/build08:28:17Z，first-17aa74a-r01 | 2026-10-26T10:13–10:24Z | 复制15741项，manifest83c76b92…/copy86aba501…；原R27正常停止，新API2976/Web2977/proxy2988严格CA/直连四身份一致，PG2277/Redis2309/真实scanner保持；quota前后39/三零。总allocated23206887424B，guestfree1173508096B；全包/新空库初始化/20deb未执行，不代产品完成 |
| E92 | [代表公式实际操作](<../../var/truck-color-v1-20261020/final-execution-20261024-r01/r29-formula-representatives-r01/>)；[独审](<../../var/truck-color-v1-20261020/final-execution-20261024-r01/r29-formula-independent-r01/review.json>) SHA2c308df6… | 实际17aa；原11表920fc926…v2→v3/hash a309447d… | 2026-10-26 | 两个真实输入→SUM/跨表直接引用/加法代表重算→正式保存200→刷新GET200；315表达式保持、独立逐缓存核算相符，11表/502numFmt/212日期格/11背景引用保持。首轮401与草稿待核实保留；正常重登后同草稿恢复，不把缓存审计当315次GUI。A02-06限定PASS |
| E93 | [O1实际尾段](<../../var/truck-color-v1-20261020/final-execution-20261024-r01/r29-o1-17aa-office-tail-r01/>)；[初审](<../../var/truck-color-v1-20261020/final-execution-20261024-r01/r29-o1-17aa-independent-r01/review.json>) SHA2892bcfa…；[图片/主表追加独审](<../../var/truck-color-v1-20261020/final-execution-20261024-r01/r29-o1-17aa-independent-r01/image-and-main-grid-addendum.json>) SHA9e2ff522…；[O2实际失败](<../../var/truck-color-v1-20261020/final-execution-20261024-r01/r29-o2-17aa-width-tail-r01/result.json>) | 实际17aa；O1e874…v4→641ce…v2；O29be5…v5→8755…v2 | 2026-10-26 | O1新导出a745ac3b…/11314B、原生Excel16.114.1只读查看13/22/原公式、新op明确回导正式保存刷新；14格/样式合并/400有效行高/52有效列宽及PNG2240B/5bfb…保持。03未入网格/04图片未加载及下载/取证失败保留，05/06补真实显示。O2新导出db0911bc…保留小数，回导保存刷新四列取整，E2E-03仍FAIL；无额外SaveAs或强制Excel重算声明 |
| E94 | [源码修复与验证](<../../var/truck-color-v1-20261020/final-execution-20261024-r01/r29-fractional-width-fix-r01/committed.json>)；[独审](<../../var/truck-color-v1-20261020/final-execution-20261024-r01/r29-fractional-width-independent-r01/review.json>) SHAb6d97e62… | 3941beccddd0dfce94c8f0f7fd7d62819fb05270/tree db699c2e128e9c40d677de2ccca0788d8ffccdb9；未构建运行 | 2026-10-26T10:41Z | 仅xlsx.ts显式宽度读取移除Math.round及原用例参数化；100/88/220整数与99.5/87.82421875/220.375小数覆盖。红例100≠99.5保留，45/45/类型/目标lint exit0，独审安全保护未变。当前预览仍17aa，不以源码提交关闭O2/E2E-03 |
| E95 | [四页实际操作](<../../var/truck-color-v1-20261020/final-execution-20261024-r01/r29-route-tail-execution-r01/result.json>) SHA958bb8df…；[独审](<../../var/truck-color-v1-20261020/final-execution-20261024-r01/r29-route-tail-independent-r01/review.json>) SHA96ae4164… | 实际17aa/45464，新汉玉白cmvm46f… | 2026-10-26 | 驾驶室涂装厂返工/一致性外饰件整改新提示、两轮驾驶室历史、原排产2台CONFIRMED/量产2of2 COMPLETED及真实来源任务/项目返回；四响应200与ready截图。E82导览FAQ按相关源码相同复用，A11-03限定PASS；不重演业务，不闭合A10/E2E-05/05/09/18。loading截图保留不冒称ready |
| E96 | [A05 reader影响复核](<../../var/truck-color-v1-20261020/final-execution-20261024-r01/r30-a05-reader-applicability-r01/review.json>) SHAa3cd4c45…；[PM实际反馈](<../../var/truck-color-v1-20261020/final-execution-20261024-r01/r29-pm-progress-20261026-r04-feedback.json>) | E93 O2 db091…→8755…v2；3941未实装 | 2026-10-26 | 四列小数取整直接否定当前A05-04尺寸保真，局部重开PARTIAL，原首导/编辑历史不改写。14格/样式/合并/400行高及非ID绘图字段相同；A05-01/02/03/05/06限定结果保留。PM69498949已收到合并回报并支持受影响片段复验，不代所有者签收 |
| E97 | [缓存实际回收独审](<../../var/truck-color-v1-20261020/final-execution-20261024-r01/r30-cache-release-actual-independent-r01/review.json>) SHA880a9fd6…；[构建与17aa恢复独审](<../../var/truck-color-v1-20261020/final-execution-20261024-r01/r30-build-resume-actual-independent-r01/review.json>) SHA716debaf… | 编译3941/tree db699/build12:28:07Z；恢复运行仍17aa/run resume-after-3941bec-r01 | 2026-10-26T12:19–12:35Z | 已归档r25/r27两成功cache的18文件16目录实际回收，68条journal与无引用证明；不以净空间差冒称唯一释放量。3941构建3主/8子0、依赖前后相同，640MiB image f38a…保留只读；core finally0bfe…恢复后PG4039/Redis4075/scanner与17aa API4168/Web4169/proxy4175正常续启，四身份一致、quota前后41/三零/90日、浏览器原项目恢复。新3941未实装；非全包或O2验收 |
| E98 | [3941实际装载/切换](<../../var/truck-color-v1-20261020/final-execution-20261024-r01/r30-preview-3941bec-execution-r01/start-result.json>) SHA3c0eae5f…；[复制准备独审](<../../var/truck-color-v1-20261020/final-execution-20261024-r01/r30-preview-3941bec-actual-independent-r01/review.json>) ef04b463…；[运行独审](<../../var/truck-color-v1-20261020/final-execution-20261024-r01/r30-preview-3941bec-actual-independent-r01/runtime-appendix.json>) 4d51abc7… | 3941beccddd0dfce94c8f0f7fd7d62819fb05270/tree db699c2e128e9c40d677de2ccca0788d8ffccdb9/release truck-recovery-r30-3941beccddd0/build12:28:07Z | 2026-10-26 | 15741项/460214149B manifestc6b3…与copy3dd86…完整；备用17aa入口09560c…已prepare未启动。正常停17aa a9e13…后API4540/Web4546/proxy4552新run first-3941bec-r01，四身份一致；PG4039/Redis4075/scanner4112未重启，同boot；90日quota前后41/三零。当前scanner核验87e427…，五例256c…按未变输入复用。13:09Z全范围实际22623064064B<24GiB，不代完整包/新库或生产 |
| E99 | [O2实际尾段](<../../var/truck-color-v1-20261020/final-execution-20261024-r01/r30-o2-3941bec-tail-r01/result.json>)；[独审](<../../var/truck-color-v1-20261020/final-execution-20261024-r01/r30-o2-3941bec-independent-r01/review.json>) SHAa276422b…；[对照](<../../var/truck-color-v1-20261020/final-execution-20261024-r01/r30-o2-3941bec-independent-r01/comparison.json>) c7b89f27… | 实际3941/45464；原O2 9be5…v5→正确导出db091…→全新703898c1-a8bf-4d59-8217-fcc630df5c8e/v2 | 2026-10-26T12:59–13:06Z | 实点导入、新op cb5c1dbe…、继续完整图片、显式正式保存、刷新GET与另建正常合成会话全DTO字节一致。四小数精确99.5×3/87.82421875；14格/语义样式/400行高/52列宽/合并/非ID绘图几何相同；新图原件2240B/5bfb…200，截图13/22/24显示图片与14/23。旧CDP响应缓存过期不能取得上传body如实保留，正常API列表/原件补证；结束op保留原件草稿。A05-04限定复闭，结合E93及未受影响Office/SUM/日期/四值证据闭合E2E-03，不重跑原生Office，不覆盖旧失败 |
| E100 | [重开与重登](<../../var/truck-color-v1-20261020/final-execution-20261024-r01/r30-browser-reopen-r01/result.json>)；[独审](<../../var/truck-color-v1-20261020/final-execution-20261024-r01/r30-browser-reopen-independent-r01/review.json>) SHA49dc9ee6… | 当前3941；E99正式703898c1…v2 | 2026-10-26T13:24:53Z | 所有者回复已正常退出整个Chrome并重开，值图正常；根认领新标签后完整GET，实点正常退出登录→登录→原returnTo，logout/login/GET200，14/23及绿图截图亲看。E99浏览器/独立API/重开/重登4份DTO字节相等ec68…。OS退出人工报告与工具实测分列，闭合A03-01/P0-03，不升A03-05/E2E-02或产品签收 |
| E101 | [双模式实际验收](<../../var/truck-color-v1-20261020/final-execution-20261024-r01/r30-a02-boundary-execution-r01/result.json>)；[返回读回](<../../var/truck-color-v1-20261020/final-execution-20261024-r01/r30-a02-boundary-execution-r01/return-readback.json>)；[独审](<../../var/truck-color-v1-20261020/final-execution-20261024-r01/r30-a02-boundary-independent-r01/review.json>) SHAa0ad0581… | 当前3941/45464，W4ec…v9；青州白cmvge8gn6000f9kh87gwjv6ua/revision4 | 2026-10-26T13:37–13:42Z | 自由本→业务记录→筛选同合成ID，双击只读名称及Backspace均显示实际拒绝，9GET/零业务写。独立正常认证一次PATCH合法note+非法id返回400/FIELD_ERROR/id；颜色3份完整DTO相等154f…，W4份含浏览器返回相等e1d4…。16源码+锁/包适用核对复用E57原结构正向，限定闭合A02-01；cua无对象/文档查询失败仅工具限制，未注入命令或删除保护 |
| E102 | [实际新库初始化](<../../var/truck-color-v1-20261020/final-execution-20261024-r01/r30-fresh-init-execution-r01/result.json>)；[完整CLI回执](<../../var/truck-color-v1-20261020/final-execution-20261024-r01/r30-fresh-init-execution-r01/06-initialize-result.json>)；[独审](<../../var/truck-color-v1-20261020/final-execution-20261024-r01/r30-fresh-init-actual-independent-r01/review.json>) SHAb433ccc6… | R27包147f…/archive594c…内CLI；新DB truck_color_a1509_init_r29_20261026/低权role truck_color_init_r29；当前预览3941保持 | 2026-10-26T13:55:27–13:55:31Z | 精确目标不存在/512MiB预留后，固定DDL新建、独占私有输入和参数绑定密码；54迁移/目录/管理员初始化exit0，9项单账户/凭据/审计断言1；重复CLI exit1后完整业务投影相等，新库14757211B。原postgres读/home/recovery脚本Permission denied在SQL前失败，r02核目标仍空后改stdin，未放宽目录权限。host22644031488<24GiB、guest1854988288>1GiB；11组件/迁移集R27→3941逐项同。限初始化，不称HTTP新登录/20deb安装/scanner first-start/3941全包/A15-09通过；未停当前应用或连恢复库 |



E19的原记录缺自身runtime四字段，e087仅邻近上下文，不据此记parser/GUI PASS；E22/26旧记录保持原绑定边界；对应D属性现由E58原件/当前执行/输入适用性满足，不把旧作者数量改写成当前同次结果。E08旧小型4×2在cbe真实回导保存刷新rev2继续历史PASS；其新reader整体不进R10分子，原生Office部分已复用。

### 本轮只读复用输入核对

[逐文件SHA/差异与不变源段](../../var/truck-color-v1-20261020/acceptance-baseline-20261023-r01/a01-a08-evidence-analysis.json)（ac63ce1000462ca59d1144210f6471346f727762810faed7145fc9a1080291d9）；[业务/构建适用性卡](../../var/truck-color-v1-20261020/acceptance-baseline-20261023-r01/a09-a15-evidence-analysis.json)（cc92672b058079a8feb43f4215e796be9517add5d4883890a97a5f8ff13bf04a）；仅为一次性支撑证据，当前PASS取原子表。

- R01：AUTH_PERSON_API：e087→R10认证/people/team-authorization/team-membership/main/prisma服务所列相关源同字节；PersonProfile/User表不变。
- R02：DRAFT_WEB/WORKBOOK_API：draft-store、editing-draft、save-session、server-draft-session/client不变；canvas/runtime并非整文件不变，普通挂载/restoreEdit及对应成功分支经语义核对不受新失败/async保护影响。8c→e087更严filter/资源键规则对已验合法唯一输入不改结果。
- R03：FILTER：filter-exchange、contract、API workbook.rules及e087锁一致；workspace/runtime/canvas有新变化，不笼统声明全UI不变，普通筛排成功分支不受影响。
- R04：真实Chrome正常IME：composition/imeActive/readEdit/restoreEdit连续源段相同；ec20→R10新增filter/sort1.0.4直接依赖，整个锁非从未变化，核心/drawing仍1.0.4。async交错单列A03-05。
- R05：外部Office固定文件/人工动作：不依赖当前R10 runtime，不外推完整回导。
- R06：r04 prerequisite记录全部10源码模块hash等于R10blob，相同lock；实际两合法输入parser结果可复用，非browser。
- R07：IMAGE_IO：服务端图片权限/锁、cache/background helper同字节，retryImages连续函数相同；不覆盖结构变化后的几何。
- R08：MAPPING_CORE：business-apply/journal/mapping/context及person适配同字节，mapping panel只产量说明变化；颜色更正核心不改；检验新归档/评审链接不执行于有效未归档/未关联fixture，不称新分支通过。
- R09：INTENT：4c0f515→R10意图store/session/API/rules核心同字节；canvas新导航/启动UI不触达原create/restore数据协议。单图后段同，相同原件r04新guard已真实接受；未知multipart全文仍不声称相同。
- R10：cbe外观整改业务状态/历史复用；工作流共享personnel/team-assignment在cbe后为提醒变过，不能把旧授权依赖全算不变；新资格相关检查由A13/A15承担。
- R11：e087→R10 paint-procurements/performance-tests/performance-arrival-anchor及对应workspaces同字节；只复用到货期限/报告普通分支，提醒资格/投递不推定通过。
- R12：原精确导航修复/路径无变化：材料returnTo已接受输入留原ID，25621b5→R10的颜色workspace/admin/record-navigation无diff；其他路由及dirty不外推。
- R13：旧R10至HEAD221时点应用/包/脚本/锁/workflow无差异，旧构建仍保留；R10→R11仅四Web导出类型/回归文件改变，API/schema/锁未变。R11新双制品10命令/完整清单及运行独审见E38，不把新源变化写为仅文档。
- R14：01b4精确XLSX目标/受影响/独审源blob及固定合成输入；旧失败和schema验证错误留存；不扩写full安全关闭。

共享schema从8c/e087到R10只新增生产车型/basis关系/唯一键等；人员、用户、FreeWorkbook/Revision/Draft、SheetImage和Inspection事实定义未变。此为源码差异，不是当前数据库已migrate声明。涉及生产统计/年度新basis的旧PASS不因此直接适用。

### 关键端到端路径（同一最终候选集成环境）

分母K=9，已通过Q=5，Q/K=5/9=55.56%。E93/E99两份Office基准按各自既有原生操作和受影响新尾段闭合E2E-03；E79补齐同准确颜色/基地项目正式链及当前查询桥接，E2E-06本机技术PASS；E2E-04按E61同源数据与R22导航增量闭合；E2E-01按E44/E48原链限定复用；E2E-07按E23/E24/E46/E47/E50/E51同项目/原任务、多版本连续本机链闭合，真实时序和输入差异明确记录，不冒称一次浏览器会话/同一制品重演。每条起点/动作/终点须有集成记录，未受影响输入可限定复用、缺失/受影响步骤须实做；E2E-09仍限精确正式目标，所有者最终接收另记。

| E2E ID | 出处 | 起点与关键动作 | 结束通过条件 | 依赖断言 | 当前结果/证据 | 下一动作/依赖/责任 |
|---|---|---|---|---|---|---|
| E2E-01 | S1:A01,A12 | 原生两成员登录→同一人共维→停用/归档名单/旧作者→返回 | 同一人员ID/作者/访问边界正确，无重复登录授权 | A01-01 A01-02 A01-03 A01-04 A12-03 | PASS；E44实际两成员/同ID共维与生命周期/返回，E48限定边界补证；28相关源/36证据独审可复用至0c20c56 | 已满足本机限定完整链；原账号与无账号联系人两个fixture不混同，不冒称R18新GUI或生产接收 |
| E2E-02 | S1:A02,A03,A04,A06,A08 | 登录→W多表结构/格式/图片编辑→正式回执→关浏览器→重登→必要草稿恢复 | 同一本完整内容/图/顺序保留，未提交状态不误清 | A02-01 A02-02 A02-03 A02-04 A02-05 A02-06 A03-01 A03-02 A03-03 A03-04 A03-05 A04-01 A06-01 A06-02 A08-01 A08-02 A08-03 A08-04 A08-05 | NOT_VERIFIED；无R10完整链，原局部证据见依赖条目 | RUN后Codex按本链补未验/受影响动作并完整读回；复用原样本和已满足局部，不机械重放 |
| E2E-03 | S1:A05 | O1/O2各自基准→系统编辑/保存/导出→实际Excel→回导保存刷新 | 值类型/真重算/日期/合并样式/图片在约定范围保持或明确转换，无静默丢失 | A05-01 A05-02 A05-03 A05-04 A05-05 A05-06 | PASS；E93 O1 v4→a745…→真实Excel13/22→641ce…v2保存刷新/PNG/有效100和88已独审；E99在3941用正确O2 db091…新导入703898c1…v2，四小数/14格/样式/合并/高宽/图原件均保持，独审a276422b… | E08原生打开/人工另存、E40/E42系统编辑/SUM与Excel只读查看/回导、E68日期、E70/E84四值按未变输入复用；新3941只补O2读取持久化，O1整数回归/源码差异支持复用。旧68px与8755…v2取整失败保留；不声称同一制品重演所有Office或产品签收 |
| E2E-04 | S1:A07,A14 | 明确映射四域→业务详情/日志→产量stable-ID修订→汇总导出→年度依据 | 资料不二次手录、27→25→26、唯一依据及年度证据一致 | A07-01 A07-02 A07-03 A07-04 A07-05 A08-05 A14-01 A14-02 A14-03 A14-04 | PASS；E61绑定R21同源v2/3事实stable IDs/27→25→26/三数值导出/13月26及旧20/19不可变；R22实际详情跳转/关闭返回/刷新与完整DTO深等；其他三域按E43/E44/E45/E56受影响范围复用 | 已满足本机多版本连续链；R21丢ID失败及R22弹窗内同URL链接不关闭均保留，正常关闭可返回；不代表正式环境或所有者接收 |
| E2E-05 | S1:A09,A10,A11 | 原合成项目现状态→未覆盖建项/并行/费用及适用任务动作（一次流程写同op重试核节点/审计仅一次）→材料保存返回→标准/整改历史核对→后续适用节点读回 | 原项目/标准/颜色/有效费用与未完支线保留，前置门禁/返回正确 | A08-05 A09-01 A09-02 A09-03 A10-01 A10-02 A10-03 A11-01 A11-02 A11-03 | NOT_VERIFIED；无R10完整链，原局部证据见依赖条目 | RUN后Codex按本链补未验/受影响动作并完整读回；复用原样本和已满足局部，不机械重放 |
| E2E-06 | S1:A12；2026-10-24 PM文义勘误（见下） | 两成员维护同场多色多车周评→保存修改读回→其中准确颜色/基地对应项目查询原台次子集→该项目自身正式评审逐条确认、明确阶段完成与历史保护 | 活动/项目/评审/任务分别保留真实ID；查询统计准确、签月/完成门禁正确、未抽检无假逾期；不要求两类活动同ID、不称查询自动推进 | A12-01 A12-02 A12-03 A01-03 | PASS；E53原双人多色活动/按属性复用 + E79同准确青州白项目正式评审链；独审d6f848cf… | 原活动cmvm5a7…白v2/蓝v3保持；当前白色范围3活动4台次2车；正式单色活动cmvnxx…显式关联同项目reviewcmvnxu…，草稿阻阶段、确认/明确完成201与历史保留。不同活动ID按PM勘误，不声称查询自动推进 |
| E2E-07 | S1:A13; S4 | DRAFT/ORDERED→首批/后批到货→试验报告/任务完成→受控提醒可见/去重→自动触发 | 真实轮次/日期/半年锚点及人员提醒一致，不以手动扫描代自动 | A13-01 A13-02 A13-03 A13-04 A13-05 A13-06 | PASS；E23/E24原到货报告、E46真实自然timer/双成员/去重、E47原完成及保存、E50当前PG负向、E51 R18历史返回以同项目/原task与不变规则绑定 | 已满足约定本机多版本连续链；实际为提醒早于完成，R18只读复验；不重开已完成任务/不重复上传，不代正式环境或所有者签收 |
| E2E-08 | S1:A15; S5:§1 | 完整离线包→独立主机/VM→备份恢复DB+对象→原账号/业务/媒体→新写→应用重启 | 对应候选/数据身份一致、原源不覆盖、无第三方身份/mock依赖 | A15-04 A15-05 A15-06 A15-08 A15-09 A15-10 | NOT_VERIFIED；无R10完整链，原局部证据见依赖条目 | RUN后Codex按本链补未验/受影响动作并完整读回；需独立目标环境 |
| E2E-09 | S1:A15; S5:§1,12 | 有效条件/授权→精确正式HTTPS版本核对→原生登录→代表已定义业务/文件/保存返回→预先定义的所有者代表路径 | 正式目标技术验证完成，目标域名/实例版本和真实业务可用、现场限制透明；最终产品接收另由A15-12记录，技术链PASS不以所有者最终接收为前提 | A15-01 A15-03 A15-05 A15-06 A15-07 A15-08 A15-11 | NOT_VERIFIED；无R10完整链，原局部证据见依赖条目 | RUN后Codex按本技术链补未验/受影响动作并完整读回；最终接收另按A15-12执行，不是本链前置 |

### 2026-10-24 PM文义勘误：E2E-06对象边界

已实际读取获准会话「轻卡定制色验收目标」的PM反馈 `88733f72-687f-4eb7-8def-b80cbd33ad66`；[原始回读](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r20-pm-feedback-read-r01.json) SHA256 `a4cf7621121d7f5fd37d368c358bf979385ad2ac2d019defe8b1aca89fded315`。此为依据原S1的执行文字勘误，不是新增产品功能、权限批准或人类验收。

保留原句：A12-02最短下一动作曾为“Codex与A12-01同活动补确认/完成负向及签月保护；不把活动号当验收”；E2E-06原执行描述为“两成员→一场多色多车实际周评→修改→对应颜色项目统计→阶段确认/完成”，可观察条件为“实际抽检同ID、统计和签月/完成门禁正确、未抽检无假逾期”。原快照[before-ROUTE_ACCEPTANCE_MATRIX.md](../../var/truck-color-v1-20261020/final-execution-20261024-r01/r20-a12-checkpoint-r01/before-ROUTE_ACCEPTANCE_MATRIX.md) SHA256 `f2e7aceef3775963bc5af243d59d13b99ef23baeb218b49e2d76a38ce2a106e4`。

现明确两类对象可以不同活动ID，但必须以准确colorId/baseId连接到同一对应项目上下文：多色活动证明共维、台次/图/作者及正确查询子集；正式评审证明该项目任务/标准下的逐条确认、缺确认阻断、明确阶段完成与历史保护。不得以查询代关联、重复手抄原台次、放宽linkReview、修改既有历史或制造同ID。A12断言、签月保护、权限/门禁与74 MUST、9条链分母均不变；该勘误时点E2E-06仍PARTIAL、整链2/9；E61时点闭合E2E-04后总链3/9。后续E79已实际补齐上述同项目连接与正式阶段，现E2E-06本机PASS、总链4/9；原勘误及历史PARTIAL保留。

[限定现状与合法后续路径](../../var/truck-color-v1-20261020/final-execution-20261024-r01/a12-e2e06-context-plan-r20-r01/plan.json) SHA256 `4201219027abdc3ef56d1800ac5abda7c7f30a231967725f26fd011e9171a9bf`：09:06:39Z只读确认白项目匹配原白台次但仍03 READY，无样件/板/评审；已完成A11精确颜色/基地仅旧单色活动，不能直接接原多色链。此计划不是实际完成证据。


### 当前必需数据库/Redis属性与真实入口（只列、不执行）

原子分母不按下列文件或历史293个SKIP计数。核心属性必须有适用真实PG/Redis证据，支持入口已由同属性主入口充分覆盖可按输入逐条复用；不是18个文件机械全重跑。旧作者PG完整receipt缺的范围明列，不能以root单测/mock代替。下列仅将现有入口/guard映射到MUST断言，命令均为模板未执行。PG统一前缀 `pnpm --filter @feishu-timeline/api exec vitest run`，只可在原guard允许的批准专用一次性目标；不得将材料库/生产库URL套入。有的文件没有本地allowlist，执行前须额外核对目标属于批准的可销毁隔离库，不能因源文件少guard就扩权。Redis同理，不启动资源查表。

| 门禁 | 关联MUST/属性 | 实际文件（接上述命令） | 环境变量名/现有隔离guard | 已有证据/缺口/本次状态 |
|---|---|---|---|---|
| D01 | A09-01 A09-03；source/identity/hue separation, exact import replay, current authorization, CAS and audit rollback | [`src/modules/color-register/color-register.postgres.integration.spec.ts`](../../apps/api/src/modules/color-register/color-register.postgres.integration.spec.ts) | `COLOR_REGISTER_TEST_DATABASE_URL`；postgres协议/loopback、库名含color_register_test，另有runner精确owned空库/资源guard，禁止默认materials/production。 | PASS（本属性，限16f/R20）：E58绑定f323e51原执行21PASS/0FAIL/0SKIP及输入差异；原receipt/log/工具/环境/源逐项对应，非同次全候选PG。 |
| D02 | A10-02；same-round parallel07 immutable fanout/standard ancestry, issued version, ambiguity and concurrent invalidation | [`src/modules/reviews/review-standard-parallel.postgres.integration.spec.ts`](../../apps/api/src/modules/reviews/review-standard-parallel.postgres.integration.spec.ts) | `REVIEW_PARALLEL_TEST_DATABASE_URL`；127.0.0.1:55462/v1_production_model_final_20261020 | PASS（本属性，限16f/R20）：E58绑定f323e51原执行12PASS/0FAIL/0SKIP及输入差异；原receipt/log/工具/环境/源逐项对应，非同次全候选PG。 |
| D03 | A10-01；create/workflow/audit atomicity, same-key concurrent replay, rollback and inactive owner | [`src/modules/projects/projects.create-postgres.integration.spec.ts`](../../apps/api/src/modules/projects/projects.create-postgres.integration.spec.ts) | `PROJECTS_POSTGRES_TEST_DATABASE_URL`；Only explicit URL; file has no host/database allowlist. External owned disposable-target guard required. | PASS（本属性，限16f/R20）：E58绑定16f160b原执行7PASS/0FAIL/0SKIP及输入差异；仅测试准入fixture修正；原4FAIL保留，enqueue为stub。 |
| D04 | A11-01 A11-02；exterior re-review, paid/unpaid fact retention, pending barriers, CAS/withdrawn member, rollback, cabin separation | [`src/modules/reviews/exterior-rectification.postgres.integration.spec.ts`](../../apps/api/src/modules/reviews/exterior-rectification.postgres.integration.spec.ts) | `RECTIFICATION_TEST_DATABASE_URL`；127.0.0.1:55460/free_workbook_drafts_[a-f0-9]{10} | PASS（本属性，限16f/R20）：E58绑定f323e51原执行9PASS/0FAIL/0SKIP及输入差异；原receipt/log/工具/环境/源逐项对应，非同次全候选PG。 |
| D05 | A08-05 A11-01 A11-02；preserve technical/fee facts, duplicate reject serialization, fresh14 and old performance evidence boundary | [`src/modules/workflows/rework.postgres.integration.spec.ts`](../../apps/api/src/modules/workflows/rework.postgres.integration.spec.ts) | `RECTIFICATION_TEST_DATABASE_URL OR R28_TEST_DATABASE_URL`；first:55460/free_workbook_drafts_[a-f0-9]{10}; fallback:55449/r28_recovered; always127.0.0.1 | PASS（本属性，限16f/R20）：E58绑定f323e51原执行9PASS/0FAIL/0SKIP及输入差异；原receipt/log/工具/环境/源逐项对应，非同次全候选PG。 |
| D06 | A12-01；actual sampling without12 fictional months, explicit links, multi-color/vehicle edit stats, archived participants; imports changed reminder code | [`src/modules/inspections/weekly-applicability.postgres.integration.spec.ts`](../../apps/api/src/modules/inspections/weekly-applicability.postgres.integration.spec.ts) | `PERFORMANCE_ARRIVAL_TEST_DATABASE_URL`；127.0.0.1:55461/v1_performance_20261020 | PASS（本属性，限16f/R20）：E58绑定0c20c56原执行6PASS/0FAIL/0SKIP及输入差异；原receipt/log/工具/环境/源逐项对应，非同次全候选PG。 |
| D07 | A12-02；explicit actual-record confirmation/stage completion, legacy rows, same-period existing second review, signed date guard | [`src/modules/reviews/visual-review-v1.postgres.integration.spec.ts`](../../apps/api/src/modules/reviews/visual-review-v1.postgres.integration.spec.ts) | `PERFORMANCE_ARRIVAL_TEST_DATABASE_URL`；127.0.0.1:55461/v1_performance_20261020 | PASS（本属性，限16f/R20）：E58绑定0c20c56原执行16PASS/0FAIL/0SKIP及输入差异；CLEAN元数据不代真实上传扫描。 |
| D08 | A12-03；disabled/re-enabled profile eligibility with historical authors preserved | [`src/modules/inspections/inspection-participants.postgres.integration.spec.ts`](../../apps/api/src/modules/inspections/inspection-participants.postgres.integration.spec.ts) | `LIGHT_TRUCK_FACTS_TEST_DATABASE_URL`；127.0.0.1:55438/light_truck_facts_test_* | PASS（本属性，限16f/R20）：E58绑定16f160b原执行3PASS/0FAIL/0SKIP及输入差异；仅历史停用参与者测试合同修正；原1FAIL保留。 |
| D09 | A12-01；inclusive natural-week DB filtering, same stat scope, vehicle dedupe, CAS/date editing, authorization | [`src/modules/inspections/weekly-window.postgres.integration.spec.ts`](../../apps/api/src/modules/inspections/weekly-window.postgres.integration.spec.ts) | `WEEKLY_INSPECTION_TEST_DATABASE_URL`；127.0.0.1:55438/free_workbook_design_20261019 | PASS（本属性，限16f/R20）：E58绑定f323e51原执行5PASS/0FAIL/0SKIP及输入差异；原receipt/log/工具/环境/源逐项对应，非同次全候选PG。 |
| D10 | A13-01 A13-02；draft/order no invented arrival, concurrent first anchor, current-round audit rollback, persisted due and reminders; imports changed reminder service | [`src/modules/workflows/performance-arrival.postgres.integration.spec.ts`](../../apps/api/src/modules/workflows/performance-arrival.postgres.integration.spec.ts) | `PERFORMANCE_ARRIVAL_TEST_DATABASE_URL`；127.0.0.1:55461/v1_performance_20261020 | PASS（本属性，限16f/R20）：E58绑定0c20c56原执行13PASS/0FAIL/0SKIP及输入差异；原receipt/log/工具/环境/源逐项对应，非同次全候选PG。 |
| D11 | A13-05 A13-06；two approved roles-empty recipients, future activation, Shanghai due/dedupe, revocation/history, explicit legacy facts | [`src/modules/notifications/team-reminders.postgres.integration.spec.ts`](../../apps/api/src/modules/notifications/team-reminders.postgres.integration.spec.ts) | `TEAM_REMINDERS_TEST_DATABASE_URL`；127.0.0.1:55461/v1_performance_20261020 | PASS（本属性，限16f/R20）：E58绑定f323e51原执行5PASS/0FAIL/0SKIP及输入差异；原receipt/log/工具/环境/源逐项对应，非同次全候选PG。 |
| D12 | A13-05 A13-06；cross-project/epoch concurrency, history/visibility, failed checkpoint replay, Shanghai boundary | [`src/modules/notifications/task-reminders.postgres.integration.spec.ts`](../../apps/api/src/modules/notifications/task-reminders.postgres.integration.spec.ts) | `R28_TEST_DATABASE_URL`；127.0.0.1:55449/r28_reminders | PASS（本属性，限16f/R20）：E58绑定f323e51原执行9PASS/0FAIL/0SKIP及输入差异；9项=8DB+1纯上海日期；只允许精确role.updatedAt既定变化。 |
| D13 | A14-01 A14-02 A14-03；27→25→26, exact old TOTAL replay, mixed basis/CAS lock, unknown0,13months20, coherent SQL snapshot, live approval | [`src/modules/production-facts/production-model.postgres.integration.spec.ts`](../../apps/api/src/modules/production-facts/production-model.postgres.integration.spec.ts) | `PRODUCTION_MODEL_TEST_DATABASE_URL`；127.0.0.1:55462/{v1_production_model_20261020,v1_production_model_final_20261020} | PASS（本属性，限16f/R20）：E58绑定823b1ea原执行10PASS/0FAIL/0SKIP及输入差异；原receipt/log/工具/环境/源逐项对应，非同次全候选PG。 |
| D14 | A14-02；same SQL snapshot for total and grouped quantities across concurrent commits | [`src/modules/production-facts/production-statistics-snapshot.postgres.integration.spec.ts`](../../apps/api/src/modules/production-facts/production-statistics-snapshot.postgres.integration.spec.ts) | `LIGHT_TRUCK_FACTS_TEST_DATABASE_URL`；127.0.0.1:55438/light_truck_facts_test_* | PASS（本属性，限16f/R20）：E58绑定823b1ea原执行1PASS/0FAIL/0SKIP及输入差异；原receipt/log/工具/环境/源逐项对应，非同次全候选PG。 |
| D15 | A14-03 A14-04；13month19/20/21, missing/early/revoked, CAS/audit rollback and actual HTTP/old-exit binding | [`src/modules/color-register/color-annual-review.postgres.integration.spec.ts`](../../apps/api/src/modules/color-register/color-annual-review.postgres.integration.spec.ts) | `COLOR_ANNUAL_REVIEW_TEST_DATABASE_URL`；127.0.0.1:55438/personnel_sheet_design_20261019 | PASS（本属性，限16f/R20）：E58绑定823b1ea原执行11PASS/0FAIL/0SKIP及输入差异；HTTP内存session不代Redis或密码全链。 |
| D16 | A03-01 A08-01 A08-02 A08-04；actual persistence/history/CAS, same-op replay/restore, authorization and CLEAN image binding | [`src/modules/workbooks/workbooks.postgres.integration.spec.ts`](../../apps/api/src/modules/workbooks/workbooks.postgres.integration.spec.ts) | `WORKBOOK_TEST_DATABASE_URL OR WORKBOOK_DRAFT_TEST_DATABASE_URL`；127.0.0.1:55438/free_workbook_* OR55460/free_workbook_drafts_* | PASS（本属性，限16f/R20）：E58绑定9b53633原执行8PASS/0FAIL/0SKIP及输入差异；原9b536/53迁移8PG；D16+D17共21PG、另25规则/body。服务/模型/锁与旧53迁移不变，54仅生产事实；新filter另有纯规则，不称当前54迁移新跑工作簿PG。 |
| D17 | A03-03 A08-04；draft/formal atomicity, quotas, lost response, replay, live admission/CLEAN | [`src/modules/workbooks/workbook-drafts.postgres.integration.spec.ts`](../../apps/api/src/modules/workbooks/workbook-drafts.postgres.integration.spec.ts) | `WORKBOOK_DRAFT_TEST_DATABASE_URL`；127.0.0.1:55460/free_workbook_drafts_* | PASS（本属性，限16f/R20）：E58绑定9b53633原执行13PASS/0FAIL/0SKIP及输入差异；原9b536/53迁移13PG；原46=21PG+25规则/body，不称当前54迁移/新filter/GUI已重跑。 |
| D18 | A01-02 A15-06；actual authenticated sessions/one-use+rate/queue primitive, bounded uncertain write/no automatic resend, reconnect | [`src/infra/redis/redis.integration.spec.ts`](../../apps/api/src/infra/redis/redis.integration.spec.ts) | `REDIS_SECURITY_TEST_URL`；password-protected127.0.0.1; port must not6379; dedicated disposable Redis only | PASS（本属性，限16f/R20）：E58绑定f323e51原执行3PASS/0FAIL/0SKIP及输入差异；全新密码Redis真实暂停/不确定写不自动重放/重连，非materials6399。 |

原HTTP/PG E01/E03–06/E11–13仍只证明原范围；E58已逐D01–D18核原始执行与16f/R20适用性。D16/17原46=21PG+25规则/body，不是46PG或当前54迁移新跑；原5FAIL与修正两测试10PASS分列，不把新剪贴板输入视为已验。

### G3、候选CI及唯一Finding门槛

本机G3入口lint/typecheck/test、Web/API build和prisma:validate；真实DB/Redis按上述guard。E52精确0c20独立clean-clone四命令0/Web1017/API1808+303SKIP为历史；E67精确e3e/R23新G3为Web1101/API1817+305SKIP，lint/types/prisma均0并有独审。真实PG/Redis沿E58及后继精确输入复用，required CI另验；189旧937/1756/293SKIP及旧重叠目标数保留历史，不相加或转作新PG PASS。

候选CI文件[ci.yml](../../.github/workflows/ci.yml)，工作流现配置自动verify/security-source及workflow_dispatch-only的playwright-smoke；本次未查询GitHub分支保护的required-check设置，不能冒称组织配置。原合同必需候选门禁对应前两job和实际制品检查，旧main38866594479 failure不是R10结论；R10 CI NOT_VERIFIED。

| job | 实际step入口 | 适用性与当前缺口 |
|---|---|---|
| verify | **Initialize CI evidence and validate execution platform**：`node scripts/security/ci-evidence.mjs init "$GITHUB_JOB"`<br>**Install dependencies**：`pnpm install --frozen-lockfile`<br>**Lint**：`pnpm lint`<br>**Typecheck**：`pnpm typecheck`<br>**Test**：`pnpm test ; PYTHONDONTWRITEBYTECODE=1 timeout 120s python3 -m unittest discover -s scripts/deploy/gce-host -p 'test_*.py' -v ; PYTHONDONTWRITEBYTECODE=1 timeout 120s python3 -m unittest discover -s scripts/deploy/tests -p 'test_*.py' -v`<br>**Build Web**：`pnpm --filter @feishu-timeline/web build`<br>**Reject Development Build Artifacts**：`bash scripts/security/check-production-build-artifacts.sh`<br>**Build API**：`pnpm --filter @feishu-timeline/api build`<br>**Prisma Validate**：`pnpm --filter @feishu-timeline/api prisma:validate`<br>**Compose Config**：`docker compose --env-file deploy/env/staging.env.example -f deploy/compose.staging.yml config >/tmp/compose-config.txt`<br>**Build API Docker Image**：`docker build --platform linux/amd64    --build-arg BUILD_SOURCE_COMMIT="$BUILD_SOURCE_COMMIT"    --build-arg BUILD_SOURCE_TREE="$BUILD_SOURCE_TREE"    --build-arg BUILD_RELEASE="$BUILD_RELEASE"    --build-arg BUILD_TIME="$BUILD_TIME"    -t feishu-timeline-api:ci    -f apps/api/Dockerfile    .`<br>**Build Web Docker Image**：`docker build --platform linux/amd64    --build-arg BUILD_SOURCE_COMMIT="$BUILD_SOURCE_COMMIT"    --build-arg BUILD_SOURCE_TREE="$BUILD_SOURCE_TREE"    --build-arg BUILD_RELEASE="$BUILD_RELEASE"    --build-arg BUILD_TIME="$BUILD_TIME"    -t feishu-timeline-web:ci    -f apps/web/Dockerfile    .`<br>**Scan Production Container Images**：`bash scripts/security/scan-production-images.sh feishu-timeline-api:ci feishu-timeline-web:ci`<br>**Collect redacted CI evidence**：`node scripts/security/ci-evidence.mjs collect "$GITHUB_JOB"` | Automatically configured for push(main/feat/**/codex/**),pull_request,workflow_dispatch. Code/types/unit/build/Prisma/compose/Linux images+scan. No configured PG/Redis service or TEST_* URL. No claim about branch-protection required-check settings. |
| security-source | **Initialize CI evidence and validate execution platform**：`node scripts/security/ci-evidence.mjs init "$GITHUB_JOB"`<br>**Install dependencies**：`pnpm install --frozen-lockfile`<br>**Test Security Gates**：`bash scripts/security/tests/security-gates.test.sh ; node --test scripts/security/tests/ci-evidence.test.mjs scripts/security/tests/integrity-allowlist.test.mjs scripts/security/tests/braces-depth.test.mjs scripts/security/tests/patched-sca.test.mjs`<br>**Secrets — Current Tree and Git History**：`bash scripts/security/run-secrets-scan.sh`<br>**SAST — Authored Candidate Sources Only**：`bash scripts/security/run-sast.sh`<br>**SCA — Full and Production Graphs with Exact Local Remediation**：`bash scripts/security/run-sca.sh`<br>**Collect redacted CI evidence**：`node scripts/security/ci-evidence.mjs collect "$GITHUB_JOB"` | Same automatic triggers. Source/security-gate tests,secrets current/history,SAST,SCA. Source-only focused Finding PASS does not replace this job or full clearance. |
| playwright-smoke | **Install dependencies**：`pnpm install --frozen-lockfile`<br>**Install Playwright Chromium**：`pnpm --filter @feishu-timeline/web exec playwright install --with-deps chromium`<br>**Run Playwright Smoke**：`pnpm playwright:test` | workflow_dispatch only. Legacy local mock/fixture smoke; not native-account R10 acceptance, trueSafari or restored-materials runtime proof. |

verify未配置PG/Redis service或各TEST_* URL，`pnpm test`绿不自动填掉数据库skip。playwright-smoke的`pnpm playwright:test`经web/scripts/playwright-runner.mjs会infra:up、migrate deploy、seed，playwright.config.mjs使用dev API/Web与mock/fixture（AUTH_MOCK_ENABLED/NEXT_PUBLIC_ENABLE_MOCK_LOGIN）。它不是原生账号R10、真实Safari或恢复材料库验收，当前受控目标边界下禁止执行；若未来保留自动化smoke只作其原范围辅助，不据此降低原生合同。

安全状态只读引用S11：`R28-V1-XLSX-NAMESPACE-BOUND-001` severity保持medium、status fixed_diff_verified、targeted/affected/diff pass、full_regression pending、closure=null。已有130/20/59与合法双输入parser、固定合成输入loadCalls=0精确绑定01b4，未执行OOM。完整关闭依既有G1/G2/G4_DIFF/适用G4_FULL与最终candidate/runtime/Office证据、审查/发布生命周期，不由本次文档更改。当前full授权/范围/预算和环境不足不能伪造结论；安全Ledger既有24项schema错误与旧main失败单列背景，不新设“清理全部历史账本”产品义务、不改schema或Finding。生产扫描VM保盘停机及新附件不可用是明确外部依赖；正式附件MUST若受阻在A15-11保留，绝不绕扫描或静默降级。

### 10组P0 / 5组原V1必需P1与执行队列

这些是原子条目的工作分组，不是新增分母或漏洞数量；同一个ID在多个分组出现只计一次。组关闭条件是关联未闭合断言全部PASS并满足该组可观察条件。当前P0组6/10关闭、4/10未关闭；5组P1中1关闭、4未关闭；包含环境/证据/发布/签收障碍，不是10个已确证P0代码漏洞，当前阻断性漏洞完整总数没有新全量审计结论。已确认具体XLSX缺陷已修且focused验证，剩余full/runtime门槛；环境/证据/权限不足另列于各依赖。P2只含三条OPTIONAL和无额外投入的SaveAs自动工具/非必需装饰，不进入V1完工。

| 分组 | 模块/缺口 | 唯一矩阵ID | 关闭的可观察条件 | 依赖/复用及责任人下一动作 |
|---|---|---|---|---|
| P0-01 | 当前候选运行身份（新目标已关闭） | A15-04 A15-05 | E76的R25不可变构建、四端四身份、新PG/Redis/Clam及loopback监听与E77正常原生成员登录/重启读回一致 | E71原API停写和旧BLOCKED保留；只证明新https://localhost:45464，不代CI/完整离线包/正式HTTPS |
| P0-02 | DB/Redis与G3（属性证据已关闭） | A15-06 | 定义属性有适用真实证据，无关键依赖skip；不机械293全跑 | E58真实属性适用性与E67 R23新G3独审成立，原5FAIL/303SKIP和新305SKIP保留；原依赖已恢复但缺失计划导致API暂停；历史属性与当前可用性分列，CI/安全/恢复独立 |
| P0-03 | 正常保存/Office | A03-01 A05-01 A05-02 A05-03 A05-04 A05-05 A05-06 | 完整保存关浏览器重登和O1/O2两基准链、真实重算/日期/实际图位闭合 | CLOSED（限定本机）：E100同本正式v2→所有者正常退出Chrome重开→根正常重登完整读回，独审49dc9ee6…；E93/E99及未变原生Office连续链成立。A03-05/E2E-02仍独立未闭，不代所有者签收 |
| P0-04 | 实际周评/门禁（原子条件已关闭） | A12-01 A12-02 | E53双成员多色活动及查询统计、同TASK二人确认/阶段门禁；E50当前适用legacy签月和首签保护均满足 | 本组局部已满足；E79另以同项目桥接实证闭合E2E-06，不由原子计数自动提升整链 |
| P0-05 | 产量/唯一依据/年度（已关闭） | A07-04 A14-01 A14-02 A14-03 A14-04 | 实际apply、27→25→26、unknown/0/唯一依据/13月20与19既有规则正确 | E36/E41/E43/E45已满足局部，E61闭合本机E2E-04；不推整体完成 |
| P0-06 | CI/安全候选资格 | A15-07 A15-08 | 必需候选CI/镜像扫描、适用安全full/最终证据和生命周期满足 | E52旧0c20与E67精确R23本机双镜像/扫描各保局部；required CI及适用full/最终生命周期未闭合，按有效授权/实际条件推进，不将未检出写成全安全 |
| P0-07 | 离线/异机运行包 | A15-09 | 程序/说明/身份齐全，独立主机或VM原生账号运行重启可用 | RUN；独立获准目标/设备条件，不强加物理第二台；Codex主执行，外部/所有者只承担明确动作 |
| P0-08 | 完整备份恢复（已关闭） | A15-10 | E77 DB+本+36对象实际恢复、原账号登录/媒体/新ID写入/正常应用重启同记录读回，独审f271f719… | 限获准事故后逻辑起点、独立Lima与正常应用重启；旧缺失记录未恢复，A15-09/E2E-08另待 |
| P0-09 | 精确正式HTTPS交付 | A15-11 | 最终版本域名/upstream/镜像/数据源及真实业务/附件可用 | 外部发布准入与扫描资源限制先具体解决；不自行启VM；Codex主执行，外部/所有者只承担明确动作 |
| P0-10 | 最终所有者签收 | A15-12 | 其余73项技术/交付MUST（不含A15-12）、9条技术关键链及必需门禁和约定环境先就绪，再由李晓晨实际UAT并明确接收；此后A15-12计PASS，原范围缺陷按影响修复/复验 | HUMAN最后签收；不是继续开发许可；Codex主执行，外部/所有者只承担明确动作 |
| P1-01 | 成员/人员联动/性能提醒（已关闭） | A01-01 A01-02 A01-03 A01-04 A12-03 A13-01 A13-02 A13-03 A13-04 A13-05 A13-06 | A01四项/A12-03及A13六项均按E44/E46/E47/E48/E50/E51闭合；本机限定配置/同项目原任务链与历史保持 | 本组局部已满足；后续仅输入变化时复验，不代其他P1/P0、生产或所有者签收 |
| P1-02 | 完整编辑/草稿/图片/幂等 | A02-01 A02-02 A02-03 A02-04 A02-05 A02-06 A03-01 A03-02 A03-03 A03-04 A03-05 A06-01 A06-02 A06-03 A08-01 A08-02 A08-03 A08-04 A08-05 A08-06 | 各对应结构/格式/恢复/图和冲突断言全PASS，不能以toolbar存在代实操 | E56/E57结构/格式及操作边界已满足；复制见E59、图片三入口和结构见E60/E62/E64；支持清单代表式见E92，双模式由E101闭合，继续异步编辑与整本集成链，既有局部复用；Codex主执行，外部/所有者只承担明确动作 |
| P1-03 | 业务映射/标准/并行/整改 | A07-01 A07-02 A07-03 A07-04 A07-05 A09-01 A09-02 A09-03 A10-01 A10-02 A10-03 A11-01 A11-02 A11-03 | 只补未闭合真实动作/文案、关联/更正/并行及驾驶室失败分支 | RUN；人员/颜色/检验/整车/材料返回局部已验不重演；Codex主执行，外部/所有者只承担明确动作 |
| P1-04 | Safari/IME/性能 | A04-01 A04-02 A04-03 A04-04 A04-05 | 真实Safari系统IME和固定性能阈值达标，原Chrome正常IME有效复用 | RUN；只有具体不可自动操作才请所有者；Codex主执行，外部/所有者只承担明确动作 |
| P1-05 | 导航/四宽/参考实装 | A15-01 A15-02 A15-03 | 原14页/guide路由组件动作返回、默认/编辑/长文/加载/错误及四CSS宽按原约定可用 | RUN；旧精确返回/未改页图可复用，不重做PPT；Codex主执行，外部/所有者只承担明确动作 |

1. **当前继续（NOW/RUN）**：E95历史返回、E92代表式和E93/E99两份Office连续链已闭合；3941实际运行且独审，旧失败保留。E100/E101已闭整浏览器重开与双模式保护，继续异步编辑/dirty选择/Safari/性能/四宽及完整离线包；05/09/18未完支线保持。D01–D18/G3按逐输入适用性复用，305skip保留；required CI、full安全和正式目标按实际条件推进。
2. **运行前置已完成**：2026-10-24获准恢复原资源并运行R11。其后事故起点获准独立恢复，现已至Lima上的3941；产量/年度链、两成员周评原子、到货提醒链、E93/E99两份Office基准连续链及固定日期往返分别验；继续匹配项目整链、整本/草稿、Safari/固定性能/四宽和受影响候选门禁。每项只补未验或改变的输入，不机械重放。
3. **特定人类/外部动作**：不能自动捕获的真实Safari系统IME、到达具体候选时缺少的Git/CI/发布授权与生产扫描资源限制、最后李晓晨UAT。新独立恢复和事故后数据起点已获准，新入口证书提示已由所有者亲自处理，不重复索取；其余普通技术工作继续。

先完成其余73项技术/交付MUST（不含A15-12）、9条技术关键链及必需门禁和约定环境，再进入李晓晨实际UAT；明确接收后A15-12才计PASS，原范围缺陷按影响修复/复验。V1最终完工仍须74/74 MUST和9/9技术关键链PASS、必需交付障碍/阻断缺陷清零、必需CI/安全/恢复门槛PASS、实际交付版本一致且约定环境可用，并有所有者真实接收。v1.0已由PM核对冻结；冻结完工标准与产品签收分开，后续新增/删必需项或阈值改变须范围决定和版本记录，原范围漏项必须显式更正并重算，不能静默调整分母。

<!-- V1_BASELINE_V1_0_END -->
