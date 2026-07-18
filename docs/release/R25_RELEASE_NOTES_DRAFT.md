# R25 Release Notes Draft

## Candidate

- Proposed candidate: `v1.1.0-rc.1`; not created.
- Runtime application commit: `6d24378168fd144e539b0e99f975b918b06e37a5`.
- Status: `R25_BLOCKED`; this draft is not an approved release candidate, production release or stable release.

## Included capabilities

- End-to-end light-truck custom-color project lifecycle, workflow tasks and guarded review transitions.
- Project material upload/versioning/download with Unicode filenames and object-storage metadata separation.
- Progress updates, recurring monthly review records, risk views and lifecycle retrospective. The global administrator audit-log query surface is a known release blocker and is not claimed as complete.
- Real Feishu OAuth, server-side sessions, logout invalidation and H5/mobile layouts.
- Plan A authenticated-user authorization boundary with anonymous, disabled and locked-user rejection plus backend business-state gates.

## Security and reliability changes since R23

- Same-origin mutation guard, constrained CORS/OAuth configuration and hardened session/cookie handling.
- IDOR and workflow authorization enforcement in backend services.
- Upload filename, MIME and content-signature validation plus sandboxed download responses.
- CSP coverage for all served application paths, including favicon responses.
- Hardened, pinned container supply chain; restricted GCP SSH through IAP; separate formal and staging Feishu configurations.
- Same-runtime 10 VU × 30 m and 5 VU × 2 h authenticated profiles passed. R25 remains blocked because `/admin/audit-logs` is a placeholder and the authenticated global list endpoint is absent; see `R25_BLOCKER_REPORT.md`.

## Deployment notes

- Do not deploy these artifacts while R25 is blocked. After a future R25 pass, use only the immutable images and digests approved by the final combined gate report.
- Run `prisma migrate deploy` with `RUN_SEED=no`.
- Follow `R25_PRODUCTION_CHECKLIST.md`; production requires separate R25B approval.
