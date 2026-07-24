# R26_PRODUCT_UI_RECOVERY

## 目标与边界

- 暂停 R25B、生产发布、`main` 合并和稳定 tag。
- 保留后端业务能力、数据库、安全修复与稳定性结果。
- 当前用户端产品验收为 `FAIL`，当前 UI 不允许部署到公司私有云。
- Gate 0 完成设计解析、生产现状取证、路由/组件审计和 V2 规格。
- 用户确认 Gate 0 后，Gate 1 只实现隔离、静态、可交互的 V2 前端原型。
- Gate 1 不接真实 API，不修改后端/数据库，不运行发布流程。

仓库历史已经存在 `docs/rounds/R26.md`，记录“登录入口直达飞书”的已完成历史轮次。本文件使用用户指定的完整轮次名，避免覆盖历史记录。

## 基线

- 分支：`codex/r26-product-ui-recovery-gate0`
- 基线：`main@00d4d182ae34`
- 工作树开始时 clean。
- 未执行 merge、push、deploy、tag。

## 设计源

优先级：

1. Apple 风产品 UI：全局信息架构与正式页面；
2. 项目实时流程地图：项目工作区与固定拓扑；
3. 系统导览：只影响帮助/导览页。

Gate 0 读取了三份 12 页演示稿并生成可视蒙太奇。文件名差异和 SHA-256 记录在：

- `docs/product/R26_DESIGN_SOURCE_PRIORITY.md`

补充的固定拓扑原图已纳入 `docs/product/evidence/r26/design-sources/`，用于确认
第 4、6、12 步的分支关系和第 12 步 Y/N 语义；未改变三份 PPT 的优先级。

## 生产现状取证

- 使用已有 Safari 正式会话只读访问生产域名；
- 取证 48 个正式路由；
- 保存 1 个进展页内部 URL 改写后的空白故障态；
- 未读取或导出 Cookie、token、OAuth code、App Secret、storageState；
- 未创建、更新或删除生产数据。

主要现状：

- 主项目工作区可见层持续骨架屏；
- 进展页改写为 `step=1` 后整页空白；
- 多个项目业务页面长期显示加载态；
- 多个正式路由仍为 `PagePlaceholder`；
- 路由与组件重复，项目流程存在竞争视图；
- 业务事实大量使用 11–14px；
- 存在内部英文标注。

证据：

- `docs/product/evidence/r26/current-production/`
- `docs/product/R26_CURRENT_UI_AUDIT.md`

## Gate 0 输出

- `docs/product/R26_CURRENT_UI_AUDIT.md`
- `docs/product/R26_DESIGN_SOURCE_PRIORITY.md`
- `docs/product/R26_V2_INFORMATION_ARCHITECTURE.md`
- `docs/product/R26_FLOW_MAP_SPEC.md`
- `docs/product/R26_UI_ACCEPTANCE_CRITERIA.md`
- `docs/product/evidence/r26/current-production/README.md`

内容覆盖：

- 当前组件树和全部正式路由；
- 三份 PPT 的 36 页逐页差异矩阵；
- V2 必须废弃、只复用逻辑、继续保留的组件；
- `/v2/*` 与 Feature Flag 双隔离；
- 全部 V2 页面结构；
- 项目工作区 ViewModel 与现有 API/Prisma 映射；
- 固定 1440 × 1740 SVG 拓扑、18 节点和全部连线路径；
- 员工、项目经理、管理层三条操作路径；
- Gate 1 静态原型实施计划；
- Gate 1–4 的可见证据验收标准。

## 未执行

```text
产品代码修改       NOT RUN
lint              NOT RUN（Gate 0 无代码变更，不作为 UI 证据）
build             NOT RUN（Gate 0 无代码变更，不作为 UI 证据）
API 测试           NOT RUN（不作为 Gate 0 UI 证据）
main merge        NOT RUN
push              NOT RUN
production deploy NOT RUN
stable tag        NOT RUN
```

## Gate 0 决定

`R26_PRODUCT_UI_RECOVERY_GATE0_COMPLETE / CURRENT_UI_FAIL / V2_SPEC_FROZEN / STOP_BEFORE_GATE1`

