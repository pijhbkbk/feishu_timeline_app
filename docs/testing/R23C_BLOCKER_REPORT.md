# R23C Blocker Report — 2026-07-16

## Status

`R23C_BLOCKED / R23_NOT_PASSED / STOP`

The authenticated 5 VU × 2 h profile passed. The first 10 VU × 30 m profile exposed an unbounded project-log response and failed. The defect is fixed and locally verified in application commit `a4a9efd50404a512102dd74d1ab18d9bceb971a9`, but two consecutive staging deployment attempts failed on external registry connectivity before any candidate image or service switch was produced. Per `AGENTS.md`, no third deployment attempt was made.

## Exact commits and environment

| Field | Value |
|---|---|
| branch | `release/r22-stability-security-rc` |
| application candidate | `a4a9efd50404a512102dd74d1ab18d9bceb971a9` |
| pushed remote candidate | `a4a9efd50404a512102dd74d1ab18d9bceb971a9` |
| active staging commit | `cdb51963502e35004bf2667aec7c8b7a49a51e25` |
| migrations | 17 active, no schema change in the fix |
| active services | PostgreSQL, Redis, API, Web and Nginx healthy; restart count 0 |

## Failure chronology

1. `5 VU × 2 h`: PASS — 32,539/32,539 checks, read p95 736.946334 ms, write p95 133.294 ms, auth/5xx/restarts/deadlocks all 0, post-recovery memory growth -59.6311%.
2. First `10 VU × 30 m`: FAIL — 7/14,767 requests timed out, all on `GET /api/projects/:id/logs?page=1&pageSize=20`; read p95 1104.927509 ms, p99 4243.79083512 ms; auth anomalies and HTTP 5xx remained 0.
3. Diagnosis: the endpoint ignored pagination and returned 23,179 audit rows plus other timeline rows, approximately 11.1 MB per response. The database already had the correct `(projectId, createdAt)` index; a bounded 20-row index lookup took 0.075 ms.
4. Targeted real-session reproduction: 1 VU × 30 s, read p95 1223.4156002 ms; five project-log calls took 1127.617459–1530.604959 ms. Exact non-secret request IDs are retained in the ignored test result log.
5. Fix `a4a9efd`: the API now performs bounded cross-source pagination and fetches details only for page IDs; the UI displays total counts and loads additional pages explicitly. Unit regression proves the detail query is restricted to selected IDs. Read requests now carry non-secret request IDs.
6. Pre-deploy verification: API 163/163, Web 74/74, API/Web lint and typecheck, both builds and Prisma validate PASS.
7. Deployment attempt 1: Docker Hub `node:24-alpine` metadata lookup ended with `DeadlineExceeded`.
8. Deployment attempt 2: image build reached `pnpm install --frozen-lockfile`, downloaded 403/405 packages, then ended with `ECONNRESET` from `registry.npmjs.org`. Direct TLS probe failed at the same time. No image was released and staging remained on `cdb5196`.

## Security cleanup

The session was obtained through a headed real Feishu OAuth login. `POST /api/auth/logout` returned 201, and the server deletes the session before returning. The `/tmp/r23-auth.*` directory is absent. The cleanup helper's former 200/204-only check produced a false negative and has been corrected to accept NestJS's 201 response. No authentication value appears in reports or Git.

## Resume point

After Docker Hub and npm registry connectivity is stable:

1. recapture one real Feishu OAuth session into the controlled `/tmp/r23-auth.*` location;
2. deploy exact commit `a4a9efd50404a512102dd74d1ab18d9bceb971a9` with `RUN_SEED=no`;
3. verify image revisions, 17 migrations and five healthy services;
4. run a short post-fix preflight, then rerun only `10 VU × 30 m`;
5. destroy authentication material, run the complete regression and update final R23 reports;
6. stop after R23; do not enter R24.
