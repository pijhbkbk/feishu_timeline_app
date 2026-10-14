# New-source applicability review — 9ed0502

Review target: **`9ed0502b9e97e543dc5beea00998b5edc0bb0e67`**, tree `492c42d17720c1569b7d0373c68cb93ee327ae67`. Comparison base: **`68acd102bc8f88fa7bf88aea099ccc7d74cbde28`**. This is a new-source review; historical 68acd runtime reports and the two stopped backup attempts remain unchanged.

## Exact change and byte equivalence

The full committed diff contains only `apps/api/prisma/migrations/202610130003_inspection_facts/migration.sql` and `docs/EXECUTION_LEDGER.md`. Migration 003 gains exactly one final LF, restoring the retained authored 8551-byte file. Its old/new SQL after removing trailing whitespace is identical. The reviewer compared committed Git objects, rather than relying on worktree cleanliness or abbreviated hashes.

| Compared group | Tracked files | Result |
| --- | ---: | --- |
| webEntireTrackedTree | 436 | Exact Git blob and mode equality |
| apiExecutableAndTests | 420 | Exact Git blob and mode equality |
| prismaSchema | 1 | Exact Git blob and mode equality |
| sharedPackages | 3 | Exact Git blob and mode equality |
| dependencyLocksManifestsPatches | 9 | Exact Git blob and mode equality |
| toolsAndBuildScripts | 189 | Exact Git blob and mode equality |

The complete per-file Git modes/blob identities and 138 previously selected SHA-256 source bindings are in `candidate-9ed0502-source-applicability.json`: 137/138 bindings are byte-identical; only migration 003 changes. No application, authorization, CAS, idempotency, image isolation, quota, dependency, configuration or schema logic changed. The current worktree has a separate uncommitted blocker-evidence document; that document is not part of the immutable source comparison.

## Authentic applied migration bytes

The preserved diagnostic is `var/light-truck-sheets-02-04/backup-migration-checksum-diagnosis.json`, SHA-256 **`653b214e1917254c4c4f502955295759b440b79142cb39e43e86174d309a3b0f`**. Each of its five stored database checksums exactly matches the new committed migration file below; every receipt has `finishedAt` and no `rolledBack` value. This reviewer read that recorded sanitized evidence, not the database or any credentials.

| Migration | Bytes | New committed SHA-256 = recorded DB checksum |
| --- | ---: | --- |
| 202610130001_person_profiles | 1772 | `10de1609f9fb3291081bb892562d1134e73c1b90d61a3692bcbbf4125be48a25` |
| 202610130002_sheet_images | 3250 | `39e12d0699f4ddd75513149410800b11ee57b506d213160dedd70100d56c86ba` |
| 202610130003_inspection_facts | 8551 | `32452ba385087b9affad18c64d7a5ce232b02479ba16240ec4116da61b89d7ca` |
| 202610130004_sheet_import_source | 137 | `06cd9dfe52e4e4a2f5f9707f45211c3f36fdaa1d827397e2accf13ae9a10e041` |
| 202610130005_person_import_identity | 153 | `97724588c540bc8a4d09a89475685958c90c2d5d61d109c3e95ebd92cf2b3a4c` |

Migration 003 was first committed at `2173ac425173dfc9cfdcd0bf0577b06a1db4130e` with one fewer final LF than the authentic retained draft already applied to the isolated DB. There was no later committed SQL edit through 68acd. This reconciliation restores the exact recorded applied bytes; it does not rewrite a database receipt, change DDL, introduce a new schema operation or relax the checksum gate. The diagnostic's historical `artifactChecksum` and `match:false` for 003 correctly describe the old artifact and must remain as recorded; the new equality compares its `databaseChecksum` to 9ed source.

## Evidence that remains applicable by scope

- **Web 563 PASS** from `autosave-editor-web-tests.log:9-10`, with its typecheck/lint results: all Web source, tests, configuration, shared code and dependencies are identical. This is reuse of actual 68acd checks, not an assertion that the tests were newly executed at 9ed.
- **API 1621 PASS / 185 SKIPPED** from `compound-full-tests-authorized.log:146-147`: executable source/tests/dependencies/schema are identical. Skipped tests remain skipped and are excluded from the pass count. The older failed `full-tests-fixed.log` is not the successful API evidence.
- **28 actual PostgreSQL test passes** in eight recorded logs: persons 5, person import 3, statistics snapshot 1, facts 8, participant enablement 3, images 3, inspection images 2, command replay 3. All 48 migrations applied in those test databases. The SQL execution semantics are unchanged by restoring a final LF, so behavioral results remain applicable. Those old test databases' migration receipt bytes are not rebranded as the new artifact's receipt proof; the exact five-runtime-receipt comparison above is separate.
- **68acd browser results** remain evidence of unchanged application behavior, keeping their original runtime ID and URL `http://127.0.0.1:3380`: interactions `1791879087619100000` (8 PASS, four whole-page reopen checks), image T11 `1791879174696452000` (PASS), native image clipboard `1791879230973373000` (PASS), 50 rapid color inputs `1791878845087386000` (PASS), and full performance `1791879554116987000` (PASS). Individual scope and exclusions remain in `FINAL_68ACD_READ_ONLY_REVIEW.md` and its manifests. None proves a 9ed browser actually loaded or a restored database was used.

