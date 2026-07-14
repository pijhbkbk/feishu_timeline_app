# Security Headers R19B

Generated: 2026-07-14T00:41:01Z
Commit: eb49f52
Base URL: http://localhost:8080
Result: **PASS**

## Machine-checked responses

| URL | Result | HTTP | Detail |
|---|---|---:|---|
| `http://localhost:8080/` | PASS | 307 | - |
| `http://localhost:8080/dashboard` | PASS | 200 | - |
| `http://localhost:8080/projects` | PASS | 200 | - |
| `http://localhost:8080/tasks` | PASS | 200 | - |
| `http://localhost:8080/materials/upload` | PASS | 200 | - |
| `http://localhost:8080/admin` | PASS | 200 | - |
| `http://localhost:8080/login/callback` | PASS | 200 | - |

## Enforced policy

- HTTP 2xx/3xx response and successful curl execution.
- `X-Content-Type-Options: nosniff`.
- Enforced CSP with an explicit `script-src` that excludes `unsafe-inline` and `unsafe-eval`; `style-src-attr unsafe-inline` remains permitted.
- `X-Frame-Options` or CSP `frame-ancestors`, plus Referrer-Policy and Permissions-Policy.
- Sensitive routes are non-publicly cacheable; cookies carry HttpOnly/SameSite and Secure on HTTPS.
- TLS certificates are verified unless `HEADER_INSECURE_TLS=yes` is explicitly set for an authorized local fixture.
- HSTS with a positive max-age on HTTPS targets.

Raw response headers: `/Users/lixiaochen/Downloads/feishu_timeline_app/reports/security/headers-r22-staging/security-headers.raw.txt`
