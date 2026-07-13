# Vendor SAST Triage R19B

> Round: `R19B_VENDOR_SAST_RECONCILIATION_AND_REMEDIATION`
> Triage date: 2026-07-10
> Scope of this document: reconciliation of the 156 findings in the vendor PDF only
> Decision: `VENDOR_FINDINGS_RECONCILED`; this is not the final R19B release decision

## 1. Evidence baseline

- Source report: `/Users/lixiaochen/Downloads/轻卡新颜色开发项目管理系统_前端_SAST-TS.pdf`
- PDF SHA-256: `149d5fd2314b5bee6b98b93930498526c49930e0ab3ddb516f1c12f6ff02ffeb`
- Report size/pages: 45,789,219 bytes / 6,609 physical PDF pages.
- Vendor task: ID `22485`, executed `2026-07-10 09:22:33`, policy shown as `SAST-JavaScript`.
- Report status: 156 Medium findings; every finding is marked `未确认`.
- The PDF does not identify a Git commit or provide a hash/manifest for the scanned source archive. It therefore cannot be bound cryptographically to a repository revision.

The PDF was reviewed visually at its summary and representative finding pages, then parsed sequentially by section number (`3.1` through `3.156`) using the `漏洞 ID`, `漏洞名称` and `漏洞位置` fields. Exactly 156 records were recovered, with no missing ID, name or path. Counts below are derived from those records, not only from the summary chart.

## 2. Exact scope reconciliation

| Exact vendor rule name (abbreviated) | `node_modules` | `.next` | Authored source | Total |
|---|---:|---:|---:|---:|
| Weak hash algorithm | 80 | 0 | 0 | 80 |
| `setTimeout` may interpret a string as code | 38 | 0 | 0 | 38 |
| `eval` is extremely dangerous | 0 | 22 | 0 | 22 |
| `setInterval` may interpret a string as code | 14 | 0 | 0 | 14 |
| User-controlled data reaches YAML `load` | 2 | 0 | 0 | 2 |
| **Total** | **134** | **22** | **0** | **156** |

Independent checks therefore agree:

- Rule total: `80 + 38 + 22 + 14 + 2 = 156`.
- Path total: `134 node_modules + 22 .next + 0 authored = 156`.
- No finding location is under `apps/*/src` or `packages/shared/src`.

This establishes that the report scanned a dependency tree and a generated Next.js build tree. It does not establish that authored TypeScript/TSX was effectively scanned, and it cannot be used to claim that authored source is vulnerability-free.

## 3. Technical triage evidence

### 3.1 Timers: 52 findings

The timer group is 38 `setTimeout` plus 14 `setInterval` findings, all under `node_modules`:

- Next.js compiled runtime: 48 findings (34 `setTimeout`, 14 `setInterval`).
- Swagger UI bundles: 2 `setTimeout` findings.
- `@types/node` declarations: 2 `setTimeout` findings.

AST/call-site review found **0 string-literal or static string-template callbacks** among the 52 reported locations. Executable locations pass functions, callable references or identifiers; the two `@types/node/http2.d.ts` locations are type declarations and execute no code. The rule title describes string-evaluating timer usage, but that sink shape is absent. Disposition: lexical/API-name false positive for code injection; dependency advisories remain governed by SCA.

### 3.2 `eval`: 22 findings

All 22 paths are under `apps/web/.next/server`: 17 application chunks and 5 vendor chunks. The PDF excerpts contain Webpack wrapper calls such as `eval("__webpack_require__...")` together with inline source maps and `sourceURL=webpack-internal` markers. These are signatures of an eval-based development build artifact, not authored `eval` calls.

Disposition: generated development artifact, excluded from authored-source SAST. The old `.next` tree must be deleted and rebuilt in production mode; a separate production-artifact gate must reject `eval-source-map`, `sourceURL=webpack-internal` and unexpected executable `eval` before release. If such markers remain in a clean production build, this disposition is invalid and the finding must be reopened.

### 3.3 Weak hashes: 80 findings

All 80 locations are third-party code. The report's generic recommendation assumes password storage, but the excerpts and package locations instead show these main contexts:

- WebSocket `Sec-WebSocket-Accept` protocol computation using SHA-1.
- HTTP ETag generation using SHA-1.
- Build, transform, attachment, module and file-cache keys using MD5/SHA-1.
- React/Next internal action or development identifiers.
- Dependency integrity/signature helpers, including the old `cookie-signature` comparison helper.

No reported location stores a project user password, and no authored authentication code is named. Protocol-mandated or non-security cache identifiers do not obtain password-hash risk merely because MD5/SHA-1 appears. Security-sensitive dependency helpers must still be evaluated by package version/advisory through SCA; they are not repaired by editing `node_modules`.

The package contains duplicate old/new dependency copies, including Next.js 15.5.13/15.5.18, Vite 7.3.1/7.3.3, Playwright 1.59.1/1.60.0 and Prisma 6.19.2/6.19.3. This further shows that the uploaded directory was not a clean, revision-bound source package.

