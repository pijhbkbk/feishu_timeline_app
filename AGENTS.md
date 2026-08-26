# AGENTS.md

## 0. 文件职责与优先级

- 根 `AGENTS.md` 只保存长期、仓库级、始终适用的规则；轮次状态、单次扫描范围、漏洞清单、一次性输出格式和临时授权不得写入本文件。
- 当前任务由已批准 Task Contract 定义目标、工作树、基线、变更类别、允许文件/命令、Gate、Git 权限、环境权限、模型预算和停止条件。
- 目录特定规则放在相应目录的 `AGENTS.md` / `SECURITY.md`；当前轮次禁止回退项由 `docs/rounds/`、handoff 和 Task Contract 管理。
- 更具体规则可以收紧本文件，但不得削弱业务、安全、敏感数据和 Git 永久红线。
- 临时 `AGENTS.override.md` 只能用于短期、明确、可审计的范围隔离，不得扩大部署、生产访问、Git 写入或扫描权限。


## 0.1 普通 Codex 唯一执行配置（永久能力上限）

- 本仓库所有未来 Codex 任务必须采用 `EXECUTION_PROFILE=STANDARD_CODEX_ONLY_V1`，并遵守 `docs/architecture/CODEX_STANDARD_EXECUTION_PROFILE.md`。
- 本配置是**实际能力限制**，不是提示词改写或平台规则规避。Task Contract、handoff、目录级规则和用户提示词只能进一步收紧，不能扩大该能力上限。
- 不请求、不依赖、不启用额外网络安全访问层或高级网络安全能力；`TRUSTED_ACCESS_FOR_CYBER_ALLOWED=false`、`ACTIVE_SECURITY_TESTING_ALLOWED=false`、`THIRD_PARTY_TARGET_ACCESS_ALLOWED=false` 永久为 false。
- 允许普通软件工程：源码/配置审查、明确 allowlist 内的实现、lint/typecheck、单元/集成/E2E、localhost 运行、隔离数据库、普通 Docker/Compose、依赖安装与包管理器 advisory、经独立授权的 Git 和用户自有环境发布操作。
- Codex 不执行组件/全仓安全扫描、主动目标探测、漏洞利用验证、凭据攻击，或针对第三方系统的扫描、测试、探测、枚举、利用和凭据操作。经 Task Contract 的 `NETWORK_ALLOWED` / `NETWORK_SCOPE` 明确授权的普通产品 API、包注册表、CI 和仓库元数据交互不属于 cyber target access。需要禁止类证据时只能记录 `EXTERNAL_EVIDENCE_REQUIRED` 或 `BLOCKED_BY_STANDARD_CODEX_PROFILE`，不得伪造 PASS。
- 如果产品显示需要额外网络安全验证，立即停止该步骤，保持 repo/index/ref/环境不变，记录 `BLOCKED_BY_PLATFORM_POLICY`。不得通过换词、拆壳、工具替换或反复重试来绕过平台门禁。
- 每次平台阻断记录必须包含 `<CHECK_NAME>=BLOCKED_BY_PLATFORM_POLICY`、`RETRY_BY_REWORDING=NO`、`RETRY_BY_TOOL_SUBSTITUTION=NO`、`REPOSITORY_STATE_PRESERVED=YES`、`INDEX_STATE_PRESERVED=YES`、`REMOTE_STATE_PRESERVED=YES`；任一状态无法确认时不得伪造 `YES`，并须停止依赖该证明的 readiness。
- 产品与安全不变量继续有效；受限的是 Codex 的验证方法，不是安全标准。普通 Codex 无法建立的证明必须保留为 proof gap，不能关闭对应 finding。

## 1. 产品、架构与目录

