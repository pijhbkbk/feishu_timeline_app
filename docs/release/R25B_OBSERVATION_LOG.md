# R25B / R26 Production Observation Log

## Initial observation

- Window start: 2026-07-22 16:57 CST.
- Acceptance completed: 2026-07-22 17:16 CST.
- Technical observation owner: 李晓晨j.
- Business acceptance owner: 李晓晨yw.
- Initial service state: API/Web/Nginx/PostgreSQL/Redis active; API/Web restart
  count 0.
- Initial OAuth/auth state: real production OAuth PASS; system-admin identity
  PASS; logout and old-session rejection PASS.
- Initial critical paths: workbench, projects, task, progress, attachment,
  retrospective/data center and global audit PASS.
- Initial security state: protected API anonymous 401, security headers/TLS
  PASS, no active production scan.
- Initial severity: P0 0, P1 0, Critical 0, High 0.

## Handoff

Continue the cadence in `R25_OBSERVATION_PLAN.md`. Roll back for any confirmed
P0/P1, Critical/High exposure, OAuth outage, inconsistent project data,
migration/provenance mismatch, repeated critical-write failure or restart loop.

The user's explicit instruction authorized immediate `main` integration before
the historical 72-hour criterion. Observation remains required operationally;
the override does not waive rollback thresholds and does not authorize a stable
tag.