Disposition: the vendor's password-hash claim is unsupported as an application vulnerability. Route third-party risk to SCA and clean dependency installation; do not suppress the alert by modifying vendored files.

### 3.4 YAML `load`: 2 findings

Both findings are in `@eslint/eslintrc@3.3.5` at `config-array-factory.js:173` and `:219` (vendor IDs `934626` and `934627`). They load local ESLint YAML/legacy configuration files during developer tooling. The report supplies no request-to-file-path data flow and no production runtime reachability.

Disposition: no demonstrated remote/user-controlled application source; govern the actual `js-yaml` package version and advisories through SCA. A current dependency vulnerability, if present, must be upgraded and retested even though this SAST data-flow claim is unsupported.

## 4. Report-quality contradictions

| Report statement/evidence | Audit observation |
|---|---|
| All 156 records are `未确认`. | The conclusion nevertheless labels all 156 as actually valid and reports zero false positives without a confirmation step. |
| AI unable/valid/false-positive counts are all zero. | The report still presents a definitive validity conclusion; every `Ai 审计详情` field inspected is empty. |
| Severity chart contains 156 Medium and zero High/Critical. | The conclusion says to prioritize High findings and recommends pausing functionality without any High record. |
| Finding detail/recommendation fields are empty or generic. | No CWE, CVSS, source-to-sink path, exploit precondition or application reachability is supplied. |
| Task policy is `SAST-JavaScript` for a TypeScript/TSX project. | The report gives no evidence of successful TS/TSX parsing or authored-source coverage. |
| Scan input includes `node_modules` and `.next`, with duplicate dependency versions. | Dependency, generated-artifact and authored-source results were mixed, inflating the application-vulnerability count. |

These defects do not prove that every dependency is safe. They mean the PDF's statement "156 actually valid vulnerabilities" is not supported by its own evidence.

## 5. Formal grouped disposition

The grouping key is the exact vendor rule name plus the path class shown in section 2. It covers every parsed `3.n` record exactly once.

| Disposition ID | Findings | Count | Formal disposition | Required control |
|---|---|---:|---|---|
| VD-01 | Weak hash in `node_modules` | 80 | `NOT_CONFIRMED_AS_APPLICATION_VULNERABILITY` | Resolve package advisories with SCA; never edit vendored code. |
| VD-02 | Timer API in `node_modules` | 52 | `FALSE_POSITIVE_STRING_CODE_EXECUTION` | Keep AST sink check; reopen if a string callback appears. |
| VD-03 | `eval` in `.next` | 22 | `GENERATED_DEVELOPMENT_ARTIFACT` | Clean production rebuild and artifact scan. |
| VD-04 | YAML `load` in ESLint dependency | 2 | `NO_REMOTE_SOURCE_OR_PRODUCTION_REACHABILITY_SHOWN` | Upgrade vulnerable dependency versions through SCA. |
| **Total** |  | **156** | **All vendor records reconciled** |  |

This disposition closes the reconciliation of the old PDF only. It is neither a blanket risk acceptance for dependency CVEs nor a substitute for a current authored-source SAST/SCA run.

## 6. Rescan acceptance criteria

A replacement scan is acceptable only when all of the following are evidenced:

1. **Revision binding:** record Git commit, clean/dirty status, scanner/ruleset version, source manifest and archive SHA-256.
2. **Authored-source SAST scope:** build input from tracked and nonignored untracked candidate files (`git ls-files --cached --others --exclude-standard`), include TypeScript/TSX and security-relevant configuration, and exclude `node_modules/**`, `**/.next/**`, `dist/**`, `coverage/**` and other generated reports/artifacts.
3. **Parser integrity:** enable TypeScript/TSX rules; report zero scanner/tool/parse errors. A tool failure must return non-zero.
4. **Actionable output:** each retained finding includes rule/CWE, severity, exact file/line, source-to-sink evidence where applicable, exploit preconditions, triage decision and owner.
5. **SAST gate:** zero unresolved Critical/High; every Medium is fixed or has explicit, time-bounded security-owner acceptance. No untriaged finding is treated as passed.
6. **SCA gate:** scan production dependencies/lockfile separately; zero unresolved Critical/High and no untriaged advisory. Dependency scanner failure must return non-zero.
7. **Production-artifact gate:** delete the prior `.next`, perform a clean production Web build, and reject development eval/source-map signatures. Build artifacts are inspected separately from source and are never counted as authored files.
8. **Regression mapping:** the 156 old records remain mapped to VD-01 through VD-04. If `node_modules` or `.next` reappears in the authored-source result, reject the rescan for scope failure.

## 7. Reconciliation conclusion

The vendor PDF contains **0 confirmed authored-source vulnerabilities**, **134 third-party/dependency-tree findings**, and **22 generated development-artifact findings**. Its 156 findings are fully accounted for by the grouped dispositions above, but the report is not sufficient evidence for either a release block by itself or a security pass. Final R19B approval depends on current SAST, SCA, secrets, clean production-artifact and full regression gates, with external environment evidence reported separately.
