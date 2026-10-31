import { EventEmitter } from 'node:events';
import type { Request, Response } from 'express';
import { afterEach, expect, it, vi } from 'vitest';
import { observeWorkbookSave, workbookSaveTiming } from './workbook-save-timing';

const book='10000000-0000-4000-8000-000000000001',op='20000000-0000-4000-8000-000000000001',trace='30000000-0000-4000-8000-000000000001';
const config=()=>({workbookId:book,expectedRevision:4,traceId:trace,expiresAt:Date.now()+60_000});
const env=()=>({LOCAL_RUNTIME_PROFILE:'loopback-https',NODE_ENV:'production',DEPLOYMENT_ENV:'staging',HOST:'127.0.0.1',WORKBOOK_SAVE_TIMING:JSON.stringify(config())});
function exchange(path=`/api/workbooks/${book}`,body:unknown={operationId:op,expectedRevision:4,snapshot:'never log this'}) {
  const request={method:'PUT',path,body,headers:{cookie:'never log cookie'}} as unknown as Request;
  const response=Object.assign(new EventEmitter(),{statusCode:200}) as unknown as Response;
  return {request,response};
}
const parser=vi.fn((request:Request,response:Response,next:(error?:unknown)=>void)=>next());
afterEach(()=>{vi.useRealTimers();vi.clearAllMocks();});

it('returns the exact parser when disabled or configuration is outside the local window',()=>{
  expect(observeWorkbookSave(parser,{})).toBe(parser);
  for(const change of [{NODE_ENV:'development'},{DEPLOYMENT_ENV:'production'},{HOST:'0.0.0.0'},{LOCAL_RUNTIME_PROFILE:''},{WORKBOOK_SAVE_TIMING:'bad'},
    {WORKBOOK_SAVE_TIMING:JSON.stringify({...config(),expiresAt:Date.now()-1})},
    {WORKBOOK_SAVE_TIMING:JSON.stringify({...config(),expiresAt:Date.now()+700_000})},
    {WORKBOOK_SAVE_TIMING:JSON.stringify({...config(),workbookId:[book]})},
    {WORKBOOK_SAVE_TIMING:JSON.stringify({...config(),traceId:[trace]})},
    {WORKBOOK_SAVE_TIMING:JSON.stringify({...config(),extra:'not permitted'})}])expect(observeWorkbookSave(parser,{...env(),...change})).toBe(parser);
});

it('binds the actual operation once, emits only bounded metadata and removes its observers',()=>{
  const lines:string[]=[],middleware=observeWorkbookSave(parser,env(),line=>lines.push(line));
  for(const path of ['/api/other',`/api/workbooks/${book}/draft`]){const x=exchange(path);middleware(x.request,x.response,()=>{});expect(workbookSaveTiming(x.request)).toBeUndefined();}
  const a=exchange(),b=exchange();middleware(a.request,a.response,()=>{});
  const timing=workbookSaveTiming(a.request)!;expect(timing).toBeDefined();timing.mark('serviceEnter');timing.mark('validated');
  middleware(b.request,b.response,()=>{});expect(workbookSaveTiming(b.request)).toBeUndefined();
  a.response.emit('finish');a.response.emit('close');timing.mark('serviceEnd');
  expect(lines).toHaveLength(1);const row=JSON.parse(lines[0]!);
  expect(row).toMatchObject({operationId:op,workbookId:book,traceId:trace,event:'finish',parserCallbackError:false});
  expect(row.marks).toHaveProperty('serviceEnter');expect(row.marks).not.toHaveProperty('serviceEnd');
  expect(lines[0]).not.toContain('never log');expect(lines[0]!.length).toBeLessThan(2048);
  expect(workbookSaveTiming(a.request)).toBeUndefined();expect(a.response.listenerCount('finish')).toBe(0);expect(a.response.listenerCount('close')).toBe(0);
});

for(const body of [{operationId:op,expectedRevision:3},{operationId:{toString:'not a function'},expectedRevision:4},{operationId:null,expectedRevision:4}])it('mismatched input consumes the attempt without changing parser behavior',()=>{
  const lines:string[]=[],middleware=observeWorkbookSave(parser,env(),line=>lines.push(line)),a=exchange(undefined,body),next=vi.fn();
  expect(()=>middleware(a.request,a.response,next)).not.toThrow();expect(next).toHaveBeenCalledOnce();expect(workbookSaveTiming(a.request)).toBeUndefined();a.response.emit('finish');
  expect(JSON.parse(lines[0]!).operationId).toBeNull();const b=exchange();middleware(b.request,b.response,next);expect(workbookSaveTiming(b.request)).toBeUndefined();
});

it('preserves parser errors and never rearms',()=>{
  const original=new Error('not included'),lines:string[]=[],errorParser=(_q:Request,_s:Response,next:(error?:unknown)=>void)=>next(original);
  const middleware=observeWorkbookSave(errorParser,env(),line=>lines.push(line)),a=exchange(),next=vi.fn();
  middleware(a.request,a.response,next);expect(next).toHaveBeenCalledWith(original);expect(workbookSaveTiming(a.request)).toBeUndefined();a.response.statusCode=400;a.response.emit('finish');
  expect(JSON.parse(lines[0]!)).toMatchObject({parserCallbackError:true,observedStatusCode:400,operationId:null});expect(lines[0]).not.toContain(original.message);
});

for(const event of ['close','timeout'] as const)it(`cleans ${event} without aborting or replaying the request`,()=>{
  vi.useFakeTimers();const lines:string[]=[],middleware=observeWorkbookSave(parser,env(),line=>lines.push(line)),a=exchange(),next=vi.fn();
  middleware(a.request,a.response,next);const timing=workbookSaveTiming(a.request)!;
  if(event==='close')a.response.emit('close');else vi.advanceTimersByTime(45_000);
  expect(next).toHaveBeenCalledOnce();expect(lines).toHaveLength(1);expect(JSON.parse(lines[0]!).event).toBe(event);
  expect(workbookSaveTiming(a.request)).toBeUndefined();expect(vi.getTimerCount()).toBe(0);timing.mark('serviceEnd');a.response.emit('finish');expect(lines).toHaveLength(1);
});

it('preserves a thrown parser error even when the diagnostic sink throws',()=>{
  const original=new Error('original');const middleware=observeWorkbookSave(()=>{throw original;},env(),()=>{throw new Error('sink');}),a=exchange();
  expect(()=>middleware(a.request,a.response,()=>{})).toThrow(original);expect(workbookSaveTiming(a.request)).toBeUndefined();expect(a.response.listenerCount('finish')).toBe(0);
});

it('does not start a capture after its configured deadline',()=>{
  vi.useFakeTimers();const sink=vi.fn(),middleware=observeWorkbookSave(parser,env(),sink);vi.advanceTimersByTime(61_000);const a=exchange();middleware(a.request,a.response,()=>{});a.response.emit('finish');expect(sink).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);
});
