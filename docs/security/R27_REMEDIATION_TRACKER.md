# R27 Security Remediation Tracker

Updated: 2026-08-11 (Asia/Shanghai)

This tracker separates code remediation, local verification, external
acceptance and final security-owner disposition. A code change is not marked as
final R27 closure while a required formal scan, real staging control, company
review or target-architecture proof remains outstanding.

## Status vocabulary

| Status | Meaning |
|---|---|
| `FIXED_LOCAL_VERIFIED` | Code and focused/full local regression passed; no external runtime claim |
| `CODE_IMPLEMENTED_EXTERNAL_ACCEPTANCE_PENDING` | Code exists and local tests pass, but a real staging/company control is still required |
| `REMEDIATED_IN_FROZEN_LOCK_OR_IMAGE` | The exact lock/image candidate no longer contains the advisory finding |
| `AWAITING_SECURITY_DISPOSITION` | Triage and recommended disposition exist; company security has not confirmed it |
| `BLOCKED_TOOLING` | Required formal tool did not produce a result and was stopped under the two-failure rule |
| `NOT_STARTED` | Required external or later-round activity has not begun |

## Current aggregate truth

```text
R27A_SOURCE_COMMIT=f5edacd4e302f8a8377627c149eb2f160279d812
UNTRIAGED_HISTORICAL_FINDINGS=0
CONFIRMED_SECRET_FINDINGS_IN_EXACT_SOURCE_TREE=0
FINAL_DELIVERY_SECRET_CANDIDATES=PENDING_EXACT_EVIDENCE_RESCAN
FINAL_DELIVERY_SECRET_FALSE_POSITIVES=PENDING_EXACT_EVIDENCE_RESCAN
UNTRIAGED_SECRET_CANDIDATES=PENDING_EXACT_EVIDENCE_RESCAN
INITIAL_OPEN_NEEDS_SECURITY_REVIEW=13
INITIAL_NEW_NEEDS_SECURITY_REVIEW=2
NEW_NEEDS_SECURITY_REVIEW_CODE_RESOLVED=2
REMAINING_HISTORICAL_SECURITY_DISPOSITIONS=13
R27A_ADDITIONAL_CONFIRMED_MEDIUM=1
CONFIRMED_MEDIUM_CODE_IMPLEMENTED_EXTERNAL_ACCEPTANCE_PENDING=2
KNOWN_CODE_CRITICAL_HIGH_MEDIUM_BLOCKERS_AFTER_INDEPENDENT_REVIEW=0
FORMAL_SEMGREP_FINDINGS=NOT_PRODUCED
FINAL_R27_CRITICAL_HIGH_MEDIUM_ZERO=NOT_ESTABLISHED
```

## Confirmed first-party findings

