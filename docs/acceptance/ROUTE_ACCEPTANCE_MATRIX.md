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
