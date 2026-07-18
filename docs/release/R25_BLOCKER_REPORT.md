# R25 Blocker Report

## Decision

`R25_BLOCKED / PRODUCTION_NOT_AUTHORIZED / NO_CANDIDATE_TAG / STOP`

The resumed endurance gates passed on final runtime commit `6d24378168fd144e539b0e99f975b918b06e37a5`, but final staging UAT exposed a release-blocking administrator-path gap. This is a product P1 (`R25-ADMIN-001`), not missing test evidence:

- `/admin/audit-logs` is still a `PagePlaceholder` skeleton;
- authenticated `GET /api/admin/overview` returns HTTP 200;
- authenticated `GET /api/admin/audit-logs?page=1&pageSize=20` returns HTTP 404;
- the page contains no bounded audit list, filter, stable sort or independent detail reader required by the R25 gate.

R25 is explicitly a non-feature-development round. Implementing a new global audit-log API and UI here would violate the frozen scope and create a new runtime commit that requires every affected gate to be repeated. The round therefore stops under `AGENTS.md` after the same administrator gate failed twice: first through the real authenticated UI, then through authenticated endpoint/server-markup verification.

## Evidence that remains valid

- Release branch: `release/r25-final-gate`.
- Final runtime/staging commit: `6d24378168fd144e539b0e99f975b918b06e37a5`.
- Staging exact tag: `r25-6d2437818502`; `RUN_SEED=no`; 18 migrations and 0 pending; all five services healthy with restart count 0.
- R23 formally passed; historical endurance was not reused after R24.
- R24B passed with Critical/High/Medium `0/0/0`.
- GCP IAP read-only recheck passed; production remained on `7dd2243270c03399cd6da6cec41bf12eab68dd0b`, tracked changes 0.
- `R25-10VU30M-6D24378-20260718T083625Z` passed: 17,424/17,424 checks, HTTP/auth/5xx/functional failures 0, read/write p95 `106.338/58.429 ms`, restart/deadlock/duplicate groups 0, idle memory `-8.255%`.
- `R25-5VU2H-RETRY-6D24378-20260718T112109Z` passed: 34,832/34,832 checks, 34,830 iterations, HTTP/auth/5xx/functional failures 0, read/write p95 `119.742/44.276 ms`, 2 h load plus 5 m idle, idle memory `-0.602%`, restart/deadlock/queue/duplicate groups 0.
- Real employee UAT passed: task located in 1.102 s, progress/material submission completed in 58.770 s, first operation completed and second operation generated.
- Real project-manager UAT passed: risk identified in 1.405 s and stalled operation reached in two clicks; owner, blocker and expected-resolution evidence were visible.

## Administrator gate — attempt 1

Using the fresh real Feishu OAuth session in Chrome, navigation to `/admin/audit-logs` did not provide a usable audit query page. The route rendered no interactive audit list, filter, paging or detail control. This was initially treated as possibly a browser-control/rendering anomaly and independently verified.

## Administrator gate — attempt 2

The same authenticated identity was used for a read-only endpoint and server-markup verification without printing authentication values:

```text
GET /api/admin/overview                         200
GET /api/admin/audit-logs?page=1&pageSize=20  404
GET /admin/audit-logs                          200, placeholder=true
bounded audit list markup                      false
```

Repository inspection confirms the route maps to `PagePlaceholder` and the admin controller exposes only `GET /api/admin/overview`. Project-scoped logs exist, but they do not satisfy the required global administrator audit list/detail/filter gate.

## Cleanup

- The repository-external load session was successfully logged out server-side and destroyed.
- Final Gitleaks 8.30.1 current candidate-tree and full-history scans passed with 0 findings; repository-external auth directories and R25/k6 containers both count 0.
- No Cookie, OAuth code, token, App Secret, database password or storage state was printed or committed.
- The controlled UAT project and its append-only audit/history evidence were retained; no audit log was deleted or overwritten.
- No candidate tag, stable tag, `main` merge or production deployment occurred.

## Sequentially stopped gates

The exact-final full quality suite, remaining R25 security regression, final image scan/SBOM closure, backup/restore rehearsal, rollback/forward rehearsal, management retrospective UAT and release-candidate tag are `NOT RUN`/`NOT CREATED`. They must not be reported as passes.

## Safe resumption condition

Resolve `R25-ADMIN-001` in a separate authorized runtime-fix round by adding the required bounded global audit list, independent detail lookup, stable filtering/sorting and administrator/non-administrator authorization coverage. Then create a new runtime commit, rebuild/redeploy exact immutable artifacts and repeat both authenticated load profiles plus all subsequently affected quality, security, backup, rollback and UAT gates. Only a fully passing same-runtime evidence set may create `v1.1.0-rc.1` or request R25B approval.