进入 Gate 1 需要用户确认。Gate 1 只能创建隔离的静态 V2 原型，完成后必须在视觉闸门停止，不得部署。

## Gate 1 静态 V2 原型

### 分支与边界

- Gate 0 固定提交：`1e9d5ab57d09c70dc5b77deb8f4c01705d89bfb4`
- Gate 1 分支：`codex/r26-product-ui-recovery-gate1`
- 双重隔离：`/v2/*` + `NEXT_PUBLIC_R26_V2_PROTOTYPE=true`
- 未修改 `apps/api/`、Prisma、migration、数据库、Redis、OAuth、附件安全、审计或部署脚本。
- 未接真实业务 API；V2 自动化观测到的 `/api/` 请求为 0。

### 已实现路由

- `/v2/dashboard`
- `/v2/projects`
- `/v2/projects/demo-r26`
- `/v2/progress?projectId=demo-r26&taskId=t006`

四页使用独立 V2 运行时、typed fixtures、作用域 CSS 和 `sessionStorage` 原型状态；没有复用 V1 AppShell、旧流程地图或旧项目工作区布局。

### 固定流程地图

- `viewBox="0 0 1440 1740"`
- 18 个固定节点、坐标、尺寸、形状和连线路径
- 第 12 步菱形、第 17 步 `3 / 12` 环形进度、第 18 步人工退出决定
- 主线、并行、非阻塞、退回四类固定连线
- 节点点击更新详情并写入 `taskId` 或 `nodeCode`
- 刷新恢复同一节点；关闭详情保留地图比例

### 可见证据

- 固定视口截图：`test-results/r26-gate1/screenshots/`
- 四段当前复验录像（1440/1024/390）：`test-results/r26-gate1/videos/`
- 四组 PPT 对比：`test-results/r26-gate1/comparisons/`
- 报告：`docs/product/R26_GATE1_STATIC_PROTOTYPE_REPORT.md`
- 索引：`docs/product/R26_GATE1_SCREENSHOT_INDEX.md`
- 人工复核：`docs/product/R26_GATE1_HUMAN_REVIEW.md`

### 自动化与质量门禁

```text
pnpm install --frozen-lockfile                                                    PASS
pnpm --filter @feishu-timeline/web lint                                          PASS
pnpm --filter @feishu-timeline/web typecheck                                     PASS
pnpm --filter @feishu-timeline/web test                                          PASS（28 files / 84 tests）
pnpm --filter @feishu-timeline/web build                                         PASS
R26 Playwright                                                                    PASS（7/7）
pnpm lint                                                                         PASS
pnpm typecheck                                                                    PASS
git diff --check                                                                  PASS
```

截图与录像是 Gate 1 的可见证据；lint、build 和路由存在没有被当作 UI 通过结论。

### Gate 1 决定

`R26_GATE1_IMPLEMENTED / STATIC_V2_ONLY / AWAITING_PRODUCT_OWNER_VISUAL_CONFIRMATION / NO_API_INTEGRATION / NO_DEPLOY / STOP`

人工验收项全部保持未勾选。未进入 Gate 2，未部署 staging/production，未合并 `main`，未创建 tag。

## Gate 1 人工检查修复（2026-07-23）

### 修复范围

- 第 12 步元信息、标题和轮次结论重新居中到判断框内，增加垂直间距。
- 流程连线缩为 `2.5`，箭头改为固定用户空间尺寸。
- 1024 保持 1440×1740 固定画布实际尺寸，右侧抽屉收敛为 370px。
- 390 不再渲染缩小桌面 SVG，改为 18 节点可读总览和全屏工序 sheet。
- 390 工作台主动作移到事实卡之前，确保第一屏可见。
- 项目筛选固定为全部、正常、有风险、已逾期、等待评审。
- 进展提交改为幂等会话更新；提交后第 06 步完成，第 07/09/10 步已创建，第 10 步进行中，材料同步为 3/3。
- 删除产品页面内部 `demo-r26 · t006`，并将其与 `DEMO - ACTIVE` 一并纳入禁用文案扫描。
- 关闭开发环境 Next 角标，避免调试元素进入验收截图。

