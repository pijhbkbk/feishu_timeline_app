# R25B / R26 Production Release Manifest

## Approval and ownership

- Product-owner approval: user explicitly approved R25B and subsequently
  instructed Codex to deploy all latest changes and merge them into `main`.
- Scheduled window supplied by the user: 2026-07-22 20:00–22:00 CST.
- Actual authorized execution: 2026-07-22 16:57–17:16 CST. The later explicit
  “现在将所有的最新改动全部上线” instruction superseded the earlier start
  time and the former 72-hour-before-main hold.
- Overall system owner and production application administrator: 李晓晨.
- Production owner: 李晓晨s.
- Rollback decision owner: 李晓晨h.
- Technical observation owner: 李晓晨j.
- Business acceptance owner: 李晓晨yw.
- Feishu administrator: 李晓晨f.
- Maintenance notice: required.
- Expected impact: several minutes of login or request interruption during
  service restart; no destructive database operation.

## Released identity

- Historical approved R25 runtime: `4aff07c83a6d63e3aeb3cc0b2e72033021ee74a5`.
- Historical R25 evidence commit: `1ea034ce9f822e21d6f3c4c60d0cc4b7e7e82669`.
- Final released R26 runtime: `8c1d3264cb4355c5db0551309e31073adc78df8d`.
- Candidate tag: `v1.1.0-rc.2`, pointing exactly to the released runtime.
- Release branch: `codex/r26-direct-feishu`.
- Previous production runtime / rollback commit:
  `7dd2243270c03399cd6da6cec41bf12eab68dd0b`.
- Stable tag: not created. `v1.1.0-rc.1` was not moved or deleted.
- Production host: `https://timeline.all-too-well.com`.

The Git evidence commit created after this manifest intentionally differs from
the production runtime commit: it contains release records only. Production
remains pinned to the exact R26 runtime above.

## Database and rollback artifacts

- Production custom-format backup:
  `/var/backups/feishu-timeline-db/20260722T085745Z/feishu-timeline.dump`.
- Mode / bytes: `0600` / `214244`.
- SHA-256:
  `1ff9e07a79c58c405f97ea3b4d97843b1e82d8be36113cba0c3199f58eb5a8c4`.
- `pg_restore --list`: PASS.
- Configuration rollback snapshot:
  `/var/backups/feishu-timeline-release/20260722T085825Z`.
- Snapshot contents: 8 files covering service, proxy and environment rollback
  state; sensitive values are not copied into this repository.
- Migration path: `prisma migrate deploy`, no reset and no seed.
- Applied production migrations: 16 → 18, pending 0.

## Final decision

`R25B_PRODUCTION_RELEASED / R26_PRODUCTION_RELEASED / RC2_EXACT_RUNTIME / MAIN_INTEGRATION_AUTHORIZED / STABLE_TAG_NOT_CREATED`