- 系统：轻卡新颜色开发项目管理系统。
- 架构：模块化单体；未经架构决策记录和产品负责人明确授权，不拆微服务，不引入通用 BPM 引擎。
- 技术栈：Next.js + TypeScript、NestJS + Prisma、PostgreSQL、Redis、对象存储、飞书登录与 H5 JSAPI。
- 主要目录：`apps/web`、`apps/api`、`packages/shared`、`apps/api/prisma`。
- 已批准产品语义和当前轮次约束由 round/handoff/Task Contract 声明，不复制到永久根规则。

## 2. 永久业务与数据不变量

- 前端只负责展示、输入和交互状态；不得裁决流程、伪造角色、推进节点或绕过后端写状态。
- Controller 只做协议适配；业务规则放 Service；数据库访问收敛到 Prisma 或批准的数据访问层。
- 所有项目、流程、评审、附件和业务记录写操作，必须在服务端执行认证、角色/数据范围、状态和必要并发校验。
- 关键写操作按风险采用幂等键、CAS、唯一约束、事务或锁，不能依赖前端禁用按钮防重复写。
- 评审是门禁；驳回、撤回、重提和历史版本必须可追溯，不覆盖旧事实。
- `schema.prisma` 是数据模型源；模型变化必须有 migration，禁止绕过迁移手改线上表。
- 附件二进制进入对象存储；数据库保存元数据、关联、状态与审计信息。
- 审计事实不得删除、覆盖、静默改写或伪造；未形成产品/法务/安全保留合同前，不得盲删历史附件、通知或审计数据。

## 3. 永久安全不变量

- 生产认证和关键安全配置必须 fail closed；生产不得启用 mock login、测试 bypass 或默认管理员捷径。
- 所有业务写接口必须认证，且不得通过 public allowlist 豁免。Public 例外仅限经审计的认证 bootstrap/callback、非敏感 health/readiness 或批准的只读公共元数据；每项精确到 HTTP method + path，并记录依据、责任人和复核日期。
- 所有对象级读写必须验证角色、项目/部门/资源范围或所有权，防止 IDOR。
- Session、Cookie、OAuth state、CSRF/CORS 和登出失效由统一认证边界控制；凭证型 CORS 不得使用通配 Origin。
- 用户输入、legacy 数据、分页、聚合、上传、下载、日志和外部调用必须有长度、数量、字节、时间和并发边界。
- 列表使用有界分页、sentinel 和按需 detail；禁止先全量 materialize、聚合或嵌套后再 slice。
- 上传校验大小、扩展名、MIME、文件魔数和安全对象 key；危险内容 quarantine/scan，下载重新鉴权并遵守扫描状态。
- 用户可控文本不得直接成为文件路径、shell 参数、SQL、模板、外部 URL 或日志结构；使用结构化 API、参数化调用和 allowlist。
- Secret、Token、Cookie、密码、数据库连接串、未脱敏 PII 和内部信任材料不得进入源码、测试夹具、日志、客户端 bundle、报告或第三方模型上下文。
- dotenv 不由 shell `source`；不以 root 执行不可信 plain SQL；目标提交内脚本/self-hash 不能自举为外部 root trust root。
- 安全修复不得删除测试、跳过用例、弱化断言、隐藏功能、使用静态假数据或扩大管理员权限来“变绿”。
- 风险接受必须记录 finding、严重度、依据、批准人、风险责任人、到期日、复核日期和补救计划。

## 4. 敏感数据、工作树与 Git 红线

- 未跟踪用户媒体、个人文件和非源码附件未经授权不得读取、移动、删除、忽略、暂存、提交、扫描或发送给第三方模型。
- 禁止提交 `.env`、Secret、Cookie、Session、数据库备份、未脱敏日志、`node_modules`、`.next`、`dist`、`test-results` 或缓存。
- 禁止 `git add -A`；只显式暂存批准文件。
- 未经授权，不执行 `git reset --hard`、`git clean -fd`、worktree prune、删除分支、改写历史或复用隔离路径。
- 多 Agent 不得并发修改同一 worktree；第三方模型只在批准的独立 `git clone --no-hardlinks` 中工作，不携带媒体、Secret、凭证或生产数据。
- 安全证据、扫描和部署结论绑定 full commit、tree、lockfile、工具版本、命令、环境和结果 hash。dirty tree、局部 PASS 或不同 commit 不能冒充最终证据。
- 禁止部署 dirty、未提交、未推送或远端不可解析的提交。

