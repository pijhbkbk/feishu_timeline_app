# Codex Task Contract v3 — Standard Codex Only

> Unfilled permissions are `false`. `STAGE_ALLOWED` means the Git index; `STAGING_ACCESS_ALLOWED` means the staging environment. This template cannot expand `STANDARD_CODEX_ONLY_V1`.

```yaml
CONTRACT_VERSION: 3
EXECUTION_PROFILE: "STANDARD_CODEX_ONLY_V1"
ACCESS_TIER: "STANDARD_CODEX"

TASK_ID: "R27-<phase>-<task>"
OBJECTIVE: "One measurable ordinary software-engineering outcome"
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
NETWORK_SCOPE: []
DEPENDENCY_INSTALL_ALLOWED: false

TRUSTED_ACCESS_FOR_CYBER_ALLOWED: false
ACTIVE_SECURITY_TESTING_ALLOWED: false
THIRD_PARTY_TARGET_ACCESS_ALLOWED: false
SECURITY_SCAN_ALLOWED: false
FULL_SCAN_ALLOWED: false

LOCALHOST_TESTING_ALLOWED: false
EPHEMERAL_TEST_SERVICES_ALLOWED: false
LOCAL_DOCKER_ALLOWED: false
EXTERNAL_EVIDENCE_INPUT_ALLOWED: true
PLATFORM_POLICY_BLOCK_ACTION: "STOP_AND_RECORD"
PLATFORM_POLICY_BLOCK_STATUS: "BLOCKED_BY_PLATFORM_POLICY"
RETRY_BY_REWORDING: false
RETRY_BY_TOOL_SUBSTITUTION: false

G3_REASON: null
G4_DIFF_REVIEW_MODE: "NOT_APPLICABLE | SEPARATE_TASK | SEPARATE_REVIEWER"
INDEPENDENT_REVIEW_REQUIRED: false
INDEPENDENT_REVIEWER_ID: null
G4_COMPONENT_EXTERNAL_EVIDENCE_REQUIRED: false
G4_FULL_EXTERNAL_EVIDENCE_REQUIRED: false

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

STOP_CONDITION: ["Exact measurable stop condition"]
HANDOFF_REQUIRED: false
HANDOFF_PATH: null
FINAL_OUTPUT_FIELDS:
  - TASK_ID
  - EXECUTION_PROFILE
  - BASELINE_COMMIT
  - CURRENT_HEAD
  - CHANGE_CLASS
  - GATES_EXECUTED
  - POLICY_BLOCKED_CHECKS
  - RETRY_BY_REWORDING
  - RETRY_BY_TOOL_SUBSTITUTION
  - REPOSITORY_STATE_PRESERVED
  - INDEX_STATE_PRESERVED
  - REMOTE_STATE_PRESERVED
  - EXTERNAL_EVIDENCE_REQUIRED
  - GIT_STATUS
  - STOP
```

## Consistency rules

1. `EXECUTION_PROFILE` must be `STANDARD_CODEX_ONLY_V1`; `ACCESS_TIER` must be `STANDARD_CODEX`.
2. `TRUSTED_ACCESS_FOR_CYBER_ALLOWED`, `ACTIVE_SECURITY_TESTING_ALLOWED`, `THIRD_PARTY_TARGET_ACCESS_ALLOWED`, `SECURITY_SCAN_ALLOWED`, and `FULL_SCAN_ALLOWED` must remain false; `PLATFORM_POLICY_BLOCK_ACTION` must remain `STOP_AND_RECORD`; `EXTERNAL_EVIDENCE_INPUT_ALLOWED` must remain true. The owner, task prompt, model, or reviewer cannot override these values.
3. Future `ALLOWED_GATES` may contain only `G0`, `G1`, `G2`, `G3`, `G4_DIFF`, and `G5`.
4. Historical `G4_COMPONENT`/`G4_FULL` requirements are evaluated individually. When the corresponding external-evidence-required field is false, record `NOT_APPLICABLE`; when true and exact evidence is absent, record `EXTERNAL_EVIDENCE_REQUIRED`; only exact verified external evidence may be `PASS` with `EVIDENCE_SOURCE=EXTERNAL`.
5. `READ_ONLY` performs G0 only by default; no repo write and no mandatory handoff.
6. `SECURITY_REVIEW` is passive/local G4_DIFF only. It cannot scan, probe, exploit, enumerate, or access third-party targets.
7. Every `SECURITY_FIX` performs G0/G1/G2 using ordinary local methods and then requires a separate passive/local G4_DIFF task/session or independent reviewer. Set `INDEPENDENT_REVIEW_REQUIRED=true`; same-task self-review is not permitted.
8. G3 requires an approved batch/milestone/shared-control reason. A small patch, commit, or docs-only task does not trigger it.
9. Production requires both deployment and production-access permission. Git and environment permissions never imply one another.
10. `STOP_CONDITION` must be achievable by the permitted gates and commands. A condition requiring a prohibited capability is invalid and must become `EXTERNAL_EVIDENCE_REQUIRED` or an explicit blocked status.
11. If the platform asks for additional cyber access, stop the affected step, preserve all state, record `BLOCKED_BY_PLATFORM_POLICY`, set both retry fields to false/`NO`, and report verified repository/index/remote preservation values. Do not retry by rewording or substituting an equivalent operation.
12. A blocked/unavailable/not-run check is not PASS. Mandatory missing evidence keeps dependent readiness and formal finding closure at `NO`.
13. `HANDOFF_REQUIRED=false` requires `HANDOFF_PATH=null`; read-only tasks do not write mandatory handoffs.
14. G0 drift stops without reset, stash, clean, checkout, prune, baseline switch, or unauthorized untracked-file access.
15. Reaching the stop condition never automatically authorizes stage, commit, push, merge, tag, deployment, or another task.
