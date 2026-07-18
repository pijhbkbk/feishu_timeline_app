# R25 Combined Stability, Security and Release Gate

## Current decision

`R25_BLOCKED / PRODUCTION_NOT_AUTHORIZED / NO_CANDIDATE_TAG / STOP`

Both same-runtime authenticated load profiles now pass. R25 nevertheless fails final staging UAT because the required administrator audit-log query surface is not implemented. No production deployment, `main` merge, candidate tag or stable tag is authorized.

## Frozen candidate

| Field | Value |
|---|---|
| runtime application commit | `6d24378168fd144e539b0e99f975b918b06e37a5` |
| release branch | `release/r25-final-gate` |
| release candidate commit | NOT CREATED |
| candidate tag | NOT CREATED; proposed `v1.1.0-rc.1` remains unreserved |
| staging runtime commit | `6d24378168fd144e539b0e99f975b918b06e37a5` |
| production runtime commit | `7dd2243270c03399cd6da6cec41bf12eab68dd0b`; unchanged, tracked tree clean |

## Exact staging artifacts

| Component | Immutable tag | Digest / image ID |
|---|---|---|
| API | `feishu-timeline-api:r25-6d2437818502` | `sha256:b117abb32e0f7c2e8133e58cc00980374b0dc4f2804cbff37e11d4af7e38b980` |
| Web | `feishu-timeline-web:r25-6d2437818502` | `sha256:298511494483dec4775d97e787cbc56ebf554df97e7998d886ff51547efe65ee` |
| PostgreSQL | `feishu-timeline-postgres:r25-6d2437818502` | `sha256:5c6597c9de882a5fb279eb1316e98e708ca4f9cb32a1936b8e2316f8270a1602` |
| Redis | pinned digest | `sha256:6ab0b6e7381779332f97b8ca76193e45b0756f38d4c0dcda72dbb3c32061ab99` |
| Nginx | pinned digest | `sha256:ec664813a30459a8e7176315268a623f6b31abc370eeac51c7de81cd4ec4d451` |

OCI revision/source/version/created labels were inspected on API, Web and PostgreSQL. Deployment used `RUN_SEED=no`, 18 migrations/0 pending, and five healthy services with restart count 0.

## Prior gates

- R23 formally PASSED at `d6d4962...`; its pre-R24 endurance was not reused.
- R24B PASSED; Critical/High/Medium `0/0/0` and Low/Info `3/4` at the completed R24B gate.
- GCP IAP and production anti-tamper read-only checks passed in this resumed run.

## Authenticated stability on `6d24378`

| Profile | Result | Checks | Read/write p95 | Auth/5xx/functional | Memory after idle | Restarts/deadlocks/queue |
|---|---|---:|---:|---:|---:|---:|
| 10 VU × 30 m | PASS | 17,424/17,424 | 106.338/58.429 ms | 0/0/0 | -8.255% | 0/0/0 |
| 5 VU × 2 h + 5 m idle | PASS | 34,832/34,832 | 119.742/44.276 ms | 0/0/0 | -0.602% | 0/0/0 |

The two-hour run completed 34,830 iterations, 29,650 reads, 3,409 draft writes and 1,771 progress writes. Database connections peaked at 18; slow queries, deadlocks, duplicate active workflow groups, restarts, uncaught/unhandled errors and API/Nginx 5xx were all 0.

## Real staging UAT

- Employee path: PASS; task 1.102 s, progress/material 58.770 s, operation complete and next operation generated.
- Project-manager path: PASS; risk 1.405 s and stalled operation in two clicks.
- Administrator path: **FAIL / P1 `R25-ADMIN-001`**; `/admin/audit-logs` remains a placeholder and authenticated global list endpoint returns 404.
- Management path: NOT RUN after sequential stop.

## Gates not closed

The following are not passes: exact-final full quality suite, remaining R25 security regression and final five-image/SBOM closure, backup/restore rehearsal, rollback/forward rehearsal, management UAT, release document closure and candidate tag creation.

## Counts at stop

- Product defects: P0/P1/P2/P3 = `0/1/0/0`.
- Last completed security gate (R24B): Critical/High/Medium/Low/Info = `0/0/0/3/4`.
- R25 final security counts: NOT ESTABLISHED because the R25 security stage did not complete.

## Evidence

- `docs/release/R25_BLOCKER_REPORT.md`
- `docs/release/R25_STAGING_UAT.md`
- `docs/release/R25_STABILITY_EVIDENCE_REVIEW.md`
- `docs/release/R25_BUILD_PROVENANCE.md`
- Git-ignored `test-results/r25-final/10vu-30m/`
- Git-ignored `test-results/r25-final/5vu-2h/`
- Git-ignored `test-results/r25/uat/`

## Recommendation

Do not enter R25B or production release. Fix `R25-ADMIN-001` in a separately authorized runtime round, then rebuild/redeploy and repeat all affected same-runtime gates. A candidate evidence commit/tag and explicit product-owner approval are still required after a complete PASS.
