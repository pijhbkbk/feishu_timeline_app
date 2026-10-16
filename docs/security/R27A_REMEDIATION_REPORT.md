# R27A Confirmed Security Findings Remediation Report

Date: 2026-08-11 (Asia/Shanghai)

## Executive outcome

R27A has implemented the confirmed application, dependency, runtime-image,
deployment-script and configuration remediations in six independent commits.
The immutable source commit is:

```text
f5edacd4e302f8a8377627c149eb2f160279d812
```

Core frozen-lock application gates passed. Playwright did not reach a browser
assertion after two tooling-cache failures, and the expanded all-50 ShellCheck
audit remains `REVIEW_PENDING` after its nonzero review output.
The exact lockfile and three exact local `linux/arm64` candidate image IDs have
0 Critical, High, Medium, Low or Unknown vulnerability findings. Gitleaks on
the exact `f5edacd4...` source tree has 0 findings. The final staged evidence
snapshot and post-evidence-commit ref-reachable history remain deliberately
pending until all evidence files are immutable.

This is not final R27 clearance. Formal Semgrep did not produce a report; real
staging ClamAV acceptance, legacy attachment disposition, authenticated DAST,
two stability tiers, target-architecture image proof, company license/security
review and company formal rescan are still pending. Production, main and tags
were not changed.

## Authorization and execution boundary

The product owner previously authorized the R27 source baseline, Gate 0 source
composition and Gate 2 triage/fix list, then directed R27A to remediate confirmed
findings without a third Docker Hub/Semgrep retry.

Executed boundary:

- branch: `security/r27-final-source-clearance`;
- worktree: isolated R27 security worktree;
- starting evidence commit:
  `16c1a9d0844f0a648866462544d91e7926760f97`;
- no main merge;
- no stable tag;
- no staging or production deployment;
- no production or Feishu-platform scan;
- no third formal Semgrep attempt;
- no `node_modules` or `.next` edits to suppress findings;
- no broadened first-party ignore rule;
- no `git add -A`;
- no user PNG/PPT design attachment in the worktree or commits.

## Immutable commit chain

| Commit | Scope |
|---|---|
| `30a6d233da0f03e2913fa917f1f434f130df76ae` | Auth/session, protected configuration, CSRF/origin and sensitive logging |
| `683d453d199db5f8764ee99391badc45e0b3efa1` | Attachment quarantine/CLEAN semantics, direct relation/count gates and project-scope IDOR |
| `c5807951b5d4b549fb37641b95fc20bace4e64d5` | Dependency fixes, minimal API/Web runtime, API ops image and license tooling |
| `3975373d28cc2e4b760e8f85861624322d42ccf8` | Shell/GCE injection removal, bootstrap integrity and protected deployment preflight |
| `6d7674b61955b4ea4ba118ad17f02234aa57e576` | Company source-package and first-party SAST target expansion |
| `f5edacd4e302f8a8377627c149eb2f160279d812` | Pre-Multer authenticated upload resource admission, multipart ingress controls and API process resource bounds |

The final Git tree is
`6dec4331b26a9442f25344e4b5802e8b5d5cf93d`; the lockfile SHA-256 is
`d5d165edb36508e4970647deb1835ad9d10ef6f2ccb804b0de55b781e77f21db`.

## Remediation detail

### Logout and server-side session invalidation

The public logout endpoint now reads the exact configured session cookie from
the request, passes it to the service, validates its UUID form, deletes only the
corresponding Redis session and clears the browser cookie. Missing or malformed
cookies are idempotent and cannot select another session. The session value is
not logged. Tests cover session deletion, cookie clearing, repeated logout,
missing/malformed cookies and preservation of another device's session.

### Shell command and remote-source injection

The initial `ops-check.sh`, `backup-postgres.sh` and
`check-http-errors.sh` sinks were converted from `eval`/interpolated command
strings to validated argv arrays and static remote programs. The audit expanded
to `restore_to_gcp.sh` and every `gce-*.sh` script so that homologous injection
paths were not left behind.

