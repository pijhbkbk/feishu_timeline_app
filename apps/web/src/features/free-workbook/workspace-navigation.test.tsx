import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const hooks=vi.hoisted(()=>({slots:[] as unknown[],index:0,effects:[] as Array<()=>void>,cleanups:new Map<number,()=>void>(),setups:new Map<number,()=>void|(()=>void)>(),dirty:false}));
const identity=vi.hoisted(()=>({id:'synthetic-owner-a'}));
const drafts=vi.hoisted(()=>({read:vi.fn(),write:vi.fn(),remove:vi.fn(),claim:vi.fn()}));
const cloudApi=vi.hoisted(()=>({read:vi.fn(),execute:vi.fn()}));
const api=vi.hoisted(()=>({list:vi.fn(),read:vi.fn(),create:vi.fn(),save:vi.fn(),revisions:vi.fn(),restore:vi.fn(),import:vi.fn()}));
vi.mock('react',async()=>{
 const actual=await vi.importActual<typeof import('react')>('react');
 return {...actual,useState:<T,>(initial:T)=>{const i=hooks.index++;if(!(i in hooks.slots))hooks.slots[i]=initial;return[hooks.slots[i],(value:T|((old:T)=>T))=>{const next=typeof value==='function'?(value as (old:T)=>T)(hooks.slots[i] as T):value;if(!Object.is(hooks.slots[i],next)){hooks.slots[i]=next;hooks.dirty=true;}}];},useRef:<T,>(initial:T)=>{const i=hooks.index++;if(!(i in hooks.slots))hooks.slots[i]={current:initial};return hooks.slots[i];},useEffect:(effect:()=>void|(()=>void),deps:unknown[])=>{const i=hooks.index++,previous=hooks.slots[i] as unknown[]|undefined;if(previous?.length===deps.length&&previous.every((value,at)=>Object.is(value,deps[at])))return;hooks.slots[i]=deps;hooks.setups.set(i,effect);hooks.effects.push(()=>{hooks.cleanups.get(i)?.();const cleanup=effect();if(cleanup)hooks.cleanups.set(i,cleanup);});}};
});
vi.mock('next/link',()=>({default:'a'}));
vi.mock('next/navigation',()=>({useSearchParams:()=>new URLSearchParams(window.location.search)}));
vi.mock('../../components/auth-provider',()=>({useAuth:()=>({user:{id:identity.id,isSystemAdmin:true,authSource:'local'}})}));
vi.mock('../m1/use-unsaved',()=>({useProjectUnsavedChanges:vi.fn()}));
vi.mock('../business-sheet/image-client',()=>({defaultImageLayout:()=>({}),listSheetImages:vi.fn(),uploadSheetImage:vi.fn()}));
vi.mock('../business-sheet/record-exchange',()=>({downloadWorkbook:vi.fn()}));
vi.mock('./canvas',()=>({WorkbookCanvas:({snapshot}:{snapshot:{id:string}})=><div data-workbook={snapshot.id}/> }));
vi.mock('./client',()=>({listWorkbooks:api.list,readWorkbook:api.read,createWorkbook:api.create,saveWorkbook:api.save,listRevisions:api.revisions,restoreWorkbook:api.restore}));
vi.mock('./server-draft-client',()=>({readServerDraft:cloudApi.read,executeServerDraftRequest:cloudApi.execute}));
vi.mock('./draft-store',()=>({validateLocalDraft:vi.fn(),readLocalDrafts:drafts.read,writeLocalDraft:drafts.write,removeLocalDraft:drafts.remove,claimLocalDraft:drafts.claim}));
vi.mock('./xlsx',()=>({readFreeWorkbook:api.import}));
import { ApiRequestError } from '../../lib/auth-client';
import { blankWorkbook } from './contract';
import { FreeWorkbookWorkspace } from './workspace';
import type { SavedWorkbook } from './client';
import type { ServerDraftRequest } from './server-draft-session';
const oldId='11111111-1111-4111-8111-111111111111',laterId='22222222-2222-4222-8222-222222222222';
let url:URL,replace:ReturnType<typeof vi.fn>,tree:React.ReactElement;
function saved(id:string):SavedWorkbook{return {id,name:`合成${id.slice(0,1)}`,revision:1,snapshotHash:'hash',updatedAt:'2026-10-19T00:00:00Z',snapshot:blankWorkbook(id,`合成${id.slice(0,1)}`)};}
function draw(){hooks.index=0;hooks.dirty=false;tree=FreeWorkbookWorkspace();hooks.effects.splice(0).forEach(effect=>effect());return tree;}
async function settle(){for(let n=0;n<20;n++){draw();await Promise.resolve();await Promise.resolve();await Promise.resolve();if(!hooks.dirty)return renderToStaticMarkup(tree);}throw new Error('Workbook did not settle');}
function nodes(node:React.ReactNode):React.ReactElement<Record<string,unknown>>[]{if(!React.isValidElement<Record<string,unknown>>(node))return[];return[node,...React.Children.toArray(node.props.children as React.ReactNode).flatMap(nodes)];}
function text(node:React.ReactNode):string{return typeof node==='string'?node:React.isValidElement<{children?:React.ReactNode}>(node)?React.Children.toArray(node.props.children).map(text).join(''):'';}
async function click(label:string){const button=nodes(tree).find(n=>n.type==='button'&&text(n)===label);expect(button).toBeDefined();(button!.props.onClick as ()=>void)();await vi.dynamicImportSettled();return settle();}
function dispose(){hooks.cleanups.forEach(cleanup=>cleanup());hooks.cleanups.clear();}
beforeEach(()=>{
 hooks.slots=[];hooks.index=0;hooks.effects=[];hooks.cleanups=new Map();hooks.setups=new Map();hooks.dirty=false;
 cloudApi.read.mockReset().mockResolvedValue({workbookRevision:1,draft:null,baseStale:false});cloudApi.execute.mockReset().mockRejectedValue(new Error('Synthetic cloud transport unavailable'));
 identity.id='synthetic-owner-a';Object.values(drafts).forEach(mock=>mock.mockReset());drafts.read.mockResolvedValue([]);drafts.write.mockResolvedValue(true);drafts.remove.mockResolvedValue(undefined);
 Object.values(api).forEach(mock=>mock.mockReset());url=new URL(`http://localhost/admin/color-database?workbook=${oldId}`);
 replace=vi.fn((_state:unknown,_title:string,next:URL)=>{url=new URL(next);});
 vi.stubGlobal('window',{get location(){return {href:url.href,search:url.search};},history:{state:null,replaceState:replace},confirm:vi.fn(()=>true)});
 api.list.mockResolvedValue({items:[saved(oldId)],nextCursor:'next-page'});api.read.mockImplementation((id:string)=>Promise.resolve(saved(id)));api.create.mockImplementation((snapshot:SavedWorkbook['snapshot'])=>Promise.resolve({...saved(snapshot.id),name:snapshot.name}));
});
afterEach(()=>{vi.useRealTimers();dispose();vi.unstubAllGlobals();});
it('directly reads a requested workbook outside the first page and retains its selectable identity',async()=>{
 url.searchParams.set('workbook',laterId);const html=await settle();expect(api.read).toHaveBeenCalledWith(laterId,expect.any(AbortSignal));expect(api.read).not.toHaveBeenCalledWith(oldId,expect.anything());expect(html).toContain(`data-workbook="${laterId}"`);expect(html).toContain(`value="${laterId}"`);expect(url.searchParams.get('workbook')).toBe(laterId);
});
it.each([403,404])('keeps requested workbook %s as an error without silently opening the first workbook',async status=>{
 url.searchParams.set('workbook',laterId);api.read.mockRejectedValue(new ApiRequestError('指定工作簿不可读取',status));const html=await settle();expect(html).toContain('指定工作簿不可读取');expect(html).toContain('重试读取工作簿');expect(html).not.toContain('data-workbook=');expect(html).not.toContain('开始编辑颜色工作簿');expect(api.read).toHaveBeenCalledTimes(1);expect(replace).not.toHaveBeenCalled();
});
it('updates the URL on a successful new workbook and reloads that same ID',async()=>{
 await settle();await click('新建');const id=api.create.mock.calls[0]![0].id;expect(url.searchParams.get('workbook')).toBe(id);expect(nodes(tree).some(n=>n.type==='option'&&n.props.value===id)).toBe(true);expect(renderToStaticMarkup(tree)).toContain(`data-workbook="${id}"`);dispose();hooks.slots=[];hooks.cleanups=new Map();await settle();expect(api.read).toHaveBeenLastCalledWith(id,expect.any(AbortSignal));
});
it('updates the URL when an imported copy is confirmed and reloads that copy',async()=>{
 await settle();api.import.mockResolvedValue({snapshot:blankWorkbook(laterId,'合成导入'),images:[],warnings:[],fileName:'synthetic.xlsx'});
 const input=nodes(tree).find(n=>n.type==='input'&&n.props.accept==='.xlsx')!;
 (input.props.onChange as (event:unknown)=>void)({target:{files:[new File([new Uint8Array([1])],'synthetic.xlsx')],value:'file'}});
 await vi.dynamicImportSettled();await settle();await click('确认导入副本');expect(url.searchParams.get('workbook')).toBe(laterId);expect(nodes(tree).some(n=>n.type==='option'&&n.props.value===laterId)).toBe(true);expect(renderToStaticMarkup(tree)).toContain(`data-workbook="${laterId}"`);dispose();hooks.slots=[];hooks.cleanups=new Map();await settle();expect(api.read).toHaveBeenLastCalledWith(laterId,expect.any(AbortSignal));
});
it('retries an initial list failure without creating or saving anything',async()=>{
 api.list.mockRejectedValueOnce(new Error('暂时离线'));expect(await settle()).toContain('暂时离线');await click('重试读取工作簿');expect(renderToStaticMarkup(tree)).toContain(`data-workbook="${oldId}"`);expect(api.list).toHaveBeenCalledTimes(2);expect(api.create).not.toHaveBeenCalled();expect(api.save).not.toHaveBeenCalled();
});
it('aborts a hanging initial read and ignores its late response after unmount',async()=>{
 let resolve!:(value:SavedWorkbook)=>void;api.read.mockImplementation(()=>new Promise< SavedWorkbook >(r=>{resolve=r;}));await settle();const signal=api.read.mock.calls[0]![1] as AbortSignal;dispose();expect(signal.aborted).toBe(true);resolve(saved(oldId));await Promise.resolve();await Promise.resolve();expect(replace).not.toHaveBeenCalled();
});
it('does not replace the URL when a selected-workbook read resolves after unmount',async()=>{
 await settle();replace.mockClear();let resolve!:(value:SavedWorkbook)=>void;api.read.mockImplementation(()=>new Promise< SavedWorkbook >(r=>{resolve=r;}));const select=nodes(tree).find(n=>n.type==='select'&&n.props['aria-label']==='选择工作簿')!;(select.props.onChange as (event:unknown)=>void)({target:{value:laterId}});await settle();const signal=api.read.mock.calls.at(-1)![1] as AbortSignal;const urlWrites=replace.mock.calls.length;dispose();expect(signal.aborted).toBe(true);resolve(saved(laterId));await Promise.resolve();await Promise.resolve();expect(replace).toHaveBeenCalledTimes(urlWrites);
});
it('preserves the unsaved confirmation before opening a different workbook',async()=>{
 await settle();const canvas=nodes(tree).find(n=>typeof n.props.onChanged==='function')!;(canvas.props.onChanged as ()=>void)();await settle();vi.mocked(window.confirm).mockReturnValue(false);api.read.mockClear();const select=nodes(tree).find(n=>n.type==='select'&&n.props['aria-label']==='选择工作簿')!;(select.props.onChange as (event:unknown)=>void)({target:{value:laterId}});await settle();expect(window.confirm).toHaveBeenCalled();expect(api.read).not.toHaveBeenCalled();expect(url.searchParams.get('workbook')).toBe(oldId);
});