| ID | Severity | Finding | Remediation | Evidence | Current status |
|---|---|---|---|---|---|
| `R27A-FP-001` | High | Logout cleared the browser cookie without reliably deleting the current Redis session | Logout reads the exact cookie token, validates the UUID, deletes only the current session, clears the cookie and remains idempotent | Auth/session focused tests; API suite; E2E | `FIXED_LOCAL_VERIFIED` |
| `R27A-FP-002` | High | Deployment/backup/restore scripts used `eval`, local interpolation or `$*`/`bash -lc` patterns that permitted command injection | Removed `eval`; strict argument validation; array argv; static remote programs; positional arguments; all GCE homologues audited and remediated | Malicious payload regression, `bash -n`, ShellCheck 0.11.0 on remediated scope | `FIXED_LOCAL_VERIFIED` |
| `R27A-FP-003` | Medium | Attachments could become downloadable/referenceable without quarantine malware verdict | Added `PENDING_SCAN`, `CLEAN`, `REJECTED`, `SCAN_ERROR`, `LEGACY_UNSCANNED`; quarantine, ClamAV adapter, CLEAN-only download/bind/query/count/direct-relation and Web gates | Attachment/ClamAV/storage tests, API suite, E2E | `CODE_IMPLEMENTED_EXTERNAL_ACCEPTANCE_PENDING` |
| `R27A-FP-004` | Medium | Notification/application logs exposed user, project, task or dedupe business identifiers | Replaced values with allowlisted event/result/latency/retry metadata and irreversible/truncated identifiers where needed | Redaction-focused tests and API suite | `FIXED_LOCAL_VERIFIED` |
| `R27A-FP-005` | Medium | Root bootstrap executed unpinned remote NodeSource content through `curl | bash` | Pinned package version and verified NodeSource key SHA-256/fingerprint through a scoped signed-by keyring; removed pipe-to-shell | Shell contract tests, `bash -n`, ShellCheck on remediated scope | `FIXED_LOCAL_VERIFIED` |
| `R27A-FP-006` | High | Eight project-scoped business modules relied on global roles without project membership/data-scope enforcement | Controller permission metadata plus scope-first `ProjectAccessService` checks for read/write/upload operations | 8-module unauthorized/authorized regression set, 53 focused tests, full API suite | `FIXED_LOCAL_VERIFIED` |
| `R27A-FP-007` | Medium | Authenticated actors could submit many parallel 20 MiB multipart requests, allowing full in-memory buffering before the downstream ClamAV concurrency gate and amplifying API/Nginx memory, connection and temporary-storage use | Added authenticated pre-Multer admission with global/actor/target/rate bounds, two-phase lease release, bounded tracker state, multipart-only Nginx ingress controls and API memory/PID limits | Tests-first 70-test upload/config/Nginx set; real client-abort slow-handler regression; full API 450 tests; build; fixed-digest `nginx -t`; independent design review | `CODE_IMPLEMENTED_EXTERNAL_ACCEPTANCE_PENDING` |

The eight project-scope modules are `samples`, `performance-tests`,
`mass-productions`, `paint-procurements`, `production-plans`,
`pilot-productions`, `standard-boards` and `development-reports`. The negative
tests assert rejection before business queries, transactions, scanner/storage
or attachment creation where applicable.

The attachment Medium is not closed by local code alone. Real staging must use
the ClamAV adapter, not the mock, and must prove clean/EICAR/error/timeout
behavior, engine/signature identity, network boundary and fail-closed download.

The resource-admission Medium is also not closed by source tests alone. The
admission gate now executes after authenticated guards and before Multer reads
the body; a permit is released only after both the HTTP transport terminates
and scanner/storage/database work settles. Per-process global concurrency is
hard-bound to the shared ClamAV limit of four, with per-actor, per-target and
bounded sliding-rate controls. Nginx disables request buffering for API
uploads, applies multipart-only client connection/rate limits, and enforces a
21 MiB request envelope. Real staging must still measure trusted client-IP
topology, container memory, scanner latency, normal browser concurrency and
the authorized load profile before this Medium receives external acceptance.

## Additional security hardening found during remediation

| ID | Severity/class | Observation | Result | Status |
|---|---|---|---|---|
| `R27A-HARD-001` | Low review | Notification `linkPath` accepted unvalidated external/protocol values | Restricted to approved internal paths and added negative tests | `FIXED_LOCAL_VERIFIED` |
| `R27A-HARD-002` | Low review | Unsafe mutations could pass when allowed origin was absent/invalid | Protected environments require a valid HTTPS frontend origin; unsafe cookie-session mutations fail closed on missing/mismatched origin | `FIXED_LOCAL_VERIFIED` |
| `R27A-HARD-003` | Defense in depth | Protected environments could start with missing/local/weak DB, Redis or scanner configuration | Staging/production now require explicit nonlocal URLs, password length, HTTPS frontend and real ClamAV configuration; mock auth is forbidden | `FIXED_LOCAL_VERIFIED` |
| `R27A-HARD-004` | Availability/reconciliation review | Scanner sockets and storage/DB compensation needed bounded behavior beyond the independently tracked pre-Multer resource finding `R27A-FP-007` | Added scan concurrency guard, streaming/backpressure, sibling settlement and independent purge/record attempts | `CODE_IMPLEMENTED_EXTERNAL_ACCEPTANCE_PENDING` |

Staging upload concurrency, container memory, Nginx client-IP/rate/connection
behavior, scanner latency and crash/double-failure reconciliation remain
measurement and operations review items. They are not represented as fully
accepted merely because unit and configuration tests pass.

## Dependency and image findings

