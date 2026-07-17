# R24B Authenticated ZAP Report

## Result

`PASS_WITH_TRIAGED_LOW_INFO / R24-EVID-001 FIXED`

- Target: isolated authorized staging alias `https://r24b-staging.local`
- Application/staging commit: `f00703ac7834837f9ad573bc11d779a5caa7c02f`
- ZAP: 2.17.0, digest-pinned container image
- Scan window: 2026-07-17 13:04:50–13:08:54 +08:00 (244 seconds)
- Authentication: real Feishu OAuth completed by the user; repository-external temporary session injection into a ZAP HTTP session
- Production and Feishu domains: explicitly excluded from attack scope

No Cookie, token, OAuth code, authorization header, App Secret, browser profile, authenticated HAR, or ZAP session is stored in this report or Git.

## Authentication and scope proof

| Control | Result |
|---|---|
| `/api/auth/session` with ZAP session | HTTP 200 |
| `/api/projects` with ZAP session | HTTP 200 |
| `/api/users/me` with ZAP session | HTTP 200 |
| `/api/tasks/my` with ZAP session | HTTP 200 |
| `/api/notifications/unread-count` with ZAP session | HTTP 200 |
| `/api/dashboard/personal-overview` with ZAP session | HTTP 200 |
| `/api/projects` without session | HTTP 401 |
| ZAP authentication statistics | Available; two keys and two non-zero counters |
| Traditional Spider | PASS; 55 URLs |
| AJAX Spider | PASS; 995 in-scope results; strict scope enabled; five out-of-scope requests blocked; stopped at the configured duration limit |
| GET-only OpenAPI | PASS; 66 operations |
| Low-strength active scan | PASS; six protected GET endpoints; 21 approved available scanners; 100 ms delay |
| Scope | Only `https://r24b-staging.local`; production, Feishu login/Open Platform, CDN and monitoring domains excluded |

The TLS alias and its proxy existed only to give ZAP a distinct same-origin HTTPS target while forwarding to local authorized staging. It was not a deployed application endpoint.

## Final counts

| Critical | High | Medium | Low | Informational |
|---:|---:|---:|---:|---:|
| 0 | 0 | 0 | 3 | 4 |

The first full authenticated run found Medium `10038` (CSP header absent) only on `/favicon.ico`. The middleware matcher excluded that path. Commit `f00703ac7834837f9ad573bc11d779a5caa7c02f` removed the exclusion and added a regression test; staging was rebuilt; a targeted passive retest reported `10038 = 0`; and this final full authenticated run reported zero Medium findings.

## Low and Informational triage

| Plugin | Severity | Triage |
|---|---|---|
| `10044` Big Redirect | Low | Existing `R24-DAST-002`. No token or sensitive field was present; retain review due 2026-08-15. |
| `10036` Server Version | Low | The ephemeral TLS alias proxy disclosed its own version. This is not the deployed staging/production proxy; the deployed endpoint's version suppression remains passed. |
| `10035` HSTS Missing | Low | The ephemeral TLS alias proxy omitted HSTS. Production HTTPS HSTS evidence remains passed. |
| `10024` Sensitive Information in URL | Info | Parameter-name heuristic on an application identifier query; no credential or authentication material. |
| `10109` Modern Web Application | Info | Classification only. |
| `10015` Cache-Control Review | Info | Review observation; no sensitive response caching exploit demonstrated. |
| `10031` User-Controllable HTML Attribute | Info | Heuristic only; no exploitable XSS demonstrated. |

## Cleanup

```text
authMaterialUsed: true
authMaterialDestroyed: true
serverSessionInvalidated: true
```

The application logout succeeded, the old server session was invalidated, the repository-external temporary directory was destroyed, no R24B container remained, and all retained raw ZAP reports are mode `600`.

Raw sanitized artifacts are under `reports/security/r24b/zap/` and are Git-ignored.
