import { expect, it, vi } from 'vitest';
import { ApiRequestError } from '../../lib/auth-client';
import { blankWorkbook } from './contract';
import { WorkbookIntentSession } from './workbook-intent-session';
import { validateWorkbookIntent, validateWorkbookIntentTransition, type WorkbookIntent, type StoredWorkbookIntent } from './workbook-intent-store';
const book='572766eb-ecb3-49c4-9d34-9242236d976a';
function fixture(kind:'create'|'restore'|'import'){
 const snapshot=blankWorkbook(book,'Synthetic');
 const data:WorkbookIntent['data']=kind==='create'?{kind,snapshot,operationId:'original-operation'}:kind==='restore'?{kind,id:book,revision:1,expected:3,operationId:'original-operation'}:{kind,createSnapshot:snapshot,operationId:'original-operation',sourceFileName:'synthetic.xlsx',sourceBytes:new Uint8Array([80,75,3,4]),imageOperations:[crypto.randomUUID(),crypto.randomUUID()],created:null,imageIndex:0,assets:[]};
 const intent:WorkbookIntent={version:1,intentId:crypto.randomUUID(),phase:'prepared',resolution:null,data};
 let stored:StoredWorkbookIntent|null=null;const ack={id:book,name:'Synthetic',revision:kind==='restore'?4:1,snapshotHash:'a'.repeat(64),updatedAt:'2026-10-20T08:00:00Z'};
 const write=vi.fn(async(_owner:string,next:WorkbookIntent,expected:number|null)=>{if((stored?.revision??null)!==expected)throw new Error('CAS conflict');const safe=validateWorkbookIntent(next);validateWorkbookIntentTransition(stored?.intent??null,safe);stored={revision:(expected??0)+1,intent:safe};return structuredClone(stored);});
 const create=vi.fn(async()=>ack),restore=vi.fn(async()=>ack),assertActive=vi.fn();
 return {intent,ack,write,create,restore,assertActive,ports:{write,create,restore,assertActive},stored:()=>structuredClone(stored!)};
}
it.each(['create','restore','import'] as const)('%s checkpoints before dispatch and reopens the exact lost-ack request',async kind=>{
 const f=fixture(kind),send=kind==='restore'?f.restore:f.create;let effects=0;const seen=new Map<string,unknown>();
 send.mockImplementation(async(...args:unknown[])=>{expect(f.stored().intent.phase).toBe('awaiting-receipt');const key=String(args.at(-1));if(!seen.has(key)){seen.set(key,structuredClone(args));effects++;throw new Error('lost acknowledgement');}expect(args).toEqual(seen.get(key));return f.ack;});
 const session=await WorkbookIntentSession.prepare('actor',f.intent,f.ports);await expect(session.execute()).rejects.toThrow('lost acknowledgement');
 const saved=f.stored();expect(saved.intent.phase).toBe('awaiting-receipt');const reopened=new WorkbookIntentSession('actor',saved,f.ports);await reopened.execute();
 expect(send).toHaveBeenCalledTimes(2);expect(effects).toBe(1);expect(send.mock.calls[0]).toEqual(send.mock.calls[1]);
 expect(f.stored().intent.phase).toBe(kind==='import'?'awaiting-receipt':'confirmed');
 if(kind==='import'){expect(f.stored().intent.data).toMatchObject({created:f.ack,imageIndex:0});await new WorkbookIntentSession('actor',f.stored(),f.ports).execute();expect(send).toHaveBeenCalledTimes(2);}
});
it.each([401,403,409,422])('an old unknown request followed by %s remains unknown',async status=>{
 const f=fixture('create');f.create.mockRejectedValueOnce(new Error('lost acknowledgement')).mockRejectedValueOnce(new ApiRequestError('denied',status));const session=await WorkbookIntentSession.prepare('actor',f.intent,f.ports);await expect(session.execute()).rejects.toThrow();const original=f.stored().intent;
 await expect(new WorkbookIntentSession('actor',f.stored(),f.ports).execute()).rejects.toThrow();expect(f.stored().intent).toEqual(original);
});
it.each([400,409,413,422])('can distinguish a first definitive %s rejection from a successful result',async status=>{
 const f=fixture('create');f.create.mockRejectedValueOnce(new ApiRequestError('rejected',status));const session=await WorkbookIntentSession.prepare('actor',f.intent,f.ports);await expect(session.execute()).rejects.toThrow();expect(f.stored().intent).toMatchObject({phase:'confirmed',resolution:'rejected',data:f.intent.data});
});
it.each(['prepared-write','dispatch-write'] as const)('does not dispatch after owner/scope changes during %s',async point=>{
 const f=fixture('create');let active=true;f.assertActive.mockImplementation(()=>{if(!active)throw new Error('owner changed');});const original=f.write.getMockImplementation()!;f.write.mockImplementation(async(...args)=>{const result=await original(...args);if(args[1].phase===(point==='prepared-write'?'prepared':'awaiting-receipt'))active=false;return result;});
 const run=async()=>{const session=await WorkbookIntentSession.prepare('actor',f.intent,f.ports);await session.execute();};await expect(run()).rejects.toThrow('owner changed');expect(f.create).not.toHaveBeenCalled();expect(f.stored().intent.data).toEqual(f.intent.data);
});
it('does not send if durability fails, and does not acknowledge malformed responses',async()=>{
 const f=fixture('create');f.write.mockRejectedValueOnce(new Error('storage quota'));await expect(WorkbookIntentSession.prepare('actor',f.intent,f.ports)).rejects.toThrow('storage quota');expect(f.create).not.toHaveBeenCalled();
 const session=await WorkbookIntentSession.prepare('actor',f.intent,f.ports);f.create.mockResolvedValueOnce({...f.ack,revision:2});await expect(session.execute()).rejects.toThrow('回执');expect(f.stored().intent.phase).toBe('awaiting-receipt');
});
it('retains the original operation when acknowledgement persistence fails',async()=>{
 const f=fixture('restore'),session=await WorkbookIntentSession.prepare('actor',f.intent,f.ports);const original=f.write.getMockImplementation()!;f.write.mockImplementation(async(...args)=>{if(args[1].phase==='confirmed')throw new Error('disk failure');return original(...args);});
 await expect(session.execute()).rejects.toThrow('disk failure');expect(f.stored().intent.phase).toBe('awaiting-receipt');expect(f.stored().intent.data).toEqual(f.intent.data);
});
it('rebuilds acknowledged images without regressing progress and only finishes after a durable complete draft',async()=>{
 const f=fixture('import'),session=await WorkbookIntentSession.prepare('actor',f.intent,f.ports);await session.execute();await session.rememberAsset('shared.png',book);await session.advanceImage(0);
 const reopened=new WorkbookIntentSession('actor',f.stored(),f.ports);await reopened.execute();await reopened.rememberAsset('shared.png',book);await reopened.advanceImage(0);expect(f.create).toHaveBeenCalledTimes(1);expect(f.stored().intent.data).toMatchObject({imageIndex:1,assets:[['shared.png',book]]});
 await expect(reopened.finishImport({workbookId:book,imageCount:2})).rejects.toThrow();await reopened.advanceImage(1);await reopened.finishImport({workbookId:book,imageCount:2});expect(f.stored().intent).toMatchObject({phase:'confirmed',resolution:'succeeded'});
});
