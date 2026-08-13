# Codex Security Remediation Template v2

> 一个 `SECURITY_FIX` 任务只修一个 finding 或一个紧密根因簇。
> 默认使用 `gpt-5.6-terra / high`；高风险根因可批准 `gpt-5.6-sol / high|xhigh`。`ultra` 和 subagents 默认禁止。

---

你现在执行一个**有界安全修复任务**。不得扩大为全仓安全清场。

## A. Security Fix Task Contract

```yaml
CONTRACT_VERSION: 2
TASK_ID: "R27D-<CLUSTER>-<NN>"
OBJECTIVE: "One measurable security outcome"
CHANGE_CLASS: "SECURITY_FIX"

REPOSITORY: "/absolute/path"
WORKTREE: "/absolute/path"
BRANCH: "branch"
BASELINE_COMMIT: "40-char SHA"
EXPECTED_HEAD: "40-char SHA"
DIRTY_POLICY: "MUST_BE_CLEAN | APPROVED_PATHS_ONLY"

FINDING_IDS: []
ROOT_CAUSE_CLUSTER: "<cluster>"
SECURITY_INVARIANTS: []

ALLOWED_FILES: []
FORBIDDEN_FILES: []
ALLOWED_COMMANDS: []
FORBIDDEN_COMMANDS:
  - "git add -A"
  - "git reset --hard"
  - "git clean -fd"

ALLOWED_GATES: ["G0", "G1", "G2"]
STAGE_ALLOWED: false
COMMIT_ALLOWED: false
PUSH_ALLOWED: false
MAIN_MERGE_ALLOWED: false
TAG_ALLOWED: false
DEPLOYMENT_ALLOWED: false
STAGING_ACCESS_ALLOWED: false
PRODUCTION_ACCESS_ALLOWED: false
NETWORK_ALLOWED: false
DEPENDENCY_INSTALL_ALLOWED: false
SECURITY_SCAN_ALLOWED: false
FULL_SCAN_ALLOWED: false

G4_DIFF_REVIEW_MODE: "SEPARATE_TASK"
INDEPENDENT_REVIEW_REQUIRED: true
INDEPENDENT_REVIEWER_ID: null
INDEPENDENCE_WAIVER_REASON: null

MAX_MODEL: "gpt-5.6-terra"
MAX_REASONING: "high"
ULTRA_ALLOWED: false
SUBAGENTS_ALLOWED: false
MAX_SUBAGENTS: 0
MAX_PARALLELISM: 1
MAX_DISCOVERY_PASSES: 0
MAX_TOOL_CALLS: 60
MAX_WALL_CLOCK_MINUTES: 90
MAX_WEEKLY_BUDGET_PERCENT: 5
HIGH_COST_APPROVAL_ID: null
HIGH_COST_APPROVAL_REASON: null

STOP_CONDITION:
  - "Focused regression passes"
  - "Affected regression passes"
  - "Exact review package is ready for a separate G4_DIFF task"

HANDOFF_REQUIRED: true
HANDOFF_PATH: "docs/handoff/<TASK_ID>.md"
```

## B. G0 — 只读核对

1. 读取：
   - 根和相关目录 `AGENTS.md` / `SECURITY.md`；
   - `docs/security/SECURITY_INVARIANTS.md`；
   - `docs/security/FINDINGS.yaml` 中本任务 finding；
   - 本 Task Contract；
   - 相关 handoff；
   - 仅与 finding 直接相关的源码、测试和必要 Git history。
2. 核对 REPOSITORY、WORKTREE、BRANCH、HEAD、status 与 Contract。
3. drift、未批准 dirty 文件或 baseline 不一致时，不 reset/stash/clean，输出 drift report 并停止。
4. 不读取未跟踪用户媒体、Secret、生产数据或无关历史报告。

## C. Investigation — 先不改代码

先输出：

```text
validated/rejected attack path
root cause
reachable entry points
affected legitimate behavior
smallest safe fix
files to change
focused regression plan
proof gaps
```

- 区分 confirmed、duplicate、false positive 和 hardening。
- 无法确认 finding 时，不为了完成任务而改代码；形成 Ledger 更新建议并停止。
- 需要 allowlist 外文件、命令或 Gate 时，停止等待新 Contract。

## D. Patch — 最小安全修改

1. 安全且可行时先增加 focused RED regression。
2. 只修改 `ALLOWED_FILES`，只运行 `ALLOWED_COMMANDS`。
3. 不做无关重构、全仓格式化、依赖升级、schema/migration、部署或其他 finding。
4. 不弱化测试、权限、日志、审计或数据保留。
5. New Finding Firewall：
   - 当前 patch 引入的回归：本任务处理；
   - 已确认可利用 Critical/High：登记并停止请求决定；
   - 其他：登记导入包，不扩大任务。

## E. G1/G2 — 最低充分验证

只运行 Contract 允许的：

- 修改文件 lint/typecheck/语法；
- focused RED→GREEN；
- 修改模块与直接调用方回归；
- 合法路径与负向安全路径；
- `git diff --check`。

