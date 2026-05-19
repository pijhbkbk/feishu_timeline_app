# File Upload Security R19

Generated: 2026-05-19

## Automated Coverage

| Test | Result |
|---|---|
| `apps/api/test/security/r19-file-upload-security.spec.ts` | PASS |
| `apps/api/src/modules/attachments/attachments.rules.spec.ts` | PASS |
| `apps/api/src/modules/attachments/attachments.service.spec.ts` | PASS |
| `pnpm test:e2e` project attachment upload using safe PDF sample | PASS |
| `pnpm playwright:test` review/material upload regressions using safe PDF samples | PASS |

## Controls Verified

- Extension whitelist: `.jpg`, `.jpeg`, `.png`, `.pdf`, `.docx`, `.xlsx`.
- MIME whitelist and extension/MIME matching.
- Magic-byte/content signature validation.
- Path traversal filename rejection, including encoded traversal and Windows path separators.
- Oversized file rejection.
- Dangerous browser/executable types rejected: `.php`, `.jsp`, `.asp`, `.html`, `.svg`, `.js`, `.exe`, `.sh`.
- Attachment response sets `X-Content-Type-Options: nosniff` and `Cache-Control: private, no-store`.
- SVG/HTML are not previewable.

## Findings

| Severity | Count | Status |
|---|---:|---|
| Critical | 0 | N/A |
| High | 1 | Fixed and retested |
| Medium | 0 | N/A |
| Low | 0 | N/A |
| Info | 0 | N/A |

## Current Acceptance

PASS. The High upload validation gap was fixed and retested.
