# R26 Production Release Verification — 2026-07-30

## Environment identity

- Environment: production
- URL: `https://timeline.all-too-well.com`
- Runtime commit: `bea6dc6f5f6a6d76bdc724d4e2c0e7792ed9fd19`
- Build time: `2026-07-30T01:40:32Z`
- Release: `r26-admin-bea6dc6f5f6a`
- Web build ID: `Qsu1hxr1F9k3dDvIqDFvd`
- API dist SHA-256: `3606f40d6149526a10136daf18d98b7b8b5f675485f74ba17ab7621e633e0be7`
- Database: production PostgreSQL database `feishu_timeline`
- Migrations: 23 applied, 0 pending
- Nginx upstreams: Web `127.0.0.1:3000`, API `127.0.0.1:3001`
- Deployment time: `2026-07-30T01:40:32Z`

Runtime identity was re-read from both `/api/health` and `/build-info` after the
authenticated browser checks. API runtime commit, Web runtime commit, local
`origin/main`, local `main`, and production server deployment commit were recorded
as the same 40-character hash above at deployment time.

## Pre-deployment recovery point

- PostgreSQL backup:
  `/var/backups/feishu-timeline-db/20260730T013223Z/feishu-timeline.dump`
- Size: 236 KiB
- SHA-256:
  `9d7f52e8abcc15c82a569f0b2fe7e8f51122ade0b53173363a546d91d7f7d392`

## OAuth callback incident and recovery

The first production callback displayed:

```text
飞书登录未完成
飞书登录状态无效，请重新发起登录。
```

The API rejected the callback before token exchange because the callback state was
missing or invalid. No OAuth state, authorization code, Cookie, token, App Secret,
or environment secret was recorded. The state validation was not weakened.

The login was then restarted from the same production browser tab. Feishu returned
a fresh UUID state, authorization completed, the application established the
`李晓晨` session, and the browser navigated to `/projects`. This demonstrates that
the deployed App ID, App Secret, Feishu China endpoints, redirect URI, session
Cookie, Redis session store, and production callback all work when the login is
started and completed in the same browser session.

## Production browser acceptance

Authenticated read and navigation checks passed for:

- `/dashboard`
- `/projects`
- `/projects/cmrzz7z3k0001br11ep76ub1f?taskId=cms02wkmk000vbr6d3qsanep7`
- `/admin`
- `/admin/manage`
- `/admin/projects`
- `/admin/tasks`
- `/admin/organization`
- `/admin/assignments`
- `/admin/permissions`
- `/admin/audit-logs`
- `/admin/color-database`

The browser clicked the production `打开项目`, `进入管理`, `角色权限`, and `编辑`
controls. The role editor opened with editable role name, per-permission controls,
change reason, and save action. No production write was submitted.

At 1440, 1024, and 390 viewport checks, every measured page had
`documentElement.scrollWidth == documentElement.clientWidth`. A fresh production
browser tab recorded zero console/page errors during the final route sweep.

Evidence is stored in:

`docs/product/evidence/R26_PRODUCTION_RELEASE_20260730/`

## Current decision

```text
CODE_IMPLEMENTED
LOCAL_VERIFIED
PRODUCTION_DEPLOYED
PRODUCTION_USER_LOGIN_VERIFIED
PRODUCTION_CORE_READ_PATHS_VERIFIED
MAIN_MERGED
AWAITING_PRODUCT_OWNER_CONFIRMATION
```

Production product acceptance remains pending until the product owner personally
completes the intended workflow and replies `PRODUCT_OWNER_ACCEPTED`.
