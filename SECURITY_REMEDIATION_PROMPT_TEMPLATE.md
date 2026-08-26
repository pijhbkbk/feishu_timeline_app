# Standard Codex Defensive Software Remediation Template

> One task fixes one accepted finding or one tightly coupled root-cause cluster. This template uses ordinary Codex capabilities only. It does not request or depend on Trusted Access for Cyber.
>
> `docs/templates/SECURITY_REMEDIATION_PROMPT_TEMPLATE.md` is canonical; the root copy must remain byte-identical.

## A. Task Contract

```yaml
CONTRACT_VERSION: 3
EXECUTION_PROFILE: STANDARD_CODEX_ONLY_V1
ACCESS_TIER: STANDARD_CODEX

TASK_ID: "R27-<cluster>-<nn>"
OBJECTIVE: "One measurable defensive software outcome"
CHANGE_CLASS: SECURITY_FIX
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
FORBIDDEN_COMMANDS: ["git add -A", "git reset --hard", "git clean -fd"]
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
NETWORK_SCOPE: []
DEPENDENCY_INSTALL_ALLOWED: false
LOCALHOST_TESTING_ALLOWED: true
EPHEMERAL_TEST_SERVICES_ALLOWED: true
LOCAL_DOCKER_ALLOWED: false

TRUSTED_ACCESS_FOR_CYBER_ALLOWED: false
ACTIVE_SECURITY_TESTING_ALLOWED: false
THIRD_PARTY_TARGET_ACCESS_ALLOWED: false
SECURITY_SCAN_ALLOWED: false
FULL_SCAN_ALLOWED: false
PLATFORM_POLICY_BLOCK_ACTION: STOP_AND_RECORD
EXTERNAL_EVIDENCE_INPUT_ALLOWED: true

G4_DIFF_REVIEW_MODE: SEPARATE_TASK
INDEPENDENT_REVIEW_REQUIRED: true
INDEPENDENT_REVIEWER_ID: null

MAX_MODEL: "gpt-5.6-terra"
MAX_REASONING: "high"
ULTRA_ALLOWED: false
SUBAGENTS_ALLOWED: false
MAX_SUBAGENTS: 0
MAX_PARALLELISM: 1
MAX_DISCOVERY_PASSES: 1
MAX_TOOL_CALLS: 60
MAX_WALL_CLOCK_MINUTES: 90
MAX_WEEKLY_BUDGET_PERCENT: 5
STOP_CONDITION:
  - "Focused local regression passes"
  - "Affected local regression passes"
  - "Exact patch package is ready for a separate passive/local G4_DIFF"
HANDOFF_REQUIRED: true
HANDOFF_PATH: "<allowlisted review-package handoff path>"
```

## B. G0 — Read-only preflight

1. Read applicable `AGENTS.md`, `docs/architecture/CODEX_STANDARD_EXECUTION_PROFILE.md`, invariants, finding, Task Contract, handoff, and only directly relevant source/tests/history.
2. Verify repository, worktree, branch, HEAD, dirty state, allowlist, permissions, and profile.
3. On drift, do not reset/stash/clean/switch baseline. Report and stop.
4. Do not read unrelated untracked media, credentials, production data, or historical evidence.

## C. Diagnosis before edits

Report:

```text
observed risk condition
root cause
reachable product entry points
affected legitimate behavior
smallest safe repair
files required
safe local regression plan
proof gaps / external evidence required
```

- Distinguish confirmed finding, duplicate, false positive, hardening, test-harness issue, environment issue, and evidence gap.
- Do not modify code merely to finish the task when the finding is not established.
- Stop if a safe repair needs files, commands, environment, or capabilities outside the Contract.

## D. Smallest coherent patch

1. Add a focused regression where safe and useful.
2. Change only allowlisted files and use only allowed commands.
3. Do not combine unrelated refactors, dependencies, schemas, deployment, or findings.
4. Do not weaken authentication, authorization, validation, audit, logging, retention, TLS, checksums, or tests.
5. Do not create exploit PoCs or active target checks. Use ordinary source review, unit/integration tests, localhost documented flows, mocks, fixtures, and configuration-rejection tests.

## E. G1/G2 — Ordinary local validation

Run only approved checks such as:

- syntax, lint, typecheck, and `git diff --check`;
- focused regression;
- affected module/caller tests;
- legitimate behavior;
- safe local rejection/permission/input cases;
- localhost-only E2E through documented product interfaces;
- ephemeral database/service tests;
- ordinary build, Docker/Compose, or package-manager advisory when authorized.

