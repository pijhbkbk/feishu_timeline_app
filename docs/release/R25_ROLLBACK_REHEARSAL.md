# R25 Staging Rollback and Forward-Recovery Rehearsal

## Scope and safety

- Environment: isolated staging only.
- Current candidate: runtime commit `6d24378168fd144e539b0e99f975b918b06e37a5`, image tag `r25-6d2437818502`.
- Previous immutable staging application: `437c0d881efa...`.
- PostgreSQL data volume and object-storage volume remain in place; no reset, seed or destructive migration command is permitted.
- Production is not changed.

## Planned proof

1. Record current service identity, migration state and source data counts.
2. Use the existing rollback state and immutable prior API/Web images.
3. Verify all five services, HTTP pages, API health and static assets.
4. Confirm the database remains readable and migrations are compatible.
5. Re-run the rollback entry to restore the exact R25 candidate images.
6. Verify candidate OCI revisions, service health, migration state and data counts.
7. Record rollback, forward-recovery and total elapsed time.

## Result

NOT RUN. Both authenticated endurance profiles passed, but the round stopped after the administrator UAT gate failed twice. Staging remains on exact runtime `6d24378`; production is unchanged.

| Gate | Result |
|---|---|
| Rollback prerequisites | PASS |
| Rollback to previous version | NOT RUN |
| Previous-version functional smoke | NOT RUN |
| Forward recovery to R25 | NOT RUN |
| Migration compatibility | NOT RUN |
| Data loss | NOT ASSESSED; no rollback operation was performed |
| Complete elapsed time | NOT RUN |
