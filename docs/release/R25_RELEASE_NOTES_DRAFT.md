# R25 Release Notes Draft

## Candidate

- Candidate tag: `v1.1.0-rc.1` after the evidence commit.
- Application runtime commit: `4aff07c83a6d63e3aeb3cc0b2e72033021ee74a5`.
- Status: `R25_PASSED / READY_FOR_PRODUCTION_APPROVAL`.
- This is not a production deployment or stable release.

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

## Deployment note

Do not deploy until the product owner explicitly approves R25B and the release
operator confirms exact image IDs, a fresh production backup, rollback window
and observation ownership. Deploy immutable artifacts only, use
`prisma migrate deploy`, and keep `RUN_SEED=no`.