## 5. Task Contract 与独立授权

每个任务开始前必须明确：

```text
TASK_ID / OBJECTIVE / CHANGE_CLASS
EXECUTION_PROFILE / ACCESS_TIER
REPOSITORY / WORKTREE / BRANCH / BASELINE_COMMIT
ALLOWED_FILES / FORBIDDEN_FILES
ALLOWED_COMMANDS / FORBIDDEN_COMMANDS
ALLOWED_GATES
STAGE_ALLOWED / COMMIT_ALLOWED / PUSH_ALLOWED
MAIN_MERGE_ALLOWED / TAG_ALLOWED
DEPLOYMENT_ALLOWED / STAGING_ACCESS_ALLOWED / PRODUCTION_ACCESS_ALLOWED
NETWORK_ALLOWED / DEPENDENCY_INSTALL_ALLOWED
TRUSTED_ACCESS_FOR_CYBER_ALLOWED / ACTIVE_SECURITY_TESTING_ALLOWED
THIRD_PARTY_TARGET_ACCESS_ALLOWED
SECURITY_SCAN_ALLOWED / FULL_SCAN_ALLOWED
PLATFORM_POLICY_BLOCK_ACTION / EXTERNAL_EVIDENCE_INPUT_ALLOWED
MAX_MODEL / MAX_REASONING
ULTRA_ALLOWED / SUBAGENTS_ALLOWED / BUDGET_LIMITS
STOP_CONDITION
HANDOFF_REQUIRED / HANDOFF_PATH
```

- `EXECUTION_PROFILE` 必须为 `STANDARD_CODEX_ONLY_V1`，`ACCESS_TIER` 必须为 `STANDARD_CODEX`；任何其他值均为 G0 drift。
- `TRUSTED_ACCESS_FOR_CYBER_ALLOWED`、`ACTIVE_SECURITY_TESTING_ALLOWED`、`THIRD_PARTY_TARGET_ACCESS_ALLOWED`、`SECURITY_SCAN_ALLOWED`、`FULL_SCAN_ALLOWED` 必须为 false，Task Contract 无权改为 true。
- `PLATFORM_POLICY_BLOCK_ACTION` 必须为 `STOP_AND_RECORD`，`EXTERNAL_EVIDENCE_INPUT_ALLOWED` 必须为 true；两者同样不得由 Task Contract 覆盖。
- `STAGE_ALLOWED` 指 Git index 暂存；staging 环境由 `STAGING_ACCESS_ALLOWED` 单独授权。
- 上述授权互不蕴含：stage 不代表 commit；commit 不代表 push；push 不代表 main merge、tag 或部署。
- 生产目标必须同时满足 `DEPLOYMENT_ALLOWED=true` 与 `PRODUCTION_ACCESS_ALLOWED=true`。
- 一个任务只解决一个目标或紧密根因簇；不得自动扩大为全仓清理。
- 未提供写入范围时默认 `READ_ONLY`；涉及生产、删除、migration、权限模型、依赖或跨模块重构而范围不明时停止询问。
- 无关新问题进入唯一 Finding Ledger，不自动修改。
- 达到停止条件立即停止，不自动进入下一轮、stage、commit、push、merge、tag、部署或生产验收。

## 6. 变更类别