it('deduplicates a directly opened workbook when its list page is subsequently loaded',async()=>{
 url.searchParams.set('workbook',laterId);await settle();api.list.mockResolvedValueOnce({items:[saved(laterId)],nextCursor:null});await click('更多');expect(nodes(tree).filter(n=>n.type==='option'&&n.props.value===laterId)).toHaveLength(1);
});

it('follows same-instance query changes and back to the previous workbook',async()=>{
 await settle();api.read.mockClear();url.searchParams.set('workbook',laterId);expect(await settle()).toContain(`data-workbook="${laterId}"`);expect(api.read).toHaveBeenCalledWith(laterId,expect.any(AbortSignal));
 url.searchParams.set('workbook',oldId);expect(await settle()).toContain(`data-workbook="${oldId}"`);expect(api.read).toHaveBeenLastCalledWith(oldId,expect.any(AbortSignal));
});
it('aborts an obsolete initial read when the same instance receives a new query',async()=>{
 let resolve!:(value:SavedWorkbook)=>void;api.read.mockImplementationOnce(()=>new Promise<SavedWorkbook>(r=>{resolve=r;}));await settle();const signal=api.read.mock.calls[0]![1] as AbortSignal;
 url.searchParams.set('workbook',laterId);expect(await settle()).toContain(`data-workbook="${laterId}"`);expect(signal.aborted).toBe(true);resolve(saved(oldId));const html=await settle();expect(url.searchParams.get('workbook')).toBe(laterId);expect(html).not.toContain(`data-workbook="${oldId}"`);
});
it('ignores a read that resolves after the URL changes but before the router rerenders',async()=>{
 let resolve!:(value:SavedWorkbook)=>void;api.read.mockImplementationOnce(()=>new Promise<SavedWorkbook>(r=>{resolve=r;}));await settle();url.searchParams.set('workbook',laterId);resolve(saved(oldId));await Promise.resolve();await Promise.resolve();expect(replace).not.toHaveBeenCalled();expect(await settle()).toContain(`data-workbook="${laterId}"`);
});
it('restores the active URL and retains unsaved content when a query change is cancelled',async()=>{
 await settle();const canvas=nodes(tree).find(n=>typeof n.props.onChanged==='function')!;(canvas.props.onChanged as ()=>void)();await settle();vi.mocked(window.confirm).mockReturnValue(false);api.read.mockClear();url.searchParams.set('workbook',laterId);
 const html=await settle();expect(window.confirm).toHaveBeenCalledTimes(1);expect(api.read).not.toHaveBeenCalled();expect(url.searchParams.get('workbook')).toBe(oldId);expect(html).toContain(`data-workbook="${oldId}"`);expect(html).toContain('有未保存内容');
});
it.each(['query','selection'])('removes the old editor after confirmed %s navigation while a new read is pending',async via=>{
 await settle();const oldCanvas=nodes(tree).find(n=>typeof n.props.onChanged==='function')!;(oldCanvas.props.onChanged as ()=>void)();await settle();let resolve!:(value:SavedWorkbook)=>void;api.read.mockImplementationOnce(()=>new Promise<SavedWorkbook>(r=>{resolve=r;}));
 if(via==='query')url.searchParams.set('workbook',laterId);else{const select=nodes(tree).find(n=>n.type==='select'&&n.props['aria-label']==='选择工作簿')!;(select.props.onChange as (event:unknown)=>void)({target:{value:laterId}});}
 expect(await settle()).not.toContain('data-workbook=');(oldCanvas.props.onChanged as ()=>void)();expect(await settle()).not.toContain('有未保存内容');resolve(saved(laterId));expect(await settle()).toContain(`data-workbook="${laterId}"`);expect(window.confirm).toHaveBeenCalledTimes(1);
});
it.each([403,404])('never shows the previous editor under a query whose read returns %s',async status=>{
 await settle();api.read.mockRejectedValueOnce(new ApiRequestError('指定工作簿不可读取',status));url.searchParams.set('workbook',laterId);const html=await settle();expect(html).toContain('指定工作簿不可读取');expect(html).not.toContain('data-workbook=');expect(url.searchParams.get('workbook')).toBe(laterId);expect(api.read).toHaveBeenCalledTimes(2);
});
it('does not reload or remount an unsaved imported copy when its own URL replacement is observed',async()=>{
 await settle();api.import.mockResolvedValue({snapshot:blankWorkbook(laterId,'合成未保存内容'),images:[],warnings:[],fileName:'synthetic.xlsx'});const input=nodes(tree).find(n=>n.type==='input'&&n.props.accept==='.xlsx')!;
 (input.props.onChange as (event:unknown)=>void)({target:{files:[new File([new Uint8Array([1])],'synthetic.xlsx')],value:'file'}});await vi.dynamicImportSettled();await settle();api.read.mockClear();await click('确认导入副本');const canvas=nodes(tree).find(n=>typeof n.props.onChanged==='function')!,key=canvas.key;
 const html=await settle();expect(api.read).not.toHaveBeenCalled();expect(nodes(tree).find(n=>typeof n.props.onChanged==='function')!.key).toBe(key);expect((canvas.props.snapshot as {name:string}).name).toBe('合成未保存内容');expect(html).toContain('有未保存内容');expect(window.confirm).not.toHaveBeenCalled();
});
it('rejects a query change while a create result is pending without losing its request',async()=>{
 await settle();let resolve!:(value:SavedWorkbook)=>void;api.create.mockImplementationOnce(()=>new Promise<SavedWorkbook>(r=>{resolve=r;}));void click('新建');await settle();url.searchParams.set('workbook',laterId);const html=await settle();expect(url.searchParams.get('workbook')).toBe(oldId);expect(html).toContain('当前操作尚未结束');expect(api.read).toHaveBeenCalledTimes(1);
 const created=api.create.mock.calls[0]![0] as SavedWorkbook['snapshot'];resolve({...saved(created.id),snapshot:created});await settle();expect(url.searchParams.get('workbook')).toBe(created.id);expect(api.create).toHaveBeenCalledTimes(1);expect(api.read).toHaveBeenCalledTimes(1);
});
it('retains an uncertain create operation and blocks a query change until its retry',async()=>{
 await settle();api.create.mockRejectedValueOnce(new Error('响应丢失'));await click('新建');api.read.mockClear();url.searchParams.set('workbook',laterId);const html=await settle();expect(html).toContain('上次操作结果尚未确认');expect(url.searchParams.get('workbook')).toBe(oldId);expect(api.read).not.toHaveBeenCalled();expect(html).toContain('重试创建');
});
it('keeps unfinished imported images and their active identity on a query change',async()=>{
 await settle();api.import.mockResolvedValue({snapshot:blankWorkbook(laterId,'图片待导入'),images:[{sourceMediaId:1}],warnings:[],fileName:'synthetic.xlsx'});const input=nodes(tree).find(n=>n.type==='input'&&n.props.accept==='.xlsx')!;
 (input.props.onChange as (event:unknown)=>void)({target:{files:[new File([new Uint8Array([1])],'synthetic.xlsx')],value:'file'}});await vi.dynamicImportSettled();await settle();await click('确认导入副本');api.read.mockClear();url.searchParams.set('workbook',oldId);const html=await settle();expect(html).toContain('图片导入尚未完成');expect(html).toContain(`data-workbook="${laterId}"`);expect(url.searchParams.get('workbook')).toBe(laterId);expect(api.read).not.toHaveBeenCalled();
});

