# SAST Report R19

Generated: 2026-05-19T03:45:47Z
Commit: 4ce7e8a
Scope: apps, packages

## Command Results

| Check | Status | Raw Output |
|---|---|---|
| pnpm lint | PASS | reports/security/sast/pnpm-lint.log |
| pnpm typecheck | PASS | reports/security/sast/pnpm-typecheck.log |
| Semgrep OWASP / JS / TS | PASS | reports/security/sast/semgrep.log |
| Semgrep text summary | INFO | reports/security/sast/semgrep.txt |
| Dangerous pattern grep | INFO | reports/security/sast/dangerous-patterns.txt |

## Triage

| Item | Severity | Result |
|---|---:|---|
| Semgrep findings | Info | 0 findings. |
| Redis `multi().get().del().exec()` | Info | Redis transaction for one-time OAuth state consumption; not shell execution. Accepted. |
| Cookie `httpOnly` / `sameSite` / `secure` locations | Info | Positive security controls in `AuthService`. Accepted. |
| `node:child_process` in test runners | Info | Limited to local E2E/Playwright orchestration scripts. Accepted. |

## Findings

| Severity | Count | Status |
|---|---:|---|
| Critical | 0 | N/A |
| High | 0 | N/A |
| Medium | 0 | N/A |
| Low | 0 | N/A |
| Info | 3 | Accepted |

## Current Acceptance

PASS. No SAST Critical or High findings remain after triage.