Inputs such as project, zone, instance, paths, URLs, Git refs, database names,
certificate parameters and switches are fail-closed before `gcloud` or a remote
shell. Remote scripts are static single-quoted heredocs; values travel as
position parameters with controlled quoting. Regression payloads include
semicolon, `$()`, backticks, `&&`, newline, leading dash and oversized values;
they are rejected before command execution and create no marker.

### Attachment quarantine and CLEAN-only business semantics

Prisma schema and migration add:

```text
PENDING_SCAN
CLEAN
REJECTED
SCAN_ERROR
LEGACY_UNSCANNED
```

New uploads enter quarantine and are not ordinary business material. A real
ClamAV adapter streams data with timeout/concurrency controls. Only a CLEAN
verdict promotes the object and allows download, binding, direct relationship,
business query or material count. Unknown/malformed verdicts fail closed.
REJECTED and SCAN_ERROR remain inaccessible. Existing attachments migrate to
`LEGACY_UNSCANNED`, not CLEAN.

The Web uses nullable content URLs, scan status and `canDownload`, avoiding
`/apinull` and hiding download/bind actions for non-CLEAN records. Performance
reports, reviews, color-number provenance, task/admin/dashboard/timeline counts
and other attachment-backed read models apply the same CLEAN predicate.

Storage/metadata failure paths independently attempt scan-failure recording and
quarantine purge. Double failures and process crashes still require a staging
reconciliation/retention design; no claim of impossible orphaning is made.

Real staging ClamAV has not been connected or accepted. The code therefore
remains `CODE_IMPLEMENTED_EXTERNAL_ACCEPTANCE_PENDING`, not a closed Medium.

### Authenticated multipart resource admission

An independent final source review confirmed an additional Medium availability
finding after the first five commits: authenticated users could submit many
parallel 20 MiB multipart bodies, allowing Nginx and Multer to receive and
buffer them before the downstream ClamAV concurrency gate. That gate was too
late to bound API heap, proxy connections or temporary-body resources.

The sixth commit adds a fail-fast admission interceptor after authenticated
guards and before Multer/Busboy body parsing. It enforces a shared global limit
of four, per-actor and per-target concurrency, and a bounded per-actor sliding
rate; target identity is the trusted route `projectId`, or `taskId` for the V2
task-material routes. Actor-rate state has TTL cleanup and a 10,000-actor hard
cap. Rejected requests return 429 plus `Retry-After`, with no scanner, storage,
controller or database side effect.

The lease is released only when both the HTTP transport has terminated and the
scanner/storage/database chain has settled. A real client-abort/slow-handler
test proves that disconnecting after parsing cannot release capacity while the
old downstream work continues. Nginx applies multipart-only client
connection/rate limits, `proxy_request_buffering off`, a 15-second body timeout
and a 21 MiB request envelope; Compose/systemd add API memory and PID limits.

This Medium is source-fixed and locally verified, but remains
`CODE_IMPLEMENTED_EXTERNAL_ACCEPTANCE_PENDING`. Real staging must verify the
trusted client-IP topology, cgroup/systemd limits, normal browser concurrency,
ClamAV latency, memory peaks and authorized load profile.

### Project-scope IDOR

During attachment review, eight project-scoped modules were found to rely on
global role checks without enforcing the actor's membership/data scope. The
controllers now carry matching permissions and pass the actor; services invoke
`ProjectAccessService` before business lookup, transaction, scanner/storage or
attachment creation.

Affected modules:

- samples;
- performance tests;
- mass productions;
- paint procurements;
- production plans;
- pilot productions;
- standard boards;
- development reports.

Read paths require `project.read`; ordinary writes require
`workflow.transition`; attachment uploads require `attachment.manage`.
Negative tests prove a non-member with an otherwise allowed global role gets
403 before side effects, while authorized members retain the expected path.

### Logs, link paths, origin and protected configuration

Application/notification logs retain allowlisted operational facts without
copying full user/project/task/dedupe values. Internal notification link paths
are constrained to approved in-app paths. In staging/production, frontend
origin, DB, Redis and ClamAV settings are mandatory and validated; local/default
hosts, weak passwords, placeholders and mock auth fail closed. Unsafe
cookie-session mutations reject missing, invalid or mismatched origin.

