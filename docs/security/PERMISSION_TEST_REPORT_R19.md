# Permission Test Report R19

Generated: 2026-05-19

## Automated Coverage

| Test | Result |
|---|---|
| `apps/api/test/security/r19-permission-security.spec.ts` | PASS |
| `apps/api/src/modules/auth/project-access.service.spec.ts` | PASS |
| `apps/api/src/modules/auth/permissions.guard.spec.ts` | PASS |
| `pnpm test:e2e` permission boundary: finance cannot create project | PASS |
| `pnpm playwright:test` authenticated UI regression | PASS |

## Findings

| Severity | Count | Status |
|---|---:|---|
| Critical | 0 | N/A |
| High | 0 | N/A |
| Medium | 0 | N/A |
| Low | 0 | N/A |
| Info | 0 | N/A |

## Notes

- Project IDOR is guarded by `ProjectAccessService`: non-admin users must own, belong to the owning department, or be project members.
- Fee endpoints remain restricted to `admin`, `project_manager`, and `finance`.
- Color exit finalization remains restricted to `admin`, `project_manager`, and `process_engineer` with `workflow.transition`.
- Attachment mutation endpoints require `attachment.manage`.

## Current Acceptance

PASS. No permission bypass was found in automated local tests.
