# Codex Governance Architecture v3

## 1. 目标

在 Token 可控的条件下，提高代码安全性、稳定性和可维护性。治理目标不是让 Agent 反复执行所有检查，而是让每项结论绑定清楚的 scope、commit/tree、命令、工具、环境和结果 hash。

核心流水线：

```text
immutable baseline
→ canonical Finding Ledger
→ bounded root-cause task
→ focused patch
→ G1/G2
→ independent G4_DIFF
→ approved batch G3
→ milestone G4_COMPONENT / final G4_FULL
→ authorized G5
```

## 2. 规范分层

1. 根 `AGENTS.md`：永久业务、安全、Git、授权和验证原则；不保存 R27 专属状态。
2. 目录 `AGENTS.md` / `SECURITY.md`：特定模块的信任边界、允许模式和目标命令。
3. `docs/templates/TASK_CONTRACT.md`：可选五项任务约定；自然语言明确授权有效。
4. `docs/security/FINDINGS.yaml`：唯一 Finding Ledger。
5. `docs/security/FINDINGS.schema.yaml`：Draft 2020-12 可校验结构 schema。
6. `docs/gates/VERIFICATION_GATES.md`：G0、G1、G2、G3、G4_DIFF、G4_COMPONENT、G4_FULL、G5。
7. `docs/rounds/` 与 handoff：当前轮次事实和临时禁止回退项。

R27 当前“不得改写已验收 R26 产品语义”等约束继续由 `docs/rounds/R27.md` 和最新 handoff 管理，不进入永久根规则。

## 3. 独立授权矩阵

以下权限互不蕴含：

```text
STAGE_ALLOWED
COMMIT_ALLOWED
PUSH_ALLOWED
MAIN_MERGE_ALLOWED
TAG_ALLOWED
DEPLOYMENT_ALLOWED
STAGING_ACCESS_ALLOWED
PRODUCTION_ACCESS_ALLOWED
```

生产操作必须同时满足 `DEPLOYMENT_ALLOWED=true` 和 `PRODUCTION_ACCESS_ALLOWED=true`。允许 stage/commit/push 不代表允许 main merge、tag 或部署。

## 4. Change Class

- `READ_ONLY`：状态核对、调查和比较；默认不写 handoff。
- `DOCS_ONLY`：治理文档或提示词变更；G0–G1。
- `LOCAL_CODE`：局部普通实现；G0–G2。
- `SECURITY_REVIEW`：只读 G4_DIFF / G4_COMPONENT / G4_FULL。
- `SECURITY_FIX`：有界 patch；默认 G0–G2，随后独立 G4_DIFF。
- `SCHEMA_OR_DEPENDENCY`：批准的 G3 和必要的 `G4_DIFF` / `G4_COMPONENT`。
- `RELEASE`：只有明确授权才进入 G5。

## 5. Gate 架构

- G3 只用于产品负责人批准的批次闭合、里程碑 candidate 或公共控制平面变化。小 patch、commit 和 cherry-pick 不自动触发。
- `G4` 不是 Contract 标识：
  - `G4_DIFF`：exact diff，Critical/High 和高风险边界必须独立审查；
  - `G4_COMPONENT`：明确组件，只读、固定 scope 和预算；
  - `G4_FULL`：clean immutable commit，全仓只读、高成本批准。
- Gate 只验证，不授予 stage/commit/push/merge/tag/deploy 权限。

## 6. Finding 控制平面

唯一 Ledger：`docs/security/FINDINGS.yaml`。

每项 finding 必须包含：

- 统一状态与允许 transition；
- severity、confidence、classification、CWE；
- exact source binding：commit/tree/tool/version/command/environment/result hash；
- affected files、entry points、trust boundary、reachability；
- root-cause cluster 与 security invariants；
- targeted/diff/full 独立验证证据；
- 风险接受的依据、批准人、责任人、期限、复核时间和补救计划。

## 7. Public endpoint 原则

- 所有业务写接口必须认证，无 public allowlist 例外。
- Public 例外只允许审计过的 auth bootstrap/callback、非敏感 health/readiness 或批准只读元数据。
- 例外精确到 method + path，并记录 owner、依据、review date、资源边界和负向测试。

## 8. 模型与协作

模型/推理遵循所有者选择和实际配置，不写死型号白名单。任务允许时可使用有界只读子任务调查和独立审查；同一 worktree 单一代码写入者。记录实际可获得的资源限制，不编造额度。组件/全仓扫描继续要求明确范围、方法、权限和预算，平台与组织限制不因规则修改解除。

## 9. Handoff 与 Ledger

- Handoff 条件化：跨会话、留下获准 dirty 变更、持久化 blocker 或产品负责人要求时才写。
- `READ_ONLY` / `SECURITY_REVIEW` 默认不写 handoff。
- `docs/EXECUTION_LEDGER.md` 只记录里程碑、Gate、baseline、commit 或风险结论；旧“每轮必更新/CONTINUE/Next Round”模板标为历史非规范内容。

## 10. 当前执行入口

从 `docs/EXECUTION_LEDGER.md` 的最近有效任务和实际 Git/补丁状态恢复；旧 R27B 阶段序列是历史，不强迫重做或回退。获准完整任务持续完成修复、目标/受影响验证、候选质量和独立审查。远端、部署、main、production、tag 保持具体授权边界。

## 11. 文件清单

### Repo 中的规范文件

```text
AGENTS.md
docs/architecture/CODEX_GOVERNANCE_V2.md
docs/gates/VERIFICATION_GATES.md
docs/security/SECURITY.md
docs/security/SECURITY_INVARIANTS.md
docs/security/FINDINGS.yaml
docs/security/FINDINGS.schema.yaml
docs/templates/TASK_CONTRACT.md
docs/templates/HANDOFF_TEMPLATE.md
docs/templates/SECURITY_REMEDIATION_PROMPT_TEMPLATE.md
```

### 外部执行包文件

```text
R27B_CODEX_PROMPT.md
R27B_GOVERNANCE_REPAIR_PROMPT.md
R27B_OWNER_REVIEW_PROMPT_V2.md
MANIFEST.sha256
```
