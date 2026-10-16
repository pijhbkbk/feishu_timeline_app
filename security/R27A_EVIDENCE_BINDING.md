# R27A Exact-Commit Evidence Binding

Generated: 2026-08-11 (Asia/Shanghai)

This manifest binds the R27A local security evidence to one immutable source
commit and three exact local Linux ARM64 image IDs. It is a reproducibility and
scope record, not a production deployment record, legal approval, formal
Semgrep result, staging acceptance, or final R27 security clearance.

## Source identity

| Field | Value |
|---|---|
| Branch | `security/r27-final-source-clearance` |
| R27 governance baseline | `41b4b166c587692e6f0fb9536dca2e1aab646c70` |
| Recorded R26 production runtime | `535041bb25f21d548d863d07b35e3e952b0aeb2c` |
| Previous R27 evidence commit | `16c1a9d0844f0a648866462544d91e7926760f97` |
| R27A source commit | `f5edacd4e302f8a8377627c149eb2f160279d812` |
| R27A source tree | `6dec4331b26a9442f25344e4b5802e8b5d5cf93d` |
| `pnpm-lock.yaml` SHA-256 | `d5d165edb36508e4970647deb1835ad9d10ef6f2ccb804b0de55b781e77f21db` |
| `THIRD_PARTY_NOTICES` SHA-256 | `316a3275b2d7513830b57ab9d5667cc21bd855e60e5b10d30d55926b631f6af4` |
| Migration directories | `27` |

The R27A source commit is composed of six independent remediation commits:

| Commit | Scope |
|---|---|
| `30a6d233da0f03e2913fa917f1f434f130df76ae` | Auth, protected configuration, CSRF/origin and log redaction |
| `683d453d199db5f8764ee99391badc45e0b3efa1` | Attachment quarantine/CLEAN semantics and project-scope authorization |
| `c5807951b5d4b549fb37641b95fc20bace4e64d5` | Dependency remediation, minimal runtime images and API ops target |
| `3975373d28cc2e4b760e8f85861624322d42ccf8` | Deployment/migration/GCE shell injection and bootstrap hardening |
| `6d7674b61955b4ea4ba118ad17f02234aa57e576` | First-party source-package and SAST target coverage |
| `f5edacd4e302f8a8377627c149eb2f160279d812` | Authenticated pre-Multer upload resource admission, multipart ingress and API process resource bounds |

## Company first-party source package

The packager was run twice from the immutable source commit in isolated output
directories. Both archives and all sidecars were byte-for-byte identical.

| Field | Value |
|---|---|
| Archive | `company-source-scan-f5edacd4e302.tar.gz` |
| Archive SHA-256 | `d591f5c340bc334167e656d15a415db05b9ecfdda860e4120dd77a119a8aa5b3` |
| Archive size | `942531` bytes |
| Included files | `648` |
| Excluded candidates | `3` |
| Excluded paths | `apps/api/.env.example`; `apps/web/.env.example`; `deploy/env/staging.env.example` |
| Run A versus run B | Byte-identical archive and sidecars |
| Prohibited generated/sensitive paths | `0` |

The package is retained in the ignored local delivery directory
`reports/security/r27/company-source-package/`. It is not added to Git and is
not recursively included in the source package.

The formal target manifest contains `589` first-party targets: 50 Shell, 16
MJS, 4 JS, 347 TS, 164 TSX, 1 MTS, 1 Python, 5 JSON and 1 CI YAML. Its
SHA-256 is
`b032ebb7cb0f561a70e05943ffacacc7ef9d5ca7d1fee7e69695933919686427`;
duplicate, missing, untracked, forbidden and source-package-missing counts are
all zero. Dockerfiles
and Prisma schema/migrations are governed by their separate image/schema gates;
they are not falsely represented as Semgrep language targets.

## Pinned tools and scanner data

