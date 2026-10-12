import { describe, expect, it } from 'vitest';
import { CatalogSheetModel } from './sheet-model';
import type { RegisterRow } from './client';
const row = (id: string, base = '基地甲'): RegisterRow => ({ id, colorId:id, name:'同名蓝', base:{id:base,name:base}, formalCode:'001', manufacturer:'制作甲', paintType:'漆甲', boardCode:'0001', registerMonth:'2026-10', registerStatus:'LISTED', productionApprovalStatus:'UNKNOWN', note:'原值', revision:1, currentStandardVersionId:'v1', sourceSummary:'原始来源' });
describe('catalog drafts and versioned undo', () => {
  it('invalidates saved undo when a later conflict refresh discovers someone else changed that row', () => {
    const model = new CatalogSheetModel([row('a'), row('b')]);
    model.apply([{id:'b', field:'note', value:'我的已保存值'}]);
    model.confirm([{...row('b'), note:'我的已保存值', revision:2}], model.patches());
    model.apply([{id:'a', field:'note', value:'我的另一修改'}]);
    model.latest([{...row('a'), note:'甲的他人值', revision:2}, {...row('b'), note:'乙的他人值', revision:3}]);
    expect(model.undo()).toEqual([]);
    model.resolve('a', false);
    expect(model.patches()).toEqual([]);
    expect(model.display('b').note).toBe('乙的他人值');
  });
  it('uses IDs across reordered same-name rows, and reverses an already acknowledged edit', () => {
    const model = new CatalogSheetModel([row('b','基地乙'),row('a')]);
    model.apply([{id:'a',field:'note',value:'第一版'}]);
    const patch=model.patches(); expect(patch.map(x=>x.id)).toEqual(['a']);
    model.confirm([{...row('a'),note:'第一版',revision:2}],patch);
    expect(model.patches()).toEqual([]);
    model.undo(); expect(model.patches()).toEqual([{id:'a',expectedRevision:2,changes:{note:'原值'}}]);
    model.redo(); expect(model.patches()).toEqual([]);
    expect(model.display('b').note).toBe('原值');
  });
  it('keeps a newer in-flight edit or a reversion to the former saved value', () => {
    for(const next of ['第二版','原值']){
      const model = new CatalogSheetModel([row('a')]); model.apply([{id:'a',field:'note',value:'第一版'}]); const patch=model.patches();
      model.apply([{id:'a',field:'note',value:next}]); model.confirm([{...row('a'),note:'第一版',revision:2}],patch);
      expect(model.patches()).toEqual([{id:'a',expectedRevision:2,changes:{note:next}}]);
    }
  });
  it('rejects a mixed readonly edit atomically and keeps leading zeros and explicit clearing', () => {
    const model=new CatalogSheetModel([row('a')]);
    expect(()=>model.apply([{id:'a',field:'note',value:'不可部分应用'},{id:'a',field:'formalCode',value:'forged'}])).toThrow();
    expect(model.patches()).toEqual([]);
    model.apply([{id:'a',field:'boardCode',value:'000001'},{id:'a',field:'note',value:null}]);
    expect(model.patches()[0]?.changes).toEqual({note:null,boardCode:'000001'});
  });
  it('preserves pending fields on conflict while refreshing untouched values without generating edits', () => {
    const model=new CatalogSheetModel([row('a'),row('b')]); model.apply([{id:'a',field:'note',value:'我的'}]);
    model.latest([{...row('a'),note:'他人',boardCode:'0002',revision:2},{...row('b'),note:'其他人的记录',revision:3}]);
    expect(model.patches()).toEqual([{id:'a',expectedRevision:1,changes:{note:'我的'}}]);
    expect(model.conflicts()).toHaveLength(1); expect(model.display('a').boardCode).toBe('0002');
    model.resolve('a',true); expect(model.patches()[0]?.expectedRevision).toBe(2);
  });
});
