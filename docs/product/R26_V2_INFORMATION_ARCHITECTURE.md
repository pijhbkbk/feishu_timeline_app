# R26_PRODUCT_UI_RECOVERY — V2 信息架构

## 1. V2 隔离策略

R26 采用“独立路由 + 显式开关”双重隔离，不在 Gate 1 覆盖现有正式路由。

规划约束：

```text
PRODUCT_UI_V2_ENABLED=false     # 是否允许访问 /v2
PRODUCT_UI_DEFAULT_VERSION=v1   # 登录后的默认产品版本
```

Gate 0 只记录约束，不新增环境变量、不修改代码。

Gate 1：

- 只创建 `/v2/*` 静态原型；
- V1 `/dashboard`、`/projects` 等路由保持不变；
- V2 不执行生产写操作；
- V2 页面可使用明确标注为“原型数据”的本地 fixtures，但不得进入生产构建；
- 只有视觉闸门确认后，Gate 2 才允许把 V2 接到现有只读 API；
- 只有预发布闸门确认后，才讨论把默认版本切到 V2。

## 2. V2 全局导航

### 2.1 主导航

以 P1 为基础，并应用 2026-07-23 产品负责人确认的导航命名覆盖：

1. 工作台
2. 项目列表
3. 我的任务
4. 进展提交
5. 系统管理

右侧辅助动作：

- 搜索；
- 通知；
- 帮助；
- 用户菜单。

`系统管理` 在 Gate 1 仍为禁用入口，目标路由固定为 `/v2/admin`；开放时必须
继续执行管理员权限校验。原“复盘分析”页面职责保留在
`/v2/retrospectives` 的信息架构中，但不再占用主导航。

### 2.2 路由表

| V2 路由 | 页面职责 | 主动作 |
|---|---|---|
| `/v2/dashboard` | 员工今天最应该做什么 | 处理当前任务 |
| `/v2/projects` | 项目是否正常、哪里停滞 | 打开项目 |
| `/v2/projects/:projectId` | 当前项目在哪一步、下一步是什么 | 打开当前工序 / 提交进展 |
| `/v2/tasks` | 我的任务按什么顺序处理 | 打开任务 |
| `/v2/progress` | 60 秒记录真实进展 | 提交进展 |
| `/v2/materials/upload` | 当前工序缺什么材料 | 添加材料 |
| `/v2/retrospectives` | 多项目有哪些可复用结论 | 打开项目复盘 |
| `/v2/projects/:projectId/retrospective` | 项目为何延期、如何改进 | 保存改进项 |
| `/v2/admin` | 组织、权限、参数、审计是否正常 | 打开管理模块 |
| `/v2/guide` | 如何理解流程并完成操作 | 开始处理任务 |

兼容路由：

- `/v2/projects/:projectId/flow-map` 只允许 308 重定向到 `/v2/projects/:projectId`；
- 选中节点使用 `/v2/projects/:projectId?taskId=:taskId`；
- 不创建 `/v2/projects/timeline`、`/v2/projects/timeline-board`、`/v2/todos`；
- `/v2/tasks` 内部筛选替代 `/tasks/my`、`/tasks/pending`、`/tasks/overdue`；
- `/v2/retrospectives` 吸收当前 `/analytics` 的组合分析职责；
- 业务模块由项目工作区抽屉/面板进入，不全部暴露为主级路由。

## 3. V2 页面结构

### 3.1 `/v2/dashboard`

页面唯一问题：今天最应该推进什么？

```text
大字号问候 + 今日摘要                         [处理当前任务]
┌──────────────── 当前任务 ────────────────┐ ┌──── 下一项 ────┐
│ 项目、工序、截止、进度、材料、阻塞           │ │ 下一任务摘要     │
└────────────────────────────────────────┘ └───────────────┘
四项个人 KPI
最近项目动态
```

约束：

- 首屏只有一个主按钮；
- 当前任务卡是页面最大视觉对象；
- 任务事实不得使用 12–13px；
- 无任务时显示安静的完成态，不显示演示数据。

### 3.2 `/v2/projects`

页面唯一问题：哪些项目需要介入，为什么？

```text
标题 + 新建项目
活跃 / 风险 / 本周到期 / 等待评审
快速筛选 + 搜索
项目宽卡片
├── 项目、颜色、当前阶段、进度
├── 负责人、截止时间、最近更新
└── 停滞原因、协助人、预计解决时间
```

约束：

- 风险卡必须显示具体停滞原因，不只显示“高风险”；
- 卡片主动作是“打开项目”；
- 高级筛选折叠，不占首屏；
- 只有真实 API 返回的数据能进入正式版本。

### 3.3 `/v2/projects/:projectId`

