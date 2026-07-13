# Web Tamper Protection R19B

Generated: 2026-07-10T09:29:23Z
Commit: 63f9be6

## Build Integrity Manifest

- Manifest: `reports/security/integrity/build-integrity.sha256`

## Required Checks

- Generate hash manifest after trusted build.
- Compare manifest before and after deployment.
- Confirm Nginx static directory is read-only for non-deploy users.
- Confirm deployment directory is writable only by deploy user or CI runner.
- Confirm Nginx directory listing is off.
- Check rendered HTML and static assets for unknown scripts, iframe and external links.

## Current Acceptance

FAIL until deployment target hash comparison and static directory permission review pass.

## Integrity Recheck

Status: PASS
Manifest: `reports/security/integrity/build-integrity.sha256`
Current: `reports/security/integrity/build-integrity.current.sha256`
Diff: `reports/security/integrity/build-integrity.diff`
