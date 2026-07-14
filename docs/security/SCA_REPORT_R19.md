# Dependency SCA Report R19B

Generated: 2026-07-14T00:41:01Z
Commit: eb49f52
Scope: all workspace dependencies, with production dependencies also reported as a separate release gate

## Command Results

| Check | Status | Raw Output |
|---|---|---|
| `pnpm audit --audit-level low` | PASS | reports/security/sca/pnpm-audit-all.log |
| `pnpm audit --prod --audit-level low` | PASS | reports/security/sca/pnpm-audit.log |

Container-image SCA is a separate gate implemented by
`scripts/security/scan-production-images.sh`; it scans the exact images built by CI.

## Current Acceptance

PASS — neither the full workspace nor the production dependency graph has a reported vulnerability.
