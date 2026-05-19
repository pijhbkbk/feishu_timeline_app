# Feishu Workbench Security R19

Generated: 2026-05-19

## Code-Level Checks

| Check | Result |
|---|---|
| App Secret not written to reports | PASS |
| OAuth `state` generated server-side | PASS |
| OAuth `state` stored server-side with 10 minute TTL | PASS |
| OAuth `state` callback validation | PASS |
| OAuth `state` one-time consumption | PASS |
| Arbitrary redirect parameter accepted by backend | PASS, no such backend parameter |
| Token stored in URL/localStorage | PASS, no code path found |
| Cookie `HttpOnly` / `SameSite=Lax` / production `Secure` | PASS |
| Logout clears session cookie and server session | PASS |

## Fixes

- Added one-time Feishu OAuth state validation in `AuthService`.
- Added `SessionStoreService.consumeJson()` so Redis-backed state consumption is atomic.
- Added `apps/api/src/modules/auth/auth.service.spec.ts` covering state creation, missing/unknown state rejection, and replay rejection.

## Feishu Admin Items Still Required

These items cannot be verified from the code repository and must be confirmed by the Feishu application administrator before workbench listing:

- Redirect URL is a fixed HTTPS domain matching the deployed callback URL.
- App permissions are minimized to the user identity data actually required.
- App availability range is restricted to target departments/test users before rollout.
- Address book scope matches business need.
- Desktop and mobile home URLs use HTTPS and the approved domain.
- Release notes, permission说明 and test account instructions are ready for Feishu review.

## Findings

| Severity | Count | Status |
|---|---:|---|
| Critical | 0 | N/A |
| High | 1 | Fixed and retested |
| Medium | 0 | N/A |
| Low | 0 | N/A |
| Info | 1 | Feishu admin evidence pending |

## Current Acceptance

PASS_CODE_LEVEL / BLOCKED_ADMIN_EVIDENCE. Code-level Feishu OAuth risks are fixed; Feishu workbench listing still requires administrator configuration evidence.
