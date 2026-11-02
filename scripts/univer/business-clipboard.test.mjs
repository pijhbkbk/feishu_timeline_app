import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
const require = createRequire(resolve('apps/web/package.json'));
const presetRequire = createRequire(require.resolve('@univerjs/preset-sheets-core'));
const core = presetRequire('@univerjs/core'), sheets = presetRequire('@univerjs/sheets');
const formula = presetRequire('@univerjs/engine-formula'), ts = require('typescript');
const folder = name => resolve(dirname(presetRequire.resolve(name)), '../..');
const functionText = (source, name) => {
  const start = source.indexOf(`function ${name}(`), end = source.indexOf('\n}\n', start);
  assert.ok(start >= 0 && end > start, name); return source.slice(start, end + 2);
};
const methodText = (source, name, next) => {
  const start = source.indexOf(`\t${name}(`), end = source.indexOf(`\n\t${next}(`, start);
  assert.ok(start >= 0 && end > start, name); return `({${source.slice(start, end)}}).${name}`;
};
function loadTs(path, dependencies) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { exports, Error, require: name => { assert.ok(name in dependencies, name); return dependencies[name]; } });
  return exports;
}
const modelModule = loadTs('apps/web/src/features/business-sheet/runtime-model.ts', {});
for (const entry of ['es', 'cjs']) {
  const source = readFileSync(resolve(folder('@univerjs/sheets-ui'), `lib/${entry}/index.js`), 'utf8');
  const fsource = readFileSync(resolve(folder('@univerjs/sheets-formula-ui'), `lib/${entry}/index.js`), 'utf8');
  const constantStart = source.indexOf('const PREDEFINED_HOOK_NAME_PASTE ='), constantEnd = source.indexOf('\n};', constantStart) + 3;
  const constants = runInNewContext(`${source.slice(constantStart, constantEnd)};PREDEFINED_HOOK_NAME_PASTE`);
  // Real factories, hook iteration, merge/chunk logic and CommandService execute.
  // Only document backing and renderer/selection/history side effects are fakes.
  const context = { ...core, ...sheets, ...formula, _univerjs_core: core, _univerjs_sheets: sheets, _univerjs_engine_formula: formula,
    _univerjs_sheets_ui: { PREDEFINED_HOOK_NAME_PASTE: constants, COPY_TYPE: { COPY: 'COPY', CUT: 'CUT' } },
    PREDEFINED_HOOK_NAME_PASTE: constants, COPY_TYPE: { COPY: 'COPY', CUT: 'CUT' },

  };
  const names = ['virtualizeDiscreteRanges', 'mergeCellValues', 'getRangeValuesMergeable', 'mergeSetRangeValues', 'spilitLargeSetRangeValuesMutations', 'isRichText', 'getExternalPasteNumberFormatResult', 'getSetCellDataMutations', 'getSetCellValueMutations'];
  const fnames = ['getSetCellFormulaMutations', 'getValueMatrix', 'getDefaultPasteValueMatrix', 'getSpecialPasteValueValueMatrix'];
  const actual = runInNewContext(`${names.map(name => functionText(source, name)).join('\n')}\n${fnames.map(name => functionText(fsource, name)).join('\n')}\n({${[...names, ...fnames].join(',')},paste:${methodText(source, '_pasteUSM', '_getPastedRangeAutoHeightMutation')},addHook:${methodText(source, 'addClipboardHook', 'getClipboardHooks')}})`, context);
  const { businessClipboardGuard } = loadTs('apps/web/src/features/business-sheet/runtime-clipboard.ts', {
    '@univerjs/core': core, '@univerjs/preset-sheets-core': actual, './runtime-model': modelModule,
  });
  function setup({ guard = true, rows, columns, domain, generalRow } = {}) {
    columns ??= [{ key: 'id', label: '只读', width: 100 }, { key: 'note', label: '备注', width: 100 }];
    rows ??= [{ id: 'record', values: ['stable', 'old'], editable: [false, true] }];
    const model = new modelModule.BusinessSheetModel(rows, columns), errors = [], writes = [], plans = [];
    const injector = new core.Injector(), commands = new core.CommandService(injector, { warn() {}, debug() {} }, { getConfig() {} });
    commands.registerCommand(sheets.SetRangeValuesMutation);
    commands.onCommandExecuted(command => {
      if (command.id !== modelModule.VALUE_MUTATION) return;
      const checked = model.validate(command.params.cellValue, Boolean(domain));
      assert.equal(checked.error, null); model.apply(checked.changes); writes.push(command.params);
    });
    commands.beforeCommandExecuted(command => {
      if (command.id !== modelModule.VALUE_MUTATION) return;
      const checked = model.validate(command.params.cellValue, Boolean(domain));
      if (checked.error) throw new core.CustomCommandExecutionError(checked.error);
      domain?.(checked.changes);
    });
    const cellData = {};rows.forEach((r, index) => {cellData[index+1] = {};r.values.forEach((v,col) => {cellData[index+1][col]={v,t:1,s:{n:{pattern:index+1===generalRow?'General':'@'}}};});});
    const workbook = new core.Workbook({ id:'book', locale:core.LocaleType.EN_US, sheetOrder:['sheet'], sheets:{sheet:{id:'sheet',name:'business',rowCount:rows.length+1,columnCount:columns.length,cellData}} }, {warn(){},debug(){},error(){}});
    const worksheet=workbook.getSheetBySheetId('sheet');
    const instance = {getUnit: id => id==='book'?workbook:null};injector.add([core.IUniverInstanceService,{useValue:instance}]);
    const accessor = {get: token=>injector.get(token)};
    const formulaData = { getSheetFormulaData: () => ({}), getArrayFormulaCellData: () => ({}) };
    const service = { _clipboardHooks: [], _notifyClipboardHook() {}, _commandService: commands, _logService: { log(_a, _b, plan) { plans.push(plan); } }, _undoRedoService: { pushUndoRedo() {} },
      _getSetSelectionOperation: () => null, _getPastedRangeAutoHeightMutation: () => null, updatePasteOptionsCache() {}, setShowMenu() {} };
    actual.addHook.call(service, { id: constants.DEFAULT_PASTE, priority: 0, onPasteCells(from, to, data) {
      const result = actual.getSetCellDataMutations(to, from, data, accessor); return { redos: [result.redo], undos: [result.undo] };
    } });
    actual.addHook.call(service, { id: constants.SPECIAL_PASTE_VALUE, priority: 0, specialPasteInfo: {}, onPasteCells(from, to, data) {
      const result = actual.getSetCellValueMutations(to, from, data, accessor); return { redos: [result.redo], undos: [result.undo] };
    } });
    actual.addHook.call(service, { id: 'formula', priority: 10, onPasteCells(from, to, data, payload) {
      return actual.getSetCellFormulaMutations(to.unitId, to.subUnitId, to.range, data, accessor, payload, new formula.LexerTreeBuilder(), formulaData, false, from);
    } });
    if (guard) actual.addHook.call(service, businessClipboardGuard(model, 'book', 'sheet', message => errors.push(message), domain, { numberFormat:(r,c)=>worksheet.getCellStyle(r,c)?.n?.pattern, parseOptions:{locale:core.getNumfmtLocaleTag(workbook.getSnapshot().locale),dateSystem:workbook.getDateSystem()} }));
    let input, range, pasteType, external;
    commands.registerCommand({ id: 'univer.command.paste', type: core.CommandType.COMMAND, handler: () => actual.paste.call(service, { cellMatrix: new core.ObjectMatrix(input) },
      { unitId: 'book', subUnitId: 'sheet', pastedRange: range }, pasteType, external ? undefined : { unitId: 'source', subUnitId: 'sheet', range: { rows: [0], cols: [0] }, copyType: 'COPY' }) });
    return { model, errors, writes, plans, service, worksheet,
      paste: (data, target = { rows: [1], cols: [1] }, type = constants.DEFAULT_PASTE, fromExternal = false) => { external = fromExternal; input = data; range = target; pasteType = type; return commands.executeCommand('univer.command.paste'); },
      dispose() { commands.dispose(); workbook.dispose(); injector.dispose(); },
    };
  }
  test(`${entry}: old per-mutation guard leaves the cached value before rejecting the genuine formula mutation`, async () => {
    const s = setup({ guard: false });
    try { assert.equal(await s.paste({ 0: { 0: { v: 42, t: 2, f: '=40+2' } } }), false); assert.equal(s.model.value(1,1), '42');assert.equal(s.worksheet.getCellRaw(1,1).v,42); assert.equal(s.writes.length, 1); const mutations=s.plans[0].redoMutationsInfo;assert.equal(mutations.length,2);assert.equal(mutations[0].params.isOverrideStyle,true);assert.equal(mutations[1].params.isOverrideStyle,undefined);assert.equal(mutations[1].params.cellValue[1][1].f,'=40+2'); } finally { s.dispose(); }
  });
  test(`${entry}: preflight rejects genuine cached formula before any value mutation or draft`, async () => {
    const s = setup(); try { assert.equal(await s.paste({ 0: { 0: { v: 42, t: 2, f: '=40+2' } } }), false); assert.equal(s.model.value(1,1),'old');assert.equal(s.worksheet.getCellRaw(1,1).v,'old');assert.equal(s.writes.length,0);assert.match(s.errors[0],/不支持公式/); } finally { s.dispose(); }
  });
  test(`${entry}: explicit paste-values accepts the cached scalar without a formula`, async () => {
    const s=setup();try { assert.equal(await s.paste({0:{0:{v:42,t:2,f:'=40+2'}}},undefined,constants.SPECIAL_PASTE_VALUE),true);assert.equal(s.model.value(1,1),'42');assert.ok(s.writes.every(p=>!p.cellValue[1][1]?.f)); } finally {s.dispose();}
  });
  for (const cell of [{v:'中文'}, {v:'0010',t:4}, {v:0,t:2}, {v:''}, {v:'actual',p:{body:{dataStream:'discarded\r\n'}}}, {v:'rich',p:{body:{dataStream:'rich\r\n',textRuns:[{st:0,ed:2,ts:{bl:1}}]}}}]) test(`${entry}: accepted value follows the actual value factory ${JSON.stringify(cell)}`, async()=>{
    const s=setup();try { assert.equal(await s.paste({0:{0:cell}}),true);assert.equal(s.model.value(1,1),String(cell.v)||null); } finally {s.dispose();}
  });
  test(`${entry}: mixed readonly range is rejected before its editable part`, async()=>{
    const s=setup();try { assert.equal(await s.paste({0:{0:{v:'changed ID'},1:{v:'new note'}}},{rows:[1],cols:[0,1]}),false);assert.equal(s.writes.length,0);assert.equal(s.model.value(1,1),'old'); } finally {s.dispose();}
  });
  test(`${entry}: plain text validates only the actual top-left target and rejects literal formulas`,()=>{
    const s=setup();try { const guard=s.service._clipboardHooks.find(h=>h.id==='business-records-clipboard-preflight');const target={unitId:'book',subUnitId:'sheet',range:{rows:[1,2],cols:[1,2]}};assert.doesNotThrow(()=>guard.onPastePlainText(target,'中文',{}));assert.throws(()=>guard.onPastePlainText(target,' =1+1',{}),/不支持公式/); }finally{s.dispose();}
  });
  for (const [name,data,range] of [
    ['merged source',{0:{0:{v:'merge',colSpan:2}}},{rows:[1],cols:[1]}],
    ['formula later in range',{0:{0:{v:'new'},1:{v:2,f:'=1+1'}}},{rows:[1],cols:[0,1]}],
    ['out of bounds',{0:{0:{v:'new'}}},{rows:[2],cols:[1]}],
  ]) test(`${entry}: ${name} leaves every cell unchanged`,async()=>{
    const s=setup();try{assert.equal(await s.paste(data,range),false);assert.equal(s.writes.length,0);assert.equal(s.worksheet.getCellRaw(1,1).v,'old');}finally{s.dispose();}
  });
  test(`${entry}: filtered discrete rows map to stable record identities`,async()=>{
    const rows=Array.from({length:3},(_,i)=>({id:`row-${i}`,values:['stable','old'],editable:[false,true]}));
    const s=setup({rows});try{assert.equal(await s.paste({0:{0:{v:'first'}},1:{0:{v:'last'}}},{rows:[1,3],cols:[1]}),true);assert.equal(s.model.value(1,1),'first');assert.equal(s.model.value(2,1),'old');assert.equal(s.model.value(3,1),'last');}finally{s.dispose();}
  });
  test(`${entry}: external mixed number formats reject a cross-chunk group conflict before any mutation`,async()=>{
    const columns=Array.from({length:20},(_,i)=>({key:`c${i}`,label:`c${i}`,width:100}));
    const rows=Array.from({length:1100},(_,i)=>({id:`r${i}`,values:Array(20).fill('old'),editable:Array(20).fill(true)}));
    const matrix={};for(let r=0;r<1100;r++){matrix[r]={};for(let c=0;c<20;c++)matrix[r][c]={v:'0010'};}
    const domain=changes=>{const values=changes.filter(c=>c.field==='c0').map(c=>c.value);if(new Set(values).size>1)throw new Error('mixed-format group conflict');};
    const s=setup({rows,columns,domain,generalRow:1100});try{
      assert.equal(await s.paste(matrix,{rows:Array.from({length:1100},(_,i)=>i+1),cols:Array.from({length:20},(_,i)=>i)},undefined,true),false);
      assert.equal(s.writes.length,0);assert.match(s.errors[0],/mixed-format group conflict/);
    }finally{s.dispose();}
  });
  test(`${entry}: whole-paste domain conflict across actual 10000-cell chunks rejects unchanged group members too`,async()=>{
    const columns=Array.from({length:20},(_,i)=>({key:`c${i}`,label:`c${i}`,width:100}));
    const rows=Array.from({length:1100},(_,i)=>({id:`r${i}`,values:Array(20).fill('old'),editable:Array(20).fill(true)}));
    const matrix={};for(let r=0;r<1100;r++){matrix[r]={};for(let c=0;c<20;c++)matrix[r][c]={v:'old'};}
    matrix[1099][0]={v:'different',p:{body:{dataStream:'old\r\n'}}};
    const domain=changes=>{const values=changes.filter(c=>c.field==='c0').map(c=>c.value);if(new Set(values).size>1)throw new Error('same-group conflict');};
    const s=setup({rows,columns,domain});try{assert.equal(await s.paste(matrix,{rows:Array.from({length:1100},(_,i)=>i+1),cols:Array.from({length:20},(_,i)=>i)}),false);assert.equal(s.writes.length,0);assert.match(s.errors[0],/same-group conflict/);}finally{s.dispose();}
  });
}
