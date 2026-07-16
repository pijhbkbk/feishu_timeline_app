# R24 Remediation Tracker

| ID | Severity | Source / reproduction | Affected component | Fix or required action | Commit | Retest | Owner | Status |
|---|---|---|---|---|---|---|---|---|
| R24-SCA-001 | Critical | Baseline Trivy: mutable PostgreSQL/Redis/Nginx images contained 11 Critical and 119 High occurrences | Staging/container supply chain | Harden PostgreSQL runtime; pin clean Redis/Nginx digests; scan all five exact images before deploy | `1bd6a4e` | Final five images all severities 0 | Platform | Fixed |
| R24-AUTH-001 | High | Cross-origin unsafe browser method lacked explicit Origin rejection | API browser write boundary | Same-origin middleware rejects mismatched Origin before auth/business handling | `1bd6a4e` | attacker Origin 403; same Origin unauthenticated 401; tests PASS | API | Fixed |
| R24-UPLOAD-001 | High | Dangerous inner extensions and filename markup could reach metadata | Attachment upload | Reject markup/metacharacters, dangerous inner extensions and double extensions; sandbox responses | `1bd6a4e` | unit/transport/E2E/Playwright PASS | API | Fixed |
| R24-AUTH-002 | Medium | OAuth endpoint/callback configuration accepted broader values | OAuth config | Restrict approved HTTPS host/path and exact production callback | `1bd6a4e` | config and auth tests PASS | API | Fixed |
| R24-DAST-001 | Low | ZAP observed Nginx version disclosure | Nginx | Disable server tokens and recreate proxy | `299bf4a`, `fa0a4cd` | Final header is `Server: nginx`, no version | Platform | Fixed |
| R24-DEPLOY-001 | Medium | Bind-mounted proxy config could remain on an old running container | Staging deploy | Force API/Web/Nginx recreation for configuration releases | `fa0a4cd` | Exact final release and headers verified | Platform | Fixed |
| R24-AUTH-003 | Low | Safe OpenAPI request with empty OAuth callback body returned 500 | OAuth callback | Null-safe input validation returns controlled 401 | `d86c04e` | Direct probe 401; OpenAPI WARN/FAIL 0; 186 API tests PASS | API | Fixed |
| R24-HOST-001 | Medium | GCP default firewall permits TCP 22 from `0.0.0.0/0` | Private cloud ingress | Restrict SSH to IAP/VPN/corporate CIDR; retain key-only SSH | N/A | Pending | Cloud admin | Open, unaccepted |
| R24-FEISHU-001 | Medium | Formal app redirect list includes localhost | Feishu formal app | Separate staging app or remove localhost callback | N/A | Pending console recheck/OAuth | Feishu app owner | Open, unaccepted |
| R24-FEISHU-002 | Medium | Enabled Contact API scopes have no current code caller | Feishu permissions | Remove unused contact/department/role scopes or document a reviewed use | N/A | Pending console and OAuth recheck | Feishu app owner | Open, unaccepted |
| R24-FEISHU-003 | Gate blocker | Mobile homepage and H5 trusted domain empty | Feishu Web/H5 config | Configure approved HTTPS values and publish evidence | N/A | Pending | Feishu app owner | Open |
| R24-DAST-002 | Low | ZAP big-redirect heuristic on the login redirect | Login UX | Keep no sensitive data in redirect body; recheck in R25 | N/A | Final ZAP only Low/Info | Web/Security | Triaged; due 2026-08-15 |
| R24-EVID-001 | Gate blocker | Real session was not exported to ZAP | Authenticated DAST | Run controlled authenticated passive and approved low-risk active scan without exposing session material | N/A | Pending | Security test operator | Open |

Critical and High findings are closed. The three open Medium findings have no recorded risk acceptance, so R24 cannot be `PASS_WITH_RISK_ACCEPTANCE`.
