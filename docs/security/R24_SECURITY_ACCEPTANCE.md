# R24 Security Acceptance

## Decision

**R24 = PASS**, reclassified by `R24B_SECURITY_GATE_CLOSURE` on 2026-07-17.

The original R24 application security fixes remain valid. R24B closed the three open Medium configuration findings, completed authenticated DAST, fixed the two application issues found during real staging OAuth/DAST, and reran the complete regression on one final commit.

## Final tested artifact

- Application commit: `f00703ac7834837f9ad573bc11d779a5caa7c02f`
- Staging commit: `f00703ac7834837f9ad573bc11d779a5caa7c02f`
- Evidence commit: the R24B closure commit containing this document
- Authorized staging: local `http://localhost:8080`, exposed to ZAP only through isolated `https://r24b-staging.local`
- Production: no active scan or application deployment in this closure round

## Final authenticated scan findings

| Critical | High | Medium | Low | Informational |
|---:|---:|---:|---:|---:|
| 0 | 0 | 0 | 3 | 4 |

The three authoritative R24 Medium findings are all **Fixed**:

1. `R24-HOST-001` — global SSH exposure closed; IAP-only replacement verified.
2. `R24-FEISHU-001` — formal localhost callback removed; exact production HTTPS callback and real OAuth retested.
3. `R24-FEISHU-002` — unused Contact/API permissions removed; Contact data range N/A and OAuth retested.

No Medium was accepted by waiver.

## Gate decision matrix

| Gate | Result |
|---|---|
| Critical = 0 / High = 0 / Medium = 0 | PASS |
| SAST, dependency/filesystem/image SCA, SBOM, secrets | PASS |
| OAuth/session/logout/CSRF/Origin/CORS | PASS |
| Permissions and IDOR | PASS |
| Upload security | PASS |
| Business logic and R23 stability smoke | PASS |
| Web / API tests | PASS; Web 79/79, API 187/187 |
| Mainline E2E / Playwright | PASS; E2E PASS, Playwright 52/52 |
| lint / typecheck / Web build / API build / Prisma validate | PASS |
| Authenticated ZAP | PASS_WITH_TRIAGED_LOW_INFO; six protected 200s, unauthenticated 401, auth statistics present, strict target-only scope |
| Private-cloud SSH | PASS; `default-allow-ssh` disabled, `allow-iap-ssh` restricted to IAP |
| Feishu formal application | PASS; redirect, permissions, availability, homepage, H5 and publication controls closed |
| Credential incident | PASS; rotated, protected production update/restart and real post-rotation OAuth/session/logout verified |
| Authentication material cleanup | PASS; logout, server invalidation and destruction verified; Gitleaks current/history zero findings |

## Release decision

`R24_PASS / R25_JOINT_RELEASE_GATE_ALLOWED_BUT_NOT_STARTED / NO_MAIN_MERGE / NO_TAG / STOP`

R25 remains a separate user-confirmed round. See `docs/security/R24B_SECURITY_ACCEPTANCE.md` and `docs/security/R24B_AUTHENTICATED_ZAP_REPORT.md` for closure evidence.
