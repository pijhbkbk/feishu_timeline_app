# R24 Permission and IDOR Report

Final commit: `d86c04e8c016a0241172fb7c608f55d8dfcca5c9`

## Test identities

The single real Feishu identity, 李晓晨, verified the final staging positive path with existing `admin + viewer` roles. Negative boundaries used isolated local identities so the real account was not duplicated or its session exported. Application role codes cover project manager, process engineering, purchasing, quality, production, finance, reviewer, auditor, viewer and administrator responsibilities.

## Enumerable identifiers

| Identifier | Result | Boundary |
|---|---|---|
| `projectId` | PASS | Owner, owning department or explicit membership; otherwise 403 |
| `taskId` | PASS | Authorization derives scope from the task's owning project |
| `attachmentId` | PASS | Lookup is bound to requested `projectId` |
| `reviewId` | PASS | Lookup is bound to requested `projectId` and review authorization |
| `recurringTaskId` | PASS | Lookup requires the same `projectId` |
| `colorExitId` | PASS | Lookup requires the same `projectId` |
| `auditLogId` | PASS | Lookup requires the same `projectId` and `audit.read` |

## Minimum-permission boundaries

- Ordinary task actions: assignee or project manager; administrator is not an automatic ordinary-task operator.
- Step 12 and designated reviews: assigned reviewer or project manager.
- Step 13: finance or administrator.
- Step 18: project manager or administrator.
- Audit detail: auditor or administrator through `audit.read`.
- Viewer: read-only; no workflow transition or attachment management.
- Attachment writes: `attachment.manage`, a permitted business role, and project scope are all required.
- Anonymous access remains 401. Inactive or locked identities cannot establish a session.

Controller metadata, service authorization, cross-project lookup binding, mainline E2E and the 52-case browser suite all passed. The frontend only hides/displays actions; backend permission and state checks make the decision.

Final permission/IDOR status: `PASS`.
