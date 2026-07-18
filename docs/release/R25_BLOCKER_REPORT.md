# R25 Blocker Report

## Decision

`R25_BLOCKED / PRODUCTION_NOT_AUTHORIZED / NO_CANDIDATE_TAG / STOP`

R25 did not satisfy the required `5 VU × 2 h` authenticated endurance gate after two consecutive executions. The frozen runtime remains `f00703ac7834837f9ad573bc11d779a5caa7c02f`; no runtime code, workflow rule, production service or production data was changed.

## Evidence that remains valid

- Release branch `release/r25-final-gate` exists remotely.
- Exact R25 API/Web/PostgreSQL images were built and deployed to staging with OCI revision `f00703a`, `RUN_SEED=no`, 18 migrations and 0 pending migrations.
- Five staging services remained healthy with zero restarts.
- R23 is formally passed; R24B is passed with Critical/High/Medium `0/0/0`.
- `R25-10VU30M-20260717T054139Z` passed: 17,484/17,484 checks, 0 HTTP/auth/5xx/functional failures, read/write p95 `72.986/62.546 ms`, 0 deadlocks/restarts/duplicate active workflow groups and idle memory change `-2.061%`.

## 5 VU attempt 1 — valid execution, failed memory gate

Run: `R25-5VU2H-20260717T061657Z`.

- 34,907/34,907 checks passed.
- HTTP error, unexpected 401/403, HTTP 5xx and functional failure counts were all 0.
- Read/write p95 were `84.591/49.942 ms`.
- Database deadlocks, slow queries, duplicate active workflow groups, queue depth, service restarts, uncaught exceptions and unhandled rejections were all 0.
- API/Web memory changed from approximately `87.1/138.3 MiB` to `218.0/143.1 MiB` after the five-minute idle window: `+60.2254%`, exceeding the required `<20%` gate.
- Read-only staging diagnosis found no Redis fallback, unbounded application queue, detached V8 context, OOM, swap use, restart or descriptor growth. The API JS heap used about 64 MiB while V8 retained a much larger young-generation physical reservation. This explains the high-water behavior but does not override the explicit RSS-based gate.

## 5 VU attempt 2 — invalidated by execution interruption

Run: `R25-5VU2H-RETRY2-20260717T082834Z`.

- The retry kept the warmed candidate container and initially showed a stable high-water plateau.
- The independent resource monitor completed with API/Web memory change `+0.7989%`, database connections 18, slow queries/deadlocks 0, queue depth 0, restarts 0 and runtime 5xx/uncaught/unhandled errors 0.
- The Mac/task was interrupted and slept while k6 was running. k6 completed only about `1 h 20 m` of its required `2 h`, produced no final summary, and remained as an orphan container.
- After the short-lived session expired, the resumed orphan generated expected application 401 responses, which violate the endurance gate and make the run unusable as release evidence.
- The orphan container was stopped and removed. No third attempt was started because `AGENTS.md` requires a blocker report after two consecutive failed executions.

## Authentication cleanup

- The expired session was already rejected by protected staging endpoints with HTTP 401.
- Formal logout returned non-success because the session was expired; the cleanup routine still removed the repository-external authentication directory in `finally`.
- `/tmp/r25-auth.*` directory count: 0.
- Remaining R25/k6 containers: 0.
- Gitleaks 8.30.1 current candidate tree and full Git history: PASS, 0 findings.
- No Cookie, OAuth code, token, App Secret, database password or storage state was printed or committed.

## Gates stopped by the blocker

The sequential round stopped before full quality regression, remaining R24 security smoke, staging backup/restore, staging rollback/forward recovery, final interactive staging UAT and candidate-tag creation. These items are `NOT RUN`, not failures and not passes. Production remains untouched.

## Safe resumption condition

Resume only after the user provides a continuous awake execution window exceeding 2 hours 10 minutes. Obtain a fresh real OAuth session, verify its TTL covers the full run, prove no stale k6 container exists, and execute one new complete `5 VU × 2 h` profile. If runtime code or runtime configuration changes, rebuild/redeploy and rerun every affected gate, including 10 VU. Only after the 5 VU gate passes may the sequential quality, security, backup, rollback and UAT gates continue.
