# AGENTS.md

## 0. 当前目标：GCE 站点原生账号版（2026-09-12 更新）

- 正式身份能力改为本系统用户名密码认证、本地用户目录、岗位与权限管理；飞书、Google 等第三方身份不再是注册、登录或业务操作的前提。本地认证不是 mock 或鉴权 bypass。
- 当前阶段在现有 GCE 的 `https://timeline.all-too-well.com` 交付原生账号版；本机用于开发和隔离验证。此最新目标替换此前“只交付本地离线版/暂停云端推进”；完整离线安装包暂不作为本期交付门禁。Google 仅为部署基础设施，不是应用身份提供方。
- 用户已授权本项目必要的源码/依赖/迁移变更、隔离测试、独立技术审查、提交与本人服务器上的受控备份、发布、迁移和复测；不需为这些已授权工程步骤反复确认。不向公开仓库自动披露新源码，不影响同机其他应用。模型咨询只能提供技术意见，不能替代用户、平台权限或产品负责人实际验收，不修改全局平台权限。
- 本节明确替换旧轮次、交接和任务中的“必须真实飞书登录”及与本期网站目标冲突的旧要求；历史事实、未关闭风险和仍适用的业务/安全门禁保留，不改写旧验收结论，不重建治理体系或修改全局平台权限。工作前核对相关目录的 `AGENTS.md`、`AGENTS.override.md` 和已配置的备用指令文件。
- 本期正式制品须在没有第三方身份凭据、关闭所有 mock 登录时验证注册/密码登录、业务、退出、重启和恢复；移除飞书 OAuth/JSAPI 登录入口及外部身份依赖。最终验收必须在上述精确 HTTPS 域名完成，本机结果不能代替网站已更新。
- 本地 profile 默认仅向 loopback 暴露入口并使用隔离数据与本地持久化服务；纯 HTTP 例外仅限显式 loopback-only 模式，保留 Origin/CSRF 限制。局域网/私有云共享访问必须 HTTPS，不扩大 Cookie 例外，不修改全机安全设置。

## 1. 项目目标与范围
- 目标：交付“轻卡新颜色开发项目管理系统” MVP。
- 架构：模块化单体，不做微服务。
- 主链路：项目、流程、评审、附件、日志。
- 范围内：本地原生认证、用户/岗位/权限管理、项目立项、流程流转、评审记录、附件管理、审计日志、站内通知与待办。
- 范围外：通用 BPM 引擎、复杂 BI、跨系统深度集成、低优先级配置化。

## 2. 技术栈与目录约定
- 前端：Next.js + TypeScript。
- 后端：NestJS + Prisma。
- 数据库：PostgreSQL。
- 辅助：Redis、对象存储。
- 身份与运行：本地原生认证；离线制品不激活飞书 OAuth、H5 JSAPI 或其他第三方运行依赖，迁移所需旧身份字段可保留。
- 目录固定：
  - `apps/web`：前端。
  - `apps/api`：后端。
  - `packages/shared`：共享类型、枚举、常量。
  - `apps/api/prisma`：Prisma schema 与 migrations。

## 3. 前端开发规范
- 前端只负责展示、输入、交互状态，不负责流程裁决。
- 页面按业务域分目录，不按组件堆平铺代码。
- 表单字段、枚举、状态文案优先复用 `packages/shared`。
- 所有写操作必须走后端 API，不允许前端拼流程状态。
- 上传文件只拿对象存储凭证或上传结果，不直接持久化业务关系。
- 页面必须考虑本地登录态失效、权限不足和移动端布局，不再依赖飞书容器或 JSAPI。

## 4. 后端开发规范
- 模块按领域拆分：`auth`、`projects`、`workflows`、`reviews`、`attachments`、`activity-logs`；旧 `feishu` 模块仅按迁移需要隔离保留，不作为本地运行前提。
- Controller 只做协议适配；业务规则放 Service；数据库访问收敛到 Prisma。
- 流程流转必须由后端控制。前端只能提交动作，不得直接修改阶段状态。
- 任何会改变项目状态、评审结果、流程节点的操作都必须做权限校验和状态校验。
- 关键写接口必须幂等，避免重复提交导致状态错乱。

## 5. Prisma 与数据库迁移规范
- `schema.prisma` 是唯一数据模型源，不手改线上表结构。
- 每次变更模型必须提交 migration，不允许只改 schema 不产出迁移。
- 枚举、唯一约束、外键、索引在 Prisma 中显式定义。
- 附件只存对象存储，数据库只存元数据：文件名、key、大小、类型、上传人、关联对象。
- 审计日志必须落库，不允许只打控制台日志。

