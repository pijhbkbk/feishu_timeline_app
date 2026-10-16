# Verification Gates v3

## 1. 目的

用最低充分验证回答当前任务，避免把局部修改自动放大为全仓测试、全仓安全扫描、部署和产品验收。Gate 只定义验证，不授予 Git 写入、环境访问或部署权限。

## 2. 唯一 Gate 标识

沿用以下验证标识；自然语言任务授权同样有效，无须为了执行已授权工作补齐模板字段：

```text
G0
G1
G2
G3
G4_DIFF
G4_COMPONENT
G4_FULL
G5
```

`G4` 仅是安全验证家族名称，不得作为 `ALLOWED_GATES` 值。

| Gate | 核心问题 | 典型成本 | 默认触发 |
|---|---|---:|---|
| G0 | repo/worktree/branch/commit/scope/权限是否正确？ | 低 | 每个任务 |
| G1 | 当前 patch 的语法、类型和目标行为是否正确？ | 低 | 写任务 |
| G2 | 直接受影响模块和安全负向路径是否回归？ | 中 | 代码/安全 patch |
| G3 | 批次或里程碑候选的全仓质量是否健康？ | 高 | 明确批准的批次/里程碑 |
| G4_DIFF | exact diff/commit 是否存在安全回归？ | 中 | 有界安全 patch |
| G4_COMPONENT | 明确组件是否存在未处理风险？ | 中—高 | 批准的组件审查 |
| G4_FULL | clean immutable commit 的全仓安全状态如何？ | 很高 | 最终或明确里程碑审计 |
| G5 | 不可变版本是否真实部署并被验收？ | 很高 | 明确 Release 任务 |


## 2.1 Change Class 与 Gate 默认关系

- `READ_ONLY`：G0；不写 repo，不强制 handoff。
- `DOCS_ONLY`：G0–G1。
- `LOCAL_CODE`：G0–G2。
- `SECURITY_REVIEW`：G0 + 明确的 `G4_DIFF` / `G4_COMPONENT` / `G4_FULL`；默认只读。
- `SECURITY_FIX`：G0–G2；随后由独立只读上下文执行 `G4_DIFF`，可作为同一获准任务的子任务。
- `SCHEMA_OR_DEPENDENCY`：经批准的 G0–G3 与必要安全子 Gate。
- `RELEASE`：只有逐项授权后才进入 G5。

## 3. Gate 不授予操作权限

下列权限须由所有者分别明确授权，可在一次任务中同时给出；模板中的布尔字段仅为记录方式，Gate 本身不授予权限：

```text
STAGE_ALLOWED
COMMIT_ALLOWED
PUSH_ALLOWED
MAIN_MERGE_ALLOWED
TAG_ALLOWED
DEPLOYMENT_ALLOWED
STAGING_ACCESS_ALLOWED
PRODUCTION_ACCESS_ALLOWED
NETWORK_ALLOWED
DEPENDENCY_INSTALL_ALLOWED
SECURITY_SCAN_ALLOWED
FULL_SCAN_ALLOWED
```

- `STAGE_ALLOWED` 指 Git index；不是 staging 环境。
- 生产访问/部署必须同时满足 `DEPLOYMENT_ALLOWED=true` 与 `PRODUCTION_ACCESS_ALLOWED=true`。
- 允许 commit 不代表允许 push；允许 push 不代表允许 main merge、tag 或部署。

## 4. G0 — Preflight

核对实际仓库、worktree、分支、HEAD、索引、dirty patch 来源、目标范围、权限、预算及敏感排除。历史记录是线索，不强迫当前现场回退。

已授权且来源明确的补丁继续使用并保护；未知或冲突修改只阻断受影响动作。解释漂移，不自动 reset、stash、clean、checkout、prune、切基线或读取未获准媒体。

## 5. G1 — Targeted Verification

按变更类型选择最小命令：

- Markdown/TOML/JSON/YAML：语法、结构、schema 或链接检查；
- TypeScript：修改文件 lint/typecheck、目标单测、`git diff --check`；
- shell/Python helper：目标语法检查与 focused test；
- migration：仅在 Contract 允许时做 schema/migration 的目标验证。

G1 不默认运行全仓测试、build、Playwright、Semgrep、Docker 或环境访问。

## 6. G2 — Affected Regression

覆盖：

- 修改模块；
- 直接调用方；
- 合法行为；
- 负向权限/输入/资源路径；
- 当前 patch 可能破坏的契约。

只运行影响分析能够解释的回归集合。不因一个小 patch 自动扩大到全仓。

## 7. G3 — Approved Batch or Milestone Quality Gate

以下情形在任务已授权本地候选/批次验证时可由执行者选择 G3，无需另开任务或补字段；记录影响分析与必要性：

1. 产品负责人批准的安全修复批次闭合；
2. 明确的里程碑 candidate 准备进入下一层 Gate；
3. schema、dependency、lockfile、共享 auth/authorization guard、共享契约或基础设施控制平面发生变化；
4. 相关运行输入改变后需要更新候选验证；纯 evidence commit 本身不触发。

以下情况**不触发 G3**：

- 单个小 patch；
- 单次 commit；
- 普通 cherry-pick；
- docs-only 变更；
- 只读 security review；
- 为了满足旧“每轮全量验证”模板。

