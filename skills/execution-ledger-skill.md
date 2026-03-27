# Execution Ledger Skill

本技能面向 ColorDev Orchestrator Agent，也可供 Bug Fix Agent、Regression Guard Agent 参考，用于规范“轻卡新颜色开发项目管理系统”中每轮任务的计划记录、阶段进度、派单记录、产物摘要、验证结果、风险项、回滚点和下一步建议。它是编排层的执行记录，不替代业务数据库日志。

本技能的三条底线：

- 可追溯：能回看本轮到底做了什么、为什么做、做到哪一步。
- 可验收：能看见验证结果、未通过项和交付结论。
- 可回滚：能指出最近稳定点、失败处理路径和未关闭风险。

## 1. Skill 目标

- 为每一轮任务建立统一、可复用的执行账本格式。
- 让计划、执行、验证、回滚信息形成连续记录，而不是分散在对话碎片里。
- 帮助 Orchestrator 对多 Agent 协作进行阶段管理和交付归档。
- 为 Bug Fix Agent、Regression Guard Agent 提供最小但完整的上下文记录结构。
- 支撑代码回溯、业务回溯和问题定位。

## 2. 适用场景

- 多阶段、多 Agent 协作任务。
- 涉及 workflow、review、RBAC、notifications、audit、Prisma 等联动改动。
- 需要明确记录派单、阶段门禁、验证结果和回滚点的中等及以上复杂任务。
- 需要修复高风险 bug，且必须说明复现、修复、回归和残余风险。
- 需要形成可归档交付摘要的任务轮次。

## 3. 不适用场景

- 极小的一次性只读查询或纯说明性回答。
- 无实质执行阶段、无产物、无验证链路的轻量问答。
- 只做单句澄清且没有进入实际执行的任务。

即便在不适用场景下，本技能的字段语义仍可作为简化记录参考。

## 4. 为什么执行账本对代码回溯重要

代码 diff 只能回答“改了什么”，但往往回答不了：

- 为什么这轮要改这些模块。
- 哪些是本轮目标，哪些是明确不做的事项。
- 哪个阶段由哪个 Agent 负责。
- 哪些验证已经通过，哪些风险还没关。
- 若线上再次出现问题，最近稳定回滚点在哪里。

在当前仓库中，workflow、review、notifications、audit、Prisma 往往联动。没有执行账本，容易出现：

- 只看到代码改了，但看不出为什么改。
- 只看到测试过了，但看不出测了哪些边界。
- 只知道通知重复修过，但看不出根因和回滚点。
- 无法区分“这轮做了哪些事”和“数据库里业务对象发生了哪些事”。

## 5. 执行账本应记录哪些字段

建议执行账本至少包含以下字段：

- `goal`
- `scope`
- `non_goals`
- `constraints`
- `task_graph`
- `assigned_agents`
- `artifacts`
- `verification_results`
- `open_risks`
- `rollback_point`
- `current_stage`
- `next_step`
- `decision_log`

如果任务较复杂，还建议增加：

- `entry_conditions`
- `stage_gates`
- `blocked_by`
- `completion_summary`

## 6. `goal / scope / non_goals / assigned_agents / artifacts / verification_results / open_risks / rollback_point` 的建议含义

### 6.1 `goal`

- 本轮单一业务目标。
- 不是愿景，不是方向，而是可交付事项。
- 例如：`调整 COLOR_CONSISTENCY_REVIEW 的退回规则`。

### 6.2 `scope`

- 本轮允许触达的模块、页面、接口、表、节点、通知链路。
- 应尽量写到模块和业务对象粒度。

### 6.3 `non_goals`

- 本轮明确不做的事项。
- 用来防止执行中扩散。
- 非目标必须显式写出，不能默认“大家都知道不做什么”。

### 6.4 `assigned_agents`

- 本轮每个阶段由哪个 Agent 负责。
- 不是随便列名，而是要写清责任范围和边界。

### 6.5 `artifacts`

- 本轮阶段产物或最终产物摘要。
- 包括代码改动、文档、测试、校验结果、迁移、接口合同更新等。

### 6.6 `verification_results`

- 本轮已执行的验证项及结果。
- 包括命令、手工验证、失败用例、回归范围、环境限制说明。

### 6.7 `open_risks`

- 当前尚未关闭的风险。
- 不能因为任务完成就把风险写成空，除非确实关闭。

