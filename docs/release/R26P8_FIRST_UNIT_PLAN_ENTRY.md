# R26P8 First-unit Production Plan Entry

Date: 2026-07-25

## Reported failures

1. The V2 completion preview for step 10 required a confirmed first-unit
   production plan but did not provide a path to create one.
2. Opening the existing first-unit production plan page caused a client-side
   application error.

## Reproduction evidence

Authenticated production browser reproduction produced:

```text
Error: useAuth must be used within AuthProvider.
route: /projects/:projectId/pilot-production
```

## Root cause

Production V2 runtime detection treated every descendant of `/projects` as a
rewritten V2 route. The first-unit production plan page is a legacy business
module outside the explicit V2 rewrites, so `RootRuntime` incorrectly omitted
the `AuthProvider` and legacy application shell.

## Changes

- Restrict formal V2 route detection to the exact routes configured in
  `next.config.ts`.
- Keep legacy business-module descendants, including
  `/projects/:projectId/pilot-production`, inside `AuthProvider`.
- Add `新建并确认首台生产计划` to:
  - the step-10 task action bar;
  - the completion preview when the domain-record check blocks completion.
- Explain the required sequence: create the plan, confirm it in the plan list,
  then return to the workspace and rerun the completion check.
- Add `返回项目工作区` to the first-unit production plan page.
- Keep the workflow decision on the backend; the new links do not advance the
  task or write business data.

## Safety

- No database model, migration or backend workflow rule changed.
- No production plan was created, edited, confirmed or completed during
  diagnosis and verification.
- V1 business APIs and audit behavior remain unchanged.

## Production verification

- Runtime commit: `ae2386c`.
- Web, API and Nginx: active.
- Authenticated first-unit production plan page:
  - client exception: fixed;
  - first-unit production plan form: visible;
  - `新建首台计划`: visible;
  - plan list and confirmation column: visible;
  - `返回项目工作区`: visible;
  - console errors: 0.
- Authenticated V2 step-10 workspace:
  - `新建并确认首台生产计划`: visible;
  - console errors: 0.
- Business writes during verification: 0.