Do not run component/full scanners, DAST, target enumeration, exploit frameworks, credential tests, or third-party target security operations. Contract-authorized ordinary product API, registry, CI, and repository-metadata access remains ordinary software engineering.

If a platform restriction appears:

```text
<CHECK_NAME>=BLOCKED_BY_PLATFORM_POLICY
RETRY_BY_REWORDING=NO
RETRY_BY_TOOL_SUBSTITUTION=NO
REPOSITORY_STATE_PRESERVED=YES
INDEX_STATE_PRESERVED=YES
REMOTE_STATE_PRESERVED=YES
```

Stop that check. Do not retry by changing wording or tool wrapping. Verify every preservation value; never assume `YES`. A blocked check is not PASS.

## F. Passive/local independent review package

The implementation task does not perform its own independent review. Prepare:

```text
BASELINE_COMMIT
CURRENT_HEAD_OR_WORKING_TREE_IDENTITY
DIFF_RANGE
PATCH_SHA256
CHANGED_FILES
FINDING_IDS
SECURITY_INVARIANTS
TARGETED_LOCAL_EVIDENCE
AFFECTED_REGRESSION_EVIDENCE
POLICY_BLOCKED_CHECKS
EXTERNAL_EVIDENCE_REQUIRED
KNOWN_PROOF_GAPS
```

The later G4_DIFF task remains read-only and uses only standard-profile methods.

## G. Finding lifecycle and stop

- Suggest only the evidence-supported status transition.
- Evaluate `G4_COMPONENT` and `G4_FULL` separately against the finding's approved closure criteria: use `NOT_APPLICABLE` when not required, `EXTERNAL_EVIDENCE_REQUIRED` when required evidence is missing, or `PASS` with `EVIDENCE_SOURCE=EXTERNAL` after exact external evidence is verified.
- Do not mark `fixed_full_verified`, `closed`, or dependent readiness as complete when its mandatory external evidence is unavailable. Optional or non-applicable external evidence does not block closure.
- Obey individual Git/environment authorizations.
- Stop at the Task Contract condition.

## H. Final output

```text
TASK_ID=<id>
EXECUTION_PROFILE=STANDARD_CODEX_ONLY_V1
BASELINE_COMMIT=<sha>
CURRENT_HEAD=<sha>
FINDING_IDS=<JSON array>
CHANGED_FILES=<JSON array>
G1=<PASS|FAIL|NOT_RUN|NOT_AVAILABLE|BLOCKED_TOOLING|BLOCKED_BY_STANDARD_CODEX_PROFILE|BLOCKED_BY_PLATFORM_POLICY>
G2=<PASS|FAIL|NOT_RUN|NOT_AVAILABLE|BLOCKED_TOOLING|BLOCKED_BY_STANDARD_CODEX_PROFILE|BLOCKED_BY_PLATFORM_POLICY>
G4_DIFF=NOT_RUN_SEPARATE_TASK_REQUIRED
G4_COMPONENT=<NOT_APPLICABLE|PASS|EXTERNAL_EVIDENCE_REQUIRED>
G4_COMPONENT_EVIDENCE_SOURCE=<NOT_APPLICABLE|EXTERNAL>
G4_FULL=<NOT_APPLICABLE|PASS|EXTERNAL_EVIDENCE_REQUIRED>
G4_FULL_EVIDENCE_SOURCE=<NOT_APPLICABLE|EXTERNAL>
POLICY_BLOCKED_CHECKS=<JSON array>
RETRY_BY_REWORDING=<NO|NOT_APPLICABLE>
RETRY_BY_TOOL_SUBSTITUTION=<NO|NOT_APPLICABLE>
REPOSITORY_STATE_PRESERVED=<YES|NO|NOT_APPLICABLE>
INDEX_STATE_PRESERVED=<YES|NO|NOT_APPLICABLE>
REMOTE_STATE_PRESERVED=<YES|NO|NOT_APPLICABLE>
PROOF_GAPS=<JSON array>
DEPLOYMENT=NOT_AUTHORIZED
STAGE_EXECUTED=<YES|NO>
COMMIT_CREATED=<YES|NO>
READY_FOR_PASSIVE_LOCAL_G4_DIFF=<YES|NO>
STOP=YES
```

When `POLICY_BLOCKED_CHECKS` is non-empty, both retry fields must be `NO`; preservation fields must contain verified values. `G4_COMPONENT` or `G4_FULL` may be `PASS` only for exact external evidence, never from Codex execution.
