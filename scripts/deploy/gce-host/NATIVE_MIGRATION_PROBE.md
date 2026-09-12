# Fixed restored-copy migration probe

This operation is only for the previously verified PG14 restore
`feishu_timeline_restore_c38c57da`, role `timeline_restore_c38c57da`, and immutable
candidate `f2da3629e13b2653aae8879c98992877d5ef4170`. It cannot select the original
production database, another snapshot, arbitrary commands or an arbitrary image.
No application, native account CLI, seed or background job runs during comparison.

Install independently reviewed hash-pinned `native_migration_probe.py` beside the
existing reviewed root-owned backup controller, outside a checkout. Create a new
root:root 0700 `/var/lib/timeline-native-migration-probe`. Install/enable the supplied
recovery unit; it follows PostgreSQL and the existing backup recovery, and Docker
failure cannot prevent database-role closure. The probe runs in its own systemd
oneshot with UMask0077, KillMode=control-group, start timeout600, stop timeout180,
MemoryMax512M, TasksMax64, and `ExecStopPost` invoking the installed controller's
`recover` action. Both normal operation and recovery share the existing backup
operation lock and the PG advisory role-change lock.

The fixed ops image first supplies its 37 migration checksums without networking.
Every original migration checksum must match before any DB login is enabled.
The original46 table/column projections are recorded privately; the query includes
one sentinel row and rejects more than50000 rows instead of accepting truncation.
Migration uses only the restored role (temporary connection limit3), the fixed ops
image, no host mounts, and a temporary host network connection to PG14 loopback.
This network exception is for the trusted migration process only, not the API.
Credentials stay in a root-only file and are removed during recovery.

The journal is durable before any container creation. Recovery first sets the role
NOLOGIN/limit1 and drains/verifies its connections, then cleans owned containers.
Docker failure therefore cannot leave this role open; unresolved resources keep
the recovery journal. A previous or partial probe is retained and never reset,
resolved away, or silently rerun against a mutated baseline.

Acceptance requires all original column projections—including all historical user
IDs, business relations and audit facts—and the original26 migration rows unchanged;
exactly37 completed candidate migrations; six expected empty new tables; preserved
legacy native-auth defaults; and the restricted role closed. Output contains only
counts and non-sensitive identity metadata. This is migration rehearsal evidence,
not account initialization, production cutover or product acceptance. A final
quiesced backup is still required so live writes since rehearsal are not lost.
