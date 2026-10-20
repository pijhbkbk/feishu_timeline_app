import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IWorkbookData } from '@univerjs/core';
import { apiRequest } from '../../lib/auth-client';
import { executeServerDraftRequest, readServerDraft } from './server-draft-client';
import { ServerDraftSession, validateServerDraftAck, validateServerDraftRead, type ServerDraftAck, type ServerDraftMeta, type ServerDraftRequest } from './server-draft-session';
vi.mock('../../lib/auth-client',()=>({apiRequest:vi.fn()}));
const bookId='10000000-0000-4000-8000-000000000001',draftId='10000000-0000-4000-8000-000000000002';
const otherId='10000000-0000-4000-8000-000000000003',owner='synthetic-owner',time='2026-10-20T00:00:00.000Z';
const snapshot=(name='未提交草稿')=>({id:bookId,name,appVersion:'1.0.4',locale:'zhCN',sheetOrder:['s'],styles:{},sheets:{s:{id:'s',name:'工作表1',rowCount:20,columnCount:26,cellData:{0:{0:{v:'本机中文'}}}}}} as IWorkbookData);
const session=()=>new ServerDraftSession({workbookId:bookId,authorUserId:owner,baseWorkbookRevision:3});
const meta=(hash='a'.repeat(64)):ServerDraftMeta=>({id:draftId,draftRevision:1,baseWorkbookRevision:3,snapshotHash:hash,snapshotBytes:1234,updatedAt:time});
function saveAck(request:ServerDraftRequest):ServerDraftAck{
  if(request.kind!=='save')throw new Error('Expected save');
  const receipt={action:'DRAFT_SAVED' as const,draftId:request.body.expectedDraftId??draftId,draftRevision:request.body.expectedDraftRevision+1,baseWorkbookRevision:request.body.baseWorkbookRevision,snapshotHash:request.expectedSnapshotHash,workbookRevision:3};
  return {receipt,currentDraft:{...meta(receipt.snapshotHash),id:receipt.draftId,draftRevision:receipt.draftRevision,baseWorkbookRevision:receipt.baseWorkbookRevision,snapshotBytes:new TextEncoder().encode(JSON.stringify(request.body.snapshot)).length},workbookRevision:3,baseStale:false,superseded:false};
}
function slotAck(request:ServerDraftRequest):ServerDraftAck{
  if(request.kind==='save')throw new Error('Expected slot operation');
  const receipt={action:request.kind==='publish'?'DRAFT_PUBLISHED' as const:'DRAFT_DISCARDED' as const,draftId:request.body.expectedDraftId,draftRevision:request.body.expectedDraftRevision,baseWorkbookRevision:request.baseWorkbookRevision,snapshotHash:request.expectedSnapshotHash,workbookRevision:request.kind==='publish'?4:3};
  return {receipt:request.kind==='publish'?{...receipt,workbook:{id:bookId,name:'正式版本',revision:4,snapshotHash:'f'.repeat(64),updatedAt:time}}:receipt,currentDraft:null,workbookRevision:receipt.workbookRevision,baseStale:false,superseded:false};
}
async function saved(){const s=session(),request=await s.requestSave(snapshot(),7);s.confirm(saveAck(request));return s;}
afterEach(()=>vi.clearAllMocks());

