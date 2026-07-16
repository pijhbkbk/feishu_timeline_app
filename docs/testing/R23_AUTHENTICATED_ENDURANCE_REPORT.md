# R23 Authenticated Endurance Report

## Conclusion

`R23D_ENDURANCE_PASS / R23E_FINAL_CLOSURE_PASS / R23_PASSED`

The secure real-session injection and exact staging deployment problems are resolved. Audit pagination, 10 VU × 30 m and 5 VU × 2 h all passed on final application commit `d6d4962f88dbb5b297d54c9f27326f3bf5616ec7`. R23E then passed the final API transport, E2E, Playwright, Gitleaks and server logout/Session deletion checks without application changes, so R23 is formally PASSED.

## Revisions and authentication

| Field | Value |
|---|---|
| application candidate | `a4a9efd50404a512102dd74d1ab18d9bceb971a9` |
| evidence commit | R23C blocker evidence commit; full SHA recorded in the handoff output |
| active staging commit | `cdb51963502e35004bf2667aec7c8b7a49a51e25` |
| authentication | headed real Feishu OAuth, single real account under the current full-access policy |
| authSessionUsed | `true` |
| authMaterialDestroyed | `true` |

No Cookie, token, OAuth code or storageState value is present in this report, Git or test logs. Nginx recorded logout as HTTP 201; the server deletes the session before responding, and the controlled `/tmp/r23-auth.*` directory is absent.

## Endurance results

| Metric | 5 VU × 2 h | 10 VU × 30 m, pre-fix |
|---|---:|---:|
| result | PASS | FAIL |
| requests | 32,539 | 14,767 |
| check failures | 0 | 7 |
| error rate | 0% | 0.0474% |
| unexpected 401/403 | 0 | 0 |
| HTTP 5xx | 0 | 0 |
| read p50/p95/p99 | 23.436 / 736.946 / 2116.852 ms | 37.581 / 1104.928 / 4243.791 ms |
| write p50/p95/p99 | 27.012 / 133.294 / 373.641 ms | 47.103 / 403.541 / 674.133 ms |

All seven 10 VU failures were 10-second timeouts on `GET /api/projects/:id/logs?page=1&pageSize=20`. A targeted 1 VU real-session reproduction retained exact non-secret request IDs and produced read p95 1223.416 ms.

## Resources and integrity

The completed 5 VU profile recorded:

- post-idle API+Web memory growth: `-59.6311%`;
- peak CPU API/Web/Nginx/PostgreSQL/Redis: `332.26/9.29/3.14/26.26/2.61%`;
- peak memory: approximately `1103.87/120.90/14.49/173.20/10.41 MiB`;
- DB max connections 18, slow queries 0, deadlocks 0;
- Redis max memory 1,456,784 bytes, queue depth 0;
- service restarts 0, runtime 5xx/uncaught/unhandled/deadlock messages 0;
- duplicate active workflow groups 0, monthly instances remained 12;
- final controlled write evidence exactly matched 3,422 drafts and 1,699 progress updates.

The failed 10 VU runner exited immediately on thresholds, so it did not produce a canonical post-idle monitor. All five staging services remained healthy with restart count 0.

## Bug, validation and blocker

The database already had `(projectId, createdAt)` indexes. The API ignored pagination, materialized 23,179 audit rows and returned approximately 11.1 MB. The fix performs a bounded ordered union of page references, then loads only selected details; the UI retains total counts and provides explicit “load more”. No audit log was deleted or overwritten.

Pre-deploy validation passed API 163/163, Web 74/74, API/Web lint and typecheck, both production builds and Prisma validation. Final E2E/Playwright regression is not claimed after the application change because exact staging deployment failed twice on external registry connectivity. Full chronology and resume instructions are in `docs/testing/R23C_BLOCKER_REPORT.md`.

R23 cannot be marked PASSED, and R24 is not authorized.

## R23D final-commit authenticated results

| Metric | 10m preflight | 10 VU × 30m | 5 VU × 2h |
|---|---:|---:|---:|
| result | PASS | PASS | PASS |
| requests | 1,050 | 17,997 | 29,658 |
| error rate / 5xx / unexpected 401/403 | `0 / 0 / 0` | `0 / 0 / 0` | `0 / 0 / 0` |
| HTTP p50 / p95 / p99 | `16.976 / 47.181 / 54.603` | `32.074 / 96.776 / 139.994` | `33.474 / 80.758 / 125.575` |
| read p95 / write p95 / audit p95 | `47.452 / 15.049 / 17.828` | `97.490 / 95.124 / 92.577` | `88.660 / 66.958 / 70.998` |
| post-idle API+Web memory growth | `6.1569%` | `-1.3618%` | `-0.4664%` |
| DB connections / slow / deadlock | `15 / 0 / 0` | `18 / 0 / 0` | `18 / 0 / 0` |
| Redis queue / service restarts | `0 / 0` | `0 / 0` | `0 / 0` |

The final profiles used changing audit pages and time/user/action filter combinations. Duplicate active workflow groups, duplicate recurring tasks, duplicate notifications and partial attachment metadata remained 0. Successful progress response IDs were unique and matched the database counts.

`authSessionUsed: true`; `authMaterialDestroyed: true`. Local material is absent. R23E independently verified server logout as HTTP 201, rejection of the old Session and deletion of the corresponding Redis record. No authentication value appears in Git or reports.

Full R23D chronology: `docs/testing/R23D_DEPLOYMENT_RECOVERY.md`.

## R23E final closure

R23E ran on the same application/staging commit and changed evidence documents only. API `166/166`, E2E, Playwright `52/52`, Gitleaks current/history and real OAuth logout all passed. The R23D 10 VU and 5 VU results therefore remain the authoritative final-commit endurance evidence and were not rerun.
