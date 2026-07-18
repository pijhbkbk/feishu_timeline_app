# R25 Production Checklist

This checklist is planning evidence only. R25 does not authorize any production change.

## Approval and provenance

- [ ] Product owner explicitly approves R25B production deployment.
- [ ] R25 is `PASSED` and the combined gate report has been reviewed.
- [ ] Candidate tag is `v1.1.0-rc.1` and points to the recorded R25 release candidate commit.
- [ ] Runtime application commit is exactly `f00703ac7834837f9ad573bc11d779a5caa7c02f`.
- [ ] API and Web image IDs/digests match `R25_BUILD_PROVENANCE.md`.
- [ ] Production's current commit, services, configuration metadata and rollback point are recorded.
- [ ] Git working tree is clean and no credential or authentication artifact is tracked.

## Infrastructure and backup

- [ ] SSH access is restricted to IAP and the rollback rule remains disabled, not deleted.
- [ ] PostgreSQL and Redis listen only on approved loopback/private boundaries.
- [ ] TLS certificate, HSTS, CSP and Nginx configuration pass.
- [ ] Disk and backup destinations have sufficient free space.
- [ ] PostgreSQL backup is created with strict permissions.
- [ ] Backup SHA-256 is recorded and verified.
- [ ] `pg_restore --list` reads the backup.
- [ ] Nginx, systemd and environment-file rollback copies exist with strict permissions.

## Deployment

- [ ] `RUN_SEED=no`.
- [ ] Only `prisma migrate deploy` is used; no reset or force push.
- [ ] API/Web runtime provenance equals the approved candidate.
- [ ] PostgreSQL, Redis, API, Web and Nginx are healthy with zero unexpected restarts.
- [ ] Migration count is recorded and pending migrations equal zero.
- [ ] Static assets and `/api/health` pass, but are not treated as the only acceptance evidence.

## Bounded production smoke

- [ ] Real Feishu OAuth succeeds with the formal application.
- [ ] Workbench, projects, one authorized project and My Tasks load.
- [ ] One controlled progress update succeeds on an approved test record.
- [ ] One small legal attachment upload/download succeeds.
- [ ] Retrospective and admin audit-log reads succeed for an authorized account.
- [ ] No unexpected browser console/page/network errors appear.
- [ ] Logout succeeds; the old session is rejected and its server-side record is absent.
- [ ] Temporary auth material is destroyed and the secrets scan passes.

## Observation handoff

- [ ] Metrics and log owners acknowledge `R25_OBSERVATION_PLAN.md`.
- [ ] Rollback operator is available for the first release window.
- [ ] Stable tag and `main` merge remain blocked until 72-hour exit criteria pass.
