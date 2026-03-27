# Prisma Safe Migration Skill

本技能面向 Prisma Migration Agent、API Agent 和 ColorDev Orchestrator Agent，用于规范“轻卡新颜色开发项目管理系统”中所有与 Prisma `schema.prisma`、migration、索引、唯一约束、外键、seed 联动、校验命令相关的变更方式。它只服务当前仓库的模块化单体架构、PostgreSQL 数据模型和主链路业务，不服务通用数据库平台抽象。

本技能的核心原则只有三条：

- 安全：任何迁移都必须先评估已有数据、运行风险和回滚路径。
- 可追溯：`schema.prisma`、migration、应用代码、验证结果必须能一一对应。
- 可回滚：变更前要知道失败后退到哪里，不能依赖临时手改线上表结构救火。

## 1. Skill 目标

- 为本仓库的 Prisma 模型与迁移提供统一、安全、可验证的执行规范。
- 强化“`schema.prisma` 是唯一数据模型源”的执行要求，杜绝 schema 与数据库结构漂移。
- 约束枚举、唯一约束、外键、索引等结构性变更的建模方式。
- 明确 migration 与 seed、validation、typecheck、test、build 的联动检查要求。
- 确保与 `attachments`、`audit_logs`、`notifications`、`review_records` 等关键表相关的建模变化符合项目边界。

## 2. 适用场景

- 新增表、字段、关系、默认值、非空约束。
- 修改已有字段类型、可空性、默认值、命名、关联关系。
- 新增、修改、删除枚举。
- 新增、修改、删除唯一约束、外键、索引。
- 为 `review_records`、`notifications`、`attachments`、`audit_logs` 等关键表补充字段或索引。
- 调整需要数据回填、历史兼容、查询性能优化的 Prisma 结构。
- 审查某次改动是否必须同步 migration、seed、校验命令和测试。

## 3. 不适用场景

- 纯前端页面变更。
- 仅修改后端业务规则但不改变持久化结构。
- 纯查询逻辑、权限逻辑、通知文案调整，且不涉及数据库模型。
- 试图通过临时 SQL 热修复绕过 Prisma migration 流程。
- 为未来不确定场景提前引入大量表、通用元模型或复杂抽象。

## 4. Prisma 在本仓库中的边界

- Prisma 是本仓库后端持久化模型的权威描述工具，目录边界在 `apps/api/prisma`。
- `schema.prisma` 描述数据结构、关系、索引、唯一约束、外键和枚举。
- migration 描述从旧结构到新结构的可执行变更路径。
- API 与 Service 使用 Prisma 访问数据库，但业务规则仍然属于后端领域服务，不属于 Prisma 本身。
- Prisma 不负责前端状态，不负责 workflow 裁决，不负责 review 门禁语义，只负责数据结构与结构一致性。
- 不得手改线上表结构，不得绕开 Prisma migration 直接修改 PostgreSQL 表。

## 5. “schema.prisma 是唯一数据模型源”的执行要求

- 任何持久化结构变更必须先体现在 `schema.prisma`。
- migration 必须从 `schema.prisma` 的目标模型出发生成，不能让数据库结构先跑到 schema 前面。
- 若 migration 需要补充少量手工 SQL，前提仍然是 `schema.prisma` 先准确表达最终结构；手工 SQL 只能补足迁移过程，不能替代 schema。
- 提交结构变更时，至少应保证以下产物一致：
  - `schema.prisma`
  - 对应 migration
  - 受影响的 Prisma Client 调用代码
  - 受影响的 seed 或初始化数据
  - 校验与测试结果
- 任何“先改库，回头再补 schema”或“先改 schema，以后再补 migration”的做法都视为违规。

## 6. 什么时候必须新增 migration

以下情况必须新增 migration：

- 新增或删除 Model。
- 新增、删除、重命名字段。
- 修改字段类型、可空性、默认值。
- 新增、删除、修改 enum 成员。
- 新增、删除、修改唯一约束。
- 新增、删除、修改外键关系。
- 新增、删除、修改索引。
- 修改 relation 行为或隐含生成的表结构。
- 任何会改变数据库真实结构、约束或查询计划的 Prisma 变更。

判断原则：

