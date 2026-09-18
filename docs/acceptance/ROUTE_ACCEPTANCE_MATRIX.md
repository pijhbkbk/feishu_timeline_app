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
