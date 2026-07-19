# R25 Production Release Plan

## Scope and freeze

- Approved candidate application runtime:
  `4aff07c83a6d63e3aeb3cc0b2e72033021ee74a5`.
- Release branch: `release/r25-final-gate`.
- Candidate tag: `v1.1.0-rc.1`, pointing to the final evidence commit.
- Exact images are recorded in `R25_BUILD_PROVENANCE.md` and must not be rebuilt
  from another tree.
- R25 authorizes only entry into production approval. An explicit product-owner
  R25B decision is required before any production change.
- `RUN_SEED=no`; database change is limited to `prisma migrate deploy`.

## Required approvals

| Responsibility | Required owner |
|---|---|
| go/no-go and business acceptance | product owner |
| release execution and rollback | release operator |
| fresh production backup verification | database operator |
| Feishu OAuth availability | Feishu app owner |
| security/IAP and observation | security/cloud owner |

## R25B sequence

1. Verify the candidate tag, evidence commit, runtime commit and exact images.
2. Record the current production commit/configuration metadata and rollback point.
3. Create and checksum a production custom-format PostgreSQL backup; verify its
   catalog is readable.
4. Securely back up Nginx, service and environment configuration.
5. Deploy only the approved immutable candidate; migrate without seeding.
6. Prove OCI/runtime/migration/service identity.
7. Run the bounded production smoke in `R25_PRODUCTION_CHECKLIST.md`.
8. Log out, prove old-session rejection and destroy temporary auth material.
9. Enter the 72-hour observation plan. Keep stable tag and `main` merge blocked
   until its exit criteria pass.

Rollback immediately for OAuth failure, protected-read/write failure,
unexpected permission broadening, migration/provenance inconsistency, service
unhealth, data loss or any P0/P1/Critical/High finding.
