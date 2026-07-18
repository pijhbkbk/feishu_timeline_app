# R25 Production Release Plan

## Scope and freeze

- Runtime application commit: `f00703ac7834837f9ad573bc11d779a5caa7c02f`.
- Release branch: `release/r25-final-gate`.
- Candidate tag: `v1.1.0-rc.1` (must point to the final R25 evidence commit).
- Production release is **not authorized by R25**. A separate, explicit R25B approval is required.
- Deploy the already-scanned immutable API/Web images recorded in `R25_BUILD_PROVENANCE.md`; do not rebuild from a different tree.
- `RUN_SEED=no`; database change is limited to `prisma migrate deploy`.

## Required people

| Responsibility | Required owner |
|---|---|
| Go/no-go and business acceptance | Product owner |
| Release execution and rollback | Release operator |
| Database backup verification | Database operator |
| Feishu OAuth and availability | Feishu app owner |
| Security/IAP verification | Security or cloud owner |

## R25B sequence

1. Verify the R25 report, exact candidate tag, image digests and clean production baseline.
2. Record the current production commit, runtime configuration metadata and rollback point without exposing credentials.
3. Create a production PostgreSQL custom-format backup, checksum it and verify that `pg_restore --list` can read it.
4. Securely back up current Nginx, systemd and environment files; retain mode `0600` for secrets.
5. Deploy only the approved immutable candidate; run `prisma migrate deploy`; do not seed.
6. Prove runtime provenance with OCI labels, application responses, migration state and service/container identity.
7. Run the bounded production smoke listed in `R25_PRODUCTION_CHECKLIST.md` using one authorized real account.
8. Log out, verify the old session is rejected and destroy temporary authentication material.
9. Enter the 72-hour observation plan. Do not create a stable tag or merge `main` until the observation exit criteria pass.

## Immediate rollback triggers

Rollback without repeated blind redeployment if OAuth fails, a critical page returns 5xx, project data is unavailable, workflow/progress/attachment writes fail, authorization broadens unexpectedly, migration or provenance is inconsistent, services are unhealthy, or a P0/P1 or Critical/High issue appears.

## Rollback outline

1. Stop further writes and record the failure window.
2. Restore the exact pre-release application image/configuration set.
3. Reverse a database migration only if its reviewed migration-specific rollback is safe; otherwise retain the forward-compatible schema and roll back application images.
4. Verify health, login, protected reads and data counts.
5. Preserve logs and evidence; stop and request a new release decision.
