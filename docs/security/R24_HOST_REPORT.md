# R24 Host and Deployment Security Report

## Scope

The private-cloud and production checks were read-only. No production deployment, restart, write, active scan or data mutation was performed.

## Private cloud

| Control | Result |
|---|---|
| SSH password authentication | PASS; disabled |
| SSH root login | PASS; disabled |
| SSH public-key authentication | PASS; enabled |
| GCP ingress | FINDING; TCP 22 remains allowed from `0.0.0.0/0` by a default rule |
| API/Web service user | PASS; non-root application owner |
| systemd hardening | PASS baseline; `NoNewPrivileges=yes`, `PrivateTmp=yes`, `ProtectSystem=full` |
| Environment files | PASS; mode `0600` |
| PostgreSQL | PASS; listens on localhost, TLS on |
| Redis | PASS; loopback bind and protected mode |
| Nginx | PASS; only 80/443 public, TLS 1.2/1.3, HSTS, version token suppressed |
| Application ports | PASS; API 3001 and Web 3000 listen on loopback |
| Log keyword sample | PASS; no access/refresh token, App Secret or Bearer keyword hit in sampled application journals |
| Static assets | PASS; 75 hashed assets observed |
| Rollback assets | PASS; rollback files/scripts present |
| Database backup | PASS; 2026-07-14 dump checksum verified |
| Restore evidence | PASS; historical restore drill report present and readable |

The global SSH rule is `R24-HOST-001`, Medium, open and not risk-accepted. Public RDP/agent ports had no corresponding application listener; only SSH/HTTP/HTTPS were reachable application concerns in this review.

## Production passive verification

- Health returned 200 with the expected API service identity.
- Nine representative routes passed the security-header gate.
- TLS certificate for the production hostname was valid during the scan window; Nginx advertises no version.
- HSTS, `nosniff`, frame protection, Referrer-Policy and Permissions-Policy were present.
- The Web CSP uses per-request nonce values, `strict-dynamic`, `script-src-attr 'none'`, and excludes script `unsafe-inline`/`unsafe-eval`.

## Remote tamper evidence

- Remote tracked commit: `7dd2243270c03399cd6da6cec41bf12eab68dd0b`, the recorded R23 starting production baseline.
- Tracked dirty count: 0.
- API and Web systemd commands resolve into the same clean checkout.
- API entrypoint, Web build manifest and Next build ID were hashed/recorded without exposing configuration values.
- Production remaining on its prior approved version is expected because R24 explicitly forbids production deployment; it is not evidence that R24 was deployed.

Private-cloud evidence is complete and remote tamper check passes, but host acceptance remains `PASS_WITH_OPEN_MEDIUM` until `R24-HOST-001` is remediated or formally accepted.
