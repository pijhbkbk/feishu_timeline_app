# Web Tamper Protection R19

Generated: 2026-05-19T03:40:17Z
Commit: 4ce7e8a

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

PASS_LOCAL_BLOCKED_REMOTE. Local build integrity manifest generation and recheck passed. Deployment target static-directory permissions, Nginx `autoindex off`, remote hash comparison and deploy-user write permissions still require private-cloud evidence.

## Integrity Recheck

Status: PASS
Manifest: `reports/security/integrity/build-integrity.sha256`
Current: `reports/security/integrity/build-integrity.current.sha256`
Diff: `reports/security/integrity/build-integrity.diff`
