# R25 Staging Backup and Restore Rehearsal

## Scope and safety

- Target: isolated local staging PostgreSQL only.
- Runtime application commit: `6d24378168fd144e539b0e99f975b918b06e37a5`.
- Production database: not connected and not modified.
- Backup format: PostgreSQL custom archive, no owner or privileges.
- Restore target: a temporary staging database, destroyed after validation.
- Authentication values and database passwords are not recorded.

## Procedure

The rehearsal uses `scripts/testing/r25-backup-restore.sh` to:

1. create the custom-format staging archive with mode `0600`;
2. record and verify its SHA-256;
3. verify the archive catalog is readable;
4. create a uniquely named temporary database;
5. restore with `--exit-on-error --no-owner --no-privileges`;
6. compare source and restored counts for `_prisma_migrations`, `projects`, `workflow_tasks`, `attachments`, `review_records` and `audit_logs`;
7. destroy the temporary database and prove it is absent.

## Result

NOT RUN. Both endurance profiles passed on the final runtime, but the round then stopped after the administrator UAT gate failed twice. No backup I/O, production database connection or production modification occurred.

| Gate | Result |
|---|---|
| Backup created | NOT RUN |
| Checksum verified | NOT RUN |
| Archive catalog readable | NOT RUN |
| Restore completed | NOT RUN |
| Required data counts match | NOT RUN |
| Temporary database destroyed | NOT RUN; no temporary database was created |

## Production handoff

R25 does not touch production. The separate R25B operator must create and verify a fresh production backup before deployment, following `R25_PRODUCTION_CHECKLIST.md`.
