# R24 SCA and SBOM Report

Final commit: `d86c04e8c016a0241172fb7c608f55d8dfcca5c9`

## Dependency and filesystem scans

| Scanner | Scope | Result |
|---|---|---|
| pnpm 9 audit | lockfile | TOOL_ERROR: registry legacy endpoint returned HTTP 410; failed closed |
| pnpm `11.13.1` audit | all 482 dependencies | PASS; all severities 0 |
| pnpm `11.13.1` audit | 221 production dependencies | PASS; all severities 0 |
| OSV Scanner `2.4.0` | `pnpm-lock.yaml` | PASS; 0 vulnerability results |
| Trivy `0.72.0` filesystem | all and production | PASS; 0 vulnerabilities |

The compatible pnpm audit and independent OSV/Trivy results close the pnpm 9 registry-tool incompatibility without treating its error as a PASS.

## Image remediation and final result

The first current-baseline image scan found vulnerable mutable infrastructure images:

| Initial image | Critical | High | Medium | Low | Final |
|---|---:|---:|---:|---:|---|
| PostgreSQL | 3 | 28 | 38 | 22 | 0 at every severity |
| Redis | 6 | 56 | 55 | 4 | 0 at every severity |
| Nginx | 2 | 35 | 44 | 26 | 0 at every severity |

The final five exact images all pass Trivy with no reported vulnerability at any severity. API and Web are tied to the final commit; PostgreSQL uses the hardened non-root runtime image; Redis and Nginx use clean pinned digests. Final evidence is under `reports/security/r24/image-sca-final-d86c04e8/`.

## SBOM

CycloneDX SBOMs were generated with Trivy for the final source and all deployed images:

| SBOM | Components |
|---|---:|
| Source | 222 |
| API | 438 |
| Web | 437 |
| PostgreSQL | 46 |
| Redis | 20 |
| Nginx | 72 |

Evidence: `reports/security/r24/sbom-final-d86c04e8/`, `reports/security/r24/sca/`, `reports/security/r24/osv/`, and `reports/security/r24/trivy-fs/`.

Final supply-chain status: `PASS`, Critical 0 and High 0.
