# R21B 项目实时流程地图线上可见性修复

## 背景

R21 已实现单项目 `/projects/:projectId/flow-map`，并部署到生产环境。但用户反馈线上页面没有明显变化，无法在主导航和项目入口中直接看到“项目实时流程地图”。

本轮目标不是新增业务规则，而是修复 R21 线上不可见、入口太深、接口失败时长期 loading 的验收问题。

## 线上复现

部署修复前用 Playwright 访问生产域名：

- `https://timeline.all-too-well.com/dashboard`
- `https://timeline.all-too-well.com/projects`
- `https://timeline.all-too-well.com/projects/timeline`
- `https://timeline.all-too-well.com/projects/flow-map`

复现结果：

- VPS 确认运行 R21 commit `d035709`。
- 远端 `.next` 构建中存在 `FlowMapWorkspace` 和 `/projects/[projectId]/flow-map`。
- 主导航无全局“流程地图”入口，用户不知道项目 ID 时无法进入。
- `/projects/flow-map` 在修复前被动态路由误识别为 projectId=`flow-map`，页面上下文显示“项目工作区 / 项目概览”。
- 未登录或接口报错时，部分页面没有明确失败态，容易被误认为一直在加载。

证据：

- `test-results/r21b/prod-dashboard.png`
- `test-results/r21b/prod-projects.png`
- `test-results/r21b/prod-timeline.png`
- `test-results/r21b/prod-flow-map.png`
- `test-results/r21b/prod-before-summary.json`

## 修复内容

### 全局入口

新增页面：

- `/projects/flow-map`

页面能力：

- 标题为“项目实时流程地图”。
- 登录后自动加载当前用户可访问项目。
- 默认选择最近更新项目。
- 提供项目选择器。
- 选择项目后直接展示该项目完整 18 节点流程地图。
- 无项目时显示“暂无可查看的项目”和“新建项目”按钮。
- 未登录或接口失败时显示中文失败态和“登录系统 / 重新加载”按钮。

### 导航入口

新增可见入口：

- 顶部导航：`流程地图`
- 侧边导航：`流程地图`
- 项目列表行操作：`流程地图`
- 项目时间线看板项目卡片：`查看流程地图`
- 项目详情上下文导航：`流程地图`

### Loading / Error 修复

修复以下长期 loading 风险：

- `FlowMapWorkspace` 在接口失败且无 payload 时不再一直展示“正在加载项目实时流程地图”，改为明确错误态。
- `ProjectTimelineBoard` 在未登录或接口失败时不再一直展示“正在加载项目时间线看板”，改为明确错误态。
- `ProjectsListClient` 在未登录、接口失败、无项目时分别展示中文状态和操作按钮。

## 验证命令

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @feishu-timeline/web build
pnpm --filter @feishu-timeline/api build
pnpm --filter @feishu-timeline/api prisma:validate
pnpm test:e2e
pnpm playwright:test
```

结果：

- Web 单测：21 files / 65 tests passed
- API 单测：48 files / 130 tests passed
- Playwright：29 passed
- Web build 输出包含 `/projects/flow-map`

## 后续验收要求

部署后必须再次访问生产域名验证：

- `https://timeline.all-too-well.com/projects/flow-map` 返回 200。
- 页面 HTML 或真实浏览器文本中可见“流程地图”入口。
- 未登录时不再长期停留在 loading，而是显示“请先登录”。
- 登录后可从全局入口选择项目并看到 18 个节点流程地图。

## 可延期优化

- 给 `/projects/flow-map` 增加最近项目快捷卡片。
- 在未登录状态下增加流程地图功能预览图。
- 增加生产域名的登录态 Playwright 验收账号，覆盖真实项目节点点击抽屉。