### 6.8 `rollback_point`

- 最近一个稳定、可回退的阶段点。
- 应能回答“如果下一步失败，回到哪里最安全”。

## 7. 阶段级记录模板

建议每个阶段都使用统一模板：

```markdown
## Stage N: <阶段名称>
- 目标：
- 输入：
- 负责 Agent：
- 范围：
- 非目标：
- 产物：
- 进入条件：
- 阶段门禁：
- 验证结果：
- 风险：
- 回滚点：
- 结论：
```

阶段级模板要求：

- 一阶段只写一件主要事情。
- 每阶段都要能独立回答“做了什么、产出了什么、怎么验证、哪里能回退”。

## 8. 任务级记录模板

建议整轮任务使用如下执行账本模板：

```markdown
# Execution Ledger

## Goal
- 本轮单一目标：

## Scope
- 允许改动范围：

## Non Goals
- 明确不做：

## Constraints
- 必须遵守的仓库边界：

## Assigned Agents
| Stage | Agent | Responsibility |
| --- | --- | --- |

## Task Graph
- Stage 1 -> Stage 2 -> Stage 3

## Artifacts
- 文件级或模块级产物摘要：

## Verification Results
- 已执行命令：
- 手工验证：
- 失败用例 / 回归用例：

## Open Risks
- 尚未关闭风险：

## Rollback Point
- 最近稳定点：

## Next Step
- 下一步建议：
```

## 9. 如何支撑代码回溯、业务回溯和问题定位

### 9.1 支撑代码回溯

- 通过 `goal`、`scope` 和 `artifacts`，知道某段代码为什么改。
- 通过 `assigned_agents` 和 `task_graph`，知道是谁在什么阶段负责了哪些产物。

### 9.2 支撑业务回溯

- 通过阶段记录，知道某次变更是围绕哪个 workflow 节点、哪类评审、哪类通知展开的。
- 通过 `verification_results`，知道该轮是否真的验证过业务路径。

### 9.3 支撑问题定位

- 通过 `open_risks`，知道哪些边界仍未关闭。
- 通过 `rollback_point`，知道失败后先回退到哪一步。
- 通过阶段门禁和结论，知道问题是出在 Plan、Build、Verify 还是 Correct。

## 10. 如何与 `audit_logs / workflow_transitions` 区分

这是最容易混淆的部分，必须明确区分：

| 记录类型 | 作用 | 层级 |
| --- | --- | --- |
| `execution ledger` | 记录本轮任务如何被计划、执行、验证、归档 | 编排层 |
| `audit_logs` | 记录业务关键写操作是谁在何时做了什么 | 业务运行层 |
| `workflow_transitions` | 记录流程从哪里流转到哪里 | 业务运行层 |

区分原则：

- 执行账本记录“这轮任务怎么推进的”。
- `audit_logs` 记录“系统里的业务动作怎么发生的”。
- `workflow_transitions` 记录“项目流程怎么流转的”。

因此：

- 执行账本不替代数据库业务日志。
- 业务日志也不替代执行账本的计划、阶段、验证与回滚记录。

## 11. 设计检查清单

- [ ] 本轮是否有单一明确目标？
- [ ] 是否已写清 scope 和 non_goals？
- [ ] 是否已定义阶段划分和责任 Agent？
- [ ] 是否已写明阶段门禁和进入条件？
- [ ] 是否已预留 verification_results、open_risks、rollback_point？
- [ ] 是否已明确执行账本是编排层记录，而不是业务日志替代物？
- [ ] 是否能通过模板直接复用到当前任务？

## 12. 交付检查清单

- [ ] goal 已明确记录。
- [ ] scope 与 non_goals 已明确记录。
- [ ] assigned_agents 与 task_graph 已记录。
- [ ] artifacts 有清晰摘要。
- [ ] verification_results 有真实结果，而非空话。
- [ ] open_risks 已列出，未被掩盖。
- [ ] rollback_point 已明确。
- [ ] next_step 已给出，可供下一轮直接接续。

## 13. 常见错误与禁止事项

- 把执行账本写成空泛日报。
- 只写做了什么，不写为什么做。
- 只写成功项，不写开放风险。
- 没写 non_goals，导致边界失控。
- 把业务数据库日志复制进执行账本，混淆层级。
- 没有 rollback_point，却声称“可回滚”。
- 没有验证结果，却写“已完成”。
- 把下一步建议省略，导致后续接续困难。

