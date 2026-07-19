# R25 Staging Rollback and Forward-Recovery Rehearsal

## Scope and versions

- Staging only; persistent database and object-storage volumes were retained.
- Candidate: `4aff07c83a6d...`, tag `r25a-4aff07c83a6d`.
- Previous stable application: `6d24378168fd...`, tag `r25-6d2437818502`.
- No seed, reset, destructive migration or production operation occurred.

## Result

`ROLLBACK_PASS / FORWARD_RECOVERY_PASS / DATA_LOSS_0 / AUDIT_LOSS_0`

| Gate | Result |
|---|---|
| rollback prerequisites and immutable images | PASS |
| rollback to previous version | PASS, 25 seconds |
| five-service health and core HTTP/static smoke | PASS |
| 18-migration database compatibility | PASS |
| forward recovery to exact candidate | PASS, 25 seconds |
| API/Web OCI revision equals `4aff07c...` | PASS |
| counts and audit fingerprint | unchanged |
| data loss / audit loss | `0 / 0` |

Counts remained 11 projects, 110 workflow tasks, 4 attachments, 8 reviews, 36
monthly tasks, 1 color-exit row and 63,211 audit rows across the swap. The first
100 stable audit IDs retained fingerprint
`243f62a5f030a0f450e3d779a1636ca5071b0005510926646d5417fa6cf79475`.

The initial successful forward recovery revealed that the old swap script kept
only repository/tag fields in release state. Commit `c7e9a2a` now swaps the
complete state snapshot, retaining Git SHA, OCI metadata and image IDs. A fresh
rollback/forward cycle after the fix passed and left staging on the exact
candidate with full provenance.
