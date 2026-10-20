import { describe,it,expect } from 'vitest';
import { blankWorkbook } from './contract';
import { WorkbookSaveSession } from './save-session';
describe('workbook save acknowledgements',()=>{
 it('keeps the exact immutable payload and operation after lost acknowledgement',()=>{const session=new WorkbookSaveSession(3),snapshot=blankWorkbook(crypto.randomUUID());const first=session.request(snapshot,7);snapshot.name='later edit';session.reject(undefined);expect(session.request(snapshot,8)).toBe(first);expect(first.snapshot.name).toBe('新工作簿');expect(session.confirm(4)).toBe(7);expect(session.uncertain).toBe(false);expect(session.revision).toBe(4);});
 it('keeps uncertain state after an auth failure and rejects a wrong version ack',()=>{const session=new WorkbookSaveSession(1);session.request(blankWorkbook(crypto.randomUUID()),1);session.reject(403);expect(session.uncertain).toBe(true);expect(()=>session.confirm(6)).toThrow();expect(session.uncertain).toBe(true);});
 it('clears a definitive CAS rejection without advancing revision',()=>{const session=new WorkbookSaveSession(1);session.request(blankWorkbook(crypto.randomUUID()),1);session.reject(409);expect(session.uncertain).toBe(false);expect(session.revision).toBe(1);});
});

it('recreates an uncertain save after a browser restart using the original bytes and sequence',()=>{const before=new WorkbookSaveSession(6),first=before.request(blankWorkbook(crypto.randomUUID()),14),checkpoint=JSON.parse(JSON.stringify(before.checkpoint()));const after=new WorkbookSaveSession(6,checkpoint);checkpoint.payload.snapshot.name='mutated external record';expect(after.existing()).toEqual(first);expect(after.checkpoint()?.sequence).toBe(14);expect(after.confirm(7)).toBe(14);expect(after.checkpoint()).toBeNull();});
it('rejects an uncertain request belonging to a different base revision',()=>{const before=new WorkbookSaveSession(4);before.request(blankWorkbook(crypto.randomUUID()),1);expect(()=>new WorkbookSaveSession(5,before.checkpoint())).toThrow('原版本');});