- 只要数据库真实结构会变，就必须有 migration。
- 只要迁移结果对已有数据有影响，就必须评估数据兼容与回滚风险。
- 只要代码依赖新的 schema 结果，就必须让 migration 与代码一起落地。

## 7. 什么时候不应触碰 schema

以下场景不应修改 `schema.prisma`：

- 只改后端 Service 规则，不改数据结构。
- 只改前端页面、交互、展示文案。
- 只改 RBAC、workflow、review 裁决逻辑，但表结构完全不变。
- 只改测试断言、日志文案或错误提示。
- 只改 seed 数据内容，但不改变结构约束。
- 只是“感觉以后可能会用到”，但当前业务没有明确结构需求。

判断原则：

- 结构不是解决当前问题的必要条件时，不要碰 schema。
- 不要为了“顺手优化”引入本轮目标之外的表结构变化。
- 单次迁移应尽量围绕单一目标，避免把多个无关结构改动绑在一起。

## 8. 枚举、唯一约束、外键、索引的建模原则

### 8.1 枚举

- 枚举只用于稳定、有限、业务语义清晰的集合。
- 与 workflow、review、notification 等状态相关的枚举必须与后端代码语义一致。
- 不要把频繁变化、无法收敛的自由文本设计成 enum。
- 变更 enum 成员时必须评估已有数据、seed、测试夹具和共享类型是否同步。

### 8.2 唯一约束

- 业务唯一性必须显式建模，不能只靠应用层“约定”。
- 项目编号、颜色编号等关键业务唯一标识，应优先通过 Prisma 唯一约束表达。
- 新增唯一约束前必须先检查历史脏数据或重复数据风险。
- 复合唯一约束应基于真实业务键，而不是为了“防万一”堆叠字段。

### 8.3 外键

- 外键关系必须清晰反映真实归属关系与生命周期。
- 可选关系才允许可空外键；不要因为怕麻烦就把应为必填的关系做成可空。
- 对历史型、审计型数据要谨慎使用级联删除。
- 对 `audit_logs`、`workflow_transitions`、`review_records` 这类追溯性数据，应优先保护历史完整性，而不是让删除链条吞掉记录。

### 8.4 索引

- 索引应服务真实查询路径、排序路径和关联路径，而不是猜测未来需求。
- 复合索引的字段顺序应与高频查询条件一致。
- 索引不是修复错误建模的替代品。
- 新增索引前要评估写入开销、存储成本和迁移执行窗口。
- 通知、待办、审计、评审等高频读写表的索引变更必须考虑主链路写入影响。

## 9. `attachments` / `audit_logs` / `notifications` / `review_records` 等关键表建模时的注意事项

### 9.1 `attachments`

- 只存对象存储元数据，不存文件二进制。
- 字段设计应围绕文件名、对象存储 key、大小、类型、上传人、关联对象。
- 新增字段时要先确认是否属于业务关联元数据，而不是临时展示字段。
- 附件模型变化若影响评审、项目、流程绑定，必须联动 API 与审计检查。

### 9.2 `audit_logs`

- 审计日志必须落库，且以追加式、可追溯为原则。
- 不要为方便更新某条历史而设计可覆盖型字段语义。
- 新增索引或字段应围绕查询追溯需求，例如对象类型、对象 ID、操作者、时间范围。
- 不要轻易引入会削弱历史完整性的删除或级联策略。

### 9.3 `notifications`

- 通知是主业务成功后的异步副产物，不应反向控制主事务成败。
- 模型字段应能表达通知内容、发送状态、重试状态、接收人、业务对象关联。
- 新增索引要优先考虑待办扫描、发送状态轮询、按用户查询等真实访问路径。
- 通知相关 migration 要评估写多读多场景下的索引成本。

### 9.4 `review_records`

- 评审是门禁，不是备注；模型必须支持评审结论、轮次、操作者、意见、时间与必要附件关联。
- 驳回、撤回、重提必须保留完整历史，不能通过覆盖单条记录来“更新结果”。
- 增加字段时必须确认是否影响旧记录兼容、评审轮次区分和 API 入参校验。
- 与 `workflow_transitions` 的联动应在应用层保证语义一致，不能只补字段不补流转逻辑。

### 9.5 关联性提醒

