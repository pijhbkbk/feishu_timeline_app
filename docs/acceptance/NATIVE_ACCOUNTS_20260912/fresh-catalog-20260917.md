# Fresh catalog component verification — 2026-09-17

Scope: host-only first-install business catalog. No production access, data export,
DNS change, native credential change, schema migration, dependency update or role
grant to a user. Start commit: `c33c1bd` in an independent `git clone --no-hardlinks`.

The existing demo seed's formal constants and calendar helper were extracted into
one source shared by the demo seed and the new CLI; demo users, projects,
departments and suppliers remain excluded from the new path. Extraction check
verified the constants and calendar helper byte-for-byte after removing `export`:

- Constants SHA-256: `c6cc531cb621afbd47bda9d8a03107fbea26204b32d91b57383a07104bc503b9`.
- Calendar helper SHA-256: `412e728a2eedc865d735fdc3fb8b539ce59aa00a8942581bbc5a778fa5271956`.
- Calendar years remain the existing 2026/2027 weekday defaults, not new official holiday data.

Executed in `/private/tmp/timeline-native-catalog-20260917` with Node 24.14.0,
pnpm 9.15.4, Prisma 6.19.3:

| Check | Result |
| --- | --- |
| Frozen offline install from populated task store | PASS; 388 packages, lockfile unchanged |
| Prisma client generation | PASS; existing local cache required sandbox permission |
| `tsc -p tsconfig.build.json` | PASS; compiled CLI present in API `dist/cli` |
| `tsc -p tsconfig.json --noEmit` | PASS |
| API lint | PASS |
| `initialize-catalog.spec.ts` | 3 PASS |
| `initialize-catalog.postgres.integration.spec.ts` | 15 PASS; 0 skipped |
| Compiled `node apps/api/dist/cli/native-catalog.js initialize` | Exit 0; complete fresh catalog |
| Same compiled command again on same synthetic database | Expected exit 1; generic failure, no database URL exposed |
| `git diff --check` | PASS |

PostgreSQL was the existing 14.24 linux/amd64 image
`sha256:3b36dd7df1337107cef7502b1e3e94c971483ae87498a9310d25c60fba08cfc9`.
The dedicated container `timeline-native-catalog-pg-20260917` bound only
`127.0.0.1:55449`, with disposable tmpfs data. All 37 committed migrations were
applied to synthetic template `native_catalog_test`. Each integration case cloned
and dropped its own generated `native_catalog_…` database. No production database
or the separate native-account acceptance database on 55439 was accessed.

Database tests verified all nine role mappings, all 18 workflow definitions,
template, dictionary count, parameter values, 730 default calendar rows, original
migration IDs/values/timestamps, no created accounts/credentials/projects/suppliers,
and exactly one initialization audit. They also verified repeat rejection,
simultaneous initialization, existing users/projects/attachments/notifications/
credentials/configuration/audit/suppliers, altered reference permissions, unknown
tables, incomplete migration receipts, rollback when the final audit insert fails,
and real PostgreSQL relation/advisory lock waits with competing writers.

The final test run took 4.90 seconds including 4.50 seconds of database tests.
This is component evidence only. It does not establish portable-image installation,
complete offline operation, restoration, deployed production identity, browser
acceptance or independent security review. The parent delivery must bind the
integrated immutable candidate and complete those separate checks.

## Independent bounded review — 2026-09-17

Reviewer: the separate portable-recovery agent. Reviewed catalog implementation
commit `1d8ff6d41e71fb202ef433c58c458c355a3dca2e` read-only in
`/private/tmp/timeline-native-catalog-20260917`, including the initializer, CLI,
complete seed extraction diff, unit tests and PostgreSQL integration tests.

No blocking finding was identified within this review's scope: the initializer
locks every Prisma application table together with the native-administrator
advisory lock; refuses populated business/account/configuration/audit tables and
changed migration reference rows; preserves migration IDs and permissions; and
writes the catalog and its audit record in one transaction. The new path creates
no users or user-role assignments. A populated restored database fails the same
fresh-install checks; the portable restore path does not invoke this CLI.

The reviewer independently executed a TypeScript AST extraction comparison of
the pre-change seed against `base-catalog.ts`. All eight declaration/function
bodies matched exactly: `baseRoles`, `defaultProcessTemplate`,
`rolePermissionMap`, `workflowNodes`, `projectStatusItems`, `systemParameters`,
`businessDivisionDepartments` and `buildWorkCalendarEntries`. The function's
`export` modifier was excluded from that comparison; initializer text was
otherwise compared without normalization. The extracted calendar years remain
`[2026, 2027]`.

The reviewer did **not** independently rerun the 15 PostgreSQL integration cases;
their PASS results above remain the component author's executed evidence. The
reviewer's separate preliminary portable installation did execute the compiled
catalog CLI successfully against a fresh synthetic database using application
candidate `13131ee5425017b31ccf77741798a8dc37dbc936`. That result is preliminary
installation evidence, not final-package or independent-machine restoration
acceptance. The later recovery attempt remains blocked by the separately recorded
schema-fingerprint mismatch; this review does not waive that check or establish
production or product acceptance.
