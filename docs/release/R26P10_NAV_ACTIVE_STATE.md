# R26P10 Navigation Active State

## Problem

When the current user had no available progress-submission task, the disabled
progress link safely pointed back to the dashboard. The navigation active-state
comparison treated the matching fallback URL as a selected page, so both
“工作台” and “进展提交” were highlighted.

## Fix

Desktop and mobile navigation now require an item to be enabled before it can
receive `is-active` or `aria-current="page"`.

The progress item remains disabled when no current task exists; this change does
not alter any task, project, or workflow data.

## Validation

```text
targeted V2 shell tests       PASS (2)
Web typecheck                 PASS
git diff --check              PASS
pnpm install                  PASS
pnpm lint                     PASS
pnpm typecheck                PASS
pnpm test                     PASS (Web 143 / API 294)
pnpm --filter web build       PASS
pnpm --filter api build       PASS
API prisma validate           PASS
```