it('retains the uncertain save request when a query change attempts to leave',async()=>{
 await settle();const canvas=nodes(tree).find(n=>typeof n.props.onChanged==='function')!;(canvas.props.runtime as {current:unknown}).current={snapshot:vi.fn().mockResolvedValue(saved(oldId).snapshot),draftSnapshot:vi.fn().mockResolvedValue({snapshot:saved(oldId).snapshot,edit:null})};(canvas.props.onReady as ()=>void)();(canvas.props.onChanged as ()=>void)();await settle();api.save.mockRejectedValueOnce(new Error('保存响应丢失'));await click('保存');const request=api.save.mock.calls[0]![1];api.read.mockClear();url.searchParams.set('workbook',laterId);
 const html=await settle();expect(html).toContain('上次操作结果尚未确认');expect(html).toContain('核实并保存');expect(html).toContain('有未保存内容');expect(url.searchParams.get('workbook')).toBe(oldId);expect(api.read).not.toHaveBeenCalled();api.save.mockResolvedValueOnce({...saved(oldId),revision:2});await click('核实并保存');expect(api.save.mock.calls[1]![1]).toBe(request);
});
it('retains an uncertain restore operation and does not navigate away',async()=>{
 await settle();api.revisions.mockResolvedValueOnce({items:[{revision:1,createdAt:'2026-10-19T00:00:00Z'}],nextBefore:null});await click('版本恢复');const select=nodes(tree).find(n=>n.type==='select'&&n.props['aria-label']==='历史版本')!;(select.props.onChange as (event:unknown)=>void)({target:{value:'1'}});await settle();api.restore.mockRejectedValueOnce(new Error('恢复响应丢失'));await click('恢复为新版本');api.read.mockClear();url.searchParams.set('workbook',laterId);
 const html=await settle();expect(html).toContain('上次操作结果尚未确认');expect(html).toContain('核实恢复结果');expect(url.searchParams.get('workbook')).toBe(oldId);expect(api.read).not.toHaveBeenCalled();
});