## 6. 业务规则边界
- MVP 只做主链路，不为少量特殊流程提前做通用引擎。
- 流程节点可以数据化，流转规则先代码化。
- 评审是门禁，不是备注。未通过不得进入后续主节点。
- 驳回、撤回、重提必须保留完整历史，不覆盖旧记录。
- 项目关闭前，主链路节点、评审记录、附件、日志必须可追溯。

## 7. 必须放在后端的逻辑
- 流程流转判定与状态变更。
- 评审通过/驳回规则。
- 项目编号、颜色编号、业务唯一性校验。
- 权限校验、角色校验、数据范围校验。
- 审计日志生成。
- 附件元数据入库与业务对象绑定。
- 本地凭据校验、首位管理员初始化、账号恢复、岗位授权与会话生命周期；用户选择岗位不等于获得正式角色或项目权限，不得自行授予管理员或跨项目权限。

## 8. 提交前必须执行的检查命令
- `pnpm install`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm --filter web build`
- `pnpm --filter api build`
- `pnpm --filter api prisma:validate`

- 新认证、权限与迁移必须取得对应的新验证：管理员初始化、注册/密码登录、限速、改密/恢复、会话轮换与撤销、CSRF/Origin、岗位自授与跨项目越权负向、保留内部用户 ID/历史作者/业务外键的迁移及备份恢复；最终安全差异须独立审查。旧 OAuth PASS 不证明新密码登录安全，旧强制跳飞书断言应替换为本地身份合同并验证旧入口不激活。
- 保留流程状态机、服务端鉴权、并发/幂等、配额、审计与附件隔离/扫描控制。未受影响的修复按源码、依赖、配置、工具和环境的适用性依据复用验证，变化的边界重跑相关检查；不机械重跑全部历史，也不将未执行或 SKIPPED 计为 PASS。

## 9. Done 定义
- 功能可走通主流程，且无前端绕过后端改状态的路径。
- 关键写操作有权限校验、状态校验、错误提示。
- 审计日志完整可查，至少覆盖项目、流程、评审、附件四类动作。
- 附件已上传到对象存储，数据库仅保存元数据与关联关系。
- 接口、页面、数据库模型、迁移脚本保持一致。
- 本地检查命令全部通过。

## 10. 不允许做的事情
- 不允许把流程流转放到前端控制。
- 不允许删除或覆盖审计日志。
- 不允许把附件二进制存进 PostgreSQL。
- 不允许直接改数据库表绕过 Prisma migration。
- 不允许在未校验当前状态时强行推进流程。
- 不允许为了“通用性”先上复杂工作流引擎。
- 不允许把核心业务规则散落在 Controller、页面或脚本里。

## 11. 执行协议
- 以 `docs/EXECUTION_LEDGER.md` 和 `docs/rounds/R00.md` ~ `R10.md` 作为执行入口。
- 必须按轮次推进，不得跳轮，不得绕过当前轮次验收门禁。
- 每轮结束后必须更新 `docs/EXECUTION_LEDGER.md`，记录目标、范围、输入、改动文件、执行命令、验收结果、风险和下一轮决策。
- 仅当当前轮次验收全部通过、无业务歧义、无权限/数据/部署风险时，才允许自动进入下一轮。
- 如本轮失败，先本地自修复；连续 2 次仍失败则停止，并输出 blocker report。

## 12. 交付真相与产品验收永久规则

### 12.1 最高优先级判定
- 用户在精确目标 URL 上看见本轮功能，并能完成预期操作，才叫交付完成。
- 源码完成、提交推送、构建通过、服务 healthy、`/api/health` 返回 200、自动化测试通过，均不能单独证明目标站点已经更新或产品已经验收。
- 必须将以下状态分开报告，禁止用“已完成”或“已上线”混为一谈：
  - `CODE_IMPLEMENTED`
  - `LOCAL_VERIFIED`
  - `STAGING_DEPLOYED`
  - `STAGING_ACCEPTED`
  - `PRODUCTION_DEPLOYED`
  - `PRODUCTION_ACCEPTED`
  - `MAIN_MERGED`
- 未获得产品负责人明确回复 `PRODUCT_OWNER_ACCEPTED` 时，产品状态只能是 `AWAITING_PRODUCT_OWNER_CONFIRMATION`。

### 12.2 环境身份必须明确
- 每次涉及部署或验收时，必须明确记录：
  - environment；
  - 精确 URL 和 hostname；
  - 使用的数据库；
  - runtime commit（完整 40 位 hash）；
  - Web 构建、镜像 tag 和 digest；
  - API 构建、镜像 tag 和 digest；
  - Nginx upstream；
  - deployment time。
- 禁止只写“已部署 staging”“部署成功”“服务正常”。
- 没有精确 URL 的环境不得作为产品验收环境。
- `localhost`、本机 Docker staging、隔离 staging 和 `timeline.all-too-well.com` production 必须明确区分；localhost 截图不得证明公网或生产部署完成。

### 12.3 `DEPLOYED` 的严格定义
- 只有同时满足以下条件，才允许使用 `DEPLOYED`：
  1. 目标服务器实际运行预期 runtime commit；
  2. 目标 Web/API 构建或镜像身份与报告一致；
  3. Nginx upstream 指向正确的 Web/API 服务；
  4. 数据库 migration 状态正确；
  5. 精确用户 URL 可访问；
  6. 浏览器加载的是新构建和新静态资源；
  7. 页面发出预期 API 请求；
  8. 页面真实显示本轮新增功能；
  9. 正式页面不存在旧 Placeholder；
  10. 已保存截图、网络、控制台和交互证据。
- 任一条件未满足时，只能使用：
  - `CODE_IMPLEMENTED`
  - `BUILD_COMPLETE`
  - `DEPLOYMENT_ATTEMPTED`
  - `DEPLOYMENT_UNVERIFIED`
  - `NOT_DEPLOYED`
- 如公开页面仍是 Placeholder，严禁选择 `FULLY_DEPLOYED`。

### 12.4 运行版本证明
- 应提供非敏感构建信息，至少包括：
  - `runtimeCommit`
  - `buildTime`
  - `release`
- API `/api/health` 应返回上述非敏感运行元数据；Web 应能通过只读 build metadata 获取同一信息。
- 运行元数据不得返回 Secret、完整环境变量、数据库连接串或内部地址。
- 部署后必须验证：
  `expectedCommit == API runtimeCommit == Web runtimeCommit == target server HEAD`。

### 12.5 页面完成定义与 Placeholder 红线
- 页面只有同时满足以下条件才算完成：
  1. 正式路由存在且指向预期组件；
  2. 不是 Placeholder、Skeleton 或静态截图；
  3. 使用真实 API 或本轮明确规定的数据源；
  4. 加载态、空态和错误态完整；
  5. 预期操作可实际执行；
  6. 保存结果可重新读取；
  7. 权限由后端校验；
  8. 审计日志可追踪；
  9. 1440、1024、390 三档符合本轮要求；
  10. 产品负责人实际确认。
- 只存在标题、导航、卡片或骨架时，状态必须为 `SKELETON_ONLY / NOT_IMPLEMENTED`。
- 以下文案或等价内容出现在本轮正式验收页面时直接判为 FAIL，除非该页面明确排除：
  - 已创建骨架
  - 后续接入
  - 后续按权限展示
  - Coming soon
  - Placeholder
  - TODO
  - Demo only
  - 暂未实现
- 每轮必须运行并记录 Placeholder 扫描；测试文本如需保留，必须显式加入白名单：
  `rg -n "已创建骨架|后续接入|后续按权限|Coming soon|Placeholder|TODO|Demo only|暂未实现" apps/web`

### 12.6 多路由验收矩阵
- 任何声称多个页面完成的轮次，必须生成或更新：
  `docs/acceptance/ROUTE_ACCEPTANCE_MATRIX.md`。
- 每个变更路由至少记录：
  - URL；
  - route component；
  - API endpoints；
  - required role；
  - expected data；
  - expected action；
  - screenshot；
  - browser result；
  - PASS/FAIL。
- 任一路由 FAIL 时，禁止声称整组页面完成。

### 12.7 真实数据和受控写操作证据
- 声称“接入真实数据”时，必须提供：
  1. 浏览器 Network 请求；
  2. API HTTP 状态；
  3. 响应数据来源；
  4. 页面真实数据行；
  5. 空数据状态；
  6. 错误状态；
  7. 数据库或服务端证据。
- 没有真实 API 请求的页面不得声称已经接入真实数据。
- 声称“受控写操作已实现”时，必须提供：
  1. 写请求；
  2. 变更前值；
  3. 变更后值；
  4. 再读取结果；
  5. 审计记录；
  6. 无权限负向结果；
  7. 幂等或并发结果。

### 12.8 精确域名浏览器验收
- 部署后必须使用真实浏览器打开最终目标 URL；本地离线版以明确记录的本机 URL/hostname 验收，远端发布必须使用其实际目标域名，不得用 localhost 代替。
- 每个变更路由必须：
  1. 使用目标 hostname；
  2. 硬刷新或禁用缓存；
  3. 记录完整 URL；
  4. 记录页面对应 runtime commit；
  5. 检查 console/page error；
  6. 检查 Network；
  7. 保存截图；
  8. 完成真实操作；
  9. 刷新后确认结果仍存在。
- 恢复既有公网生产验收时，必须在 `https://timeline.all-too-well.com` 的实际路由下完成。本机 URL 证据只代表所记录的本地环境，可用于本地离线版验收，不能证明公网生产已改变。

