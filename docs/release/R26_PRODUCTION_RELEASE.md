# R26 Production Release

R26 removes the intermediate login-choice page: the application login entry
now requests the Feishu authorization URL immediately, while `/login` remains a
compatibility route that automatically performs the same handoff.

## Provenance and verification

- Runtime/tag: `8c1d3264cb4355c5db0551309e31073adc78df8d` /
  `v1.1.0-rc.2`.
- Full local gate: lint, typecheck, Web 83/83, API 223/223, Web/API build,
  Prisma validate and target Playwright 1/1 PASS.
- Gitleaks v8.30.1: current tree and full Git history 0 findings.
- Production deployment, backup, migrations, service identity, real OAuth,
  authorized progress/attachment smoke, audit evidence and logout all PASS.
- Stable release tag: not created.

Detailed production evidence is recorded in the R25B manifest, deployment,
acceptance, observation and rollback documents in this directory.

`R26_PRODUCTION_RELEASED / V1.1.0-RC.2 / MAIN_INTEGRATION_AUTHORIZED`
