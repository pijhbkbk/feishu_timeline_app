# R24 Security Scope

## Baseline and authorization

| Item | Value |
|---|---|
| Branch | `security/r24-full-reaudit` |
| R23F evidence baseline | `c41553be92f7b6efddcea7104b15d9c991a7b9cc` |
| R23F application/staging baseline | `f0de3dd85fee0d69a2f33ac0f32f600b2826207c` |
| Final R24 application/staging commit | `d86c04e8c016a0241172fb7c608f55d8dfcca5c9` |
| Authorized active target | `http://localhost:8080` |
| Passive-only production target | `https://timeline.all-too-well.com` / GCE instance `instance-20260408-091840` |
| Scan window | 2026-07-16 to 2026-07-17 CST |
| Real test identity | 李晓晨; existing `admin + viewer`; no session secret was exported |
| Negative identities | Isolated local automation for application roles and unauthenticated access |

The R24 branch was created after R23F from its evidence-complete head. R24 re-scanned the current tree and did not treat R19 results as current evidence.

## Final artifacts

| Artifact | Exact identity |
|---|---|
| API image | `sha256:4c706e2248475e57849b5fa4436f54738b95ba2339cd3ca509a803ec1238eba8` |
| Web image | `sha256:011fa382b3b71d59df462230d79617a3f3e6494284c1c217ce1bd7c93fe0b7eb` |
| PostgreSQL image | `sha256:710d4e747b3001c07636e5ecb9010cf93b099f270b9a68af3ecddb3d3fa475bf` |
| Redis image | `sha256:6ab0b6e7381779332f97b8ca76193e45b0756f38d4c0dcda72dbb3c32061ab99` |
| Nginx image | `sha256:ec664813a30459a8e7176315268a623f6b31abc370eeac51c7de81cd4ec4d451` |

## Included controls

- SAST, lint, TypeScript, dependency and image SCA, SBOM, current-tree and history secret scans.
- OAuth/session, CSRF, CORS, role/permission, project scope and all requested enumerable identifiers.
- Upload transport, filename, extension/MIME/signature, authorization, version and response-header controls.
- Business rules for steps 4, 6, 9, 12, 13, 16, 17 and 18, state forgery and idempotency.
- Anonymous ZAP baseline, safe OpenAPI passive import, headers and low-risk manual HTTP probes on staging.
- Production passive headers/health/TLS and private-cloud read-only host/deployment inspection.
- Feishu developer-console read-only inspection. The platform itself was not scanned.

## Explicit exclusions and safety rules

- No production active scan, write, deployment, restart or data mutation.
- No DoS, credential brute force, destructive API scan or real-data deletion.
- No Cookie, token, OAuth code, password or App Secret was printed or persisted in R24 evidence.
- The existing real browser session was not exported to ZAP. Consequently authenticated ZAP passive capture and authenticated low-risk active scanning remain incomplete and are release-gate blockers.
- No merge to `main` and no release tag.
