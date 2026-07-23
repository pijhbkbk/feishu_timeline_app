# R26_PRODUCT_UI_RECOVERY — 当前 UI 审计

## 1. 审计结论

`CURRENT_PRODUCT_UI_ACCEPTANCE = FAIL`

当前线上用户端 UI 不允许部署到公司私有云。后端业务能力、数据库、安全修复和稳定性证据继续保留；本结论只否定当前产品界面和用户路径，不否定后端。

主要失败：

1. 主项目工作区在 Safari 可见层持续停留骨架屏，虽然可访问性树已经出现项目数据与“开发流程”内容。
2. `/progress?taskId=...` 会被前端改写为 `&step=1`，随后出现整页空白；这不是 lint、build 或 API 200 能证明正常的路径。
3. 大量正式路由停留“正在加载”或只显示占位组件，用户会看到技术模块而不是围绕任务的产品工作区。
4. 主业务事实仍大量使用 11–14px 字号，违反 P1 的 16px 正文和主要业务信息可读性要求。
5. 项目流程存在三个竞争视图：主项目工作区、独立流程地图、时间线看板；信息架构没有收敛。
6. `/tasks`、`/tasks/my`、`/todos`，以及 `/analytics`、`/retrospectives` 等重复入口增加认知负担。
7. 当前界面仍出现内部英文标注，包括 `Required`、`Upload`、`History`、`Executive summary`、`Stage comparison`、`Learning`、`Audit`；R26 V2 禁止出现 `DEMO`、`ACTIVE` 或同类非产品文案。

## 2. 线上截图证据

取证时间：2026-07-23（Asia/Shanghai）
域名：`https://timeline.all-too-well.com`
视口：本机 Safari 可见视口 1228 × 768
账号：已有 Safari 飞书会话；不读取、不导出 Cookie、token、OAuth code 或 storageState。

汇总：

- [正式路由 01–16](evidence/r26/current-production/contact-sheet-01.png)
- [正式路由 17–32](evidence/r26/current-production/contact-sheet-02.png)
- [正式路由 33–48](evidence/r26/current-production/contact-sheet-03.png)
- [进展页内部重定向后空白](evidence/r26/current-production/05b-progress-post-redirect-blank.png)
- [完整截图目录](evidence/r26/current-production/)

浏览器会话差异：

- Codex 内置浏览器中的“测试企业 - 20250216 / 李晓晨”在飞书授权页被明确判定为无应用访问权限。
- Safari 已有会话能够进入生产正式页面。
- 这说明测试人员范围或飞书登录环境存在不一致；Gate 1 不依赖该差异改权限，Gate 3 前必须用正式验收账号重新取证。

## 3. 正式路由截图清单

