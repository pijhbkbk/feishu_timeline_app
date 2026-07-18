# R25 Known Issues and Residual Observations

## Release-blocking findings

| ID | Type | Owner | Status and action |
|---|---|---|---|
| `R25-GATE-001` | Release evidence blocker | Release / Reliability | First 5 VU run failed the explicit idle-memory gate (`+60.2254%`). Diagnosis indicates a retained V8 allocation high-water rather than continuing linear growth, but the gate is not waived. |
| `R25-GATE-002` | Execution-environment blocker | Release operator | Second 5 VU run was interrupted by Mac/task sleep, did not complete 2 h, produced no summary and resumed after session expiry. Require a continuous awake window and fresh OAuth before resumption. |

These are not classified as P0/P1 product defects or Critical/High/Medium vulnerabilities. They nevertheless block R25 release closure. No open P0/P1 or Critical/High/Medium item is permitted at any future R25 closure.

## Triaged Low and Informational observations

| ID | Severity | Owner | Status and action |
|---|---|---|---|
| `R24-DAST-002` / ZAP `10044` | Low | Web / Security | Login big-redirect heuristic; no token or sensitive response field observed. Recheck due 2026-08-15. |
| ZAP `10036` | Low | Security tooling | Belonged to the ephemeral R24B scan-alias proxy, not deployed Nginx. Keep deployed version-suppression regression. |
| ZAP `10035` | Low | Security tooling | Belonged to the ephemeral R24B scan-alias proxy. Keep production HSTS regression. |
| ZAP `10024`, `10109`, `10015`, `10031` | Informational | Web / Security | URL-name, modern-app, cache and HTML-attribute heuristics; no exploitable issue demonstrated. Review with the next DAST cycle. |

## Operational constraints

- Only one real Feishu account is available for final interactive acceptance. Automated deterministic identities provide negative-role and IDOR coverage; no claim of nine real accounts is made.
- The candidate is not production-authorized. Stable tag creation and `main` merge remain blocked until R25B deployment and the 72-hour observation period pass.
