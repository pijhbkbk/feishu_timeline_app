#!/usr/bin/env node
// Private operator evidence. Never print rows, credentials, or source values.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { createRequire } = require('node:module');
const { PrismaClient } = createRequire(path.resolve('package.json'))('@prisma/client');
const [mode, input, output] = process.argv.slice(2);
const db = new PrismaClient();
const read = file => {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const before = fs.fstatSync(fd); assert(before.isFile() && before.size > 0 && before.size <= 48 * 1024 ** 2);
    const bytes = fs.readFileSync(fd), after = fs.fstatSync(fd);
    assert(bytes.length === before.size && before.ino === after.ino && before.mtimeMs === after.mtimeMs && before.ctimeMs === after.ctimeMs);
    return { value: JSON.parse(bytes), sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
  } finally { fs.closeSync(fd); }
};
const save = value => fs.writeFileSync(output, JSON.stringify(value, null, 2), { flag: 'wx', mode: 0o600 });
const quote = value => '"' + value.replaceAll('"', '""') + '"';

async function snapshot(tx) {
  const tables = await tx.$queryRawUnsafe("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
  assert(tables.length > 50 && tables.length < 200);
  const result = {};
  for (const { tablename } of tables) {
    // Nullable additions have no old business meaning. Strip only these exact
    // fields while comparing every pre-existing row, including audit and auth.
    const ignore = tablename === 'inspection_objects' ? ['productionDate'] : tablename === 'inspection_occurrences'
      ? ['visualScores', 'manualRectification', 'rectificationDueDate', 'paintUnit', 'responsibleUnit', 'rectificationUnit'] : [];
    const projection = ignore.reduce((sql, key) => `(${sql} - '${key}')`, 'to_jsonb(t)');
    const count = await tx.$queryRawUnsafe(`SELECT count(*)::text AS n FROM public.${quote(tablename)}`);
    assert(Number(count[0].n) <= 100000, 'SNAPSHOT_ROW_BOUND');
    const hashes = await tx.$queryRawUnsafe(`SELECT md5(${projection}::text) AS hash, count(*)::text AS n FROM public.${quote(tablename)} t GROUP BY 1 ORDER BY 1`);
    result[tablename] = Object.fromEntries(hashes.map(r => [r.hash, Number(r.n)]));
  }
  return result;
}

async function main() {
  assert(['snapshot', 'compare', 'source', 'migrations'].includes(mode) && input && output);
  const result = await db.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    if (mode === 'migrations') {
      const applied = await tx.$queryRawUnsafe('SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations');
      const files = fs.readdirSync(input, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort();
      assert(files.length > 10 && files.length < 200 && files.every(n => /^\d{14}_[a-z0-9_]+$/.test(n)));
      const completed = new Set();
      for (const row of applied) {
        if (row.rolled_back_at) continue;
        assert(row.finished_at && files.includes(row.migration_name) && !completed.has(row.migration_name), 'MIGRATION_HISTORY');
        assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(input, row.migration_name, 'migration.sql'))).digest('hex'), row.checksum, 'OLD_MIGRATION_CHANGED');
        completed.add(row.migration_name);
      }
      const pending = files.filter(n => !completed.has(n));
      assert.deepEqual(pending, ['20261110040000_visual_ledger_nullable']);
      assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(input, pending[0], 'migration.sql'))).digest('hex'), '6924c6acabbe2e1ea7fe22309f6f82a40802f96834f9796f67b2b451cfb4e1a1');
      return { unchangedAppliedMigrations: completed.size, pending };
    }
    if (mode === 'snapshot') return { tables: await snapshot(tx) };
    if (mode === 'compare') {
      const before = read(input).value.tables, after = await snapshot(tx);
      let rows = 0;
      for (const [table, hashes] of Object.entries(before)) for (const [hash, n] of Object.entries(hashes)) {
        assert((after[table]?.[hash] ?? 0) >= n, 'EXISTING_ROW_CHANGED'); rows += n;
      }
      return { originalTables: Object.keys(before).length, originalRowsPreserved: rows };
    }
    const source = read(input), manifest = source.value, sha256 = manifest.sourceSha256;
    assert.match(sha256, /^[a-f0-9]{64}$/);
    const batch = await tx.colorImportBatch.findUniqueOrThrow({ where: { sha256 } });
    const rows = await tx.colorImportRow.findMany({ where: { batchId: batch.id }, take: 10001 });
    assert(rows.length <= 10000 && rows.length === manifest.rowPreservationLedger.length);
    const raw = new Map(manifest.rawWorkbook.sheets.flatMap(s => s.rows.map(r => [JSON.stringify([s.name, r.row]), r.cells])));
    for (const row of rows) assert.deepEqual(row.rawCells, raw.get(JSON.stringify([row.sheetName, row.rowNumber])));
    for (const c of manifest.baseColorCandidates) {
      const row = rows.find(r => r.sheetName === c.source.sheet && r.rowNumber === c.source.rows[0]);
      const color = await tx.color.findUniqueOrThrow({ where: { id: row.colorId }, include: { productionBase: true, versions: { orderBy: { versionNo: 'asc' }, take: 1 } } });
      assert.equal(color.name, c.colorName); assert.equal(color.productionBase.code, c.baseCode);
      assert.deepEqual(color.versions[0].technicalData.sourceDetails, c);
    }
    const facts = await tx.colorProductionFact.findMany({ where: { originalSource: { path: ['fileHash'], equals: sha256 } }, include: { color: true, productionBase: true }, take: 6001 });
    assert(facts.length <= 6000);
    const seen = new Map(facts.map(f => [`${f.originalSource.sourceRowId}:${f.month}`, f]));
    let checked = 0;
    for (const row of rows) {
      const c = row.normalization?.candidate;
      if (c?.year !== 2026 || !Array.isArray(c.months)) continue;
      for (const month of c.months.filter(m => m.monthPosition >= 1 && m.monthPosition <= 8)) {
        const f = seen.get(`${row.id}:2026-${String(month.monthPosition).padStart(2, '0')}`);
        assert(f && !month.formula); assert.equal(f.quantity?.toString() ?? null, month.effectiveValue === null ? null : String(month.effectiveValue));
        assert.equal(f.colorId, row.colorId); assert.equal(f.color.name, c.colorNameRaw); assert.equal(f.productionBase.code, c.baseCodeCandidate);
        assert.equal(f.originalSource.sourceCell, month.cell); assert.equal(f.originalSource.sheetName, row.sheetName); checked++;
      }
    }
    assert.equal(facts.length, checked); assert(checked > 0);
    return { sourceSha256: sha256, sourceManifestSha256: source.sha256,
      rawRowsEqual: rows.length, standardsEqual: manifest.baseColorCandidates.length, monthlyCellsEqual: checked,
      blankCells: facts.filter(f => f.quantity === null).length, zeroCells: facts.filter(f => f.quantity?.toString() === '0').length, batchId: batch.id };
  }, { timeout: 120000, isolationLevel: 'RepeatableRead' });
  save({ at: new Date().toISOString(), mode, ...result });
  process.stdout.write('PRIVATE_DATA_CHECK_OK\n');
}
main().catch(() => { process.stderr.write('PRIVATE_DATA_CHECK_FAILED\n'); process.exitCode = 1; }).finally(() => db.$disconnect());
