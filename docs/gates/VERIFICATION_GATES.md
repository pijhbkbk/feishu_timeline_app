# Verification Gates v3 — Standard Codex Only

## 1. Purpose and controlling profile

Use the lowest sufficient validation for the current task. Gates define evidence requirements; they do not grant Git writes, environment access, or deployment permissions.

All future Codex tasks are governed by:

```text
EXECUTION_PROFILE=STANDARD_CODEX_ONLY_V1
ACCESS_TIER=STANDARD_CODEX
```

`docs/architecture/CODEX_STANDARD_EXECUTION_PROFILE.md` is the capability ceiling. Task Contracts may narrow it but cannot enable Trusted Access for Cyber, active security testing, third-party target access, security scans, or full scans.

If a requested operation is outside the profile, record `BLOCKED_BY_STANDARD_CODEX_PROFILE`. If the product/platform blocks it, record `BLOCKED_BY_PLATFORM_POLICY`. Neither status is PASS.

## 2. Executable Gate identifiers

Future Task Contracts may list only:

```text
G0
G1
G2
G3
G4_DIFF
G5
```

Historical `G4_COMPONENT` and `G4_FULL` labels remain readable as external-evidence classifications, but are not executable Codex gates under this profile.

| Gate | Core question | Typical cost | Default trigger |
|---|---|---:|---|
| G0 | Are repo, worktree, branch, commit, scope, profile, and permissions exact? | Low | Every task |
| G1 | Is the patch syntactically and behaviorally correct for its direct target? | Low | Write tasks |
| G2 | Do affected modules and safe local negative/configuration paths regress correctly? | Medium | Code/fix tasks |
| G3 | Is an approved batch or milestone candidate healthy repository-wide? | High | Explicit batch/milestone |
| G4_DIFF | Does the exact change preserve relevant invariants under passive/local review? | Medium | Bounded defensive fixes |
| G5 | Is an immutable release actually deployed and accepted in the explicitly authorized owner environment? | Very high | Explicit release tasks |

## 2.1 Change Class defaults

- `READ_ONLY`: G0; no repository writes; no mandatory handoff.
- `DOCS_ONLY`: G0–G1.
- `LOCAL_CODE`: G0–G2.
- `SECURITY_REVIEW`: G0 + G4_DIFF only; passive/local and read-only.
- `SECURITY_FIX`: G0–G2; then a separate standard-profile G4_DIFF.
- `SCHEMA_OR_DEPENDENCY`: approved G0–G3 and, when needed, G4_DIFF.
- `RELEASE`: G0 plus explicitly authorized ordinary G5 after every Git/environment/deployment permission is separately granted; add G1–G3 or G4_DIFF only when the Contract identifies a concrete need.

A task title or finding severity does not expand the execution profile.

## 3. Gates do not grant permissions