| Tool or data | Exact identity |
|---|---|
| pnpm | `9.15.4` |
| OSV-Scanner | `2.4.0`; binary SHA-256 `77e5286bd4f45bfe904389043f87958f30a0d1da62017a3323aadd064549fce1` |
| Gitleaks | `8.30.1`; binary SHA-256 `f414bc2fb952be6c9072b75cb411e3368614ef4b16d48dbd9ad238034afd2302` |
| ShellCheck | `0.11.0`; official Darwin ARM64 release archive SHA-256 `56affdd8de5527894dca6dc3d7e0a99a873b0f004d7aabc30ae407d3f48b0a79`; extracted binary SHA-256 `61c17246d69f012cd458ae82f244c46023dac75d1b69733ca1cc7d28fb270fd7` |
| Trivy | `ghcr.io/aquasecurity/trivy:0.72.0@sha256:cffe3f5161a47a6823fbd23d985795b3ed72a4c806da4c4df16266c02accdd6f` |
| Trivy DB | Version 2; UpdatedAt `2026-08-10T06:54:30.951906211Z`; NextUpdate `2026-08-11T06:54:30.95190594Z`; DB SHA-256 `87673cedb42993948419888d19c7ffe221c012b78d27844a0a45924319ce9929` |

The cache contained the previously refreshed snapshot recorded above. The
current `f5edacd4...` rebind did not download or refresh scanner data: it read
the metadata and database hash first, verified that the 03:36–03:37 UTC scan
window preceded `NextUpdate`, then scanned all three exact IDs with
`--network none --offline-scan --skip-db-update --skip-java-db-update` against
that same frozen database.

Formal Semgrep remains `TOOL_ERROR_AFTER_2_ATTEMPTS`. No third Semgrep execution
was attempted and none of the AST, ShellCheck, SCA, image or manual-review
results in this manifest are represented as a replacement formal Semgrep pass.

ShellCheck 0.11.0 returned zero findings on the remediated/changed security
Shell scope through `6d7674b...`. The sixth commit's three Shell changes passed
the security-hardening harness and `bash -n`; they did not trigger a third
full-manifest ShellCheck invocation. The earlier expanded run across all 50
manifest Shell targets returned
5 warnings and 20 informational observations (no error-level finding): the
warnings are limited to declaration/assignment and intentionally exported
state in `health-check.sh`; the informational set is SC2086, SC2329 and SC2016
review output in existing security helpers. The first full-manifest gate attempt
had stopped before scanning because the release archive hash was incorrectly
asserted as the extracted binary hash; after correcting the tool identity, the
second attempt produced the findings above. No third full-manifest invocation
was made. Full-manifest ShellCheck therefore remains an open quality/review
item and is not reported as a 50/50 zero-finding pass.

## Dependency and secret evidence

| Gate | Result | Raw report SHA-256 |
|---|---|---|
| `pnpm audit --prod` | Identical-lock carry-forward; rc 0; Critical/High/Medium/Low/Info `0/0/0/0/0` | `16f4b054617a8e772c42cbc3200fd2eb76570b7753daed628ed1b3999a5cd74d` |
| `pnpm audit` full lock | Identical-lock carry-forward; rc 0; Critical/High/Medium/Low/Info `0/0/0/0/0` | `8c4b08739b58fd222c7878a8fc44559aa4f1c8bd4cf9a454d451314c14cdac9e` |
| OSV lockfile scan | Identical-lock carry-forward; rc 0; 472 packages; 0 vulnerabilities | `d8318ba7ad3a0c96a94a1dcd91b00aeca3106a08d7d01dc8f3deae50ca4a3c89` |
| Gitleaks exact `f5edacd4...` source tree | rc 0; 0 findings | `37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570` |
| Gitleaks pre-evidence valid-ref-reachable history through `f5edacd4...` | Non-shallow repository; 81 sorted refs; rc 0; 0 findings | Empty report `37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570`; ref set `529a41b5c5fb6ddeed3d32d7fe2d2aa0da2a4598bb03ee0921a4e31748ceb893` |
| Gitleaks final staged delivery overlay | `PENDING_EXACT_EVIDENCE_RESCAN` | Raw redacted report will remain outside Git |
| Gitleaks final ref-reachable history | `PENDING_POST_EVIDENCE_COMMIT_RESCAN` | Final recorded ref-set hash will remain outside Git |