### 复验证据

- 1440/1024/390 固定视口截图：`test-results/r26-gate1/screenshots/`
- 四段视口标记录像：`test-results/r26-gate1/videos/`
- 修复报告：`docs/product/R26_GATE1_REMEDIATION_REPORT.md`
- 更新索引：`docs/product/R26_GATE1_SCREENSHOT_INDEX.md`
- 更新人工复核表：`docs/product/R26_GATE1_HUMAN_REVIEW.md`
- 浏览器真实执行风险筛选、节点点击、详情滚动、刷新恢复、关闭抽屉和 33 秒静态进展提交。

### 最终检查

```text
R26 Playwright                                          PASS（7/7）
pnpm install                                            PASS
pnpm lint                                               PASS
pnpm typecheck                                          PASS
pnpm test                                               PASS（Web 84 / API 223）
NEXT_PUBLIC_R26_V2_PROTOTYPE=true pnpm --filter web build PASS
pnpm --filter api build                                 PASS
pnpm --filter api prisma:validate                       PASS
git diff --check                                        PASS
```

### 决定

`R26_GATE1_PRODUCT_OWNER_ACCEPTED / STATIC_V2_ONLY / MAIN_MERGE_AND_PRODUCTION_DEPLOY_AUTHORIZED / GATE2_NOT_STARTED`

2026-07-23，产品负责人明确回复“先就这样，部署提交合并代码”，接受当前 Gate 1 修复结果并授权提交、合并 `main` 和生产部署。部署前必须保留 PostgreSQL 与配置回滚点；Gate 2 真实数据联调未启动。

## Gate 1 生产发布（2026-07-23）

### 发布结果

- Gate 1 修复已合并并推送 `main`。
- 生产已启用 `NEXT_PUBLIC_R26_V2_PROTOTYPE=true`。
- 发布前 PostgreSQL 备份、校验和隔离恢复演练通过；配置快照校验通过。
- 18 项 Prisma migration 全部已应用，0 项待执行。
- API、Web、nginx、PostgreSQL、Redis 均为 active。
- 四个 V2 正式域名路由均返回 200，匿名业务 API 仍返回 401。

### 生产浏览器复验

- 首轮发现未开放导航自动预取 `/v2/tasks` 与 `/v2/retrospectives`
  导致 404；提交 `619f879` 禁用这两个入口的预取后重新部署。
- 1440 完成筛选、节点 12 刷新恢复、关闭抽屉、节点 17/18 和一次静态提交。
- 1024 保持固定流程图和可用抽屉，无横向溢出。
- 390 当前任务在首屏，18 节点总览和全屏 sheet 可用，表单可进入下一步。
- 最终三组录像均为 console error 0、page error 0、4xx 资源 0、`/api/` 请求 0。
- 页面未出现 `DEMO-ACTIVE`、`DEMO-COMPLETE` 或内部项目/任务组合 ID。

完整记录：`docs/release/R26_V2_PRODUCT_UI_PRODUCTION_RELEASE.md`

### 决定

`R26_GATE1_STATIC_V2_DEPLOYED / PRODUCT_OWNER_ACCEPTED_AS_IS / GATE2_NOT_STARTED / NO_STABLE_TAG`

## 生产反馈修复：初始滚动与导航命名（2026-07-23）

- 生产复现：流程地图 100% 初始状态下，鼠标位于地图区域时滚轮不能推动页面；
  缩放到 75% 再恢复 100% 后才偶然恢复。
- 根因：地图滚动容器的全轴 `overflow:auto` 与全轴
  `overscroll-behavior:contain` 吞掉了纵向滚动链。
- 修复：横向滚动继续由地图容器管理，纵向滚动明确传递给页面，并保留触摸平移。
- 回归：首次进入、未点击缩放、地图悬停时执行 600px 纵向滚轮，页面
  `scrollY` 必须大于 0。
- 导航与项目工作区文案统一为“项目列表”；“复盘分析”改为“系统管理”，
  禁用入口目标为 `/v2/admin`。