- 关键表建模变化不只是 Prisma 问题，通常会牵动 API、RBAC、workflow、review、notifications 和 audit。
- 若某次结构变更会改变主链路语义或门禁语义，应先进入中枢 Orchestrator 的影响面分析。

## 10. migration 与 seed / validation / typecheck / test 的联动检查

结构变更不能只看 migration 成功，还必须检查联动面：

- seed：若仓库存在 seed、初始化脚本、测试夹具或本地引导数据，结构变化后必须同步更新。
- validation：至少要通过 `pnpm --filter api prisma:validate`，确保 Prisma schema 可校验。
- typecheck：若 Prisma Client 类型变化影响后端调用代码，必须通过 `pnpm typecheck`。
- test：任何影响 workflow、review、notifications、attachments、audit 的结构变化，都必须通过 `pnpm test` 或补充对应测试。
- build：前后端消费的数据契约若被结构变化影响，必须通过 `pnpm --filter api build` 与 `pnpm --filter web build`。

联动原则：

- schema 变了，migration 必须变。
- schema 或 migration 变了，相关 seed/fixture 必须审查。
- Prisma Client 类型变了，typecheck 必须作为硬门禁。
- 影响查询、约束或历史兼容的迁移，测试不能跳过。
- 任何一环未同步，都不能宣布迁移完成。

## 11. 对已有数据与回滚风险的审查要求

每次迁移前都必须审查已有数据与失败路径，至少覆盖以下问题：

- 新增非空字段时，历史数据如何填充？
- 新增唯一约束时，历史数据里是否已有重复值？
- 新增外键时，历史数据里是否存在孤儿记录？
- 修改字段类型时，旧值是否都能安全转换？
- 删除字段或缩紧约束时，是否会丢失历史语义？
- 新增索引时，是否会在高写入表上造成明显锁等待或迁移风险？
- migration 执行一半失败时，最近的可回滚点是什么？
- 若回滚，只回滚 migration 是否足够，还是还需要同步回滚代码与 seed？

安全要求：

- 不得把“线上先手改一下再说”当成回滚方案。
- 不得在不评估旧数据的前提下直接引入非空、唯一或外键约束。
- 若迁移包含潜在破坏性操作，应优先拆分为更安全的多步迁移，而不是一把梭完成。

## 12. 设计检查清单

- [ ] 本轮结构变更是否服务于单一、明确业务目标？
- [ ] 是否确认真的需要修改 `schema.prisma`，而不是只改应用逻辑？
- [ ] 是否明确受影响表、字段、约束、索引和枚举？
- [ ] 是否明确哪些模块会消费新的 Prisma 类型？
- [ ] 是否评估 `attachments`、`audit_logs`、`notifications`、`review_records` 等关键表的历史和查询影响？
- [ ] 是否评估已有数据兼容、唯一约束冲突、外键孤儿、非空字段回填风险？
- [ ] 是否判断需要同步更新 seed、fixture 或初始化数据？
- [ ] 是否明确 migration 的回滚点与失败处理方式？
- [ ] 是否避免把多个无关结构变化绑进一次迁移？
- [ ] 是否确认没有绕开 Prisma 去改线上表结构的方案？

## 13. 编码检查清单

- [ ] 先更新 `schema.prisma`，再生成或补充 migration。
- [ ] migration 目录中的产物与 schema 目标结构一致。
- [ ] 必要时补充安全的数据迁移 SQL，但不绕开 schema。
- [ ] 所有 Prisma Client 调用代码都已适配新字段、新约束或新关系。
- [ ] API 入参、出参、DTO、Service 查询逻辑已适配模型变化。
- [ ] 若结构变化影响 seed、fixture、测试数据，已同步更新。
- [ ] 若引入新索引或唯一约束，已记录其设计理由与风险点。
- [ ] 未修改无关模型、无关迁移、无关模块。
- [ ] 未通过直接手改数据库表来“修正”本次变更。

## 14. 命令检查清单

