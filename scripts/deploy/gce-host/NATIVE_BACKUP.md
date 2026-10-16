# Fixed-host native account backup controller

This is a small, controlled migration tool for the existing host PG14 application.
It accepts only snapshots it produced from the fixed source database and object
directory, stored under a private root-owned directory. It is not a general SQL
sandbox and must not restore externally supplied archives. The application,
scanner, nginx and unrelated services cannot select controller arguments or paths.

Before installation, independently review the exact controller bytes and record
their SHA-256 outside the checkout. Transfer those bytes through the authorized
host management channel, verify the expected hash, and install a root-owned
non-writable copy at `/usr/local/lib/timeline-native-ops/native_backup_controller.py`.
Do not invoke the checkout as root. Existing disabled exit-78 entry points stay
disabled. The script's own pathname check is defense in depth, not a trust root.

Create `/var/lib/timeline-native-backups` with root:root mode 0700 and an exclusive
empty `operation.lock` with mode 0600. Never recreate a missing lock at runtime.
Create the dedicated system user `timeline-native-restore` with a nonzero UID/GID,
home `/nonexistent`, shell `/usr/sbin/nologin`, no supplementary groups or other
service use. Credentials remain in private files; the restore client receives
archive bytes through stdin and runs under that dedicated account.

Install the fixed recovery unit alongside the approved controller and enable it
for the next boot. Each snapshot/restore must also run in its own root-owned
systemd oneshot operation with `KillMode=control-group`, a bounded start timeout,
`UMask=0077`, and this `ExecStopPost`:

```
/usr/bin/python3 -I /usr/local/lib/timeline-native-ops/native_backup_controller.py recover-interrupted
```

Use `python3 -I` so user Python paths cannot supply privileged imports. Operations
are `snapshot`, `restore BACKUP_ID EXPECTED_MANIFEST_SHA256`, and
`recover-interrupted`. The backup ID and expected hash come from the actual
snapshot receipt. There are no arbitrary command, SQL, service or target options.

Snapshot requires the original API to be active and the original database role to
be LOGIN with no elevated/inherited privileges. It journals those exact allowed
initial conditions, stops the whole API cgroup, disables login and drains database
clients, rejects prepared transactions/subscriptions, and verifies data did not
change across the dump. It then restores the allowed initial state. Recovery does
not infer or start a previously inactive service: such a snapshot cannot begin.

The archive contains schema/data/sequence state. Additional evidence compares all
public tables including migration records, schema-only dump bytes (only random
psql restrict guards are normalized), sequence values and object inventories.
Owners/ACL are intentionally remapped to the isolated restore role and schema.
Other business schemas are rejected. Remaining space is checked on both backup
and PostgreSQL filesystems. Bounds are 64 MiB database/custom archive, 20 MiB per
object, 500 objects, 256 MiB object bytes and 1024 tree entries.

Restore creates a new `template0` database and a new role with no inherited/global
privileges, connection limit 1 and a generated password; PUBLIC loses access to
that new database/schema. An incorrect-password probe must fail on the exact
restore route before the correct password is used. Role creation and recovery
share a database advisory transaction lock, covering a client killed before its
server transaction finishes. Normal completion, failure, process termination and
boot recovery close the temporary login and terminate its remaining connections.
Pending journals are retained unless closure is verified. Failed/restored databases
and files are retained for inspection, never deleted automatically.

A successful restore receipt is a prerequisite for migration, not website
deployment or product acceptance. It never changes nginx, starts candidate code,
changes original objects, migrates the source database, or enables the restore
credentials for an application. Any later production use requires the separate
reviewed release operation and its new fixed identities. Final cutover needs a
fresh quiesced snapshot; the original database cannot receive traffic again after
new writes without an explicit reconciliation/recovery plan.
