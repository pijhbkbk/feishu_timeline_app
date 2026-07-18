# R25 72-Hour Observation Plan

The observation window begins only after an explicitly approved R25B production deployment.

## Signals and cadence

| Signal | First hour | Hours 2-24 | Hours 24-72 | Escalation |
|---|---:|---:|---:|---|
| OAuth failures and unexpected 401/403 | every 10 min | hourly | every 4 h | Any sustained increase or user lockout |
| API/Nginx 5xx | every 10 min | hourly | every 4 h | Any critical-path 5xx or rate above baseline |
| Service restarts / uncaught errors | every 10 min | hourly | every 4 h | Any unexplained restart or unhandled exception |
| PostgreSQL connections, slow queries, deadlocks | every 15 min | hourly | every 4 h | Deadlock, saturation or new sustained slow-query pattern |
| Redis health, memory and queue depth | every 15 min | hourly | every 4 h | Unavailable Redis, unbounded queue or memory growth |
| Progress, workflow and attachment failures | every 15 min | hourly | every 4 h | Any data loss, duplicate transition or partial attachment metadata |
| Disk and host memory | hourly | every 4 h | every 8 h | Forecast exhaustion within the window |
| User feedback | continuous | continuous | continuous | P0/P1 immediately; necessary P2 triaged |

## Rollback thresholds

Rollback for confirmed P0/P1, Critical/High security exposure, OAuth outage, inaccessible or inconsistent project data, migration incompatibility, repeated critical-write failure, uncontrolled restart loop, or provenance mismatch. Stop further deployment attempts after rollback and preserve evidence.

## Exit criteria

- 72 hours completed with P0=0, P1=0, Critical=0 and High=0.
- No unresolved data-integrity, authorization, OAuth, upload or migration regression.
- Operational metrics returned to expected baselines and no unexplained restart/deadlock occurred.
- Product, release, database, Feishu and security owners sign off.

Only after these criteria pass may the team merge `main`, create/push the stable tag and publish final release notes.
