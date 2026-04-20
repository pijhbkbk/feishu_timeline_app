# 开发文档

冻结后的节点规则、阻塞关系、回退逻辑和工作日/SLA 基线，统一以 [`docs/WORKFLOW_RULE_FREEZE.md`](/Users/lixiaochen/Downloads/feishu_timeline_app/docs/WORKFLOW_RULE_FREEZE.md) 为准。

## 系统模块

- 认证与权限：飞书身份与业务 RBAC 分离，接口统一后端鉴权
- 项目管理：项目 CRUD、成员管理、项目总览
- 工作流引擎：后端控制节点流转、并行节点、退回逻辑
- 业务节点：开发报告、样板确认、采购、性能试验、标准板、首台计划、试制、评审、收费、排产、批产、颜色退出
- 附件中心：对象存储 + 元数据 + 逻辑删除
- 日志中心：`workflow_transitions + audit_logs + notifications`
- Dashboard / 待办：按当前登录用户聚合项目和任务
- 通知中心：站内通知 + Redis 队列 + mock 飞书消息适配层

## 工作流节点说明

主链路：

1. `PROJECT_INITIATION` 项目立项
2. `DEVELOPMENT_REPORT` 新颜色开发报告
3. `PAINT_DEVELOPMENT` 涂料开发
4. `SAMPLE_COLOR_CONFIRMATION` 样板确认
5. `PAINT_PROCUREMENT` 涂料采购
6. `FIRST_UNIT_PRODUCTION_PLAN` 首台计划
7. `TRIAL_PRODUCTION` 样车试制
8. `CAB_REVIEW` 驾驶室评审
9. `COLOR_CONSISTENCY_REVIEW` 一致性评审
10. `MASS_PRODUCTION_PLAN` 排产计划
11. `MASS_PRODUCTION` 批量生产
12. `VISUAL_COLOR_DIFFERENCE_REVIEW` 目视色差评审
13. `PROJECT_CLOSED` 颜色退出

并行节点：

- `COLOR_NUMBERING`：样板确认通过后并行创建
- `PERFORMANCE_TEST`：采购完成后并行创建
- `STANDARD_BOARD_PRODUCTION`：采购完成后并行创建
- `BOARD_DETAIL_UPDATE`：标准板完成后自动创建
- `DEVELOPMENT_ACCEPTANCE`：驾驶室评审通过后并行创建

退回规则：

- `CAB_REVIEW -> TRIAL_PRODUCTION`
- `COLOR_CONSISTENCY_REVIEW -> PAINT_DEVELOPMENT`
- `VISUAL_COLOR_DIFFERENCE_REVIEW -> MASS_PRODUCTION`

## 主要表结构

- `projects`：项目主表，记录状态、优先级、当前节点、日期、负责人
- `workflow_instances`：项目流程实例
- `workflow_tasks`：节点任务与负责人、状态、截止时间
- `workflow_transitions`：每次流转的历史
- `review_records`：驾驶室评审、一致性评审、目视色差评审
- `attachments`：附件元数据，不存二进制
- `audit_logs`：关键写操作审计日志
- `notifications`：站内通知与发送状态
- `colors / color_exits`：颜色主数据与颜色退出记录

## 角色说明

- `admin`：全局管理
- `project_manager`：项目推进与关键操作
- `process_engineer`：开发、标准板、计划、试制、批产、颜色退出
- `quality_engineer`：性能试验、样板确认、评审辅助
- `purchaser`：采购与供应商
- `reviewer`：驾驶室、一致性、目视色差评审
- `finance`：开发收费

## 通知机制

- 站内通知为 MVP 必做，写入 `notifications`
- Redis 队列只做异步投递与重试，不参与主事务成败
- 主业务成功后再 enqueue，队列失败不回滚业务
- 当前已实现：
  - 新任务分配提醒
  - 待评审提醒
  - 节点退回提醒
  - 超期扫描提醒
- 飞书消息当前为 mock 适配层，保留未来替换口

## 已知限制

- 当前没有真实飞书消息发送链路
- 当前没有真实 PostgreSQL + Redis 基础设施时，无法在本机完成真 DB 联调
- 当前“E2E”是 route smoke，不是浏览器自动化回放
- 未实现对外 ERP / MES / LIMS / 发票系统集成
- 未实现复杂 BI、BPMN 设计器、移动端 App
