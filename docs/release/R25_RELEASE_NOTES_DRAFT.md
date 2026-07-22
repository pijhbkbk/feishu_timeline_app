# R25B / R26 Release Notes

## Candidate

- Historical R25 candidate: `v1.1.0-rc.1` / runtime `4aff07c...`.
- Released candidate: `v1.1.0-rc.2`.
- Production runtime commit: `8c1d3264cb4355c5db0551309e31073adc78df8d`.
- Status: `R25B_AND_R26_PRODUCTION_RELEASED`.
- Stable tag: not created.

## Included capabilities

- End-to-end light-truck custom-color lifecycle with backend-controlled 18-step
  workflow, guarded reviews, recurring monthly checks and color exit.
- Project progress, legal material upload/versioning, risk views, lifecycle
  retrospective and append-only audit history.
- Real administrator `审计与异常` workspace with bounded database paging,
  validated filters, stable ordering, independent redacted details and stable
  automation selectors.
- Real Feishu OAuth, server-side sessions, logout invalidation, minimum
  permission boundaries and mobile layouts.
- One-click login handoff from the application directly to real Feishu OAuth;
  legacy `/login` links perform the same automatic handoff.

## R25A security and reliability closure

- Anonymous 401 and ordinary-viewer 403 for global audit list/detail.
- Recursive sensitive-field redaction and bounded responses.
- Semgrep, Gitleaks, dependency SCA, exact five-image Trivy, security headers
  and authenticated low-risk ZAP passed; blocking security findings are 0.
- Same-runtime 10 VU × 30 m and 5 VU × 2 h authenticated profiles passed with
  0 HTTP/auth/5xx/functional failure and p95 values below all thresholds.
- Full lint/typecheck/unit/build/Prisma/E2E/55-test Playwright regression passed.
- Staging backup/restore and rollback/forward recovery passed with data and
  audit loss 0.

## Production outcome

The exact R26 runtime was deployed after a fresh custom-format PostgreSQL backup
and configuration snapshot. Five services, 18 migrations, TLS/security
headers, real OAuth, authorized project/task/progress/attachment/audit paths and
logout passed. Observation and rollback thresholds remain active. Release
details are in `R25_PRODUCTION_RELEASE_MANIFEST.md` and
`R25B_PRODUCTION_ACCEPTANCE.md`.
