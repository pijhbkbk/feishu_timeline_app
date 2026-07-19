# R25A Final Gate Report

## Decision

`R25A_PASSED / R25_PASSED / R25-ADMIN-001_FIXED_RETEST_PASS / READY_FOR_PRODUCTION_APPROVAL`

R25 is release-gate complete on the single application runtime commit
`4aff07c83a6d63e3aeb3cc0b2e72033021ee74a5`. Work stops at the production
approval boundary. No production deployment, production write, `main` merge or
stable tag was performed.

## Revisions and artifacts

| Field | Value |
|---|---|
| Base runtime | `6d24378168fd144e539b0e99f975b918b06e37a5` |
| Final application runtime | `4aff07c83a6d63e3aeb3cc0b2e72033021ee74a5` |
| Runtime code commit | `4aff07c83a6d63e3aeb3cc0b2e72033021ee74a5` |
| Recovery-tool commit | `c7e9a2a` (does not change API/Web runtime) |
| Release branch | `release/r25-final-gate` |
| Staging tag | `r25a-4aff07c83a6d` |
| Candidate tag | `v1.1.0-rc.1` after the separate evidence commit |

The exact staging application artifacts were built from a detached clean
worktree with `RUN_SEED=no`:

| Component | Image ID / digest |
|---|---|
| API | `sha256:61850ba3a0ba359590d0888788c0b1651aa5363f2c25aa61224d921279396c35` |
| Web | `sha256:55db7b29114154cb66cc3baf564768e4783b5a1f893b180511c14c640d8836cc` |
| PostgreSQL | `sha256:79d00f6f20b38d93501752f3359b84849d02cc493190c17060fb9f1d925a6a88` |
| Redis | `sha256:6ab0b6e7381779332f97b8ca76193e45b0756f38d4c0dcda72dbb3c32061ab99` |
| Nginx | `sha256:ec664813a30459a8e7176315268a623f6b31abc370eeac51c7de81cd4ec4d451` |

API and Web OCI revision labels equal the final runtime commit. All five
services were healthy, 18 migrations were applied with none pending, and the
deployment did not seed staging.

## Audit selector and functional closure

The product label remains `审计与异常`; the page title remains `审计日志`.
Navigation, page, filters, table, rows, paging, detail, error, empty and retry
states use stable test IDs. The formerly racy marker assertion now waits for the
first matching row to be visible before checking that the count is positive.

- Target Playwright: `3/3 PASS` in 26.0 seconds.
- List API: HTTP 200; database-bounded pages 25/50/100; maximum 100; stable
  ascending/descending `createdAt + id` order; composite filters passed.
- Detail API: HTTP 200; list/detail IDs matched; recursive redaction passed.
- Invalid inputs: SQL/XSS inputs remained inert; overlong keyword, page 0,
  pageSize 101, invalid sort and invalid date returned 400.
- Real administrator UAT: navigation, filtering, paging, detail, refresh,
  error recovery and 390 px layout passed with no unexpected console, page or
  network error.
- Anonymous list access returned 401. A deterministic ordinary viewer received
  403 for page-related list/detail/project/actor attempts; its temporary session
  was destroyed.
- Management UAT persisted `R25A-MGMT-20260719`, the material-gap improvement,
  responsible department, due date and workflow-rule flag, and verified the
  corresponding redacted audit detail.

## Targeted security

Only the authorized isolated staging origin and the added audit routes were
actively tested. Production and Feishu platform domains were excluded.

| Gate | Result |
|---|---|
| Semgrep | PASS; no finding/scanner error |
| Gitleaks candidate tree/history | PASS; 0 findings |
| workspace and production dependency SCA | PASS |
| exact five-image Trivy | PASS; no reported vulnerability |
| security headers | PASS on the standard application route set |
| authenticated low-risk ZAP audit smoke | PASS; Critical/High/Medium/Low/Info `0/0/0/0/0` |
| permission, IDOR, input and redaction probes | PASS |

ZAP used an ephemeral in-memory proxy within staging. No cookie, token,
Authorization value, OAuth code, App Secret or storage state was exported to a
report or repository file. The proxy and its session were destroyed.

## Same-runtime endurance