| 编号 | 路由 | 当前组件/页面 | 可见结果 |
|---:|---|---|---|
| 01 | `/dashboard` | `DashboardWorkspace` | 可加载；信息较密、次要字号偏小 |
| 02 | `/projects` | `ProjectsListClient` | 可加载；宽卡片信息密度高 |
| 03 | `/projects/:projectId` | `ProjectWorkspaceR22` | 可见层持续骨架屏，主工作区不可验收 |
| 04 | `/tasks` | `TasksWorkspace(mode=my)` | 可加载 |
| 05 | `/progress?taskId=` | `ProgressWorkspaceR22` | 初始骨架；随后 `step=1` 空白 |
| 06 | `/materials/upload?taskId=` | `MaterialsUploadR22` | 页面外壳出现，材料区延迟加载 |
| 07 | `/retrospectives` | `AnalyticsCenter` | 与 `/analytics` 共用组件，语义不一致 |
| 08 | `/projects/:projectId/retrospective` | `ProjectRetrospectiveR22` | 可加载，但含内部英文标注 |
| 09 | `/admin` | `AdminDashboardR22` | 可加载，但含 `Audit` 标注 |
| 10 | `/guide` | `SystemGuidePage` | 可加载；页面内信息量大 |
| 11 | `/projects/new` | `ProjectEditor` | 可加载 |
| 12 | `/projects/flow-map` | `ProjectsFlowMapPortal` | 第二个流程地图入口 |
| 13 | `/projects/timeline` | `ProjectTimelineBoard` | 与 14 重复 |
| 14 | `/projects/timeline-board` | `ProjectTimelineBoard` | 与 13 重复 |
| 15 | `/materials` | `MaterialsCenter` | 数据区加载不稳定 |
| 16 | `/monthly-reviews` | `MonthlyReviewsBoard` | 独立业务入口，未纳入 P1 主 IA |
| 17 | `/reviews` | `PagePlaceholder` | 正式路由仍为占位页 |
| 18 | `/analytics` | `AnalyticsCenter` | 与 `/retrospectives` 重复 |
| 19 | `/colors` | `PagePlaceholder` | 正式路由仍为占位页 |
| 20 | `/settings` | `PagePlaceholder` | 正式路由仍为占位页 |
| 21 | `/tasks/pending` | `TasksWorkspace(mode=pending)` | 与任务中心高度重复 |
| 22 | `/tasks/overdue` | `TasksWorkspace(mode=overdue)` | 与任务中心高度重复 |
| 23 | `/tasks/my` | `TasksWorkspace(mode=my)` | 与 `/tasks` 重复 |
| 24 | `/todos` | `TasksWorkspace(mode=my)` | 与 `/tasks` 重复 |
| 25 | `/projects/:projectId/overview` | `ProjectOverviewClient` | 可加载 |
| 26 | `/projects/:projectId/flow-map` | `FlowMapWorkspace` | 长时间显示“正在加载流程地图” |
| 27 | `/projects/:projectId/workflow` | `ProjectWorkflowWorkspace` | 长时间加载 |
| 28 | `/projects/:projectId/tasks` | `ProjectWorkflowWorkspace` | 长时间加载 |
| 29 | `/projects/:projectId/development-report` | `DevelopmentReportWorkspace` | 可加载 |
| 30 | `/projects/:projectId/samples` | `SamplesWorkspace` | 可加载 |
| 31 | `/projects/:projectId/standard-boards` | `StandardBoardsWorkspace` | 长时间加载 |
| 32 | `/projects/:projectId/paint-procurement` | `PaintProcurementWorkspace` | 长时间加载 |
| 33 | `/projects/:projectId/performance-tests` | `PerformanceTestsWorkspace` | 可加载 |
| 34 | `/projects/:projectId/pilot-production` | `PilotProductionWorkspace` | 长时间加载 |
| 35 | `/projects/:projectId/reviews` | `ProjectReviewsWorkspace` | 多个评审区同时加载 |
| 36 | `/projects/:projectId/fees` | `FeesWorkspace` | 长时间加载 |
| 37 | `/projects/:projectId/production-plans` | `SchedulePlansWorkspace` | 长时间加载 |
| 38 | `/projects/:projectId/mass-production` | `MassProductionWorkspace` | 长时间加载 |
| 39 | `/projects/:projectId/color-evaluation` | `VisualDeltaReviewWorkspace` | 长时间加载 |
| 40 | `/projects/:projectId/color-exit` | `ColorExitWorkspace` | 长时间加载 |
| 41 | `/projects/:projectId/materials` | `AttachmentsWorkspace(mode=materials)` | 长时间加载 |
| 42 | `/projects/:projectId/attachments` | `AttachmentsWorkspace` | 可加载，与 41 重复 |
| 43 | `/projects/:projectId/logs` | `ProjectLogsWorkspace` | 可加载 |
| 44 | `/admin/users` | `PagePlaceholder` | 正式管理路由仍为占位页 |
| 45 | `/admin/roles` | `PagePlaceholder` | 正式管理路由仍为占位页 |
| 46 | `/admin/dicts` | `PagePlaceholder` | 正式管理路由仍为占位页 |
| 47 | `/admin/workflow-nodes` | `PagePlaceholder` | 正式管理路由仍为占位页 |
| 48 | `/admin/audit-logs` | `AdminAuditWorkspaceR25A` | 可加载 |

未单独取证：

- `/` 仅重定向 `/dashboard`。
- `/login`、`/login/callback` 是认证路由，不是产品正式页面。
- `/dev/r22-components` 仅开发环境存在。
- `/projects/:projectId/samples/:sampleId` 当前生产项目没有可从页面确认的 sampleId，未猜测记录 URL。
- `/admin/:section` 与 `/projects/:projectId/:section` 的未知 section 由通用占位路由接管，不作为新增正式页面。

## 4. 当前组件树与路由结构

```text
RootLayout
├── Providers
│   └── AuthProvider
└── AppShell
    ├── 顶部五项主导航
    ├── 搜索 / 通知 / 帮助 / 用户
    ├── 项目上下文 7 项横向导航，或后台 5 项横向导航
    ├── Route Page
    │   ├── R22 页面族
    │   ├── 流程地图 / 时间线旧页面族
    │   ├── 业务模块工作区
    │   └── PagePlaceholder
    └── 移动端五项底部导航
```

