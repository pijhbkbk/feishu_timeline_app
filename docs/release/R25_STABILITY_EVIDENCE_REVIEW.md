# R25 Stability Evidence Review

## Decision

`R23_FORMALLY_PASSED / HISTORICAL_ENDURANCE_NOT_REUSABLE_AS_R25_FINAL_EVIDENCE / RERUN_REQUIRED`

R23 was formally marked `PASSED` by R23E. Its authoritative authenticated endurance tests ran on application/staging commit `d6d4962f88dbb5b297d54c9f27326f3bf5616ec7`: 10 VU × 30 minutes and 5 VU × 2 hours both passed, followed by the same-commit R23E regression and logout/session-store cleanup.

The R23 endurance commit is an ancestor of the frozen R25 runtime commit `f00703ac7834837f9ad573bc11d779a5caa7c02f`, but it is not the same runtime. R25 therefore will not reuse the old endurance measurements as final release evidence.

## Exact revisions

| Field | Value |
|---|---|
| R23 endurance application/staging commit | `d6d4962f88dbb5b297d54c9f27326f3bf5616ec7` |
| R23 evidence commit | `075c25314dc30c53aa560fc0cf98fa6bf93aa49e` |
| R25 frozen runtime commit | `f00703ac7834837f9ad573bc11d779a5caa7c02f` |
| R24B security evidence commit | `72adbc3ad2ece6dc03b82509aa0af311c55f7147` |
| Release-gate branch | `release/r25-final-gate` |
| Ancestry | PASS; R23 endurance commit is an ancestor of the R25 runtime commit |

The R24B evidence commit changes security evidence and two scan/capture scripts relative to `f00703a`; it does not change application runtime source. Runtime images must still be built from and labeled with `f00703a`, not the evidence commit.

## Runtime changes after R23 endurance

The diff from `d6d4962` to `f00703a` modifies 105 files and includes the following release-relevant areas:

| Area | Changed | Summary / R25 implication |
|---|---:|---|
| OAuth and identity | Yes | Exact callback validation, null-safe callback handling, removal of implicit full access, real-role display and cross-application Feishu identity reconciliation. Real OAuth/session and endurance must be rerun. |
| Session and Cookie boundary | Yes | Session authorization behavior changed through Plan A and identity reconciliation; auth constants/tests changed. Logout, old-session invalidation and Cookie attributes must be rerun. |
| Origin / CSRF / CORS | Yes | Same-origin middleware was added for unsafe methods. Authenticated reads/writes and negative Origin/CORS checks must be rerun. |
| File upload | Yes | Filename markup, inner/double extension and upload rule hardening changed attachment behavior. Upload security and business paths must be rerun. |
| Nginx / proxy | Yes | Version disclosure suppression, security headers and forced proxy recreation changed the request path. Staging regression and load latency must be rerun. |
| API authorization/business rules | Yes | Project, task, workflow, review, fee, color-exit and audit authorization changed under Plan A. Core flow, IDOR and sustained authorized traffic must be rerun. |
| Database | Yes | Migration `20260716160000_apply_plan_a_role_permissions` and seed changes exist; final migration deploy, backup/restore and rollback compatibility must be proven. |
| Redis | Configuration/runtime boundary changed | Redis image/runtime hardening and authenticated-session use remain relevant; session cleanup, memory and queue behavior must be measured. |
| Base/runtime images | Yes | PostgreSQL hardening and pinned Redis/Nginx images changed the deployed stack; immutable image provenance, Trivy and endurance must be rerun. |
| Audit logs | Yes | Audit permission changed to `audit.read`; pagination implementation remains but must be exercised under the current permission model. |
| Web security headers | Yes | CSP middleware now covers `/favicon.ico`; final headers/security smoke must use the current image. |

## Historical R23 result retained for context

| Profile | Result | Requests | HTTP p95 | Error / 5xx / unexpected auth | Restarts / deadlocks |
|---|---:|---:|---:|---:|---:|
| 10 VU × 30m | PASS | 17,997 | 96.776 ms | 0 / 0 / 0 | 0 / 0 |
| 5 VU × 2h | PASS | 29,658 | 80.758 ms | 0 / 0 / 0 | 0 / 0 |

These values prove the earlier R23 candidate was stable. They do not satisfy the R25 same-runtime rule.

## R25 required action

On exact staging runtime `f00703ac7834837f9ad573bc11d779a5caa7c02f`, R25 must run both:

1. 10 VU × 30 minutes authenticated load.
2. 5 VU × 2 hours authenticated endurance.

Both profiles must use the controlled repository-external real OAuth session workflow, operate only on `R25-UAT-*` test data, collect integrity/resource evidence, invalidate the server session at the end, destroy local authentication material, and pass every R25 threshold before release can be recommended.
