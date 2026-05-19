# Input Security R19

Generated: 2026-05-19

## Automated Coverage

| Test | Result |
|---|---|
| `apps/api/test/security/r19-api-input-security.spec.ts` | PASS |
| `apps/api/src/modules/attachments/attachments.rules.spec.ts` | PASS |
| `pnpm test` service and controller parser coverage | PASS |
| OWASP ZAP baseline on local production build | PASS_WITH_MEDIUM_FINDINGS |

## Triage

- No reflected XSS, open redirect, directory browsing, sensitive URL disclosure, server header leakage, CORS wildcard, or cookie flag issue was reported by ZAP.
- API input tests cover dangerous upload payloads, magic-byte mismatch, path traversal, and fixed-origin CORS configuration.
- Prisma access uses structured Prisma APIs; SAST found no raw SQL injection finding.
- CSRF remains handled through `SameSite=Lax` cookies plus same-origin API usage; a dedicated CSRF token can be added if future cross-site form integrations are required.

## Findings

| Severity | Count | Status |
|---|---:|---|
| Critical | 0 | N/A |
| High | 0 | N/A |
| Medium | 2 | CSP inline allowances deferred |
| Low | 1 | Redirect warning accepted |
| Info | 3 | ZAP informational advisories accepted |

## Current Acceptance

PASS_WITH_MEDIUM_FINDINGS. No Critical or High input-security finding remains.
