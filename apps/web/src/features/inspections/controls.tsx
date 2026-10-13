'use client';
import React,{useEffect,useRef,useState}from'react';
import{apiRequest,ApiRequestError}from'../../lib/auth-client';
import type{Choice,ChoicePage}from'./client';
export function message(cause:unknown){return cause instanceof Error?cause.message:'操作失败，请重试。';}
export function RemoteChoice({label,value,onSelect,load,disabled=false}:{label:string;value:Choice|null;onSelect:(value:Choice)=>void;load:(search:string,cursor:string|null,signal:AbortSignal)=>Promise<ChoicePage>;disabled?:boolean}){
 const[search,setSearch]=useState(''),[cursor,setCursor]=useState<string|null>(null),[data,setData]=useState<ChoicePage>({items:[],next:null}),[loading,setLoading]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{const controller=new AbortController();setLoading(true);setError('');const timer=window.setTimeout(()=>{void load(search,cursor,controller.signal).then(next=>{if(!controller.signal.aborted)setData(next);}).catch(cause=>{if(!controller.signal.aborted)setError(message(cause));}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});},search?250:0);return()=>{window.clearTimeout(timer);controller.abort();};},[search,cursor,load,retry]);
 return <fieldset className="inspection-choice" disabled={disabled}><legend>{label}</legend><label>搜索{label}<input type="search" value={search} maxLength={100} onChange={e=>{setSearch(e.target.value);setCursor(null);}}/></label>{value?<p className="inspection-picked">已选：{value.label}{value.detail?` · ${value.detail}`:''}</p>:null}{loading?<p role="status">正在读取选项…</p>:error?<p role="alert">{error}<button type="button" onClick={()=>setRetry(n=>n+1)}>重试</button></p>:<><select aria-label={`选择${label}`} size={Math.min(5,Math.max(2,data.items.length))} value={value?.id??''} onChange={e=>{const selected=data.items.find(item=>item.id===e.target.value);if(selected)onSelect(selected);}}><option value="" disabled>请选择准确记录</option>{data.items.map(item=><option key={item.id} value={item.id}>{item.label}{item.detail?` · ${item.detail}`:''}</option>)}</select>{!data.items.length?<p>没有符合条件的记录。</p>:null}<div className="inspection-actions">{cursor?<button type="button" onClick={()=>setCursor(null)}>回到第一页</button>:null}{data.next?<button type="button" onClick={()=>setCursor(data.next)}>下一页选项</button>:null}</div></>}</fieldset>;
}
/** An ambiguous network result keeps exactly the original body/idempotency key for retry. */
export function useCommand(){
 const[pending,setPending]=useState(false),[error,setError]=useState(''),[uncertain,setUncertain]=useState(false);
 const running=useRef(false);
 const current=useRef<{path:string;method:'POST'|'PATCH';body:Record<string,unknown>}|null>(null);
 const send=async<T,>(path:string,body:Record<string,unknown>,method:'POST'|'PATCH'='POST'):Promise<T|null>=>{
  if(running.current)return null;running.current=true;setPending(true);setError('');
  const request=current.current??{path,method,body:{...body,operationId:crypto.randomUUID()}};current.current=request;
  try{const result=await apiRequest<T>(request.path,{method:request.method,body:request.body,signal:AbortSignal.timeout(30000)});current.current=null;setUncertain(false);return result;}
  catch(cause){const definitive=cause instanceof ApiRequestError&&[400,401,403,404,409,422].includes(cause.status);if(definitive){current.current=null;setUncertain(false);}else setUncertain(true);setError(`${message(cause)}${definitive?'，输入已保留。':'。保存结果尚未确认；重试将复用同一请求，不会重复新增。'}`);return null;}
  finally{running.current=false;setPending(false);}
 };
 return{pending,error,uncertain,send,locked:pending||uncertain};
}
export function CommandStatus({command}:{command:ReturnType<typeof useCommand>}){return <>{command.pending?<p role="status">正在保存业务记录…</p>:null}{command.error?<p role="alert" className="m1-error">{command.error}</p>:null}</>;}
export function Dialog({title,children,onClose,locked=false}:{title:string;children:React.ReactNode;onClose:()=>void;locked?:boolean}){return<div className="inspection-dialog-backdrop"><section role="dialog" aria-modal="true" aria-label={title} className="inspection-dialog"><header><h2>{title}</h2><button className="m1-button" type="button" disabled={locked} onClick={onClose}>关闭</button></header>{children}</section></div>;}
