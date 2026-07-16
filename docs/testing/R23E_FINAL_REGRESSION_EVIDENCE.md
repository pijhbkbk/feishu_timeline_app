# R23E Final Regression and Evidence Closure

## 1. Decision

`R23E_PASS / R23_PASSED / STOP_BEFORE_R24`

R23D had already closed the exact staging deployment, audit pagination, 10 VU × 30 minutes and 5 VU × 2 hours gates. R23E ran only the final checks that the restricted sandbox had prevented. All required checks passed without modifying application code.

| Revision | Value |
|---|---|
| applicationCommit | `d6d4962f88dbb5b297d54c9f27326f3bf5616ec7` |
| stagingCommit | `d6d4962f88dbb5b297d54c9f27326f3bf5616ec7` |
| evidenceCommit | `075c25314dc30c53aa560fc0cf98fa6bf93aa49e` |
| branch | `release/r22-stability-security-rc` |

R23 is formally PASSED only after the evidence commit above is created and pushed. This report is limited to R23 closure; production deployment, `main` merge, tag creation and R24 work were not performed.

## 2. Environment and application freeze

The unrestricted preflight returned `GIT_WRITE_OK`, `DOCKER_OK` and `LOCALHOST_LISTEN_OK`. The final API and Web staging containers were healthy, had restart count 0 and both carried the full OCI revision equal to the application commit.

Before regression, all prior uncommitted test-runner and generated build-cache changes outside `docs/` were removed. The final diff from the application commit contained only evidence documents. The quality runs regenerated `apps/web/tsconfig.tsbuildinfo`; it was restored to the committed application version after verification. No file under `apps/`, `packages/`, `apps/api/prisma/`, `deploy/` or runtime configuration is part of R23E evidence.

## 3. Final regression results

| Gate | Result | Evidence summary |
|---|---:|---|
| API unit/security/transport | PASS | 51 files, 166/166 tests, 0 failed, 0 skipped, 4.52 s |
| previously blocked socket tests | PASS | all 4 executed; total increased from 162 to 166 |
| Web unit | PASS | 24 files, 74/74 tests, 0 failed, 0 skipped, 2.22 s |
| mainline E2E | PASS | isolated local PostgreSQL/Redis; 16.82 s |
| Playwright | PASS | 52/52, 0 failed, 0 skipped, 5.1 minutes |
| browser | INFO | Playwright 1.60.0; Chrome for Testing 148.0.7778.96 |
| lint | PASS | Shared, Web and API; 0 warnings |
| typecheck | PASS | Shared, Web and API |
| Web production build | PASS | 29 static pages generated; 13.66 s |
| API production build | PASS | 5.15 s |
| Prisma validate | PASS | schema valid; 1.14 s |

The E2E exercised project creation, attachment upload, step 4/6 parallel branches, non-blocking branch behavior, step 12 rework/new round, step 17 monthly plan and Web routes. The full browser run covered the R16–R23 regression set, including stale-write rejection, idempotent progress, concurrent same-name attachments, logout/stale action behavior, controlled 401/500 UI, material gates, replacement history, retrospective persistence, monthly deduplication, review rounds, interrupted upload recovery and reminder deduplication.

The formal-page quality instrumentation recorded `pageErrors: 0` and `consoleErrors: 0` across the eight primary pages and four viewports. Playwright reported no unexpected test-observable network failure or persistent loading state.

The first Playwright attempt stopped before product execution because the exact 1.60.0 Chromium binary was absent. Chrome for Testing 148.0.7778.96 was installed in the user cache, then the unchanged 52-test suite passed. This was an execution-environment repair, not an application change or product defect.

## 4. Real OAuth logout and server Session deletion

A fresh real Feishu OAuth flow returned to the deployed local staging and created an authenticated server Session. No Cookie, token, OAuth code, storageState or Session key was printed or copied into Git or reports.

| Check | Result |
|---|---:|
| authenticated Session created | PASS |
| Redis Session records before login | 1 |
| Redis Session records during authenticated window | 2 |
| logoutHttpStatus | 201 |
| oldSessionRejected | true (`authenticated=false`) |
| sessionStoreRecordDeleted | true (`EXISTS=0`) |
| Redis Session records after logout | 1 |
| authMaterialDestroyed | true |

The browser client blocked direct rendering of the JSON session endpoint, so the already-created newest R23E Session was selected inside the staging Redis container without outputting its key. Its token remained an internal shell variable and was submitted to the normal `POST /api/auth/logout` endpoint through standard Cookie authentication. The same old Session was then rejected and the exact Redis record no longer existed. No `/tmp/r23-auth.*` or `/tmp/r23e-auth.*` directory remains.

## 5. Secrets gate

The repository-pinned Gitleaks version `8.30.1` scanned both the current tracked/untracked candidate tree and full Git history with `--redact` semantics.

| Scan | Result | Findings |
|---|---:|---:|
| current candidate tree | PASS | 0 |
| full Git history | PASS | 0 |
| tracked auth/storage candidates | PASS | examples and source/test files only; no real auth material |

The pinned GHCR image could not start because the local Docker credential helper was interrupted. The same official pinned version was downloaded as the macOS arm64 binary, its version was verified as `8.30.1`, and the repository's existing secrets-scan wrapper completed successfully. Redacted raw summaries are under `test-results/r23e/secrets/` and remain Git ignored.

## 6. Existing endurance evidence remains valid

The application and staging commits remained exactly `d6d4962f88dbb5b297d54c9f27326f3bf5616ec7`. R23E changed only evidence documents and did not change application source, Prisma, deployment or runtime configuration. Therefore the following R23D evidence remains valid and was not rerun:

- audit pagination: 23,189 total/traversed/unique, 232 pages, no loss or duplicates;
- 10 VU × 30 minutes: 17,997 requests, 0 error/5xx/unexpected auth;
- 5 VU × 2 hours: 29,658 requests, 0 error/5xx/unexpected auth;
- both profiles: DB slow/deadlock 0, Redis queue 0, service restart 0, integrity anomalies 0.

## 7. Defects, policy and next boundary

Open defects are P0 0, P1 0, P2 0 and P3 0. Cumulative product defects are P1 7/7 fixed and P2 2/2 fixed. `R23D-BLOCK-005` is RESOLVED.

R23 acceptance reflects the currently approved product policy: every active authenticated user has full access, while anonymous, disabled and locked identities remain rejected and business state gates remain enforced. R23 does not claim nine-role isolation. The previously requested Plan A minimum-permission boundary remains mandatory before entering R24, but it was deliberately not implemented in R23E because that would create a new application commit and invalidate the same-commit endurance chain.

Evidence paths:

- `docs/testing/R23D_DEPLOYMENT_RECOVERY.md`
- `docs/testing/R23_AUTHENTICATED_ENDURANCE_REPORT.md`
- `docs/testing/R23_PERFORMANCE_REPORT.md`
- `docs/testing/R23_TEST_RUN_REPORT.md`
- `docs/testing/R23_BUG_TRACKER.md`
- `docs/testing/R23_FINAL_ACCEPTANCE.md`
- `docs/rounds/R23.md`
- `docs/EXECUTION_LEDGER.md`
- `test-results/r23e/` (Git ignored, redacted/non-authentication artifacts only)
