# Private Cloud Security R19

Generated: 2026-05-19T03:36:34Z
Commit: 4ce7e8a
Host: MacBook-Pro.local

## Raw Output

See `reports/security/host/host-security.raw.txt`.

## Review Checklist

- SSH root login must be disabled.
- SSH password login must be disabled.
- Only 80 / 443 / necessary SSH port should be public.
- PostgreSQL must not listen on public interfaces.
- Redis must not listen on public interfaces.
- API and Web services should run as non-root users.
- `.env.production` permissions must be `600` or stricter.
- Nginx must enable HTTPS, HSTS and baseline security headers.
- Backups and restore drills must be documented.
- Logs must not contain secrets.

## Triage

- This run was executed on the local macOS development host, not on the target company private-cloud server.
- Local PostgreSQL and Redis were observed bound to loopback through Docker Desktop during tests.
- Local development servers may listen on `3000` / `3001` during test execution; this is not accepted as a production/private-cloud exposure pattern.
- SSH, systemd, Nginx TLS, production `.env.production` permissions, backup evidence and restore-drill evidence could not be validated without the target host/IP and access method.

## Current Acceptance

BLOCKED_PRIVATE_CLOUD_EVIDENCE_PENDING. Local host evidence was collected, but private-cloud host security cannot pass until company IT provides the target server/IP and authorized access or exported host-security evidence.