The Task Contract must separately define:

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
```

The following profile values are fixed and cannot be enabled:

```text
TRUSTED_ACCESS_FOR_CYBER_ALLOWED=false
ACTIVE_SECURITY_TESTING_ALLOWED=false
THIRD_PARTY_TARGET_ACCESS_ALLOWED=false
SECURITY_SCAN_ALLOWED=false
FULL_SCAN_ALLOWED=false
```

- `STAGE_ALLOWED` means Git index, not staging environment.
- Commit does not imply push; push does not imply main merge, tag, or deployment.
- Production requires both `DEPLOYMENT_ALLOWED=true` and `PRODUCTION_ACCESS_ALLOWED=true`.

## 4. G0 — Preflight

Record:

```text
execution profile / access tier
repository / worktree / branch / HEAD / baseline
raw and parsed git status
change class
allowed and forbidden files/commands/gates
Git and environment permissions
network and dependency-install boundaries
platform-block policy
sensitive exclusions
```

Any mismatch requires:

```text
DRIFT_DETECTED
NO_SOURCE_CHANGE
STOP
```

Do not automatically reset, stash, clean, checkout, prune, switch baseline, or read unauthorized untracked files.

## 5. G1 — Targeted verification

Select the smallest applicable checks:

- Markdown/TOML/JSON/YAML: syntax, structure, schema, or links;
- TypeScript: changed-file lint/typecheck, focused tests, `git diff --check`;
- shell/Python helper: syntax and focused safe tests;
- Prisma: schema/generation/migration checks only when authorized;
- build/config: ordinary local build and configuration validation.

G1 does not automatically run full tests, Playwright, Docker, environment access, or any scanner.

## 6. G2 — Affected regression

Cover only what impact analysis supports:

- changed modules and direct callers;
- legitimate behavior;
- safe local rejection/permission/input/resource cases;
- concurrency, idempotency, state-machine, migration, or legacy-data paths when relevant;
- current contracts the patch could break.

Use unit/integration/E2E on localhost, mocks, fixtures, and ephemeral services. Do not turn a regression test into active target testing or exploit development.

## 7. G3 — Approved batch or milestone quality

G3 runs only when the Task Contract includes `G3` and a non-empty `G3_REASON`, for example:

1. an approved repair batch closes;
2. a milestone candidate proceeds to another gate;
3. schema, dependency, lockfile, shared auth/authorization guard, shared contract, or infrastructure control plane changes;
4. a final evidence commit requires one repository-wide regression.

G3 does not trigger merely because of a small patch, single commit, ordinary cherry-pick, docs-only change, read-only review, or historical template.

Commands must be discovered from repository sources and may include lint, typecheck, necessary unit/integration/E2E, Web/API build, Prisma validation, local Docker/Compose, and package-manager advisory checks. `pnpm install` requires lockfile/workspace change, missing environment, or explicit permission.

## 8. G4_DIFF — Passive/local exact-change review

### 8.1 Scope

Read-only review of an exact working-tree patch, commit, or branch range plus only directly supporting code. It must not expand into component or repository scanning.

### 8.2 Permitted evidence

Use only:

- static source/configuration and data-flow review;
- exact patch/tree/blob reconstruction;
- existing or focused unit/integration tests;
- localhost-only documented product flows;
- mocks, fixtures, configuration-rejection tests, and ephemeral local services;
- ordinary build, package-manager advisory, and artifact inspection;
- user-supplied external reports bound to exact identity.

Do not execute active scanners, offensive tools, target enumeration, exploit PoCs, credential testing, or third-party access.

### 8.3 Independence and result

A separate read-only task/session remains the default for high-impact changes. The review reports:

Every `SECURITY_FIX` requires a separate read-only task/session or independent reviewer. The implementation task cannot waive or satisfy its own G4_DIFF.

- exact identity and scope;
- invariant preservation;
- legitimate behavior and safe rejection behavior;
- regressions/findings;
- blocked or external-evidence requirements;
- proof gaps;
- exact evidence identity.

G4_DIFF grants no stage or commit permission.

## 9. External component/full evidence

`G4_COMPONENT` and `G4_FULL` are not executable by Codex under `STANDARD_CODEX_ONLY_V1`.

Evaluate the two classifications independently. When repository policy or a finding requires component evidence, record `G4_COMPONENT=EXTERNAL_EVIDENCE_REQUIRED`; when it requires full-repository evidence, record `G4_FULL=EXTERNAL_EVIDENCE_REQUIRED`. Requiring one does not make the other mandatory.

or, when the platform itself blocks the attempted step:

```text
<CHECK_NAME>=BLOCKED_BY_PLATFORM_POLICY
RETRY_BY_REWORDING=NO
RETRY_BY_TOOL_SUBSTITUTION=NO
REPOSITORY_STATE_PRESERVED=YES
INDEX_STATE_PRESERVED=YES
REMOTE_STATE_PRESERVED=YES
```

Codex may read and verify an externally produced report only if it is bound to exact commit/tree, scope, tool/version or digest, command, environment, timestamp, and report hash. Missing, empty, stale, mismatched, unavailable, or tool-error evidence is not PASS and cannot formally close a finding.

Evaluate each external classification against approved closure/readiness criteria: record `NOT_APPLICABLE` when it is not required, `EXTERNAL_EVIDENCE_REQUIRED` when mandatory evidence is absent, or `PASS` with `EVIDENCE_SOURCE=EXTERNAL` only after exact evidence is verified. Never infer component/full PASS from Codex's local checks.

## 10. G5 — Release and product acceptance

G5 requires:

```text
CHANGE_CLASS=RELEASE
DEPLOYMENT_ALLOWED=true
```

and the relevant individual Git/environment permissions. For staging, `STAGING_ACCESS_ALLOWED=true`; for production, `PRODUCTION_ACCESS_ALLOWED=true`.

Ordinary G5 may validate an immutable pushed commit, build/image identity, migration, service configuration, exact URL, documented product flows, browser console/network needed for product acceptance, persistence, roles, and owner confirmation on infrastructure explicitly owned/authorized by the user.

G5 does not authorize active security testing. A release task must not add probes, scanners, fuzzing, exploitation, or credential testing.

## 11. Evidence caching and invalidation

Reusable PASS identity includes:

```text
commit / tree / lockfile hash / relevant config hash
tool and version / command / environment / result-log SHA-256
```

Rules:

- docs-only change does not invalidate source tests/build evidence;
- local change invalidates only relevant G1/G2/G4_DIFF evidence;
- shared guard/schema/dependency/config change requires impact analysis and may trigger G3;
- a final evidence commit runs only the approved final gate;
- tooling failure is `BLOCKED_TOOLING`, not PASS;
- standard-profile restriction is `BLOCKED_BY_STANDARD_CODEX_PROFILE`, not PASS;
- product/platform restriction is `BLOCKED_BY_PLATFORM_POLICY`, not PASS.

## 12. Stop and retry rules

After two failures with the same command, environment, and cause, stop. A later attempt must demonstrably change at least one of: root cause, tool/install state, required input/permission, environment, or validation method.

Do not retry a platform-blocked operation by rewording, wrapping, encoding, or switching to an equivalent prohibited tool.
Record the six platform-block audit fields from section 9, verify each preservation value, and keep dependent readiness at `NO` whenever a required proof or preservation result is missing.

A blocker report contains only identity, error summary, attempted permitted approaches, root cause/unknowns, smallest permitted next step, external evidence requirement, and any owner decision.
