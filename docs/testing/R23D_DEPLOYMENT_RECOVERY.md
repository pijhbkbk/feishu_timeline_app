# R23D Deployment Recovery

## Conclusion

`R23D_RECOVERY_COMPLETE / SUPERSEDED_BY_R23E_PASS / R23_PASSED`

The staging artifact mismatch and both authenticated endurance gates were closed on one exact application commit. R23E subsequently moved execution to an unrestricted environment and passed the previously blocked API transport tests, E2E, Playwright, Gitleaks and server-side logout/Session deletion checks without changing application code. The restricted-sandbox blocker below is retained as R23D history; the current authoritative result is in `docs/testing/R23E_FINAL_REGRESSION_EVIDENCE.md`.

## Exact revisions and images

| Field | Value |
|---|---|
| application commit | `d6d4962f88dbb5b297d54c9f27326f3bf5616ec7` |
| prior pagination commit | `a4a9efd50404a512102dd74d1ab18d9bceb971a9` |
| prior evidence commit | `bcb5d9e882e64e852287f8cf0c2f94a6b7c7bb06` |
| staging before | `cdb51963502e35004bf2667aec7c8b7a49a51e25` |
| staging after | `d6d4962f88dbb5b297d54c9f27326f3bf5616ec7` |
| API image | `feishu-timeline-api:r23d-d6d4962f88db` / `sha256:82ebedf96fcaf3edd2096eea2910cd0376b42734026a587f356052bde866d3bd` |
| Web image | `feishu-timeline-web:r23d-d6d4962f88db` / `sha256:95d7aff3f653da9b1a63877ccebaa36b199fcba073fc38945662abd05142286b` |
| OCI revision | full application commit on both images |
| build time | `2026-07-16T04:44:28Z` |
| evidence commit | `UNAVAILABLE` — restricted sandbox denies `.git/index.lock` creation with `EPERM` |

Both images passed the repository-pinned Trivy scan with no reported vulnerabilities. Deployment used `RUN_SEED=no`, `--no-build`, `--pull never`; Prisma reported 17 migrations and 0 pending. PostgreSQL, Redis, API, Web and Nginx were healthy, `/api/health` returned 200, and API/Web restart counts were 0.

## Network-independent recovery

The pnpm lock hash was identical between the old staging source and the candidate. The local pnpm store was incomplete for a clean offline install, so no second registry retry was attempted. The exact candidate was compiled from the existing lock-matched workspace dependencies, then overlaid on the already audited local `cdb5196` runtime images. Docker builds used `--pull=false --network=none` and immutable tags. Web source was unchanged between `a4a9efd` and `d6d4962`; both final images were relabelled with the full final revision.

The host did not have a cached k6 image. To avoid pulling `grafana/k6:latest`, R23D added a repository-local Node endurance runner with the same VU counts, durations, traffic ratios, status/latency thresholds, authenticated writes and resource monitor. No public registry was used for deployment or endurance recovery.

## Audit pagination special test

Result: `PASS`.

| Metric | Result |
|---|---:|
| total / traversed / unique items | `23,189 / 23,189 / 23,189` |
| pages at pageSize 100 | `232` |
| default / maximum pageSize | `20 / 100` |
| largest response | `48,714 bytes` |
| p50 / p95 / p99 / max | `20.495 / 25.464 / 66.525 / 109.914 ms` |
| requests / 5xx / unexpected auth | `248 / 0 / 0` |

Page 1, page 2, out-of-range, 1/50/100/100000 page sizes and invalid page/date inputs passed. The scan proved stable cross-source ordering, no duplicates or loss, summary-only list data, an independent detail endpoint, and time/user/action/combined filters.

Evidence: `test-results/r23d/audit-pagination-special.json` (Git ignored).

## Authenticated preflight and endurance

Authentication used a headed real Feishu OAuth session under `/tmp/r23d-auth.*` with directory/file modes 0700/0600. No Cookie, token, OAuth code or storageState value was printed, committed or copied into reports.