Raw reports remain outside the tracked source package. No matched secret,
cookie, session token or credential value is copied into this manifest.
The pnpm/OSV raw results are not represented as a new network scan after the
sixth source-only commit: `pnpm-lock.yaml` remained byte-identical with SHA-256
`d5d165edb36508e4970647deb1835ad9d10ef6f2ccb804b0de55b781e77f21db`.
Five license inventories and `THIRD_PARTY_NOTICES` were instead regenerated in
an exact-commit clone with offline frozen installation and matched the source
commit byte-for-byte.
The previous `6d7674b...` overlay produced eight public image identity
candidates, but that count is superseded. The current regenerated Markdown and
CycloneDX files must be scanned as one exact staged snapshot after all edits;
every candidate must be individually triaged without broadening an allowlist or
editing generated SBOMs. A new pre-evidence history scan through the current
source branch covered all commits reachable from the recorded 81 valid refs in
a non-shallow repository and returned 0 findings. The post-evidence history
command will repeat `git log --all` on the new ref set. Neither result claims
reflog-only or unreachable Git objects. A previous read-only check
observed 13 local unreachable commits after autosquash. They are not part of
the branch/package or intended remote push lineage, but this manifest does not
claim final raw-history coverage for them. The earlier Gate 5 refs/reflogs
evidence remains a separate historical run.

## Exact local image and SBOM binding

All images use the pinned Node base
`node:24-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43`
and carry both:

```text
org.opencontainers.image.revision=f5edacd4e302f8a8377627c149eb2f160279d812
com.feishu-timeline.evidence.scope=local-r27a-linux-arm64
```

| Role and local tag | Exact image ID | Size | Trivy C/H/M/L/U | Trivy JSON SHA-256 | CycloneDX components | SBOM SHA-256 |
|---|---|---:|---|---|---:|---|
| API `feishu-timeline-api:r27a-f5edacd4e302-arm64` | `sha256:b969d9faa5394f7f2d4360dc7aaf94d15e8addba0bc545056671418030a62fd1` | 107843796 | `0/0/0/0/0` | `a59c90ff06a6a20df671b0c6716599adee6867214d306ef56e0bfe3503d3ffcf` | 155 | `407461c4843370c4030e1d3de1819f8f73eba13d9558d19c2158fb6ab79c30a0` |
| Web `feishu-timeline-web:r27a-f5edacd4e302-arm64` | `sha256:dcb65cfd2e3099d844cf351f227f7381f72a691f856f5960cfa245e06d6282d8` | 75366413 | `0/0/0/0/0` | `8934c065945df5b635fc1ffe6bd646ff06aaf79137f5d349bef24a0cbcfddcda` | 46 | `4c22c26984240e885bfa0503f248f581ca856571b316f994ce181aa216b95f1d` |
| API ops `feishu-timeline-api-ops:r27a-f5edacd4e302-arm64` | `sha256:12197a6ea1d5ac22d36c0621b8cd00b3c47805ba315c00a62ac84b9aa058a07e` | 147257676 | `0/0/0/0/0` | `8786ff6d79e102637823f25ac726ab473ed4b569622dd3272707e9abe9092282` | 62 | `c84fb624baed5569403756829c50ce999c6063c5bebb9a0365dc18365156e928` |

Older unbound `r27a-local` and `r27a-6d7674b61955-arm64` tags remain on the
Docker host. They are not the candidates in this manifest, were not substituted
into the current binding, and were not deleted or retagged. The three old
untracked `6d7674b...` SBOM files were moved after hash capture to the
recoverable Git-external directory
`/Users/lixiaochen/.Trash/r27a-6d-sbom.JjA0ob`; only the three exact IDs and
current `f5edacd4...` SBOMs above support this local ARM64 result.

The first API build invocation additionally disabled all BuildKit `RUN`
network, which changed the cache key and stopped at Corepack before a build was
produced. After inspecting the existing trusted pnpm-install snapshots, the
second and final invocation restored the Dockerfile's original build-network
mode only to recover the exact cache key: every dependency/install step was
`CACHED`, package download count was zero, the base digest remained fixed and
no Docker Hub pull occurred. No third build attempt was made. Trivy and SBOM
operations were hard network-disabled.