| ID | Initial severity/scope | Initial version/path | Frozen result | Status |
|---|---|---|---|---|
| `R27A-SCA-001` | High; production dependency and old runtime images | `js-yaml@4.3.0` via Swagger | `js-yaml@5.2.2`; pnpm/OSV 0; exact local ARM64 images 0 findings | `REMEDIATED_IN_FROZEN_LOCK_OR_IMAGE` |
| `R27A-SCA-002` | High; production Web dependency and old runtime images | `nanoid@3.3.16` via Next/PostCSS | `nanoid@3.3.18`; pnpm/OSV 0; exact local ARM64 images 0 findings | `REMEDIATED_IN_FROZEN_LOCK_OR_IMAGE` |
| `R27A-SCA-003` | High; dev dependency copied into old runtime images | `brace-expansion@5.0.8` via lint tooling | `brace-expansion@5.0.9`; dev tooling no longer copied to runtime; exact images 0 findings | `REMEDIATED_IN_FROZEN_LOCK_OR_IMAGE` |

Exact local candidate evidence:

```text
pnpm production Critical/High/Medium/Low/Info=0/0/0/0/0
pnpm full lock Critical/High/Medium/Low/Info=0/0/0/0/0
OSV packages=472 vulnerabilities=0
API local linux/arm64 image C/H/M/L/U=0/0/0/0/0
Web local linux/arm64 image C/H/M/L/U=0/0/0/0/0
API ops local linux/arm64 image C/H/M/L/U=0/0/0/0/0
```

The pnpm and OSV results above are explicitly carried forward by the identical
lock SHA-256
`d5d165edb36508e4970647deb1835ad9d10ef6f2ccb804b0de55b781e77f21db`;
they are not represented as a new network scan after the sixth source-only
commit. License inventories and `THIRD_PARTY_NOTICES` were regenerated offline
from the exact commit and matched byte-for-byte.

This does not establish the production image gate until the target private-cloud
architecture is confirmed and the exact target-platform artifacts are rebuilt,
scanned and approved.

## Historical 13 security-owner dispositions

The company PDF's 156 findings remain completely triaged (`UNTRIAGED=0`). The
13 entries below were conservatively retained as `NEEDS_SECURITY_REVIEW`; R27A
does not silently rewrite the approved JSON or self-confirm a false positive.

| Vulnerability ID | Reported dependency/version | Count/status basis | Recommended disposition | Current status |
|---|---|---|---|---|
| `934674` | Next `15.5.13` | Reported version absent from frozen lock/image | `NOT_IN_PRODUCTION` | `AWAITING_SECURITY_DISPOSITION` |
| `934676` | Next `15.5.13` | Reported version absent from frozen lock/image | `NOT_IN_PRODUCTION` | `AWAITING_SECURITY_DISPOSITION` |
| `934658` | Next `15.5.13` | Reported version absent from frozen lock/image | `NOT_IN_PRODUCTION` | `AWAITING_SECURITY_DISPOSITION` |
| `934653` | Next `15.5.13` | Reported version absent from frozen lock/image | `NOT_IN_PRODUCTION` | `AWAITING_SECURITY_DISPOSITION` |
| `934649` | Next `15.5.13` | Reported version absent from frozen lock/image | `NOT_IN_PRODUCTION` | `AWAITING_SECURITY_DISPOSITION` |
| `934645` | Next `15.5.13` | Reported version absent from frozen lock/image | `NOT_IN_PRODUCTION` | `AWAITING_SECURITY_DISPOSITION` |
| `934706` | Next `15.5.18` | Reported version absent from frozen lock/image | `NOT_IN_PRODUCTION` | `AWAITING_SECURITY_DISPOSITION` |
| `934701` | Next `15.5.18` | Reported version absent from frozen lock/image | `NOT_IN_PRODUCTION` | `AWAITING_SECURITY_DISPOSITION` |
| `934697` | Next `15.5.18` | Reported version absent from frozen lock/image | `NOT_IN_PRODUCTION` | `AWAITING_SECURITY_DISPOSITION` |
| `934693` | Next `15.5.18` | Reported version absent from frozen lock/image | `NOT_IN_PRODUCTION` | `AWAITING_SECURITY_DISPOSITION` |
| `934747` | React DOM `19.2.4` | Reported version absent from frozen lock/image | `NOT_IN_PRODUCTION` | `AWAITING_SECURITY_DISPOSITION` |
| `934749` | React DOM `19.2.6` | Current third-party MD5 action-state identity path; no first-party `useActionState`, `useFormState`, server action or form-action call site | `FALSE_POSITIVE` for this application's production reachability | `AWAITING_SECURITY_DISPOSITION` |
| `934632` | `cookie-signature@1.0.6` | Current package exists, but API calls `cookieParser()` without a secret and does not use signed-cookie APIs; SHA-1 branch is not reached | `FALSE_POSITIVE` for this application's production reachability | `AWAITING_SECURITY_DISPOSITION` |

