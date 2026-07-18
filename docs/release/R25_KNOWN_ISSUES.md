# R25 Known Issues and Residual Observations

## Release-blocking finding

| ID | Severity | Owner | Status and required action |
|---|---|---|---|
| `R25-ADMIN-001` | P1 | Backend / Web / Product | `/admin/audit-logs` remains a placeholder and no authenticated global audit-list API exists. Add bounded pagination, stable filtering/sorting, independent detail lookup and admin/non-admin authorization coverage in a separate runtime-fix round, then repeat affected gates. |

## Resolved release-evidence blockers

| ID | Result |
|---|---|
| `R25-GATE-001` cold-baseline RSS high-water | Resolved for the formal gate: warmed preflight and final 2 h run met the explicit post-idle threshold; retained as a non-blocking observation. |
| `R25-GATE-002` interrupted execution window | Resolved: user supplied a continuous window and the fresh-OAuth 2 h + 5 m run completed with a valid summary. |

## Triaged Low and Informational observations

| ID | Severity | Owner | Status and action |
|---|---|---|---|
| `R24-DAST-002` / ZAP `10044` | Low | Web / Security | Login big-redirect heuristic; no token or sensitive response field observed. Recheck due 2026-08-15. |
| ZAP `10036`, `10035` | Low | Security tooling | Ephemeral R24B scan-alias proxy observations, not deployed Nginx. Retain version-suppression and HSTS regression. |
| ZAP `10024`, `10109`, `10015`, `10031` | Informational | Web / Security | Heuristics only; no exploit demonstrated. Review in the next DAST cycle. |

## Operational constraints

- Only one real Feishu account is available for interactive acceptance. Deterministic identities supplement negative-role and IDOR coverage; no nine-real-account claim is made.
- R25 is production-blocked. No candidate/stable tag or `main` merge is permitted.