G3 的具体命令从仓库脚本和 CI 确认，按任务范围选择，通常从 lint、typecheck、必要 unit/integration/E2E、Web/API build、Prisma validate 中选择。`pnpm install` 仅在依赖/lockfile/workspace 变化、环境缺失或明确授权时运行。

## 8. G4_DIFF — Exact Change Security Review

### 8.1 范围

只读审查 exact working-tree patch、commit 或 branch range，以及直接支持该 diff 的代码。不得自动扩展为全仓 deep scan。

### 8.2 独立性

默认模式：

```text
G4_DIFF_REVIEW_MODE=SEPARATE_REVIEW_CONTEXT
```

可使用只读子任务、独立任务或其他获准审查者；同一作者上下文不构成独立审查。以下情况必须独立：

- Critical/High finding；
- 认证、授权、Session/Cookie、Secret、文件上传/下载、外部调用、部署、root/特权和供应链边界；
- 修改公共 security control plane；
- patch 作者的同一会话已经出现两次失败或范围漂移。

所有安全修复的最终 diff 均由另一只读上下文审查，不以 Medium/Low 为由豁免独立性。同一主任务中的只读子任务可满足上下文独立；作者自审不可。无法取得第二上下文时保留 `REVIEW_PENDING`。

### 8.3 结果

输出 finding 是否关闭、是否引入回归、proof gap、未审查范围和精确 evidence identity。Review 不授予 stage/commit 权限；所有者已授权的 checkpoint 可先保存，但不代表审查通过。无第二上下文保留 REVIEW_PENDING。

## 9. G4_COMPONENT — Bounded Component Scan

必须满足：

```text
CHANGE_CLASS=SECURITY_REVIEW
SECURITY_SCAN_ALLOWED=true
ALLOWED_GATES includes G4_COMPONENT
SCAN_SCOPE is non-empty
MAX_PARALLELISM / MAX_DISCOVERY_PASSES / MAX_TOOL_CALLS / MAX_WALL_CLOCK_MINUTES are set
```

- 扫描只读；
- scope 必须是明确目录/组件和信任边界；
- 新 finding 写入唯一 Ledger 或在 chat 中形成导入包；
- 不在扫描任务中自动修复；
- 达到预算或停止条件立即停止。

## 10. G4_FULL — Full Repository Security Scan

必须同时满足：

```text
CHANGE_CLASS=SECURITY_REVIEW
SECURITY_SCAN_ALLOWED=true
FULL_SCAN_ALLOWED=true
ALLOWED_GATES includes G4_FULL
clean immutable commit/tree
HIGH_COST_APPROVAL_ID is non-null
HIGH_COST_APPROVAL_REASON is non-null
budget/concurrency limits are explicit
```

预算应明确实际范围、方法、并发和终点；模型与推理设置使用实际配置，不维护型号白名单，不要求无法获取的周额度比例。全仓扫描的明确授权和组织准入要求仍须满足。

- 全仓扫描只读；
- 不得在同一任务自动修复；
- 工具失败或无报告不得解释为 PASS；
- 输出 coverage、findings、proof gaps、工具/环境 identity 和预算实际使用摘要。

## 11. G5 — Release and Product Acceptance

G5 仅在：

```text
CHANGE_CLASS=RELEASE
DEPLOYMENT_ALLOWED=true
```

时可运行。除此之外，还必须分别检查：

- stage/commit/push/main merge/tag 是否获得对应授权；
- 目标为 staging 时：`STAGING_ACCESS_ALLOWED=true`；
- 目标为 production 时：`PRODUCTION_ACCESS_ALLOWED=true`；
- 部署 commit clean、已提交且不可变；本地离线交付绑定本地 source/tree 与制品摘要，推送与 remote commit 不适用；远端部署仍须已推送且远端可解析；
- 构建/镜像 tag、digest、runtime metadata；
- migration、Nginx/upstream、精确 URL/hostname；
- 浏览器 Network/console、真实操作、刷新后持久性；
- 目标角色与负向权限；
- 产品负责人确认。

本期已获用户授权交付 GCE 原生账号版，精确目标为 `https://timeline.all-too-well.com`；须保留适用发布证据、真实原生登录/角色负向验证与产品负责人确认。远端不可变提交可由本人服务器的私有 Git 接收并解析，不要求向公开 GitHub 披露源码；普通修复不得据此访问其他环境。

## 12. 证据缓存与失效

可复用 PASS 的 identity：

```text
commit
tree
lockfile hash
relevant config hash
tool name/version
command
environment
result/log SHA-256
```

失效规则：

- 仅文档变化：不使源码测试/build/scan 失效；
- 局部模块变化：只使相关 G1/G2/G4_DIFF 失效；
- shared guard/schema/dependency/config 变化：先影响分析，再由 Contract 决定 G3/G4_COMPONENT；
- 最终 evidence commit：复用未改变的应用输入证据；相关代码或环境变化则更新对应验证；
- 工具失败：记录 `BLOCKED_TOOLING`，不得解释为 PASS。

## 13. 两次失败停止

同一命令、环境和失败原因连续两次后暂停受影响动作，继续其他获准且独立的工作。下一次尝试至少改变一项：

- 已修复且可解释的根因；
- 工具版本或安装状态；
- 缺失输入/授权；
- 环境；
- 验证方案。

Blocker 只包含 identity、错误摘要、已尝试方案、根因/未知项、下一最小方案和所需用户决定。