it('restarts an initial read after Strict Mode effect cleanup/setup and ignores the first response',async()=>{
 let resolve!:(value:SavedWorkbook)=>void;api.read.mockImplementationOnce(()=>new Promise<SavedWorkbook>(r=>{resolve=r;}));await settle();const signal=api.read.mock.calls[0]![1] as AbortSignal;dispose();hooks.setups.forEach((setup,index)=>{const cleanup=setup();if(cleanup)hooks.cleanups.set(index,cleanup);});
 expect(signal.aborted).toBe(true);expect(await settle()).toContain(`data-workbook="${oldId}"`);expect(api.read).toHaveBeenCalledTimes(2);const writes=replace.mock.calls.length;resolve(saved(oldId));await settle();expect(replace).toHaveBeenCalledTimes(writes);
});

function readyEditor(){const canvas=nodes(tree).find(n=>typeof n.props.onChanged==='function')!;(canvas.props.runtime as {current:unknown}).current={snapshot:vi.fn().mockResolvedValue(saved(oldId).snapshot),draftSnapshot:vi.fn().mockResolvedValue({snapshot:saved(oldId).snapshot,edit:null})};(canvas.props.onReady as ()=>void)();(canvas.props.onChanged as ()=>void)();}
it('does not send a save if durable request storage fails',async()=>{await settle();readyEditor();await settle();drafts.write.mockRejectedValueOnce(new Error('本机配额耗尽'));const html=await click('保存');expect(api.save).not.toHaveBeenCalled();expect(html).toContain('本机配额耗尽');expect(html).toContain('有未保存内容');expect(html).not.toContain('核实并保存');expect(html).toContain('保存请求尚未发送');});
it('ignores a late save acknowledgement after the signed-in account changes',async()=>{
 await settle();readyEditor();await settle();let resolve!:(value:SavedWorkbook)=>void;api.save.mockImplementationOnce(()=>new Promise<SavedWorkbook>(r=>{resolve=r;}));const saving=click('保存');await settle();expect(api.save).toHaveBeenCalledTimes(1);
 identity.id='synthetic-owner-b';url.searchParams.set('workbook',laterId);await settle();resolve({...saved(oldId),revision:2,name:'OLD OWNER ACK'});await saving;const html=await settle();expect(html).toContain(`data-workbook="${laterId}"`);expect(html).not.toContain('OLD OWNER ACK');expect(drafts.remove).not.toHaveBeenCalled();expect(drafts.write.mock.calls.every(call=>call[0].ownerId==='synthetic-owner-a')).toBe(true);
});
it('retains new edits made while the previous snapshot is being saved',async()=>{
 await settle();readyEditor();await settle();let resolve!:(value:SavedWorkbook)=>void;api.save.mockImplementationOnce(()=>new Promise<SavedWorkbook>(r=>{resolve=r;}));const saving=click('保存');await settle();const canvas=nodes(tree).find(n=>typeof n.props.onChanged==='function')!;(canvas.props.onChanged as ()=>void)();await settle();resolve({...saved(oldId),revision:2});await saving;const html=await settle();expect(html).toContain('仍有新修改');expect(drafts.remove).not.toHaveBeenCalled();expect(drafts.write.mock.calls.at(-1)![0].pending).toBeNull();expect(drafts.write.mock.calls.at(-1)![0].baseRevision).toBe(2);
});

