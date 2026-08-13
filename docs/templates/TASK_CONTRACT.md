# Codex Task Contract v2

> 所有未填写权限按 `false`。`STAGE_ALLOWED` 指 Git index；`STAGING_ACCESS_ALLOWED` 指 staging 环境。

```yaml
CONTRACT_VERSION: 2
TASK_ID: "R27-<phase>-<task>"
OBJECTIVE: "One measurable outcome"
CHANGE_CLASS: "READ_ONLY | DOCS_ONLY | LOCAL_CODE | SECURITY_REVIEW | SECURITY_FIX | SCHEMA_OR_DEPENDENCY | RELEASE"
REPOSITORY: "/absolute/path"
WORKTREE: "/absolute/path"
BRANCH: "branch-name"
BASELINE_COMMIT: "40-char SHA"
EXPECTED_HEAD: "40-char SHA"
DIRTY_POLICY: "MUST_BE_CLEAN | APPROVED_PATHS_ONLY | READ_ONLY_EXISTING_DIRTY"
FINDING_IDS: []
ROOT_CAUSE_CLUSTER: null
SECURITY_INVARIANTS: []
ALLOWED_FILES: []
FORBIDDEN_FILES: []
ALLOWED_COMMANDS: []
FORBIDDEN_COMMANDS: ["git add -A", "git reset --hard", "git clean -fd"]
ALLOWED_GATES: ["G0"]
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
G3_REASON: null
G4_DIFF_REVIEW_MODE: "NOT_APPLICABLE | SEPARATE_TASK | SEPARATE_REVIEWER | SAME_TASK_APPROVED"
INDEPENDENT_REVIEW_REQUIRED: false
INDEPENDENT_REVIEWER_ID: null
INDEPENDENCE_WAIVER_REASON: null
SCAN_SCOPE: []
MAX_MODEL: "gpt-5.6-terra"
MAX_REASONING: "medium"
ULTRA_ALLOWED: false
SUBAGENTS_ALLOWED: false
MAX_SUBAGENTS: 0
MAX_PARALLELISM: 1
MAX_DISCOVERY_PASSES: 0
MAX_TOOL_CALLS: 40
MAX_WALL_CLOCK_MINUTES: 60
MAX_WEEKLY_BUDGET_PERCENT: 5
STOP_AFTER_NO_NEW_FINDINGS: 0
HIGH_COST_APPROVAL_ID: null
HIGH_COST_APPROVAL_REASON: null
STOP_CONDITION: ["Exact measurable stop condition"]
HANDOFF_REQUIRED: false
HANDOFF_PATH: null
FINAL_OUTPUT_FIELDS: ["TASK_ID", "BASELINE_COMMIT", "CURRENT_HEAD", "CHANGE_CLASS", "GATES_EXECUTED", "GIT_STATUS", "STOP"]
```

## 一致性规则

1. `READ_ONLY`：只读、无 repo 写入；Git/部署权限全部 false；handoff 默认 false。
2. `SECURITY_REVIEW`：只允许 G0 + `G4_DIFF|G4_COMPONENT|G4_FULL`；默认只读；G4_COMPONENT/FULL 要求 scan 权限，G4_FULL 还要求 full-scan 权限。
3. `SECURITY_FIX`：默认 G0/G1/G2；随后独立 G4_DIFF。Critical/High 和认证、授权、Session、Secret、文件、部署/特权边界不得豁免独立审查。
4. G3 只用于批准批次、里程碑、schema/dependency 或公共控制平面，且 `G3_REASON` 非空；小 patch/commit/cherry-pick 不触发。
5. production 同时要求 deployment + production access；Git 和环境授权互不蕴含。
6. 模型只允许 `gpt-5.6-terra|gpt-5.6-sol`；推理只允许 `low|medium|high|xhigh|ultra`。
7. Ultra 或 full scan 要求批准 ID/理由及并发、subagent、discovery、tool-call、wall-clock、周额度上限。
8. STOP_CONDITION 必须能由 ALLOWED_GATES 与 ALLOWED_COMMANDS 达成。
9. HANDOFF_REQUIRED=false 时 HANDOFF_PATH 必须为 null；只读任务不得强制 handoff。
10. 无关新问题进入 `docs/security/FINDINGS.yaml`，不扩大 Contract。
11. G0 drift 时停止，不自动 reset/stash/clean/checkout/prune/改基线。
12. 达到停止条件立即停止，不自动 stage/commit/push/merge/tag/deploy/下一任务。
