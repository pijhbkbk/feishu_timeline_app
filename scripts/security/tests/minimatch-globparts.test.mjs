import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../../', import.meta.url));
function dependency(manifest, chain) {
  let require = createRequire(manifest);
  for (const name of chain) require = createRequire(require.resolve(`${name}/package.json`));
  return require;
}
const modern = dependency(path.join(root, 'package.json'), ['eslint']);
const legacy3 = dependency(path.join(root, 'apps/web/package.json'), ['exceljs', 'archiver', 'archiver-utils', 'glob']);
const legacy5 = dependency(path.join(root, 'apps/web/package.json'), ['exceljs', 'archiver', 'readdir-glob']);

for (const format of ['commonjs', 'esm']) {
  const packageRoot = path.dirname(modern.resolve('minimatch/package.json'));
  const { Minimatch } = await import(pathToFileURL(path.join(packageRoot, 'dist', format, 'index.js')).href);
  test(`${format} preprocessing bounds generated patterns before the second phase`, () => {
    const matcher = new Minimatch('safe', { optimizationLevel: 2, braceExpandMax: 8 });
    const parts = matcher.firstPhasePreProcess([Array(6).fill('**/../a/b').join('/').split('/')]);
    assert.ok(parts.length <= 8, `generated ${parts.length} patterns with limit 8`);
  });
  test(`${format} skips quadratic deduplication beyond 1000 entries`, () => {
    const matcher = new Minimatch('safe', { optimizationLevel: 2 });
    const parts = Array.from({ length: 1001 }, (_, index) => ['a', String(index)]);
    let comparisons = 0;
    matcher.partsMatch = () => { comparisons++; return null; };
    assert.equal(matcher.secondPhasePreProcess(parts), parts);
    assert.equal(comparisons, 0);
  });
  test(`${format} retains normal glob matching at optimization levels 0, 1 and 2`, () => {
    for (const optimizationLevel of [0, 1, 2]) {
      for (const [pattern, input, expected] of [
        ['**/*.ts', 'apps/web/page.ts', true], ['**/*.ts', 'apps/web/page.js', false],
        ['src/{web,api}/**', 'src/api/main.js', true], ['src/{web,api}/**', 'src/other/main.js', false],
        ['a/**/b', 'a/b', true], ['a/**/b', 'a/x/y/b', true],
        ['**/*.ts', '.private/page.ts', false], ['a/?(b)c', 'a/c', true],
      ]) assert.equal(new Minimatch(pattern, { optimizationLevel }).match(input), expected);
    }
  });
}

for (const [version, require] of [['3.1.5', legacy3], ['5.1.9', legacy5]]) {
  test(`installed ExcelJS minimatch ${version} lacks the advisory preprocessing mechanism`, () => {
    assert.equal(require('minimatch/package.json').version, version);
    const { Minimatch } = require('minimatch');
    assert.equal(Minimatch.prototype.firstPhasePreProcess, undefined);
    assert.equal(Minimatch.prototype.secondPhasePreProcess, undefined);
    const matcher = new Minimatch(Array(30).fill('**/../a/b').join('/'), { optimizationLevel: 2 });
    assert.equal(matcher.globSet.length, 1);
    assert.equal(matcher.set.length, 1);
    assert.equal(new Minimatch('**/*.xlsx').match('exports/synthetic.xlsx'), true);
    assert.equal(new Minimatch('**/*.xlsx').match('exports/synthetic.txt'), false);
  });
}