| Profile | Result | Requests/checks | Read/write p95 | Audit list/detail p95 | Error/auth/5xx | Recovery/integrity |
|---|---|---:|---:|---:|---:|---|
| 10 VU × 30 m | PASS | 17,189 / 17,189 | 142.933 / 48.355 ms | 184.769 / 24.440 ms | 0 / 0 / 0 | no sustained growth; restart/deadlock/duplicate/queue 0 |
| 5 VU × 2 h + 5 m idle | PASS | 34,351 / 34,351 | 144.526 / 39.108 ms | 180.243 / 20.970 ms | 0 / 0 / 0 | memory +7.855%; restart/deadlock/duplicate/queue 0 |

The two-hour profile completed 34,348 iterations, including 4,524 audit-list
and 639 audit-detail reads, 3,496 draft writes and 1,750 progress writes. Peak
database connections were 18; slow queries, runtime 5xx, uncaught/unhandled
errors and lost/duplicate active workflow state were all 0.

## Full regression

```text
pnpm lint                                          PASS
pnpm typecheck                                     PASS
pnpm test                                          Web 83/83; API 223/223
pnpm --filter @feishu-timeline/web build           PASS
pnpm --filter @feishu-timeline/api build           PASS
pnpm --filter @feishu-timeline/api prisma:validate PASS
pnpm test:e2e                                      PASS
pnpm playwright:test                               55/55 PASS (6.9m)
```

The complete browser suite includes OAuth boundaries, workbench, project
cockpit, the 18-step workflow, progress, legal upload, steps 12/13/17/18,
retrospective and the administrator audit workspace.

## Backup, restore, rollback and forward recovery

The staging custom archive was 4,830,319 bytes. Its SHA-256 was verified, its
catalog was readable, and it restored into a uniquely named temporary database.
Source and restored counts matched for 18 migrations, 11 projects, 110 workflow
tasks, 4 attachment metadata rows, 8 reviews, 36 monthly tasks, 1 color-exit row
and 63,211 audit rows. The first 50 stably ordered audit IDs had the same hash
and no duplicate. The temporary database was destroyed.

Rollback to `6d24378168fd...` and forward recovery to `4aff07c83a6d...` each
completed in 25 seconds. Health, core pages, static assets and database
compatibility passed on the prior version; forward recovery restored the exact
API/Web OCI revisions. Counts and the 100-row audit fingerprint remained
identical, so data loss and audit loss were 0. The rehearsal also fixed two
non-runtime tool defects: container stdin for `pg_restore --list` and complete
release-state provenance preservation during swaps.

## Final staging UAT and cleanup

- Employee: workbench/task → real progress → legal PNG material → start and
  submit; the next backend-controlled operation was generated.
- Project manager: risk board showed 8 risk projects and exposed the stalled
  node, owner, blocker and expected resolution.
- Administrator: `审计与异常` → action/project filter → page 2 → redacted
  detail passed after forward recovery.
- Management: lifecycle duration, stage comparison, material gap, improvement
  measure and its audit record remained readable after forward recovery.
- Real logout completed. A subsequent protected audit-page request showed
  `请先登录`; old-session access was rejected.

One real Feishu account was used for interactive positive paths. Deterministic
identities covered negative roles and IDOR; no nine-real-account claim is made.
All ephemeral authentication/proxy material was destroyed. Product defects are
P0/P1/P2/P3 `0/0/0/0`.

## Evidence locations

- `docs/release/R25_COMBINED_GATE_REPORT.md`
- `docs/release/R25_STAGING_UAT.md`
- `docs/release/R25_STABILITY_EVIDENCE_REVIEW.md`
- `docs/release/R25_BUILD_PROVENANCE.md`
- `docs/release/R25_BACKUP_RESTORE_REHEARSAL.md`
- `docs/release/R25_ROLLBACK_REHEARSAL.md`
- Git-ignored `test-results/r25a/`
- Git-ignored `test-results/r25-final/10vu-30m/R25A-10VU-4aff07c-20260719/`
- Git-ignored `test-results/r25-final/5vu-2h/R25A-5VU-4aff07c-20260719/`

## Handoff

R25 recommends entering the separate production-approval process. The product
owner must explicitly approve R25B, verify the candidate commit/tag and exact
image IDs, confirm the production backup/rollback window and authorize the
production deployment. This report does not grant that approval.