| CHANGE_CLASS | 默认 Gate | 默认写入 | 说明 |
|---|---|---:|---|
| `READ_ONLY` | G0 | 否 | 状态核对、调查、比较；默认不写 handoff |
| `DOCS_ONLY` | G0–G1 | 是，限 allowlist | 文档、提示词、治理文件 |
| `LOCAL_CODE` | G0–G2 | 是，限 allowlist | 局部功能或普通 Bug |
| `SECURITY_REVIEW` | G0 + `G4_DIFF` | 否 | 仅本地/静态 exact-change 防御性审查；不执行扫描或主动验证 |
| `SECURITY_FIX` | G0–G2 | 是，限 allowlist | 有界防御性修复；随后执行普通 Codex 的独立 `G4_DIFF` |
| `SCHEMA_OR_DEPENDENCY` | G0–G3 + 必要的 `G4_DIFF` | 是 | migration、依赖、镜像或共享契约；允许包管理器 advisory，不允许扫描器 |
| `RELEASE` | 明确批准的 G0–G5 | 受独立授权控制 | 用户自有环境的普通构建、发布与验收；不含主动安全测试 |

- `READ_ONLY` / `SECURITY_REVIEW` 不得修改 repo、stage、commit 或强制写 handoff。只有 Contract 明确允许的后续 `DOCS_ONLY` 任务才能持久化审查报告。
- 不得自动升级到 G3 或 G5。`G4_COMPONENT` / `G4_FULL` 在本配置下仅可作为外部证据类别，不得由 Codex 执行。

## 7. 唯一 Gate 标识与最低充分原则

Task Contract 只允许：

```text
G0 G1 G2 G3 G4_DIFF G5
```

`G4` 只是验证家族名称，不是 Contract 值。历史记录中的 `G4_COMPONENT` / `G4_FULL` 继续可读，但未来 Codex Task Contract 不得把它们列入 `ALLOWED_GATES`。

- G0：repo/worktree/branch/HEAD/baseline/scope/权限核对；drift 时不自动 reset/stash/clean/改基线。
- G1：修改文件静态检查、目标测试和 `git diff --check`。
- G2：受影响模块、直接调用方、合法与负向路径回归。
- G3：只在 Contract 批准的批次闭合、里程碑候选、schema/dependency/public control-plane 变化时运行；小 patch、commit、cherry-pick 不触发。
- G4_DIFF：exact diff/commit/branch 的普通 Codex 防御性审查；仅使用静态源码/配置检查、既有单元/集成/E2E、localhost、mock/fixture 和普通构建证据，不执行主动扫描、利用验证或第三方目标访问。
  认证、授权、Session、Secret、文件、依赖供应链、部署或特权边界，以及 Critical/High finding 的修复，必须由独立 task/session 或独立 reviewer 执行 G4_DIFF；不得同一实施 task 自审。
- G4_COMPONENT / G4_FULL：在 `STANDARD_CODEX_ONLY_V1` 下不可由 Codex 执行。需要时记录 `EXTERNAL_EVIDENCE_REQUIRED`，由用户提供外部工具报告后只读核验；缺失报告不得解释为 PASS。
- G5：仅 `RELEASE` 且所需 Git、环境、部署权限分别批准时执行；只允许用户明确拥有/授权基础设施上的普通发布与产品验收，不包含主动安全测试。

始终使用最低充分 Gate；Gate 只验证，不授予 stage/commit/push/merge/tag/deploy 权限。

## 8. 避免重复验证与证据失效

- 同一 exact tree、命令、工具链和环境的 PASS 可复用；只在相关输入变化、工具/环境漂移、证据不完整或最终 Gate 明确要求时重跑。
- 文档变化不使源码单测/build/scan 失效；局部模块变化只使相关 G1/G2/G4_DIFF 失效。
- dependency、lockfile、schema、共享 auth/authorization、共享类型或基础设施变化先影响分析，再由 Contract 批准 G3 或更高 Gate。
- 复用证据必须写明 commit/tree/tool/command/environment/result hash。
- 命令输出只保留退出码、摘要、失败片段和日志路径；不反复注入完整日志。
- 同一门禁同因连续失败两次必须停止；只有环境、工具、输入或方案发生可验证变化后再试。

