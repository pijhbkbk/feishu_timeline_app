# R11 UAT 记录

## 环境与口径

- 执行日期：`2026-04-23`
- 执行位置：GCE 生产实例 `instance-20260408-091840`
- UAT 运行面：生产机隔离 schema `r11_uat_1776930907` + 临时 API `http://127.0.0.1:3301/api`
- 生产验证面：`https://timeline.all-too-well.com`
- 本轮未改动已冻结流程规则，只修复了：
  - 第 13 步后端固定收费金额门禁缺失
  - reviewer / quality_engineer / finance / purchaser 的 `workflow.transition` 权限缺失
  - 演示种子中旧的 `8600` 收费口径

## UAT 场景

### 场景 1：正常主线 1→16

- 前置数据：新建项目 `R11-UAT-1776930934109`
- 参与角色：`project_manager`、`process_engineer`
- 操作步骤：
  1. 项目经理创建项目并推进第 1~6 步
  2. 工艺工程师创建并完成“首台生产计划”
  3. 工艺工程师创建并完成“样车试制”
  4. 评审、收费、一致性、排产、批量生产依次完成
- 预期结果：主线完成第 16 步后，当前节点切到第 17 步入口
- 实际结果：`currentNode=VISUAL_COLOR_DIFFERENCE_REVIEW`
- 是否通过：`PASS`

### 场景 2：第 12 步不通过退回第 11 步并生成新轮次

- 前置数据：场景 1 的同一项目，已存在首轮样车试制记录
- 参与角色：`process_engineer`、`reviewer`
- 操作步骤：
  1. reviewer 创建并提交驾驶室评审记录，结论为 `REJECTED`
  2. reviewer 执行驳回
  3. 工艺工程师补建第二轮样车试制记录并完成
- 预期结果：第 11 步生成第 2 轮活跃任务
- 实际结果：`newRound=2`，轮次历史 `history=2`
- 是否通过：`PASS`

### 场景 3：第 9 步未完成但主线继续推进

- 前置数据：项目已完成第 6 步
- 参与角色：`process_engineer`
- 操作步骤：
  1. 第 6 步完成后检查并行任务
  2. 工艺工程师完成“首台生产计划”任务
- 预期结果：即使第 9 步仍活跃，主线仍进入第 11 步
- 实际结果：`currentNode=TRIAL_PRODUCTION`，`performanceActive=true`
- 是否通过：`PASS`

### 场景 4：第 16 步完成后生成第 17 步 12 个月度实例

- 前置数据：项目已完成第 16 步“批量生产”
- 参与角色：`project_manager`
- 操作步骤：
  1. 查询 `/api/workflows/projects/:projectId/monthly-reviews`
  2. 检查 recurring plan 与 recurring task 数量
- 预期结果：`generatedCount=12` 且实例列表为 12 条
- 实际结果：`generatedCount=12`，`taskCount=12`
- 是否通过：`PASS`

### 场景 5：第 18 步人工录入年产量并给出退出建议

- 前置数据：第 17 步入口评审通过，第 18 步已激活
- 参与角色：`reviewer`、`process_engineer`
- 操作步骤：
  1. reviewer 提交并通过目视色差评审
  2. 工艺工程师打开颜色退出工作区
  3. 录入 `annualOutput=18`、`finalDecision=EXIT` 并完成退出
- 预期结果：阈值 20 下给出 `EXIT` 系统建议，且退出任务可完成
- 实际结果：`threshold=20`，`annualOutput=18`，`systemSuggestion=EXIT`，`finalDecision=EXIT`
- 是否通过：`PASS`

## 权限验收

- `admin`
  - 可查看项目详情：`GET /api/projects/:projectId` 返回 `200`
- `project_manager`
  - 可创建项目：`POST /api/projects` 成功
- `finance`
  - 不可创建项目：`POST /api/projects` 返回 `403`
  - 可上传项目附件：`POST /api/projects/:projectId/attachments/upload` 返回 `201`
  - 可管理第 13 步收费，但后端会拒绝非固定金额：`8600` 返回 `400`
- `reviewer`
  - 可提交并驳回驾驶室评审：`/api/projects/:projectId/reviews/cabin/*` 返回 `200`
  - 可提交并通过目视色差评审：`/api/projects/:projectId/reviews/visual-delta/*` 返回 `200`
- `quality_engineer`
  - 可提交并通过一致性评审：`/api/projects/:projectId/reviews/consistency/*` 返回 `200`

## Feishu 登录链路验证

- 生产 `GET /api/auth/session` 返回：`authenticated=false`、`mockEnabled=false`、`feishuEnabled=true`
- 生产 `GET /api/auth/feishu/login-url` 返回：`enabled=true`
- 返回的授权 URL 中 `redirect_uri` 为：
  - `https://timeline.all-too-well.com/login/callback`
- 生产 `GET https://timeline.all-too-well.com/login/callback` 返回 `200`
- 结论：
  - 已完成真实生产 Feishu 登录入口、跳转地址和回调配置验证
  - 本轮未执行“真人 Feishu 账号授权后回调落会话”的交互式闭环，这一项记为非 blocker 运行债务

## 硬门禁映射

- 流程主线可跑通到第 16 步：场景 1
- 第 12 步不通过可退回第 11 步新轮次：场景 2
- 第 9 步不阻塞主线：场景 3
- 第 17 步自动生成 12 个按月实例：场景 4
- 第 13 步固定金额 10000：
  - 工作区 `fixedAmount=10000`
  - 非法金额 `8600` 被后端拒绝
  - 演示种子已统一到 `10000`
- 第 18 步支持人工录入年产量：场景 5
- 关键动作具备审计日志：
  - 本轮项目日志汇总：`auditCount=48`、`workflowCount=23`、`totalCount=71`

## 结论

- 通过场景数：`5 / 5`
- blocker：`无`
- 非 blocker 债务：
  - 真实 Feishu 账号交互式授权回调尚未人工点通，但登录 URL、回调地址和入口可用性已验证