The Web runtime was tested through Next's image-optimizer module resolution:
Sharp loaded, libvips reported `8.18.3`, and a PNG was generated. A first
diagnostic that called `require("sharp")` from the application root did not
match Next standalone's nested module layout; the corrected Next runtime entry
point passed. This was not repeated a third time.

CycloneDX `metadata.timestamp` and `serialNumber` are generated values. The raw
SBOMs are therefore bound by source commit, exact image ID, OCI revision,
platform, pinned scanner/database and their recorded SHA-256; byte equality
between independent SBOM generations is not claimed.

## License evidence

| Inventory | Records | SHA-256 |
|---|---:|---|
| Workspace all | 391 | `6de8aa0a70785056b5825ec7c8d2e54cdd04d37ac3d7ef23f0f8881bc0c97abd` |
| Workspace production | 195 | `a59a96f14792157278d403c58c2969ec3f5631adb54ffa90cb4496efd1479554` |
| API runtime resolution | 167 | `4852048179bd024bd4212416b64f0c2a1cdff56178324b282529f2121d842e85` |
| Web runtime resolution | 25 | `66c82a99d20a0cb4baa4da41be627d289f2ef4dacf54d58426ef6b8236df6e06` |
| API ops resolution | 40 | `b0f2b2b6ee640bd72ff80a5dfff19c5d35a9ec7681f49fc30c5e000535a37c23` |

The inventories were regenerated from the exact commit using frozen, offline,
ignore-scripts installation and matched the committed `THIRD_PARTY_NOTICES`.
They are a Darwin ARM64 pnpm-resolution union, not exact Linux image contents;
the exact Linux inventories are the three SBOMs. Company legal/security review
of `UNKNOWN`, GPL, LGPL and CC-BY entries, especially Sharp/libvips distribution
obligations, remains `OPEN`.

## Verification and unresolved gates

Local quality passed for frozen-lock install, lint, typecheck, Web/API unit and
integration tests, Web/API builds, Prisma validate and E2E. Playwright did not
reach assertions: attempt 1 lacked the pinned Chromium cache and attempt 2 with
system Chrome lacked the pinned Playwright ffmpeg cache. The two-failure rule
was applied and no third attempt was made.

This evidence does not close the following gates:

- formal pinned Semgrep execution and review of any new result;
- real staging ClamAV connectivity, EICAR/clean-file behavior and scanner
  signature/version evidence;
- historical `LEGACY_UNSCANNED` attachment rescan or approved disposition;
- staging upload resource/load and reconciliation verification;
- authenticated staging DAST and complete lifecycle technical UAT;
- 10 VU x 30 minute and 5 VU x 2 hour stability tests;
- company legal/security license approval;
- company security confirmation of the 13 historical review dispositions;
- an approved local Git reflog/unreachable-object secret scan or repository
  metadata disposition if company policy requires coverage beyond ref-reachable
  branch history;
- full-manifest ShellCheck review/remediation and a later approved rerun;
- target private-cloud architecture confirmation and rebuild/scan on that exact
  architecture if it is not `linux/arm64`;
- company formal source rescan and final security clearance.

```text
R27A_SOURCE_COMMIT=f5edacd4e302f8a8377627c149eb2f160279d812
R27A_LOCAL_ARM64_DEPENDENCY_AND_IMAGE_SCAN=PASS
CONFIRMED_SECRET_FINDINGS_IN_EXACT_SOURCE_TREE=0
FINAL_DELIVERY_CONFIRMED_SECRET_FINDINGS=PENDING_EXACT_EVIDENCE_RESCAN
FINAL_DELIVERY_UNTRIAGED_SECRET_CANDIDATES=PENDING_EXACT_EVIDENCE_RESCAN
FORMAL_SEMGREP_STILL_PENDING
ATTACHMENT_SCANNER_REAL_STAGING_ACCEPTANCE_PENDING
TARGET_ARCHITECTURE_REBUILD_REQUIRED=YES_UNTIL_CONFIRMED
LEGAL_SECURITY_LICENSE_REVIEW=OPEN
FULL_MANIFEST_SHELLCHECK_REVIEW=PENDING
LOCAL_GIT_UNREACHABLE_SECRET_SCOPE_DECISION=PENDING
SECURITY_CLEARANCE=NOT_ESTABLISHED
```
