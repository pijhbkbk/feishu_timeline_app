# R24 DAST Report

Final commit/staging release: `d86c04e8c016a0241172fb7c608f55d8dfcca5c9`

## Staging scans

| Check | Result |
|---|---|
| ZAP baseline, final exact release | `PASS_WITH_TRIAGED_LOW_INFO`: Critical 0, High 0, Medium 0, Low 1, Info 8 |
| Safe OpenAPI/API import | 165 URLs imported; FAIL 0, WARN 0, 121 passive rules passed |
| Security headers | 9 representative routes PASS |
| Cross-origin unsafe POST | 403 |
| Same-origin unauthenticated POST | 401 |
| Reflected-XSS / directory-listing indicators | No blocking ZAP finding |
| Server/version disclosure | Fixed; final response is `Server: nginx` without a version and no `X-Powered-By` |

The remaining ZAP Low is `Big Redirect Detected` on the login redirect. No token or sensitive field is present in the redirect response; it is tracked as `R24-DAST-002` for R25 review. The eight Info classes are browser/header/cache heuristics rather than release-blocking vulnerabilities.

## OpenAPI defect and retest

The first safe API import found one empty-body request to `POST /api/auth/feishu/callback` returning 500, plus two derivative Low disclosure alerts for the generic error response. `d86c04e8` made callback parsing null-safe. Final proof:

- direct empty-body request returns controlled 401;
- no authorization-code exchange occurs;
- final OpenAPI scan has FAIL 0 and WARN 0;
- final API unit suite is 186/186.

## Authenticated coverage

The existing real Feishu session successfully loaded the final `/projects` and `/admin` pages. The final view showed the authenticated 李晓晨 account, 9 active projects, 9 users, 7 departments, 9 enabled roles and current audit records. Mock login remained disabled on staging.

This browser session was not exported, printed or persisted, and the in-app browser was not routed through ZAP. Therefore:

- real authenticated browser smoke: `PASS`;
- ZAP authenticated passive capture: `NOT RUN`;
- approved authenticated low-risk active scan: `NOT RUN`;
- authenticated DAST gate: `INCOMPLETE`.

The scan was intentionally stopped rather than copying the only real user's Cookie into a report, command line or storage state. A controlled ephemeral test identity/session injection path is required to close `R24-EVID-001`.

## CSP and production safety

Staging and production passive header checks both pass a nonce-based CSP. `script-src` uses a per-request nonce plus `strict-dynamic`, rejects script attributes, and contains neither script `unsafe-inline` nor `unsafe-eval`. Production received headers/health/TLS checks only; no production active scan was run.

Evidence is under:

- `reports/security/r24/zap-final-d86c04e8/`
- `reports/security/r24/zap-openapi-final-d86c04e8/`
- `reports/security/r24/headers-final-d86c04e8/`
- `reports/security/r24/runtime-final-d86c04e8/`
- `reports/security/r24/host/production-headers/`

Final DAST result: `ANONYMOUS_AND_OPENAPI_PASS / AUTHENTICATED_DAST_INCOMPLETE`.