describe('pure server draft coordination',()=>{
  it('captures and deeply freezes a PUT body; later edits do not change the original operation',async()=>{
    const s=session(),source=snapshot(),first=await s.requestSave(source,7);source.name='外部更改';
    expect(first.body.snapshot.name).toBe('未提交草稿');expect(Object.isFrozen(first.body.snapshot.sheets.s)).toBe(true);
    expect(()=>{first.body.snapshot.name='attempt';}).toThrow();
    const second=await s.requestSave(snapshot('更新但尚未上传'),8);expect(second).toBe(first);
    expect(s.retainedDraft()?.snapshot.name).toBe('更新但尚未上传');expect(s.existing()).toBe(first);
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it('keeps the exact request after timeout, lost ack, auth failure, throttling and server failure',async()=>{
    const s=session(),request=await s.requestSave(snapshot(),7);
    for(const status of [undefined,401,403,404,408,429,500,502,503,504]){s.reject(status);expect(s.existing()).toBe(request);expect(s.uncertain).toBe(true);}
    expect(s.confirm(saveAck(request))).toMatchObject({status:'confirmed',capturedSequence:7});expect(s.uncertain).toBe(false);
  });
  it('checkpoints/recover preserves a lost PUT operation and both earlier and newer local snapshots',async()=>{
    const s=session(),first=await s.requestSave(snapshot(),7);await s.requestSave(snapshot('更新'),8);
    const serialized=JSON.stringify(s.checkpoint()),recovered=await ServerDraftSession.recover(JSON.parse(serialized),{workbookId:bookId,authorUserId:owner});
    expect(recovered.existing()).toEqual(first);expect(recovered.retainedDraft()?.snapshot.name).toBe('更新');
    expect(recovered.confirm(saveAck(first))).toMatchObject({capturedSequence:7});expect(recovered.retainedDraft()?.capturedSequence).toBe(8);
    expect(()=>recovered.requestPublish(3,8)).toThrow();
    const next=await recovered.requestSave(snapshot('更新'),8);expect(next.body.expectedDraftRevision).toBe(1);expect(next.body.operationId).not.toBe(first.body.operationId);
  });
  it('checks actor/workbook scope and rejects corrupted persisted payload/hash/version without networking',async()=>{
    const s=session();await s.requestSave(snapshot(),7);const checkpoint=s.checkpoint();
    await expect(ServerDraftSession.recover(checkpoint,{workbookId:otherId,authorUserId:owner})).rejects.toThrow();
    await expect(ServerDraftSession.recover(checkpoint,{workbookId:bookId,authorUserId:'other-user'})).rejects.toThrow();
    for(const mutate of [(raw:Record<string,unknown>)=>{raw.version=2;},(raw:Record<string,unknown>)=>{raw.extra=true;},(raw:Record<string,unknown>)=>{const pending=raw.pending as {expectedSnapshotHash:string};pending.expectedSnapshotHash='b'.repeat(64);},(raw:Record<string,unknown>)=>{const pending=raw.pending as {body:{snapshot:{name:string}}};pending.body.snapshot.name='篡改';}]){
      const raw=JSON.parse(JSON.stringify(checkpoint)) as Record<string,unknown>;mutate(raw);await expect(ServerDraftSession.recover(raw,{workbookId:bookId,authorUserId:owner})).rejects.toThrow();
    }
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it('retains a rejected local draft on 409, clears only the definitive operation and requires explicit conflict resolution',async()=>{
    const s=session();await s.requestSave(snapshot(),7);s.reject(409);
    expect(s.uncertain).toBe(false);expect(s.conflicted).toBe(true);expect(s.retainedDraft()?.snapshot.name).toBe('未提交草稿');
    const recovered=await ServerDraftSession.recover(s.checkpoint(),{workbookId:bookId,authorUserId:owner});expect(recovered.conflicted).toBe(true);expect(recovered.retainedDraft()).toEqual(s.retainedDraft());
    await expect(s.requestSave(snapshot('用户修订'),8)).rejects.toThrow('冲突');expect(s.retainedDraft()?.snapshot.name).toBe('用户修订');
    expect(()=>s.requestPublish(3,8)).toThrow();
  });
  it('permits a new corrected operation after definite validation failure without dropping local input',async()=>{
    for(const status of [400,413,415,422]){const s=session(),first=await s.requestSave(snapshot(),7);s.reject(status);expect(s.retainedDraft()?.capturedSequence).toBe(7);expect(s.conflicted).toBe(false);expect((await s.requestSave(snapshot('修正'),8)).body.operationId).not.toBe(first.body.operationId);}
  });
  it('rejects mismatched action/id/version/hash/bytes and keeps the original pending request',async()=>{
    const s=await saved(),request=await s.requestSave(snapshot('新的草稿'),8);
    const mutations=[(a:ServerDraftAck)=>{a.receipt.draftId=otherId;a.currentDraft!.id=otherId;},(a:ServerDraftAck)=>{a.receipt.draftRevision=5;a.currentDraft!.draftRevision=5;},(a:ServerDraftAck)=>{a.receipt.snapshotHash='c'.repeat(64);a.currentDraft!.snapshotHash='c'.repeat(64);},(a:ServerDraftAck)=>{a.currentDraft!.snapshotBytes++;},(a:ServerDraftAck)=>{a.receipt.action='DRAFT_DISCARDED';a.currentDraft=null;}];
    for(const mutate of mutations){const ack=saveAck(request);mutate(ack);expect(()=>s.confirm(ack)).toThrow();expect(s.existing()).toBe(request);expect(s.state.draftRevision).toBe(1);}
  });
  it('reports superseded success as conflict without adopting a later remote slot',async()=>{
    const s=session(),request=await s.requestSave(snapshot(),7),ack=saveAck(request);
    ack.currentDraft={...ack.currentDraft!,id:otherId,draftRevision:9,snapshotHash:'d'.repeat(64)};ack.superseded=true;
    expect(s.confirm(ack)).toMatchObject({status:'conflict',capturedSequence:7});expect(s.state.draftId).toBeNull();expect(s.conflicted).toBe(true);expect(s.uncertain).toBe(false);expect(s.retainedDraft()?.capturedSequence).toBe(7);
  });
  it('does not silently accept a formal version that advanced after the original receipt',async()=>{
    const s=session(),request=await s.requestSave(snapshot(),7),ack=saveAck(request);ack.workbookRevision=4;ack.baseStale=true;ack.superseded=true;
    expect(s.confirm(ack).status).toBe('conflict');expect(s.state.baseWorkbookRevision).toBe(3);
  });
  it('keeps a stale-base save as a draft but refuses accidental publication against the new formal version',async()=>{
    const s=session(),request=await s.requestSave(snapshot(),7),ack=saveAck(request);ack.receipt.workbookRevision=4;ack.workbookRevision=4;ack.baseStale=true;
    expect(s.confirm(ack).status).toBe('confirmed');expect(s.state.baseWorkbookRevision).toBe(3);expect(()=>s.requestPublish(4,7)).toThrow();
    const rebased=await s.requestSave(snapshot('已明确合并'),8,4);expect(rebased.body.baseWorkbookRevision).toBe(4);expect(s.state.baseWorkbookRevision).toBe(3);
  });
  it('publishes only the acknowledged editor sequence and accepts different formal JSONB hash',async()=>{
    const s=await saved();expect(()=>s.requestPublish(3,8)).toThrow();const request=s.requestPublish(3,7);
    expect(()=>s.requestDiscard(7)).toThrow();expect(s.requestPublish(3,7)).toBe(request);
    const result=s.confirm(slotAck(request));expect(result.status).toBe('confirmed');expect(result.ack.receipt.workbook?.snapshotHash).not.toBe(request.expectedSnapshotHash);
    expect(s.state).toEqual({draftId:null,draftRevision:0,baseWorkbookRevision:4,snapshotHash:null});expect(s.retainedDraft()).toBeNull();
  });
  it('retains newer edits while a previous draft publication is in flight',async()=>{
    const s=await saved(),request=s.requestPublish(3,7);s.capture(snapshot('发布时继续输入'),8);
    expect(s.confirm(slotAck(request))).toMatchObject({capturedSequence:7});expect(s.retainedDraft()?.capturedSequence).toBe(8);
    expect((await s.requestSave(snapshot('发布时继续输入'),8)).body.expectedDraftId).toBeNull();
  });
  it('recovers exact publish and discard requests without making a new operation',async()=>{
    for(const kind of ['publish','discard'] as const){const s=await saved(),request=kind==='publish'?s.requestPublish(3,7):s.requestDiscard(7);
      const recovered=await ServerDraftSession.recover(JSON.parse(JSON.stringify(s.checkpoint())),{workbookId:bookId,authorUserId:owner});expect(recovered.existing()).toEqual(request);expect(recovered.confirm(slotAck(request)).status).toBe('confirmed');expect(recovered.state.draftId).toBeNull();
    }
  });
  it('does not consume a newer slot on an old publish/discard replay',async()=>{
    for(const kind of ['publish','discard'] as const){const s=await saved(),before=s.state,request=kind==='publish'?s.requestPublish(3,7):s.requestDiscard(7),ack=slotAck(request);ack.currentDraft={...meta(),id:otherId,baseWorkbookRevision:ack.workbookRevision};ack.superseded=true;
      expect(s.confirm(ack).status).toBe('conflict');expect(s.state).toEqual(before);expect(s.retainedDraft()?.capturedSequence).toBe(7);
    }
  });
  it('never lets a duplicate earlier acknowledgement clear a new pending operation',async()=>{
    const s=session(),first=await s.requestSave(snapshot(),7),ack=saveAck(first);s.confirm(ack);const next=await s.requestSave(snapshot('next'),8);expect(()=>s.confirm(ack)).toThrow();expect(s.existing()).toBe(next);
  });
  it('serializes simultaneous hash computations into one immutable operation and preserves the newest capture',async()=>{
    const s=session(),[a,b]=await Promise.all([s.requestSave(snapshot('先输入'),7),s.requestSave(snapshot('后输入'),8)]);expect(a).toBe(b);expect(s.retainedDraft()?.capturedSequence).toBe(8);expect(apiRequest).not.toHaveBeenCalled();
  });
  it('refuses decreasing or reused edit sequences with different content',async()=>{
    const s=session();await s.requestSave(snapshot(),7);expect(()=>s.capture(snapshot('stale'),6)).toThrow();expect(()=>s.capture(snapshot('different'),7)).toThrow();expect(s.retainedDraft()?.snapshot.name).toBe('未提交草稿');
  });
});

describe('strict server draft protocol and explicit transport',()=>{
  it('reads a valid server draft without treating its original-input hash as a JSONB byte hash',()=>{
    const result=validateServerDraftRead({workbookRevision:3,draft:{...meta(),snapshot:snapshot()},baseStale:false},bookId);expect(result.draft?.snapshotHash).toBe('a'.repeat(64));expect(Object.isFrozen(result)).toBe(true);
    expect(validateServerDraftRead({workbookRevision:3,draft:null,baseStale:false},bookId).draft).toBeNull();
  });
  it('rejects malformed snapshots, flags, dates, scopes and inflated metadata',async()=>{
    for(const raw of [{workbookRevision:3,draft:null,baseStale:true},{workbookRevision:0,draft:null,baseStale:false},{workbookRevision:3,draft:{...meta(),updatedAt:'nonsense',snapshot:snapshot()},baseStale:false},{workbookRevision:3,draft:{...meta(),snapshotBytes:8*1024*1024,snapshot:snapshot()},baseStale:false},{workbookRevision:3,draft:{...meta(),snapshot:{...snapshot(),id:otherId}},baseStale:false}])expect(()=>validateServerDraftRead(raw,bookId)).toThrow();
    const request=await session().requestSave(snapshot(),7),ack=saveAck(request);ack.superseded=true;expect(()=>validateServerDraftAck(ack,bookId)).toThrow();
    const wrong=saveAck(request);wrong.receipt.workbookRevision=5;expect(()=>validateServerDraftAck(wrong,bookId)).toThrow();
  });
  it('makes no network calls until explicitly invoked and preserves the exact method/path/body',async()=>{
    const s=session(),request=await s.requestSave(snapshot(),7);expect(apiRequest).not.toHaveBeenCalled();vi.mocked(apiRequest).mockResolvedValueOnce(saveAck(request));
    await executeServerDraftRequest(request);expect(apiRequest).toHaveBeenLastCalledWith(`/workbooks/${bookId}/draft`,expect.objectContaining({method:'PUT',body:request.body,signal:expect.any(AbortSignal)}));
    s.confirm(saveAck(request));const publish=s.requestPublish(3,7);vi.mocked(apiRequest).mockResolvedValueOnce(slotAck(publish));await executeServerDraftRequest(publish);expect(apiRequest).toHaveBeenLastCalledWith(`/workbooks/${bookId}/draft/publish`,expect.objectContaining({method:'POST',body:publish.body}));
    const deleting=(await saved()).requestDiscard(7);vi.mocked(apiRequest).mockResolvedValueOnce(slotAck(deleting));await executeServerDraftRequest(deleting);expect(apiRequest).toHaveBeenLastCalledWith(`/workbooks/${bookId}/draft`,expect.objectContaining({method:'DELETE',body:deleting.body}));
  });
  it('honors caller cancellation and never retries a rejected transport request',async()=>{
    const controller=new AbortController();controller.abort();vi.mocked(apiRequest).mockRejectedValueOnce(new Error('offline'));
    await expect(readServerDraft(bookId,controller.signal)).rejects.toThrow('offline');expect(apiRequest).toHaveBeenCalledTimes(1);
    const options=vi.mocked(apiRequest).mock.calls[0]?.[1];expect(options?.signal?.aborted).toBe(true);
  });
  it('validates successful transport responses and refuses unsafe workbook paths before fetch',async()=>{
    vi.mocked(apiRequest).mockResolvedValueOnce({workbookRevision:3,draft:null,baseStale:false});expect((await readServerDraft(bookId)).draft).toBeNull();
    vi.mocked(apiRequest).mockResolvedValueOnce({workbookRevision:3,draft:null,baseStale:true});await expect(readServerDraft(bookId)).rejects.toThrow();
    const count=vi.mocked(apiRequest).mock.calls.length;await expect(readServerDraft('../other')).rejects.toThrow();expect(apiRequest).toHaveBeenCalledTimes(count);
  });
});

it('only abandons an exact operation known to be unsent and retains its editing snapshot',async()=>{const s=session(),request=await s.requestSave(snapshot(),7);s.abandonUnsent('not-the-operation');expect(s.existing()).toBe(request);s.abandonUnsent(request.body.operationId);expect(s.uncertain).toBe(false);expect(s.retainedDraft()?.capturedSequence).toBe(7);expect((await s.requestSave(snapshot(),7)).body.operationId).not.toBe(request.body.operationId);});
