# R25A Administrator Audit Fix Plan

## Scope

Close only `R25-ADMIN-001` by adding a read-only global administrator audit
surface. Preserve the product label `审计与异常`, the existing append-only
`audit_logs` table and all 18-step workflow rules. Do not seed staging, change
production, merge `main` or create a stable tag.

## Contract

- `GET /api/admin/audit-logs`: validated filters, database-bounded pagination
  (25 default, 100 maximum) and stable `createdAt + id` ordering.
- `GET /api/admin/audit-logs/:auditLogId`: independent lookup with recursive
  sensitive-field redaction.
- `audit.read` authorization: administrator/auditor only; anonymous 401 and
  ordinary viewer 403.
- Static `/admin/audit-logs` workspace with filters, paging, detail drawer,
  loading/empty/error/retry states and 390 px support.
- Stable `data-testid`, href, roles and ARIA names; no exact mutable Chinese
  text or positional selector dependency.

## Gate sequence

Target Playwright → local regression → runtime commit → exact staging deploy →
administrator/non-admin/management UAT → targeted security → 10 VU × 30 m →
5 VU × 2 h → full regression → backup/restore → rollback/forward → final UAT →
release/evidence commit and RC tag.

## Result

Completed on application runtime
`4aff07c83a6d63e3aeb3cc0b2e72033021ee74a5`. See
`R25A_FINAL_GATE_REPORT.md`.
