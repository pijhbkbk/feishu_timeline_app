# R25 Final Staging User Acceptance

## Scope

- Environment: isolated staging through `http://localhost:8080`.
- Runtime application commit: `6d24378168fd144e539b0e99f975b918b06e37a5`.
- Authentication: one fresh real Feishu OAuth account; deterministic automated identities remain the only negative-role supplement. No nine-real-account claim is made.
- Test data: controlled `R25-UAT-` project only for writes; archived R23 test projects were read-only.
- Screenshots: Git-ignored `test-results/r25/uat/`; no credential-bearing login/callback/storage view is retained.

## Results

| Persona path | Evidence | Target | Result |
|---|---|---:|---|
| Employee | workbench → my tasks → progress → legal PDF → complete operation | task ≤10 s; progress ≤60 s | PASS; `1.102 s` and `58.770 s`; first operation completed and second generated |
| Project manager | project board → risk filter → stalled project → stalled operation | risk ≤5 s; operation ≤2 clicks | PASS; `1.405 s`, 2 clicks; owner/blocker/expected resolution present |
| Administrator | admin → audit logs → query key operation | bounded list/filter/detail | **FAIL / P1**; route is a placeholder and global list API is absent |
| Management | lifecycle retrospective → delay/rework/material gaps/improvements | readable and persistent | NOT RUN; sequential stop after repeated administrator-gate failure |

## Employee evidence

- The real user found the assigned controlled task in 1.102 seconds.
- A progress update and next action were submitted with no blocker.
- Repository-approved `定制颜色开发流程图.pdf` (158,683 bytes) was uploaded through the normal UI and attached to the task.
- End-to-end progress submission completed in 58.770 seconds.
- The current operation was started and submitted through standard backend-controlled actions; status became complete and the next operation was generated.
- Evidence: `01-employee-task-found.png` through `04-task-completed.png`.

## Project-manager evidence

- The risk filter returned the expected risk project in 1.405 seconds.
- The archived read-only project `R23-UAT-逾期停滞-赤霞红` showed the explicit supplier-window blocker, owner, helper and expected resolution date.
- The stalled operation was reached in two clicks and displayed owner and overdue facts.
- Evidence: `05-risk-identified.png`, `06-stalled-node-detail.png` plus the accessibility operation record.

## Administrator blocker

Two independent attempts established the same failure:

1. Fresh real OAuth Chrome did not expose a usable audit query/list/detail UI at `/admin/audit-logs`.
2. Authenticated read-only verification returned admin overview 200, global audit-list API 404, and confirmed the page is a placeholder with no bounded-list markup.

The repository confirms `apps/web/src/app/admin/[section]/page.tsx` renders `PagePlaceholder`, while `AdminController` only defines `GET /api/admin/overview`. Project-scoped activity logs do not satisfy this administrator gate.

## Decision

`STAGING_UAT_FAIL / R25-ADMIN-001 P1 / PRODUCTION_NOT_AUTHORIZED`

The employee and project-manager paths pass, but UAT is indivisible. Management UAT and all later release closure stop; no candidate tag is created.
