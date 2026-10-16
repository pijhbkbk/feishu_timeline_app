import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

// Execute the installed bundle's real legacyPaste and convertTextToTable, without
// loading React or fabricating a replacement TSV parser. The override only lets
// the same tests bind to a temporary dependency candidate before pnpm installation.
const require = createRequire(resolve(process.cwd(), 'apps/web/package.json'));
const presetRequire = createRequire(require.resolve('@univerjs/preset-sheets-core'));
const packageDir = process.env.UNIVER_SHEETS_UI_TEST_PACKAGE ?? resolve(dirname(presetRequire.resolve('@univerjs/sheets-ui')), '../..');
const cases = [
  ['T02 lower-right blank', '中文\t0001234567890123456789\n0\t', '<table><tr><td>中文</td><td>0001234567890123456789</td></tr><tr><td>0</td><td></td></tr></table>'],
  ['CRLF record terminator', '中文\t0001234567890123456789\r\n0\t\r\n', '<table><tr><td>中文</td><td>0001234567890123456789</td></tr><tr><td>0</td><td></td></tr></table>'],
  ['leading blank column', '\t值\n0\t尾', '<table><tr><td></td><td>值</td></tr><tr><td>0</td><td>尾</td></tr></table>'],
  ['cell edge spaces', '  甲 \t 乙  \n 丙 \t 丁  ', '<table><tr><td>  甲 </td><td> 乙  </td></tr><tr><td> 丙 </td><td> 丁  </td></tr></table>'],
  ['empty selected final row', '甲\t乙\r\n\t\r\n', '<table><tr><td>甲</td><td>乙</td></tr><tr><td></td><td></td></tr></table>'],
  ['entire blank 2x2 selection', '\t\r\n\t\r\n', '<table><tr><td></td><td></td></tr><tr><td></td><td></td></tr></table>'],
  ['leading empty row', '\n甲\t乙', '<table><tr><td></td></tr><tr><td>甲</td><td>乙</td></tr></table>'],
  ['only one terminal record separator removed', '甲\n\n', '<table><tr><td>甲</td></tr><tr><td></td></tr></table>'],
  ['empty internal cell', '甲\t\t丙\n丁\t0\t己', '<table><tr><td>甲</td><td></td><td>丙</td></tr><tr><td>丁</td><td>0</td><td>己</td></tr></table>'],
  ['single blank row', '\t', '<table><tr><td></td><td></td></tr></table>'],
];
for (const entry of ['es', 'cjs']) {
  const source = readFileSync(resolve(packageDir, `lib/${entry}/index.js`), 'utf8');
  const start = source.indexOf('function convertTextToTable(text) {');
  assert.notEqual(start, -1, 'upstream clipboard implementation must remain discoverable');
  const end = source.indexOf('\n}\n', start) + 2;
  const convertTextToTable = runInNewContext(`(${source.slice(start, end)})`, {}, { timeout: 1000 });
  const methodStart = source.indexOf('\tasync legacyPaste(');
  const methodEnd = source.indexOf('\n\trePasteWithPasteType(', methodStart);
  assert.ok(methodStart > 0 && methodEnd > methodStart);
  const service = runInNewContext(`({${source.slice(methodStart, methodEnd)}})`, {
    convertTextToTable,
    htmlContainsImage: () => false,
    PREDEFINED_HOOK_NAME_PASTE: { DEFAULT_PASTE: 'default-paste' },
  }, { timeout: 1000 });
  const target = { unitId: 'book', subUnitId: 'sheet', range: { startRow: 1, startColumn: 2 } };
  service._pasteHTML = (html, pasteType, formulaPayload, actualTarget) => ({ kind: 'table', html, pasteType, formulaPayload, target: actualTarget });
  service._pastePlainText = (text, pasteType, actualTarget) => ({ kind: 'text', text, pasteType, target: actualTarget });
  service._pasteUnrecognized = () => ({ kind: 'unrecognized' });
  for (const [name, input, expected] of cases) test(`${entry}: ${name}`, async () => {
    const result = await service.legacyPaste(undefined, input, undefined, undefined, target);
    assert.equal(result.kind, 'table');
    assert.equal(result.html, expected);
    assert.equal(result.target, target, 'captured stable target must be passed through');
  });
  test(`${entry}: single-cell text keeps the existing plain-text/date hook route`, async () => {
    const result = await service.legacyPaste(undefined, ' 0001234567890123456789 ', undefined, undefined, target);
    assert.equal(result.kind, 'text');
    assert.equal(result.text, ' 0001234567890123456789 ');
    assert.equal(result.target, target);
  });
  test(`${entry}: existing HTML clipboard path is unchanged`, async () => {
    const html = '<table><tr><td></td><td>原文</td></tr></table>';
    const result = await service.legacyPaste(html, 'fallback\tignored', undefined, undefined, target);
    assert.equal(result.html, html);
    assert.equal(result.target, target);
  });
}