当前组件分层事实：

| 层 | 代表文件 | 问题 |
|---|---|---|
| 全局外壳 | `app-shell.tsx`、`navigation.ts` | 主导航已接近 P1，但项目/后台上下文导航过密 |
| R22 视觉层 | `r22.css`、`r22-ui.tsx` | 视觉 token 大致接近 Apple，但业务事实仍大量使用 11–14px |
| P1 页面层 | `dashboard-workspace.tsx`、`projects-list-client.tsx`、`project-workspace-r22.tsx` 等 | 页面不是统一 V2 架构，存在加载和重复视图 |
| P2 地图层 | `flow-map-workspace.tsx`、`task-detail-drawer.tsx` | 有固定 SVG 和 30s/15s 刷新，但未成为唯一主项目工作区 |
| 旧流程层 | `project-timeline-board.tsx`、`project-detail-timeline.tsx`、`timeline-node.tsx` | 与主工作区和流程地图竞争 |
| 模块页面层 | procurement / reviews / fees / production 等 | 技术模块直接暴露为大量正式路由 |
| 占位层 | `page-placeholder.tsx` | 正式用户/管理路由仍可能只显示“骨架已就位” |

## 5. 三份 PPT 逐页差异矩阵

### 5.1 P1 Apple 风产品 UI

| 页 | 目标 | 当前实现 | 差异 / R26 决定 |
|---:|---|---|---|
| 1 | 清晰、克制、任务导向 | 视觉接近浅色系统，但呈现模块堆叠 | V2 只围绕用户问题组织页面 |
| 2 | 40/28/18/16/14 层级；正文 16 | CSS 存在大量 11/12/13px 业务事实 | V2 主要业务信息不得小于 14，正文基线 16 |
| 3 | 五项主导航 | 已有五项；另有密集上下文导航和大量旧路由 | 保留五项，收敛项目/后台次级导航 |
| 4 | 大问候 + 唯一当前任务 + 4 KPI | 基本结构存在 | 减少密集小字，确保首屏唯一主动作 |
| 5 | 项目卡直接解释停滞原因 | 已有停滞面板 | 视觉仍像信息表；改为 P1 大卡片节奏 |
| 6 | 流程 + 当前工序两栏 | 主路由骨架屏；另有独立地图 | 合并为唯一 V2 项目工作区 |
| 7 | 三步进展提交 | 代码有三步，但生产可空白 | Gate 1 先做静态完整路径，Gate 2 再接真实 API |
| 8 | 五种任务队列 | 存在多个重复 URL | 在 `/v2/tasks` 内使用同页筛选 |
| 9 | Required / Uploaded / Upload 三栏语义 | 当前页面使用英文 overline，加载不稳定 | 中文化为“必交材料 / 已上传 / 添加材料” |
| 10 | 生命周期结论、延误、瓶颈、计划实际、行动 | 项目页基本有，但含内部英文；顶层复盘复用 analytics | V2 分离项目复盘与组合分析 |
| 11 | 组织、权限、流程参数、审计 | 概览可用，但四个管理子页仍占位 | Gate 1 静态原型显示真实信息架构 |
| 12 | 逐页视觉验收 | 历史以 build/API/路由作为完成证据 | R26 只接受截图、交互与视觉评分 |

### 5.2 P2 项目实时流程地图

| 页 | 目标 | 当前实现 | 差异 / R26 决定 |
|---:|---|---|---|
| 1 | 项目实时战情图 | 主项目工作区不是固定 SVG | V2 项目页以固定 SVG 为主 |
| 2 | 5 秒定位当前、风险、下一步 | 当前 18 个按钮按网格平铺 | 用拓扑、颜色、连线和抽屉承载 |
| 3 | 概览 + 项目切换 + 地图 + 抽屉 + 活动 | 当前主项目页只有流程按钮 + 右栏；独立地图另做 | 合并到一个 V2 页面 |
| 4 | 18 节点固定拓扑 | `FlowMapWorkspace` 有拓扑，主路由没有 | 固定拓扑写入 `R26_FLOW_MAP_SPEC.md` |
| 5 | 7 类状态、4 类连线 | 当前主路由只合并为 done/current/risk/pending | V2 恢复完整状态语义 |
| 6 | hover、click、`?taskId=`、移动全屏 | 两个地图组件分别实现部分能力 | 单一交互模型 |
| 7 | 工序详情完整字段 | `WorkflowTaskInteractionDetail` 已支持 | 保留 API，重做抽屉视觉 |
| 8 | 第 12 步决策与退回历史 | 后端能力存在，当前不在主地图中突出 | 菱形决策节点 + 强制退回原因 |
| 9 | 第 17 环形月度进度、第 18 终点 | 数据存在，主地图形状不区分 | 使用专属 SVG 形状 |
| 10 | 风险模式 | 当前有 risk filter，但主项目页只显示合并风险色 | 保留 overdue/returned/blocker/material 四类 |
| 11 | 地图 30s、抽屉 15s、数据 60s | 两个现有组件已部分实现 | V2 继承刷新规则，并在编辑时暂停覆盖 |
| 12 | 分阶段实施 | 历史并行保留三套流程 UI | Gate 1 先做唯一静态原型，再接数据 |

