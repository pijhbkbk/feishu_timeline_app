import { expect, it } from 'vitest';
import { ImageInsertionGuard, type ImageInsertionScope } from './image-insertion-guard';

const initial=():ImageInsertionScope=>({unitId:'book',sheetId:'sheet-a',selection:'A1',revision:0});
it.each([{sheetId:'sheet-b'},{selection:'B2'},{unitId:'other-book'},{revision:1}])('rejects a destination change after upload or image decoding: %j',change=>{
 let scope=initial();const guard=new ImageInsertionGuard(()=>scope),id=guard.begin();
 guard.assertCurrent(id);scope={...scope,...change};
 expect(()=>guard.validate([{drawingId:id,unitId:'book',subUnitId:'sheet-a'}])).toThrow('已上传原件保留');
});
it('checks the drawing destination itself even if active selection returned to the original sheet',()=>{
 const guard=new ImageInsertionGuard(initial),id=guard.begin();
 expect(()=>guard.validate([{drawingId:id,unitId:'book',subUnitId:'sheet-b'}])).toThrow('原位置');
 expect(()=>guard.validate([{drawingId:id,unitId:'other-book',subUnitId:'sheet-a'}])).toThrow('原位置');
});
it('validates the entire batch without consuming a token on a cancelled insertion',()=>{
 let scope=initial();const guard=new ImageInsertionGuard(()=>scope),first=guard.begin();scope={...scope,selection:'B2'};const second=guard.begin();
 expect(()=>guard.validate([{drawingId:second,unitId:'book',subUnitId:'sheet-a'},{drawingId:first,unitId:'book',subUnitId:'sheet-a'}])).toThrow();
 scope=initial();expect(()=>guard.validate([{drawingId:second,unitId:'book',subUnitId:'sheet-a'}])).toThrow();
});
it('releases completed insertions and preserves explicit import and undo/redo destinations',()=>{
 let scope=initial();const guard=new ImageInsertionGuard(()=>scope),id=guard.begin();guard.validate([{drawingId:id,unitId:'book',subUnitId:'sheet-a'}]);guard.release(id);
 scope={...scope,sheetId:'sheet-b'};expect(()=>guard.validate([{drawingId:id,unitId:'book',subUnitId:'sheet-a'},{drawingId:'imported-id',unitId:'book',subUnitId:'sheet-a'}])).not.toThrow();
});
it('bounds unfinished decode/insert requests and releases capacity only on completion or failed upload',()=>{
 const guard=new ImageInsertionGuard(initial),ids=Array.from({length:50},()=>guard.begin());expect(()=>guard.begin()).toThrow('50');
 guard.release(ids[0]!);expect(()=>guard.begin()).not.toThrow();guard.dispose();expect(()=>guard.begin()).toThrow('关闭');expect(()=>guard.assertCurrent(ids[1]!)).toThrow('失效');
});
