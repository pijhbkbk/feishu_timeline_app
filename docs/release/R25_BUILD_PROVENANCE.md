# R25 Build Provenance

## Result

`SOURCE_OCI_AND_EXACT_IMAGE_PROVENANCE_PASS`

| Field | Value |
|---|---|
| application runtime commit | `4aff07c83a6d63e3aeb3cc0b2e72033021ee74a5` |
| clean detached build source | `/tmp/feishu-r25a-4aff07c83a6d-20260719a` |
| staging tag | `r25a-4aff07c83a6d` |
| OCI created | `2026-07-18T20:43:24Z` |
| OCI source | `https://github.com/pijhbkbk/feishu_timeline_app` |
| OCI version | `r25a-4aff07c83a6d` |

| Component | Immutable image ID / digest |
|---|---|
| API | `sha256:61850ba3a0ba359590d0888788c0b1651aa5363f2c25aa61224d921279396c35` |
| Web | `sha256:55db7b29114154cb66cc3baf564768e4783b5a1f893b180511c14c640d8836cc` |
| hardened PostgreSQL | `sha256:79d00f6f20b38d93501752f3359b84849d02cc493190c17060fb9f1d925a6a88` |
| Redis | `sha256:6ab0b6e7381779332f97b8ca76193e45b0756f38d4c0dcda72dbb3c32061ab99` |
| Nginx | `sha256:ec664813a30459a8e7176315268a623f6b31abc370eeac51c7de81cd4ec4d451` |

API and Web `org.opencontainers.image.revision` labels were rechecked after
rollback/forward recovery and exactly equal the runtime commit. Staging state
also retains Git SHA, OCI and complete image IDs after the recovery-tool fix.

Deployment used `RUN_SEED=no`; all 18 migrations were applied with none
pending. Five-image Trivy reported no vulnerability at any reported severity.
Semgrep and dependency SCA passed. Production was not inspected or modified as
part of an active scan and was not deployed.
