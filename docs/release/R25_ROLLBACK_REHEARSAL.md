# R25 Staging Rollback and Forward-Recovery Rehearsal

## Scope and safety

- Environment: isolated staging only.
- Current candidate: runtime commit `f00703ac7834837f9ad573bc11d779a5caa7c02f`, image tag `r25-f00703ac7834`.
- Previous known stable application: `d86c04e8c016a0241172fb7c608f55d8dfcca5c9`, image tag `d86c04e8c016`.
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

NOT RUN. The formal rehearsal was correctly held behind the authenticated endurance gate, which did not pass after two executions. Staging remains on the exact R25 candidate runtime; production is unchanged.

| Gate | Result |
|---|---|
| Rollback prerequisites | PASS |
| Rollback to previous version | NOT RUN |
| Previous-version functional smoke | NOT RUN |
| Forward recovery to R25 | NOT RUN |
| Migration compatibility | NOT RUN |
| Data loss | NOT ASSESSED; no rollback operation was performed |
| Complete elapsed time | NOT RUN |
