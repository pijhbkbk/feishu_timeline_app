# Fresh installation business catalog

This host-only command is compiled into the production API image. It has no HTTP
route, creates no users or passwords, and loads no demo seed or identity provider.
The shared `base-catalog.ts` preserves the existing seed's approved role permission
mapping, 18 workflow definitions, process template, project status dictionary,
system parameters, and weekday calendar defaults. The calendar covers 2026 and
2027 and is **not** an official holiday calendar; administrators can manage the
existing calendar configuration after installation.

With the API and other writers stopped, configure the explicitly selected new
database through protected environment configuration, then run in order:

```text
prisma migrate deploy --schema prisma/schema.prisma
node dist/cli/native-catalog.js initialize
node dist/cli/native-account.js initialize --username <chosen-name> --name <chosen-display-name> --password-file <protected-file>
```

The portable installer supplies the migration runtime and protected environment;
the catalog itself only needs `DATABASE_URL` and the compiled API dependencies.
Do not put the database URL or password in an operator transcript. The command
deliberately does not load `.env.example` or connect to Redis or external services.

Only a pristine migrated database is accepted: the exact auditor role, its three
permissions and six governed business divisions must match the migration baseline;
every other application table must be empty. Their existing IDs and timestamps
are preserved. An unknown schema, incomplete migration, existing account, audit,
business data or configuration causes an error without writes. The operation
takes the native administrator advisory lock and write-conflicting locks on all
application tables, then writes the catalog and one host initialization audit in
a single transaction. Concurrent writers complete before the empty-state check or
wait until catalog commit. Failure rolls back the entire transaction.

**Never run catalog initialization or administrator initialization after restoring
a business backup.** Restore retains its catalog, accounts, permission mappings
and audit facts. Re-running this command is intentionally an error; it is not an
upgrade, repair, reseed, override or reset tool. No `--force` option exists.

Focused tests:

```text
pnpm --filter @feishu-timeline/api exec vitest run src/modules/catalog/initialize-catalog.spec.ts
pnpm --filter @feishu-timeline/api exec vitest run src/modules/catalog/initialize-catalog.postgres.integration.spec.ts
```

The integration suite only runs when `NATIVE_CATALOG_TEST_DATABASE_URL` explicitly
names the fully migrated synthetic `native_catalog_test` database on
`127.0.0.1:55449`. It clones temporary databases within that isolated PostgreSQL
instance and drops only those test-created databases. An unset variable skips the
suite and must not be reported as a database test pass.