All twelve reused unit/PG log hashes are bound in the new manifest. Prior independent-review author boundaries still apply: this reviewer authored some fixes, including autosave and backup response framing; inspect_validation provided independent review of those changes. Source applicability does not turn an author's self-check into independent review.

## New gates and preserved limitations

Root reports the new-source Prisma validation passed. This reviewer has not independently bound a separate new-validation log, so it is identified as parent-reported. The new immutable build, actual matching-source backup/restore, restart and final readback require their own final results and artifact/runtime bindings; this source review does not grant them PASS in advance.

The first backup attempt failed on multiline response framing. The second stopped on the genuine old artifact / applied migration checksum mismatch before dump or target creation. Both remain in the blocker history. The framed-response unit regression and authentic-byte reconciliation are specific diagnosed changes for a separately documented new gate, not a silent third retry or retroactive success of the old attempts.

No DB, restore, build, browser, service restart, production operation or formal-repository write was performed for this review. Production, main, tags and product-owner acceptance remain unclaimed. Restored rows/schema/object equality and restarting the original application must not be represented as an application login against the restored database. The historical first-click performance failure's exact cause remains unknown; later first-ready diagnostics and successful bounded tests do not establish a Steady lifecycle dependency or a proven cause.

**Conclusion:** no new application/security regression is introduced by this exact source delta. The old behavioral checks are reusable within the explicitly unchanged scope. The migration byte mismatch is reconciled in committed source and matches all five recorded receipts; actual new-artifact build/recovery/readback success is a separate gate.

## Subsequent actual existing-restore read-only verification

The new 9ed artifact's actual backup created a dump, the fixed fresh database `light_truck_sheets_restore_20261013_xe7b2ca498d31`, and both object copies. Its original strict schema-string gate then **failed**, because PostgreSQL re-parsed one constant-array cast in `sheet_images_layout_check`. That original `failure.json` remains unchanged, SHA-256 `d31c686958649247e6de6d13cf2765327772b3b2552d21c48818309f1344d0f8`. It is not rewritten or relabeled as a successful original strict gate.

The separately reviewed, narrowly scoped verifier then executed against those already-existing databases and objects, **without re-running restore or creating another target**. Actual evidence: `/private/tmp/light-truck-sheets-backup-evidence/light_truck_sheets_restore_20261013_xe7b2ca498d31/existing-restore-readonly-verification.json`; SHA-256 **`a1f04c4598104703e3e8823691a02602f689c8cf191e1a4cbb1adf6c73d64364`**. It records **PASS** from `2026-10-13T08:40:00.812240+00:00` to `2026-10-13T08:40:04.313699+00:00`, exact source commit 9ed and verifier SHA-256 `10348992c4094698f242a23cd943d31ce3c6a3b54a6abac7755b00e33a79ea9d`. This reviewer read and checked that report, rehashed the unchanged verifier and original attempt/failure/dump, and independently checked its internal counts/equality and migration hashes against the 9ed source binding. No new DB execution was performed by this reviewer.

- All **68 public tables** have exactly equal complete-row fingerprints and counts. Both database snapshots were reread without changes during verification.
- Catalog coverage: **252 constraints, 304 indexes, 880 columns, 266 enum labels**. Original source/restored schema hashes remain distinct: `4f559c3da208616855fe9a92de33a81439d4ce137d47e283cd06f53ac67f1fe9` and `4edfafb4d3b981b8f61c5165d52abf93e81c927ea9f7d8e22af13ff74d6bf513`. The report retains both complete differing definitions. Only the two exact full definitions of the named image layout check are canonicalized; all flags, bounds, mode values and every other catalog value remain strict. Both normalized hashes equal `4f559c3da208616855fe9a92de33a81439d4ce137d47e283cd06f53ac67f1fe9`.
- All **five migration receipts** exactly match the new artifact SQL SHA-256 values. No receipt or DDL was modified by this verification.
- **136 objects** (1,682,771 bytes) match across source, backup and restored directories. All **112 live CLEAN attachment references** have stored checksums and matching bytes, and live image relationships are valid. Object inventory hash: `ecfe23dc62c2d3a9484320be3c30f89936685b4b2c567c21c32f588a4d59b565`.
- The original dump remains 1,778,378 bytes, SHA-256 `8bfcddfb3f4c0846ac5e300d3c61eb3bf117f4b247f1f62c8b4fc14c9721cfec`. The target retains zero PUBLIC database grants.

