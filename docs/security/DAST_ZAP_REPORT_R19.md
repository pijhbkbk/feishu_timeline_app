# DAST ZAP Report R19

Generated: 2026-05-19T03:39:31Z
Commit: 4ce7e8a
Target: http://host.docker.internal:3000

## Command Results

| Check | Status | Raw Output |
|---|---|---|
| OWASP ZAP baseline | FAIL | reports/security/zap/zap-baseline.log |

## Report Files

- reports/security/zap/zap-baseline.html
- reports/security/zap/zap-baseline.json

## Safety Notes

- Active scan is not enabled in this script.
- Remote targets require `CONFIRM_AUTHORIZED_TARGET=yes`.
- Production may only be tested with passive, baseline or smoke checks.
- Tokens, cookies and passwords must not be written into this report.

## Triage

The scan was rerun against a production build served locally. ZAP exited non-zero because baseline warnings are present, but `FAIL-NEW` is `0`.

| Finding | ZAP Risk | R19 Severity | Status |
|---|---:|---:|---|
| CSP `script-src 'unsafe-inline'` | Medium | Medium | Deferred with CSP nonce/report-only hardening plan |
| CSP `style-src 'unsafe-inline'` | Medium | Medium | Deferred with CSS/nonce hardening plan |
| Big redirect on `/` to `/dashboard` | Low | Low | Accepted; no sensitive parameters in redirect |
| Non-storable/cacheable content advisories | Info | Info | Static shell pages only; sensitive data fetched via authenticated API |
| Sec-Fetch request headers missing | Info | Info | Scanner request-side advisory, not server defect |

## Remediation Performed

- Added baseline security headers globally in Next.js.
- Disabled `X-Powered-By`.
- Removed CSP `unsafe-eval` from production responses; it remains only for non-production Next.js dev mode.

## Findings

| Severity | Count | Status |
|---|---:|---|
| Critical | 0 | N/A |
| High | 0 | N/A |
| Medium | 2 | Deferred hardening plan |
| Low | 1 | Accepted |
| Info | 3 | Accepted |

## Current Acceptance

PASS_WITH_MEDIUM_FINDINGS. No DAST Critical or High findings remain. CSP inline allowances must be tightened in a later hardening round.