- [ ] 使用仓库当前实际的 Prisma 迁移生成命令产出 migration。
- [ ] 确认 `apps/api/prisma/migrations` 中已有本次结构变更对应的迁移产物。
- [ ] `pnpm install`
- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm --filter web build`
- [ ] `pnpm --filter api build`
- [ ] `pnpm --filter api prisma:validate`
- [ ] 若仓库维护 seed 或初始化脚本，执行对应的 seed 校验或最小验证。

说明：

- 本技能不强行规定具体迁移命令别名，以仓库当前 Prisma 命令为准。
- 但“生成 migration + 提交 migration + 通过 validate”是不可跳过的最小链路。

## 15. 常见错误与禁止事项

- 只改 `schema.prisma`，不产出 migration。
- 只改 migration，不更新 `schema.prisma`。
- 直接手改线上表结构，回头再补 Prisma 文件。
- 未检查历史数据就新增非空、唯一、外键约束。
- 为未来可能需求提前增加大量字段、索引或通用表。
- 在一次迁移里夹带多个无关目标，导致无法回滚。
- 修改了 Prisma 模型，却不更新 seed、fixture、测试和调用代码。
- 在 `attachments` 中存二进制。
- 让 `audit_logs` 变成可覆盖型历史。
- 给 `notifications` 新增索引却不评估高频写入影响。
- 对 `review_records` 做字段变更却不评估历史轮次和旧记录兼容。

## 16. 给 Prisma Migration Agent 的提示词模板

```markdown
你现在处理的是“轻卡新颜色开发项目管理系统”中的 Prisma 结构变更任务。

请严格遵守以下约束：
- `schema.prisma` 是唯一数据模型源。
- 不得手改线上表结构，不得绕过 Prisma migration。
- 单次迁移只服务一个明确目标，强调安全、可追溯、可回滚。
- 任何结构变更都要审查已有数据、seed、validation、typecheck、test、build 的联动影响。
- 对 `attachments`、`audit_logs`、`notifications`、`review_records` 等关键表的改动要优先考虑历史完整性和查询语义。

请按以下结构输出：

## 单一目标
- 本次迁移目标：

## 结构变更
- 受影响模型：
- 字段/约束/索引变化：
- 是否涉及 enum：

## 数据风险
- 历史数据风险：
- 非空/唯一/外键风险：
- 回滚点：

## 联动影响
- API：
- seed / fixture：
- typecheck：
- test：
- build：

## 交付要求
- schema.prisma：
- migration：
- 验证命令：
- 需要补充的说明：
```

## 17. 示例

### 17.1 给 `review_records` 增加字段

示例目标：为 `review_records` 增加 `round` 字段，用于区分同一项目的一致性评审重提轮次。

正确做法：

- 先在 `schema.prisma` 中明确新增字段及其约束。
- 生成对应 migration，必要时评估历史记录的默认值或回填策略。
- 检查 API、Service、评审门禁逻辑、测试夹具是否需要同步适配。
- 若旧记录需要默认轮次，必须明确如何让历史数据安全兼容。
- 最后通过 `prisma:validate`、`typecheck`、`test`、构建链路。

风险提醒：

- 若直接新增非空字段却没有历史数据策略，旧记录会成为迁移阻塞点。
- 若只补 schema 不补 migration，会导致环境间结构不一致。

### 17.2 新增 `notifications` 相关索引

示例目标：为 `notifications` 增加按接收人和发送状态查询的复合索引，用于待办和发送状态扫描优化。

正确做法：

- 明确真实查询路径，再在 `schema.prisma` 中增加复合索引。
- 生成 migration，并评估通知表写入压力与索引维护成本。
- 检查相关查询代码是否真的使用到了该访问路径。
- 验证通知读写、待办扫描和构建链路未被破坏。

风险提醒：

- 不要因为“可能会快”就随意堆索引。
- 索引建模错误可能让写入成本上升，却没有实际收益。

### 17.3 错误示例：只改 schema 不产出 migration

错误做法：

- 修改了 `schema.prisma` 中某个字段或索引。
- 提交代码时没有在 migration 目录中产出对应迁移。
- 试图依赖本地数据库已有结构“碰巧可用”。

为什么错误：

- 这会让仓库中的 schema 与数据库真实结构失配。
- 会导致其他环境无法复现结构变化。
- 会让 `prisma:validate`、测试、构建与实际运行环境出现漂移。
- 会让回滚和问题排查失去依据。

正确结论：

- 只要数据库结构变了，就必须同时提交 `schema.prisma` 与 migration，并同步审查 seed、validate、typecheck、test、build。
