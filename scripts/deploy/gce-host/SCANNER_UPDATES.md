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