- 本地验证：Web lint、typecheck、84 项测试、生产 build、R26 Playwright
  7/7 全部 PASS。
- 生产验证：初始 100% 且未操作缩放时，地图内滚轮使页面
  `scrollY: 0 → 600`；新导航显示正确；4xx、console error、page error
  均为 0。

决定：

`R26_SCROLL_FIX_DEPLOYED / NAV_COPY_UPDATED / PRODUCTION_VERIFIED / GATE2_NOT_STARTED`

## Gate 3A 项目成员与任务分配（2026-07-24）

### 分支与边界

- Gate 2 基线：`5202c46`
- Gate 3A 分支：`codex/r26-gate3a-project-member-assignment`
- 只在独立 staging 开放项目成员、职责配置、分配预览、分配应用和任务转交。
- 保存/提交进展、材料上传、工序完成、评审和流程推进继续关闭。
- 未修改 V1，未部署 production，未合并 `main`，未创建 tag。

### 实现与保护

- 新增项目成员/节点分配写服务，复用现有 `ProjectMember` 和权限体系。
- 新增 `ProjectNodeAssignment`、`R26CommandRequest` 和
  `Project.memberAssignmentVersion`，通过 Prisma migration 管理。
- 后端统一执行人工任务覆盖、工序专属、部门负责人、默认执行人、唯一候选人和待分配
  六级优先级；前端只展示服务端结果。
- 全部真实写接口具备权限、项目作用域、幂等、乐观锁、事务、409、原因和审计。
- 已完成/历史任务不可变；进行中任务需逐项确认；活动任务成员移除必须转交。
- 成员移除只转交活动任务，未来节点在无法重新解析时保持待分配，防止跨部门误分配。

### staging 真实验证

- staging URL：`http://localhost:8080`
- UAT 项目：`R26-G3A-UAT-20260724-1006`
- 部署镜像：`r26-gate3a-d4a0bdd`
- 19 项 migration 已应用；API/Web/nginx/PostgreSQL/Redis healthy。
- 完成采购、质量、工艺成员添加，11 节点分配，READY 任务转交，成员安全移除和恢复。
- 最终 4 名成员、8 行职责、11 行节点配置、7 条 Gate 3A 命令和 7 条成功审计。
- 1440、1024、390 真实浏览器截图和状态序列保存于
  `docs/product/evidence/R26_GATE3A/`。

### 质量门禁

```text
pnpm install                          PASS
pnpm lint                             PASS
pnpm typecheck                        PASS
pnpm test                             PASS（Web 96 / API 244）
pnpm --filter web build               PASS
pnpm --filter api build               PASS
pnpm --filter api prisma:validate     PASS
git diff --check                      PASS
```

报告：`docs/product/R26_GATE3A_PROJECT_MEMBER_ASSIGNMENT_REPORT.md`

人工复核：`docs/product/R26_GATE3A_HUMAN_REVIEW.md`

### 决定

```text
R26_GATE3A_IMPLEMENTED
PROJECT_MEMBER_WRITES_ENABLED
ASSIGNMENT_WRITES_ENABLED
PROGRESS_AND_WORKFLOW_WRITES_STILL_DISABLED
AWAITING_PRODUCT_OWNER_GATE3A_CONFIRMATION
STOP_BEFORE_GATE3B
```

### Gate 3A 项目记录排版修复

- 修复三列记录卡内再次三列布局导致的摘要逐字换行和元信息重叠。
- 项目记录改为单列时间流，桌面采用时间/摘要/操作人三段式布局，390px 纵向堆叠。
- 内部英文动作代码不再作为用户可见文案。
- staging 镜像：`r26-gate3a-records-9bca772`，应用提交：`9bca772`。
- 全量检查通过：Web 97、API 244，lint、typecheck、两端 build、Prisma validate、
  `git diff --check` 均通过。
- 未运行 seed，未修改 production/V1，未进入 Gate 3B。
- staging 重部署后飞书会话过期；重新授权属于权限操作，未在没有产品负责人确认时
  点击。三档浏览器截图复验等待授权后补充。

### Gate 3A 最终产品批准

