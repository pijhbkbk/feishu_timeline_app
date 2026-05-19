# Security Headers R19

Generated: 2026-05-19T03:39:31Z
Commit: 4ce7e8a
Base URL: http://localhost:3000

## Required Headers

| Header | Requirement |
|---|---|
| Strict-Transport-Security | Required on HTTPS production/private cloud. |
| X-Content-Type-Options | Should be `nosniff`. |
| X-Frame-Options or CSP frame-ancestors | Required. |
| Content-Security-Policy | Required or report-only with hardening plan. |
| Referrer-Policy | Required. |
| Permissions-Policy | Required. |
| Cache-Control | Sensitive pages should not be publicly cached. |
| Set-Cookie flags | HttpOnly, Secure on HTTPS, SameSite. |

## Raw Output

See `reports/security/headers/security-headers.raw.txt`.

## Triage

- Required response headers are present on the checked local production-build pages: CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, COOP, COEP, CORP and HSTS.
- Production CSP no longer contains `unsafe-eval`.
- CSP still allows inline scripts and inline styles for Next.js runtime compatibility. This is tracked as Medium hardening debt.
- `/api/health` returns 404 on the local Web server because the local test does not include the production Nginx API proxy. The API health endpoint is separately covered by API server checks and deployment scripts.
- HSTS is only effective over HTTPS; local HTTP output confirms configuration presence only.

## Current Acceptance

PASS_WITH_MEDIUM_FINDINGS. Required headers are configured, with CSP inline hardening deferred.