it('durably captures later content while the first server save is still awaiting acknowledgement',async()=>{
 vi.useFakeTimers();await settle();readyEditor();await settle();let resolve!:(value:SavedWorkbook)=>void;api.save.mockImplementationOnce(()=>new Promise<SavedWorkbook>(r=>{resolve=r;}));const button=nodes(tree).find(n=>n.type==='button'&&text(n)==='保存')!;(button.props.onClick as ()=>void)();await settle();expect(api.save).toHaveBeenCalledTimes(1);const original=structuredClone(api.save.mock.calls[0]![1]);
 const canvas=nodes(tree).find(n=>typeof n.props.onChanged==='function')!,rt=(canvas.props.runtime as {current:{draftSnapshot:ReturnType<typeof vi.fn>}}).current;const later=saved(oldId).snapshot;later.name='N+1 actual content';rt.draftSnapshot.mockResolvedValue({snapshot:later,edit:null});(canvas.props.onChanged as ()=>void)();await settle();await vi.advanceTimersByTimeAsync(801);await settle();const retained=drafts.write.mock.calls.at(-1)![0];expect(retained.snapshot.name).toBe('N+1 actual content');expect(retained.pending.payload).toEqual(original);expect(retained.sequence).toBeGreaterThan(retained.pending.sequence);expect(api.save).toHaveBeenCalledTimes(1);
 resolve({...saved(oldId),revision:2});await settle();expect(drafts.write.mock.calls.at(-1)![0].snapshot.name).toBe('N+1 actual content');expect(drafts.write.mock.calls.at(-1)![0].pending).toBeNull();expect(drafts.remove).not.toHaveBeenCalled();
});