### 12.9 V1/V2、旧组件与 Feature Flag
- 每个旧页面或旧组件必须在路由清单中标记：
  - `REPLACED`
  - `LEGACY_ONLY`
  - `REMOVED`
  - `STILL_ACTIVE`
- 新页面实现后，必须验证正式路由不再引用旧 Placeholder。
- 禁止新旧导航同时出现。
- 禁止同一正式 URL 因 Feature Flag、角色或构建环境无意加载不同产品页面。
- 每个 Feature Flag 必须记录默认值、local 值、staging 值、production 值、读取时机和回滚方式。
- `NEXT_PUBLIC_*` 属于构建时固化配置；修改后必须重新构建 Web，不能只重启服务。

### 12.10 Git 与部署版本纪律
- runtime code commit 和 evidence commit 必须分开记录。
- 禁止 `git add -A`；只允许显式暂存本轮文件。
- 禁止提交 `.env`、`node_modules`、`.next`、`dist`、`test-results`、Cookie、Session、数据库备份和未脱敏日志。
- 本地离线交付从干净、已提交的本地不可变 commit 构建，记录 source/tree 与制品摘要，不要求推送或远端可解析；远端部署仍必须从已经推送且远端可解析的不可变 commit 构建。
- 禁止交付脏工作树或未提交代码构建的版本。
- 部署前后必须分别记录 target branch、target commit、remote commit 和运行端 HEAD；纯本地交付的 remote commit 明确记录为不适用，不访问远端补证。