This is a PASS for **current existing source/restored data and object equality with one explicitly recorded catalog equivalence**. It does not reconstruct the original exported snapshot baseline, does not establish byte-for-byte equality of original schema strings, and does not prove application login or operation against the restored DB. `originalExportedSnapshotBaselineReconstructed`, `applicationSwitchPerformed` and `restoredApplicationLoginTested` are all explicitly false. Prior framing/checksum/strict-catalog failures remain in the record.

The 9ed fresh-context application readback was still running when this addendum was written; its outcome remains separate and is not granted PASS here. Machine-readable bounded evidence review: `candidate-9ed0502-existing-restore-review.json`.

## Later final-readback status: incomplete at 390 photo loading

Actual 9ed readback `1791884341445594000` ended incomplete/failed after persons, inspection and production proof records and color's wider viewport checks. The asserted 390 photo thumbnail genuinely failed with `ERR_NETWORK_IO_SUSPENDED`; another image had the same network error, and two other thumbnails hit `DOWNLOAD_PER_ACTOR_CONCURRENCY_LIMIT` (Retry-After 1). This is not a completed final browser readback. The original run and four console errors remain retained. Current product cache intentionally holds failed reads for explicit normal UI retry; the failed harness did not perform that recovery. A narrowly scoped follow-up may verify recovery without changing source, weakening quotas or repeating a full blind run. Host sleep is not proven from this trace. See `final-readback-1791884341445594000-thumbnail-diagnosis.md` and its JSON for exact source/network evidence. The existing-restore read-only PASS above remains a separate valid result and does not override this unfinished UI gate.

## Completed final 9ed fresh-context readback

The final actual run `1791938988977234000` completed **1 PASS (51.2s)** on `http://127.0.0.1:3380`, runtime `9ed0502b9e97e543dc5beea00998b5edc0bb0e67`. This later result closes the scoped fresh-context readback and four-width layout gate; earlier failed runs remain preserved. The unchanged executed harness is byte-identical to the independently reviewed phase proposal, SHA-256 `5fbd2e904f9f98e7fbb52f0676999dcf14acc29fd571f8d82c5f34b50d9ea50c`. The proof SHA-256 is `de356634577dba805b458fe4534feb09fb00505e7a52553df6c309047946ef60`; complete bindings and screenshot paths are in `candidate-9ed0502-final-readback-review.json`.

There are **five proof groups**: five stable personnel profiles; the locked inspection activity with 2 occurrences/4 measurement groups/12 readings/3 photos and unchanged linked monthly result; six production facts with totals 26 and 100 and unknown distinct from zero; two color IDs; and responsive color layout. Every reopened module retains unchanged facts/metadata. The normal color reopen phase decoded **all 19 owned images once**, preserving every ID. Each width **1440, 1280, 1024 and 390** then retained all 19 IDs and decoded a representative image, with the same selected note/base/record/revision, one main navigation and no outer-page overflow. It does not claim all 19 images were simultaneously visible or decoded at each width.

The final proof and events agree: **0 business writes**, source-89 hash unchanged at `959bc8c8bbc53318f9ff743d9ed4938acb3b270230f25018b10377e0296d5961`, empty blocked/page-error/console-error lists, and **236 browser API responses all 200** (235 GET plus one normal login POST), including **44 thumbnails**. All 33 PNG artifact paths and dimensions were checked. This reviewer visually inspected the actual 390 full-page/photo screenshots and 1440 full-page image; they show the live table, preserved selected row and actual loaded photos. Other screenshot paths/hashes were verified without claiming an additional visual inspection of every frame.

Runtime/API/Web identity and ordinary approved local non-admin authentication are enforced by the passed harness assertions: `/api/health` and `/build-info` must each return 200 and runtimeCommit=9ed before the module steps. Those reads use page.request before trace recording starts, so their raw bodies are not present in the saved browser events/trace; this review cites the executed assertions rather than claiming independent inspection of nonexistent payloads. No tracked app/API/shared/lock/patch/build-script difference from 9ed was found in the bounded final source recheck.

No unresolved mandatory product/test failure was identified in this reviewed final-readback scope. The two earlier readback failures are not erased; the new fresh run does not prove an OS-sleep cause or that manual retry was performed in the old session. The source/data/object recovery result and application restart readback remain distinct: the application still uses the original isolated runtime DB, and restored-DB application login and original-exported-snapshot reconstruction remain untested.

**Overall status must not be relaxed to ACCEPTANCE=PASS.** The task's explicit lines 311–312 require **ACCEPTANCE=NOT_FULLY_VERIFIED** while **SYSTEM_IME=NOT_VERIFIED**, even when implementation and all other listed local paths pass. Office remains the disclosed partial supplementary check. IMPLEMENTATION=COMPLETE may coexist with that verification limit; product-owner confirmation remains outstanding and no production/main/tag change is implied.