- 产品负责人通过 Gate 3B 启动指令确认 Gate 3A 通过。
- 真实飞书 OAuth 已恢复，用户为李晓晨。
- staging 应用提交：`9bca77260a46386408c3e5384c25b15040d5bbb7`。
- 项目记录 1440/1024/390 排版复核通过，重叠和页面横向溢出均为 0。
- 内部英文审计动作代码未显示，console error 为 0。
- 新增证据：`docs/product/evidence/R26_GATE3A/13-project-records-fixed-1440.png`
  至 `15-project-records-fixed-390.png`。

```text
R26_GATE3A_PASSED
PROJECT_MEMBER_AND_ASSIGNMENT_MANAGEMENT_ACCEPTED
READY_FOR_GATE3B_PROGRESS_AND_MATERIALS
```

## Gate 3B 进展提交与材料上传（2026-07-24）

### 授权与边界

- 产品负责人明确启动 Gate 3B，Gate 3A 最终批准提交为 `e52c9d0`。
- 从 Gate 3A 准确基线创建 `codex/r26-gate3b-progress-materials`。
- 仅在独立 staging 开放草稿、正式进展、阻塞申报、材料上传和材料版本。
- 完成工序、下一节点、评审、收费、月度评审、颜色退出、成员/分配修改继续关闭。
- 未修改 V1，未访问 production，未合并 `main`，未创建 tag，未进入 Gate 3C。

### 实现

- 新增进展草稿模型、不可变正式进展字段、阻塞协助信息和 migration。
- 新增 Gate 3B context/history、草稿保存/删除、进展提交、材料 V1/V2 和历史内容接口。
- 所有写请求要求 `Idempotency-Key`，使用 task/draft version、项目作用域、后端
  `availableActions`、事务、审计和 409 冲突。
- 复用既有附件安全校验，保留扩展名、MIME、魔数、大小、双扩展名、路径和文件名
  安全；替换生成 V2，V1 只读保留。
- `/v2/progress` 启用真实三步表单；写入后同步工作台、项目列表、流程地图、工序详情、
  进展历史和项目记录。
- `WORK_COMPLETE_PENDING_TASK_COMPLETION` 不映射任务完成；响应固定包含
  `taskStatusChanged=false` 和 `workflowTransitioned=false`。

### staging 真实 UAT

```text
URL                         http://localhost:8080
user                        李晓晨
project                     R26-G3B-UAT-进展提交-20260724-2136
app commit                  4f92e8d
image tag                   r26-gate3b-4f92e8d
migrations                  20 applied / 0 pending
console/page errors         0
production requests         0
workflow command requests   0
```

- 完成阻塞进展、协助人员/部门、预计解除时间、PDF V1、替换 V2、正式提交和跨页联动。
- 完成草稿保存、刷新恢复和删除；正式历史在删除草稿后保留。
- 1440、1024、390 验证三步表单、地图抽屉、移动全屏 sheet、输入焦点和固定主动作。
- 数据库确认项目/工作流节点均为 `PROJECT_INITIATION`、任务仍为 `READY`、活动任务
  仍为 1；进展 1 条、当前材料 1 个、归档版本 1 个、活动草稿 0。

### 证据

- 报告：`docs/product/R26_GATE3B_PROGRESS_MATERIAL_REPORT.md`
- 人工复核：`docs/product/R26_GATE3B_HUMAN_REVIEW.md`
- 截图/回放：`docs/product/evidence/R26_GATE3B/`
- API/数据库组合证明：
  `docs/product/evidence/R26_GATE3B/API_AND_DATABASE_PROOF.md`

### 最终检查

```text
pnpm install --frozen-lockfile       PASS
pnpm lint                            PASS
pnpm typecheck                       PASS
pnpm test                            PASS（Web 33 files / 109 tests；API 61 files / 263 tests）
pnpm --filter web build              PASS
pnpm --filter api build              PASS
pnpm --filter api prisma:validate    PASS
git diff --check                     PASS
```

### 决定

