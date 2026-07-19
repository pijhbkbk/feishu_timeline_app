# R25 Final Staging User Acceptance

## Scope

- Isolated staging: `http://localhost:8080`.
- Application runtime: `4aff07c83a6d63e3aeb3cc0b2e72033021ee74a5`.
- One real Feishu account covered positive interactive paths. Deterministic
  identities covered ordinary-viewer, anonymous and IDOR negatives; no
  nine-real-account claim is made.
- No production or Feishu-platform active scan was performed.

## Final path results

| Persona | Path | Result |
|---|---|---|
| Employee | workbench → task → progress → legal material → start/submit operation | PASS; real progress and PNG metadata persisted, operation completed and next backend-controlled operation generated |
| Project manager | project board → risk filter → stalled node → owner/blocker | PASS; 8 risk projects; explicit supplier-window blocker, owner, helper and expected resolution visible |
| Administrator | `审计与异常` → action/project filter → page 2 → detail | PASS; bounded server paging, list/detail ID, redaction, refresh/error and 390 px verified |
| Management | lifecycle retrospective → duration/stage/rework/material gap → improvement → audit | PASS; `R25A-MGMT-20260719`, responsible department, due date and workflow-rule flag persisted |

The administrator API contract returned 200 for valid list and detail reads,
401 anonymously and 403 for the deterministic ordinary viewer. pageSize 100
was accepted; 101 and other invalid inputs were rejected. Detail/UI inspection
found no cookie, authorization, session, token, App Secret or connection-string
value.

After rollback and exact forward recovery, all four paths were rechecked. The
real account then logged out; protected `/admin/audit-logs` showed `请先登录`,
proving the old session could not continue.

## Decision

`STAGING_UAT_PASS / R25-ADMIN-001_FIXED_RETEST_PASS / AUTH_MATERIAL_DESTROYED`

Screenshots and browser traces are Git-ignored under `test-results/r25a/` and
contain no saved login callback or storage state.
