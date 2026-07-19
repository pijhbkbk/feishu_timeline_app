# R25 Combined Stability, Security and Release Gate

## Current decision

`R25_PASSED / READY_FOR_PRODUCTION_APPROVAL / PRODUCTION_NOT_YET_AUTHORIZED`

The final evidence chain uses application runtime
`4aff07c83a6d63e3aeb3cc0b2e72033021ee74a5`. `R25-ADMIN-001` is Fixed /
Retest PASS. No production deployment, `main` merge or stable tag occurred.

## Candidate identity

| Field | Value |
|---|---|
| base runtime | `6d24378168fd144e539b0e99f975b918b06e37a5` |
| final/runtime code commit | `4aff07c83a6d63e3aeb3cc0b2e72033021ee74a5` |
| staging tag | `r25a-4aff07c83a6d` |
| release branch | `release/r25-final-gate` |
| recovery tooling commit | `c7e9a2a` |
| release candidate tag | `v1.1.0-rc.1` after the evidence commit |

API/Web OCI revisions match the runtime commit. API, Web, PostgreSQL, Redis and
Nginx were healthy; 18 migrations were applied with 0 pending and
`RUN_SEED=no`.

## Gate matrix

| Gate | Result |
|---|---|
| target R25A Playwright | PASS, 3/3 |
| audit list/detail and invalid-input contract | PASS |
| real administrator UAT | PASS |
| non-admin/anonymous negative UAT | PASS, 403/401 |
| management retrospective UAT | PASS |
| targeted security | PASS, Critical/High/Medium/Low/Info `0/0/0/0/0` |
| 10 VU × 30 m | PASS, 17,189/17,189 checks |
| 5 VU × 2 h + idle | PASS, 34,351/34,351 checks, memory +7.855% |
| full quality regression | PASS, Web 83, API 223, E2E, Playwright 55 |
| backup/restore | PASS, checksum/counts/audit retention/cleanup |
| rollback/forward recovery | PASS, 25 s / 25 s, data and audit loss 0 |
| final employee/project-manager/admin/management staging UAT | PASS |
| real logout and auth cleanup | PASS |

Product defects are P0/P1/P2/P3 `0/0/0/0`. All test and UAT evidence that
depends on application behavior corresponds to the single runtime commit
`4aff07c...`; the later `c7e9a2a` changes only rehearsal tooling.

## Evidence and recommendation

The detailed, sanitized record is `R25A_FINAL_GATE_REPORT.md`, supported by the
stability, provenance, UAT, backup and rollback reports in this directory.
Git-ignored raw test results contain no exported authentication values and are
not part of the evidence commit.

Proceed only to explicit production approval. R25 itself does not authorize a
production write or deployment.