不得运行全仓 G3、G4_COMPONENT、G4_FULL、Playwright、Semgrep、Docker、部署或环境访问，除非新 Contract 明确授权。

每个命令只报告：命令、退出码、测试数量摘要、失败关键片段、日志路径和结果 SHA-256。

## F. 生成独立 G4_DIFF Review Package

本修复任务不执行独立安全审查。生成：

```text
BASELINE_COMMIT
CURRENT_HEAD / WORKING_TREE_IDENTITY
DIFF_RANGE
PATCH_SHA256
CHANGED_FILES
FINDING_IDS
SECURITY_INVARIANTS
TARGETED_EVIDENCE
AFFECTED_REGRESSION_EVIDENCE
KNOWN_PROOF_GAPS
```

Critical/High 或认证、授权、Session、Secret、文件、部署/特权边界必须由单独 `SECURITY_REVIEW` 任务执行 G4_DIFF。

## G. Ledger、handoff 与停止

- 形成对 `docs/security/FINDINGS.yaml` 的建议状态：`accepted_for_fix -> in_progress -> fixed_target_verified`。
- 不标记 `fixed_diff_verified`、`fixed_full_verified` 或 `closed`。
- 如 `STAGE_ALLOWED=false` / `COMMIT_ALLOWED=false`，不得暂存或提交。
- 写入 `HANDOFF_PATH`：identity、变更、测试、review package、proof gap、new findings 和唯一下一步。
- 达到 STOP_CONDITION 后立即停止。

## H. 最终输出

```text
TASK_ID=<...>
BASELINE_COMMIT=<...>
CURRENT_HEAD=<...>
WORKTREE=<...>
FINDING_IDS=<...>
ROOT_CAUSE_CLUSTER=<...>
CHANGED_FILES=<...>
G1=<PASS|FAIL|BLOCKED>
G2=<PASS|FAIL|BLOCKED>
G4_DIFF=NOT_RUN_SEPARATE_TASK_REQUIRED
NEW_FINDINGS_LOGGED=<count/IDs>
FULL_REPO_G3=NOT_RUN_BY_DESIGN
G4_COMPONENT=NOT_RUN_BY_DESIGN
G4_FULL=NOT_RUN_BY_DESIGN
DEPLOYMENT=NOT_AUTHORIZED
STAGE_EXECUTED=NO
COMMIT_CREATED=NO
READY_FOR_INDEPENDENT_G4_DIFF=<YES|NO>
STOP
```

---

# Independent G4_DIFF Review Contract

> 另开新会话执行；只读，不修改 patch，不写强制 handoff。

```yaml
CONTRACT_VERSION: 2
TASK_ID: "R27D-<CLUSTER>-<NN>-G4DIFF"
OBJECTIVE: "Independently review the exact security patch"
CHANGE_CLASS: "SECURITY_REVIEW"
REPOSITORY: "/absolute/path"
WORKTREE: "/absolute/path"
BRANCH: "branch"
BASELINE_COMMIT: "40-char SHA"
EXPECTED_HEAD: "40-char SHA or working-tree identity"
DIRTY_POLICY: "READ_ONLY_EXISTING_DIRTY"
FINDING_IDS: []
ROOT_CAUSE_CLUSTER: "<cluster>"
SECURITY_INVARIANTS: []
ALLOWED_FILES: []
FORBIDDEN_FILES: []
ALLOWED_COMMANDS: []
FORBIDDEN_COMMANDS: ["git add -A", "git reset --hard", "git clean -fd"]
ALLOWED_GATES: ["G0", "G4_DIFF"]
STAGE_ALLOWED: false
COMMIT_ALLOWED: false
PUSH_ALLOWED: false
MAIN_MERGE_ALLOWED: false
TAG_ALLOWED: false
DEPLOYMENT_ALLOWED: false
STAGING_ACCESS_ALLOWED: false
PRODUCTION_ACCESS_ALLOWED: false
NETWORK_ALLOWED: false
DEPENDENCY_INSTALL_ALLOWED: false
SECURITY_SCAN_ALLOWED: false
FULL_SCAN_ALLOWED: false
G4_DIFF_REVIEW_MODE: "SEPARATE_TASK"
INDEPENDENT_REVIEW_REQUIRED: true
INDEPENDENT_REVIEWER_ID: "<review-session-or-reviewer-id>"
MAX_MODEL: "gpt-5.6-sol"
MAX_REASONING: "high"
ULTRA_ALLOWED: false
SUBAGENTS_ALLOWED: false
MAX_SUBAGENTS: 0
MAX_PARALLELISM: 1
MAX_DISCOVERY_PASSES: 0
MAX_TOOL_CALLS: 40
MAX_WALL_CLOCK_MINUTES: 60
MAX_WEEKLY_BUDGET_PERCENT: 3
STOP_CONDITION:
  - "Return PASS/FAIL/BLOCKED for the exact diff and stop"
HANDOFF_REQUIRED: false
HANDOFF_PATH: null
```

Review 输出：finding 是否真正关闭、patch 回归、合法行为、proof gap、allowlist 外变化、exact evidence identity。不得在 review 中修改代码。
