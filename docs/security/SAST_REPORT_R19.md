# SAST Report R19B

Generated: 2026-07-13T08:39:37Z
Commit: 63f9be6
Scope: 372 Git-indexed or nonignored untracked TypeScript/TSX and executable config sources
Scanner: `docker.io/semgrep/semgrep:1.169.0@sha256:2b33f46ba66cf8cc2ad59ccfa7d22951fd00c632c38f1339e84ec8e6e641a942`

## Command Results

| Check | Status | Raw Output |
|---|---|---|
| Candidate target manifest | PASS | reports/security/sast/targets.txt |
| Semgrep OWASP / JavaScript / TypeScript | PASS | reports/security/sast/semgrep.log |
| Semgrep finding summary | INFO | reports/security/sast/semgrep.txt |

Generated dependencies and build output are not scan inputs. The manifest is derived from
`git ls-files --cached --others --exclude-standard` and excludes `node_modules`, `.next`, `dist`, `build`, coverage,
generated directories, test reports, TypeScript build info and `next-env.d.ts`.

## Current Acceptance

PASS — scanner completed and no findings or scanner errors were reported.