### 5.3 P3 系统导览

| 页 | 目标 | 当前实现 | 差异 / R26 决定 |
|---:|---|---|---|
| 1 | 新用户理解系统 | 已有 `/guide` | 保留辅助入口 |
| 2 | 目的、流程、规则、操作、角色、材料、FAQ | 内容基本覆盖 | 页面内部锚点，不形成全局侧栏 |
| 3 | 导览 Hero | 当前 Hero 信息较多 | 按 P1 留白与字号重做 |
| 4 | 18 步四阶段 | 当前已编码四阶段 | 内容可复用，视觉重做 |
| 5 | 工序展开详情 | 当前静态长页 | Gate 1 原型加入可展开详情 |
| 6 | 六类业务规则 | 当前有规则卡片 | 移除硬编码收费金额，引用真实系统参数 |
| 7 | 八步操作方法 | 当前已覆盖 | 链接统一指向 V2 |
| 8 | 角色指南 | 当前有六角色卡片 | R26 验收重点聚焦员工/项目经理/管理层三条路径 |
| 9 | 材料矩阵 | 当前有材料说明 | 与 V2 材料页面用词统一 |
| 10 | FAQ 与快捷入口 | 当前有 FAQ | 快捷入口只进入 V2 |
| 11 | 从导览进入工序抽屉 | 当前仍可能进入旧项目页 | 使用 `/v2/projects/:id?taskId=` |
| 12 | 导览验收 | 没有独立视觉证据门禁 | 纳入 R26 每页 90 分门禁 |

## 6. 必须废弃或隔离的旧 UI

“废弃”指不得进入 V2 渲染树，不代表 Gate 0 删除文件。

### 6.1 V2 必须替换

- `apps/web/src/components/app-shell.tsx`：V1 保留，V2 使用独立外壳。
- `apps/web/src/app/r22.css`：V1 保留，V2 不继承全局选择器。
- `apps/web/src/components/r22-ui.tsx`：不作为 V2 设计组件库。
- `apps/web/src/components/project-workspace-r22.tsx`：由 V2 固定 SVG 工作区替换。
- `apps/web/src/components/flow-map-workspace.tsx`：保留数据/交互经验，不保留页面外壳。
- `apps/web/src/components/projects-flow-map-portal.tsx`：V2 不再有第二个流程地图入口。
- `apps/web/src/components/project-timeline-board.tsx`
- `apps/web/src/components/project-detail-timeline.tsx`
- `apps/web/src/components/timeline-node.tsx`
- `apps/web/src/components/page-placeholder.tsx`：V2 正式路由禁止占位页。

### 6.2 只复用数据访问或业务规则，不复用视图

- `dashboard-workspace.tsx`
- `projects-list-client.tsx`
- `tasks-workspace.tsx`
- `progress-workspace-r22.tsx`
- `materials-upload-r22.tsx`
- `project-retrospective-r22.tsx`
- `admin-dashboard-r22.tsx`
- `system-guide-page.tsx`
- `analytics-center.tsx`
- `materials-center.tsx`
- `monthly-reviews-board.tsx`

### 6.3 保留并重新嵌入

- `admin-audit-workspace-r25a.tsx` 的审计能力；
- procurement、review、fee、production、attachment 等业务模块的数据与操作能力；
- `auth-client`、API clients、共享枚举、状态文案；
- 所有后端 Controller/Service 权限、状态、幂等、审计逻辑；
- R19/R24 的上传扩展名、MIME、文件魔数、路径穿越、权限和同源校验。

## 7. Gate 0 决定

- 新代码必须隔离在 V2 路由与 V2 组件树中。
- V1 页面继续可回退，但不得再作为 R26 视觉验收对象。
- Gate 1 不接管 V1 主路由，不部署，不写生产数据。
- 当前 UI 截图只证明现状与失败，不构成 V2 验收通过。
