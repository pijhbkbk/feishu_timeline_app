# R25 Stability Evidence Review

## Decision

`HISTORICAL_ENDURANCE_NOT_REUSED / FINAL_RUNTIME_10VU_PASS / FINAL_RUNTIME_5VU_PASS`

All formal release evidence below was rerun on application runtime
`4aff07c83a6d63e3aeb3cc0b2e72033021ee74a5`. Results from earlier R23/R25
runtimes remain historical only.

| Profile | Run | Checks | Read p95 | Write p95 | Audit list/detail p95 | Result |
|---|---|---:|---:|---:|---:|---|
| 10 VU × 30 m | `R25A-10VU-4aff07c-20260719` | 17,189/17,189 | 142.933 ms | 48.355 ms | 184.769/24.440 ms | PASS |
| 5 VU × 2 h + 5 m idle | `R25A-5VU-4aff07c-20260719` | 34,351/34,351 | 144.526 ms | 39.108 ms | 180.243/20.970 ms | PASS |

The two-hour run completed exactly two hours and 34,348 iterations. It included
4,524 audit-list reads, 639 audit-detail reads, 3,496 draft writes and 1,750
progress writes. HTTP failure rate, unexpected 401/403, 5xx and functional
failures were 0.

Resource and integrity observations:

- API/Web memory growth after five-minute idle recovery: `+7.8548%` (`<20%`).
- Peak database connections: 18; slow queries and deadlocks: 0.
- Redis queue depth: 0; service restarts: 0.
- API/Nginx 5xx, uncaught exceptions and unhandled rejections: 0.
- Duplicate active workflow groups and lost/duplicate controlled writes: 0.

The 30-minute cold-baseline recovery percentage was not used as the explicit
two-hour memory threshold; its time series plateaued. The warmed two-hour
profile satisfied the required recovery gate.

Raw summaries are Git-ignored under
`test-results/r25-final/{10vu-30m,5vu-2h}/R25A-*`. The ephemeral authenticated
proxy was terminated and no authentication value was exported.
