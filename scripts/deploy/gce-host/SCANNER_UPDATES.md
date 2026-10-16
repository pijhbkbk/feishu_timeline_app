# Scanner signature update plan — not installed

Public GPT-6 Pro review selects serial updates every six hours and controlled cold activation only when the official database set changes or the running identity differs. This document is a reviewed operational design, not an implemented updater or external root authorization.

- Preserve a complete verified active set while preparing a candidate. FreshClam can partially update before failing; a nonzero exit does not prove disk contents unchanged. TestDatabases stays enabled. Compare database files and content identities, including additions/removals and CVD/CLD replacement; exclude logs and FreshClam state files.
- Verify selected official CVD/CLD with the official verifier, including its final exit status. Use daily header version and stime for expected loaded identity and age; do not use file timestamps or last successful network check. If CVD and CLD coexist, follow upstream selection semantics or reject ambiguous state. Keep inputs stable throughout validation and activation.
- Disable autonomous activation with SelfCheck 0, no NotifyClamd or reload hook, no socket activation and controlled supervisor behavior. Only the serialized external controller may activate a verified set. These settings have NOT yet been installed; current test/active configs still use SelfCheck 600.
- With changed content, stop admission, drain/cancel within a bound, confirm the old process has exited, then start the verified set. Prove a new process start identity and complete initialization with a response from that process and matching daily metadata. Loaded-signature log lines alone precede compile completion and are insufficient.
- One IDSESSION connection must carry each scan's pre-version, final INSTREAM verdict and post-version. Disconnect invalidates the entire scan. The application implementation is now in runtime commit 0e03b47b70d932b57541f8c5a8892d9071149f4c; this does not install the updater.
- If download/checking fails but the complete verified active set and process identity remain unchanged, continue only within the original daily age bound and retain the update failure. Validation/identity/loading failures keep admission closed. No retry resets stime or extends the 48-hour limit. On success without changes, recheck current identity and age without an unnecessary restart.
- Account for FreshClam TestDatabases memory separately from clamd. Their existing separate 3 GiB bounds require the dedicated 8 GiB host; avoid simultaneous verification tools or dual clamd generations. Enforce one updater, bounded runtime, cleanup of its own container, least privilege, no extra capabilities, read-only runtime and only a dedicated candidate signature area writable.

Remaining implementation prerequisites: final published immutable image, independently authorized root controller, owned timer/service and failure/activation state, exact unit tests and real update/no-change/failure/cold-activation validation. No signature-freshness or update-health claim should be based only on FreshClam exit 0 or RELOADING. Official references: https://raw.githubusercontent.com/Cisco-Talos/clamav/clamav-1.4.6/docs/man/clamd.8.in and https://docs.clamav.net/manual/Signatures.html.


## Implemented policy; host integration pending

`scanner_update_policy.py` implements the reviewed cold-activation decision policy.
`test_scanner_update_policy.py` has25 passing fake-host tests, including partial
candidate download, process exit before cleanup, retention when exit cannot be
proved, persistent per-database version floors, same-byte metadata consistency,
and signature-age boundaries after slow verification, approval and cleanup.
Independent read-only policy review passed. These tests do not perform official
signature verification, Docker/systemd control, locking or real engine activation.

The host adapter must persist version floors independently of admission approval;
`None` is valid only for a never-initialized store. Losing a previously initialized
floor must fail closed. Its root-owned state/configuration, lock, pinned image,
complete immutable database set, actual runtime identity and ingress effects still
need implementation and independent verification. No component here authorizes
its own execution as root.

The reviewed admission design uses the system-provided systemd-socket-proxyd,
limited to8 connections and loopback, forwarding to a private Unix socket. Only
the controller may open its socket unit after validation. The proxy may use socket
activation; clamd must not. Both proxy socket and service must stop and all in-flight
connections must end before stopping the old clamd. Units must have no boot or
restart path that activates clamd or opens admission without controller approval.
This design is not installed; any watchdog must share the same serialization and
cannot permit a stale updater to reopen after a failure.


## Durable state component; host integration still pending

`scanner_state.py` adds a bounded persistent state component with a separate,
pre-existing operation lock and one atomic JSON commit containing both the version
floor and approval. Revocation preserves the floor. A missing state or lock is an
error, never an invitation to initialize. Only revision0 may have no floor;
revoking that pristine state is a no-op. Any later missing floor fails closed.
Files must be private regular single-link files, opened relative to a trusted
directory FD without following symlinks. Reads reject malformed, duplicate-key,
unknown-field and oversized state. Writes handle short writes, fsync the new file,
replace it, then fsync its directory. A failure after replacement is an uncertain
commit and must not be reported as success or reverted to an older floor.

The15 tests use real temporary files and locks, including missing/corrupt state,
symlinks/hardlinks/FIFO, concurrent controllers, lock replacement, write/rename/
fsync failures, version rollback and revocation/reopen. Independent review and
Linux testing are recorded in the execution ledger. They do not simulate power
loss, run a scanner, or install a root controller.

The adapter must securely open the entire ancestor chain and enforce owner UID0;
the UID argument exists for unprivileged isolated tests and must not come from
application configuration. It must bind approval to the host boot, exact process,
pinned artifacts and immutable database directory, revalidate all proofs under
the lock before opening ingress, and close ingress on uncertain persistence.
Lock contention means another owner is active: a second invocation must not mutate
admission outside that lock. A watchdog needs coordinated cancellation of the
active updater before taking over; it cannot merely race a stale updater.

This state component trusts root and storage integrity. A revision counter does
not detect restoration of an entire previously valid disk snapshot. Disaster
recovery must compare the restored state against independently retained highest
version evidence. No external monotonic counter or snapshot rollback guarantee
is claimed. Runtime must never provision or reset the initial state automatically.

## Native-account release: reviewed host adapter and one-time initialization

The earlier policy/state-only boundary is superseded for implementation by
`scanner_host.py`, the native scanner config and systemd units, and
`scanner_initialize.py`. They must be installed as independently hash-pinned,
root-owned bytes outside a checkout. Source diff review and installer/initializer
review passed; 77 targeted tests passed. Installation and actual engine evidence
are tracked separately in the native-account execution ledger.

The fixed adapter validates the complete frozen database set, official signatures,
read-only mounts, constrained pinned image, host boot/process identity, UTC loaded
VERSION metadata and age before approval/admission. It closes 300 seconds before
the 48-hour age limit to cover periodic check and shutdown latency. Runtime checks
and updates share the existing state lock. Bounded subprocess output, explicit
FreshClam 1.4.6 error classes and cold activation prevent a failed verification
from silently retaining admission. A failed or killed check has a separate locked
closure action; a successful refresh can recover approval-before-opening crashes.

The one-time initializer is restricted to the identified scanner host, two exact
legacy container identities and the exact legacy unit hash. It stops both old
listeners, saves the unit atomically, masks its supervisor, and verifies a separate
root-owned copy of the three historical official databases. That copy establishes
only the persistent version floor: approval is null. Initialization is exclusive
and never resets a missing or existing runtime floor. Its transient operation must
have `ExecStopPost` invoking installed `scanner_initialize.py recover-legacy`; the
same recovery has a boot unit enabled before initialization. Recovery only closes
the exact old endpoints and cannot initialize or activate the new engine.

No unit automatically starts clamd. Only the serialized refresh may download,
verify, cold-start, approve and open the private Unix-socket proxy. The check and
refresh timers are enabled only after real first activation and host verification.
Missing state/lock is an error. Restoring an entire historical disk snapshot still
requires comparing the floor with independent retained evidence; no stronger
anti-snapshot-rollback property is claimed.
