# R25 Build Provenance

## Result

`PASS — exact runtime source, immutable tags, complete OCI labels, SBOM and Trivy gates verified`

## Source and builder

| Field | Value |
|---|---|
| Runtime application commit | `f00703ac7834837f9ad573bc11d779a5caa7c02f` |
| Release branch | `release/r25-final-gate` |
| Source checkout | Detached temporary Git worktree at exact runtime commit |
| Candidate version label | `v1.1.0-rc.1` |
| Node base | `mirror.gcr.io/library/node:24-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd` |
| Node runtime | `v24.18.0` |
| Source URL label | `https://github.com/pijhbkbk/feishu_timeline_app` |

Docker Hub returned HTTP 503 while resolving the same Node tag. The Google container mirror supplied the exact digest-pinned Node 24.18.0 image. The source name and digest are recorded; no mutable unrecorded base was used.

## Application images

| Component | Immutable tag | Local digest / image ID | OCI created |
|---|---|---|---|
| API | `feishu-timeline-api:r25-f00703ac7834` | `sha256:c134e7c02b6de1ce9a67322676411bdf439505e629251faeb0251f6943702f91` | `2026-07-17T05:29:28Z` |
| Web | `feishu-timeline-web:r25-f00703ac7834` | `sha256:9367d0942d3c1e91492e405d9e7fe762487b86a9b0fac28e5b47f867fc1aa064` | `2026-07-17T05:29:53Z` |

Both images contain and were inspected for all required labels:

```text
org.opencontainers.image.revision=f00703ac7834837f9ad573bc11d779a5caa7c02f
org.opencontainers.image.created=<recorded UTC time>
org.opencontainers.image.source=https://github.com/pijhbkbk/feishu_timeline_app
org.opencontainers.image.version=v1.1.0-rc.1
```

The staging PostgreSQL hardening image was also rebuilt and labeled from the same runtime source as `feishu-timeline-postgres:r25-f00703ac7834`, digest `sha256:5a87473011a32bfe237c96acc23a93d10e40b17c673b8ca73a19c7baff1b0975`.

## Source checksums

| Artifact | SHA256 |
|---|---|
| `apps/api/Dockerfile` | `17380e1e7de0255eae6ecb8f5ce56e8f3db12e9313378ff6affabac2a87cc7bf` |
| `apps/web/Dockerfile` | `642d6c029dff0462b753ee0edd2340023fbc1c4ef880072f68e67448e5d8fe39` |
| `pnpm-lock.yaml` | `c00f99042cdeaca73b0bca08fa51974b61ac6e08dd0e4feac2052c09e5bea9d6` |

## SBOM and vulnerability scan

| Artifact | Format | SHA256 |
|---|---|---|
| API SBOM | CycloneDX 1.7 | `e7ebfc13c6e373d852803429122fbdadb92b466167f28d25ef8e1365b9f42b5c` |
| Web SBOM | CycloneDX 1.7 | `ed55cd669205d467d28466375d858c88399c70f83b79114cbe13d1a927e4a1fe` |

Pinned scanner: `ghcr.io/aquasecurity/trivy:0.72.0@sha256:cffe3f5161a47a6823fbd23d985795b3ed72a4c806da4c4df16266c02accdd6f`.

| Image | Critical | High | Other reported vulnerabilities | Gate |
|---|---:|---:|---:|---|
| API candidate | 0 | 0 | 0 | PASS |
| Web candidate | 0 | 0 | 0 | PASS |

Raw redacted/non-authentication build-security artifacts are Git-ignored under `reports/security/r25/`.

## Exact staging deployment

- Deployment time: `2026-07-17T05:32:24Z`.
- `RUN_SEED=no`; no seed command ran.
- Database command: `prisma migrate deploy` only; 18 migrations found, 0 pending.
- API, Web, PostgreSQL, Redis and Nginx are healthy with restart count 0.
- Active API/Web/PostgreSQL image labels equal the frozen runtime commit.
- Production remained at commit `7dd2243270c03399cd6da6cec41bf12eab68dd0b`; it was not deployed or modified.