页面唯一问题：当前在哪一步，谁负责，下一步是什么？

```text
项目标题 / 颜色 / 当前工序 / 进度 / 更新时间
┌── 项目切换 ─┬──────── 固定 SVG 流程地图 ────────┬── 工序详情抽屉 ─┐
│ 最近项目     │ 18 个固定节点、连线、风险、当前节点 │ 状态 / 人 / SLA  │
│ 收藏项目     │ 点击节点；缩放只作用于地图          │ 材料 / 历史 / 动作│
└─────────────┴──────────────────────────────────┴───────────────┘
最近活动
```

P1 与 P2 的合并规则：

- 页面外壳、标题、留白、字体使用 P1；
- 中间地图、节点、抽屉、刷新使用 P2；
- 项目切换是桌面辅助栏，不是全局导航；
- 抽屉关闭后保持地图缩放与滚动位置；
- 移动端不显示三栏：地图全宽，工序详情为全屏 sheet；
- 当前任务的主要操作仍跳转 `/v2/progress?taskId=`。

### 3.4 `/v2/progress`

页面唯一问题：如何在 60 秒内提交可信进展？

```text
标题 + 自动带入的项目/工序上下文
[1 做了什么] → [2 是否阻塞] → [3 上传材料]
当前步骤主内容
固定底部：保存草稿 / 下一步 / 提交进展
```

步骤：

1. 做了什么：完成百分比、已完成事项、下一步计划；
2. 是否阻塞：无阻塞 / 有阻塞；有阻塞时要求类型、描述、协助人、预计解决；
3. 上传材料：必交清单、已上传、添加材料、提交摘要。

约束：

- 不在首次进入时循环改写 URL 导致空白；
- 编辑期间刷新不能覆盖用户输入；
- 提交写操作继续走后端幂等、权限、状态校验；
- 附件继续走 R19/R24 安全链路。

### 3.5 `/v2/tasks`

页面唯一问题：下一项应该处理什么？

同页五个筛选：

- 待我处理；
- 待我评审；
- 即将到期；
- 已逾期；
- 已完成。

每张任务卡只保留：

- 项目与工序；
- 优先级/状态；
- 截止时间；
- 材料缺口或阻塞；
- 一个与任务状态匹配的主按钮。

### 3.6 `/v2/materials/upload`

页面唯一问题：当前工序缺什么、已经有什么、现在上传什么？

桌面三栏：

1. 必交材料；
2. 已上传材料；
3. 添加/替换材料。

移动端按同一顺序纵向排列。不得出现 `Required`、`Upload`、`History` 等内部英文标注。

### 3.7 `/v2/projects/:projectId/retrospective`

页面唯一问题：项目为什么出现偏差，下一次怎么做得更好？

结构：

- 一句话项目结论；
- 延期/正常结论；
- 五阶段计划与实际；
- 最慢阶段与瓶颈；
- 优势、问题、可复用经验；
- 改进措施、负责人、截止时间；
- 保存草稿 / 完成复盘。

### 3.8 `/v2/retrospectives`

页面唯一问题：跨项目有哪些可复用的规律？

- 项目复盘列表；
- 周期、延期、返工、月度评审、颜色退出聚合；
- 筛选后打开单项目复盘；
- 不再与 `/analytics` 形成两套入口。

### 3.9 `/v2/admin`

页面唯一问题：组织、权限、流程参数、审计风险是否正常？

模块：

- 组织与用户；
- 角色与权限；
- 流程与参数；
- 审计与异常。

管理员子模块可以使用页面内二级导航或抽屉，不以五个全宽横向标签压缩内容。普通用户不可见，服务端继续强制校验。

### 3.10 `/v2/guide`

页面唯一问题：我该如何理解流程并开始工作？

页面内部锚点：

1. 系统目的；
2. 18 步四阶段；
3. 关键业务规则；
4. 如何操作；
5. 角色指南；
6. 材料说明；
7. FAQ。

导览页只能链接 V2 页面，不创建独立全局侧边栏。

## 4. 项目工作区数据模型

V2 不复制数据库模型，使用现有 API 组合为只读 ViewModel。