### 12.11 测试与产品验收不得互相替代
- 以下结果不能单独证明产品通过：
  - lint PASS；
  - typecheck PASS；
  - unit test PASS；
  - build PASS；
  - Playwright 元素存在；
  - service healthy；
  - API health 200；
  - Codex 自行视觉评分。
- 自动化技术门禁通过后，仍须提交精确部署证据并等待产品负责人实际操作确认。
- Codex 不得自行宣布产品验收通过。

### 12.12 Bug 修复协议
- 修复任何 Bug 必须依次执行：
  1. 在原失败环境和 URL 复现；
  2. 保存失败证据；
  3. 增加自动化回归；
  4. 修改代码；
  5. 重跑目标测试；
  6. 重跑受影响回归；
  7. 部署准确 commit；
  8. 在原失败 URL 复测。
- 禁止通过改测试文字、跳过用例、删除断言、隐藏按钮或增加静态假数据冒充修复。

### 12.13 两次失败停止
- 同一门禁连续失败两次后，必须停止并输出 `BLOCKER_REPORT`，不得第三次盲目尝试。
- Blocker 报告必须包含：失败环境、精确 URL、精确 commit、复现步骤、根因、已尝试方案、下一方案以及是否需要用户决定。

### 12.14 每轮最终输出强制格式
- 每轮最终输出必须分别回答：
  1. 代码是否实现；
  2. 本地测试是否通过；
  3. staging 精确 URL；
  4. staging runtime commit；
  5. staging 用户路径是否通过；
  6. production 是否改变；
  7. production runtime commit；
  8. production 用户路径是否通过；
  9. main 是否改变；
  10. tag 是否改变；
  11. 产品负责人是否确认；
  12. 未完成路由；
  13. Placeholder 数量；
  14. 当前准确状态。
- 禁止使用“全部完成”“已经上线”“没有问题”等笼统结论，除非以上每项均有证据。
- 若本轮不涉及某个环境或阶段，也必须明确写“未执行/未改变”，不得省略。