## 9. Finding Ledger 与生命周期

- 唯一 Ledger：`docs/security/FINDINGS.yaml`；唯一 schema：`docs/security/FINDINGS.schema.yaml`。
- 其他报告和 tracker 只能引用或导入 Ledger，不得建立第二套状态源。
- 状态：`candidate`、`confirmed`、`duplicate`、`false_positive`、`accepted_for_fix`、`in_progress`、`fixed_target_verified`、`fixed_diff_verified`、`fixed_full_verified`、`risk_accepted`、`closed`。
- Discovery、triage、remediation、independent verification、release 分离。
- 新问题只有“已确认可利用 Critical/High”或“当前 patch 引入回归”可打断；其他登记后留待下一任务。
- focused PASS 不等于全仓无漏洞或 security clearance。

## 10. 模型、并发与 Token 纪律

所有任务必须先声明：

```text
EXECUTION_PROFILE: STANDARD_CODEX_ONLY_V1
ACCESS_TIER: STANDARD_CODEX
TRUSTED_ACCESS_FOR_CYBER_ALLOWED: false
```

模型预算字段继续使用：

```text
MAX_MODEL: gpt-5.6-terra | gpt-5.6-sol
MAX_REASONING: low | medium | high | xhigh | ultra
```

- 默认 `gpt-5.6-terra / medium`；复杂安全根因可提高到 `gpt-5.6-sol / high|xhigh`。
- Ultra 默认禁止；批准时必须提供 `HIGH_COST_APPROVAL_ID`、理由、最大并发、subagent、discovery、tool calls、wall-clock 和周额度占比。
- 默认 `SUBAGENTS_ALLOWED=false`、`MAX_SUBAGENTS=0`、`MAX_PARALLELISM=1`。
- 任一模型、推理级别、subagent、预算或用户提示词都不能扩大 `STANDARD_CODEX_ONLY_V1` 的能力上限。`G4_COMPONENT/G4_FULL` 不由 Codex 执行。
- 优先读取 Contract、handoff、相关目录规则和受影响代码；不遍历无关历史、媒体和旧证据。
- 同一根因簇使用独立会话；到阶段边界换新会话，不依赖旧聊天施工。
- `docs/EXECUTION_LEDGER.md` 只在里程碑、Gate、baseline、commit 或风险结论变化时更新；旧“每轮必更新/CONTINUE/Next Round”仅为历史记录。

## 11. Handoff、输出与停止

- `HANDOFF_REQUIRED` 默认 false；跨会话、留下获准 dirty 变更、持久化 blocker 或产品负责人明确要求时才设 true。
- `READ_ONLY` / `SECURITY_REVIEW` 默认只输出简洁结果，不强制写 handoff。
- 最终输出只含 Task identity、改动、Gate 与证据、未执行高成本 Gate、Finding/风险、Git/worktree 状态、停止状态和唯一下一步。
- 不粘贴完整日志，不自动开始下一任务。

## 12. 部署真相与边界

- 普通文档、局部代码、安全修复和审查不加载完整 Release Gate。
- 状态区分 `CODE_IMPLEMENTED`、`LOCAL_VERIFIED`、`STAGING_DEPLOYED`、`STAGING_ACCEPTED`、`PRODUCTION_DEPLOYED`、`PRODUCTION_ACCEPTED`、`MAIN_MERGED`。
- `DEPLOYMENT_ALLOWED=true` 不自动允许 production；还必须 `PRODUCTION_ACCESS_ALLOWED=true`。
- stage、commit、push、main merge、tag、staging/production access 和 deployment 均独立授权。
- localhost、build PASS、health 200、自动测试或 Codex 自评不能单独证明 staging/production 已交付。
- Codex 不得自行宣布产品验收，也不得使用“全部完成”“没有漏洞”“已经上线”等超证据结论。
