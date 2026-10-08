'use client';
import React,{useEffect,useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {apiRequest} from '../../lib/auth-client';
import type {R26WorkspaceResponse} from '../v2/real-types';
export function M1RecordEntry({projectId,kind}:{projectId:string;kind:'samples'|'report'}) {
 const router=useRouter();const [error,setError]=useState('');const [retry,setRetry]=useState(0);
 useEffect(()=>{let active=true;setError('');void apiRequest<R26WorkspaceResponse>(`/v2/projects/${encodeURIComponent(projectId)}/workspace`,{signal:AbortSignal.timeout(15000)}).then(data=>{if(!active)return;const codes=kind==='report'?['DEVELOPMENT_REPORT','PROJECT_INITIATION']:['SAMPLE_COLOR_CONFIRMATION','PAINT_DEVELOPMENT'];const nodes=data.flowMap.nodes.filter(n=>codes.includes(n.nodeCode)&&n.taskId);const node=nodes.find(n=>n.isActive)||nodes.find(n=>n.nodeCode===codes[0])||nodes[0];if(!node?.taskId){setError(kind==='samples'?'尚未进入样板开发。':'未找到开发报告节点。');return;}router.replace(`/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(node.taskId)}?from=project&tab=flow`);}).catch(e=>{if(active)setError(e instanceof Error?e.message:'记录读取失败。');});return()=>{active=false;};},[projectId,kind,retry,router]);
 return <section className="m1-card m1-state">{error?<><p role="alert">{error}</p><button className="m1-button" onClick={()=>setRetry(n=>n+1)}>重试</button><Link className="m1-button" href={`/projects/${encodeURIComponent(projectId)}`}>返回项目</Link></>:<p role="status">正在打开记录…</p>}</section>;
}
