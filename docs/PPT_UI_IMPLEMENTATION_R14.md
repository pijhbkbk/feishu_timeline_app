# PPT_UI_IMPLEMENTATION_R14

## 输入设计稿

- `docs/design/轻卡颜色开发项目管理系统_UI界面设计稿.pptx`
- `docs/design/轻卡定制颜色开发项目管理系统_UI界面方案.pptx`
- Quick Look 已输出首屏参考图：`docs/design/ppt-ui-r14-render/轻卡颜色开发项目管理系统_UI界面设计稿.pptx.png`
- 本轮基于 PPT 文本结构与首屏视觉基调落地；本地环境未提供 LibreOffice，未能逐页导出所有幻灯片图片。

## 页面落地映射

| PPT 主题 | 路由 | 主要实现 | 数据来源 |
| --- | --- | --- | --- |
| 首页项目进度驾驶舱 | `/dashboard` | 项目总览、重点项目时间线、月度评审摘要、我的待办、逾期任务、阶段分布 | `/api/dashboard/*`、`/api/tasks/*` |
| 项目时间线看板 | `/projects/timeline` | 横向 18 节点项目卡、当前责任人、截止时间、进度、下一步、筛选器 | `GET /api/dashboard/project-timelines` |
| 项目列表筛选 | `/projects` | 关键词、项目状态、当前工序、负责人、责任部门、逾期、优先级、日期范围 | `GET /api/projects` |
| 项目概览 | `/projects/:id/overview` | 项目摘要、实时刷新状态、基础信息与成员编辑 | `GET /api/projects/:id` |
| 单项目流程时间线 | `/projects/:id/workflow` | 完整节点时间线、流程图、任务表、甘特、状态看板、截止日历、节点详情 | `GET /api/projects/:id/timeline`、`GET /api/workflows/*` |
| 工序清单与详情抽屉 | `/projects/:id/tasks` | 工序任务表、负责人/部门聚合、节点详情与轮次历史 | `GET /api/workflows/*` |
| 材料提交平台 | `/materials`、`/projects/:id/materials` | 全局项目材料入口、项目级材料上传、材料预览、归属绑定 | `GET /api/dashboard/project-timelines`、`GET /api/projects/:id/attachments` |
| 第 12 步驾驶室评审 | `/projects/:id/reviews` | 驾驶室评审记录、结论、驳回与轮次历史 | 既有 reviews/workflows API |
| 第 17 步月度评审台账 | `/monthly-reviews`、`/projects/:id/reviews` | 12 个月份卡片、本月任务、完成进度、对应月份详情入口 | `GET /api/dashboard/monthly-review-board`、既有 monthly reviews API |
| 第 18 步颜色退出 | `/projects/:id/color-exit` | 年产量、退出阈值、系统建议、人工结论、完成入口 | 既有 color-exit API |
| 数据中心 | `/analytics` | 项目概览、流程效率、部门负载、返工原因、月度评审、颜色退出、费用摘要 | `GET /api/analytics/overview` |

## 状态颜色规则

- 未开始：`#9CA3AF`
- 进行中 / 当前节点：`#5B7FA6` / `#4F6F8F`
- 待评审：`#D6A85B`
- 已完成：`#6EA37A`
- 已逾期：`#C86B6B`
- 已退回：`#9B7BB6`

状态中文映射集中在 `apps/web/src/lib/status-labels.ts`，页面仅消费统一标签与色调函数，避免业务状态文案散落。

## 自动刷新策略

- `/dashboard` 每 30 秒轮询，同时提供“立即刷新”。
- `/projects/timeline` 每 30 秒轮询，同时提供“立即刷新”。
- `/projects/:id/overview` 每 15 秒轮询；表单进入编辑状态后暂停自动覆盖未保存输入。
- `/projects/:id/workflow` 每 15 秒轮询，刷新流程、任务、时间线和节点详情。
- `/materials`、`/monthly-reviews`、`/analytics` 使用 30 秒轮询与手动刷新，保持与驾驶舱一致。
- 本轮未引入 WebSocket，保持 MVP 复杂度可控。

## 后端聚合接口

- `GET /api/dashboard/overview`
- `GET /api/dashboard/project-timelines`
- `GET /api/projects/:projectId/timeline`
- `GET /api/dashboard/monthly-review-board`
- `GET /api/analytics/overview`

新增接口均为只读聚合，不改变项目状态机、流程裁决、评审规则或颜色退出业务规则。

## 测试覆盖

- 组件测试新增 PPT UI 面板覆盖：材料入口、月度评审月份卡、数据中心面板。
- Playwright 覆盖首页中文驾驶舱、时间线看板、项目卡片当前节点与进度、项目列表筛选、项目概览刷新、工序清单、材料中心、第 17 步月度评审卡片、数据中心和手动刷新按钮。
- 全量命令当前已通过：`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm --filter @feishu-timeline/web build`、`pnpm --filter @feishu-timeline/api build`。

## 后续优化项

- PPT 全页视觉若需像素级还原，建议补充逐页导出的图片或 Figma 源文件。
- 时间线看板已支持关键词、状态、责任部门、负责人和逾期筛选；后续可增加服务端分页与排序。
- 数据中心为 MVP 聚合分析，后续可接入更细的周期趋势和导出能力。
- 移动端当前可读但仍以横向滚动为主，后续可增加折叠式节点列表。