```text
R26_GATE3B_IMPLEMENTED
PROGRESS_DRAFT_AND_SUBMISSION_ENABLED_ON_STAGING
TASK_MATERIAL_UPLOAD_AND_VERSIONING_ENABLED_ON_STAGING
WORKFLOW_TRANSITION_STILL_DISABLED
AWAITING_PRODUCT_OWNER_GATE3B_CONFIRMATION
STOP_BEFORE_GATE3C
```

## Gate 2 真实只读数据联调（2026-07-23）

### 授权与边界

- 产品负责人已人工确认 Gate 1，通过后明确授权进入
  `R26_PRODUCT_UI_RECOVERY_GATE2_READ_ONLY_REAL_DATA_INTEGRATION`。
- 只在独立 staging 为四个 `/v2/*` 页面启用真实读模型。
- 只允许 GET；没有进展提交、材料上传、分配保存、成员增删、负责人修改或流程推进。
- 未修改 V1、业务状态机、Prisma schema、migration 或数据库业务数据。
- 未部署 production，未进入 Gate 3。

### 实现

- 新增五个 `/api/v2/*` GET 读接口，聚合当前用户、权限、项目、任务、18 节点流程、
  SLA、材料、动态、成员、部门与有效用户。
- 新增服务端 18 节点分配规则，按部门候选池返回具体建议负责人、协同人和评审人。
- 项目工作区增加只读“项目成员与分工”和“自动分配预览”，没有保存按钮。
- 进展页改为真实只读上下文，输入框、文件选择器和业务写按钮均为 0。
- 真实模式响应与页面均标记 `dataSource=database`；Gate 1 fixture 命中数为 0。

### staging 验收证据

- 使用现有飞书登录态在 1440、1024、390 完整点击项目、流程节点、抽屉、URL 刷新、
  移动全屏 sheet 和只读进展上下文。
- 项目工作区显示 18 个 API 节点、7 个项目成员和 18 行自动分配预览。
- 长期 skeleton、console error、page error、页面横向溢出均为 0。
- Playwright 运行时业务请求观测和 nginx 日志交叉核对：
  `/api/v2/* GET 53`，POST/PUT/PATCH/DELETE 均为 0。
- 12 张有效截图：`docs/product/evidence/R26_GATE2/`；浏览器产生的空白全页截图已剔除。
- 完整报告：`docs/product/R26_GATE2_READ_ONLY_REAL_DATA_REPORT.md`。

### 检查

```text
pnpm install --frozen-lockfile                                      PASS
pnpm lint                                                           PASS
pnpm typecheck                                                      PASS
pnpm test                                                           PASS（Web 87 / API 225）
NEXT_PUBLIC_R26_V2_PROTOTYPE=true
NEXT_PUBLIC_R26_V2_DATA_MODE=read-only-real
pnpm --filter @feishu-timeline/web build                            PASS
pnpm --filter @feishu-timeline/api build                            PASS
pnpm --filter @feishu-timeline/api prisma:validate                  PASS
```

### 决定

```text
R26_GATE2_IMPLEMENTED
READ_ONLY_REAL_DATA_CONNECTED
ZERO_BUSINESS_WRITE_REQUESTS
AWAITING_PRODUCT_OWNER_REAL_DATA_CONFIRMATION
STOP_BEFORE_GATE3
```

## Gate 3C1 普通工序完成（2026-07-24）

### 授权与边界

- Gate 3B 已由产品负责人确认通过。
- 从准确 Gate 3B 提交 `4f92e8d67f808402d6607c13cc30aa3281f69ec7`
  创建 `codex/r26-gate3c1-ordinary-task-completion`。
- 只开放第 1～11 步普通工序完成与自动推进；第 12/13/17/18 步专项动作保持关闭。
- 未修改 V1，未访问 production，未合并 `main`，未创建 tag，未进入 Gate 3C2。

### 实现

- 新增只计算的完成预览、事务完成和阻塞解除三个 V2 command 接口。
- 完成命令复用 `WorkflowsService`、冻结拓扑、Gate 3A 分配、项目访问、权限、
  SLA、审计、通知和幂等；V2 前端不计算下一节点或负责人。
- 第 4 步只产生第 5/6 步，第 6 步只产生第 7/9/10 步；第 9 步标记为
  非阻塞支线。