### Dependencies and minimal images

The lockfile resolves the initial advisories to:

- `js-yaml@5.2.2`;
- `nanoid@3.3.18`;
- `brace-expansion@5.0.9`.

API and Web use minimal runtime targets. Prisma CLI, migrations and seed tooling
are isolated in an `api-ops` target rather than the long-running API image.
Next standalone is used for Web. The staging build/scan path includes all three
artifacts and requires digest-pinned base image overrides.

The exact local ARM64 candidates bind the source revision and scan as follows:

| Image | Exact ID | Trivy C/H/M/L/U |
|---|---|---|
| API | `sha256:b969d9faa5394f7f2d4360dc7aaf94d15e8addba0bc545056671418030a62fd1` | `0/0/0/0/0` |
| Web | `sha256:dcb65cfd2e3099d844cf351f227f7381f72a691f856f5960cfa245e06d6282d8` | `0/0/0/0/0` |
| API ops | `sha256:12197a6ea1d5ac22d36c0621b8cd00b3c47805ba315c00a62ac84b9aa058a07e` | `0/0/0/0/0` |

These are local `linux/arm64` candidates, not approved production images. The
private-cloud target architecture must be confirmed and rebuilt/rescanned if it
differs.

All three were rebuilt from the exact `f5edacd4...` Git archive with the pinned
Node base digest and carry the full OCI revision. The first API build attempt
changed BuildKit's network mode, missed the existing cache key and stopped at
Corepack before producing an image. The second and final attempt restored the
Dockerfile's original build-network mode to match audited local cache; every
dependency/install layer was `CACHED`, package downloads were 0, and no base or
Docker Hub pull was observed. Trivy and SBOM generation were hard
network-disabled. No image was started, deployed or pushed.

### Bootstrap and license evidence

Root `curl | bash` bootstrap was removed. NodeSource package metadata is pinned,
the signing key's SHA-256/fingerprint is checked, a scoped `signed-by` keyring is
used and `nodejs=24.19.0-1nodesource1` is exact.

`THIRD_PARTY_NOTICES`, five source-resolution license inventories and three
exact-image CycloneDX SBOMs were generated. Sharp/libvips runtime loading passed
through Next's actual image optimizer. UNKNOWN/GPL/LGPL/CC-BY and bundled
libvips obligations remain for company legal/security review. Codex has not
made a legal approval or risk-acceptance decision.

## Source package and target coverage

The final company package was built twice from the immutable commit:

```text
archive=company-source-scan-f5edacd4e302.tar.gz
archiveSha256=d591f5c340bc334167e656d15a415db05b9ecfdda860e4120dd77a119a8aa5b3
archiveSize=942531
includedFiles=648
excludedCandidates=3
prohibitedPaths=0
runAEqualsRunB=YES
```

The target manifest now contains 589 first-party files and includes all 50 Shell
scripts, 20 JS/MJS files, TypeScript-family sources and CI YAML. Dockerfile and
Prisma review remain explicit separate gates rather than being misrepresented
as Semgrep targets. The target manifest SHA-256 is
`b032ebb7cb0f561a70e05943ffacacc7ef9d5ca7d1fee7e69695933919686427`;
duplicate, missing, untracked, forbidden and package-missing targets are all 0.

## Exact-commit SCA, image and secret results

| Gate | Result |
|---|---|
| pnpm production audit | Identical-lock carry-forward; Critical/High/Medium/Low/Info `0/0/0/0/0` |
| pnpm full-lock audit | Identical-lock carry-forward; Critical/High/Medium/Low/Info `0/0/0/0/0` |
| OSV lock scan | Identical-lock carry-forward; 472 packages; 0 vulnerabilities |
| Trivy exact local API image | C/H/M/L/U `0/0/0/0/0` |
| Trivy exact local Web image | C/H/M/L/U `0/0/0/0/0` |
| Trivy exact local API ops image | C/H/M/L/U `0/0/0/0/0` |
| Gitleaks exact `f5edacd4...` source tree | 0 findings |
| Gitleaks pre-evidence source history | Non-shallow; 81 recorded valid refs; 0 findings |
| Gitleaks final staged delivery overlay | `PENDING_EXACT_EVIDENCE_RESCAN` after all tracked evidence is final |
| Gitleaks final ref-reachable history | `PENDING_POST_EVIDENCE_COMMIT_RESCAN` |

