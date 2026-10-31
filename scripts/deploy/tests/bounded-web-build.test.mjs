import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { test } from 'node:test';
import { URL } from 'node:url';

const require = createRequire(new URL('../../../apps/web/package.json', import.meta.url));
const ts = require('typescript');
const source = readFileSync(new URL('../../../apps/web/bounded-build.ts', import.meta.url), 'utf8');
const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const { sharedDependencyBuild, BoundedUiInputPlugin } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);

function fixture() {
  // Canonical /private/tmp on macOS; only this exclusive test tree is removed.
  const root = require('node:fs').realpathSync(mkdtempSync(path.join(tmpdir(), 'timeline-bounded-build-')));
  const source = path.join(root, 'output/source'), receipts = path.join(root, 'output/receipts');
  const ui = path.join(source, 'node_modules/.pnpm/ui-patched/node_modules/@univerjs/ui');
  mkdirSync(ui, { recursive: true }); mkdirSync(receipts);
  const environment = { NODE_ENV: 'production', CI: '1', TIMELINE_BUILD_CACHE: 'disabled', TIMELINE_BUILD_TRACING_ROOT: root, TIMELINE_BUILD_UI_ROOT: ui, TIMELINE_BUILD_RECEIPTS: receipts };
  return { root, source, ui, receipts, environment, close: () => rmSync(root, { recursive: true }) };
}

test('normal builds keep their existing tracing behavior', () => {
  assert.equal(sharedDependencyBuild('/unused-source', {}), null);
  assert.equal(sharedDependencyBuild('/unused-source', { NODE_ENV: 'production', TIMELINE_BUILD_CACHE: 'disabled' }), null);
});

for (const [label, change] of [
  ['development', { NODE_ENV: 'development' }], ['non-CI', { CI: undefined }],
  ['disk cache', { TIMELINE_BUILD_CACHE: undefined }], ['partial input', { TIMELINE_BUILD_UI_ROOT: undefined }],
  ['relative root', { TIMELINE_BUILD_TRACING_ROOT: '.' }], ['filesystem root', { TIMELINE_BUILD_TRACING_ROOT: '/' }],
]) test(`rejects ${label}`, () => {
  const f = fixture(); try { assert.throws(() => sharedDependencyBuild(f.source, { ...f.environment, ...change })); } finally { f.close(); }
});

test('requires canonical strict ancestor, copied UI and separate exclusive receipts', () => {
  const f = fixture();
  try {
    assert.deepEqual(sharedDependencyBuild(f.source, f.environment), { tracingRoot: f.root, uiRoot: f.ui, receiptDirectory: f.receipts });
    assert.throws(() => sharedDependencyBuild(f.source, { ...f.environment, TIMELINE_BUILD_TRACING_ROOT: f.source }));
    assert.throws(() => sharedDependencyBuild(f.source, { ...f.environment, TIMELINE_BUILD_RECEIPTS: f.source }));
    assert.throws(() => sharedDependencyBuild(f.source, { ...f.environment, TIMELINE_BUILD_RECEIPTS: f.root }));
    const alias = path.join(f.root, 'alias'); symlinkSync(f.ui, alias);
    assert.throws(() => sharedDependencyBuild(f.source, { ...f.environment, TIMELINE_BUILD_UI_ROOT: alias }));
  } finally { f.close(); }
});

function compile(build, resources, name = 'client') {
  const errors = []; let finish, begin;
  const compiler = { name: undefined, hooks: { thisCompilation: { tap(_name, callback) { begin = callback; } } } };
  new BoundedUiInputPlugin(build).apply(compiler);
  compiler.name = name;
  begin({ errors, hooks: { finishModules: { tap(_name, callback) { finish = callback; } } } });
  finish(resources.map(resource => ({ resource })));
  return errors;
}

test('records actual patched UI inputs once without touching their files', () => {
  const f = fixture();
  try {
    const file = path.join(f.ui, 'index.js'); writeFileSync(file, 'patched input');
    const build = sharedDependencyBuild(f.source, f.environment);
    assert.deepEqual(compile(build, [file, `${file}?loader`, undefined]), []);
    const receipt = JSON.parse(readFileSync(path.join(f.receipts, 'client.json'), 'utf8'));
    assert.equal(receipt.files.length, 1); assert.equal(receipt.files[0].file, file);
    assert.equal(receipt.files[0].sha256, require('node:crypto').createHash('sha256').update('patched input').digest('hex'));
    assert.equal(readFileSync(file, 'utf8'), 'patched input');
    assert.equal(compile(build, [file]).length, 1); // An existing receipt is never overwritten.
    assert.throws(() => compile(build, [], '../escape'));
  } finally { f.close(); }
});

test('works with the installed Next webpack lifecycle and actual module resources', async () => {
  const f = fixture();
  const bundled = require('next/dist/compiled/webpack/webpack'); bundled.init();
  let compiler;
  try {
    const entry = path.join(f.ui, 'index.js'); writeFileSync(entry, 'export const value = 1;');
    compiler = bundled.webpack({ name: 'client', mode: 'production', cache: false, context: f.source,
      entry, output: { path: path.join(f.root, 'output/bundle'), filename: 'test.js' },
      optimization: { minimize: false }, plugins: [new BoundedUiInputPlugin(sharedDependencyBuild(f.source, f.environment))],
    });
    const stats = await new Promise((resolve, reject) => compiler.run((error, stats) => error ? reject(error) : resolve(stats)));
    assert.equal(stats.hasErrors(), false, stats.toString({ all: false, errors: true }));
    const receipt = JSON.parse(readFileSync(path.join(f.receipts, 'client.json'), 'utf8'));
    assert.deepEqual(receipt.files.map(row => row.file), [entry]);
  } finally {
    if (compiler) await new Promise((resolve, reject) => compiler.close(error => error ? reject(error) : resolve()));
    f.close();
  }
});

test('rejects old UI, including a link escaping the patched package', () => {
  const f = fixture();
  try {
    const old = path.join(f.root, 'node_modules/@univerjs/ui'); mkdirSync(old, { recursive: true });
    const oldFile = path.join(old, 'index.js'); writeFileSync(oldFile, 'old input');
    const build = sharedDependencyBuild(f.source, f.environment);
    assert.match(compile(build, [oldFile])[0].message, /outside the patched package/);
    const link = path.join(f.ui, 'escape.js'); symlinkSync(oldFile, link);
    assert.match(compile(build, [link])[0].message, /outside the patched package/);
  } finally { f.close(); }
});

// No user/global env mutations, application build, DB or browser work. The
// synthetic webpack fixture stays inside its exclusive temporary tree.
assert.equal(process.env.TIMELINE_BUILD_TRACING_ROOT, undefined);