- 完成前检查服务端返回表单、材料、权限、活动任务和开放阻塞事实；失败时返回
  逐项准确原因。
- 阻塞解除保存解决说明、实际解除时间、操作者、requestId 和审计，不提供强制忽略。
- 完成面板要求 `taskVersion`、`Idempotency-Key`、完成原因和后果确认；
  成功后局部刷新全部 V2 读模型。
- 390px 完成面板为全屏 sheet；内容独立滚动，底部主动作固定。

### 真实 staging UAT

- 串行项目从第 1 步推进到第 12 步；第 9 步保持未完成，主线不被阻塞。
- 第 4 步只生成第 5/6 步；第 6 步只生成第 7/9/10 步。
- 第 5 步缺少“颜色编号确认单”准确阻断。
- 真实 Gate 3B 阻塞申报后完成被拒绝；解除阻塞后检查即时通过。
- 双标签并发一个成功、一个 409；数据库只有一条完成命令和一个后续任务。
- 第 12 步显示专项动作未开放，不存在 Gate 3C1 完成入口。
- production 请求 0；第 12/13/17/18 步专项写请求 0。

### 质量门禁

```text
pnpm install                          PASS
pnpm lint                             PASS
pnpm typecheck                        PASS
pnpm test                             PASS（Web 121 / API 282）
pnpm --filter web build               PASS
pnpm --filter api build               PASS
pnpm --filter api prisma:validate     PASS
git diff --check                      PASS
```

报告：`docs/product/R26_GATE3C1_ORDINARY_COMPLETION_REPORT.md`

人工复核：`docs/product/R26_GATE3C1_HUMAN_REVIEW.md`

证据：`docs/product/evidence/R26_GATE3C1/`

### 决定

```text
R26_GATE3C1_IMPLEMENTED
ORDINARY_TASK_COMPLETION_ENABLED_ON_STAGING
PARALLEL_AND_NONBLOCKING_TRANSITIONS_VERIFIED
STEP12_AND_LATER_SPECIAL_ACTIONS_STILL_DISABLED
AWAITING_PRODUCT_OWNER_GATE3C1_CONFIRMATION
STOP_BEFORE_GATE3C2
```

### Gate 2 数据口径修复（2026-07-24）

- 统一工作台、项目卡、工作区和流程详情中的当前步骤、负责人、责任部门与轮次；
  当前真实项目均显示 `12 / 18`、李晓晨、质量管理部、第 1 轮。
- 第 17 步改为读取月度计划的真实完成数，当前 staging 为 `0 / 12`，不再固定显示
  `3 / 12`。
- 未生成节点保持“负责人待分配 / 尚未生成”；第 15 步按服务端规则显示生产部，
  公司目录未配置该部门时不从公司有效用户中任意选择负责人。
- 18 节点主责/协同/评审部门规则按业务责任表重建；候选池只包含当前项目有效成员。
- 项目卡新增责任部门；真实地图可访问名称使用当前项目颜色名。
- 只替换独立 staging API/Web 构建产物，未执行 migration 或 seed；容器全部 healthy。
- 李晓晨飞书账号浏览器复核：18 个节点，第 12 步第 1 轮，第 15 步待分配，
  第 17 步 `0 / 12`，console error 0。
- nginx 复核：`/api/v2/* GET 16`，POST/PUT/PATCH/DELETE 均为 0。
- 截图：`docs/product/evidence/R26_GATE2/16-data-consistency-step15-1440.png`。
- 登记 `R26-DATA-001`：历史演示成员和 UAT 项目后续经数据治理审批处理，本轮没有
  修改或删除数据库业务数据。

最终回归：lint、typecheck、Web 90 项测试、API 231 项测试、Web/API production
build、Prisma validate 和 `git diff --check` 全部 PASS。

决定保持：

```text
R26_GATE2_IMPLEMENTED
READ_ONLY_REAL_DATA_CONNECTED
ZERO_BUSINESS_WRITE_REQUESTS
AWAITING_PRODUCT_OWNER_REAL_DATA_CONFIRMATION
STOP_BEFORE_GATE3
```
