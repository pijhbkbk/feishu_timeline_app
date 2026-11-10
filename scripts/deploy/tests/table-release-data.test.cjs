const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../../..');
const directory = path.join(root, 'apps/api/prisma/migrations');
const names = fs.readdirSync(directory, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort();
const pending = '20261110040000_visual_ledger_nullable';
const source = fs.readFileSync(path.join(__dirname, '../table-release-data.cjs'), 'utf8');
const applied = names.filter(name => name !== pending).map(name => ({
  migration_name: name,
  checksum: crypto.createHash('sha256').update(fs.readFileSync(path.join(directory, name, 'migration.sql'))).digest('hex'),
  finished_at: new Date('2026-11-01T00:00:00Z'), rolled_back_at: null,
}));

async function run({ rows = applied, extraName, queryError, changedPending = false } = {}) {
  const output = { stdout: '', stderr: '', saved: null };
  let finish;
  const disconnected = new Promise(resolve => { finish = resolve; });
  const processStub = { argv: ['node', 'table-release-data.cjs', 'migrations', directory, '/unused/result.json'],
    exitCode: 0, stdout: { write: v => { output.stdout += v; } }, stderr: { write: v => { output.stderr += v; } } };
  const tx = { $executeRawUnsafe: async sql => assert.equal(sql, 'SET TRANSACTION READ ONLY'),
    $queryRawUnsafe: async () => { if (queryError) throw queryError; return rows; } };
  class PrismaClient {
    async $transaction(callback) { return callback(tx); }
    async $disconnect() { finish(); }
  }
  const fsStub = { ...fs,
    readdirSync: (...args) => [...fs.readdirSync(...args), ...(extraName ? [{ name: extraName, isDirectory: () => true }] : [])],
    readFileSync: (file, ...args) => changedPending && file === path.join(directory, pending, 'migration.sql')
      ? Buffer.from('-- changed pending migration') : fs.readFileSync(file, ...args),
    writeFileSync: (_file, value, options) => { assert.equal(options.flag, 'wx'); output.saved = JSON.parse(value); },
  };
  const context = { process: processStub, require: name => name === 'node:fs' ? fsStub
    : name === 'node:module' ? { createRequire: () => () => ({ PrismaClient }) } : require(name) };
  // Keep filesystem arrays and literals in the same realm, as in the shipped
  // Node CLI; a new VM realm would make strict equality reject equal arrays.
  vm.compileFunction(source, ['require', 'process'])(context.require, context.process);
  await disconnected;
  return { ...output, exitCode: processStub.exitCode };
}

test('actual repository migration names and checksums retain the single approved pending migration', async () => {
  assert.equal(names.filter(n => /^\d{12}_/.test(n)).length, 6);
  const result = await run();
  assert.equal(result.exitCode, 0);
  assert.equal(result.saved.unchangedAppliedMigrations, applied.length);
  assert.deepEqual(result.saved.pending, [pending]);
});

test('unapproved short names and extra pending migrations remain rejected', async () => {
  assert.equal((await run({ extraName: '202610130006_unapproved' })).stderr, 'MIGRATION_FILE_NAMES\n');
  assert.equal((await run({ extraName: '20261110050000_extra' })).stderr, 'PENDING_MIGRATION_SCOPE\n');
});

test('applied checksum changes and incomplete or duplicate history remain rejected', async () => {
  for (const [rows, code] of [
    [[{ ...applied[0], checksum: '0'.repeat(64) }, ...applied.slice(1)], 'OLD_MIGRATION_CHANGED'],
    [[{ ...applied[0], finished_at: null }, ...applied.slice(1)], 'MIGRATION_HISTORY'],
    [[...applied, applied[0]], 'MIGRATION_HISTORY'],
  ]) {
    const result = await run({ rows });
    assert.equal(result.exitCode, 1); assert.equal(result.saved, null); assert.equal(result.stderr, code + '\n');
  }
});

test('pending migration bytes are still pinned', async () => {
  const result = await run({ changedPending: true });
  assert.equal(result.exitCode, 1); assert.equal(result.stderr, 'PENDING_MIGRATION_CHANGED\n');
});

test('unexpected database errors never print credentials or SQL details', async () => {
  const result = await run({ queryError: new Error('postgresql://synthetic:secret@host/database SELECT private_value') });
  assert.equal(result.exitCode, 1); assert.equal(result.stderr, 'PRIVATE_DATA_CHECK_FAILED\n');
  assert.equal(result.saved, null);
});
