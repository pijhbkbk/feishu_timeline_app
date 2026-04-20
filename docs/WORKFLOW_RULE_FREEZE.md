# 工作流冻结基线

## 目的

这份文档把“轻卡新颜色开发项目管理系统”当前 MVP 的核心流程规则冻结下来，作为产品、后端实现、测试用例和后续部署联调的统一基线。

本基线优先约束 5 件事：

- 节点规则
- 阻塞关系
- 长周期节点定义
- 回退逻辑
- 工作日/SLA 算法

如业务要修改其中任一项，必须同步更新：

- `docs/WORKFLOW_RULE_FREEZE.md`
- `apps/api/src/modules/workflows/workflow-node.constants.ts`
- `apps/api/src/modules/workflows/workflow-node.constants.spec.ts`
- `apps/api/src/modules/workflows/workflow-acceptance.spec.ts`

## 统一命名

以下名称作为当前仓库的正式名称，不再混用其他口径：

- `DEVELOPMENT_ACCEPTANCE`：颜色开发收费
- `MASS_PRODUCTION`：批量生产
- `VISUAL_COLOR_DIFFERENCE_REVIEW`：色差目视评审
- `PROJECT_CLOSED`：颜色退出

## 节点总览

当前 MVP 共 18 个节点，其中 13 个主线节点、5 个并行节点。

| 节点编码 | 节点名称 | 类型 | 是否阻塞主线 | 触发方式 |
| --- | --- | --- | --- | --- |
| `PROJECT_INITIATION` | 项目立项 | 主线 | 是 | 项目创建后初始化 |
| `DEVELOPMENT_REPORT` | 新颜色开发报告 | 主线 | 是 | 项目立项完成后 |
| `PAINT_DEVELOPMENT` | 涂料开发 | 主线 | 是 | 开发报告完成后 |
| `SAMPLE_COLOR_CONFIRMATION` | 样板颜色确认 | 主线评审 | 是 | 涂料开发完成后 |
| `PAINT_PROCUREMENT` | 涂料采购 | 主线 | 是 | 样板颜色确认通过后 |
| `COLOR_NUMBERING` | 新颜色取号 | 并行 | 否 | 样板颜色确认通过后并行创建 |
| `PERFORMANCE_TEST` | 涂料性能试验 | 并行 | 否 | 涂料采购完成后并行创建 |
| `STANDARD_BOARD_PRODUCTION` | 标准板制作、下发 | 并行 | 否 | 涂料采购完成后并行创建 |
| `BOARD_DETAIL_UPDATE` | 色板明细更新 | 并行 | 否 | 标准板制作完成后自动创建 |
| `FIRST_UNIT_PRODUCTION_PLAN` | 首台生产计划 | 主线 | 是 | 涂料采购完成后 |
| `TRIAL_PRODUCTION` | 样车试制 | 主线 | 是 | 首台生产计划完成后 |
| `CAB_REVIEW` | 样车驾驶室评审 | 主线评审 | 是 | 样车试制完成后 |
| `DEVELOPMENT_ACCEPTANCE` | 颜色开发收费 | 并行 | 否 | 驾驶室评审通过后并行创建 |
| `COLOR_CONSISTENCY_REVIEW` | 颜色一致性评审 | 主线评审 | 是 | 驾驶室评审通过后 |
| `MASS_PRODUCTION_PLAN` | 排产计划 | 主线 | 是 | 一致性评审通过后 |
| `MASS_PRODUCTION` | 批量生产 | 主线 | 是 | 排产计划完成后 |
| `VISUAL_COLOR_DIFFERENCE_REVIEW` | 色差目视评审 | 主线评审 | 是 | 批量生产完成后 |
| `PROJECT_CLOSED` | 颜色退出 | 主线 | 是 | 色差目视评审通过或完成后 |

## 主线与并行规则

当前冻结规则如下：

- 主线只由 `isPrimary = true` 的任务推进。
- 并行节点可以独立执行，但不会阻塞主线继续创建下一个主线节点。
- 当前明确不阻塞主线的节点是：
  - `COLOR_NUMBERING`
  - `PERFORMANCE_TEST`
  - `STANDARD_BOARD_PRODUCTION`
  - `BOARD_DETAIL_UPDATE`
  - `DEVELOPMENT_ACCEPTANCE`
- 如果未来业务要求“并行节点完成前不得推进主线”，必须显式升级为主线阻塞规则，不能在前端临时加提示替代。

## 流转规则

当前冻结的后端流转规则如下：