```ts
type ProjectWorkspaceV2 = {
  project: {
    id: string;
    code: string;
    name: string;
    colorName: string;
    colorCode: string | null;
    status: ProjectStatus;
    priority: ProjectPriority;
    progressPercent: number;
    currentNodeCode: WorkflowNodeCode | null;
    currentNodeName: string;
    currentOwner: PersonRef | null;
    currentDepartment: DepartmentRef | null;
    plannedEndDate: string | null;
    lastUpdatedAt: string;
  };
  map: {
    topologyVersion: "COLOR_DEVELOPMENT_V1";
    nodes: FlowNodeV2[];
    edges: FlowEdgeV2[];
    selectedTaskId: string | null;
    viewport: { scale: number; x: number; y: number };
  };
  selectedTask: TaskDrawerV2 | null;
  monthlyReview: {
    completed: number;
    total: 12;
    overdue: number;
  };
  recentActivities: ActivityV2[];
  permissions: {
    canRead: boolean;
    canWriteProject: boolean;
    canSubmitProgress: boolean;
    canExecuteAvailableAction: boolean;
  };
  freshness: {
    mapFetchedAt: string;
    detailFetchedAt: string | null;
    activityFetchedAt: string;
    isEditing: boolean;
  };
};
```

现有事实来源：

| V2 数据 | 当前来源 |
|---|---|
| 项目、节点、边、月度进度、活动 | `GET /api/projects/:projectId/flow-map` |
| 节点负责人、SLA、材料、附件、评审、费用、颜色退出、动作 | `GET /api/workflows/tasks/:taskId/detail` |
| 项目列表与停滞原因 | `GET /api/projects` |
| 进展提交 | `POST /api/tasks/:taskId/progress` |
| 附件上传/绑定/版本 | `/api/projects/:projectId/attachments/*` |
| 流程动作 | `/api/workflows/tasks/:taskId/{start|submit|approve|reject|return|complete}` |

数据库映射保持不变：

- `Project`、`Color`、`ProjectMember`
- `WorkflowInstance`、`WorkflowTask`、`WorkflowTransition`
- `TaskProgressUpdate`、`TaskBlocker`
- `ReviewRecord`、`RecurringPlan`、`RecurringTask`
- `Attachment`、`DevelopmentFee`、`ColorExit`
- `ProjectRetrospective`、`AuditLog`

前端不得：

- 推断并写入流程状态；
- 硬编码收费金额、当前节点或进度；
- 绕过后端 available actions；
- 把附件二进制写入 PostgreSQL；
- 用 PPT 图片作为产品背景。

## 5. 三条操作路径

### 5.1 员工

```text
/v2/dashboard
→ 看见唯一当前任务
→ /v2/progress?taskId=
→ 1 做了什么
→ 2 是否阻塞
→ 3 上传材料
→ 提交成功
→ /v2/projects/:projectId?taskId=
```

验收目标：

- 5 秒内找到当前任务；
- 60 秒内完成一条真实进展；
- 清楚知道材料缺口和下一步；
- 提交后能在项目历史中看到记录。

### 5.2 项目经理

```text
/v2/projects?view=risk
→ 项目卡直接看停滞原因
→ /v2/projects/:projectId
→ 点击红色/紫色节点
→ 工序抽屉查看负责人、阻塞、SLA、材料、历史
→ 进入允许的协同或进展动作
```

验收目标：

- 5 秒内定位风险项目；
- 2 次点击内打开停滞工序；
- 不需要进入多个技术模块拼接事实；
- 后端仍决定是否可执行动作。

### 5.3 管理层

```text
/v2/projects
→ 查看组合风险与到期
→ /v2/projects/:projectId
→ 查看流程与当前风险
→ /v2/projects/:projectId/retrospective
→ /v2/retrospectives
```

管理员可从用户菜单进入：

```text
/v2/admin
→ 审计与异常
→ 有界列表 / 筛选 / 详情
```

验收目标：

- 不通过密集表格理解项目；
- 能看到结论、延期原因、瓶颈和改进项；
- 管理后台与普通产品导航分离。

## 6. Gate 1 静态原型实施计划

Gate 1 只做静态原型，不接管 V1，不部署。

### 批次 A：V2 基础

1. 建立 V2 独立 layout、tokens、字体、栅格、状态色；
2. 建立桌面/平板/手机 App Shell；
3. 建立按钮、卡片、字段、状态、空态、骨架、抽屉基础组件；
4. 加入不进入生产的 typed fixtures。

### 批次 B：三张关键原型

1. `/v2/dashboard`
2. `/v2/projects/:projectId`
3. `/v2/progress`

其中项目工作区必须使用 `R26_FLOW_MAP_SPEC.md` 的固定 SVG。

### 批次 C：其余正式原型

1. `/v2/projects`
2. `/v2/tasks`
3. `/v2/materials/upload`
4. `/v2/projects/:projectId/retrospective`
5. `/v2/retrospectives`
6. `/v2/admin`
7. `/v2/guide`

### 批次 D：静态视觉验收

每页输出：

- 1440 × 900；
- 1024 × 768；
- 390 × 844；
- PPT 参考图与 V2 截图并排图；
- 视觉评分；
- 未解决偏差列表。

Gate 1 完成后必须停止，等待视觉闸门确认；不得接真实写 API，不得部署。