The previous `6d7674b...` delivery overlay produced eight public image
identity candidates, but that count is superseded and is not silently carried
into the current `f5edacd4...` evidence. The current exact source tree has zero
findings. After all Markdown and regenerated SBOMs are final, the exact staged
snapshot must be rescanned and every candidate individually triaged; no
global/path allowlist may be added and the raw SBOMs may not be edited to hide
results.

The pre-evidence history command newly covered every commit reachable from 81
recorded valid refs through `f5edacd4...` in a non-shallow repository and
returned 0 findings. The post-evidence command will repeat that scope after the
evidence commit. Neither result will represent reflog-only or unreachable
objects as covered. Thirteen local
unreachable commits were previously observed after autosquash; they are absent
from the branch, source package and intended remote push lineage, but no final
raw-report coverage claim is made for them. If company policy requires local
object-database coverage, approve a separate reflog/unreachable-object scan or
metadata disposition. The earlier Gate 5 refs/reflogs run remains separate
evidence.

The Trivy scans used the same pinned scanner digest and database hash. The
current run did not refresh scanner data: it verified the cached snapshot was
inside `NextUpdate`, then ran hard-network-disabled and offline by exact image
ID. Full hashes and SBOM bindings are in
`security/R27A_EVIDENCE_BINDING.md`.

## Local quality matrix

| Check | Result |
|---|---|
| `pnpm install --frozen-lockfile` | PASS |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS: Web 48 files / 198 tests; API 82 files / 450 tests |
| `pnpm build` | PASS |
| API Prisma validate | PASS |
| `pnpm test:e2e` | PASS: permission, attachment, workflow steps and Web pages |
| Attachment/ClamAV/storage focused tests | PASS: 34 tests |
| Upload admission/config/Nginx focused tests | PASS: 4 files / 70 tests |
| Eight-module project-scope focused regression | PASS: 53 tests |
| Shell injection regression | PASS |
| All 50 Shell scripts `bash -n` | PASS |
| ShellCheck 0.11.0 on changed/security Shell scope through `6d7674b...` | PASS, 0 findings |
| Sixth-commit Shell changes | Security hardening regression and `bash -n` PASS; full ShellCheck rerun not performed under the two-failure stop boundary |
| ShellCheck 0.11.0 on all 50 manifest Shell targets | Nonzero: 5 warnings, 20 information; no error-level finding; review pending |
| Source-package/security gate scripts | PASS |
| Playwright | `BLOCKED_TOOLING_AFTER_2_ATTEMPTS` before assertions |
| Formal Semgrep | `TOOL_ERROR_AFTER_2_ATTEMPTS`; not retried |

## Playwright blocker report

This subsection satisfies the same-gate two-failure stop record.

| Field | Evidence |
|---|---|
| Environment | Local macOS R27 security worktree; local Postgres/Redis; intended Web/API `http://localhost:3000` and `http://localhost:3001/api` |
| Git identity at attempts | Git HEAD was the prior evidence commit with the R27A worktree changes not yet committed; the functionally equivalent changes were subsequently frozen as `6d7674b61955b4ea4ba118ad17f02234aa57e576` |
| Exact user URL reached | `NONE`; failure occurred before a browser assertion/navigation result |
| Attempt 1 | Repository Playwright runner with pinned bundled Chromium expectation |
| Attempt 1 result | Missing pinned Chromium executable/cache; test assertions not started |
| Attempt 2 | Same runner using installed system Chrome 151 through explicit executable path |
| Attempt 2 result | Missing Playwright-pinned ffmpeg cache required by configured video retention; test assertions not started |
| Root cause | Local Playwright browser/media cache is incomplete; source assertion failure was not produced |
| Stop action | No third Playwright attempt and no browser/cache download was started |
| Recovery | In an approved network/tooling step install the exact Playwright browser and ffmpeg artifacts for the lockfile, verify their versions/hashes, then rerun once from the immutable commit |
| User/security decision | No product or security acceptance can be inferred until the rerun reaches assertions |

