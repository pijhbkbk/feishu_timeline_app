import { afterEach, expect, it, vi } from 'vitest';
import { recentWorkbook, rememberWorkbook } from './recent-workbook';

const first='11111111-1111-4111-8111-111111111111',second='22222222-2222-4222-8222-222222222222';
function storage(){const values=new Map<string,string>();return {getItem:vi.fn((key:string)=>values.get(key)??null),setItem:vi.fn((key:string,value:string)=>{values.set(key,value);})};}
afterEach(()=>vi.unstubAllGlobals());

it('persists only actor and workbook IDs across reload and isolates actors and tabs',()=>{
 const saved=storage();vi.stubGlobal('window',{sessionStorage:saved});rememberWorkbook('owner-a',first);rememberWorkbook('owner-b',second);
 expect(JSON.parse(saved.setItem.mock.calls.at(-1)![1])).toEqual([{ownerId:'owner-b',workbookId:second},{ownerId:'owner-a',workbookId:first}]);
 vi.stubGlobal('window',{sessionStorage:saved});expect(recentWorkbook('owner-a')).toBe(first);expect(recentWorkbook('owner-b')).toBe(second);
 vi.stubGlobal('window',{sessionStorage:storage()});expect(recentWorkbook('owner-a')).toBeUndefined();
});
it.each(['getter','getItem','setItem'])('retains SPA selection when session storage %s fails',failure=>{
 const saved=storage();const tab=failure==='getter'?Object.defineProperty({},'sessionStorage',{get(){throw new Error('blocked');}}):{sessionStorage:saved};
 if(failure==='getItem')saved.getItem.mockImplementation(()=>{throw new Error('blocked');});
 if(failure==='setItem')saved.setItem.mockImplementation(()=>{throw new Error('full');});
 vi.stubGlobal('window',tab);rememberWorkbook('owner-a',first);rememberWorkbook('owner-a',second);expect(recentWorkbook('owner-a')).toBe(second);
});
it('never reuses stale storage after a successful mount whose persistence failed',()=>{
 const saved=storage();vi.stubGlobal('window',{sessionStorage:saved});rememberWorkbook('owner-a',first);
 vi.stubGlobal('window',{sessionStorage:saved});expect(recentWorkbook('owner-a')).toBe(first);
 saved.setItem.mockImplementation(()=>{throw new Error('full');});rememberWorkbook('owner-a',second);expect(recentWorkbook('owner-a')).toBe(second);
});
it('bounds actor history and drops invalid or oversized stored navigation hints',()=>{
 const saved=storage();vi.stubGlobal('window',{sessionStorage:saved});
 for(let n=0;n<9;n++)rememberWorkbook(`owner-${n}`,first);
 expect(recentWorkbook('owner-0')).toBeUndefined();expect(recentWorkbook('owner-8')).toBe(first);expect(JSON.parse(saved.setItem.mock.calls.at(-1)![1])).toHaveLength(8);
 for(const raw of ['{',JSON.stringify([{ownerId:'owner-a',workbookId:'../bad'}]),JSON.stringify(Array(9).fill({ownerId:'owner-a',workbookId:first})),' '.repeat(4097)]){
   saved.getItem.mockReturnValue(raw);vi.stubGlobal('window',{sessionStorage:saved});expect(recentWorkbook('owner-a')).toBeUndefined();
 }
});
