# R26P3 Project Create Entry

## Scope

- Restore the real “新建项目” entry on the production V2 project list.
- Add the same primary action to the empty production dashboard.
- Add a production V2 `/projects/new` route backed by the existing project creation API.
- Keep creation permission-aligned with the existing editor: system administrators and
  project managers only.
- Return a newly created project to the V2 project workspace instead of the legacy
  overview route.

## Release

```text
branch          codex/r26p3-project-create-entry
source commit   17a96d30459051dafaca33b47f37476c33f4152a
production      https://timeline.all-too-well.com
deployed at     2026-07-25
```

No seed, migration, or project creation was performed as part of verification.

## Validation

```text
pnpm install --frozen-lockfile       PASS
pnpm lint                            PASS
pnpm typecheck                       PASS
pnpm test                            PASS (Web 131 / API 293)
pnpm --filter web build              PASS
pnpm --filter api build              PASS
pnpm --filter api prisma:validate    PASS
git diff --check                     PASS
production release verification     PASS
production acceptance               PASS
```

Safari production verification with the signed-in system administrator account:

- `/dashboard` shows “新建项目” and “打开项目列表”.
- `/projects` shows both the header “新建项目” action and empty-state
  “新建第一个项目” action.
- `/projects/new` shows the real project form, the signed-in user as default owner,
  and an enabled “创建项目” action.
- The form was not submitted.

Post-verification production data:

```text
projects=0
workflow_instances=0
workflow_tasks=0
```

## Result

```text
R26P3_PROJECT_CREATE_ENTRY_DEPLOYED
PRODUCTION_CREATE_FORM_REACHABLE
NO_PROJECT_CREATED_DURING_VERIFICATION
READY_FOR_MANUAL_FROM_SCRATCH_UAT
```
