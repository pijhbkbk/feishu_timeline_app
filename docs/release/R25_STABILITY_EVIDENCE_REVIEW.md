# R25 Stability Evidence Review

## Decision

`R23_FORMALLY_PASSED / HISTORICAL_ENDURANCE_NOT_REUSED / R25_FINAL_RUNTIME_LOAD_PASS`

R23 was formally marked `PASSED` at application/staging commit `d6d4962f88dbb5b297d54c9f27326f3bf5616ec7`. That commit is an ancestor of the final R25 runtime, but R24 and R25 changed authentication, permissions, upload behavior, Nginx/runtime boundaries and progress attachment handling. The historical R23 endurance was therefore not used as final evidence.

## Exact revisions

| Field | Value |
|---|---|
| R23 endurance application/staging commit | `d6d4962f88dbb5b297d54c9f27326f3bf5616ec7` |
| R24B final security runtime | `f00703ac7834837f9ad573bc11d779a5caa7c02f` |
| R25 progress/load cleanup fix | `437c0d881efa...` |
| R25 final runtime/staging commit | `6d24378168fd144e539b0e99f975b918b06e37a5` |
| Release branch | `release/r25-final-gate` |

## Why rerun was mandatory

The ancestry from R23 to R25 includes OAuth/identity reconciliation, session/permission behavior, Origin/CSRF handling, upload validation, Nginx/security-header changes, database role migration, runtime image hardening and audit permission changes. R25 additionally fixed a real long-history progress submission issue by capping submitted attachment IDs to the newest 20 while preserving history. These areas affect authenticated endurance and core business writes.

## Formal same-runtime R25 results

| Profile | Run | Result | Checks | Read/write p95 | Error/auth/5xx/functional | Idle memory |
|---|---|---|---:|---:|---:|---:|
| 10 VU × 30 m | `R25-10VU30M-6D24378-20260718T083625Z` | PASS | 17,424/17,424 | 106.338/58.429 ms | 0/0/0/0 | -8.255% |
| 5 VU × 2 h + 5 m idle | `R25-5VU2H-RETRY-6D24378-20260718T112109Z` | PASS | 34,832/34,832 | 119.742/44.276 ms | 0/0/0/0 | -0.602% |

The two-hour run completed 34,830 iterations, 29,650 reads, 3,409 draft writes and 1,771 progress writes. Database connections peaked at 18; slow queries, deadlocks, Redis queue depth, restarts, duplicate active workflow groups, uncaught/unhandled errors and API/Nginx 5xx were all 0. Exact controlled-write counts matched the final run evidence.

The earlier cold-baseline RSS high-water result is retained as a non-blocking observation. A warmed preflight and the formal warmed run both demonstrated stable post-idle memory within the explicit `<20%` threshold.

## Release implication

The stability gate itself is passed on exact final runtime `6d24378`. R25 still cannot pass because final administrator UAT failed independently; see `R25_BLOCKER_REPORT.md`.