## Full-manifest ShellCheck stop record

The remediated security Shell scope through `6d7674b...` passed ShellCheck
0.11.0 with zero findings. The sixth commit's three Shell changes passed the
security-hardening harness and `bash -n`; they were not used to trigger a third
full-manifest ShellCheck invocation.
An expanded all-50 target gate was then attempted for stronger coverage:

| Field | Evidence |
|---|---|
| Environment | Local R27 security worktree; source commit `6d7674b61955b4ea4ba118ad17f02234aa57e576`; no remote host or URL |
| Attempt 1 | Stopped before ShellCheck because the official release archive SHA-256 was incorrectly asserted as the extracted binary SHA-256 |
| Tool identity correction | Archive `56affdd8...`; extracted binary `61c17246...`; version `0.11.0` |
| Attempt 2 | All 50 manifest Shell targets were analyzed |
| Result | rc 1; 5 warnings and 20 informational observations; no error-level finding |
| Warning scope | `health-check.sh`: two SC2155 and three SC2034 observations |
| Information scope | Existing security helpers: SC2086, SC2329 and literal-string SC2016 review observations |
| Security triage | No new Critical/High/Medium command-injection or secret finding was confirmed from this output; the original injection/bootstrap fixes retain focused zero-finding evidence |
| Stop action | No third full-manifest ShellCheck invocation |
| Recovery | Review each observation, add code changes or precise local justification without a global ignore, then run one approved all-target scan |
| User/security decision | Human approval is required for the observation dispositions or any precise local suppression and for the next all-50 rerun; Codex will not continue automatically |

Therefore the all-50 ShellCheck quality gate is `REVIEW_PENDING`, not PASS. This
does not convert the formal Semgrep status or establish R27 clearance.

## Historical 13 review findings

All 156 company-PDF records remain individually triaged and untriaged count is
zero. R27A provides exact-lock/image reachability evidence and recommended
dispositions for the 13 retained review records: 11 reported old Next/React DOM
versions are candidates for `NOT_IN_PRODUCTION`; current React action-state and
unsigned cookie-parser paths are candidates for application-specific
`FALSE_POSITIVE`. Company security has not confirmed those dispositions, and
the approved JSON is not silently rewritten. Exact IDs and reasoning are in
`docs/security/R27_REMEDIATION_TRACKER.md`.

## Remaining release blockers

1. Restore the approved fixed Semgrep toolchain; scan the regenerated
   exact-commit target manifest with
   pinned/local rules and remediate every confirmed result.
2. Connect real staging ClamAV and verify clean/EICAR/error/timeout,
   engine/signature identity, network boundary and CLEAN-only download.
3. Rescan or formally dispose of every `LEGACY_UNSCANNED` attachment.
4. Validate upload admission and crash/double-failure reconciliation in
   staging with measured client-IP topology, container memory, scanner latency,
   normal browser concurrency and Nginx limits.
5. Restore the exact Playwright browser/ffmpeg toolchain and rerun.
6. Review the 5 warning and 20 informational all-target ShellCheck observations,
   then perform one approved full-manifest rerun.
7. If company policy requires more than ref-reachable history, approve a local
   reflog/unreachable-object secret scan or repository metadata disposition.
8. Confirm target private-cloud architecture; rebuild and rescan API/Web/api-ops
   on that exact platform.
9. Obtain company legal/security disposition for license observations and all
   13 historical security-review records.
10. Run authorized authenticated staging DAST and lifecycle technical UAT.
11. Run 10 VU x 30 minute and 5 VU x 2 hour post-security stability tests.
12. Submit the final company package and obtain the company formal rescan result.

## Mandatory delivery truth

