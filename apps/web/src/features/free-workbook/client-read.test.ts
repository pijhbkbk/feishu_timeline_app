import { afterEach, expect, it, vi } from 'vitest';
const request=vi.hoisted(()=>vi.fn());
vi.mock('../../lib/auth-client',()=>({apiRequest:request}));
import { listRevisions, listWorkbooks, readWorkbook } from './client';
afterEach(()=>{vi.useRealTimers();request.mockReset();});
it.concurrent.each([
 ['list',()=>listWorkbooks()],['workbook',()=>readWorkbook('workbook-id')],['history',()=>listRevisions('workbook-id')],
] as const)('bounds the %s read to15 seconds',async(_label,run)=>{
 request.mockImplementation((_path:string,{signal}:{signal:AbortSignal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true})));
 const pending=run();await expect(pending).rejects.toMatchObject({name:'TimeoutError'});
},20000);
it('combines caller cancellation with the read timeout',async()=>{
 const controller=new AbortController();request.mockImplementation((_path:string,{signal}:{signal:AbortSignal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true})));
 const pending=readWorkbook('workbook-id',controller.signal);const rejected=expect(pending).rejects.toMatchObject({name:'AbortError'});controller.abort();await rejected;
});
