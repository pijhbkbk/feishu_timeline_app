# R24B Risk Closure

## Final baseline

- Application commit: `f00703ac7834837f9ad573bc11d779a5caa7c02f`
- Staging commit: `f00703ac7834837f9ad573bc11d779a5caa7c02f`
- Branch: `security/r24-full-reaudit`
- Validation date: 2026-07-17
- R24B decision: `PASS`
- Final authenticated ZAP: Critical 0, High 0, Medium 0, Low 3, Informational 4

The R24 tracker is authoritative. The three original Medium findings were remediated and retested; none was risk-accepted.

## Closed Medium findings

| Risk ID | Description | Severity / source | Owner and required change | Final status / evidence |
|---|---|---|---|---|
| `R24-HOST-001` | GCP allowed TCP 22 from `0.0.0.0/0`. | Medium; GCP firewall/host audit | Cloud admin; administrator configuration, no application code | **Fixed / retest pass.** `allow-iap-ssh` permits only `35.235.240.0/20` to tagged instances; two pre-disable and one post-disable IAP SSH checks passed; `default-allow-ssh` is disabled; a non-IAP SSH protocol connection did not reach the VM. |
| `R24-FEISHU-001` | The formal application retained a localhost OAuth callback. | Medium; Feishu console and R24 evidence | Feishu app owner; administrator configuration, no application code | **Fixed / retest pass.** The formal application retains only `https://timeline.all-too-well.com/login/callback`; real production OAuth, protected project access, logout, and post-logout denial passed after credential rotation. |
| `R24-FEISHU-002` | Unused Contact API permissions exceeded demonstrated repository use. | Medium; Feishu permission/repository-use comparison | Feishu app owner; administrator configuration, no application code | **Fixed / retest pass.** All Contact and other unused permissions were removed and published; no Contact permission remains, so the Contact data range is N/A; real OAuth and application smoke passed. |

## Closed gate blockers

| Risk ID | Source / owner | Required remediation | Final status / evidence |
|---|---|---|---|
| `R24-FEISHU-003` | Feishu Web/H5 console; Feishu app owner | Configure and publish the supported mobile/H5 and availability controls | **Fixed / retest pass.** Partial-member availability was confirmed; desktop and mobile homepages use the production HTTPS origin; the H5 trusted domain is configured; the formal configuration is published. |
| `R24-EVID-001` | R24 DAST evidence; security test operator | Complete real authenticated staging-only DAST without retaining session material | **Fixed / retest pass.** Six protected endpoints returned HTTP 200, the project endpoint without a session returned HTTP 401, authentication statistics were non-zero, scope was strict, and Spider/AJAX/OpenAPI/low-strength active coverage passed. The server session was invalidated and all temporary authentication material was destroyed. |
| `R24-CRED-001` | R24B execution incident; Feishu app owner/production operator | Rotate the exposed formal credential and repeat post-rotation production smoke | **Fixed / retest pass.** The formal credential was rotated through a one-time hidden handoff, production was updated and restarted under explicit authority, and real production OAuth/session/logout passed. Staging uses separate test-version credentials. No credential value is retained in evidence. |

## Remaining non-blocking observations

| Finding | Severity | Final triage |
|---|---|---|
| ZAP `10044` big redirect | Low | Existing `R24-DAST-002`; no secret or token was present. Retain the 2026-08-15 review date. |
| ZAP `10036` server version | Low | Generated only by the ephemeral TLS alias proxy used to isolate the ZAP target. It is not the deployed staging or production Nginx endpoint; the deployed endpoint's version-disclosure remediation remains passed. |
| ZAP `10035` HSTS not set | Low | Generated only by the ephemeral TLS alias proxy. The production HTTPS endpoint's HSTS evidence remains passed. |
| ZAP `10024`, `10109`, `10015`, `10031` | Informational | URL-name heuristic, modern-app classification, cache-control review, and user-controllable HTML attribute heuristic. No exploitable XSS, credential disclosure, or gate-blocking condition was demonstrated. |

There are no open Critical, High, or Medium findings. The Low/Informational items are documented observations and do not require risk acceptance under the R24B gate.
