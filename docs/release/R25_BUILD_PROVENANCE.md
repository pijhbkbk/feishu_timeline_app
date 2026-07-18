# R25 Build Provenance

## Result at round stop

`SOURCE_AND_OCI_PROVENANCE_PASS / FINAL_SECURITY_ARTIFACT_CLOSURE_NOT_RUN`

The exact final runtime source and active staging images are traceable. R25 stopped at the repeated administrator UAT blocker before the final five-image Trivy and SBOM closure, so those later security-artifact gates are not reported as passed.

## Source

| Field | Value |
|---|---|
| Runtime application commit | `6d24378168fd144e539b0e99f975b918b06e37a5` |
| Release branch | `release/r25-final-gate` |
| Candidate version label | `v1.1.0-rc.1` (label only; Git tag not created) |
| Source URL label | `https://github.com/pijhbkbk/feishu_timeline_app` |
| Build timestamp label | `2026-07-18T08:34:12Z` |

`437c0d8` contains the final progress attachment-cap fix and load cleanup hardening. `6d24378` completes the OCI revision/created/source/version plumbing used by the exact deployed images.

## Active staging artifacts

| Component | Immutable tag | Digest / image ID |
|---|---|---|
| API | `feishu-timeline-api:r25-6d2437818502` | `sha256:b117abb32e0f7c2e8133e58cc00980374b0dc4f2804cbff37e11d4af7e38b980` |
| Web | `feishu-timeline-web:r25-6d2437818502` | `sha256:298511494483dec4775d97e787cbc56ebf554df97e7998d886ff51547efe65ee` |
| hardened PostgreSQL | `feishu-timeline-postgres:r25-6d2437818502` | `sha256:5c6597c9de882a5fb279eb1316e98e708ca4f9cb32a1936b8e2316f8270a1602` |
| Redis | pinned digest | `sha256:6ab0b6e7381779332f97b8ca76193e45b0756f38d4c0dcda72dbb3c32061ab99` |
| Nginx | pinned digest | `sha256:ec664813a30459a8e7176315268a623f6b31abc370eeac51c7de81cd4ec4d451` |

API, Web and PostgreSQL were inspected with:

```text
org.opencontainers.image.revision=6d24378168fd144e539b0e99f975b918b06e37a5
org.opencontainers.image.created=2026-07-18T08:34:12Z
org.opencontainers.image.source=https://github.com/pijhbkbk/feishu_timeline_app
org.opencontainers.image.version=v1.1.0-rc.1
```

The version label is provenance metadata only. It does not assert that a release-candidate Git tag exists.

## Exact staging deployment

- Active staging tag: `r25-6d2437818502`.
- `RUN_SEED=no`; no staging seed ran.
- Database deployment: 18 migrations found, 0 pending.
- API, Web, PostgreSQL, Redis and Nginx: healthy, restart count 0 before and after both formal load profiles.
- Production remained on `7dd2243270c03399cd6da6cec41bf12eab68dd0b`, tracked tree clean.

## Pending provenance-adjacent gates

Because R25 stopped at `R25-ADMIN-001`, the final same-runtime five-image Trivy scan, final API/Web CycloneDX SBOM publication and the complete exact-final quality suite are `NOT RUN`. Historical scans from `f00703a` remain historical only and must not be attached to `6d24378` as final release evidence.
