# R26P5 Idempotent Logout

## Incident

The V2 account menu displayed “退出登录失败，请检查网络后重试。” when the
browser held an expired or already invalid server session. The page then appeared
partially signed out: business reads were unauthorized while the shell and account
menu remained visible.

Production reproduction before the fix:

```text
POST /api/auth/logout without a valid session
HTTP 401 Unauthorized
```

## Root Cause

The logout controller was protected by the global session authentication guard.
The guard rejected a missing or expired session before the existing logout service
could run. This contradicted the service's intentional idempotent behavior: it can
delete a valid session when present and always clears the session cookie.

## Fix

- Mark only `POST /api/auth/logout` as a public route.
- Continue using the existing logout service; no alternative authentication path was
  introduced.
- A valid session is still removed from the server session store.
- A missing or expired session now succeeds and clears any residual cookie.
- The endpoint remains a `POST` and performs no business-data read or write.
- Add a controller regression test that verifies the public-route metadata and the
  missing-session success response.

## Validation

```text
focused auth tests                     PASS (16)
pnpm install                           PASS
pnpm lint                              PASS
pnpm typecheck                         PASS
pnpm test                              PASS (Web 133 / API 294)
pnpm --filter web build                PASS
pnpm --filter api build                PASS
pnpm --filter api prisma:validate      PASS
git diff --check                       PASS
production release verification       PASS
production acceptance                 PASS
```

Production verification after deployment:

```text
POST /api/auth/logout without a valid session
HTTP 200
{"success":true}

GET /api/auth/session
HTTP 200
authenticated=false
user=null
```

No seed, migration, project write, workflow write, or production database change was
performed.

## Result

```text
R26P5_IDEMPOTENT_LOGOUT_DEPLOYED
EXPIRED_SESSION_LOGOUT_RETURNS_SUCCESS
RESIDUAL_SESSION_COOKIE_CLEARED
NO_BUSINESS_DATA_CHANGE
```