| 当前节点 | 动作 | 下一个节点 |
| --- | --- | --- |
| `PROJECT_INITIATION` | `SUBMIT` / `COMPLETE` | `DEVELOPMENT_REPORT` |
| `DEVELOPMENT_REPORT` | `SUBMIT` / `COMPLETE` | `PAINT_DEVELOPMENT` |
| `PAINT_DEVELOPMENT` | `SUBMIT` / `COMPLETE` | `SAMPLE_COLOR_CONFIRMATION` |
| `SAMPLE_COLOR_CONFIRMATION` | `APPROVE` | `PAINT_PROCUREMENT` + `COLOR_NUMBERING` |
| `PAINT_PROCUREMENT` | `SUBMIT` / `COMPLETE` | `FIRST_UNIT_PRODUCTION_PLAN` + `PERFORMANCE_TEST` + `STANDARD_BOARD_PRODUCTION` |
| `STANDARD_BOARD_PRODUCTION` | `SUBMIT` / `COMPLETE` | `BOARD_DETAIL_UPDATE` |
| `FIRST_UNIT_PRODUCTION_PLAN` | `SUBMIT` / `COMPLETE` | `TRIAL_PRODUCTION` |
| `TRIAL_PRODUCTION` | `SUBMIT` / `COMPLETE` | `CAB_REVIEW` |
| `CAB_REVIEW` | `APPROVE` | `COLOR_CONSISTENCY_REVIEW` + `DEVELOPMENT_ACCEPTANCE` |
| `COLOR_CONSISTENCY_REVIEW` | `APPROVE` | `MASS_PRODUCTION_PLAN` |
| `MASS_PRODUCTION_PLAN` | `SUBMIT` / `COMPLETE` | `MASS_PRODUCTION` |
| `MASS_PRODUCTION` | `SUBMIT` / `COMPLETE` | `VISUAL_COLOR_DIFFERENCE_REVIEW` |
| `VISUAL_COLOR_DIFFERENCE_REVIEW` | `APPROVE` / `COMPLETE` | `PROJECT_CLOSED` |

规则补充：

- 前端只能提交动作，不能直接改项目阶段。
- 审核型节点必须通过后端决定 `APPROVE`、`REJECT`、`RETURN` 的落点。
- 所有状态变化必须保留 `workflow_transitions` 和 `audit_logs`。

## 回退逻辑

当前冻结的退回规则如下：

| 当前节点 | 动作 | 退回目标 |
| --- | --- | --- |
| `CAB_REVIEW` | `REJECT` / `RETURN` | `TRIAL_PRODUCTION` |
| `COLOR_CONSISTENCY_REVIEW` | `REJECT` / `RETURN` | `PAINT_DEVELOPMENT` |
| `VISUAL_COLOR_DIFFERENCE_REVIEW` | `REJECT` / `RETURN` | `MASS_PRODUCTION` |

回退语义统一如下：

- 回退是“生成新的待办任务”，不是覆盖旧任务。
- 历史任务、评审记录、附件、日志必须保留。
- 评审相关轮次通过 `reviewRound` 等字段保留历史，不得就地覆盖。
- 任何回退都必须留下原因和操作人。

## 长周期节点定义

当前 MVP 对长周期节点的冻结结论如下：

- 当前仓库已实现第 16 步完成后自动创建 `recurring_plan`，并一次性生成 12 条第 17 步月度任务。
- 当前仓库仍保留既有 `VISUAL_COLOR_DIFFERENCE_REVIEW` workflow task 作为第 17 步入口容器，周期任务完成后的自动收口尚未完全替换旧的一次性闭环逻辑。
- `PROJECT_CLOSED` 已扩展出年度退出决策字段，但“第 17 步 12 条任务全部完成后自动创建第 18 步”仍属于后续补齐项。

这意味着：

- 现阶段系统已经具备“月度计划 + 12 条实例任务”的基础数据与生成能力。
- 现阶段系统仍不能把“第 17 步完成后自动闭环到第 18 步”当作已全部实现能力对外承诺。

## 工作日与 SLA 算法

当前业务冻结目标如下：

- 每个节点最终都应有独立 SLA，不允许继续按“项目总时长比例”推算作为正式规则。
- SLA 的单位应是“工作日”，不是自然日。
- 计算基准应是“任务激活时间”，不是项目立项时间。
- 工作日算法至少应支持：
  - 跳过周六、周日
  - 预留法定节假日与调休表扩展位
  - 人工改期必须留痕

当前实现状态如下：

- 已新增 `apps/api/src/modules/workflows/workflow-deadline.service.ts`，按节点定义 + 工作日历计算 `dueAt/effectiveDueAt`。
- 当前已支持 `WORKDAY`、`SAME_DAY`、`MONTH_END`、`MONTH_OFFSET`、`MANUAL_REVIEW_PASS`、`RECURRING_MONTHLY` 的基础截止时间逻辑。
- 当前已支持活跃任务 `overdueDays` 刷新，但人工改期入口和全系统读模型联动仍需继续补齐。

因此后续代码改造应遵守：

1. 继续把 `effectiveDueAt/overdueDays` 接入更多查询与页面读模型。
2. 补人工改期、改期留痕和 SLA 变更审计。
3. 把周期任务完成后的第 18 步自动触发补齐。

在这三步完成前，页面上的“超期”虽然已有后端计算基础，但仍不应直接作为完整考核口径。

## 与当前代码的对应关系

这份基线已和当前实现对齐到以下文件：

- `apps/api/src/modules/workflows/workflow-node.constants.ts`
- `apps/api/src/modules/workflows/workflows.service.ts`
- `apps/api/src/modules/reviews/reviews.service.ts`
- `docs/DEVELOPMENT.md`
- `docs/MVP_ACCEPTANCE.md`

如果业务继续沿着分享链接里的方向推进，优先级应为：

1. 补齐“第 17 步全部完成后自动创建第 18 步”的周期收口
2. 把 `effectiveDueAt/overdueDays` 继续接到更多业务查询与前端展示
3. 补“并行节点是否阻塞主线”的显式配置
