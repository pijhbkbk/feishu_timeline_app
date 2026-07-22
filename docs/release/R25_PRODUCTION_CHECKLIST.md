# R25 Production Checklist

This checklist records the completed R25B/R26 production release. The later
user authorization superseded the original planning-only state.

## Approval and provenance

- [x] Product owner explicitly approves R25B production deployment.
- [x] R25 is `PASSED` and the combined gate report has been reviewed.
- [x] Superseding candidate `v1.1.0-rc.2` points to exact R26 runtime `8c1d326...`.
- [x] Production runtime identity and local tested runtime are exact.
- [x] Production's current commit, services, configuration metadata and rollback point are recorded.
- [x] Git working tree is clean and no credential or authentication artifact is tracked.

## Infrastructure and backup

- [x] SSH access is restricted to IAP and the rollback rule remains disabled, not deleted.
- [x] PostgreSQL and Redis listen only on approved loopback/private boundaries.
- [x] TLS certificate, HSTS, CSP and Nginx configuration pass.
- [x] Disk and backup destinations have sufficient free space.
- [x] PostgreSQL backup is created with strict permissions.
- [x] Backup SHA-256 is recorded and verified.
- [x] `pg_restore --list` reads the backup.
- [x] Nginx, systemd and environment-file rollback copies exist with strict permissions.

## Deployment

- [x] `RUN_SEED=no`.
- [x] Only `prisma migrate deploy` is used; no reset or force push.
- [x] API/Web runtime provenance equals the approved candidate.
- [x] PostgreSQL, Redis, API, Web and Nginx are healthy with zero unexpected restarts.
- [x] Migration count is recorded and pending migrations equal zero.
- [x] Static assets and `/api/health` pass, but are not treated as the only acceptance evidence.

## Bounded production smoke

- [x] Real Feishu OAuth succeeds with the formal application.
- [x] Workbench, projects, one authorized project and My Tasks load.
- [x] One controlled progress update succeeds on an approved test record.
- [x] One small legal attachment upload succeeds and is bound to the task.
- [x] Retrospective and admin audit-log reads succeed for an authorized account.
- [x] No blocking browser/page/network error appears.
- [x] Logout succeeds and the old browser session is rejected.
- [x] No auth material is exported; current/history secrets scans pass.

## Observation handoff

- [x] Observation and rollback owners are recorded in the manifest.
- [x] Rollback artifacts and decision owner are available.
- [x] User explicitly authorized immediate `main` integration, overriding the
  historical 72-hour merge hold. Stable tag remains blocked.

`R25B_PRODUCTION_RELEASED / R26_RC2_ACCEPTANCE_PASS / OBSERVATION_ACTIVE`.
