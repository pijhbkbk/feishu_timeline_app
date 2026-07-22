# R25B / R26 Production Acceptance

## Passive checks

- Root/application, project page and API health reachable.
- HSTS, CSP, `nosniff`, frame and referrer protections present.
- TLS certificate subject is `timeline.all-too-well.com`; expiry is
  2026-09-06 13:04:07 UTC.
- Anonymous protected API reads return 401.
- An untrusted Origin was not reflected by CORS.
- Production and Feishu platform domains were not actively scanned.

## Real Feishu OAuth and authorized business smoke

Using the user's real Feishu interaction without exporting Cookie, OAuth code,
token, App Secret or storage state:

- OAuth callback reached the production project list.
- Account menu showed `李晓晨` and `系统管理员`; backend management was
  available.
- Workbench, My Tasks, project overview and data-center/retrospective reads
  succeeded.
- Project `HPH-2026-3` / `琥珀黄新颜色开发` loaded with 李晓晨 as owner.
- A controlled 100% progress record with marker
  `PROD-SMOKE-v1.1.0-rc.2` was submitted successfully.
- Legal PNG `progress-reference.png` was uploaded and bound to the current task.
- Global audit history showed `TASK_PROGRESS_SUBMITTED`,
  `ATTACHMENT_UPLOADED` and `USER_SYSTEM_ADMIN_ASSIGNED` records for 李晓晨.
- Real logout succeeded; revisiting the protected global audit page displayed
  `请先登录` and exposed no audit rows.

The smoke used one approved existing project/task and created one attachment
plus one append-only progress record. It did not force a workflow transition,
delete data or alter production credentials.

## Decision

`PRODUCTION_ACCEPTANCE_PASS / REAL_OAUTH_PASS / ADMIN_BOUNDARY_PASS / CONTROLLED_WRITE_PASS / LOGOUT_PASS / P0-P1=0-0`
