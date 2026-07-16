# R24 Security Acceptance

## Decision

**R24 = FAIL** for release-gate purposes.

This is not a Critical/High application-code failure. All discovered Critical and High findings were fixed and retested, but R24's explicit evidence/configuration gates are not satisfied.

## Final tested artifact

- Commit: `d86c04e8c016a0241172fb7c608f55d8dfcca5c9`
- Staging: `http://localhost:8080`
- Five services: healthy; restart count 0 during final verification
- Prisma: 18 migrations; 0 pending

## Consolidated current findings

| Critical | High | Medium | Low | Info |
|---:|---:|---:|---:|---:|
| 0 | 0 | 3 | 1 | 11 |

The three open Medium findings are:

1. GCP SSH ingress permits `0.0.0.0/0:22`.
2. The formal Feishu application retains a localhost redirect URI.
3. Feishu Contact API permissions exceed the current repository's demonstrated use.

The Low is the ZAP big-redirect heuristic. The Info number is the de-duplicated set of passive ZAP baseline/OpenAPI informational classes; evidence/configuration blockers are listed separately and are not converted into vulnerability severity.

## Gate decision matrix

| Gate | Result |
|---|---|
| Critical = 0 | PASS |
| High = 0 | PASS |
| SAST, dependency SCA, filesystem SCA, five-image scan, SBOM, secrets | PASS |
| OAuth/session/CSRF/CORS code and automated current-release tests | PASS |
| Permissions and all requested IDOR identifiers | PASS |
| Upload security | PASS |
| Business logic security | PASS |
| Unit/integration, mainline E2E and Playwright | PASS; Web 78/78, API 186/186, E2E PASS, Playwright 52/52 |
| Anonymous ZAP baseline and safe OpenAPI scan | PASS_WITH_TRIAGED_LOW_INFO |
| Authenticated ZAP passive and approved low-risk active scan | FAIL; not completed |
| Private-cloud evidence | COMPLETE; PASS_WITH_OPEN_MEDIUM |
| Remote tamper check | PASS; tracked production tree clean at recorded prior production baseline |
| CSP nonce/hash hardening | PASS |
| Feishu admin evidence | EVIDENCE_COMPLETE / CONFIGURATION_FAIL |
| Medium risk acceptance | FAIL; no owner acceptance recorded for the three open Medium findings |

## Blocking conditions

- `R24-EVID-001`: authenticated ZAP passive/low-risk active evidence is absent.
- `R24-FEISHU-001`: formal-app localhost redirect remains.
- `R24-FEISHU-002`: unused Feishu Contact permissions remain.
- `R24-FEISHU-003`: mobile homepage and H5 trusted-domain evidence/configuration are incomplete.
- `R24-HOST-001`: global SSH ingress remains open and unaccepted.

## Release decision

`R24_FAIL / NO_JOINT_RELEASE_GATE / NO_PRODUCTION_DEPLOY / STOP`

R24 must be rerun only for the blocked items and their affected regression after the Feishu owner and cloud administrator make or formally accept the required changes and a safe authenticated DAST injection path exists. No production deployment, main merge or release tag was performed.
