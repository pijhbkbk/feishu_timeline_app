import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const require = createRequire(resolve(process.cwd(), 'apps/web/package.json'));
const presetRequire = createRequire(require.resolve('@univerjs/preset-sheets-core'));
const packageDir = process.env.UNIVER_UI_TEST_PACKAGE ?? resolve(dirname(presetRequire.resolve('@univerjs/ui')), '../..');
const { CommandService, CommandType, CustomCommandExecutionError, Injector } = presetRequire('@univerjs/core');

// Run the installed bundle's actual selector and dispatch functions. The override
// permits the exact patched candidate to be tested before dependency installation.
for (const entry of ['es', 'cjs']) {
  const source = readFileSync(resolve(packageDir, `lib/${entry}/index.js`), 'utf8');
  const toolbar = source.indexOf('const ToolbarItem =');
  const executeStart = source.indexOf('\tconst executeCommand = ', toolbar);
  const executeEnd = source.indexOf('\n\t};', executeStart) + 4;
  const selectStart = source.indexOf('\t\tfunction handleSelect(option) {', executeEnd);
  const selectEnd = source.indexOf('\n\t\tfunction handleSelectionsValueChange', selectStart);
  assert.ok(toolbar > 0 && executeStart > toolbar && executeEnd > executeStart && selectEnd > selectStart);
  const actualFunctions = `${source.slice(executeStart, executeEnd)}\n${source.slice(selectStart, selectEnd)}\nhandleSelect`;
  function setup({ disabled = false, guard = false } = {}) {
    const injector = new Injector();
    const service = new CommandService(injector, { warn() {}, debug() {} }, { getConfig() {} });
    const calls = [], focus = [];
    for (const id of ['univer.command.paste', 'legacy-command', 'selector-default']) {
      service.registerCommand({ id, type: CommandType.COMMAND, handler: (_accessor, params) => { calls.push({ id, params }); return true; } });
    }
    if (guard) service.beforeCommandExecuted(() => { throw new CustomCommandExecutionError('denied'); });
    let result;
    const select = runInNewContext(actualFunctions, {
      disabled, sId: 'selector-default',
      layoutService: { focus: () => focus.push('focus') },
      commandService: { executeCommand: (...args) => (result = service.executeCommand(...args)) },
    }, { timeout: 1000 });
    return { select, calls, focus, result: () => result, dispose: () => { service.dispose(); injector.dispose(); } };
  }
  test(`${entry}: menu identity routes to the registered command through CommandService`, async () => {
    const s = setup();
    try {
      s.select({ id: 'sheet.command.paste', commandId: 'univer.command.paste', value: 'plain' });
      assert.equal(await s.result(), true);
      assert.equal(s.calls[0].id, 'univer.command.paste');
      assert.equal(s.calls[0].params.value, 'plain');
      assert.equal(s.focus.length, 1);
    } finally { s.dispose(); }
  });
  for (const [name, option, expected] of [
    ['legacy id', { id: 'legacy-command' }, 'legacy-command'],
    ['missing id', {}, 'selector-default'],
    ['empty legacy id', { id: '' }, 'selector-default'],
    ['null command id', { id: 'legacy-command', commandId: null }, 'legacy-command'],
  ]) test(`${entry}: ${name} fallback`, async () => {
    const s = setup();
    try { s.select(option); assert.equal(await s.result(), true); assert.equal(s.calls[0].id, expected); }
    finally { s.dispose(); }
  });
  test(`${entry}: disabled selector does not focus or dispatch`, () => {
    const s = setup({ disabled: true });
    try { s.select({ commandId: 'univer.command.paste' }); assert.equal(s.result(), undefined); assert.equal(s.focus.length, 0); assert.equal(s.calls.length, 0); }
    finally { s.dispose(); }
  });
  test(`${entry}: function parameters keep the original selected value and object`, async () => {
    const s = setup();
    const value = { selection: 'original' }, params = { pasteType: 'values' };
    try {
      s.select({ commandId: 'univer.command.paste', value, params: received => { assert.equal(received, value); return params; } });
      assert.equal(await s.result(), true); assert.equal(s.calls[0].params, params);
    } finally { s.dispose(); }
  });
  for (const params of [0, false, '']) test(`${entry}: explicit ${JSON.stringify(params)} parameters are retained`, async () => {
    const s = setup();
    try { s.select({ commandId: 'univer.command.paste', params }); assert.equal(await s.result(), true); assert.equal(s.calls[0].params, params); }
    finally { s.dispose(); }
  });
  test(`${entry}: real command before-execute rejection still prevents the handler`, async () => {
    const s = setup({ guard: true });
    try {
      s.select({ id: 'sheet.command.paste', commandId: 'univer.command.paste' });
      assert.equal(await s.result(), false); assert.equal(s.calls.length, 0);
    } finally { s.dispose(); }
  });
}
