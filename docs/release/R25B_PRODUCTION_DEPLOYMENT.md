# R25B / R26 Production Deployment

## Execution

The exact `v1.1.0-rc.2` runtime
`8c1d3264cb4355c5db0551309e31073adc78df8d` was deployed to
`timeline.all-too-well.com` from `codex/r26-direct-feishu`. The release used the
existing systemd deployment topology, `RUN_SEED=no` and Prisma migrate deploy.
No production table was edited outside committed migrations.

Before deployment, production ran
`7dd2243270c03399cd6da6cec41bf12eab68dd0b`. A database archive and a protected
configuration rollback snapshot were created and verified before the runtime
changed.

## Result

- Remote tracked tree: clean.
- Remote runtime HEAD: exact `8c1d3264cb4355c5db0551309e31073adc78df8d`.
- API, Web, Nginx, PostgreSQL and Redis: active.
- API/Web unexpected restarts: 0/0.
- API build artifact identity was verified on the production host against the
  deployed tree; the raw digest remains in the operator transcript rather than
  this repository to avoid generic-key scanner ambiguity.
- Web build ID: `MDBEGk9HASQFJmd-4nHGc`.
- Migrations: 18 applied, 0 pending.
- Public `/api/health`: HTTP 200.
- Anonymous `/api/projects` and `/api/admin/audit-logs`: HTTP 401.

One initial post-restart connection probe and one TLS dashboard probe were
transient. The API/Web readiness probe passed on its second attempt, and a
bounded dashboard retry passed 5/5. No service restart, migration error or data
loss followed.

## Rollback status

Rollback was not triggered. The verified database archive, eight-file
configuration snapshot and previous commit remain available. The rollback
decision owner is 李晓晨h.
