'use client';

import { displayColorName } from './color-name';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiRequest } from '../../lib/auth-client';
import { useAuth } from '../../components/auth-provider';
import type { ProjectListResponse } from '../../lib/projects-client';
import type { R26WorkspaceResponse } from '../v2/real-types';
import { M1FlowMap } from './flow-map';
import { M1Icon } from './icon';
import { taskHref } from './context';
import { dashboardProjectQuery } from './dashboard-query';
export function M1Dashboard() {
 const {user}=useAuth(); const query=useSearchParams();const router=useRouter();
 const [projects,setProjects]=useState<ProjectListResponse|null>(null),[workspace,setWorkspace]=useState<R26WorkspaceResponse|null>(null);
 const [error,setError]=useState(''),[loading,setLoading]=useState(true),[reload,setReload]=useState(0),[search,setSearch]=useState(''),[keyword,setKeyword]=useState('');
 const selected=query.get('project')||'';
 useEffect(()=>{let active=true;const controller=new AbortController(); setLoading(true);setError('');setProjects(null);setWorkspace(null);
 const timer=setTimeout(()=>controller.abort(),15000);
 void (async()=>{try {const list=await apiRequest<ProjectListResponse>(dashboardProjectQuery(keyword),{signal:controller.signal});if(!active)return;setProjects(list);const id=selected||list.items[0]?.id;if(!id){setLoading(false);return;}const w=await apiRequest<R26WorkspaceResponse>(`/v2/projects/${encodeURIComponent(id)}/workspace`,{signal:controller.signal});if(active)setWorkspace(w);}catch(e){if(active)setError(e instanceof Error?e.message:'流程加载失败。');}finally{clearTimeout(timer);if(active)setLoading(false);}})();return()=>{active=false;controller.abort();clearTimeout(timer);};
 },[selected,reload,user?.id,keyword]);
 const follow=workspace?.flowMap.nodes.filter(n=>n.taskId&&n.isActive)||[];
 return <section className="m1-workspace"><div className="m1-breadcrumb">工作台</div><header className="m1-heading"><h1>颜色开发流程</h1></header>
 <div className="m1-dashboard-grid"><section className="m1-card m1-map-card"><div className="m1-map-toolbar"><label className="m1-color-select"><span className="sr-only">选择颜色</span><select aria-label="选择颜色" value={workspace?.project.id||selected} disabled={!projects?.items.length||loading} onChange={e=>router.push(`/dashboard?project=${encodeURIComponent(e.target.value)}`,{scroll:false})}>{!projects?.items.length&&<option value="">{loading?'正在加载…':error?'颜色未能读取':'暂无颜色项目'}</option>}{workspace&&!projects?.items.some(p=>p.id===workspace.project.id)&&<option value={workspace.project.id}>{displayColorName(workspace.project.name,workspace.flowMap.colorName)}</option>}{projects?.items.map(p=><option key={p.id} value={p.id}>{displayColorName(p.name,p.colorName)}</option>)}</select></label><form className="m1-map-search" onSubmit={e=>{e.preventDefault();setKeyword(search.trim());router.replace('/dashboard',{scroll:false});}}><input aria-label="搜索颜色" value={search} maxLength={100} placeholder="搜索颜色" onChange={e=>setSearch(e.target.value)}/><button className="m1-icon-button" aria-label="搜索颜色" type="submit"><M1Icon name="zoomIn"/></button></form><Link className="m1-button" href="/projects/new?from=dashboard"><M1Icon name="project"/>新建</Link><button className="m1-icon-button" aria-label="刷新流程" onClick={()=>setReload(n=>n+1)}><M1Icon name="refresh"/></button></div>
 {loading?<p className="m1-state" role="status">正在加载流程…</p>:error?<div className="m1-state" role="alert"><p>{error}</p><button className="m1-button" onClick={()=>setReload(n=>n+1)}>重新加载</button></div>:!workspace?<div className="m1-state"><h2>{keyword?'没有符合条件的颜色':'还没有颜色项目'}</h2><Link href="/projects/new?from=dashboard" className="m1-button m1-primary">新建项目</Link></div>:<M1FlowMap workspace={workspace} source="dashboard" selectedNode={query.get('taskId')||undefined}/>}
 </section><aside className="m1-card m1-follow"><header><h2>待跟进</h2><span className="m1-badge">{loading?'…':error?'—':follow.length}</span></header>{loading?<p role="status">正在加载…</p>:error?<p>待跟进事项未能读取</p>:!follow.length?<p className="m1-state">暂无待跟进事项</p>:follow.map(n=><Link key={n.taskId} className="m1-follow-item" href={taskHref(workspace!.project.id,n.taskId!,'dashboard')}><M1Icon name="file"/><div><strong>{n.stepName}</strong><span>{displayColorName(workspace!.project.name,workspace!.flowMap.colorName)}</span></div><M1Icon name="next"/></Link>)}<Link href="/projects" className="m1-button"><M1Icon name="project"/>颜色项目</Link></aside></div></section>;
}