## 14. 给 Orchestrator Agent 的提示词模板

```markdown
你现在处理的是“轻卡新颜色开发项目管理系统”中的执行账本任务。

请严格遵守以下约束：
- 执行账本是编排层执行记录，不替代 audit_logs、workflow_transitions 等业务数据库日志。
- 账本必须突出可追溯、可验收、可回滚。
- 必须记录 goal、scope、non_goals、assigned_agents、artifacts、verification_results、open_risks、rollback_point。
- 必须写清阶段记录、验证结果和下一步建议。
- 不要把账本写成空泛总结，要让下一位执行者能直接复用。

请按以下结构输出：

## Goal
- 本轮目标：

## Scope
- 本轮范围：

## Non Goals
- 本轮不做：

## Assigned Agents
- 阶段与责任：

## Stage Ledger
- 阶段记录：

## Artifacts
- 产物摘要：

## Verification Results
- 验证结果：

## Open Risks
- 开放风险：

## Rollback Point
- 回滚点：

## Next Step
- 下一步建议：
```

## 15. 示例

### 15.1 新增一致性评审节点的一轮完整执行账本

```markdown
# Execution Ledger

## Goal
- 在主链路中补充一致性评审节点，并保持后端裁决、审计、通知和回退规则一致。

## Scope
- workflows
- reviews
- notifications
- audit_logs
- web 详情展示

## Non Goals
- 不重构 dashboard
- 不调整 auth
- 不做通用 BPM 抽象

## Assigned Agents
| Stage | Agent | Responsibility |
| --- | --- | --- |
| Stage 1 | Workflow Agent | 定义节点位置、退回规则、联动影响 |
| Stage 2 | Review Gate Agent | 定义评审门禁与 review_records 约束 |
| Stage 3 | API Agent | 实现动作化接口与后端状态校验 |
| Stage 4 | Notification Agent | 补齐待评审与退回通知 |
| Stage 5 | Audit Log Agent | 补齐关键动作审计 |
| Stage 6 | Frontend Route Agent | 展示节点详情与评审历史 |
| Stage 7 | Regression Guard Agent | 执行回归验证 |

## Stage Ledger
### Stage 1
- 目标：明确节点插入位置与退回影响
- 产物：节点设计草案、退回路径说明
- 验证：与现有主链路冲突检查通过
- 回滚点：保留原始主链路方案

### Stage 2
- 目标：定义评审通过/驳回/重提约束
- 产物：review_records 结构使用说明
- 验证：未通过不得进入后续主节点
- 风险：历史兼容仍需 Stage 7 回归确认

## Artifacts
- workflow 节点规则更新
- review gate 规则说明
- 通知触发点补齐
- 审计埋点补齐

## Verification Results
- `pnpm lint` 通过
- `pnpm typecheck` 通过
- `pnpm test` 通过
- 主链路 smoke 通过

## Open Risks
- 旧项目数据在新增节点后的兼容表现仍需关注

## Rollback Point
- 回退到新增节点前的稳定 workflow 规则集

## Next Step
- 观察旧项目数据兼容
- 评估是否需要补充迁移或回填说明
```

### 15.2 修复通知重复发送 bug 的执行账本

```markdown
# Execution Ledger

## Goal
- 修复同一评审待办被重复发送两次的问题。

## Scope
- notifications
- Redis 队列消费逻辑
- review 触发链路

## Non Goals
- 不改 UI 文案
- 不改无关 workflow 节点
- 不重构消息中心

## Assigned Agents
| Stage | Agent | Responsibility |
| --- | --- | --- |
| Stage 1 | Bug Fix Agent | 复现问题并补失败用例 |
| Stage 2 | Notification Agent | 修复幂等键与去重逻辑 |
| Stage 3 | Regression Guard Agent | 回归验证首次发送、重复提交、队列重试 |

## Artifacts
- 重复通知复现说明
- 幂等键修复说明
- 回归结果摘要

## Verification Results
- 重复提交失败用例转为通过
- 队列重试未再创建重复通知
- `pnpm test` 通过

## Open Risks
- 旧的重复通知记录不会自动清理

## Rollback Point
- 回退到幂等修复前的通知逻辑实现

## Next Step
- 若需要清理旧重复数据，拆出独立任务处理
```
