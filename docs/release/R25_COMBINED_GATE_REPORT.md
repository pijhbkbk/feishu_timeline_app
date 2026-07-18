# R25 Combined Stability, Security and Release Gate

## Current decision

`R25_BLOCKED / PRODUCTION_NOT_AUTHORIZED / NO_CANDIDATE_TAG / STOP`

The required 5 VU × 2 h profile did not pass after two consecutive executions. The round stopped under the repository execution protocol before complete regression, remaining security smoke, staging backup/restore, rollback/forward recovery, real staging UAT and candidate-tag creation. No production deployment, production active scan, `main` merge, candidate tag or stable tag is authorized.

## Frozen candidate

| Field | Value |
|---|---|
| runtime application commit | `f00703ac7834837f9ad573bc11d779a5caa7c02f` |
| security evidence commit | `72adbc3ad2ece6dc03b82509aa0af311c55f7147` |
| release branch | `release/r25-final-gate` |
| release candidate commit | NOT CREATED; round blocked before candidate closure |
| candidate tag | NOT CREATED; proposed `v1.1.0-rc.1` remains unreserved |
| staging runtime commit | `f00703ac7834837f9ad573bc11d779a5caa7c02f` |
| production runtime commit | `7dd2243270c03399cd6da6cec41bf12eab68dd0b`; unchanged, tracked tree clean |

The R24B evidence commit contains documentation plus scan/capture tooling corrections but no runtime application change. Candidate application images were built from a detached, exact `f00703a` worktree and carry that full revision in OCI labels.

## Immutable artifacts

| Artifact | Tag | Image ID / digest |
|---|---|---|
| API | `feishu-timeline-api:r25-f00703ac7834` | `sha256:c134e7c02b6de1ce9a67322676411bdf439505e629251faeb0251f6943702f91` |
| Web | `feishu-timeline-web:r25-f00703ac7834` | `sha256:9367d0942d3c1e91492e405d9e7fe762487b86a9b0fac28e5b47f867fc1aa064` |
| hardened PostgreSQL | `feishu-timeline-postgres:r25-f00703ac7834` | `sha256:5a87473011a32bfe237c96acc23a93d10e40b17c673b8ca73a19c7baff1b0975` |

Redis and Nginx use the pinned digests recorded in `R25_BUILD_PROVENANCE.md`. Staging deployment used `RUN_SEED=no`, `prisma migrate deploy`, 18 migrations with 0 pending, five healthy services and zero restarts.

## Prior-gate evidence

| Gate | Result |
|---|---|
| R23 | Formally PASSED at application commit `d6d4962f...`; its endurance commit is an ancestor of `f00703a`. |
| R23 reuse decision | Historical endurance is not sufficient for R25 because OAuth, session, Origin/CSRF, upload, Nginx, API, database/permissions, Redis/container topology and audit behavior changed. Both profiles are rerun. |
| R24B | PASS at final runtime `f00703a`; Critical/High/Medium `0/0/0`; Low/Informational `3/4`, all triaged with owners. |

## Authenticated stability

One real Feishu staging account supplied a short-lived repository-external session. The session value is never printed or copied into Git. The test project is restricted to an `R25-UAT-` prefix and all endurance writes carry unique run/request/idempotency identifiers. No nine-real-account claim is made.

### 10 VU × 30 minutes

Run `R25-10VU30M-20260717T054139Z`: **PASS**.

| Metric | Result | Gate |
|---|---:|---:|
| checks | `17,484/17,484`, 0 failures | all functional checks pass |
| HTTP error rate | `0%` | `<1%` |
| unexpected 401/403 | `0` | `0` |
| HTTP 5xx | `0` | `0` |
| read p95 | `72.986 ms` | `<800 ms` |
| write p95 | `62.546 ms` | `<1500 ms` |
| read / draft / progress operations | `15,735 / 876 / 871` | controlled mix |
| DB connections / slow queries / deadlocks | `18 / 0 / 0` | no saturation or deadlock |
| Redis memory / queue depth | `1,451,176 bytes / 0` | bounded / zero queue |
| service restarts | all five `0 → 0` | `0` |
| uncaught / unhandled / API 5xx / Nginx 5xx | `0 / 0 / 0 / 0` | all zero |
| duplicate active workflow groups | `0 → 0` | `0` |
| controlled write integrity | DB increments exactly `871` progress and `874` new draft audit rows, with final counts matching k6 operations | no lost/duplicate write evidence |
| idle API+Web memory change | `-2.061%` | `<20%` |

### 5 VU × 2 hours

**BLOCKED after two executions.**

| Execution | Result | Key evidence |
|---|---|---|
| `R25-5VU2H-20260717T061657Z` | FAIL | 34,907/34,907 checks and all functional/latency/integrity gates passed, but five-minute idle API+Web memory growth was `+60.2254%` against `<20%`. |
| `R25-5VU2H-RETRY2-20260717T082834Z` | INVALID / INTERRUPTED | Resource monitor showed a stable plateau and `+0.7989%`, but Mac/task interruption left k6 at about 1 h 20 m with no summary; after session expiry the orphan produced 401 responses. The container was stopped and removed. |

No third execution was started. Full details and the safe resumption condition are in `R25_BLOCKER_REPORT.md`.

## Regression and security status

| Area | Current R25 status |
|---|---|
| real Feishu OAuth and authorized project create | PASS |
| IAP firewall read-only recheck | PASS: API enabled, instance tagged, only `35.235.240.0/20` reaches tagged TCP 22; global rule disabled and retained |
| production remote anti-tamper | PASS: production remains on `7dd2243...`, tracked changes `0` |
| API/Web candidate Trivy | PASS, zero vulnerabilities at all severities |
| full regression | NOT RUN; stopped at 5 VU blocker |
| R24 key security smoke | PARTIAL only; remaining checks NOT RUN |
| staging backup/restore | NOT RUN; stopped at 5 VU blocker |
| staging rollback/forward recovery | NOT RUN; stopped at 5 VU blocker |
| staging real-user UAT | NOT RUN; stopped at 5 VU blocker |
| auth logout/destruction and final Gitleaks | PASS for cleanup: old session rejected; temp dirs/containers 0; Gitleaks current/history 0 findings |

## Defect and security counts

Known open product defects remain P0/P1/P2/P3 `0/0/0/0`, but R25 final defect counts are not established because full regression was not run. The endurance blocker is test/release evidence, not a product-severity defect. The last complete R24B security counts remain Critical/High/Medium/Low/Informational `0/0/0/3/4`; R25 final security counts are not established because the remaining smoke was not run.

## Evidence locations

- `docs/release/R25_STABILITY_EVIDENCE_REVIEW.md`
- `docs/release/R25_BUILD_PROVENANCE.md`
- `test-results/r25/preflight/` (Git-ignored)
- `test-results/r25/10vu-30m/` (Git-ignored)
- `test-results/r25/5vu-2h/` (Git-ignored; failed and interrupted execution evidence)
- `reports/security/r25/` (Git-ignored)
- `docs/release/R25_BLOCKER_REPORT.md`

## Release recommendation

Do not enter production release. R25 remains blocked until a fresh uninterrupted 5 VU × 2 h run passes and every sequentially stopped gate is completed. A candidate evidence commit/tag and separate product-owner R25B approval would still be required afterward.
