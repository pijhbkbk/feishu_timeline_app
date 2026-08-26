# Codex Standard Execution Profile

**Profile ID:** `STANDARD_CODEX_ONLY_V1`
**Access tier:** `STANDARD_CODEX`
**Scope:** repository-wide, all future Codex tasks

## 1. Purpose and authority

This profile is the permanent capability ceiling for Codex work in this repository. It narrows operations to ordinary software engineering and release work that can be performed with standard Codex access.

It is not a mechanism for bypassing product safeguards. A Task Contract, handoff, nested `AGENTS.md`, task prompt, model choice, or owner authorization may narrow this profile, but may not expand it.

Source order for operational capability:

1. root `AGENTS.md` permanent red lines;
2. this profile;
3. the current approved Task Contract;
4. `docs/gates/VERIFICATION_GATES.md`;
5. task templates, handoffs, and historical records.

## 2. Fixed capability values

Every future Task Contract must contain:

```yaml
EXECUTION_PROFILE: STANDARD_CODEX_ONLY_V1
ACCESS_TIER: STANDARD_CODEX
TRUSTED_ACCESS_FOR_CYBER_ALLOWED: false
ACTIVE_SECURITY_TESTING_ALLOWED: false
THIRD_PARTY_TARGET_ACCESS_ALLOWED: false
SECURITY_SCAN_ALLOWED: false
FULL_SCAN_ALLOWED: false
PLATFORM_POLICY_BLOCK_ACTION: STOP_AND_RECORD
EXTERNAL_EVIDENCE_INPUT_ALLOWED: true
```

These values are fixed. A task that requires another value is invalid at G0.

## 3. Allowed ordinary software-engineering work

Subject to the current Task Contract, Codex may perform:

- read and review repository source, configuration, tests, documentation, diffs, commits, and authorized evidence;
- modify exact allowlisted files;
- run syntax, formatting, lint, typecheck, unit, integration, and existing E2E tests;
- run application services on `127.0.0.1` or an explicitly isolated local test network;
- use mocks, fixtures, ephemeral local databases, Redis, object-storage substitutes, and disposable test data;
- build and inspect local application artifacts and local Docker/Compose configurations;
- install lockfile-bound dependencies from explicitly identified package registries;
- run ordinary package-manager advisory commands such as `pnpm audit` for dependency maintenance;
- run Prisma schema, generation, migration, and upgrade tests against disposable local databases;
- perform static source/configuration review and configuration-rejection tests;
- perform Git stage, commit, push, merge, tag, and release operations only when each operation is separately and explicitly authorized;
- deploy ordinary application releases only to infrastructure the owner explicitly identifies and authorizes, without adding active security testing to that release task;
- read CI/check status and ordinary repository metadata when authorized.

Task-Contract-authorized ordinary product API calls, package-registry access, CI/repository metadata reads, and normal owner-environment release operations are not `THIRD_PARTY_TARGET_ACCESS`. They remain bounded by `NETWORK_ALLOWED`, `NETWORK_SCOPE`, environment ownership, and the individual operation permissions.

## 4. Operations Codex must not perform

Codex must not:

- request, require, or depend on Trusted Access for Cyber, Daybreak access, or another advanced cyber access tier;
- perform component-wide or full-repository security scanning as a Codex task;
- run Semgrep, ZAP, DAST, exploit frameworks, port/service scanners, password or credential attack tools, malware tooling, or equivalent active/offensive tooling;
- probe, scan, test, enumerate, or exploit any third-party target;
- perform active testing against staging or production, even when owned by the user, unless the operation is an ordinary documented product flow rather than a security test;
- attempt authentication bypass, persistence, privilege escalation, credential extraction, destructive payloads, or offensive deployment;
- generate exploit proof-of-concept code as a verification prerequisite;
- weaken TLS, checksum, authentication, authorization, CSRF, Origin, CORS, upload, audit, or logging controls to complete a gate;
- rephrase, split, wrap, encode, or retry a blocked operation for the purpose of evading a platform safeguard.

## 5. Permitted defensive substitutes

When a risk requires verification, prefer in this order:

1. static source/configuration review;
2. existing unit or integration tests;
3. new focused unit tests using safe synthetic values;
4. localhost-only E2E through documented product interfaces;
5. mocks, fixtures, contract tests, property tests, and configuration-rejection tests;
6. isolated Docker/Compose or ephemeral database reproduction;
7. user-supplied external reports, verified read-only against exact commit/tree/tool identity.

Do not create attack tooling merely to increase confidence.

## 6. Status vocabulary

Use only evidence-accurate statuses:

```text
PASS
FAIL
NOT_RUN
NOT_APPLICABLE
NOT_AVAILABLE
BLOCKED_TOOLING
BLOCKED_BY_STANDARD_CODEX_PROFILE
BLOCKED_BY_PLATFORM_POLICY
EXTERNAL_EVIDENCE_REQUIRED
```

Rules:

- a blocked, unavailable, or unexecuted check is never `PASS`;
- ordinary completed checks may still pass independently of a blocked check;
- if a mandatory proof remains blocked, readiness depending on that proof must remain `NO`;
- a finding cannot be closed solely because the prohibited verification route was skipped;
- external reports may be accepted only when bound to the exact commit/tree, scope, tool/version, command, environment, and result hash.

## 7. Platform-policy stop rule

If Codex displays a message requiring additional cyber access or otherwise blocks a step:

1. stop that step immediately;
2. do not alter repository, index, refs, evidence, target environment, or credentials as a workaround;
3. do not retry by changing wording or substituting an equivalent active tool;
4. record the exact check as `BLOCKED_BY_PLATFORM_POLICY`;
5. continue only with independent ordinary software-engineering checks that remain permitted;
6. report whether the blocked check is mandatory for the requested readiness decision.

Record the blocked step with this audit shape:

```text
<CHECK_NAME>=BLOCKED_BY_PLATFORM_POLICY
RETRY_BY_REWORDING=NO
RETRY_BY_TOOL_SUBSTITUTION=NO
REPOSITORY_STATE_PRESERVED=YES
INDEX_STATE_PRESERVED=YES
REMOTE_STATE_PRESERVED=YES
```

Do not assert a preservation value that was not verified. Any `NO` or unknown preservation result is itself a blocker for readiness that depends on unchanged state.

No repository document can guarantee that a platform safeguard will never appear.

## 8. Gate mapping

- `G0`, `G1`, `G2`, `G3`, and ordinary `G5` remain available when explicitly authorized.
- `G4_DIFF` remains available only as passive/local exact-change review using the permitted substitutes above.
- Every `SECURITY_FIX` must receive G4_DIFF from a separate read-only task/session or independent reviewer; the implementation task cannot satisfy its own review.
- `G4_COMPONENT` and `G4_FULL` are external-evidence classifications only. Codex must not execute them under this profile.
- Historical records using older gate semantics remain evidence but are non-normative for future execution.

## 9. Security invariants and findings

`docs/security/SECURITY_INVARIANTS.md` remains binding. This profile does not lower product requirements.

When an invariant cannot be proven with standard Codex methods:

- preserve the finding or proof gap;
- identify the permitted checks that did complete;
- mark the missing evidence `EXTERNAL_EVIDENCE_REQUIRED` or the relevant blocked status;
- do not claim security clearance, zero findings, formal closure, staging readiness, or main-merge readiness without the required evidence.

## 10. Prompt discipline

Future prompts should state the ordinary software outcome, exact files, exact local tests, Git/environment permissions, and stop condition. They should not copy large threat-model or scanner boilerplate when the task only needs ordinary code, build, test, configuration, Git, or release work.
