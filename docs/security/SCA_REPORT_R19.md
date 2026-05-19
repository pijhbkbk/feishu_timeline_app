# SCA Report R19

Generated: 2026-05-19T03:34:57Z
Commit: 4ce7e8a

## Command Results

| Check | Status | Raw Output |
|---|---|---|
| pnpm audit --audit-level high | PASS | reports/security/sca/pnpm-audit.log |
| osv-scanner --lockfile pnpm-lock.yaml | PASS | reports/security/sca/osv-scanner.log |
| trivy fs HIGH,CRITICAL | PASS | reports/security/sca/trivy-fs.log |
| trivy image feishu-timeline-api:latest | SKIPPED | reports/security/sca/trivy-image-api.log |
| trivy image feishu-timeline-web:latest | SKIPPED | reports/security/sca/trivy-image-web.log |

## Triage

- `pnpm audit --audit-level high`: PASS, no known High/Critical vulnerabilities.
- `osv-scanner --lockfile pnpm-lock.yaml`: PASS, no issues found.
- `trivy fs --severity HIGH,CRITICAL --ignore-unfixed .`: PASS, no High/Critical vulnerabilities.
- Docker image scans were skipped because local images `feishu-timeline-api:latest` and `feishu-timeline-web:latest` were not built in this workspace.

## Remediation Performed

- Upgraded Next.js, NestJS, Prisma, Playwright, Vitest and related transitive dependencies within the existing major-version ranges.
- Added pnpm override for `postcss` to remove the remaining OSV Medium advisory inherited through the lockfile.
- Did not delete or bypass the lockfile.

## Findings

| Severity | Count | Status |
|---|---:|---|
| Critical | 0 | N/A |
| High | 1 | Fixed by dependency upgrade and retested |
| Medium | 1 | Fixed by pnpm override and retested |
| Low | 0 | N/A |
| Info | 1 | Docker image scan pending until images are built |

## Current Acceptance

PASS_WITH_IMAGE_SCAN_GAP. Dependency and filesystem SCA pass; container image scan must be rerun after private-cloud images are built.
