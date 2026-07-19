# R25 Staging Backup and Restore Rehearsal

## Scope and safety

- Isolated staging PostgreSQL only; production was not connected or modified.
- Application runtime: `4aff07c83a6d63e3aeb3cc0b2e72033021ee74a5`.
- Custom archive, no owner/privileges; mode 0600 in a repository-external
  temporary directory.
- Temporary restore database was uniquely named and destroyed after validation.

## Result

`BACKUP_PASS / CHECKSUM_PASS / RESTORE_PASS / COUNTS_MATCH / AUDIT_RETAINED`

| Check | Source | Restored | Result |
|---|---:|---:|---|
| migrations | 18 | 18 | PASS |
| projects | 11 | 11 | PASS |
| workflow tasks | 110 | 110 | PASS |
| attachment metadata | 4 | 4 | PASS |
| review records | 8 | 8 | PASS |
| recurring/monthly tasks | 36 | 36 | PASS |
| color-exit records | 1 | 1 | PASS |
| audit logs | 63,211 | 63,211 | PASS |

- Archive bytes: `4,830,319`.
- SHA-256: `da22a64ce3b0636e5bd5c14428e60418dc00c91f0fc2c6af066c2af1473ad15c`.
- `pg_restore --list`: PASS.
- First 50 audit IDs in stable `createdAt DESC, id DESC` order: count 50,
  unique 50 and source/restore hash equal.
- Temporary restore database absence after cleanup: PASS.

The first rehearsal attempt exposed a tooling issue: containerized
`pg_restore --list` was not attached to stdin. The backup itself was valid and
no restore database had been created. Commit `c7e9a2a` adds `docker exec -i`;
the complete fixed rehearsal above passed. The raw database archive is not
tracked or included in the evidence commit.