Current Next `15.5.21` may still contain equivalent third-party action-state
implementation. The application-level recommendation therefore relies on both
exact-version lineage and the absence of a first-party action/server-action
call path; it is not a claim that the vendor implementation no longer exists.

## Required later gates

| Gate | Required evidence | Current state |
|---|---|---|
| Formal first-party SAST | Approved Semgrep 1.169.0-equivalent fixed toolchain, 589-target exact-commit manifest, pinned/local rules and reviewed results | `BLOCKED_TOOLING`; no third attempt |
| Real staging attachment scanner | Real ClamAV endpoint, clean/EICAR/error/timeout, version/signature, fail-closed download and network boundary | `NOT_STARTED_EXTERNAL` |
| Legacy attachments | Rescan or formally approved disposal/exception for `LEGACY_UNSCANNED` | `NOT_STARTED_EXTERNAL` |
| Playwright | Browser + matching Playwright ffmpeg cache; assertions and report | `BLOCKED_TOOLING_AFTER_2_ATTEMPTS` |
| Full-manifest ShellCheck | Review/remediate 5 warnings and 20 informational observations, then one approved all-50 rerun | `REVIEW_PENDING_AFTER_2_GATE_ATTEMPTS` |
| Local Git object-database secret coverage | If required by company policy, cover 13 post-autosquash unreachable commits/reflog-only objects or approve metadata disposition; branch/package/push lineage is unaffected | `AWAITING_SECURITY_SCOPE_DECISION` |
| Target architecture image scan | Rebuild and scan API/Web/api-ops for approved private-cloud architecture | `AWAITING_ARCHITECTURE` |
| License review | Company review of UNKNOWN/GPL/LGPL/CC-BY and Sharp/libvips obligations | `AWAITING_LEGAL_SECURITY` |
| Authenticated staging DAST | Authorized staging only; authenticated ZAP/OpenAPI/IDOR/upload smoke | `NOT_STARTED` |
| Stability | 10 VU x 30 minutes plus 5 VU x 2 hours after final security build | `NOT_STARTED` |
| Company rescan | Final company package and confirmed dispositions | `NOT_STARTED` |

## Stop decision

```text
R27A_CODE_IMPLEMENTED
R27A_LOCAL_QUALITY_PARTIALLY_VERIFIED
FULL_MANIFEST_SHELLCHECK_REVIEW_PENDING
LOCAL_GIT_UNREACHABLE_SECRET_SCOPE_DECISION_PENDING
CONFIRMED_SECRET_FINDINGS_IN_EXACT_SOURCE_TREE=0
FINAL_DELIVERY_CONFIRMED_SECRET_FINDINGS=PENDING_EXACT_EVIDENCE_RESCAN
FINAL_DELIVERY_UNTRIAGED_SECRET_CANDIDATES=PENDING_EXACT_EVIDENCE_RESCAN
ATTACHMENT_SCANNER_REAL_STAGING_ACCEPTANCE_PENDING
ATTACHMENT_RESOURCE_ADMISSION_STAGING_LOAD_ACCEPTANCE_PENDING
REMAINING_HISTORICAL_SECURITY_DISPOSITIONS=13
FORMAL_SEMGREP_STILL_PENDING
STAGING_DAST_NOT_STARTED
FULL_STABILITY_NOT_STARTED
PRODUCTION_UNCHANGED
MAIN_UNCHANGED
TAG_UNCHANGED
SECURITY_CLEARANCE=NOT_ESTABLISHED
AWAITING_R27A_REVIEW
STOP
```
