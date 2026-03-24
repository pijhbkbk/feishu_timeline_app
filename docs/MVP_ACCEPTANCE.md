# MVP 验收清单

## 已完成功能

- 项目 CRUD、项目成员管理、项目总览
- 工作流引擎、并行节点、退回逻辑
- 开发报告、样板确认、采购、性能试验、标准板、色板明细更新
- 首台计划、样车试制、驾驶室评审、一致性评审、开发收费
- 排产计划、批量生产、目视色差评审、颜色退出
- 附件中心、项目日志、Dashboard、我的待办、站内通知

## 未完成功能

- 真实飞书消息发送
- 外部 ERP / MES / LIMS / 发票系统集成
- 浏览器级 Playwright 自动化回放
- 复杂 BI 报表与拖拽式排程

## 已知风险

- 当前环境缺少 PostgreSQL / Redis 基础设施时，只能做服务级和 route smoke 级联调
- 通知去重当前为 MVP 规则，长周期高并发场景还需要更细粒度策略
- 项目权限范围目前以角色和任务负责人为主，未实现更细的项目可见性模型
- 附件预览仅覆盖图片和 PDF，Office 文件仍以下载为主

## 后续建议

1. 在真实 PostgreSQL + Redis 环境补一轮完整人工回归
2. 接飞书真实消息发送与登录联调
3. 增加浏览器级 E2E 自动化
4. 增补接口级权限回归与更细粒度项目可见性

## 手工验收步骤

准备：

1. `pnpm install`
2. `pnpm infra:up`
3. `pnpm prisma:migrate`
4. `pnpm prisma:seed`
5. `pnpm dev`

工作台验收：

1. 使用 `mock_reviewer` 或 `mock_project_manager` 登录
2. 进入 `/dashboard`
3. 验证 KPI、阶段分布、最近评审、高风险项目、我的待办、超期任务
4. 点击通知中心，验证未读数、已读操作、跳转

项目与流程验收：

1. 打开 `DEMO-ACTIVE-001`
2. 检查 `/overview`、`/workflow`、`/tasks`、`/logs`、`/attachments`
3. 在 `/reviews` 验证驾驶室评审与一致性评审面板都可进入
4. 检查流程页当前节点为驾驶室评审，且有历史流转

完整闭环验收：

1. 打开 `DEMO-COMPLETE-001`
2. 检查主流程已到 `颜色退出`
3. 检查 `/color-exit` 已完成
4. 检查 `/logs` 存在流程、审计、通知记录
5. 检查颜色主数据状态为 `EXITED`

退回逻辑验收：

1. 通过测试用例验证：
   - `CAB_REVIEW -> TRIAL_PRODUCTION`
   - `COLOR_CONSISTENCY_REVIEW -> PAINT_DEVELOPMENT`
   - `VISUAL_COLOR_DIFFERENCE_REVIEW -> MASS_PRODUCTION`

## 本轮结论

- 代码侧已补齐主链路、关键并行链路、退回链路、附件、日志、通知、Dashboard
- 当前仓库已具备 MVP 交付基础
- 真正的最终验收仍需要在具备 PostgreSQL 与 Redis 的环境做一次完整人工联调