| Profile | Result | Requests | Error / 5xx / auth | HTTP p50 / p95 / p99 | Read p95 | Write p95 | Audit p95 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 10m preflight | PASS | 1,050 | `0 / 0 / 0` | `16.976 / 47.181 / 54.603 ms` | `47.452` | `15.049` | `17.828` |
| 10 VU × 30m | PASS | 17,997 | `0 / 0 / 0` | `32.074 / 96.776 / 139.994 ms` | `97.490` | `95.124` | `92.577` |
| 5 VU × 2h | PASS | 29,658 | `0 / 0 / 0` | `33.474 / 80.758 / 125.575 ms` | `88.660` | `66.958` | `70.998` |

The 10 VU run produced 861 unique progress records from 861 successful progress writes. The 5 VU run produced 1,478 unique progress records from 1,478 successful progress writes. Draft audit counts matched 952 and 2,990 respectively.

### Resources and integrity

| Metric | 10 VU × 30m | 5 VU × 2h |
|---|---:|---:|
| post-idle API+Web memory growth | `-1.3618%` | `-0.4664%` |
| API/Web peak CPU | `56.23% / 8.55%` | `36.99% / 7.66%` |
| API/Web peak memory | `227,540,992 / 117,859,942 bytes` | `228,904,141 / 117,125,939 bytes` |
| DB max connections / slow queries / deadlocks | `18 / 0 / 0` | `18 / 0 / 0` |
| Redis max bytes / queue | `1,457,592 / 0` | `1,457,592 / 0` |
| service restarts | `0` | `0` |
| uncaught / unhandled / 4xx / 5xx | `0 / 0 / 0 / 0` | `0 / 0 / 0 / 0` |
| duplicate workflow/recurring/notification groups | `0 / 0 / 0` | `0 / 0 / 0` |
| partial attachment metadata | `0` | `0` |

Evidence directories:

- `test-results/r23d/preflight/R23D-PREFLIGHT-FINAL-20260716T1255/`
- `test-results/r23d/10vu-30m/R23D-10VU-FINAL-20260716T1306/`
- `test-results/r23d/5vu-2h/R23D-5VU-FINAL-20260716T1342/`

## Final regression and cleanup blocker

Passed on the final source:

- lint;
- typecheck;
- Web unit tests `74/74`;
- API unit/security tests other than the socket-bound transport suite: `162 passed`, no assertion failure;
- Web production build;
- API production build;
- Prisma validate.

Blocked by the restricted sandbox, not by an assertion:

- API multipart transport suite: `listen EPERM 127.0.0.1` (four tests not executed);
- `pnpm test:e2e`: tsx IPC `listen EPERM .../tsx-501/*.pipe` before seed or application startup;
- `pnpm playwright:test`: Docker API socket permission denied before infrastructure startup;
- final Gitleaks: native binary absent and Docker API unavailable;
- server logout call: localhost connect denied with `EPERM`.
- evidence commit/push: `.git` is read-only and `git add` cannot create `index.lock`.

The `/tmp/r23d-auth.*` directory was deleted and local authentication material is destroyed. Because the logout request could not reach the service after sandbox restriction, server-side session deletion is not claimed.

## Decision and resume point

P0 is 0. Product P1 is 0: `R23C-P1-007` is closed by the audit special and both final-commit endurance profiles. R23 remains `BLOCKED / NOT PASSED` solely because final E2E, Playwright, Gitleaks and server logout verification are incomplete on the final commit.

Resume in an execution context that permits localhost binding/access, Docker API access and Git index writes. Do not rerun endurance. Run only the blocked regression/cleanup commands, commit/push this evidence, and then decide R23. Do not enter R24, deploy production, merge main or create a tag. Plan A minimum permissions remains mandatory before R24 and has not been applied because changing application code now would invalidate the completed final-commit R23 endurance evidence.

## R23E closure

R23E completed the exact resume point: API `166/166`, E2E PASS, Playwright `52/52`, current-tree and full-history Gitleaks PASS, logout HTTP 201, old Session rejected, corresponding Redis Session record deleted and authentication material destroyed. `R23D-BLOCK-005` is resolved and R23 is PASSED. Existing endurance was not rerun because application/staging remained on `d6d4962f88dbb5b297d54c9f27326f3bf5616ec7` and the R23E diff contains evidence documents only.