1. 代码是否实现：是；R27A 已确认修复和追加发现的代码已冻结在
   `f5edacd4e302f8a8377627c149eb2f160279d812`。恶意文件扫描与上传资源准入
   两项 Medium 均仍需真实 staging 验收，不能写成最终关闭。
2. 本地测试是否通过：lint、typecheck、unit/API、build、Prisma validate、E2E、
   Shell 与 focused security tests 通过；Playwright 两次工具链阻断；正式 Semgrep
   未产出。
3. staging 精确 URL：未执行、未访问；无 R27A staging URL。
4. staging runtime commit：`UNKNOWN_NOT_RECORDED`；R27A 未部署 staging。
5. staging 用户路径是否通过：未执行；真实 ClamAV、DAST 和浏览器用户路径均未验收。
6. production 是否改变：否。
7. production runtime commit：记录值
   `535041bb25f21d548d863d07b35e3e952b0aeb2c`；本轮未在线复核、未改变。
8. production 用户路径是否通过：未执行；未访问 production。
9. main 是否改变：否；local main 与 origin/main 仍为
   `41b4b166c587692e6f0fb9536dca2e1aab646c70`。
10. tag 是否改变：否；仍为 `v1.0.0`、`v1.1.0-rc.1`、`v1.1.0-rc.2`、
    `v1.1.0-rc.3`。
11. 产品负责人是否确认：已确认 R26 Gate 3D、R27 baseline、Gate 0 与 Gate 2；
    尚未确认 R27A 修复差异、真实 scanner、最终安全清场或公司复扫。
12. 未完成路由：本轮未新增/遗留业务路由；未完成的是安全外部闸门和动态验收。
13. Placeholder 数量：正式产品源码 `0`；原始红线扫描有 10 条测试断言或
    `getByPlaceholder` 方法名命中，不是正式页面占位文案。
14. 当前准确状态：见 Decision。

## Decision

```text
R27A_CODE_IMPLEMENTED
R27A_SOURCE_COMMIT=f5edacd4e302f8a8377627c149eb2f160279d812
R27A_ATTACHMENT_RESOURCE_ADMISSION_FIX_IMPLEMENTED
R27A_KNOWN_CODE_C_H_M_BLOCKERS_AFTER_INDEPENDENT_REVIEW=0
R27A_LOCAL_QUALITY_PARTIALLY_VERIFIED
PLAYWRIGHT_BLOCKED_TOOLING_AFTER_2_ATTEMPTS
FULL_MANIFEST_SHELLCHECK_REVIEW_PENDING
LOCAL_GIT_UNREACHABLE_SECRET_SCOPE_DECISION_PENDING
R27A_LOCAL_ARM64_DEPENDENCY_AND_IMAGE_SCAN=PASS
CONFIRMED_SECRET_FINDINGS_IN_EXACT_SOURCE_TREE=0
FINAL_DELIVERY_CONFIRMED_SECRET_FINDINGS=PENDING_EXACT_EVIDENCE_RESCAN
FINAL_DELIVERY_UNTRIAGED_SECRET_CANDIDATES=PENDING_EXACT_EVIDENCE_RESCAN
ATTACHMENT_SCANNER_REAL_STAGING_ACCEPTANCE_PENDING
ATTACHMENT_RESOURCE_ADMISSION_STAGING_LOAD_ACCEPTANCE_PENDING
ATTACHMENT_RECONCILIATION_STAGING_ACCEPTANCE_PENDING
LEGACY_ATTACHMENT_RESCAN_OR_DISPOSAL_POLICY_PENDING
FORMAL_SEMGREP_STILL_PENDING
STAGING_DAST_NOT_STARTED
FULL_STABILITY_NOT_STARTED
TARGET_ARCHITECTURE_REBUILD_REQUIRED=YES_UNTIL_CONFIRMED
LEGAL_SECURITY_LICENSE_REVIEW=OPEN
SECURITY_CLEARANCE=NOT_ESTABLISHED
PRODUCTION_UNCHANGED
MAIN_UNCHANGED
TAG_UNCHANGED
AWAITING_R27A_REVIEW
STOP
```
