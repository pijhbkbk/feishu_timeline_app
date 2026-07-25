# R26P4 Account Logout

## Scope

- Turn the V2 header avatar into an account menu instead of a temporary identity
  notification.
- Expose the signed-in user's name, department and role.
- Reuse the existing authenticated logout endpoint to destroy the server session and
  clear the browser cookie.
- Keep an explicitly logged-out user on a signed-out landing page until they choose
  “重新登录”.
- Preserve the normal `/login` behavior for every non-logout entry.

## Release

```text
branch                  codex/r26p4-account-logout
application code        507e9c227f789e0541f0b07188b2d22644eff18f
production              https://timeline.all-too-well.com
deployed at             2026-07-25
```

No seed, migration, project write, workflow write, or production data reset was
performed in this release.

## Production User Verification

Safari verification with the signed-in production administrator account:

1. Opened the avatar labelled “李”.
2. Confirmed the menu displayed the real identity, organization status, system role,
   and “退出登录”.
3. Clicked “退出登录”.
4. Confirmed the protected application session was destroyed.
5. Opened `/login?loggedOut=1` and confirmed the page showed “已退出登录” and
   “重新登录” without automatically starting another Feishu OAuth authorization.
6. Opened `/api/auth/session` and received:

```json
{
  "authenticated": false,
  "mockEnabled": false,
  "feishuEnabled": true,
  "user": null
}
```

The browser was intentionally left logged out after verification.

## Validation

```text
pnpm install --frozen-lockfile       PASS
pnpm lint                            PASS
pnpm typecheck                       PASS
pnpm test                            PASS (Web 133 / API 293)
pnpm --filter web build              PASS
pnpm --filter api build              PASS
pnpm --filter api prisma:validate    PASS
git diff --check                     PASS
production release verification     PASS
production acceptance               PASS
```

## Result

```text
R26P4_ACCOUNT_LOGOUT_DEPLOYED
SERVER_SESSION_AND_COOKIE_CLEARED
SIGNED_OUT_LANDING_CONFIRMED
PRODUCTION_USER_LOGGED_OUT
```