it('offers retry and a complete recovery download while a failed editing overlay remains preserved',async()=>{const draft={schema:1,ownerId:identity.id,workbookId:oldId,editorId:crypto.randomUUID(),baseRevision:1,sequence:3,savedAt:Date.now(),snapshot:saved(oldId).snapshot,pending:null};drafts.read.mockResolvedValueOnce([draft]);drafts.claim.mockResolvedValue({...draft,editorId:crypto.randomUUID()});await settle();await click('恢复这份草稿');const canvas=nodes(tree).find(n=>typeof n.props.onRecoveryError==='function')!;(canvas.props.onRecoveryError as (message:string)=>void)('合成恢复失败');const html=await settle();expect(html).toContain('合成恢复失败');expect(html).toContain('inert');expect(html).toContain('重新尝试恢复输入');expect(html).toContain('下载草稿恢复副本');expect(nodes(tree).find(n=>n.type==='button'&&text(n)==='保存')?.props.disabled).toBe(true);});

function cloudRead(){const snapshot=saved(oldId).snapshot;snapshot.name='云端保留内容';return {workbookRevision:1,baseStale:false,draft:{id:laterId,draftRevision:1,baseWorkbookRevision:1,snapshotHash:'a'.repeat(64),snapshotBytes:JSON.stringify(snapshot).length,updatedAt:'2026-10-20T00:00:00Z',snapshot}};}
function canvasRuntime(){return nodes(tree).find(n=>typeof n.props.onChanged==='function')!;}
it('preserves the latest editing document before recovering a cloud draft without waiting for autosave',async()=>{
 cloudApi.read.mockResolvedValueOnce(cloudRead());await settle();readyEditor();await settle();const canvas=canvasRuntime(),rt=(canvas.props.runtime as {current:{draftSnapshot:ReturnType<typeof vi.fn>}}).current;const snapshot=saved(oldId).snapshot;snapshot.name='不到800ms的新内容';const edit={sheetId:snapshot.sheetOrder[0],row:0,column:0,document:{body:{dataStream:'未确认文本\r\n'}}};rt.draftSnapshot.mockResolvedValue({snapshot,edit});
 await click('恢复服务器草稿');expect(drafts.write.mock.calls[0]![0]).toMatchObject({snapshot:{name:'不到800ms的新内容'},edit});expect(drafts.write.mock.calls[1]![0].editorId).not.toBe(drafts.write.mock.calls[0]![0].editorId);expect((canvasRuntime().props.snapshot as {name:string}).name).toBe('云端保留内容');expect(window.confirm).toHaveBeenCalled();
});
it('does not replace the current editor when current input cannot be durably captured',async()=>{
 cloudApi.read.mockResolvedValueOnce(cloudRead());await settle();readyEditor();await settle();const canvas=canvasRuntime(),key=canvas.key;const rt=(canvas.props.runtime as {current:{draftSnapshot:ReturnType<typeof vi.fn>}}).current;rt.draftSnapshot.mockResolvedValue(null);const html=await click('恢复服务器草稿');expect(canvasRuntime().key).toBe(key);expect(drafts.write).not.toHaveBeenCalled();expect(html).toContain('完成中文选词');
});
it('does not overwrite input made while cloud restoration is persisting its replacement',async()=>{
 cloudApi.read.mockResolvedValueOnce(cloudRead());await settle();readyEditor();await settle();let resolve!:(value:boolean)=>void;drafts.write.mockResolvedValueOnce(true).mockImplementationOnce(()=>new Promise<boolean>(r=>{resolve=r;}));void click('恢复服务器草稿');await settle();const canvas=canvasRuntime(),key=canvas.key;(canvas.props.onChanged as ()=>void)();await settle();resolve(true);const html=await settle();expect(canvasRuntime().key).toBe(key);expect(html).toContain('又有新输入');
});
it('abandons only a newly unsent cloud operation when its durable checkpoint fails',async()=>{
 vi.useFakeTimers();await settle();readyEditor();await settle();drafts.write.mockResolvedValueOnce(true).mockRejectedValueOnce(new Error('合成落盘失败'));await vi.advanceTimersByTimeAsync(801);await vi.waitFor(async()=>expect(await settle()).toContain('服务器草稿未发送'));expect(cloudApi.execute).not.toHaveBeenCalled();expect(renderToStaticMarkup(tree)).not.toContain('核实服务器草稿');api.save.mockResolvedValueOnce({...saved(oldId),revision:2});await click('保存');expect(api.save).toHaveBeenCalledTimes(1);
});
it('does not send an old autosave after the same workbook is remounted while local storage is pending',async()=>{
 vi.useFakeTimers();await settle();readyEditor();await settle();let resolve!:(value:boolean)=>void;drafts.write.mockImplementationOnce(()=>new Promise<boolean>(r=>{resolve=r;}));await vi.advanceTimersByTimeAsync(801);await settle();expect(drafts.write).toHaveBeenCalledTimes(1);await click('重新读取');resolve(true);await settle();await vi.advanceTimersByTimeAsync(1);expect(cloudApi.execute).not.toHaveBeenCalled();expect(renderToStaticMarkup(tree)).not.toContain('有未保存内容');
});
it('preserves N+1 when it arrives while the published cloud draft is being discarded',async()=>{
 cloudApi.read.mockResolvedValueOnce(cloudRead());await settle();await click('恢复服务器草稿');readyEditor();await settle();api.save.mockResolvedValueOnce({...saved(oldId),revision:2});let resolve!:(value:unknown)=>void;cloudApi.execute.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));void click('保存');await vi.waitFor(()=>expect(cloudApi.execute).toHaveBeenCalledTimes(1));const request=cloudApi.execute.mock.calls[0]![0] as ServerDraftRequest;expect(request.kind).toBe('discard');const canvas=canvasRuntime(),rt=(canvas.props.runtime as {current:{draftSnapshot:ReturnType<typeof vi.fn>}}).current;const snapshot=saved(oldId).snapshot;snapshot.name='清理等待期间的新输入';rt.draftSnapshot.mockResolvedValue({snapshot,edit:null});(canvas.props.onChanged as ()=>void)();await settle();resolve({receipt:{action:'DRAFT_DISCARDED',draftId:laterId,draftRevision:1,baseWorkbookRevision:1,snapshotHash:'a'.repeat(64),workbookRevision:2},currentDraft:null,workbookRevision:2,baseStale:false,superseded:false});await settle();expect(drafts.remove).not.toHaveBeenCalled();expect(drafts.write.mock.calls.at(-1)![0].snapshot.name).toBe('清理等待期间的新输入');await vi.waitFor(async()=>expect(await settle()).toContain('有未保存内容'));
});
it('removes the confirmed local slot after a direct formal save before any cloud draft exists',async()=>{
 await settle();readyEditor();await settle();api.save.mockResolvedValueOnce({...saved(oldId),revision:2});await click('保存');await vi.waitFor(()=>expect(drafts.remove).toHaveBeenCalledTimes(1));const removed=drafts.remove.mock.calls[0]![0];expect(removed.baseRevision).toBe(2);expect(removed.pending).toBeNull();expect(removed.sequence).toBe(1);expect(cloudApi.execute).not.toHaveBeenCalled();expect(renderToStaticMarkup(tree)).not.toContain('有未保存内容');
});
