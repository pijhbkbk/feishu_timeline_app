# Security Headers R19B

Generated: 2026-07-10T09:21:52Z
Commit: 63f9be6
Base URL: http://127.0.0.1:3300
Result: **PASS**

## Machine-checked responses

| URL | Result | HTTP | Detail |
|---|---|---:|---|
| `http://127.0.0.1:3300/` | PASS | 307 | - |
| `http://127.0.0.1:3300/guide` | PASS | 200 | - |
| `http://127.0.0.1:3300/dashboard` | PASS | 200 | - |
| `http://127.0.0.1:3300/projects` | PASS | 200 | - |
| `http://127.0.0.1:3300/projects/timeline` | PASS | 200 | - |
| `http://127.0.0.1:3300/materials` | PASS | 200 | - |
| `http://127.0.0.1:3300/monthly-reviews` | PASS | 200 | - |
| `http://127.0.0.1:3300/analytics` | PASS | 200 | - |
| `http://127.0.0.1:3300/login/callback` | PASS | 200 | - |

## Enforced policy

- HTTP 2xx/3xx response and successful curl execution.
- `X-Content-Type-Options: nosniff`.
- Enforced CSP with an explicit `script-src` that excludes `unsafe-inline` and `unsafe-eval`; `style-src-attr unsafe-inline` remains permitted.
- `X-Frame-Options` or CSP `frame-ancestors`, plus Referrer-Policy and Permissions-Policy.
- Sensitive routes are non-publicly cacheable; cookies carry HttpOnly/SameSite and Secure on HTTPS.
- TLS certificates are verified unless `HEADER_INSECURE_TLS=yes` is explicitly set for an authorized local fixture.
- HSTS with a positive max-age on HTTPS targets.

Raw response headers: `/Users/lixiaochen/Downloads/feishu_timeline_app/reports/security/headers/security-headers.raw.txt`
