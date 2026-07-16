# R24 SAST Report

Final commit: `d86c04e8c016a0241172fb7c608f55d8dfcca5c9`

## Results

| Check | Result |
|---|---|
| ESLint, zero warnings | PASS |
| TypeScript, Web/API/shared | PASS |
| Semgrep `1.169.0`, fixed container digest | PASS; 381 version-controlled candidate files; 0 findings |
| API/Web production builds | PASS |
| Prisma schema validate | PASS |
| GitHub Actions and deploy-script manual review | PASS after remediation |

Semgrep evidence is under `reports/security/r24/sast-final-d86c04e8/`. The final scan ran after the last application fix.

## Manual findings closed in R24

- The staging deploy path now scans API, Web, PostgreSQL, Redis and Nginx exact images before service activation.
- Infrastructure bases are pinned or locally hardened instead of relying on mutable vulnerable defaults.
- Nginx configuration releases force proxy recreation, preventing source configuration from drifting from the running container.
- Unsafe browser methods now enforce the configured same Origin at the API boundary.
- Upload rules reject dangerous inner extensions and filename markup/metacharacters.
- OAuth authorization endpoints and production callback URLs are restricted to approved exact values.

Final SAST status: `PASS`, with no open Critical or High code finding.
