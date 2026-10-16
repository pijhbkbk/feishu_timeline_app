> 历史参考：本文件保留早期开发规则。当前执行以根 AGENTS.md、docs/gates/VERIFICATION_GATES.md 和所有者最新明确任务为准；本文件不独立启用旧身份、固定模型、强制模板字段或额外停步条件。

# Standard Codex Task Template

Use this template for ordinary repository work. Keep the task focused on ordinary software engineering. For `SECURITY_FIX`, use `SECURITY_REMEDIATION_PROMPT_TEMPLATE.md` instead; this general template cannot create a security-fix Contract. Do not copy scanner, exploit, or threat-model boilerplate unless the task only needs to read external evidence.

```yaml
CONTRACT_VERSION: 3
EXECUTION_PROFILE: STANDARD_CODEX_ONLY_V1
ACCESS_TIER: STANDARD_CODEX

TASK_ID: "<id>"
OBJECTIVE: "<one measurable outcome>"
CHANGE_CLASS: "READ_ONLY | DOCS_ONLY | LOCAL_CODE | SECURITY_REVIEW | SCHEMA_OR_DEPENDENCY | RELEASE"
REPOSITORY: "<absolute path>"
WORKTREE: "<absolute path>"
BRANCH: "<branch>"
BASELINE_COMMIT: "<40-char SHA>"
EXPECTED_HEAD: "<40-char SHA>"
DIRTY_POLICY: "MUST_BE_CLEAN | APPROVED_PATHS_ONLY | READ_ONLY_EXISTING_DIRTY"

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
LOCALHOST_TESTING_ALLOWED: false
EPHEMERAL_TEST_SERVICES_ALLOWED: false
LOCAL_DOCKER_ALLOWED: false

TRUSTED_ACCESS_FOR_CYBER_ALLOWED: false
ACTIVE_SECURITY_TESTING_ALLOWED: false
THIRD_PARTY_TARGET_ACCESS_ALLOWED: false
SECURITY_SCAN_ALLOWED: false
FULL_SCAN_ALLOWED: false
PLATFORM_POLICY_BLOCK_ACTION: STOP_AND_RECORD
EXTERNAL_EVIDENCE_INPUT_ALLOWED: true

G3_REASON: null
G4_DIFF_REVIEW_MODE: "NOT_APPLICABLE | SEPARATE_TASK | SEPARATE_REVIEWER"
INDEPENDENT_REVIEW_REQUIRED: false
INDEPENDENT_REVIEWER_ID: null

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

STOP_CONDITION: ["<exact measurable condition>"]
HANDOFF_REQUIRED: false
HANDOFF_PATH: null
```

## Required method

1. Read root/nested `AGENTS.md`, the standard profile, the current Task Contract, relevant handoff/spec/tests, and only the required source.
2. Run G0 and stop on identity/scope drift without cleanup or baseline changes.
3. State a short plan for multi-file work.
4. Make the smallest coherent allowlisted change.
5. Validate using static review, repository tests, localhost, mocks/fixtures, ephemeral local services, ordinary Docker/Compose, or package-manager advisory checks as explicitly allowed.
6. Do not perform active security testing, third-party target access, scanner execution, or any operation requiring an advanced cyber access tier.
7. When a step is blocked, record the exact check as `BLOCKED_BY_PLATFORM_POLICY` or `BLOCKED_BY_STANDARD_CODEX_PROFILE`; never fabricate PASS. A platform block must also record `RETRY_BY_REWORDING=NO`, `RETRY_BY_TOOL_SUBSTITUTION=NO`, and verified repository/index/remote preservation values.
8. Review the final diff and Git state.
9. Stop at the specified condition; do not automatically stage, commit, push, merge, tag, deploy, or start another task.

## Minimum final output

```text
TASK_ID=<id>
EXECUTION_PROFILE=STANDARD_CODEX_ONLY_V1
PREFLIGHT=<PASS|FAIL>
CHANGE_CLASS=<value>
CHANGED_FILES=<JSON array>
GATES_EXECUTED=<JSON array>
LOCAL_CHECKS=<summary>
POLICY_BLOCKED_CHECK_COUNT=<integer>
POLICY_BLOCKED_CHECKS=<JSON array>
RETRY_BY_REWORDING=<NO|NOT_APPLICABLE>
RETRY_BY_TOOL_SUBSTITUTION=<NO|NOT_APPLICABLE>
REPOSITORY_STATE_PRESERVED=<YES|NO|NOT_APPLICABLE>
INDEX_STATE_PRESERVED=<YES|NO|NOT_APPLICABLE>
REMOTE_STATE_PRESERVED=<YES|NO|NOT_APPLICABLE>
EXTERNAL_EVIDENCE_REQUIRED=<JSON array>
REPOSITORY_MUTATED=<YES|NO>
STAGE_EXECUTED=<YES|NO>
COMMIT_CREATED=<YES|NO>
PUSH_EXECUTED=<YES|NO>
DEPLOYMENT_EXECUTED=<YES|NO>
RESULT=<PASS|FAIL|PARTIAL|BLOCKED>
STOP=YES
```

When `POLICY_BLOCKED_CHECK_COUNT` is greater than zero, both retry fields must be `NO`; preservation fields must be verified evidence values rather than assumed `YES`.
